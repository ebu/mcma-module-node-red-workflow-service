import { ProcessJobAssignmentHelper, ProviderCollection, WorkerRequest } from "@mcma/worker";
import { JobStatus, McmaException, onResourceUpsert, ProblemDetail, ProblemDetailProperties, WorkflowJob } from "@mcma/core";

import { NodeRedWorkflowExecutionProperties } from "@local/node-red";

const { TableName } = process.env;

export async function updateJobAssignment(providers: ProviderCollection, workerRequest: WorkerRequest, context: { awsRequestId: string }) {
    const logger = workerRequest.logger;

    if (!workerRequest) {
        throw new McmaException("request must be provided");
    }
    if (!workerRequest.input) {
        throw new McmaException("request.input is required");
    }
    if (!workerRequest.input.jobAssignmentDatabaseId) {
        throw new McmaException("request.input does not specify a jobAssignmentDatabaseId");
    }

    const table = await providers.dbTableProvider.get(TableName);
    const resourceManager = providers.resourceManagerProvider.get();
    const jobAssignmentHelper = new ProcessJobAssignmentHelper<WorkflowJob>(table, resourceManager, workerRequest);

    const mutex = table.createMutex(workerRequest.input.jobAssignmentDatabaseId, context.awsRequestId);

    await mutex.lock();
    try {
        await jobAssignmentHelper.initialize();

        if (jobAssignmentHelper.jobAssignment.status === JobStatus.Completed ||
            jobAssignmentHelper.jobAssignment.status === JobStatus.Failed ||
            jobAssignmentHelper.jobAssignment.status === JobStatus.Canceled) {
            logger.warn("Ignoring status update as job already reached final state");
            return;
        }

        const workflowExecution = await table.get<NodeRedWorkflowExecutionProperties>(workerRequest.input.workflowExecutionDatabaseId);

        switch (workerRequest.input.status) {
            case JobStatus.Completed:
                if (workerRequest.input.output) {
                    for (const key of Object.keys(workerRequest.input.output)) {
                        jobAssignmentHelper.jobOutput.set(key, workerRequest.input.output[key]);
                    }
                }

                if (workflowExecution) {
                    workflowExecution.status = JobStatus.Completed;
                    workflowExecution.dateFinished = new Date();
                    workflowExecution.output = jobAssignmentHelper.jobOutput;
                    onResourceUpsert(workflowExecution, workflowExecution.id);
                    await table.put(workerRequest.input.workflowExecutionDatabaseId, workflowExecution);
                }

                await jobAssignmentHelper.complete();
                break;
            case JobStatus.Failed:
                const error = workerRequest.input.error;

                let problemDetail: ProblemDetailProperties;

                if (typeof error === "string") {
                    problemDetail = {
                        type: "uri://mcma.ebu.ch/rfc7807/nodered-workflow-service/generic-execution-failure",
                        title: "Generic execution failure",
                        detail: error,
                    };
                } else if (typeof error === "object") {
                    if (typeof error.title === "string" && typeof error.title === "string") {
                        problemDetail = error;
                    } else if (typeof error.title === "string") {
                        problemDetail = {
                            type: "uri://mcma.ebu.ch/rfc7807/nodered-workflow-service/generic-execution-failure",
                            title: "Generic execution failure",
                            detail: error.title,
                        };
                    } else {
                        problemDetail = {
                            type: "uri://mcma.ebu.ch/rfc7807/nodered-workflow-service/unknown-execution-failure",
                            title: "Workflow execution failed due to unknown reason"
                        };
                    }
                } else {
                    problemDetail = {
                        type: "uri://mcma.ebu.ch/rfc7807/nodered-workflow-service/unknown-execution-failure",
                        title: "Workflow execution failed due to unknown reason"
                    };
                }

                if (workflowExecution) {
                    workflowExecution.status = JobStatus.Failed;
                    workflowExecution.dateFinished = new Date();
                    workflowExecution.error = new ProblemDetail(problemDetail);
                    onResourceUpsert(workflowExecution, workflowExecution.id);
                    await table.put(workerRequest.input.workflowExecutionDatabaseId, workflowExecution);
                }

                await jobAssignmentHelper.fail(problemDetail);
                break;
        }
    } catch (error) {
        workerRequest.logger?.error(error.message);
        workerRequest.logger?.error(error.toString());
        try {
            await jobAssignmentHelper.fail(new ProblemDetail({
                type: "uri://mcma.ebu.ch/rfc7807/nodered-workflow-service/generic-error",
                title: "Generic Error",
                detail: "Unexpected error occurred: " + error.message,
                stacktrace: error.stacktrace,
            }));
        } catch (inner) {
            workerRequest.logger?.error(inner.toString());
        }
    } finally {
        await mutex.unlock();
    }
}
