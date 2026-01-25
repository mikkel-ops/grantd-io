-- =============================================================================
-- GRANTD DATABASE SCHEMA - Role Type and Sync Progress
-- =============================================================================
-- Version: 007
-- =============================================================================

-- Add role_type column to platform_roles
-- Values: 'functional', 'business', 'hybrid'
ALTER TABLE platform_roles ADD COLUMN IF NOT EXISTS role_type TEXT;

-- Add sync progress tracking columns to sync_runs
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS current_step TEXT;
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS total_steps INTEGER DEFAULT 8;
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS current_step_number INTEGER DEFAULT 0;
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS step_progress TEXT;  -- JSON string with step details

-- Create index for faster role type filtering
CREATE INDEX IF NOT EXISTS idx_platform_roles_type ON platform_roles(role_type);
