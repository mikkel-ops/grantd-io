# Grantd - Claude Code Guidelines

## Project Overview

**Grantd** is an open source platform for visual Role-Based Access Control (RBAC) management across modern data platforms. It provides visibility into users, roles, and permissions without storing privileged credentials.

**Tagline:** *"Access control, finally understood."*

### Core Principles
- **Zero-trust**: Customers retain full control over write credentials - Grantd only stores read-only credentials
- **Transparency**: All SQL is generated visibly and reviewed before execution
- **Open source first**: Apache 2.0 license, community-driven development
- **Platform-agnostic**: Snowflake first (MVP), with Databricks, BigQuery, Redshift planned

## Architecture

### High-Level Flow
```
SYNC (read-only) → MANAGE (visual UI) → APPLY (SQL export/CLI execution)
                          ↓
              AUDIT & COMPLIANCE (history, drift detection)
```

### Security Model
- **Grantd stores**: Read-only key-pair credentials (encrypted in AWS Parameter Store)
- **Grantd NEVER stores**: Write credentials, customer data access
- **Changes applied via**: CLI on customer's machine using their own credentials

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React + Vite + Tailwind + Shadcn/ui |
| Auth | AWS Cognito (JWT tokens) |
| Backend | FastAPI + Mangum (Lambda-ready) |
| Database | PlanetScale PostgreSQL (eu-central-2) |
| Infrastructure | AWS (Lambda, API Gateway, Parameter Store, EventBridge) |
| IaC | Terraform |
| CLI | Python + Typer (Poetry for dependencies) |
| Snowflake | snowflake-connector-python |

## Repository Structure

```
grantd-io/
├── apps/
│   ├── web/                    # React frontend (Vite)
│   │   ├── src/
│   │   │   ├── components/     # UI components (shadcn/ui in ui/)
│   │   │   ├── pages/          # Route pages
│   │   │   ├── lib/            # Utilities (auth.tsx, api.ts, utils.ts)
│   │   │   └── hooks/          # React hooks
│   │   ├── .env                # Frontend env vars (VITE_*)
│   │   └── vite.config.ts
│   │
│   └── api/                    # FastAPI backend
│       ├── src/
│       │   ├── main.py         # FastAPI app entry
│       │   ├── config.py       # Pydantic settings
│       │   ├── dependencies.py # DI (auth, db session)
│       │   ├── auth/           # Cognito JWT verification
│       │   ├── routers/        # API endpoints
│       │   ├── services/       # Business logic, sync connectors
│       │   └── models/         # SQLAlchemy + Pydantic schemas
│       ├── .env                # Backend env vars
│       └── pyproject.toml      # Poetry dependencies
│
├── packages/
│   └── cli/                    # Python CLI (Typer)
│       ├── grantd_cli/
│       │   ├── main.py
│       │   └── commands/
│       └── pyproject.toml
│
├── infra/
│   ├── modules/                # Terraform modules
│   │   ├── cognito/
│   │   ├── lambda/
│   │   ├── parameter-store/
│   │   └── eventbridge/
│   └── environments/
│       └── dev/                # Dev environment config
│           └── main.tf
│
├── lambdas/                    # Standalone Lambda functions
│   ├── post_confirmation/      # Cognito trigger
│   ├── sync_worker/
│   └── drift_detector/
│
├── migrations/                 # SQL migration files
│   ├── 001_initial_schema.sql
│   ├── 002_connections.sql
│   ├── 003_platform_objects.sql
│   ├── 004_changesets.sql
│   └── 005_audit.sql
│
├── scripts/
│   └── run_migrations.py       # Migration runner
│
├── .github/
│   └── workflows/              # CI/CD pipelines
│
├── docker-compose.yml
├── CLAUDE.md                   # This file
└── README.md
```

## Development Setup

### Prerequisites
- Node.js 18+
- Python 3.11+
- Poetry (Python package manager)
- AWS CLI configured with SSO profile `grantd`
- Terraform 1.0+

### Environment Variables

**Frontend** (`apps/web/.env`):
```
VITE_COGNITO_USER_POOL_ID=<user-pool-id>
VITE_COGNITO_CLIENT_ID=<web-client-id>
VITE_COGNITO_REGION=eu-central-1
VITE_API_URL=http://localhost:8000/api/v1
```

**Backend** (`apps/api/.env`):
```
ENVIRONMENT=development
DEBUG=true
DATABASE_URL=postgresql://...@eu-central-2.pg.psdb.cloud:6432/postgres?sslmode=require
COGNITO_USER_POOL_ID=<user-pool-id>
COGNITO_APP_CLIENT_ID=<web-client-id>
COGNITO_REGION=eu-central-1
CORS_ORIGINS=["http://localhost:5173","http://localhost:3000"]
```

### Running Locally

**Start the API:**
```bash
cd apps/api
poetry install
poetry run uvicorn src.main:app --reload --port 8000
```

**Start the Frontend:**
```bash
cd apps/web
npm install
npm run dev
```

