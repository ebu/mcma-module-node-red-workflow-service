import { JobStatus, McmaResource, McmaResourceProperties } from "@mcma/core";

export interface ManageOperationProperties extends McmaResourceProperties {
    name: string
    status: JobStatus.Running | JobStatus.Completed
}

export class ManageOperation extends McmaResource implements ManageOperationProperties {
    name: string;
    status: JobStatus.Running | JobStatus.Completed;

    constructor(properties: ManageOperationProperties) {
        super("ManageOperation", properties);
    }
}
