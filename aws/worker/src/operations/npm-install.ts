import * as npm from "npm";
import { v4 as uuidv4 } from "uuid";
import { writeFileSync } from "fs";

import { Logger } from "@mcma/core";
import { ProviderCollection, WorkerRequest } from "@mcma/worker";
import { DocumentDatabaseTable } from "@mcma/data";

const { TableName } = process.env;

export async function npmInstall(providers: ProviderCollection, workerRequest: WorkerRequest, context: { awsRequestId: string }) {
    const logger = workerRequest.logger;

    const table = await providers.dbTableProvider.get(TableName);

    let packages: string[] = [];

    if (workerRequest.input.base64) {
        const buf = Buffer.from(workerRequest.input.base64, "base64");
        const filename = `/tmp/${uuidv4()}.tgz`;
        writeFileSync(filename, buf);
        packages.push(filename);
    } else {
        packages = workerRequest.input.packages;
    }

    await installPackages(packages, logger, table, context.awsRequestId);
}

export async function installPackages(packages: string[], logger: Logger, table: DocumentDatabaseTable, awsRequestId: string) {
    const mutex = table.createMutex("npm-install", awsRequestId, 120000);
    await mutex.lock();
    try {
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
    } finally {
        await mutex.unlock();
    }
}
