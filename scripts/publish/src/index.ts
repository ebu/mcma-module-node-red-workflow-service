import * as fs from "fs";
import * as AWS from "aws-sdk";
import { McmaException } from "@mcma/core";

const AWS_CREDENTIALS = "../../deployment/aws-credentials.json";
const { MODULE_NAMESPACE, MODULE_NAME, MODULE_VERSION, MODULE_REPOSITORY } = process.env;

AWS.config.loadFromPath(AWS_CREDENTIALS);

const s3 = new AWS.S3();

async function main() {
    console.log("Publishing to Module Repository");
    console.log("Repository: " + MODULE_REPOSITORY);
    console.log("Namespace:  " + MODULE_NAMESPACE);
    console.log("Name:       " + MODULE_NAME);
    console.log("Version:    " + MODULE_VERSION);

    const objectKey = `${MODULE_NAMESPACE}/${MODULE_NAME}/aws/${MODULE_VERSION}/module.zip`;

    console.log("Checking if version already exists");
    let exists = true;
    try {
        await s3.headObject({
            Bucket: MODULE_REPOSITORY,
            Key: objectKey
        }).promise();
    } catch {
        exists = false;
    }
    if (exists) {
        throw new McmaException("Version already exists in module repository. Change the version number!");
    }

    console.log("Uploading AWS version");
    try {
        await s3.upload({
            Bucket: MODULE_REPOSITORY,
            Key: objectKey,
            Body: fs.createReadStream("../../aws/build/dist/module.zip"),
            ACL: "public-read"
        }).promise();
    } catch (error) {
        // in case of a private bucket with restrictions we just try again without public-read ACL
        await s3.upload({
            Bucket: MODULE_REPOSITORY,
            Key: objectKey,
            Body: fs.createReadStream("../../aws/build/dist/module.zip")
        }).promise();
    }
}

main().then(() => console.log("Done")).catch(reason => console.error(reason));
