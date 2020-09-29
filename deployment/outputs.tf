output "service_registry_aws" {
  value = module.service_registry_aws
}

output "job_processor_aws" {
  value = module.job_processor_aws
}

output "nodered_workflow_service" {
  value = module.nodered_workflow_service
}

output "vpn_client_private_key" {
  value = tls_private_key.vpn_client.private_key_pem
}

output "vpn_client_certificate" {
  value = tls_locally_signed_cert.vpn_client.cert_pem
}

output "vpn_endpoint_id" {
  value = aws_ec2_client_vpn_endpoint.vpn.id
}

output "vpn_endpoint_name" {
  value = aws_ec2_client_vpn_endpoint.vpn.description
}
