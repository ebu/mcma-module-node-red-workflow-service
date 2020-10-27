import { ProviderCollection, WorkerRequest } from "@mcma/worker";
import { JobProfile, McmaException, Service } from "@mcma/core";

const { PublicUrl, TableName } = process.env;

export async function unregisterWorkflow(providers: ProviderCollection, workerRequest: WorkerRequest, context: { awsRequestId: string }) {
    const logger = workerRequest.logger;
    const table = await providers.dbTableProvider.get(TableName);

    const mutex = table.createMutex("service-registry", context.awsRequestId);
    await mutex.lock();
    try {
        logger.info(workerRequest.input);
        const workflow = workerRequest.input.workflow;

        const resourceManager = providers.resourceManagerProvider.get();

        const services = await resourceManager.query(Service);
        const noderedService = services.find(s => s.resources.find(r => r.httpEndpoint.startsWith(PublicUrl)));
        if (!noderedService) {
            throw new McmaException("NodeRed service not found in Service Registry");
        }

        const jobProfiles = await resourceManager.query(JobProfile);
        const jobProfileIds = jobProfiles.filter(jobProfile => jobProfile.custom?.nodeRedWorkflowId?.startsWith(PublicUrl))
                                         .map(jobProfile => jobProfile.id);

        const jobProfile = jobProfiles.find(jobProfile => jobProfile.custom?.nodeRedWorkflowId === workflow.id);
        if (jobProfile) {
            await resourceManager.delete(jobProfile);

            const idx = jobProfileIds.indexOf(jobProfile.id);
            if (idx >= 0) {
                jobProfileIds.splice(idx, 1);
            }
        }

        noderedService.jobProfileIds = jobProfileIds;
        await resourceManager.update(noderedService);
    } finally {
        await mutex.unlock();
    }
}
