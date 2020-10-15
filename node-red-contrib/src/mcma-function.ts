import { Node, NodeProperties, Red } from "node-red";
import * as vm from "vm";
import * as util from "util";

module.exports = function (RED: Red) {
    function FunctionNode(config: NodeProperties) {
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

    RED.nodes.registerType("mcma-function", FunctionNode);
};

class Impl {
    private readonly params: { [key: string]: any };
    private readonly script: vm.Script;
    private usageCounter: number;

    constructor(private node: Node & { [key: string]: any }, private config: NodeProperties & { [key: string]: any }, private RED: Red) {
        try {
            this.usageCounter = 0;

            const functionText = `
${config.func}
handler(msg.payload).then(payload => __resolve__(payload)).catch(e => __fail__(e));
`;

            this.script = new vm.Script(functionText, {
                filename: "McmaFunction node:" + this.node.id + (this.node.name ? " [" + this.node.name + "]" : ""),
                displayErrors: true,
                lineOffset: -1,
                columnOffset: 0,
            });

            this.params = (<any>RED.nodes.getNode(config.params))?.params;
        } catch (error) {
            this.node.error(error);
        }
    }

    async onInput(msg: any, send: ((msg: any[]) => void), done: ((err?: any) => void)) {
        try {
            this.usageCounter++;
            this.updateStatus();

            const sandbox = {
                console,
                Buffer,
                Date,
                msg,
                node: {
                    id: this.node.id,
                    name: this.node.name,
                    log: (...args) => {
                        this.node.log.apply(this.node, args);
                    },
                    error: (...args) => {
                        this.node.error.apply(this.node, args);
                    },
                    warn: (...args) => {
                        this.node.warn.apply(this.node, args);
                    },
                    debug: (...args) => {
                        this.node.debug.apply(this.node, args);
                    },
                    trace: (...args) => {
                        this.node.trace.apply(this.node, args);
                    }
                },
                RED: {
                    util: this.RED.util
                },
                context: {
                    set: (...args) => {
                        this.node.context().set.apply(this.node,args);
                    },
                    get: (...args) => {
                        return this.node.context().get.apply(this.node,args);
                    },
                    keys: (...args) => {
                        return this.node.context().keys.apply(this.node,args);
                    },
                    get global() {
                        return this.node.context().global;
                    },
                    get flow() {
                        return this.node.context().flow;
                    }
                },
                flow: {
                    set: (...args) => {
                        this.node.context().flow.set.apply(this.node,args);
                    },
                    get: (...args) => {
                        return this.node.context().flow.get.apply(this.node,args);
                    },
                    keys: (...args) => {
                        return this.node.context().flow.keys.apply(this.node,args);
                    }
                },
                global: {
                    set: (...args) => {
                        this.node.context().global.set.apply(this.node,args);
                    },
                    get: (...args) => {
                        return this.node.context().global.get.apply(this.node,args);
                    },
                    keys: (...args) => {
                        return this.node.context().global.keys.apply(this.node,args);
                    }
                },
                env: {
                    get: (envVar: string) => this.node._flow.getSetting(envVar)
                },
                process,
                require,
                params: this.params,
            };

            const payload = await this.asyncExecute(sandbox);

            if (payload) {
                msg.payload = payload;
            }

            send([msg]);

            done();
        } catch (error) {
            if ((typeof error === "object") && error.hasOwnProperty("stack")) {
                //remove unwanted part
                const index = error.stack.search(/\n\s*at Script.runInContext/);
                error.stack = error.stack.slice(0, index).split('\n').slice(0, -1).join('\n');
                const stack = error.stack.split(/\r?\n/);

                //store the error in msg to be used in flows
                msg.error = error;

                let line = 0;
                let errorMessage;
                if (stack.length > 0) {
                    while (line < stack.length && stack[line].indexOf("ReferenceError") !== 0) {
                        line++;
                    }

                    if (line < stack.length) {
                        errorMessage = stack[line];
                        const m = /:(\d+):(\d+)$/.exec(stack[line + 1]);
                        if (m) {
                            const lineno = Number(m[1]) - 1;
                            const cha = m[2];
                            errorMessage += " (line " + lineno + ", col " + cha + ")";
                        }
                    }
                }
                if (!errorMessage) {
                    errorMessage = error.toString();
                }
                done(errorMessage);
            } else if (typeof error === "string") {
                done(error);
            } else {
                try {
                    done(JSON.stringify(error));
                } catch {
                    done(util.inspect(error));
                }
            }
        } finally {
            this.usageCounter--;
            this.updateStatus();
        }
    }

    private async asyncExecute(sandbox): Promise<any> {
        return new Promise<any>((resolve, fail) => {

            sandbox["__resolve__"] = resolve;
            sandbox["__fail__"] = fail;

            this.script.runInNewContext(sandbox);
        });
    }

    private updateStatus() {
        if (this.usageCounter > 0) {
            this.node.status({ shape: "dot", fill: "blue", text: `${this.usageCounter}` });
        } else {
            this.node.status({});
        }
    }
}
