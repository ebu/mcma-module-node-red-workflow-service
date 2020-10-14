import { ECS } from "aws-sdk";
import axios, { AxiosInstance } from "axios";
import { v4 as uuidv4 } from "uuid";

import { getTableName, JobParameterBag, JobStatus, Logger, McmaException, ProblemDetail, WorkflowJob } from "@mcma/core";
import { ProcessJobAssignmentHelper, ProviderCollection, WorkerRequest } from "@mcma/worker";
import { DocumentDatabaseTable } from "@mcma/data";

import { NodeRedFlow, NodeRedFlowConfig, NodeRedFlowNode, NodeRedWorkflow } from "@local/nodered";

const { EcsClusterId, EcsNodeRedServiceName, TableName, PublicUrl } = process.env;

export async function processJobAssignment(providers: ProviderCollection, workerRequest: WorkerRequest, context: { awsRequestId: string }) {
    if (!workerRequest) {
        throw new McmaException("request must be provided");
    }
    if (!workerRequest.input) {
        throw new McmaException("request.input is required");
    }
    if (!workerRequest.input.jobAssignmentDatabaseId) {
        throw new McmaException("request.input does not specify a jobAssignmentDatabaseId");
    }

    const dbTable = await providers.dbTableProvider.get(getTableName(providers.contextVariableProvider));
    const resourceManager = providers.resourceManagerProvider.get(providers.contextVariableProvider);
    const jobAssignmentHelper = new ProcessJobAssignmentHelper<WorkflowJob>(dbTable, resourceManager, workerRequest);

    const mutex = dbTable.createMutex(workerRequest.input.jobAssignmentDatabaseId, context.awsRequestId);

    await mutex.lock();
    try {
        workerRequest.logger?.info("Initializing job helper...");

        await jobAssignmentHelper.initialize(JobStatus.Queued);

        workerRequest.logger?.info("Validating job...");

        if (jobAssignmentHelper.job["@type"] !== "WorkflowJob") {
            throw new McmaException("Job has type '" + jobAssignmentHelper.job["@type"] + "', which does not match expected job type 'WorkflowJob'.");
        }

        if (!jobAssignmentHelper.profile.custom?.noderedWorkflowId?.startsWith(PublicUrl)) {
            throw new McmaException("Job profile '" + jobAssignmentHelper.profile.name + "' is not supported.");
        }

        jobAssignmentHelper.validateJob();

        workerRequest.logger?.info("Found handler for job profile '" + jobAssignmentHelper.profile.name + "'");

        await executeWorkflow(providers, jobAssignmentHelper, context);

        workerRequest.logger?.info("Handler for job profile '" + jobAssignmentHelper.profile.name + "' completed");
    } catch (e) {
        workerRequest.logger?.error(e.message);
        workerRequest.logger?.error(e.toString());
        try {
            await jobAssignmentHelper.fail(new ProblemDetail({
                type: "uri://mcma.ebu.ch/rfc7807/generic-job-failure",
                title: "Generic job failure",
                detail: e.message
            }));
        } catch (inner) {
            workerRequest.logger?.error(inner.toString());
        }
    } finally {
        await mutex.unlock();
    }
}

