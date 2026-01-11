terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    # Configure in environments/<env>/backend.tfvars
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "grantd"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Variables
variable "environment" {
  description = "Environment name"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-central-1"
}

variable "domain_name" {
  description = "Domain name for the application"
  type        = string
  default     = "grantd.io"
}

# Cognito User Pool
module "cognito" {
  source = "./modules/cognito"

  environment = var.environment
  domain_name = var.domain_name
}

# API Gateway + Lambda
module "api" {
  source = "./modules/lambda"

  environment         = var.environment
  cognito_user_pool_id = module.cognito.user_pool_id
  cognito_client_id   = module.cognito.web_client_id
}

# Parameter Store for secrets
module "secrets" {
  source = "./modules/parameter-store"

  environment = var.environment
}

# EventBridge for scheduled tasks
module "scheduler" {
  source = "./modules/eventbridge"

  environment          = var.environment
  sync_worker_arn      = module.lambdas.sync_worker_arn
  drift_detector_arn   = module.lambdas.drift_detector_arn
}

# Background Lambda functions
module "lambdas" {
  source = "./modules/lambda"

  environment          = var.environment
  cognito_user_pool_id = module.cognito.user_pool_id
}

# Outputs
output "cognito_user_pool_id" {
  value = module.cognito.user_pool_id
}

output "cognito_web_client_id" {
  value = module.cognito.web_client_id
}

output "cognito_cli_client_id" {
  value = module.cognito.cli_client_id
}

output "api_endpoint" {
  value = module.api.api_endpoint
}
