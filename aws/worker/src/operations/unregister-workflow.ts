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
        const jobProfile = jobProfiles.find(jobProfile => jobProfile.custom?.noderedWorkflowId === workflow.id);

        if (!jobProfile) {
            return;
        }

        const idx = noderedService.jobProfileIds.indexOf(jobProfile.id);
        if (idx >= 0) {
            noderedService.jobProfileIds.splice(idx, 1);
            await resourceManager.update(noderedService);
        }

        await resourceManager.delete(jobProfile);
    } finally {
        await mutex.unlock();
    }
}
