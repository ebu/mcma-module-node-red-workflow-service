import { JobParameter, McmaResource, McmaResourceProperties } from "@mcma/core";
import { NodeRedNode } from "./node-red";

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
