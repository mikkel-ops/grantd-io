-- =============================================================================
-- GRANTD DATABASE SCHEMA - Platform Objects
-- =============================================================================
-- Version: 003
-- =============================================================================

-- Users (platform-agnostic)
CREATE TABLE platform_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,

    -- Common fields
    name TEXT NOT NULL,
    email TEXT,
    display_name TEXT,
    disabled BOOLEAN DEFAULT FALSE,
    created_on TIMESTAMPTZ,

    -- Platform-specific data
    platform_data JSONB DEFAULT '{}',
    -- Snowflake: { login_name, default_warehouse, default_role, has_password, has_rsa_key }

    synced_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(connection_id, name)
);

CREATE INDEX idx_platform_users_connection ON platform_users(connection_id);

-- Roles / Groups (platform-agnostic)
CREATE TABLE platform_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,

    -- Common fields
    name TEXT NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT FALSE,  -- Built-in roles like ACCOUNTADMIN
    created_on TIMESTAMPTZ,

    -- Computed
    member_count INT DEFAULT 0,
    grant_count INT DEFAULT 0,

    -- Platform-specific data
    platform_data JSONB DEFAULT '{}',
    -- Snowflake: { owner, is_inherited }

    synced_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(connection_id, name)
);

CREATE INDEX idx_platform_roles_connection ON platform_roles(connection_id);

-- Role assignments (user to role, role to role)
CREATE TABLE role_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,

    role_name TEXT NOT NULL,
    assignee_type TEXT NOT NULL,  -- 'user' or 'role'
    assignee_name TEXT NOT NULL,
    assigned_by TEXT,
    created_on TIMESTAMPTZ,

    platform_data JSONB DEFAULT '{}',
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(connection_id, role_name, assignee_type, assignee_name)
);

CREATE INDEX idx_role_assignments_connection ON role_assignments(connection_id);
CREATE INDEX idx_role_assignments_role ON role_assignments(role_name);

-- Databases / Projects / Catalogs
CREATE TABLE platform_databases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,

    name TEXT NOT NULL,
    description TEXT,
    owner TEXT,
    created_on TIMESTAMPTZ,

    platform_data JSONB DEFAULT '{}',
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(connection_id, name)
);

-- Schemas / Datasets
CREATE TABLE platform_schemas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    database_id UUID REFERENCES platform_databases(id) ON DELETE CASCADE,

    name TEXT NOT NULL,
    database_name TEXT NOT NULL,
    description TEXT,
    owner TEXT,
    created_on TIMESTAMPTZ,

    platform_data JSONB DEFAULT '{}',
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(connection_id, database_name, name)
);

CREATE INDEX idx_platform_schemas_database ON platform_schemas(database_id);

-- Tables
CREATE TABLE platform_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    schema_id UUID REFERENCES platform_schemas(id) ON DELETE CASCADE,

    name TEXT NOT NULL,
    database_name TEXT NOT NULL,
    schema_name TEXT NOT NULL,
    table_type TEXT,
    owner TEXT,
    row_count BIGINT,
    size_bytes BIGINT,
    created_on TIMESTAMPTZ,

    platform_data JSONB DEFAULT '{}',
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(connection_id, database_name, schema_name, name)
);

-- Warehouses / Clusters / Compute
CREATE TABLE platform_warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,

    name TEXT NOT NULL,
    size TEXT,
    state TEXT,
    owner TEXT,

    platform_data JSONB DEFAULT '{}',
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(connection_id, name)
);

-- Grants / Permissions
CREATE TABLE platform_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,

    -- Grant details
    privilege TEXT NOT NULL,
    object_type TEXT NOT NULL,
    object_name TEXT,
    object_database TEXT,
    object_schema TEXT,

    grantee_type TEXT NOT NULL,  -- 'role' or 'user'
    grantee_name TEXT NOT NULL,

    with_grant_option BOOLEAN DEFAULT FALSE,
    granted_by TEXT,
    created_on TIMESTAMPTZ,

    platform_data JSONB DEFAULT '{}',
    synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_platform_grants_connection ON platform_grants(connection_id);
CREATE INDEX idx_platform_grants_grantee ON platform_grants(grantee_name);
CREATE INDEX idx_platform_grants_object ON platform_grants(object_type, object_name);
