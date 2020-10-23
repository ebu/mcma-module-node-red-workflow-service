import * as objectHash from "object-hash";

import { McmaResource } from "@mcma/core";
import { DefaultRouteCollection, HttpStatusCode, McmaApiRequestContext, McmaApiRouteCollection, buildStandardQuery } from "@mcma/api";
import { invokeLambdaWorker } from "@mcma/aws-lambda-worker-invoker";
import { DynamoDbTableProvider } from "@mcma/aws-dynamodb";

import { NodeRedNode, NodeRedWorkflow, NodeRedWorkflowExecution } from "@local/node-red";

const { WorkerFunctionId, TableName } = process.env;

const dbTableProvider = new DynamoDbTableProvider();

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
    await invokeLambdaWorker(WorkerFunctionId, {
        operationName: "RegisterWorkflow",
        input: {
            workflow: resource
        },
        tracker: requestContext.getTracker(),
    });
}

async function onWorkflowDelete(requestContext: McmaApiRequestContext, resource: McmaResource) {
    await invokeLambdaWorker(WorkerFunctionId, {
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

async function queryCollection(requestContext: McmaApiRequestContext) {
    const query = buildStandardQuery<NodeRedWorkflowExecution>(requestContext, false);

    const table = await dbTableProvider.get(TableName);
    const queryResults = await table.query(query);

    requestContext.setResponseBody(queryResults);
}

async function getResource(requestContext: McmaApiRequestContext) {
    const table = await dbTableProvider.get(TableName);
    const resource = await table.get(requestContext.request.path);
    if (resource) {
        requestContext.setResponseBody(resource);
    } else {
        requestContext.setResponseResourceNotFound();
    }
}

const workflowExecutionRoutes = new McmaApiRouteCollection()
    .addRoute("GET", "/workflows/{workflowId}/executions", queryCollection)
    .addRoute("GET", "/workflows/{workflowId}/executions/{executionId}", getResource)
    .addRoute("GET", "/workflows/{workflowId}/executions/{executionId}/flow", getResource)
    .addRoute("GET", "/workflows/{workflowId}/executions/{executionId}/events", queryCollection)
    .addRoute("GET", "/workflows/{workflowId}/executions/{executionId}/events/{eventId}", getResource);


export const workflowRoutes = new McmaApiRouteCollection()
    .addRoutes(workflowRootRoutes)
    .addRoutes(workflowExecutionRoutes);


