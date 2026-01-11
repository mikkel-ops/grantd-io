# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project structure
- Snowflake connector for syncing users, roles, and grants
- React frontend with dashboard, connections, roles, users, and changesets views
- FastAPI backend with REST API
- CLI tool for setup, sync, diff, and apply operations
- AWS Cognito authentication
- Terraform infrastructure modules
- Database schema for multi-tenant RBAC management
- GitHub Actions CI/CD workflows

### Security
- Zero-trust architecture - no write credentials stored
- All credentials encrypted in AWS Parameter Store
- JWT-based authentication

## [0.1.0] - 2026-01-11

### Added
- Initial release
