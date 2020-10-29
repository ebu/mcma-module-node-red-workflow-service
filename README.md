# mcma-module-node-red-workflow-service

This repository will contain code and scripts to build a MCMA module containing the cloud agnostic MCMA Node-RED workflow service targeting AWS, Azure and GCP

## Requirements for deploying the Node-RED workflow service

* Node.js v12.19.0 installed and accessible in PATH. Recommended is to use a node version manager, which allows you to quickly switch between node versions (see more info at [nvm-windows](https://github.com/coreybutler/nvm-windows) for windows support or [nvm](https://github.com/creationix/nvm) for Mac OS and Linux support)
* Terraform v0.13.2 installed and available in PATH. See the [Terraform website](https://www.terraform.io/)
* Java JRE or JDK 1.8 or higher to run Gradle build and deploy scripts

## Requirements for deploying the Node-RED workflow service on AWS
* AWS account

## Setup procedure for AWS
1. Create file named `gradle.properties`
2. Add the following information to the created file and update the parameter values reflecting your AWS account and Azure account 
```
environmentName=com.your-domain.mcma
environmentType=dev

awsAccountId=<YOUR_AWS_ACCOUNT_ID>
awsAccessKey=<YOUR_AWS_ACCESS_KEY>
awsSecretKey=<YOUR_AWS_SECRET_KEY>
awsRegion=<YOUR_AWS_REGION>
```

5. Save the file.
6. Open command line in project root folder.
7. Execute `gradlew deploy` and let it run. This can take a few minutes.

## After deployment

After deployment the above procedure will have deployed a MCMA Service Registry, MCMA Job Processor and the MCMA Node-RED workflow service. The Node-RED workflow service uses the Node-RED docker image to create a container that is deployed using ECS. Also a VPN connection is deployed and credentials are generated to be used with OpenVPN to make a connection to the VPC that is hosting the Node-RED container. Checkout ECS through the AWS Console to find out on which IP address is assigned to the Node-RED container.
