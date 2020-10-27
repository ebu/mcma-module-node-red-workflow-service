import { McmaObject, McmaObjectProperties } from "@mcma/core";

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
