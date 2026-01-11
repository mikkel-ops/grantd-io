terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  # Use local backend for now - can migrate to S3 later
  backend "local" {
    path = "terraform.tfstate"
  }
}

provider "aws" {
  region  = "eu-central-1"
  profile = "grantd"

  default_tags {
    tags = {
      Project     = "grantd"
      Environment = "dev"
      ManagedBy   = "terraform"
    }
  }
}

# ============================================================================
# COGNITO USER POOL
# ============================================================================

resource "aws_cognito_user_pool" "main" {
  name = "grantd-dev"

  # Username configuration
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # Password policy
  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = true
  }

  # Account recovery
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Email configuration (use Cognito default for dev)
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  # Schema attributes
  schema {
    name                = "name"
    attribute_data_type = "String"
    mutable             = true
    required            = false

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  # Custom attributes for multi-tenancy
  schema {
    name                = "org_id"
    attribute_data_type = "String"
    mutable             = true
    required            = false

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  schema {
    name                = "role"
    attribute_data_type = "String"
    mutable             = true
    required            = false

    string_attribute_constraints {
      min_length = 1
      max_length = 64
    }
  }

  # MFA (optional for dev)
  mfa_configuration = "OFF"

  # User pool add-ons
  user_pool_add_ons {
    advanced_security_mode = "OFF"
  }

  tags = {
    Name = "grantd-dev-user-pool"
  }
}

# Web client (for React frontend)
resource "aws_cognito_user_pool_client" "web" {
  name         = "grantd-web"
  user_pool_id = aws_cognito_user_pool.main.id

  # No client secret for SPA
  generate_secret = false

  # Token validity
  access_token_validity  = 1  # hours
  id_token_validity      = 1  # hours
  refresh_token_validity = 30 # days

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  # Auth flows for web app
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
  ]

  # Prevent user existence errors
  prevent_user_existence_errors = "ENABLED"

  # Callback URLs for local development
  callback_urls = [
    "http://localhost:5173",
    "http://localhost:5173/callback",
  ]

  logout_urls = [
    "http://localhost:5173",
  ]

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["openid", "email", "profile"]

  supported_identity_providers = ["COGNITO"]
}

# CLI client (for Python CLI)
resource "aws_cognito_user_pool_client" "cli" {
  name         = "grantd-cli"
  user_pool_id = aws_cognito_user_pool.main.id

  # No secret for CLI (device flow)
  generate_secret = false

  # Token validity
  access_token_validity  = 8  # hours
  id_token_validity      = 8  # hours
  refresh_token_validity = 30 # days

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  # Auth flows for CLI
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
  ]

  prevent_user_existence_errors = "ENABLED"
}

# Cognito Domain (for hosted UI)
resource "aws_cognito_user_pool_domain" "main" {
  domain       = "grantd-dev-${random_string.suffix.result}"
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}

# ============================================================================
# OUTPUTS
# ============================================================================

output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.main.id
}

output "cognito_web_client_id" {
  description = "Cognito Web Client ID (for React app)"
  value       = aws_cognito_user_pool_client.web.id
}

output "cognito_cli_client_id" {
  description = "Cognito CLI Client ID (for Python CLI)"
  value       = aws_cognito_user_pool_client.cli.id
}

output "cognito_domain" {
  description = "Cognito Hosted UI Domain"
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.eu-central-1.amazoncognito.com"
}

output "cognito_issuer" {
  description = "Cognito Issuer URL (for JWT validation)"
  value       = "https://cognito-idp.eu-central-1.amazonaws.com/${aws_cognito_user_pool.main.id}"
}
