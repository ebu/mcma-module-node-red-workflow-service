terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "3.14.1"
    }
    tls = {
      source = "hashicorp/tls"
      version = "3.0.0"
    }
  }
  required_version = ">= 0.13"
}
