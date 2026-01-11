# Grantd Product Manifest

## Version 1.0 – January 2026

---

## 1. Executive Summary

**Grantd** is an open source platform for visual Role-Based Access Control (RBAC) management across modern data platforms. It gives data teams visibility into users, roles, and permissions without storing privileged credentials.

**Core Principles:**
- **Zero-trust**: Customers retain full control over write credentials
- **Transparency**: All SQL is generated visibly and reviewed before execution
- **Open source first**: Community-driven development with commercial managed offering
- **Platform-agnostic**: Snowflake first, with Databricks, BigQuery, and Redshift on the roadmap

**Tagline:** *"Access control, finally understood."*

---

## 2. Problem Statement

### Current Pain Points

| Problem | Consequence |
|---------|-------------|
| Native RBAC UIs are inadequate | No one knows who has access to what |
| No visual role hierarchy | Over-privileged users go undetected |
| Changes happen ad-hoc via SQL | No audit trail, no approval process |
| Compliance requires documentation | Manual process, error-prone |
| Onboarding/offboarding is manual | Security gaps when people leave |

### Target Users

| Persona | Needs |
|---------|-------|
| Data Platform Engineer | Visibility, automation, less manual work |
| Security/Compliance | Audit logs, documentation, least privilege |
| Data Team Lead | Approve access, onboard new team members |
| CTO/CISO | Confidence that data is protected |

### Target Platforms

| Platform | Status | Priority |
|----------|--------|----------|
| Snowflake | MVP | P0 |
| Databricks | Planned | P1 |
| BigQuery | Planned | P2 |
| Redshift | Planned | P3 |

---

## 3. Solution Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                             Grantd                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐              │
│   │    SYNC     │     │   MANAGE    │     │    APPLY    │              │
│   │             │     │             │     │             │              │
│   │  Read-only  │     │  Visual UI  │     │ SQL export  │              │
│   │  service    │────>│  for RBAC   │────>│  or CLI     │              │
│   │  account    │     │ management  │     │ execution   │              │
│   │             │     │             │     │             │              │
│   └─────────────┘     └─────────────┘     └─────────────┘              │
│         │                   │                   │                       │
│         ▼                   ▼                   ▼                       │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                    AUDIT & COMPLIANCE                           │  │
│   │  • Full history of all changes                                 │  │
│   │  • Drift detection when someone changes outside Grantd         │  │
│   │  • Compliance reports for SOC2, ISO27001                       │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Security Model

### Trust Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      CUSTOMER ENVIRONMENT                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                    Data Platform Account                        │  │
│   │                    (Snowflake/Databricks/etc.)                  │  │
│   │                                                                 │  │
│   │   ┌─────────────────┐          ┌─────────────────┐             │  │
│   │   │ GRANTD_         │          │ Customer's own  │             │  │
│   │   │ READONLY        │          │ admin user      │             │  │
│   │   │                 │          │                 │             │  │
│   │   │ • SHOW commands │          │ • CREATE/GRANT  │             │  │
│   │   │ • SELECT meta   │          │ • Runs SQL from │             │  │
│   │   │ • NO write      │          │   Grantd        │             │  │
│   │   └────────┬────────┘          └────────┬────────┘             │  │
│   │            │                            │                       │  │
│   └────────────┼────────────────────────────┼───────────────────────┘  │
│                │                            │                          │
│                │ Key-pair auth              │ MFA + password           │
│                │                            │                          │
└────────────────┼────────────────────────────┼──────────────────────────┘
                 │                            │
                 ▼                            │
┌────────────────────────────────┐            │
│          Grantd App            │            │
├────────────────────────────────┤            │
│                                │            │
│  HAS:                          │            │
│  • Read-only credentials       │            │
│  • Metadata (users, roles)     │            │
│                                │            │
│  DOES NOT HAVE:                │            │
│  • Write credentials           │            │
│  • Access to customer data     │            │
│  • Ability to modify anything  │            │
│                                │            │
│  GENERATES:                    │            │
│  • SQL for changes ───────────────────────> │
│  • Changeset for review        │  (customer executes)
│                                │            │
└────────────────────────────────┘            │
                                              │
