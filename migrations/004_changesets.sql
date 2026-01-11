-- =============================================================================
-- GRANTD DATABASE SCHEMA - Change Management
-- =============================================================================
-- Version: 004
-- =============================================================================

-- Changesets
CREATE TABLE changesets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,

    title TEXT,
    description TEXT,
    created_by TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'draft',
    -- draft, pending_review, approved, applied, failed, cancelled

    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    review_comment TEXT,

    applied_at TIMESTAMPTZ,
    applied_by_username TEXT,
    applied_via TEXT,  -- cli, manual, worksheet

    changes_count INT DEFAULT 0,
    sql_statements_count INT DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_changesets_connection ON changesets(connection_id);
CREATE INDEX idx_changesets_status ON changesets(status);

-- Individual changes
CREATE TABLE changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    changeset_id UUID NOT NULL REFERENCES changesets(id) ON DELETE CASCADE,

    change_type TEXT NOT NULL,
    -- create_role, drop_role, rename_role
    -- grant_role, revoke_role
    -- grant_privilege, revoke_privilege
    -- create_user, alter_user, drop_user

    object_type TEXT NOT NULL,
    object_name TEXT NOT NULL,

    details JSONB NOT NULL,
    sql_statement TEXT NOT NULL,
    execution_order INT NOT NULL,

    status TEXT DEFAULT 'pending',
    error_message TEXT,
    executed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_changes_changeset ON changes(changeset_id);

-- =============================================================================
-- DRAFT STATE
-- =============================================================================

-- Draft roles
CREATE TABLE draft_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    changeset_id UUID REFERENCES changesets(id) ON DELETE SET NULL,

    name TEXT NOT NULL,
    description TEXT,

    status TEXT DEFAULT 'draft',
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Draft role assignments
CREATE TABLE draft_role_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    changeset_id UUID REFERENCES changesets(id) ON DELETE SET NULL,

    role_name TEXT NOT NULL,
    assignee_type TEXT NOT NULL,
    assignee_name TEXT NOT NULL,

    action TEXT NOT NULL DEFAULT 'grant',  -- grant, revoke

    status TEXT DEFAULT 'draft',
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Draft grants
CREATE TABLE draft_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    changeset_id UUID REFERENCES changesets(id) ON DELETE SET NULL,

    privilege TEXT NOT NULL,
    object_type TEXT NOT NULL,
    object_name TEXT,
    object_database TEXT,
    object_schema TEXT,
    grantee_name TEXT NOT NULL,
    with_grant_option BOOLEAN DEFAULT FALSE,

    action TEXT NOT NULL DEFAULT 'grant',  -- grant, revoke

    status TEXT DEFAULT 'draft',
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
