import { Logger, Utils } from "@mcma/core";
import { ECS } from "aws-sdk";

const { EcsClusterId, EcsNodeRedServiceName } = process.env;

const ecs = new ECS();

export async function restartContainer(logger: Logger) {
    logger.info("Restarting container");

    const oldIpAddress = await getContainerIpAddress(logger);

    await ecs.updateService({
        service: EcsNodeRedServiceName,
        cluster: EcsClusterId,
        forceNewDeployment: true
    }).promise();

    let currentIpAddress;
    do {
        await Utils.sleep(5000);
        currentIpAddress = await getContainerIpAddress(logger);
    } while (oldIpAddress === currentIpAddress);
}

export async function getContainerIpAddress(logger: Logger): Promise<string> {
    logger.info(`Obtaining container IP address for '${EcsClusterId}' and service '${EcsNodeRedServiceName}'`);

    let taskIpAddress: string = undefined;
    let taskStartedAt: Date = undefined;

    const listTaskData = await ecs.listTasks({
        cluster: EcsClusterId,
        serviceName: EcsNodeRedServiceName
    }).promise();
    logger.info(listTaskData);

    if (listTaskData.taskArns.length > 0) {
        const describeTaskData = await ecs.describeTasks({
            cluster: EcsClusterId,
            tasks: listTaskData.taskArns,
        }).promise();
        logger.info(describeTaskData);

        for (const task of describeTaskData.tasks) {
            if (task.lastStatus !== "RUNNING" || task.desiredStatus !== "RUNNING") {
                continue;
            }

            let ipAddress = undefined;

            for (const attachment of task.attachments) {
                if (attachment.type !== "ElasticNetworkInterface" || attachment.status !== "ATTACHED") {
                    continue;
                }

                for (const detail of attachment.details) {
                    if (detail.name === "privateIPv4Address") {
                        ipAddress = detail.value;
                        break;
                    }
                }

                if (ipAddress) {
                    break;
                }
            }

            if (ipAddress && (!taskStartedAt || taskStartedAt < task.startedAt)) {
                taskIpAddress = ipAddress;
                taskStartedAt = task.startedAt;
            }
        }
    }

    logger.info(`Found IP address '${taskIpAddress}' from container that started at ${taskStartedAt}`);

    return taskIpAddress;
}
