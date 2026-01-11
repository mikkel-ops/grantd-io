# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in Grantd, please report it by emailing security@grantd.io.

Please include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes

We will respond within 48 hours and work with you to understand and address the issue.

## Security Model

Grantd is designed with security as a core principle:

### Zero-Trust Architecture

- **Read-only credentials**: Grantd only stores read-only service account credentials
- **No write access**: We never store credentials that can modify your data platform
- **Customer-controlled execution**: All changes are executed by the customer using their own credentials

### Credential Storage

- Service account credentials are stored in AWS Parameter Store with encryption
- Credentials are scoped per-organization and per-connection
- Access is controlled via IAM policies

### Authentication

- User authentication via AWS Cognito
- JWT tokens with short expiration
- Optional MFA support

### Data Protection

- All data in transit is encrypted (TLS 1.3)
- Database connections use SSL
- No customer data is stored - only metadata about users, roles, and permissions
