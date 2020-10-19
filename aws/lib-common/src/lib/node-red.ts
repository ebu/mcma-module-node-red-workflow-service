import { JobParameter, McmaResource, McmaResourceProperties } from "@mcma/core";

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
    definition: any[];
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
