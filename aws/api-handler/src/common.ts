import { buildStandardQuery, McmaApiRequestContext } from "@mcma/api";
import { DynamoDbTableProvider } from "@mcma/aws-dynamodb";

const { TableName } = process.env;

export const dbTableProvider = new DynamoDbTableProvider();

export async function queryCollection(requestContext: McmaApiRequestContext) {
    const query = buildStandardQuery(requestContext, false);

    const table = await dbTableProvider.get(TableName);
    const queryResults = await table.query(query);

    requestContext.setResponseBody(queryResults);
}

export async function getResource(requestContext: McmaApiRequestContext) {
    const table = await dbTableProvider.get(TableName);
    const resource = await table.get(requestContext.request.path);
    if (resource) {
        requestContext.setResponseBody(resource);
    } else {
        requestContext.setResponseResourceNotFound();
    }
}
