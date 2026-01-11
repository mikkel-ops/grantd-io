-- =============================================================================
-- GRANTD DATABASE SCHEMA - Development Credentials
-- =============================================================================
-- Version: 006
-- Description: Add encrypted_credentials column for development mode
-- =============================================================================

-- Add column for storing encrypted credentials in development mode
-- In production, credentials are stored in AWS Parameter Store
ALTER TABLE connections ADD COLUMN IF NOT EXISTS encrypted_credentials TEXT;
