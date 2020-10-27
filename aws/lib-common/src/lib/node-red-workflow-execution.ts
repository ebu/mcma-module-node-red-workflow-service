import { JobParameterBag, JobStatus, McmaResource, McmaResourceProperties, ProblemDetail } from "@mcma/core";

export interface NodeRedWorkflowExecutionProperties extends McmaResourceProperties {
    status: JobStatus
    dateStarted: Date
    dateFinished?: Date
    input: JobParameterBag
    output?: JobParameterBag
    error?: ProblemDetail
    jobId: string;
    jobAssignmentId: string;
}

export class NodeRedWorkflowExecution extends McmaResource implements NodeRedWorkflowExecutionProperties {
    status: JobStatus;
    dateStarted: Date;
    dateFinished?: Date;
    input: JobParameterBag;
    output?: JobParameterBag;
    error?: ProblemDetail;
    jobId: string;
    jobAssignmentId: string;

    constructor(properties: NodeRedWorkflowExecutionProperties) {
        super("NodeRedWorkflowExecution", properties);
    }
}
