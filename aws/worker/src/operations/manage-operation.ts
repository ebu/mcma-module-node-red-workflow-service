import * as npm from "npm";
import { v4 as uuidv4 } from "uuid";
import { existsSync, mkdirSync, writeFileSync } from "fs";

import { JobStatus, Logger } from "@mcma/core";
import { ProviderCollection, WorkerRequest } from "@mcma/worker";

import { ManageOperationProperties } from "@local/common";
import { execSync } from "child_process";
import { restartContainer } from "../utils";
import { getTableName } from "@mcma/data";
import { getWorkerFunctionId } from "@mcma/worker-invoker";

export async function manageOperation(providers: ProviderCollection, workerRequest: WorkerRequest, context: { awsRequestId: string }) {
    const logger = workerRequest.logger;
    const table = await providers.dbTableProvider.get(getTableName());

    const mutex = table.createMutex({
        name: "manage-operation",
        holder: context.awsRequestId,
        lockTimeout: 300000,
        logger
    });
    await mutex.lock();
    try {
        const manageOperation = await table.get<ManageOperationProperties>(workerRequest.input.databaseId);
        logger.info(`Processing manage operation '${manageOperation.name}`);

        switch (manageOperation.name) {
            case "ResetConfig":
                await resetConfig(logger);
                break;
            case "NpmInstall":
                await npmInstall(logger, workerRequest.input);
                break;
            case "RestartService":
                await restartContainer(logger);
                break;
            default:
                logger.error(`Unrecognized management operation with name '${manageOperation.name}'`);
                break;
        }

        manageOperation.status = JobStatus.Completed;
        manageOperation.dateModified = new Date();

        await table.put(workerRequest.input.databaseId, manageOperation);
    } finally {
        await mutex.unlock();
    }
}

async function resetConfig(logger: Logger) {
    execSync("rm -rf /mnt/nodered/* /mnt/nodered/.[!.]* /mnt/nodered/.??*");

    const packageJson = `{
    "name": "node-red-project",
    "description": "A Node-RED Project",
    "version": "0.0.1",
    "private": true
}`;

    writeFileSync(`/mnt/nodered/package.json`, packageJson);

    await installPackages(["aws-sdk"], logger);

    const scriptDir = "/mnt/nodered/scripts";

    if (!existsSync(scriptDir)) {
        mkdirSync(scriptDir);
    }

    const updateJobAssignmentScript = `
async function main() {
    const AWS = require("aws-sdk");
    const lambda = new AWS.Lambda();
    await lambda.invoke({
        FunctionName: "${getWorkerFunctionId()}",
        InvocationType: "Event",
        LogType: "None",
        Payload: JSON.stringify({
            operationName: "UpdateJobAssignment",
            input: input,
            tracker: tracker
        })
    }).promise();
}
main().then(() => resolve()).catch(error => reject(error));
`;

    writeFileSync(`${scriptDir}/update-job-assignment.js`, updateJobAssignmentScript);

    const addWorkflowExecutionEventScript = `
const util = require("util");
const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();
    
function parsePartitionAndSortKeys(id) {
    const lastSlashIndex = id.lastIndexOf("/");
    return lastSlashIndex > 0
        ? { partitionKey: id.substr(0, lastSlashIndex) , sortKey: id.substr(lastSlashIndex + 1) }
        : { partitionKey: id, sortKey: id };
}

function serialize(object) {
    let copy;
    if (object) {
        copy = Array.isArray(object) ? [] : {};
        for (const key of Object.keys(object)) {
            const value = object[key];
            if (util.types.isDate(value) && !isNaN(value.getTime())) {
                copy[key] = value.toISOString();
            } else if (typeof value === "object") {
                copy[key] = serialize(value);
            } else {
                copy[key] = value;
            }
        }
    }
    return copy;
}
    
async function main() {
    const { partitionKey, sortKey } = parsePartitionAndSortKeys(item.databaseId);

    await docClient.put({
        TableName: "${getTableName()}",
        Item: {
            partition_key: partitionKey,
            sort_key: sortKey,
            resource: serialize(item.resource)   
        }
    }).promise();
}
main().then(() => resolve()).catch(error => reject(error));
`;

    writeFileSync(`${scriptDir}/add-workflow-execution-event.js`, addWorkflowExecutionEventScript);
}

async function npmInstall(logger: Logger, input: { [key: string]: any }) {
    let packages: string[] = [];

    if (input.base64) {
        const buf = Buffer.from(input.base64, "base64");
        const filename = `/tmp/${uuidv4()}.tgz`;
        writeFileSync(filename, buf);
        packages.push(filename);
    } else {
        packages = input.packages;
    }

    await installPackages(packages, logger);
}

async function installPackages(packages: string[], logger: Logger) {
    await new Promise((resolve, reject) => {
        try {
            process.chdir("/mnt/nodered");

            logger.info("npm load");
            npm.load({
                cache: "/tmp/.npm"
            }, ((err, result) => {
                logger.info({ err, result });
                logger.info("npm install");
                try {
                    npm.commands.install(packages, (err?: Error, result?: any) => {
                        logger.info("results");
                        if (err) {
                            logger.error(err);
                            return reject(err);
                        }

                        logger.info(result);
                        resolve(result);
                    });
                } catch (error) {
                    reject(error);
                }
            }));

            npm.on('log', (message) => {
                logger.info(message);
            });
        } catch (error) {
            reject(error);
        }
    });
}

