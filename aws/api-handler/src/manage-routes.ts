import * as dirTree from "directory-tree";
import * as mime from "mime-types";

import { JobStatus, McmaException } from "@mcma/core";
import { getPublicUrl, McmaApiRequestContext, McmaApiRouteCollection } from "@mcma/api";
import { LambdaWorkerInvoker } from "@mcma/aws-lambda-worker-invoker";
import { dbTableProvider, getResource, queryCollection, } from "./common";

import { ManageOperation } from "@local/common";
import { existsSync, lstatSync, readFileSync } from "fs";
import { getWorkerFunctionId } from "@mcma/worker-invoker";
import { getTableName } from "@mcma/data";

const workerInvoker = new LambdaWorkerInvoker();

async function handleManageOperationEndpoint(requestContext: McmaApiRequestContext, name: string, input?: { [key: string]: any }) {
    let table = await dbTableProvider.get(getTableName());

    const databaseId = "/manage/operations/" + Date.now();
    const manageOperation = new ManageOperation({
        name: name,
        status: JobStatus.Running,
    });
    manageOperation.onCreate(getPublicUrl() + databaseId);
    await table.put(databaseId, manageOperation);

    input = input ?? {};
    input.databaseId = databaseId;

    await workerInvoker.invoke(getWorkerFunctionId(), {
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

async function getFile(requestContext: McmaApiRequestContext) {
    const filePath = requestContext.request.path.replace("/manage/storage", "/mnt/nodered");

    if (!existsSync(filePath)) {
        requestContext.setResponseResourceNotFound();
        return;
    } else if (lstatSync(filePath).isDirectory()) {
        const tree = dirTree(filePath);
        requestContext.setResponseBody(tree);
        return;
    }

    requestContext.response.headers["Content-Type"] = mime.lookup(filePath) || "application/octet-stream";
    requestContext.setResponseBody(readFileSync(filePath));
}

export const manageRoutes = new McmaApiRouteCollection()
    .addRoute("POST", "/manage/reset-config", resetConfig)
    .addRoute("POST", "/manage/npm-install", npmInstall)
    .addRoute("POST", "/manage/restart-service", restartService)
    .addRoute("GET", "/manage/operations", queryCollection)
    .addRoute("GET", "/manage/operations/{operationId}", getResource)
    .addRoute("GET", "/manage/storage{/path*}", getFile);
