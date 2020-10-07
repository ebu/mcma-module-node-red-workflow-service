import { McmaResource, McmaResourceProperties } from "@mcma/core";
import { JobParameter } from "@mcma/core/dist/lib/model/job-parameter";

export interface NodeRedWorkflowProperties extends McmaResourceProperties {
    name: string
    definition: string
    inputParameters?: JobParameter[];
    outputParameters?: JobParameter[];
    optionalInputParameters?: JobParameter[];
}

export class NodeRedWorkflow extends McmaResource implements NodeRedWorkflowProperties {
    name: string;
    definition: string;
    inputParameters?: JobParameter[];
    outputParameters?: JobParameter[];
    optionalInputParameters?: JobParameter[];

    constructor(properties: NodeRedWorkflowProperties) {
        super("NodeRedWorkflow", properties);

        this.checkProperty("name", "string", true);
        this.checkProperty("definition", "string", true);
    }
}
