import { NodeProperties, Red } from "node-red";

module.exports = function (RED: Red) {
    function ParametersNode(config: NodeProperties & { [key: string]: any }) {
        RED.nodes.createNode(this, config);
        this.name = config.name;
        this.params = {};

        for (const param of config.params) {
            try {
                this.params[param.n] = RED.util.evaluateNodeProperty(param.v, param.vt, this, {});
            } catch (error) {
                console.error(`Error while processing parameter '${param.n} of parameter group '${config.name}`);
                console.error(error);
            }
        }
    }

    RED.nodes.registerType("mcma-parameters", ParametersNode);
};
