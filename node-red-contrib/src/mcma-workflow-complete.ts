import { Node, NodeProperties, Red } from "node-red";
import { existsSync, readFileSync } from "fs";
import * as vm from "vm";

module.exports = function (RED: Red) {
    function WorkflowCompleteNode(config: NodeProperties) {
        RED.nodes.createNode(this, config);
        const impl = new Impl(this, config, RED);

        let node = this;
        this.on("input", function (msg, send, done) {
            send = send || function () {
                node.send.apply(this, arguments);
            };
            done = done || function (err) {
                node.error(err, msg);
            };
            impl.onInput(msg, send, done);
        });
    }

    RED.nodes.registerType("mcma-workflow-complete", WorkflowCompleteNode);
};

class Impl {
    private usageCounter: number;
    private readonly script: vm.Script;

    constructor(private node: Node & { [key: string]: any }, private config: NodeProperties & { [key: string]: any }, private RED: Red) {
        try {
            this.usageCounter = 0;

            const scriptFile = "/data/scripts/update-job-assignment.js";
            if (!existsSync(scriptFile)) {
                this.node.error(`Required file '${scriptFile} not found. Please check your Node-RED setup`);
                return;
            }
            const functionText = readFileSync(scriptFile, "utf8");

            this.script = new vm.Script(functionText, {
                displayErrors: true
            });
        } catch (error) {
            this.node.error(error);
        }
    }

    async onInput(msg: any, send: ((msg: any[]) => void), done: ((err?: any) => void)) {
        try {
            this.usageCounter++;
            this.updateStatus();

            if (!this.script) {
                this.node.error("Update JobAssignment script not initialized. Please check your Node-RED setup.");
                return;
            }

            await new Promise<any>((resolve, reject) => {
                const sandbox = {
                    require,
                    process,
                    input: {
                        jobAssignmentDatabaseId: "/job-assignments/" + msg._msgid,
                        status: "Completed",
                        output: msg.payload?.output
                    },
                    tracker: msg.tracker,
                    resolve,
                    reject,
                };

                this.script.runInNewContext(sandbox);
            });
        } catch (error) {
            this.node.error(error);
        } finally {
            this.usageCounter--;
            this.updateStatus();
            done();
        }
    }

    private updateStatus() {
        if (this.usageCounter > 0) {
            this.node.status({ shape: "dot", fill: "blue", text: `${this.usageCounter}` });
        } else {
            this.node.status({});
        }
    }
}
