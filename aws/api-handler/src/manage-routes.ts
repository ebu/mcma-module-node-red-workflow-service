import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { ECS } from "aws-sdk";
import * as dirTree from "directory-tree";

import { McmaException } from "@mcma/core";
import { HttpStatusCode, McmaApiRequestContext, McmaApiRouteCollection } from "@mcma/api";
import { invokeLambdaWorker } from "@mcma/aws-lambda-worker-invoker";

const ecs = new ECS();

const { EcsClusterId, EcsNodeRedServiceName, WorkerFunctionId } = process.env;

async function listStorage(requestContext: McmaApiRequestContext) {
    const tree = dirTree("/mnt/nodered");

    requestContext.setResponseBody(tree);
}

async function getSettings(requestContext: McmaApiRequestContext) {
    const buf = readFileSync("/mnt/nodered/settings.js");

    requestContext.setResponseBody(buf.toString());
    requestContext.response.headers["Content-Type"] = "application/javascript";
}

async function setSettings(requestContext: McmaApiRequestContext) {
    writeFileSync("/mnt/nodered/settings.js", requestContext.request.body);

    requestContext.setResponseStatusCode(HttpStatusCode.NoContent);
}

async function resetService(requestContext: McmaApiRequestContext) {
    execSync("rm -rf /mnt/nodered/* /mnt/nodered/.[!.]* /mnt/nodered/.??*");

    await restartService(requestContext);
}

async function setupConfig(requestContext: McmaApiRequestContext) {
    await invokeLambdaWorker(WorkerFunctionId, {
        operationName: "SetupConfig",
        input: {},
        tracker: requestContext.getTracker()
    });

    requestContext.setResponseStatusCode(HttpStatusCode.Accepted);
}

async function restartService(requestContext: McmaApiRequestContext) {
    await ecs.updateService({
        service: EcsNodeRedServiceName,
        cluster: EcsClusterId,
        forceNewDeployment: true
    }).promise();

    requestContext.setResponseStatusCode(HttpStatusCode.Accepted);
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

    await invokeLambdaWorker(WorkerFunctionId, {
        operationName: "NpmInstall",
        input: {
            base64,
            packages,
        },
        tracker: requestContext.getTracker()
    });

    requestContext.setResponseStatusCode(HttpStatusCode.Accepted);
}

export const manageRoutes = new McmaApiRouteCollection()
    .addRoute("GET", "/manage/list-storage", listStorage)
    .addRoute("GET", "/manage/settings", getSettings)
    .addRoute("PUT", "/manage/settings", setSettings)
    .addRoute("POST", "/manage/setup-config", setupConfig)
    .addRoute("POST", "/manage/reset-service", resetService)
    .addRoute("POST", "/manage/restart-service", restartService)
    .addRoute("POST", "/manage/npm-install", npmInstall);