┌─────────────────────────────────────────────┼──────────────────────────┐
│                  CLI (on customer's machine) │                         │
├─────────────────────────────────────────────┼──────────────────────────┤
│                                             │                          │
│  $ grantd apply <changeset>                 │                          │
│                                             │                          │
│  1. Fetches SQL from Grantd API             │                          │
│  2. Shows preview to user                   │                          │
│  3. User enters OWN credentials ────────────┘                          │
│  4. CLI runs SQL directly against platform                             │
│  5. Credentials stay on customer's machine                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Credentials Matrix

| Credential | Stored Where | Used For |
|------------|--------------|----------|
| Read-only key-pair | Grantd (AWS Parameter Store, encrypted) | Sync metadata |
| Write credentials | NEVER at Grantd | N/A |
| Customer's personal login | Customer's machine | Execute changes |

### Permissions Comparison (Snowflake Example)

| Action | GRANTD_READONLY | Customer's Admin |
|--------|-----------------|------------------|
| SHOW USERS | ✅ | ✅ |
| SHOW ROLES | ✅ | ✅ |
| SHOW GRANTS | ✅ | ✅ |
| SHOW DATABASES | ✅ | ✅ |
| SELECT from tables | ❌ | ✅ |
| CREATE USER | ❌ | ✅ |
| CREATE ROLE | ❌ | ✅ |
| GRANT privileges | ❌ | ✅ |
| DROP anything | ❌ | ✅ |

---

## 5. Technical Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              USERS                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│         Browser                              CLI                        │
│            │                                  │                         │
│            ▼                                  ▼                         │
│   ┌─────────────────┐                ┌─────────────────┐               │
│   │  Vercel/S3+CF   │                │  PyPI package   │               │
│   │  (Frontend)     │                │  grantd-cli     │               │
│   └────────┬────────┘                └────────┬────────┘               │
│            │                                  │                         │
└────────────┼──────────────────────────────────┼─────────────────────────┘
             │                                  │
             │ HTTPS                            │ HTTPS
             ▼                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              AWS                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                       AWS Cognito                               │  │
│   │                                                                 │  │
│   │  • User Pool (email + password)                                │  │
│   │  • Custom attributes (org_id, role)                            │  │
│   │  • JWT tokens for API auth                                     │  │
│   │  • Post-confirmation trigger → create org                      │  │
│   │                                                                 │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                    │                                    │
│                                    │ JWT Token                          │
│                                    ▼                                    │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                 API Gateway + Lambda                            │  │
│   │                                                                 │  │
│   │   ┌─────────────────────────────────────────────────────────┐  │  │
│   │   │                 FastAPI + Mangum                        │  │  │
│   │   │                                                         │  │  │
│   │   │  /api/v1/                                               │  │  │
│   │   │    ├── auth/          (Cognito verification)           │  │  │
│   │   │    ├── organizations/ (multi-tenant)                   │  │  │
│   │   │    ├── connections/   (platform connections)           │  │  │
│   │   │    ├── sync/          (trigger/status)                 │  │  │
│   │   │    ├── objects/       (users, roles, grants)           │  │  │
│   │   │    ├── changesets/    (drafts, pending, applied)       │  │  │
│   │   │    └── audit/         (logs, compliance)               │  │  │
│   │   │                                                         │  │  │
│   │   └─────────────────────────────────────────────────────────┘  │  │
│   │                              │                                  │  │
│   └──────────────────────────────┼──────────────────────────────────┘  │
│                                  │                                      │
│                    ┌─────────────┼─────────────┐                       │
│                    │             │             │                        │
│                    ▼             ▼             ▼                        │
│   ┌──────────────────┐ ┌──────────────┐ ┌──────────────────┐          │
│   │  AWS Parameter   │ │  EventBridge │ │   Lambda         │          │
│   │  Store           │ │  Scheduler   │ │   (Background)   │          │
│   │                  │ │              │ │                  │          │
│   │  • Platform keys │ │  • Hourly    │ │  • Sync worker   │          │
│   │  • Encrypted     │ │    sync      │ │  • Drift detect  │          │
│   │                  │ │              │ │  • Alerts        │          │
│   └──────────────────┘ └──────────────┘ └──────────────────┘          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ HTTPS
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     PlanetScale (eu-central-1)                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  PostgreSQL                                                             │
│  • Database branching for safe migrations                              │
│  • Non-blocking schema changes                                         │
│  • Query insights & analytics                                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ Platform connectors (read-only)
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    CUSTOMER DATA PLATFORMS                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐          │
│   │ Snowflake │  │Databricks │  │ BigQuery  │  │ Redshift  │          │
│   │    ✅     │  │  planned  │  │  planned  │  │  planned  │          │
│   └───────────┘  └───────────┘  └───────────┘  └───────────┘          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Frontend** | React + Vite | Standard, excellent tooling |
| **UI Components** | Shadcn/ui + Tailwind | Fast, beautiful, customizable |
| **Hosting (Frontend)** | Vercel (MVP) → S3+CF (BYOC) | DX first, portability later |
| **Auth** | AWS Cognito | AWS-native, free tier 50K MAU, enterprise-ready |
| **Backend** | FastAPI + Mangum | Python strength, Lambda-ready |
| **API Gateway** | AWS API Gateway | Cognito authorizer integration |
| **Hosting (Backend)** | AWS Lambda | Cheap, scalable |
| **Database** | PlanetScale Postgres | Branching, non-blocking migrations, EU region |
| **Secrets** | AWS Parameter Store | Free, encrypted, Terraform-ready |
| **Background Jobs** | AWS EventBridge + Lambda | Scheduled sync, drift detection |
| **IaC** | Terraform | BYOC-ready from day 1 |
| **CI/CD** | GitHub Actions | Standard, free for open source |
| **CLI** | Python (Typer) | Matches backend, excellent DX |
| **Snowflake connector** | snowflake-connector-python | Official SDK |

### Monorepo Structure

```
grantd/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── CONTRIBUTING.md
│   ├── CODE_OF_CONDUCT.md
│   └── workflows/
│       ├── ci.yml
│       ├── deploy-api.yml
│       └── deploy-web.yml
│
├── apps/
│   ├── web/                          # Frontend
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── ui/               # Shadcn components
│   │   │   │   ├── auth/
│   │   │   │   ├── dashboard/
│   │   │   │   ├── roles/
│   │   │   │   ├── users/
│   │   │   │   └── changesets/
│   │   │   ├── pages/
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   └── types/
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   └── tailwind.config.js
│   │
│   └── api/                          # Backend
│       ├── src/
│       │   ├── main.py               # FastAPI app
│       │   ├── config.py
│       │   ├── dependencies.py
│       │   ├── auth/
│       │   │   ├── cognito.py
│       │   │   └── permissions.py
│       │   ├── routers/
│       │   │   ├── auth.py
│       │   │   ├── organizations.py
│       │   │   ├── connections.py
│       │   │   ├── sync.py
│       │   │   ├── objects.py
│       │   │   ├── changesets.py
│       │   │   └── audit.py
│       │   ├── services/
│       │   │   ├── sync/
│       │   │   │   ├── base.py       # Abstract sync interface
│       │   │   │   ├── snowflake.py
│       │   │   │   ├── databricks.py # Future
│       │   │   │   └── bigquery.py   # Future
│       │   │   ├── sql_generator.py
│       │   │   ├── diff_engine.py
│       │   │   └── notification.py
│       │   ├── models/
│       │   │   ├── database.py
│       │   │   └── schemas.py
│       │   └── utils/
│       ├── tests/
│       ├── requirements.txt
│       └── Dockerfile
│
├── packages/
│   └── cli/                          # CLI tool
│       ├── grantd_cli/
│       │   ├── __init__.py
│       │   ├── main.py
│       │   ├── commands/
│       │   │   ├── setup.py
│       │   │   ├── sync.py
│       │   │   ├── apply.py
│       │   │   ├── diff.py
│       │   │   └── status.py
│       │   └── utils/
│       │       ├── api.py
│       │       ├── auth.py
│       │       └── platforms/
│       │           ├── base.py
│       │           ├── snowflake.py
│       │           └── databricks.py  # Future
│       ├── pyproject.toml
│       └── README.md
│
├── infra/                            # Terraform
│   ├── modules/
│   │   ├── cognito/
│   │   ├── lambda/
│   │   ├── api-gateway/
│   │   ├── s3-cloudfront/
│   │   ├── parameter-store/
│   │   └── eventbridge/
│   ├── environments/
│   │   ├── dev/
│   │   ├── staging/
│   │   └── prod/
│   └── main.tf
│
├── lambdas/                          # Standalone Lambda functions
│   ├── post_confirmation/
│   ├── sync_worker/
│   └── drift_detector/
│
├── migrations/                       # PlanetScale migrations
│   ├── 001_initial_schema.sql
│   ├── 002_platform_objects.sql
│   ├── 003_changesets.sql
│   └── 004_audit.sql
│
├── docs/
│   ├── getting-started.md
│   ├── architecture.md
│   ├── security.md
│   ├── api.md
│   ├── platforms/
│   │   ├── snowflake.md
│   │   ├── databricks.md
│   │   └── bigquery.md
│   └── self-hosting.md
│
├── docker-compose.yml                # Local dev
├── README.md
├── LICENSE                           # Apache 2.0
├── SECURITY.md
└── CHANGELOG.md
```

---

## 6. AWS Cognito Configuration

### Cognito User Pool (Terraform)

```hcl
# infra/modules/cognito/main.tf

resource "aws_cognito_user_pool" "main" {
  name = "grantd-${var.environment}"

  # Username configuration
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # Password policy
  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = false
    require_uppercase                = true
    temporary_password_validity_days = 7
  }

  # MFA configuration
  mfa_configuration = "OPTIONAL"
  
  software_token_mfa_configuration {
    enabled = true
  }

  # Custom attributes for multi-tenancy
  schema {
    name                     = "org_id"
    attribute_data_type      = "String"
    mutable                  = true
    required                 = false
    
    string_attribute_constraints {
      min_length = 36
      max_length = 36
    }
  }

  schema {
    name                     = "role"
    attribute_data_type      = "String"
    mutable                  = true
    required                 = false
    
    string_attribute_constraints {
      min_length = 1
      max_length = 20
    }
  }

  # Account recovery
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Lambda triggers
  lambda_config {
    post_confirmation = aws_lambda_function.post_confirmation.arn
  }

  tags = {
    Environment = var.environment
    Project     = "grantd"
  }
}

# App client for web application
resource "aws_cognito_user_pool_client" "web" {
  name         = "grantd-web-${var.environment}"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret               = false
  prevent_user_existence_errors = "ENABLED"

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  callback_urls = var.environment == "prod" ? [
    "https://app.grantd.io/auth/callback"
  ] : [
    "http://localhost:5173/auth/callback",
    "https://dev.grantd.io/auth/callback"
  ]

  access_token_validity  = 1    # hours
  id_token_validity      = 1    # hours
  refresh_token_validity = 30   # days

  read_attributes = [
    "email",
    "email_verified",
    "custom:org_id",
    "custom:role",
  ]
}

# App client for CLI
resource "aws_cognito_user_pool_client" "cli" {
  name         = "grantd-cli-${var.environment}"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret               = false
  prevent_user_existence_errors = "ENABLED"

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  access_token_validity  = 8    # hours (longer for CLI sessions)
  refresh_token_validity = 90   # days
}

# Outputs
output "user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "web_client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "cli_client_id" {
  value = aws_cognito_user_pool_client.cli.id
}
```

### Post-Confirmation Lambda

```python
# lambdas/post_confirmation/handler.py

import boto3
import os
import uuid
import psycopg2
from psycopg2.extras import RealDictCursor

def get_db_connection():
    """Create connection to PlanetScale."""
    return psycopg2.connect(
        host=os.environ['PLANETSCALE_HOST'],
        user=os.environ['PLANETSCALE_USER'],
        password=os.environ['PLANETSCALE_PASSWORD'],
        database=os.environ['PLANETSCALE_DATABASE'],
        sslmode='require',
    )

def handler(event, context):
    """
    Triggered after user confirms their email.
    Creates a personal organization for the new user.
    """
    user_attributes = event['request']['userAttributes']
    cognito_user_id = user_attributes['sub']
    email = user_attributes['email']
    
    # Generate org details
    org_id = str(uuid.uuid4())
    email_prefix = email.split('@')[0].lower()
    org_slug = email_prefix.replace('.', '-').replace('+', '-')[:50]
    
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    try:
        # Check if slug exists
        cursor.execute(
            "SELECT slug FROM organizations WHERE slug LIKE %s",
            (f"{org_slug}%",)
        )
        existing_slugs = [row['slug'] for row in cursor.fetchall()]
        
        if org_slug in existing_slugs:
            counter = 1
            while f"{org_slug}-{counter}" in existing_slugs:
                counter += 1
            org_slug = f"{org_slug}-{counter}"
        
        # Create organization
        cursor.execute(
            """
            INSERT INTO organizations (id, name, slug)
            VALUES (%s, %s, %s)
            """,
            (org_id, f"{email}'s Workspace", org_slug)
        )
        
        # Add user as owner
        cursor.execute(
            """
            INSERT INTO org_members (id, org_id, cognito_user_id, email, role)
            VALUES (%s, %s, %s, %s, 'owner')
            """,
            (str(uuid.uuid4()), org_id, cognito_user_id, email)
        )
        
        conn.commit()
        
        # Update Cognito user attributes
        cognito = boto3.client('cognito-idp')
        cognito.admin_update_user_attributes(
            UserPoolId=os.environ['COGNITO_USER_POOL_ID'],
            Username=event['userName'],
            UserAttributes=[
                {'Name': 'custom:org_id', 'Value': org_id},
                {'Name': 'custom:role', 'Value': 'owner'},
            ]
        )
        
    except Exception as e:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()
    
    return event
```

---

## 7. Database Schema (PlanetScale Postgres)

```sql
-- =============================================================================
-- GRANTD DATABASE SCHEMA
-- =============================================================================
-- Version: 1.0.0
-- Database: PlanetScale PostgreSQL
-- Auth: AWS Cognito (external)
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

-- =============================================================================
-- PLATFORM CONNECTIONS
-- =============================================================================

-- Supported platforms enum
CREATE TYPE platform_type AS ENUM ('snowflake', 'databricks', 'bigquery', 'redshift');

-- Platform connections
CREATE TABLE connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    platform platform_type NOT NULL,
    
    -- Connection details (platform-specific)
    connection_config JSONB NOT NULL,
    -- Snowflake: { account_identifier, warehouse }
    -- Databricks: { workspace_url, http_path }
    -- BigQuery: { project_id, dataset }
    -- Redshift: { cluster_identifier, database }
    
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

-- =============================================================================
-- PLATFORM OBJECTS (SYNCED STATE)
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
    -- Databricks: { user_id, active, groups }
    -- BigQuery: { iam_email, type }
    
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
    -- Databricks: { group_id, entitlements }
    -- BigQuery: { role_id, stage }
    
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

-- Views
CREATE TABLE platform_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    schema_id UUID REFERENCES platform_schemas(id) ON DELETE CASCADE,
    
    name TEXT NOT NULL,
    database_name TEXT NOT NULL,
    schema_name TEXT NOT NULL,
    view_type TEXT,
    owner TEXT,
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

-- =============================================================================
-- CHANGE MANAGEMENT
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

-- =============================================================================
-- AUDIT & COMPLIANCE
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
```

---

## 8. Platform Abstraction Layer

### Base Sync Interface

```python
# apps/api/src/services/sync/base.py

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

@dataclass
class SyncResult:
    users: int = 0
    roles: int = 0
    grants: int = 0
    databases: int = 0
    schemas: int = 0
    tables: int = 0
    errors: List[str] = None

@dataclass
class PlatformUser:
    name: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    disabled: bool = False
    created_on: Optional[str] = None
    platform_data: Dict[str, Any] = None

@dataclass
class PlatformRole:
    name: str
    description: Optional[str] = None
    is_system: bool = False
    created_on: Optional[str] = None
    platform_data: Dict[str, Any] = None

@dataclass
class PlatformGrant:
    privilege: str
    object_type: str
    object_name: Optional[str]
    grantee_type: str
    grantee_name: str
    with_grant_option: bool = False
    platform_data: Dict[str, Any] = None


class PlatformConnector(ABC):
    """Abstract base class for platform connectors."""
    
    @abstractmethod
    async def test_connection(self) -> bool:
        """Test if connection is valid."""
        pass
    
    @abstractmethod
    async def sync_users(self) -> List[PlatformUser]:
        """Fetch all users from platform."""
        pass
    
    @abstractmethod
    async def sync_roles(self) -> List[PlatformRole]:
        """Fetch all roles/groups from platform."""
        pass
    
    @abstractmethod
    async def sync_role_assignments(self) -> List[Dict]:
        """Fetch role-to-user and role-to-role assignments."""
        pass
    
    @abstractmethod
    async def sync_grants(self) -> List[PlatformGrant]:
        """Fetch all grants/permissions."""
        pass
    
    @abstractmethod
    async def sync_databases(self) -> List[Dict]:
        """Fetch databases/projects/catalogs."""
        pass
    
    @abstractmethod
    async def sync_schemas(self) -> List[Dict]:
        """Fetch schemas/datasets."""
        pass
    
    @abstractmethod
    async def sync_tables(self) -> List[Dict]:
        """Fetch tables."""
        pass
    
    @abstractmethod
    def generate_create_role_sql(self, role_name: str, **kwargs) -> str:
        """Generate SQL to create a role."""
        pass
    
    @abstractmethod
    def generate_grant_role_sql(
        self, 
        role_name: str, 
        grantee: str, 
        grantee_type: str
    ) -> str:
        """Generate SQL to grant a role."""
        pass
    
    @abstractmethod
    def generate_grant_privilege_sql(
        self,
        privilege: str,
        object_type: str,
        object_name: str,
        grantee: str,
        **kwargs
    ) -> str:
        """Generate SQL to grant a privilege."""
        pass
```

### Snowflake Connector

```python
# apps/api/src/services/sync/snowflake.py

import snowflake.connector
from typing import List, Dict, Any
from .base import (
    PlatformConnector, 
    PlatformUser, 
    PlatformRole, 
    PlatformGrant,
    SyncResult
)

class SnowflakeConnector(PlatformConnector):
    """Snowflake-specific implementation."""
    
    def __init__(
        self,
        account: str,
        user: str,
        private_key: str,
        warehouse: str = None,
        role: str = "GRANTD_READONLY"
    ):
        self.account = account
        self.user = user
        self.private_key = private_key
        self.warehouse = warehouse
        self.role = role
        self._conn = None
    
    def _get_connection(self):
        if self._conn is None:
            self._conn = snowflake.connector.connect(
                account=self.account,
                user=self.user,
                private_key=self.private_key,
                warehouse=self.warehouse,
                role=self.role,
            )
        return self._conn
    
    async def test_connection(self) -> bool:
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT CURRENT_VERSION()")
            return True
        except Exception:
            return False
    
    async def sync_users(self) -> List[PlatformUser]:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SHOW USERS")
        
        users = []
        for row in cursor.fetchall():
            users.append(PlatformUser(
                name=row[0],
                email=row[4] if len(row) > 4 else None,
                display_name=row[2] if len(row) > 2 else None,
                disabled=row[9] if len(row) > 9 else False,
                created_on=str(row[1]) if len(row) > 1 else None,
                platform_data={
                    "login_name": row[1] if len(row) > 1 else None,
                    "default_warehouse": row[5] if len(row) > 5 else None,
                    "default_role": row[7] if len(row) > 7 else None,
                    "has_password": row[10] if len(row) > 10 else None,
                    "has_rsa_public_key": row[11] if len(row) > 11 else None,
                }
            ))
        return users
    
    async def sync_roles(self) -> List[PlatformRole]:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SHOW ROLES")
        
        system_roles = {
            'ACCOUNTADMIN', 'SECURITYADMIN', 'SYSADMIN', 
            'USERADMIN', 'PUBLIC', 'ORGADMIN'
        }
        
        roles = []
        for row in cursor.fetchall():
            roles.append(PlatformRole(
                name=row[1],
                is_system=row[1] in system_roles,
                created_on=str(row[0]) if row[0] else None,
                platform_data={
                    "owner": row[4] if len(row) > 4 else None,
                    "comment": row[5] if len(row) > 5 else None,
                }
            ))
        return roles
    
    async def sync_role_assignments(self) -> List[Dict]:
        conn = self._get_connection()
        cursor = conn.cursor()
        
        assignments = []
        
        # Get all roles first
        cursor.execute("SHOW ROLES")
        roles = [row[1] for row in cursor.fetchall()]
        
        # For each role, get grants
        for role in roles:
            cursor.execute(f"SHOW GRANTS OF ROLE {role}")
            for row in cursor.fetchall():
                assignments.append({
                    "role_name": role,
                    "assignee_type": row[2].lower(),  # USER or ROLE
                    "assignee_name": row[3],
                    "assigned_by": row[4] if len(row) > 4 else None,
                    "created_on": str(row[0]) if row[0] else None,
                })
        
        return assignments
    
    async def sync_grants(self) -> List[PlatformGrant]:
        conn = self._get_connection()
        cursor = conn.cursor()
        
        grants = []
        
        # Get all roles
        cursor.execute("SHOW ROLES")
        roles = [row[1] for row in cursor.fetchall()]
        
        # For each role, get privileges
        for role in roles:
            cursor.execute(f"SHOW GRANTS TO ROLE {role}")
            for row in cursor.fetchall():
                grants.append(PlatformGrant(
                    privilege=row[1],
                    object_type=row[2],
                    object_name=row[3],
                    grantee_type="role",
                    grantee_name=role,
                    with_grant_option=row[4] == "true" if len(row) > 4 else False,
                    platform_data={
                        "granted_by": row[5] if len(row) > 5 else None,
                    }
                ))
        
        return grants
    
    async def sync_databases(self) -> List[Dict]:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SHOW DATABASES")
        
        databases = []
        for row in cursor.fetchall():
            databases.append({
                "name": row[1],
                "owner": row[5] if len(row) > 5 else None,
                "comment": row[6] if len(row) > 6 else None,
                "created_on": str(row[0]) if row[0] else None,
                "platform_data": {
                    "retention_time": row[7] if len(row) > 7 else None,
                    "is_transient": row[8] if len(row) > 8 else False,
                }
            })
        return databases
    
    async def sync_schemas(self) -> List[Dict]:
        conn = self._get_connection()
        cursor = conn.cursor()
        
        schemas = []
        
        # Get all databases first
        cursor.execute("SHOW DATABASES")
        databases = [row[1] for row in cursor.fetchall()]
        
        for db in databases:
            try:
                cursor.execute(f"SHOW SCHEMAS IN DATABASE {db}")
                for row in cursor.fetchall():
                    schemas.append({
                        "name": row[1],
                        "database_name": db,
                        "owner": row[4] if len(row) > 4 else None,
                        "created_on": str(row[0]) if row[0] else None,
                    })
            except Exception:
                # Skip databases we don't have access to
                pass
        
        return schemas
    
    async def sync_tables(self) -> List[Dict]:
        # Similar implementation
        pass
    
    # SQL Generation
    
    def generate_create_role_sql(self, role_name: str, **kwargs) -> str:
        comment = kwargs.get("comment", "")
        sql = f"CREATE ROLE IF NOT EXISTS {role_name}"
        if comment:
            sql += f" COMMENT = '{comment}'"
        return sql + ";"
    
    def generate_grant_role_sql(
        self, 
        role_name: str, 
        grantee: str, 
        grantee_type: str
    ) -> str:
        grantee_type = grantee_type.upper()
        return f"GRANT ROLE {role_name} TO {grantee_type} {grantee};"
    
    def generate_revoke_role_sql(
        self,
        role_name: str,
        grantee: str,
        grantee_type: str
    ) -> str:
        grantee_type = grantee_type.upper()
        return f"REVOKE ROLE {role_name} FROM {grantee_type} {grantee};"
    
    def generate_grant_privilege_sql(
        self,
        privilege: str,
        object_type: str,
        object_name: str,
        grantee: str,
        **kwargs
    ) -> str:
        sql = f"GRANT {privilege} ON {object_type} {object_name} TO ROLE {grantee}"
        if kwargs.get("with_grant_option"):
            sql += " WITH GRANT OPTION"
        return sql + ";"
    
    def generate_revoke_privilege_sql(
        self,
        privilege: str,
        object_type: str,
        object_name: str,
        grantee: str,
    ) -> str:
        return f"REVOKE {privilege} ON {object_type} {object_name} FROM ROLE {grantee};"
```

### Connector Factory

```python
# apps/api/src/services/sync/factory.py

from typing import Dict, Any
from .base import PlatformConnector
from .snowflake import SnowflakeConnector
# from .databricks import DatabricksConnector  # Future
# from .bigquery import BigQueryConnector      # Future


def get_connector(
    platform: str,
    connection_config: Dict[str, Any],
    credentials: Dict[str, Any]
) -> PlatformConnector:
    """Factory function to get the appropriate connector."""
    
    if platform == "snowflake":
        return SnowflakeConnector(
            account=connection_config["account_identifier"],
            user=credentials["user"],
            private_key=credentials["private_key"],
            warehouse=connection_config.get("warehouse"),
        )
    
    elif platform == "databricks":
        raise NotImplementedError("Databricks connector coming soon")
    
    elif platform == "bigquery":
        raise NotImplementedError("BigQuery connector coming soon")
    
    elif platform == "redshift":
        raise NotImplementedError("Redshift connector coming soon")
    
    else:
        raise ValueError(f"Unknown platform: {platform}")
```

---

## 9. CLI Specification

### Installation

```bash
pip install grantd-cli
```

### Commands

```bash
$ grantd --help

Usage: grantd [OPTIONS] COMMAND [ARGS]...

  Grantd CLI - Visual RBAC for data platforms

Options:
  --version  Show version
  --help     Show help

Commands:
  login      Authenticate with Grantd
  logout     Clear stored credentials
  status     Show connection status
  setup      Generate setup SQL for a new connection
  sync       Sync platform metadata
  diff       Show pending changes
  apply      Apply a changeset
```

### Example Usage

```bash
# Setup a new Snowflake connection
$ grantd setup --platform snowflake

Grantd Connection Setup
=======================

Platform: Snowflake

? Account identifier: acme.eu-west-1
? Service account name [GRANTD_READONLY]: 
? Databases to include (comma-separated): PROD, ANALYTICS

Generating RSA key pair... ✓
  Private key: ~/.grantd/keys/acme-eu-west-1.pem
  Public key:  ~/.grantd/keys/acme-eu-west-1.pub

Setup SQL saved to: ./grantd-setup.sql

Next steps:
  1. Run grantd-setup.sql in Snowflake as ACCOUNTADMIN
  2. Run: grantd connect --platform snowflake --account acme.eu-west-1

# View pending changes
$ grantd diff --connection prod-snowflake

Pending Changes (3)
===================

Changeset: cs_abc123 (draft)
Created by: mikkel@acme.com

  + CREATE ROLE ANALYTICS_TEAM
  + GRANT ROLE ANALYTICS_TEAM TO USER alice
  + GRANT SELECT ON SCHEMA prod.analytics TO ROLE ANALYTICS_TEAM

To apply: grantd apply cs_abc123

# Apply changes
$ grantd apply cs_abc123

Fetching changeset... ✓

SQL Preview:
────────────────────────────────────────
[1/3] CREATE ROLE IF NOT EXISTS ANALYTICS_TEAM;
[2/3] GRANT ROLE ANALYTICS_TEAM TO USER ALICE;
[3/3] GRANT USAGE ON SCHEMA PROD.ANALYTICS TO ROLE ANALYTICS_TEAM;
────────────────────────────────────────

? Snowflake credentials:
  Account [acme.eu-west-1]: 
  User: mikkel@acme.com
  Auth: ● SSO (browser)
  Role [SECURITYADMIN]: 

? Execute 3 statements? [y/N]: y

Executing...
  [1/3] CREATE ROLE ✓
  [2/3] GRANT ROLE ✓
  [3/3] GRANT USAGE ✓

All statements executed successfully! ✓
```

---

## 10. Customer Setup (Snowflake)

```sql
-- ==============================================
-- Grantd Setup Script for Snowflake
-- ==============================================
-- This creates a READ-ONLY service account.
-- It CANNOT modify anything in your account.
-- ==============================================

-- 1. Create read-only role
CREATE ROLE IF NOT EXISTS GRANTD_READONLY;

-- 2. Grant access to account metadata
GRANT IMPORTED PRIVILEGES ON DATABASE SNOWFLAKE TO ROLE GRANTD_READONLY;

-- 3. Grant access to see objects (not data!)
-- Run for each database you want to include:
GRANT USAGE ON DATABASE <DATABASE_NAME> TO ROLE GRANTD_READONLY;
GRANT USAGE ON ALL SCHEMAS IN DATABASE <DATABASE_NAME> TO ROLE GRANTD_READONLY;
GRANT USAGE ON FUTURE SCHEMAS IN DATABASE <DATABASE_NAME> TO ROLE GRANTD_READONLY;

-- 4. Create service account with key-pair auth
CREATE USER IF NOT EXISTS GRANTD_SVC
    LOGIN_NAME = 'GRANTD_SVC'
    DISPLAY_NAME = 'Grantd Service Account'
    DEFAULT_ROLE = GRANTD_READONLY
    MUST_CHANGE_PASSWORD = FALSE
    RSA_PUBLIC_KEY = '<PUBLIC_KEY_FROM_GRANTD>';

-- 5. Assign role
GRANT ROLE GRANTD_READONLY TO USER GRANTD_SVC;

-- ==============================================
-- VERIFY: This user CANNOT:
-- ==============================================
-- ❌ CREATE USER
-- ❌ CREATE ROLE
-- ❌ GRANT privileges
-- ❌ SELECT from tables (only metadata)
-- ❌ ALTER or DROP anything
-- ==============================================
```

---

## 11. Open Source Strategy

### License

**Apache 2.0** - Maximum adoption, standard for infrastructure tools.

### What's Open Source (Core)

| Feature | Description |
|---------|-------------|
| Sync engine | All platform connectors |
| CLI tool | Full functionality |
| Web UI | Complete interface |
| Single connection | Per organization |
| SQL generation | All supported platforms |
| Self-hosting | Docker, Terraform modules |
| Basic audit log | 30-day retention |

### What's Commercial (Pro/Enterprise)

| Feature | Tier | Description |
|---------|------|-------------|
| Multiple connections | Pro | Connect multiple accounts |
| SSO/SAML | Pro | Enterprise authentication |
| Approval workflows | Pro | Multi-step approval process |
| Extended audit log | Pro | 1-year retention + export |
| Priority support | Pro | Email support, SLA |
| Slack integration | Enterprise | Notifications, approvals |
| Custom connectors | Enterprise | Private platform support |
| Dedicated instance | Enterprise | Single-tenant deployment |

### Repository Structure

```
github.com/grantd-io/grantd          # Main monorepo (Apache 2.0)
github.com/grantd-io/grantd-pro      # Commercial features (private)
github.com/grantd-io/helm-charts     # Kubernetes deployment
github.com/grantd-io/terraform-aws   # AWS deployment modules
```

---

## 12. Pricing

### Infrastructure Costs (Self-Hosted)

| Service | Monthly Cost |
|---------|--------------|
| PlanetScale Postgres | $15 |
| AWS Cognito | $0 (under 50K MAU) |
| AWS Lambda | ~$5 |
| AWS API Gateway | ~$5 |
| AWS Parameter Store | $0 |
| **Total** | **~$25/month** |

### Commercial Pricing

| Tier | Price | Features |
|------|-------|----------|
| **Open Source** | Free | Self-hosted, single connection, community support |
| **Pro** | $99/month | 5 connections, SSO, approval workflows, email support |
| **Team** | $299/month | 20 connections, extended audit, Slack integration |
| **Enterprise** | Custom | Unlimited, dedicated instance, custom SLA |

---

## 13. Roadmap

### Phase 1: MVP (Month 1-3)

| Feature | Platform | Priority |
|---------|----------|----------|
| Database schema | - | P0 |
| AWS Cognito setup | - | P0 |
| FastAPI backend | - | P0 |
| Snowflake sync | Snowflake | P0 |
| Web UI (view only) | - | P0 |
| Create role (draft) | Snowflake | P0 |
| SQL generation | Snowflake | P0 |
| CLI: setup | Snowflake | P1 |
| CLI: sync | Snowflake | P1 |

### Phase 2: Core (Month 4-6)

| Feature | Platform | Priority |
|---------|----------|----------|
| Edit existing roles | All | P0 |
| CLI: apply | All | P0 |
| Drift detection | All | P1 |
| Audit log | - | P1 |
| Multi-connection | - | P1 |
| Databricks connector | Databricks | P2 |

### Phase 3: Growth (Month 7-12)

| Feature | Platform | Priority |
|---------|----------|----------|
| Approval workflows | - | P0 |
| SSO/SAML | - | P0 |
| BigQuery connector | BigQuery | P1 |
| Role visualization | - | P1 |
| Slack integration | - | P2 |
| Redshift connector | Redshift | P3 |

---

## 14. Go-to-Market

### Launch Strategy

| Week | Activity |
|------|----------|
| 1-2 | Soft launch on GitHub |
| 3 | Post on r/dataengineering, dbt Slack |
| 4 | LinkedIn, Twitter launch |
| 5-6 | Reach out to 10 beta users |
| 7-8 | Iterate based on feedback |
| 9-10 | Product Hunt launch |
| 11-12 | First paying customers |

### Content Strategy

| Type | Topic | Frequency |
|------|-------|-----------|
| Blog | "Why RBAC in Snowflake is broken" | Launch |
| Blog | "Building Grantd: Technical deep-dive" | Week 2 |
| Blog | "Zero-trust architecture for data platforms" | Week 4 |
| Video | Demo walkthrough | Launch |
| Video | Self-hosting guide | Week 3 |

### Community

| Channel | Purpose |
|---------|---------|
| GitHub Discussions | Support, feature requests |
| Discord | Community chat |
| Twitter/X | Updates, engagement |
| LinkedIn | Professional network |

---

## 15. Success Metrics

### North Star

**Weekly active connections with successful sync**

### Supporting Metrics

| Metric | Month 3 | Month 6 | Month 12 |
|--------|---------|---------|----------|
| GitHub stars | 200 | 500 | 2,000 |
| Registered orgs | 50 | 200 | 1,000 |
| Active connections | 20 | 100 | 500 |
| Changesets applied | 50 | 500 | 5,000 |
| Paying customers | 0 | 5 | 30 |
| MRR | $0 | $500 | $5,000 |

---

## 16. Team & Resources

### Current

| Role | Person |
|------|--------|
| Founder / Engineer | Mikkel |

### Future Hires

| Role | When | Why |
|------|------|-----|
| Frontend contractor | Month 2 | Accelerate UI |
| DevRel / Community | Month 6 | Grow adoption |
| Second engineer | Month 9 | Scale development |

---

## 17. Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Platform builds native solution | High | Low | Multi-platform support, move fast |
| No adoption | High | Medium | Validate early, open source first |
| Security breach | Critical | Low | Zero-trust architecture, audits |
| Time constraints | Medium | High | Scope small, iterate quickly |
| Competitor dominates | Medium | Medium | Open source moat, community |

---

## 18. Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-11 | Name: Grantd | Short, memorable, relates to GRANT |
| 2026-01-11 | Open source first | Trust, distribution, community |
| 2026-01-11 | Platform-agnostic design | Larger market, future-proof |
| 2026-01-11 | Apache 2.0 license | Maximum adoption |
| 2026-01-10 | PlanetScale over Supabase | Better branching, migrations |
| 2026-01-10 | AWS Cognito | AWS-native, enterprise-ready |
| 2026-01-10 | Zero-trust architecture | Customer trust is everything |

---

## 19. Next Actions

| Action | Owner | Due |
|--------|-------|-----|
| Register grantd.io domain | Mikkel | Week 1 |
| Create GitHub org (grantd-io) | Mikkel | Week 1 |
| Set up PlanetScale database | Mikkel | Week 1 |
| Configure AWS Cognito | Mikkel | Week 1 |
| Initial repo structure | Mikkel | Week 1 |
| Snowflake sync service | Mikkel | Week 2 |
| Basic FastAPI endpoints | Mikkel | Week 2 |
| CLI skeleton | Mikkel | Week 3 |
| Talk to 5 potential users | Mikkel | Week 3 |
| README and docs | Mikkel | Week 4 |

---

**Document Version:** 1.0
**Last Updated:** January 11, 2026
**Author:** Mikkel Grønning Rydal

**Links:**
- Website: https://grantd.io (coming soon)
- GitHub: https://github.com/grantd-io (coming soon)
- Docs: https://docs.grantd.io (coming soon)
