# Contributing to Grantd

Thank you for your interest in contributing to Grantd! This document provides guidelines for contributing.

## Development Setup

### Prerequisites

- Node.js 20+
- Python 3.11+
- Poetry (for Python package management)
- Docker (for local development)
- Terraform 1.6+ (for infrastructure)

### Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/grantd.git
   cd grantd
   ```

3. Set up the frontend:
   ```bash
   cd apps/web
   npm install
   npm run dev
   ```

4. Set up the API:
   ```bash
   cd apps/api
   poetry install
   poetry run uvicorn src.main:app --reload
   ```

5. Set up the CLI:
   ```bash
   cd packages/cli
   poetry install
   poetry run grantd --help
   ```

## Code Style

### Python

We use `ruff` for linting and formatting:
```bash
poetry run ruff check .
poetry run ruff format .
```

### TypeScript

We use ESLint and Prettier:
```bash
npm run lint
npm run format
```

## Testing

### Backend
```bash
cd apps/api
poetry run pytest
```

### Frontend
```bash
cd apps/web
npm test
```

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Add tests for new functionality
4. Update documentation if needed
5. Ensure CI passes
6. Submit a pull request

## Commit Messages

We follow conventional commits:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `refactor:` Code refactoring
- `test:` Adding tests
- `chore:` Maintenance

Example: `feat: add role hierarchy visualization`

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.
