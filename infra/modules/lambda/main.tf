variable "environment" {
  description = "Environment name"
  type        = string
}

variable "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  type        = string
}

variable "cognito_client_id" {
  description = "Cognito Client ID"
  type        = string
  default     = ""
}

variable "database_url" {
  description = "Database connection URL"
  type        = string
  default     = ""
  sensitive   = true
}

# IAM Role for Lambda
resource "aws_iam_role" "lambda_role" {
  name = "grantd-lambda-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

# Lambda basic execution policy
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Lambda VPC execution policy (if using VPC)
resource "aws_iam_role_policy_attachment" "lambda_vpc" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# Parameter Store access policy
resource "aws_iam_role_policy" "parameter_store" {
  name = "grantd-parameter-store-${var.environment}"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath"
        ]
        Resource = "arn:aws:ssm:*:*:parameter/grantd/*"
      }
    ]
  })
}

# API Lambda Function
resource "aws_lambda_function" "api" {
  function_name = "grantd-api-${var.environment}"
  role          = aws_iam_role.lambda_role.arn
  handler       = "src.main.handler"
  runtime       = "python3.11"
  timeout       = 30
  memory_size   = 512

  # Placeholder - will be replaced by CI/CD
  filename         = data.archive_file.api_placeholder.output_path
  source_code_hash = data.archive_file.api_placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT           = var.environment
      COGNITO_USER_POOL_ID  = var.cognito_user_pool_id
      COGNITO_APP_CLIENT_ID = var.cognito_client_id
      DATABASE_URL          = var.database_url
    }
  }

  tags = {
    Environment = var.environment
    Project     = "grantd"
  }
}

# Placeholder zip for initial deployment
data "archive_file" "api_placeholder" {
  type        = "zip"
  output_path = "${path.module}/placeholder.zip"

  source {
    content  = "# Placeholder"
    filename = "placeholder.py"
  }
}

# Sync Worker Lambda
resource "aws_lambda_function" "sync_worker" {
  function_name = "grantd-sync-worker-${var.environment}"
  role          = aws_iam_role.lambda_role.arn
  handler       = "handler.handler"
  runtime       = "python3.11"
  timeout       = 300 # 5 minutes for sync
  memory_size   = 1024

  filename         = data.archive_file.api_placeholder.output_path
  source_code_hash = data.archive_file.api_placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT  = var.environment
      DATABASE_URL = var.database_url
    }
  }

  tags = {
    Environment = var.environment
    Project     = "grantd"
  }
}

# Drift Detector Lambda
resource "aws_lambda_function" "drift_detector" {
  function_name = "grantd-drift-detector-${var.environment}"
  role          = aws_iam_role.lambda_role.arn
  handler       = "handler.handler"
  runtime       = "python3.11"
  timeout       = 300
  memory_size   = 512

  filename         = data.archive_file.api_placeholder.output_path
  source_code_hash = data.archive_file.api_placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT  = var.environment
      DATABASE_URL = var.database_url
    }
  }

  tags = {
    Environment = var.environment
    Project     = "grantd"
  }
}

# API Gateway
resource "aws_apigatewayv2_api" "main" {
  name          = "grantd-api-${var.environment}"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = var.environment == "prod" ? [
      "https://app.grantd.io"
    ] : [
      "http://localhost:5173",
      "https://dev.grantd.io"
    ]
    allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers = ["*"]
    max_age       = 300
  }
}

# API Gateway Integration
resource "aws_apigatewayv2_integration" "lambda" {
  api_id             = aws_apigatewayv2_api.main.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.api.invoke_arn
  integration_method = "POST"
}

# API Gateway Route
resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# API Gateway Stage
resource "aws_apigatewayv2_stage" "main" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true
}

# Lambda permission for API Gateway
resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

# Outputs
output "api_endpoint" {
  value = aws_apigatewayv2_api.main.api_endpoint
}

output "api_lambda_arn" {
  value = aws_lambda_function.api.arn
}

output "sync_worker_arn" {
  value = aws_lambda_function.sync_worker.arn
}

output "drift_detector_arn" {
  value = aws_lambda_function.drift_detector.arn
}
