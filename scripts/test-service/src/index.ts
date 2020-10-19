import * as fs from "fs";
import * as AWS from "aws-sdk";

import { AuthProvider, ResourceManager, ResourceManagerConfig } from "@mcma/client";
import { Job, JobParameterBag, JobProfile, JobStatus, McmaException, Utils, WorkflowJob } from "@mcma/core";
import { awsV4Auth } from "@mcma/aws-client";

const AWS_CREDENTIALS = "../../deployment/aws-credentials.json";
const TERRAFORM_OUTPUT = "../../deployment/terraform.output.json";

AWS.config.loadFromPath(AWS_CREDENTIALS);

async function waitForJobCompletion(job: Job, resourceManager: ResourceManager): Promise<Job> {
    console.log("Job is " + job.status);

    while (job.status !== JobStatus.Completed &&
           job.status !== JobStatus.Failed &&
           job.status !== JobStatus.Canceled) {

        await Utils.sleep(1000);
        job = await resourceManager.get<Job>(job.id);

        let progress = "";
        if (job.status === "Running" && job.progress) {
            progress = ` ${job.progress}%`;
        }

        console.log("Job is " + job.status + progress);
    }

    return job;
}

async function startJob(resourceManager: ResourceManager) {
    const [jobProfile] = await resourceManager.query(JobProfile, { name: "TestWorkflow" });
    if (!jobProfile) {
        throw new McmaException("JobProfile not found");
    }

    let job = new WorkflowJob({
        jobProfileId: jobProfile.id,
        jobInput: new JobParameterBag({})
    });

    return resourceManager.create(job);
}

async function testJob(resourceManager: ResourceManager) {
    let job;

    console.log("Creating job");
    job = await startJob(resourceManager);

    console.log("job.id = " + job.id);
    job = await waitForJobCompletion(job, resourceManager);

    console.log(JSON.stringify(job, null, 2));
}

async function main() {
    console.log("Starting test service");

    const terraformOutput = JSON.parse(fs.readFileSync(TERRAFORM_OUTPUT, "utf8"));

    const servicesUrl = terraformOutput.service_registry_aws.value.services_url;
    const servicesAuthType = terraformOutput.service_registry_aws.value.auth_type;

    const resourceManagerConfig: ResourceManagerConfig = {
        servicesUrl,
        servicesAuthType,
    };

    let resourceManager = new ResourceManager(resourceManagerConfig, new AuthProvider().add(awsV4Auth(AWS)));

    await testJob(resourceManager);
}

main().then(() => console.log("Done")).catch(e => console.error(e));
