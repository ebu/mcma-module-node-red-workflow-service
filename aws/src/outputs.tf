output "auth_type" {
  value = local.service_auth_type
}

output "job_assignments_url" {
  value = "${local.service_url}/job-assignments"
}

output "workflows_url" {
  value = "${local.service_url}/workflows"
}

output "apigateway_execution_arn" {
  value = aws_apigatewayv2_stage.service_api.execution_arn
}
