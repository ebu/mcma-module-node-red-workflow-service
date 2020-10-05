import { writeFileSync } from "fs";
import { execSync } from "child_process";
import * as npm from "npm";
import { ECS } from "aws-sdk";
import * as dirTree from "directory-tree";
import { v4 as uuidv4 } from "uuid";

import { Logger, McmaException } from "@mcma/core";
import { HttpStatusCode, McmaApiRequestContext } from "@mcma/api";

const ecs = new ECS();

const { EcsClusterId, EcsNodeRedServiceName } = process.env;

export async function listStorage(requestContext: McmaApiRequestContext) {
    const tree = dirTree("/mnt/nodered");

    requestContext.setResponseBody(tree);
}

export async function resetService(requestContext: McmaApiRequestContext) {
    execSync("rm -rf /mnt/nodered/* /mnt/nodered/.[!.]* /mnt/nodered/.??*");

    await restartService(requestContext);
}

export async function restartService(requestContext: McmaApiRequestContext) {
    await ecs.updateService({
        service: EcsNodeRedServiceName,
        cluster: EcsClusterId,
        forceNewDeployment: true
    }).promise();

    requestContext.setResponseStatusCode(HttpStatusCode.Accepted);
}

export async function npmInstall(requestContext: McmaApiRequestContext) {
    const logger = requestContext.getLogger();

    const packages: string[] = [];

    if (typeof requestContext.request.body === "string") {
        const buf = Buffer.from(requestContext.request.body, "base64");

        const filename = `/tmp/${uuidv4()}.tgz`;

        writeFileSync(filename, buf);

        packages.push(filename)
    } else if (Array.isArray(requestContext.request.body.packages)) {
        packages.push(...requestContext.request.body.packages);
    } else {
        throw new McmaException("Invalid input")
    }

    await installPackages(packages, logger);

    requestContext.setResponseStatusCode(HttpStatusCode.Accepted);
}

async function installPackages(packages: string[], logger: Logger) {
    return new Promise((resolve, reject) => {
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
