import { AuthProvider, ResourceManager, ResourceManagerConfig } from "@mcma/client";
import { Aws, awsV4Auth } from "@mcma/aws-client";
import { ResourceEndpoint, Service } from "@mcma/core";

export async function updateServiceRegistry(terraformOutput: any, AWS: Aws): Promise<ResourceManager> {
    const servicesUrl = terraformOutput.service_registry_aws.value.services_url;
    const jobProfilesUrl = terraformOutput.service_registry_aws.value.job_profiles_url;
    const servicesAuthType = terraformOutput.service_registry_aws.value.auth_type;

    const resourceManagerConfig: ResourceManagerConfig = {
        servicesUrl,
        servicesAuthType
    };

    const resourceManager = new ResourceManager(resourceManagerConfig, new AuthProvider().add(awsV4Auth(AWS)));

    // 1. Inserting / updating service registry
    const serviceRegistry = new Service({
        name: "Service Registry",
        resources: [
            new ResourceEndpoint({ resourceType: "Service", httpEndpoint: servicesUrl }),
            new ResourceEndpoint({ resourceType: "JobProfile", httpEndpoint: jobProfilesUrl })
        ],
        authType: servicesAuthType
    });
    await insertUpdateService(serviceRegistry, resourceManager);

    // 2. Inserting / updating job processor
    const jobsUrl = terraformOutput.job_processor_aws.value.jobs_url;
    const jobsAuthType = terraformOutput.job_processor_aws.value.auth_type;

    const jobProcessor = new Service({
        name: "Job Processor",
        resources: [
            new ResourceEndpoint({
                resourceType: "AmeJob",
                httpEndpoint: jobsUrl
            }),
            new ResourceEndpoint({
                resourceType: "AIJob",
                httpEndpoint: jobsUrl
            }),
            new ResourceEndpoint({
                resourceType: "CaptureJob",
                httpEndpoint: jobsUrl
            }),
            new ResourceEndpoint({
                resourceType: "QAJob",
                httpEndpoint: jobsUrl
            }),
            new ResourceEndpoint({
                resourceType: "TransferJob",
                httpEndpoint: jobsUrl
            }),
            new ResourceEndpoint({
                resourceType: "TransformJob",
                httpEndpoint: jobsUrl
            }),
            new ResourceEndpoint({
                resourceType: "WorkflowJob",
                httpEndpoint: jobsUrl
            })
        ],
        authType: jobsAuthType
    });

    await insertUpdateService(jobProcessor, resourceManager);

    //3. Insert / update Node-RED workflow service
    const workflowServiceJobsAssignmentsUrl = terraformOutput.nodered_workflow_service.value.job_assignments_url;
    const workflowServiceWorkflowsUrl = terraformOutput.nodered_workflow_service.value.workflows_url;
    const workflowServiceAuthType = terraformOutput.nodered_workflow_service.value.auth_type;

    const workflowServiceService = new Service({
        name: "Node-RED Workflow Service",
        resources: [
            new ResourceEndpoint({
                resourceType: "JobAssignment",
                httpEndpoint: workflowServiceJobsAssignmentsUrl
            }),
            new ResourceEndpoint({
                resourceType: "NodeRedWorkflow",
                httpEndpoint: workflowServiceWorkflowsUrl
            }),
        ],
        authType: workflowServiceAuthType,
        jobType: "WorkflowJob",
        jobProfileIds: []
    });

    await insertUpdateService(workflowServiceService, resourceManager);

    return resourceManager;
}

async function insertUpdateService(service: Service, resourceManager: ResourceManager) {
    let retrievedServices = await resourceManager.query(Service);

    for (const retrievedService of retrievedServices) {
        if (retrievedService.name === service.name) {
            if (!service.id) {
                service.id = retrievedService.id;

                console.log(`Updating ${service.name}`);

                if (Array.isArray(service.jobProfileIds) && service.jobProfileIds.length === 0 && Array.isArray(retrievedService.jobProfileIds)) {
                    for (const jobProfileId of retrievedService.jobProfileIds) {
                        if (!service.jobProfileIds.includes(jobProfileId)) {
                            service.jobProfileIds.push(jobProfileId);
                        }
                    }
                }
                await resourceManager.update(service);
            } else {
                console.log(`Removing duplicate ${service.name} '${retrievedService.id}'`);
                await resourceManager.delete(retrievedService);
            }
        }
    }

    if (!service.id) {
        console.log(`Inserting ${service.name}`);
        await resourceManager.create(service);
    }

    await resourceManager.init();
}
