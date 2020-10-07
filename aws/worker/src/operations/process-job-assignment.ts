import { getTableName, JobParameterBag, JobStatus, Logger, McmaException, ProblemDetail, WorkflowJob } from "@mcma/core";
import { ProcessJobAssignmentHelper, ProviderCollection, WorkerRequest } from "@mcma/worker";

import { NodeRedWorkflow } from "@local/nodered";
import ECS = require("aws-sdk/clients/ecs");

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
    const resourceManager = providers.resourceManagerProvider.get(workerRequest);
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

        throw new McmaException("Not Implemented");
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
    let networkInterfaceId = undefined;

    for (const task of describeTaskData.tasks) {
        if (task.lastStatus !== "RUNNING") {
            continue;
        }
        for (const attachment of task.attachments) {
            if (attachment.type !== "ElasticNetworkInterface" || attachment.status !== "ATTACHED") {
                continue;
            }

            privateIPv4Address = undefined;
            networkInterfaceId = undefined;
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
        }
    }

    if (!selectedTask) {
        throw new McmaException("Failed to find a running task for service '" + EcsNodeRedServiceName + "'");
    }

    return privateIPv4Address;
}
