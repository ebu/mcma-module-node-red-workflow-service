import { Context } from "aws-lambda";
import * as AWS from "aws-sdk";

import { EnvironmentVariableProvider } from "@mcma/core";
import { AuthProvider, ResourceManagerProvider } from "@mcma/client";
import { ProviderCollection, Worker, WorkerRequestProperties } from "@mcma/worker";
import { AwsCloudWatchLoggerProvider } from "@mcma/aws-logger";
import { awsV4Auth } from "@mcma/aws-client";
import { DynamoDbTableProvider } from "@mcma/aws-dynamodb";
import { execSync } from "child_process";
import { writeFileSync } from "fs";

const { LogGroupName } = process.env;

const authProvider = new AuthProvider().add(awsV4Auth(AWS));
const contextVariableProvider = new EnvironmentVariableProvider();
const dbTableProvider = new DynamoDbTableProvider();
const loggerProvider = new AwsCloudWatchLoggerProvider("node-red-workflow-service-worker", LogGroupName);
const resourceManagerProvider = new ResourceManagerProvider(authProvider);

const providerCollection = new ProviderCollection({
    authProvider,
    contextVariableProvider,
    dbTableProvider,
    loggerProvider,
    resourceManagerProvider
});

const worker =
    new Worker(providerCollection);

export async function handler(event: WorkerRequestProperties, context: Context) {
    try {
        const filename = "/mnt/nodered/xyz-test.txt"

        writeFileSync(filename, "TEST");

        let result = execSync("ls -la /mnt/nodered");
        console.log(result.toString());
    } catch (error) {
        console.error(error);
    }

    // try {
    //     const response = await axios.default.get("http://www.rovers.pt");
    //
    //     console.log(response.data);
    // } catch (error) {
    //     console.error(error);
    // }

    // const logger = loggerProvider.get(context.awsRequestId, event.tracker);
    //
    // try {
    //     logger.functionStart(context.awsRequestId);
    //     logger.debug(event);
    //     logger.debug(context);
    //
    //     event.contextVariables = contextVariableProvider.getAllContextVariables();
    //
    //     await worker.doWork(new WorkerRequest(event, logger), { awsRequestId: context.awsRequestId });
    // } catch (error) {
    //     logger.error("Error occurred when handling operation '" + event.operationName + "'");
    //     logger.error(error.toString());
    // } finally {
    //     logger.functionEnd(context.awsRequestId);
    //     await loggerProvider.flush();
    // }
}
