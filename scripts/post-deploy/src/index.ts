import * as fs from "fs";
import * as AWS from "aws-sdk";
import { exportVpnClientConfig } from "./export-vpn-client-config";
import { updateServiceRegistry } from "./update-service-registry";

const AWS_CREDENTIALS = "../../deployment/aws-credentials.json";
const TERRAFORM_OUTPUT = "../../deployment/terraform.output.json";

AWS.config.loadFromPath(AWS_CREDENTIALS);

async function main() {
    try {
        const terraformOutput = JSON.parse(fs.readFileSync(TERRAFORM_OUTPUT, "utf8"));

        await updateServiceRegistry(terraformOutput, AWS);

        await exportVpnClientConfig(terraformOutput, AWS);
    } catch (error) {
        if (error.response && error.response.data) {
            console.error(JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error);
        }
    }
}

main().then(() => console.log("Done"));
