-- =============================================================================
-- GRANTD DATABASE SCHEMA - Audit & Compliance
-- =============================================================================
-- Version: 005
-- =============================================================================

-- Audit log
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    connection_id UUID REFERENCES connections(id) ON DELETE SET NULL,

    actor_user_id TEXT,
    actor_email TEXT,
    actor_ip_address INET,

    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id UUID,
    resource_name TEXT,

    details JSONB,
    sql_executed TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_org ON audit_log(org_id, created_at DESC);
CREATE INDEX idx_audit_log_action ON audit_log(action, created_at DESC);

-- Drift events
CREATE TABLE drift_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,

    detected_at TIMESTAMPTZ DEFAULT NOW(),
    drift_type TEXT NOT NULL,
    object_type TEXT NOT NULL,
    object_name TEXT NOT NULL,

    previous_state JSONB,
    current_state JSONB,

    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by TEXT,
    acknowledged_at TIMESTAMPTZ,
    resolution_note TEXT
);

CREATE INDEX idx_drift_events_unacknowledged ON drift_events(connection_id, acknowledged)
WHERE acknowledged = FALSE;

-- Sync runs
CREATE TABLE sync_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,

    status TEXT NOT NULL DEFAULT 'running',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    triggered_by TEXT,

    users_synced INT DEFAULT 0,
    roles_synced INT DEFAULT 0,
    grants_synced INT DEFAULT 0,
    databases_synced INT DEFAULT 0,
    schemas_synced INT DEFAULT 0,
    tables_synced INT DEFAULT 0,
    drift_detected INT DEFAULT 0,

    error_message TEXT,
    error_details JSONB
);

CREATE INDEX idx_sync_runs_connection ON sync_runs(connection_id, started_at DESC);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_connections_updated_at
    BEFORE UPDATE ON connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_changesets_updated_at
    BEFORE UPDATE ON changesets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
