import { ProviderCollection, WorkerRequest } from "@mcma/worker";
import { JobProfile, McmaException, Service } from "@mcma/core";

import { NodeRedWorkflow } from "@local/common";

const { PublicUrl, TableName } = process.env;

export async function registerWorkflow(providers: ProviderCollection, workerRequest: WorkerRequest, context: { awsRequestId: string }) {
    const logger = workerRequest.logger;
    const table = await providers.dbTableProvider.get(TableName);

    const mutex = table.createMutex({
        name: "service-registry",
        holder: context.awsRequestId
    });
    await mutex.lock();
    try {
        logger.info(workerRequest.input);
        const workflow: NodeRedWorkflow = workerRequest.input.workflow;

        const resourceManager = providers.resourceManagerProvider.get();

        const services = await resourceManager.query(Service);
        const noderedService = services.find(s => s.resources.find(r => r.httpEndpoint.startsWith(PublicUrl)));
        if (!noderedService) {
            throw new McmaException("NodeRed service not found in Service Registry");
        }

        const jobProfiles = await resourceManager.query(JobProfile);
        const jobProfileIds = jobProfiles.filter(jobProfile => jobProfile.custom?.nodeRedWorkflowId?.startsWith(PublicUrl))
                                         .map(jobProfile => jobProfile.id);

        let jobProfile = buildJobProfile(workflow);

        const existingJobProfile = jobProfiles.find(jobProfile => jobProfile.custom?.nodeRedWorkflowId === workflow.id);
        if (existingJobProfile) {
            jobProfile.id = existingJobProfile.id;
            jobProfile = await resourceManager.update(jobProfile);
        } else {
            jobProfile = await resourceManager.create(jobProfile);
        }

        if (!jobProfileIds.includes(jobProfile.id)) {
            jobProfileIds.push(jobProfile.id);
        }

        noderedService.jobProfileIds = jobProfileIds;
        await resourceManager.update(noderedService);
    } finally {
        await mutex.unlock();
    }
}

function buildJobProfile(workflow: NodeRedWorkflow): JobProfile {
    return new JobProfile({
        name: "NodeRed_" + workflow.name,
        inputParameters: workflow.inputParameters,
        optionalInputParameters: workflow.optionalInputParameters,
        outputParameters: workflow.outputParameters,
        custom: {
            nodeRedWorkflowId: workflow.id
        }
    });
}