async function executeWorkflow(providers: ProviderCollection, jobAssignmentHelper: ProcessJobAssignmentHelper<WorkflowJob>, context: { awsRequestId: string }) {
    const logger = jobAssignmentHelper.logger;

    try {
        logger.info(`Processing ${jobAssignmentHelper.profile.name} request with jobInput:`);
        logger.info(jobAssignmentHelper.jobInput);

        let table = await providers.dbTableProvider.get(TableName);

        const workflowId: string = jobAssignmentHelper.profile.custom.noderedWorkflowId;
        const workflowDatabaseId = workflowId.substring(PublicUrl.length);

        let workflow: NodeRedWorkflow;

        logger.info("Retrieving nodered workflow with id " + workflowDatabaseId);
        workflow = await table.get<NodeRedWorkflow>(workflowDatabaseId);
        logger.info(workflow);

        if (!workflow) {
            logger.error("Workflow not found");
            await jobAssignmentHelper.fail({
                type: "uri://mcma.ebu.ch/rfc7807/nodered-workflow-service/workflow-not-found",
                title: "Node-RED workflow not found",
                detail: `Node-RED workflow with id '${workflowId}' not found`
            });
            return;
        }

        logger.info("Validating job input");
        const missingVarName = await validateJobInput(workflow, jobAssignmentHelper.jobInput);
        if (missingVarName) {
            logger.error(`Missing variable '${missingVarName}' in job input`);
            await jobAssignmentHelper.fail({
                type: "uri://mcma.ebu.ch/rfc7807/nodered-workflow-service/missing-variable",
                title: "Missing variable",
                detail: `Missing variable '${missingVarName}' in job input`,
            });
            return;
        }

        const ipAddress = await getServiceIpAddress(logger);
        logger.info(`Found Node-RED instance on ipAddress ${ipAddress}`);

        const noderedService = axios.create({
            baseURL: `http://${ipAddress}:1880/`
        });

        logger.info("Syncing workflows to service");
        await syncWorkflowsToService(noderedService, table, logger);

        const jobAssignmentGuid = jobAssignmentHelper.jobAssignmentDatabaseId.substring(17);

        logger.info(`Invoking workflow ${workflow.name}`);
        try {
            await invokeNodeRedFlow(noderedService, workflow, jobAssignmentGuid, jobAssignmentHelper.jobInput);
        } catch (error) {
            await jobAssignmentHelper.fail({
                type: "uri://mcma.ebu.ch/rfc7807/nodered-workflow-service/workflow-invocation-error",
                title: "Workflow invocation error",
                detail: "Failed to invoke workflow due to: " + error.message,
                stacktrace: error.stacktrace,
            });
            return;
        }

        await jobAssignmentHelper.updateJobAssignmentStatus(JobStatus.Running);
    } catch (error) {
        logger.error(`Error occurred while processing ${jobAssignmentHelper.profile.name}`);
        logger.error(error);

        await jobAssignmentHelper.fail({
            type: "uri://mcma.ebu.ch/rfc7807/nodered-workflow-service/generic-error",
            title: "Generic Error",
            detail: "Unexpected error occurred: " + error.message,
            stacktrace: error.stacktrace,
        });
    }
}

async function validateJobInput(workflow: NodeRedWorkflow, jobInput: JobParameterBag): Promise<string> {
    if (workflow.inputParameters) {
        for (const inputParameter of workflow.inputParameters) {
            const variable = jobInput.get(inputParameter.parameterName);
            if (variable === undefined) {
                return inputParameter.parameterName;
            }
        }
    }
    return null;
}

async function getServiceIpAddress(logger: Logger): Promise<string> {
    const ecs = new ECS();

    logger.info("Listing tasks for cluster '" + EcsClusterId + "' and service '" + EcsNodeRedServiceName + "'");
    const listTaskData = await ecs.listTasks({
        cluster: EcsClusterId,
        serviceName: EcsNodeRedServiceName
    }).promise();
    logger.info(listTaskData);

    if (listTaskData.taskArns.length === 0) {
        throw new McmaException("Failed to find a running task for service '" + EcsNodeRedServiceName + "'");
    }

    logger.info("Describing tasks");
    const describeTaskData = await ecs.describeTasks({
        cluster: EcsClusterId,
        tasks: listTaskData.taskArns,
    }).promise();
    logger.info(describeTaskData);

    logger.info("Finding IP address of suitable task");
    let selectedTask = undefined;
    let privateIPv4Address = undefined;

    for (const task of describeTaskData.tasks) {
        if (task.lastStatus !== "RUNNING" || task.desiredStatus !== "RUNNING") {
            continue;
        }
        for (const attachment of task.attachments) {
            if (attachment.type !== "ElasticNetworkInterface" || attachment.status !== "ATTACHED") {
                continue;
            }

            privateIPv4Address = undefined;
            for (const detail of attachment.details) {
                if (detail.name === "privateIPv4Address") {
                    privateIPv4Address = detail.value;
                }
            }

            if (privateIPv4Address) {
                break;
            }
        }

        if (privateIPv4Address) {
            selectedTask = task;
            break;
        }
    }

    if (!selectedTask) {
        throw new McmaException("Failed to find a running task for service '" + EcsNodeRedServiceName + "'");
    }

    return privateIPv4Address;
}

