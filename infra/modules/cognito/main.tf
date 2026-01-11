variable "environment" {
  description = "Environment name"
  type        = string
}

variable "domain_name" {
  description = "Domain name"
  type        = string
}

# Cognito User Pool
resource "aws_cognito_user_pool" "main" {
  name = "grantd-${var.environment}"

  # Username configuration
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # Password policy
  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = false
    require_uppercase                = true
    temporary_password_validity_days = 7
  }

  # MFA configuration
  mfa_configuration = "OPTIONAL"

  software_token_mfa_configuration {
    enabled = true
  }

  # Custom attributes for multi-tenancy
  schema {
    name                     = "org_id"
    attribute_data_type      = "String"
    mutable                  = true
    required                 = false

    string_attribute_constraints {
      min_length = 36
      max_length = 36
    }
  }

  schema {
    name                     = "role"
    attribute_data_type      = "String"
    mutable                  = true
    required                 = false

    string_attribute_constraints {
      min_length = 1
      max_length = 20
    }
  }

  # Account recovery
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Email configuration
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  # Verification message
  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Your Grantd verification code"
    email_message        = "Your verification code is {####}"
  }

  tags = {
    Environment = var.environment
    Project     = "grantd"
  }
}

# App client for web application
resource "aws_cognito_user_pool_client" "web" {
  name         = "grantd-web-${var.environment}"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret               = false
  prevent_user_existence_errors = "ENABLED"

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  callback_urls = var.environment == "prod" ? [
    "https://app.${var.domain_name}/auth/callback"
  ] : [
    "http://localhost:5173/auth/callback",
    "https://dev.${var.domain_name}/auth/callback"
  ]

  logout_urls = var.environment == "prod" ? [
    "https://app.${var.domain_name}"
  ] : [
    "http://localhost:5173",
    "https://dev.${var.domain_name}"
  ]

  access_token_validity  = 1  # hours
  id_token_validity      = 1  # hours
  refresh_token_validity = 30 # days

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  read_attributes = [
    "email",
    "email_verified",
    "custom:org_id",
    "custom:role",
  ]

  write_attributes = [
    "email",
  ]
}

# App client for CLI
resource "aws_cognito_user_pool_client" "cli" {
  name         = "grantd-cli-${var.environment}"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret               = false
  prevent_user_existence_errors = "ENABLED"

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  access_token_validity  = 8  # hours (longer for CLI sessions)
  refresh_token_validity = 90 # days

  token_validity_units {
    access_token  = "hours"
    refresh_token = "days"
  }
}

# Outputs
output "user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "user_pool_arn" {
  value = aws_cognito_user_pool.main.arn
}

output "web_client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "cli_client_id" {
  value = aws_cognito_user_pool_client.cli.id
}

output "user_pool_endpoint" {
  value = aws_cognito_user_pool.main.endpoint
}
