#########################
# Provider registration
#########################

provider "aws" {
  access_key = var.aws_access_key
  secret_key = var.aws_secret_key
  region     = var.aws_region
}

############################################
# Cloud watch log group for central logging
############################################

resource "aws_cloudwatch_log_group" "main" {
  name = "/mcma/${var.global_prefix}"
}

#########################
# Service Registry Module
#########################

module "service_registry_aws" {
  source = "https://ch-ebu-mcma-module-repository.s3.eu-central-1.amazonaws.com/ebu/service-registry/aws/0.13.9/module.zip"

  aws_account_id = var.aws_account_id
  aws_region     = var.aws_region
  log_group_name = aws_cloudwatch_log_group.main.name
  module_prefix  = "${var.global_prefix}-service-registry"
  stage_name     = var.environment_type
}

#########################
# Job Processor Module
#########################

module "job_processor_aws" {
  source = "https://ch-ebu-mcma-module-repository.s3.eu-central-1.amazonaws.com/ebu/job-processor/aws/0.13.9/module.zip"

  aws_account_id   = var.aws_account_id
  aws_region       = var.aws_region
  log_group_name   = aws_cloudwatch_log_group.main.name
  module_prefix    = "${var.global_prefix}-job-processor"
  stage_name       = var.environment_type
  service_registry = module.service_registry_aws
  dashboard_name   = var.global_prefix
}

########################################
# Node-RED Workflow Service
########################################

module "nodered_workflow_service" {
  source = "../aws/build/staging"

  aws_account_id   = var.aws_account_id
  aws_region       = var.aws_region
  log_group_name   = aws_cloudwatch_log_group.main.name
  module_prefix    = "${var.global_prefix}-nodered-service"
  stage_name       = var.environment_type
  service_registry = module.service_registry_aws

  ecs_cluster_id = aws_ecs_cluster.main.id
  ecs_service_subnets = [aws_subnet.private.id]
  ecs_service_security_groups = [aws_default_security_group.default.id]
}
