variable "environment" {
  description = "Environment name"
  type        = string
}

variable "sync_worker_arn" {
  description = "Sync worker Lambda ARN"
  type        = string
}

variable "drift_detector_arn" {
  description = "Drift detector Lambda ARN"
  type        = string
}

# Hourly sync schedule
resource "aws_cloudwatch_event_rule" "hourly_sync" {
  name                = "grantd-hourly-sync-${var.environment}"
  description         = "Trigger sync for all active connections every hour"
  schedule_expression = "rate(1 hour)"

  tags = {
    Environment = var.environment
    Project     = "grantd"
  }
}

resource "aws_cloudwatch_event_target" "sync_worker" {
  rule      = aws_cloudwatch_event_rule.hourly_sync.name
  target_id = "SyncWorker"
  arn       = var.sync_worker_arn

  input = jsonencode({
    trigger = "scheduled"
  })
}

resource "aws_lambda_permission" "allow_eventbridge_sync" {
  statement_id  = "AllowEventBridgeSync"
  action        = "lambda:InvokeFunction"
  function_name = split(":", var.sync_worker_arn)[6]
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.hourly_sync.arn
}

# Daily drift detection schedule
resource "aws_cloudwatch_event_rule" "daily_drift" {
  name                = "grantd-daily-drift-${var.environment}"
  description         = "Run drift detection daily"
  schedule_expression = "rate(1 day)"

  tags = {
    Environment = var.environment
    Project     = "grantd"
  }
}

resource "aws_cloudwatch_event_target" "drift_detector" {
  rule      = aws_cloudwatch_event_rule.daily_drift.name
  target_id = "DriftDetector"
  arn       = var.drift_detector_arn

  input = jsonencode({
    trigger = "scheduled"
  })
}

resource "aws_lambda_permission" "allow_eventbridge_drift" {
  statement_id  = "AllowEventBridgeDrift"
  action        = "lambda:InvokeFunction"
  function_name = split(":", var.drift_detector_arn)[6]
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.daily_drift.arn
}
