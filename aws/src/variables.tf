#########################
# Environment Variables
#########################

variable "module_prefix" {
  type        = string
  description = "Prefix for all managed resources in this module"
}

variable "stage_name" {
  type        = string
  description = "Stage name to be used for the API Gateway deployment"
}

variable "log_group" {
  type        = object({
    id   = string
    arn  = string
    name = string
  })
  description = "Log group used by MCMA Event tracking"
}

variable "dead_letter_config_target" {
  type        = string
  description = "Configuring dead letter target for worker lambda"
  default     = null
}

variable "tags" {
  type        = object({})
  description = "Tags applied to created resources"
  default     = {}
}

#########################
# AWS Variables
#########################

variable "aws_account_id" {
  type        = string
  description = "Account ID to which this module is deployed"
}

variable "aws_region" {
  type        = string
  description = "AWS Region to which this module is deployed"
}

variable "iam_role_path" {
  type        = string
  description = "Path for creation of access role"
  default     = "/"
}

variable "iam_policy_path" {
  type        = string
  description = "Path for creation of access policy"
  default     = "/"
}

#########################
# Dependencies
#########################

variable "service_registry" {
  type = object({
    auth_type    = string,
    services_url = string,
  })
}

#########################
# Configuration
#########################

variable "api_gateway_logging_enabled" {
  type        = bool
  description = "Enable API Gateway logging"
  default     = false
}

variable "api_gateway_metrics_enabled" {
  type        = bool
  description = "Enable API Gateway metrics"
  default     = false
}

variable "xray_tracing_enabled" {
  type        = bool
  description = "Enable X-Ray tracing"
  default     = false
}

#####################################
# ECS Node-RED service configuration
#####################################

variable "ecs_cluster" {
  type        = object({
    id   = string
    name = string
  })
  description = "ECS cluster in which Node-RED container will be placed"
}

variable "ecs_service_subnets" {
  type        = list(string)
  description = "List of subnets in which Node-RED container will be placed"
}

variable "ecs_service_security_groups" {
  type        = list(string)
  description = "List of security groups in which Node-RED container will be placed"
}

####################################
# Node-RED container configuration
####################################

variable "nodered_environment_variables" {
  type        = list(object({
    name  = string
    value = string
  }))
  description = "List of environment variables to be made available within Node-RED container"
  default     = []
}

variable "nodered_iam_policy_arn" {
  type        = string
  description = "ARN of IAM policy to add additional permissions for Node-RED container instance"
  default     = null
}
