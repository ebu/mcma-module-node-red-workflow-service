import * as dirTree from "directory-tree";

import { JobStatus, McmaException } from "@mcma/core";
import { McmaApiRequestContext, McmaApiRouteCollection } from "@mcma/api";
import { invokeLambdaWorker } from "@mcma/aws-lambda-worker-invoker";
import { dbTableProvider, getResource, queryCollection, } from "./common";

import { ManageOperation } from "@local/common";

const { PublicUrl, TableName, WorkerFunctionId } = process.env;

async function listStorage(requestContext: McmaApiRequestContext) {
    const tree = dirTree("/mnt/nodered");

    requestContext.setResponseBody(tree);
}

async function handleManageOperationEndpoint(requestContext: McmaApiRequestContext, name: string, input?: { [key: string]: any }) {
    let table = await dbTableProvider.get(TableName);

    const databaseId = "/manage/operations/" + Date.now();
    const manageOperation = new ManageOperation({
        name: name,
        status: JobStatus.Running,
    });
    manageOperation.onCreate(PublicUrl + databaseId);
    await table.put(databaseId, manageOperation);

    input = input ?? {};
    input.databaseId = databaseId;

    await invokeLambdaWorker(WorkerFunctionId, {
        operationName: "ManageOperation",
        input,
        tracker: requestContext.getTracker()
    });

    requestContext.setResponseResourceCreated(manageOperation);
}

async function resetConfig(requestContext: McmaApiRequestContext) {
    await handleManageOperationEndpoint(requestContext, "ResetConfig");
}

async function npmInstall(requestContext: McmaApiRequestContext) {
    let base64: string = undefined;
    let packages: string[] = undefined;

    if (typeof requestContext.request.body === "string") {
        base64 = requestContext.request.body;
    } else if (Array.isArray(requestContext.request.body.packages)) {
        packages = requestContext.request.body.packages;
    } else {
        throw new McmaException("Invalid input");
    }

    await handleManageOperationEndpoint(requestContext, "NpmInstall", { base64, packages });
}

async function restartService(requestContext: McmaApiRequestContext) {
    await handleManageOperationEndpoint(requestContext, "RestartService");
}

export const manageRoutes = new McmaApiRouteCollection()
    .addRoute("POST", "/manage/reset-config", resetConfig)
    .addRoute("POST", "/manage/npm-install", npmInstall)
    .addRoute("POST", "/manage/restart-service", restartService)
    .addRoute("GET", "/manage/list-storage", listStorage)
    .addRoute("GET", "/manage/operations", queryCollection)
    .addRoute("GET", "/manage/operations/{operationId}", getResource);
