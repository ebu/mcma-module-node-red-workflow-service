import { APIGatewayProxyEventV2, Context } from "aws-lambda";
import { DefaultJobRouteCollection } from "@mcma/api";
import { DynamoDbTableProvider } from "@mcma/aws-dynamodb";
import { AwsCloudWatchLoggerProvider } from "@mcma/aws-logger";
import { ApiGatewayApiController } from "@mcma/aws-api-gateway";
import { invokeLambdaWorker } from "@mcma/aws-lambda-worker-invoker";
import { getSettings, listStorage, npmInstall, resetService, restartService, setSettings } from "./manage-routes";

const { LogGroupName } = process.env;

const loggerProvider = new AwsCloudWatchLoggerProvider("node-red-workflow-service-api-handler", LogGroupName);
const dbTableProvider = new DynamoDbTableProvider();

const routes = new DefaultJobRouteCollection(dbTableProvider, invokeLambdaWorker)
    .addRoute("GET", "/manage/list-storage", listStorage)
    .addRoute("GET", "/manage/settings", getSettings)
    .addRoute("PUT", "/manage/settings", setSettings)
    .addRoute("POST", "/manage/reset-service", resetService)
    .addRoute("POST", "/manage/restart-service", restartService)
    .addRoute("POST", "/manage/npm-install", npmInstall);

const restController = new ApiGatewayApiController(routes, loggerProvider);

export async function handler(event: APIGatewayProxyEventV2, context: Context) {
    console.log(JSON.stringify(event, null, 2));
    console.log(JSON.stringify(context, null, 2));

    const logger = loggerProvider.get(context.awsRequestId);
    try {
        logger.functionStart(context.awsRequestId);
        logger.debug(event);
        logger.debug(context);

        return await restController.handleRequest(event, context);
    } catch (error) {
        logger.error(error?.toString());
        throw error;
    } finally {
        logger.functionEnd(context.awsRequestId);

        console.log("LoggerProvider.flush - START - " + new Date().toISOString());
        const t1 = Date.now();
        await loggerProvider.flush(Date.now() + context.getRemainingTimeInMillis() - 5000);
        const t2 = Date.now();
        console.log("LoggerProvider.flush - END   - " + new Date().toISOString() + " - flush took " + (t2 - t1) + " ms");
    }
}
