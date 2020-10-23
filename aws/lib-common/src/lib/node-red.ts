import { JobParameter, JobParameterBag, JobStatus, McmaObject, McmaObjectProperties, McmaResource, McmaResourceProperties, ProblemDetail } from "@mcma/core";

export interface NodeRedWorkflowProperties extends McmaResourceProperties {
    name: string
    definition: NodeRedNode[]
    inputParameters?: JobParameter[]
    outputParameters?: JobParameter[]
    optionalInputParameters?: JobParameter[]
    hash?: string
}

export class NodeRedWorkflow extends McmaResource implements NodeRedWorkflowProperties {
    name: string;
    definition: NodeRedNode[];
    inputParameters?: JobParameter[];
    outputParameters?: JobParameter[];
    optionalInputParameters?: JobParameter[];
    hash?: string;

    constructor(properties: NodeRedWorkflowProperties) {
        super("NodeRedWorkflow", properties);

        this.checkProperty("name", "string", true);
        this.checkProperty("definition", "Array", true);
    }
}

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

export interface NodeRedWorkflowExecutionEventProperties extends McmaObjectProperties {
    type: "NodeReceived" | "NodeCompleted"
    nodeId: string
    timestamp: Date
    payload: any
    error?: any
}

export class NodeRedWorkflowExecutionEvent extends McmaObject implements NodeRedWorkflowExecutionEventProperties {
    type: "NodeReceived" | "NodeCompleted";
    nodeId: string;
    timestamp: Date;
    payload: any;
    error?: any;

    constructor(properties: NodeRedWorkflowExecutionEventProperties) {
        super("NodeRedWorkflowExecutionEvent", properties);
    }
}

export interface NodeRedNode {
    id: string
    type: string
    [key: string]: any
}

export interface NodeRedFlowNode extends NodeRedNode {
    x: number
    y: number
    z: string
    wires: string[][]
}

export interface NodeRedFlowConfig extends NodeRedNode {
    z: string
}

export interface NodeRedFlow {
    id: string
    label: string
    disabled?: boolean
    info: string
    nodes: NodeRedFlowNode[]
    configs?: NodeRedFlowConfig[]
}
