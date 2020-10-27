import { Node, NodeProperties, Red } from "node-red";
import * as vm from "vm";
import { existsSync, readFileSync } from "fs";

module.exports = function (RED: Red & { hooks: any }) {
    function WorkflowMonitorNode(config: NodeProperties & { [key: string]: any }) {
        RED.nodes.createNode(this, config);
        this.name = config.name;

        const impl = new Impl(this, config, RED);

        this.on("close", function () {
            impl.onClose();
        });
    }

    RED.nodes.registerType("mcma-workflow-monitor", WorkflowMonitorNode);
};

class Impl {
    private readonly script: vm.Script;
    private lastUniqueId: number;

    constructor(private node: Node & { [key: string]: any }, private config: NodeProperties & { [key: string]: any }, private RED: Red & { hooks: any }) {
        try {
            const scriptFile = "/data/scripts/add-workflow-execution-event.js";
            if (!existsSync(scriptFile)) {
                this.node.error(`Required file '${scriptFile} not found. Please check your Node-RED setup`);
                return;
            }
            const functionText = readFileSync(scriptFile, "utf8");

            this.script = new vm.Script(functionText, {
                displayErrors: true
            });

            this.RED.hooks.add("onReceive.mcma", this.onReceive.bind(this));
            this.RED.hooks.add("onComplete.mcma", this.onComplete.bind(this));
        } catch (error) {
            this.node.error(error);
        }
    }

    async onReceive(receiveEvent) {
        await this.addWorkflowExecutionEvent({
            databaseId: receiveEvent.msg.workflowExecutionDatabaseId + "/events/" + this.getUniqueId(),
            resource: {
                type: "NodeReceived",
                nodeId: receiveEvent.destination.id,
                timestamp: new Date(),
                payload: receiveEvent.msg.payload,
                error: receiveEvent.msg.error,
            }
        });
    }

    async onComplete(completeEvent) {
        await this.addWorkflowExecutionEvent({
            databaseId: completeEvent.msg.workflowExecutionDatabaseId + "/events/" + this.getUniqueId(),
            resource: {
                type: "NodeCompleted",
                nodeId: completeEvent.node.id,
                timestamp: new Date(),
                payload: completeEvent.msg.payload,
                error: completeEvent.error,
            }
        });
    }

    async addWorkflowExecutionEvent(item) {
        try {
            if (!this.script) {
                this.node.error("Add workflow execution event script not initialized. Please check your Node-RED setup.");
                return;
            }

            await new Promise<any>((resolve, reject) => {
                const sandbox = {
                    require,
                    process,
                    item,
                    resolve,
                    reject,
                };

                this.script.runInNewContext(sandbox);
            });
        } catch (error) {
            this.node.error(error);
        }
    }

    onClose() {
        this.RED.hooks.remove("*.mcma");
    }

    private getUniqueId(): number {
        let uniqueId = Date.now();
        if (uniqueId <= this.lastUniqueId) {
            uniqueId = ++this.lastUniqueId;
        } else {
            this.lastUniqueId = uniqueId;
        }
        return uniqueId;
    }
}
