################################
# Certificate Authority for VPN
################################

resource "tls_private_key" "ca" {
  algorithm = "RSA"
  rsa_bits  = 2048
}

resource "tls_self_signed_cert" "ca" {
  key_algorithm   = "RSA"
  private_key_pem = tls_private_key.ca.private_key_pem

  subject {
    common_name = "${var.global_prefix}-certicate-authority"
  }

  validity_period_hours = 8760

  allowed_uses = []

  is_ca_certificate  = true
  set_subject_key_id = true
}

################################
# Certificate for VPN Server
################################

resource "tls_private_key" "vpn_server" {
  algorithm = "RSA"
  rsa_bits  = 2048
}

resource "tls_cert_request" "vpn_server" {
  key_algorithm   = "RSA"
  private_key_pem = tls_private_key.vpn_server.private_key_pem

  subject {
    common_name = "${var.global_prefix}-vpn-server.mcma.io"
  }
}

resource "tls_locally_signed_cert" "vpn_server" {
  cert_request_pem   = tls_cert_request.vpn_server.cert_request_pem
  ca_key_algorithm   = "RSA"
  ca_private_key_pem = tls_private_key.ca.private_key_pem
  ca_cert_pem        = tls_self_signed_cert.ca.cert_pem

  validity_period_hours = 720

  allowed_uses = [
    "key_encipherment",
    "digital_signature",
    "server_auth",
  ]

  set_subject_key_id = true
}

resource "aws_acm_certificate" "vpn_server" {
  private_key       = tls_private_key.vpn_server.private_key_pem
  certificate_body  = tls_locally_signed_cert.vpn_server.cert_pem
  certificate_chain = tls_self_signed_cert.ca.cert_pem

  tags = {
    Name = "${var.global_prefix}-vpn-server"
  }
}

################################
# Certificate for VPN Client
################################

resource "tls_private_key" "vpn_client" {
  algorithm = "RSA"
  rsa_bits  = 2048
}

resource "tls_cert_request" "vpn_client" {
  key_algorithm   = "RSA"
  private_key_pem = tls_private_key.vpn_client.private_key_pem

  subject {
    common_name = "${var.global_prefix}-vpn-client.mcma.io"
  }
}

resource "tls_locally_signed_cert" "vpn_client" {
  cert_request_pem   = tls_cert_request.vpn_client.cert_request_pem
  ca_key_algorithm   = "RSA"
  ca_private_key_pem = tls_private_key.ca.private_key_pem
  ca_cert_pem        = tls_self_signed_cert.ca.cert_pem

  validity_period_hours = 720

  allowed_uses = [
    "digital_signature",
    "client_auth",
  ]

  set_subject_key_id = true
}

resource "aws_acm_certificate" "vpn_client" {
  private_key       = tls_private_key.vpn_client.private_key_pem
  certificate_body  = tls_locally_signed_cert.vpn_client.cert_pem
  certificate_chain = tls_self_signed_cert.ca.cert_pem

  tags = {
    Name = "${var.global_prefix}-vpn-client"
  }
}

################################
# AWS VPN configuration
################################

resource "aws_ec2_client_vpn_endpoint" "vpn" {
  description            = var.global_prefix
  server_certificate_arn = aws_acm_certificate.vpn_server.arn
  client_cidr_block      = "10.99.0.0/16"
  split_tunnel           = true

  authentication_options {
    type                       = "certificate-authentication"
    root_certificate_chain_arn = aws_acm_certificate.vpn_client.arn
  }

  connection_log_options {
    enabled = false
  }

  tags = {
    Name = var.global_prefix
  }
}

resource "aws_ec2_client_vpn_network_association" "vpn" {
  client_vpn_endpoint_id = aws_ec2_client_vpn_endpoint.vpn.id
  subnet_id              = aws_subnet.private.id
}

resource "aws_ec2_client_vpn_authorization_rule" "vpn" {
  client_vpn_endpoint_id = aws_ec2_client_vpn_endpoint.vpn.id
  target_network_cidr    = aws_vpc.main.cidr_block
  authorize_all_groups   = true
}
