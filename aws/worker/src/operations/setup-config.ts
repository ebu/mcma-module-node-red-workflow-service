import { ProviderCollection, WorkerRequest } from "@mcma/worker";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { installPackages } from "./npm-install";

const { TableName } = process.env;

export async function setupConfig(providers: ProviderCollection, workerRequest: WorkerRequest, context: { awsRequestId: string }) {
    const logger = workerRequest.logger;
    const table = await providers.dbTableProvider.get(TableName);

    await installPackages(["aws-sdk"], logger, table, context.awsRequestId);

    const updateJobAssignmentScript = `
async function main() {
    const AWS = require("aws-sdk");
    const lambda = new AWS.Lambda();
    await lambda.invoke({
        FunctionName: process.env.WorkerFunctionId,
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

    const scriptDir = "/mnt/nodered/scripts";

    if (!existsSync(scriptDir)) {
        mkdirSync(scriptDir);
    }
    writeFileSync("/mnt/nodered/scripts/update-job-assignment.js", updateJobAssignmentScript);
}
