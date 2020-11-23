import * as objectHash from "object-hash";

import { McmaResource } from "@mcma/core";
import { DefaultRouteCollection, HttpStatusCode, McmaApiRequestContext, McmaApiRouteCollection } from "@mcma/api";
import { LambdaWorkerInvoker } from "@mcma/aws-lambda-worker-invoker";

import { NodeRedNode, NodeRedWorkflow } from "@local/common";

import { dbTableProvider, getResource, queryCollection } from "./common";
import { getWorkerFunctionId } from "@mcma/worker-invoker";

const workerInvoker = new LambdaWorkerInvoker();

async function onBeforeWorkflowInsertUpdate(requestContext: McmaApiRequestContext): Promise<boolean> {
    if (!requestContext.hasRequestBody()) {
        requestContext.setResponseBadRequestDueToMissingBody();
        return false;
    }

    if (!Array.isArray(requestContext.request.body.definition)) {
        requestContext.setResponseStatusCode(HttpStatusCode.BadRequest, "property 'definition' must be an array");
        return false;
    }

    if (requestContext.request.body.definition.find((n: NodeRedNode) => n.type === "subflow")) {
        requestContext.setResponseStatusCode(HttpStatusCode.BadRequest, "Node-RED subflows are not supported");
        return false;
    }

    requestContext.request.body.hash = objectHash(requestContext.request.body.definition);
    return true;
}

async function onAfterWorkflowInsertUpdate(requestContext: McmaApiRequestContext, resource: McmaResource) {
    await workerInvoker.invoke(getWorkerFunctionId(), {
        operationName: "RegisterWorkflow",
        input: {
            workflow: resource
        },
        tracker: requestContext.getTracker(),
    });
}

async function onWorkflowDelete(requestContext: McmaApiRequestContext, resource: McmaResource) {
    await workerInvoker.invoke(getWorkerFunctionId(), {
        operationName: "UnregisterWorkflow",
        input: {
            workflow: resource
        },
        tracker: requestContext.getTracker(),
    });
}

const workflowRootRoutes = new DefaultRouteCollection(dbTableProvider, NodeRedWorkflow, "/workflows");
workflowRootRoutes.create.onStarted = onBeforeWorkflowInsertUpdate;
workflowRootRoutes.create.onCompleted = onAfterWorkflowInsertUpdate;
workflowRootRoutes.update.onStarted = onBeforeWorkflowInsertUpdate;
workflowRootRoutes.update.onCompleted = onAfterWorkflowInsertUpdate;
workflowRootRoutes.delete.onCompleted = onWorkflowDelete;


const workflowExecutionRoutes = new McmaApiRouteCollection()
    .addRoute("GET", "/workflows/{workflowId}/executions", queryCollection)
    .addRoute("GET", "/workflows/{workflowId}/executions/{executionId}", getResource)
    .addRoute("GET", "/workflows/{workflowId}/executions/{executionId}/flow", getResource)
    .addRoute("GET", "/workflows/{workflowId}/executions/{executionId}/events", queryCollection)
    .addRoute("GET", "/workflows/{workflowId}/executions/{executionId}/events/{eventId}", getResource);


export const workflowRoutes = new McmaApiRouteCollection()
    .addRoutes(workflowRootRoutes)
    .addRoutes(workflowExecutionRoutes);


