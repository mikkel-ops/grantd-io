-- =============================================================================
-- GRANTD DATABASE SCHEMA - Initial Migration
-- =============================================================================
-- Version: 001
-- Database: PlanetScale PostgreSQL
-- =============================================================================

-- =============================================================================
-- MULTI-TENANT LAYER
-- =============================================================================

-- Organizations (tenants)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organization members
CREATE TABLE org_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    cognito_user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',  -- owner, admin, member, viewer
    invited_by TEXT,
    invited_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, cognito_user_id)
);

CREATE INDEX idx_org_members_cognito ON org_members(cognito_user_id);

-- Pending invitations
CREATE TABLE org_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    invited_by TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, email)
);
