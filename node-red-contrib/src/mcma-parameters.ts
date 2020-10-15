import { NodeProperties, Red } from "node-red";

module.exports = function (RED: Red) {
    function ParametersNode(node: NodeProperties & { [key: string]: any }) {
        RED.nodes.createNode(this, node);
        this.name = node.name;
        this.params = {};

        for (const param of node.params) {
            try {
                this.params[param.n] = RED.util.evaluateNodeProperty(param.v, param.vt, this, {});
            } catch (error) {
                console.error(`Error while processing parameter '${param.n} of parameter group '${node.name}`);
                console.error(error);
            }
        }
    }

    RED.nodes.registerType("mcma-parameters", ParametersNode);
};
