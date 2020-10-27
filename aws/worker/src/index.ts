import { Context } from "aws-lambda";
import * as AWS from "aws-sdk";

import { AuthProvider, ResourceManagerProvider } from "@mcma/client";
import { ProviderCollection, Worker, WorkerRequest, WorkerRequestProperties } from "@mcma/worker";
import { AwsCloudWatchLoggerProvider } from "@mcma/aws-logger";
import { awsV4Auth } from "@mcma/aws-client";
import { DynamoDbTableProvider } from "@mcma/aws-dynamodb";
import { manageOperation, processJobAssignment, registerWorkflow, unregisterWorkflow, updateJobAssignment } from "./operations";

const { LogGroupName } = process.env;

const authProvider = new AuthProvider().add(awsV4Auth(AWS));
const dbTableProvider = new DynamoDbTableProvider();
const loggerProvider = new AwsCloudWatchLoggerProvider("node-red-workflow-service-worker", LogGroupName);
const resourceManagerProvider = new ResourceManagerProvider(authProvider);

const providerCollection = new ProviderCollection({
    authProvider,
    dbTableProvider,
    loggerProvider,
    resourceManagerProvider
});

const worker =
    new Worker(providerCollection)
        .addOperation("ManageOperation", manageOperation)
        .addOperation("ProcessJobAssignment", processJobAssignment)
        .addOperation("RegisterWorkflow", registerWorkflow)
        .addOperation("UpdateJobAssignment", updateJobAssignment)
        .addOperation("UnregisterWorkflow", unregisterWorkflow);

export async function handler(event: WorkerRequestProperties, context: Context) {
    const logger = loggerProvider.get(context.awsRequestId, event.tracker);

    try {
        logger.functionStart(context.awsRequestId);
        logger.debug(event);
        logger.debug(context);

        await worker.doWork(new WorkerRequest(event, logger), {
            awsRequestId: context.awsRequestId
        });
    } catch (error) {
        logger.error("Error occurred when handling operation '" + event.operationName + "'");
        logger.error(error.toString());
    } finally {
        logger.functionEnd(context.awsRequestId);
        await loggerProvider.flush();
    }
}