**Access:**
- Frontend: http://localhost:5173
- API Docs: http://localhost:8000/api/v1/docs
- Health: http://localhost:8000/health

### Database Migrations

```bash
cd apps/api
poetry run python ../../scripts/run_migrations.py
```

To test connection:
```bash
poetry run python ../../scripts/run_migrations.py --test
```

## Key Concepts

### Multi-Tenancy
- Organizations are the top-level tenant
- Users belong to organizations via `org_members` table
- All data is scoped by `org_id`
- Cognito stores `custom:org_id` attribute on users

### Platform Connections
- Each organization can have multiple platform connections
- Credentials stored in AWS Parameter Store (encrypted)
- Connection config stored in `connections` table
- Sync runs periodically via EventBridge

### Changesets
- Draft changes are collected into changesets
- Changesets go through: draft → pending_review → approved → applied
- SQL is generated but NEVER executed by Grantd
- Users apply changes via CLI with their own credentials

### Platform Abstraction
- `PlatformConnector` base class in `services/sync/base.py`
- Platform-specific implementations (e.g., `SnowflakeConnector`)
- Common data models: `PlatformUser`, `PlatformRole`, `PlatformGrant`
- SQL generation methods per platform

## API Structure

**Auth** (`/api/v1/auth/`):
- `GET /me` - Current user info

**Organizations** (`/api/v1/organizations/`):
- `GET /current` - Current org
- `GET /current/members` - Org members

**Connections** (`/api/v1/connections/`):
- CRUD for platform connections
- `POST /{id}/sync` - Trigger sync
- `POST /{id}/test` - Test connection

**Objects** (`/api/v1/objects/`):
- `GET /users` - Platform users
- `GET /roles` - Platform roles
- `GET /grants` - Platform grants
- `GET /role-hierarchy` - Role tree

**Changesets** (`/api/v1/changesets/`):
- CRUD for changesets
- `GET /{id}/sql` - Get SQL statements
- `POST /{id}/approve` - Approve changeset

**Sync** (`/api/v1/sync/`):
- `POST /trigger` - Trigger sync
- `GET /status` - Sync status
- `GET /runs` - Sync history

## Common Tasks

### Adding a New API Endpoint

1. Create/update router in `apps/api/src/routers/`
2. Add Pydantic schemas in `apps/api/src/models/schemas.py`
3. Include router in `apps/api/src/main.py`
4. Add tests in `apps/api/tests/`

### Adding a New UI Page

1. Create page component in `apps/web/src/pages/`
2. Add route in `apps/web/src/App.tsx`
3. Add navigation link in `apps/web/src/components/dashboard/DashboardLayout.tsx`

### Adding a New Platform Connector

1. Create connector class extending `PlatformConnector` in `apps/api/src/services/sync/`
2. Implement all abstract methods (sync_users, sync_roles, etc.)
3. Add to factory in `apps/api/src/services/sync/factory.py`
4. Add platform type to `platform_type` enum in migrations

### Deploying Infrastructure

```bash
cd infra/environments/dev
terraform init
terraform plan
terraform apply
```

## Testing

**Backend:**
```bash
cd apps/api
poetry run pytest
```

**Frontend:**
```bash
cd apps/web
npm run lint
npm run build  # Type-checks via tsc
```

## Important Notes

### Vite + amazon-cognito-identity-js
The Cognito SDK requires Node.js globals. Add this to `vite.config.ts`:
```typescript
define: {
  global: 'globalThis',
}
```

### PlanetScale Limitations
- No plpgsql trigger functions (handle `updated_at` in application code)
- Uses PgBouncer on port 6432
- Requires `sslmode=require`

### CORS Configuration
`CORS_ORIGINS` in `.env` must be JSON array format:
```
CORS_ORIGINS=["http://localhost:5173","http://localhost:3000"]
```

### AWS SSO
Login with:
```bash
aws sso login --profile grantd
```

## Current Infrastructure

| Service | Region | Details |
|---------|--------|---------|
| PlanetScale | eu-central-2 | PostgreSQL 18.1, 20 tables |
| AWS Cognito | eu-central-1 | User Pool + Web/CLI clients |
| Terraform State | Local | `infra/environments/dev/terraform.tfstate` |

## Test Credentials

**Test User:**
- Email: `test@grantd.io`
- Password: `TestPass123!`
- User Pool: Check Terraform output for current IDs

## Useful Commands

```bash
# AWS
aws sts get-caller-identity --profile grantd
aws cognito-idp list-user-pools --max-results 10 --profile grantd --region eu-central-1

# Database
cd apps/api && poetry run python ../../scripts/run_migrations.py --test

# Terraform
cd infra/environments/dev && terraform output

# Kill dev servers
pkill -f "vite"
pkill -f "uvicorn"
```

## Links

- Product Manifest: `Grantd Product Manifest.md`
- Database Schema: `migrations/*.sql`
- API Models: `apps/api/src/models/`
- UI Components: `apps/web/src/components/`
