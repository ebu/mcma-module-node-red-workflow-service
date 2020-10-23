import { ProviderCollection, WorkerRequest } from "@mcma/worker";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { installPackages } from "./npm-install";

const { TableName, WorkerFunctionId } = process.env;

export async function setupConfig(providers: ProviderCollection, workerRequest: WorkerRequest, context: { awsRequestId: string }) {
    const logger = workerRequest.logger;
    const table = await providers.dbTableProvider.get(TableName);

    await installPackages(["aws-sdk"], logger, table, context.awsRequestId);

    const scriptDir = "/mnt/nodered/scripts";

    if (!existsSync(scriptDir)) {
        mkdirSync(scriptDir);
    }

    const updateJobAssignmentScript = `
async function main() {
    const AWS = require("aws-sdk");
    const lambda = new AWS.Lambda();
    await lambda.invoke({
        FunctionName: "${WorkerFunctionId}",
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
        TableName: "${TableName}",
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
