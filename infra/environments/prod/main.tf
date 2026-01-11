terraform {
  backend "s3" {
    bucket = "grantd-terraform-state"
    key    = "prod/terraform.tfstate"
    region = "eu-central-1"
  }
}

module "grantd" {
  source = "../../"

  environment = "prod"
  aws_region  = "eu-central-1"
  domain_name = "grantd.io"
}

output "cognito_user_pool_id" {
  value = module.grantd.cognito_user_pool_id
}

output "cognito_web_client_id" {
  value = module.grantd.cognito_web_client_id
}

output "api_endpoint" {
  value = module.grantd.api_endpoint
}
