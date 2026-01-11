variable "environment" {
  description = "Environment name"
  type        = string
}

# Base path for all Grantd parameters
locals {
  base_path = "/grantd/${var.environment}"
}

# Database URL (placeholder - set manually or via CI/CD)
resource "aws_ssm_parameter" "database_url" {
  name        = "${local.base_path}/database/url"
  description = "PlanetScale database connection URL"
  type        = "SecureString"
  value       = "placeholder"

  lifecycle {
    ignore_changes = [value]
  }

  tags = {
    Environment = var.environment
    Project     = "grantd"
  }
}

# Output the base path for connection credentials
output "base_path" {
  value = local.base_path
}

output "database_url_parameter" {
  value = aws_ssm_parameter.database_url.name
}
