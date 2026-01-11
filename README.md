# Grantd

**Access control, finally understood.**

Grantd is an open source platform for visual Role-Based Access Control (RBAC) management across modern data platforms. It gives data teams visibility into users, roles, and permissions without storing privileged credentials.

## Features

- **Visual RBAC Management** - See your entire permission structure at a glance
- **Zero-Trust Architecture** - We never store write credentials
- **SQL Generation** - Review every change before execution
- **Drift Detection** - Know when someone changes permissions outside Grantd
- **Audit Trail** - Full history of all access control changes

## Supported Platforms

| Platform | Status |
|----------|--------|
| Snowflake | Available |
| Databricks | Planned |
| BigQuery | Planned |
| Redshift | Planned |

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.11+
- Poetry
- Docker (optional, for local development)

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/grantd-io/grantd.git
   cd grantd
   ```

2. **Set up the API**
   ```bash
   cd apps/api
   cp .env.example .env
   # Edit .env with your database credentials
   poetry install
   poetry run uvicorn src.main:app --reload
   ```

3. **Set up the Web App**
   ```bash
   cd apps/web
   cp .env.example .env
   # Edit .env with your Cognito credentials
   npm install
   npm run dev
   ```

4. **Install the CLI**
   ```bash
   cd packages/cli
   poetry install
   poetry run grantd --help
   ```

### Using Docker

```bash
cp .env.example .env
# Edit .env with your credentials
docker-compose up
```

## Project Structure

```
grantd/
├── apps/
│   ├── web/          # React frontend
│   └── api/          # FastAPI backend
├── packages/
│   └── cli/          # Python CLI tool
├── infra/            # Terraform modules
├── lambdas/          # AWS Lambda functions
├── migrations/       # Database migrations
└── docs/             # Documentation
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Grantd                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐   │
│   │    SYNC     │     │   MANAGE    │     │    APPLY    │   │
│   │  Read-only  │────>│  Visual UI  │────>│  SQL export │   │
│   │  service    │     │  for RBAC   │     │  or CLI     │   │
│   └─────────────┘     └─────────────┘     └─────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Security

Grantd uses a zero-trust architecture:

- **Read-only credentials** are stored encrypted in AWS Parameter Store
- **Write credentials** are NEVER stored - you provide them at execution time
- All SQL is generated visibly and reviewed before execution
- Full audit log of all changes

## Contributing

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for guidelines.

## License

Apache 2.0 - See [LICENSE](LICENSE) for details.

## Links

- Website: https://grantd.io
- Documentation: https://docs.grantd.io
- GitHub: https://github.com/grantd-io/grantd