async function syncWorkflowsToService(noderedService: AxiosInstance, table: DocumentDatabaseTable, logger: Logger) {
    const existingFlows = await getExistingFlows(noderedService);
    logger.info({ existingFlows });

    const workflowsQuery = await table.query<NodeRedWorkflow>({ path: "/workflows" });
    logger.info({ workflows: workflowsQuery.results });

    const convertedFlows = workflowsQuery.results.map(workflow => convertToFlow(workflow));
    logger.info({ convertedFlows });

    const convertedFlowsMap = new Map<string, NodeRedFlow>();
    convertedFlows.forEach(f => convertedFlowsMap.set(f.info, f));

    const existingFlowsSet = new Set<string>();
    existingFlows.forEach(f => existingFlowsSet.add(f.info));

    const flowsToDelete = existingFlows.filter(flow => !convertedFlowsMap.has(flow.info));
    const flowsToInsert = Array.from(convertedFlowsMap.values()).filter(flow => !existingFlowsSet.has(flow.info));

    for (const flow of flowsToDelete) {
        logger.info(`Deleting flow ${flow.label}`);
        await noderedService.delete(`flow/${flow.id}`);
    }
    for (const flow of flowsToInsert) {
        try {
            logger.info(`Inserting flow ${flow.label}`);
            await noderedService.post("flow", flow);
        } catch (error) {
            logger.warn(`Failed to create flow ${flow.label}`);
            logger.warn(error.message);
            logger.warn(error.toString());
        }
    }
}

function convertToFlow(workflow: NodeRedWorkflow): NodeRedFlow {
    const tab = workflow.definition.find(n => n.type === "tab");
    const nodes: NodeRedFlowNode[] = workflow.definition.filter(n => n.z === tab.id && !isNaN(n.x));
    const configs: NodeRedFlowConfig[] = workflow.definition.filter(n => n.type !== "tab" && n.type !== "subflow" && isNaN(n.x));

    const tabId = tab?.id ?? uuidv4().replace(/-/g, "");

    // replacing node ids with unique ids to prevent collision when pushing to service
    const idMap = new Map<string, string>();
    for (const node of nodes) {
        idMap.set(node.id, uuidv4().replace(/-/g, ""));
        node.id = idMap.get(node.id);
    }
    for (const config of configs) {
        idMap.set(config.id, uuidv4().replace(/-/g, ""));
        config.id = idMap.get(config.id);
        config.z = tabId;
    }
    for (const node of nodes) {
        for (let i = 0; i < node.wires.length; i++) {
            for (let j = 0; j < node.wires[i].length; j++) {
                node.wires[i][j] = idMap.get(node.wires[i][j]);
            }
        }
        for (const key of Object.keys(node)) {
            if (typeof node[key] === "string" && idMap.has(node[key])) {
                node[key] = idMap.get(node[key]);
            }
        }
    }

    // inserting complete node if not exists
    let workflowCompleteNode = nodes.find(n => n.type === "mcma-workflow-complete");
    if (!workflowCompleteNode) {
        workflowCompleteNode = {
            id: uuidv4().replace(/-/g, ""),
            type: "mcma-workflow-complete",
            z: tabId,
            name: "",
            x: 800,
            y: 800,
            wires: []
        };
        nodes.push(workflowCompleteNode);
    }

    // inserting start node if not exists
    let workflowStartNode = nodes.find(n => n.type === "mcma-workflow-start");
    if (!workflowStartNode) {
        workflowStartNode = {
            id: uuidv4().replace(/-/g, ""),
            type: "mcma-workflow-start",
            z: tabId,
            name: "",
            url: "",
            x: 100,
            y: 100,
            wires: [
                [
                    workflowCompleteNode.id
                ]
            ]
        };
        nodes.push(workflowStartNode);
    }

    // replacing entry point url with unique value
    workflowStartNode.url = "/" + workflow.hash;

    return {
        id: tabId,
        label: workflow.name,
        disabled: false,
        info: workflow.hash,
        nodes: nodes,
        configs: configs,
    };
}

async function getExistingFlows(noderedService: AxiosInstance): Promise<NodeRedFlow[]> {
    const response = await noderedService.get("flows");

    const existingFlows = [];
    for (const node of response.data) {
        if (node.type === "tab") {
            const response = await noderedService.get(`flow/${node.id}`);
            existingFlows.push(response.data);
        }
    }

    return existingFlows;
}

async function invokeNodeRedFlow(noderedService: AxiosInstance, workflow: NodeRedWorkflow, jobAssignmentGuid: string, jobInput: JobParameterBag) {
    const payload = {
        executionId: jobAssignmentGuid,
        input: jobInput,
        output: new JobParameterBag()
    };

    await noderedService.post(workflow.hash, payload);
}
