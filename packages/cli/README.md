# Grantd CLI

Visual RBAC for data platforms - command line interface.

## Installation

```bash
pip install grantd-cli
```

Or with Poetry:

```bash
poetry add grantd-cli
```

## Quick Start

```bash
# Authenticate
grantd login

# Set up a new Snowflake connection
grantd setup --platform snowflake

# Check status
grantd status

# View pending changes
grantd diff

# Apply a changeset
grantd apply <changeset-id>
```

## Commands

| Command | Description |
|---------|-------------|
| `grantd login` | Authenticate with Grantd |
| `grantd logout` | Clear stored credentials |
| `grantd setup` | Generate setup SQL for a new connection |
| `grantd sync` | Sync platform metadata |
| `grantd status` | Show connection status |
| `grantd diff` | Show pending changes |
| `grantd apply` | Apply a changeset |

## Configuration

The CLI stores configuration in `~/.grantd/`:

- `~/.grantd/keys/` - RSA key pairs for platform authentication
- Credentials are stored in your system keyring

### Environment Variables

- `GRANTD_API_URL` - API endpoint (default: `https://api.grantd.io/api/v1`)

## Development

```bash
# Install dependencies
poetry install

# Run CLI
poetry run grantd --help

# Run tests
poetry run pytest
```

## License

Apache 2.0
