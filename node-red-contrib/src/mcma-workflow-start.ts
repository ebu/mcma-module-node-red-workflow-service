import { Node, NodeProperties, Red } from "node-red";
import * as bodyParser from "body-parser";
import * as cookieParser from "cookie-parser";

module.exports = function (RED: Red) {
    function WorkflowStartNode(config: NodeProperties & { [key: string]: any }) {
        RED.nodes.createNode(this, config);
        const impl = new Impl(this, config, RED);

        this.on("close", function () {
            impl.onClose();
        });
    }

    RED.nodes.registerType("mcma-workflow-start", WorkflowStartNode);
};

class Impl {
    private readonly url: string;

    constructor(private node: Node & { [key: string]: any }, private config: NodeProperties & { [key: string]: any }, private RED: Red) {
        try {
            this.url = config.url;
            if (this.url[0] !== '/') {
                this.url = '/' + this.url;
            }

            const httpMiddleware = function (req, res, next) {
                next();
            };
            const corsHandler = function (req, res, next) {
                next();
            };
            const metricsHandler = function (req, res, next) {
                next();
            };

            const maxApiRequestSize = RED.settings.apiMaxLength || '5mb';
            const jsonParser = bodyParser.json({ limit: maxApiRequestSize });
            const urlencParser = bodyParser.urlencoded({ limit: maxApiRequestSize, extended: true });

            const multipartParser = function (req, res, next) {
                next();
            };
            const rawBodyParser = function (req, res, next) {
                next();
            };

            RED.httpNode.post(this.url, cookieParser(), httpMiddleware, corsHandler, metricsHandler, jsonParser, urlencParser, multipartParser, rawBodyParser, this.callback.bind(this), this.errorHandler.bind(this));
        } catch (error) {
            this.node.error(error);
        }
    }

    errorHandler(err, req, res, next) {
        this.node.warn(err);
        res.sendStatus(500);
    }

    callback(req, res) {
        const msg = req.body;
        msg._msgid = this.RED.util.generateId();

        this.node.send([msg]);

        res.set("Content-Length", 0);
        res.status(200).send();
    }

    onClose() {
        this.RED.httpNode._router.stack.forEach((route, i, routes) => {
            if (route.route && route.route.path === this.config.url && route.route.methods["post"]) {
                routes.splice(i, 1);
            }
        });
    }
}
