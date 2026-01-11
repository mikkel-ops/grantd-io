-- =============================================================================
-- GRANTD DATABASE SCHEMA - Connections
-- =============================================================================
-- Version: 002
-- =============================================================================

-- Platform connections
CREATE TABLE connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    platform TEXT NOT NULL,  -- snowflake (only snowflake for MVP)

    -- Connection details (platform-specific)
    connection_config JSONB NOT NULL,
    -- Snowflake: { account_identifier, warehouse }

    -- Credentials stored in AWS Parameter Store
    credential_param_path TEXT NOT NULL,

    -- Sync settings
    sync_enabled BOOLEAN DEFAULT TRUE,
    sync_interval_minutes INT DEFAULT 60,
    last_sync_at TIMESTAMPTZ,
    last_sync_status TEXT,
    last_sync_error TEXT,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT
);

CREATE INDEX idx_connections_org ON connections(org_id);
