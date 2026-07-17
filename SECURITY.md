# AIRank Security Policy

## Reporting a Vulnerability

AIRank takes security seriously. If you discover a security vulnerability, please report it responsibly.

**DO NOT** open a public GitHub issue for security vulnerabilities.

### Reporting Channels

1. **GitHub Security Advisories** (Preferred)
   - Go to the [Security tab](https://github.com/sakthiswaroop/airank/security/advisories)
   - Click "Report a vulnerability"
   - Fill in the details

2. **Email**
   - Send details to: security@airank.io
   - Include "SECURITY" in the subject line

### What to Include

Please provide as much information as possible:

- **Description** of the vulnerability
- **Steps to reproduce** (proof-of-concept if possible)
- **Affected component** / file paths
- **Potential impact** (data exposure, privilege escalation, etc.)
- **Suggested fix** (if you have one)

### Response Timeline

- **24 hours** — Initial acknowledgment
- **72 hours** — Preliminary assessment
- **7 days** — Detailed response with remediation plan
- **30 days** — Patch release (critical vulnerabilities)

### Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | ✅ Active security updates |
| 0.x     | ❌ Best-effort fixes only |

Please update to the latest release before reporting a vulnerability.

## Security Best Practices for Contributors

When contributing to AIRank, please follow these guidelines:

### Secrets & Configuration

- **Never** commit secrets, API keys, or credentials to the repository
- Always use environment variables for configuration (see `.env.example`)
- Use the Zod validators for all input validation
- Verify the `.gitignore` excludes your new files (env, build artifacts, etc.)

### Authentication & Authorization

- Use Passport.js for all authentication flows
- Implement rate limiting on all auth endpoints
- Use httpOnly cookies for session management
- Hash passwords with bcrypt (minimum 10 rounds)
- Implement 2FA support where appropriate

### Database

- Use parameterized queries (Drizzle ORM handles this)
- Implement Row Level Security (RLS) for multi-tenancy
- Log all sensitive database operations
- Never expose raw database errors to clients

### Input Validation

- Validate all user input using Zod schemas
- Sanitize HTML/content before rendering
- Use Helmet.js for security headers
- Implement CORS allowlist properly

### API Security

- Rate limit all public endpoints
- Use HTTPS in production
- Implement request size limits
- Log all API requests for audit purposes
- Use `logAudit()` for sensitive operations (create/update/delete)

### Dependencies

- Review new dependencies for known vulnerabilities
- Run `npm audit` before submitting a PR
- Keep dependencies up to date for security patches
- Check for unmaintained packages

### Error Handling

- Never expose stack traces in production
- Use generic error messages for users
- Log detailed errors server-side only
- Implement proper error boundaries in React

## Security Features in AIRank

AIRank includes several built-in security controls:

- **JWT + httpOnly cookies** for session management
- **Account lockout** after repeated failed login attempts
- **Password hashing** with bcrypt
- **2FA support** via TOTP
- **Rate limiting** on auth, API, and admin endpoints
- **Helmet.js** for security headers (CSP, HSTS, X-Frame-Options)
- **CORS allowlist** per environment
- **Audit logging** for sensitive operations
- **Security event tracking** for anomaly detection
- **Password history** to prevent reuse
- **Environment validation** that blocks insecure production deploys

## Docker Security

When deploying with Docker:

- Run as non-root user (see `Dockerfile`)
- Use multi-stage builds to minimize image size
- Scan images for vulnerabilities (`docker scan`)
- Pin dependency versions
- Use secrets management (Docker secrets, environment variables)

## Responsible Disclosure

We appreciate security researchers who help us improve AIRank's security. With your permission, we will:

- Credit you in our security acknowledgments (unless you prefer to remain anonymous)
- List you in our hall of fame (if desired)
- Provide swag/merchandise for significant findings

## Contact

- **Security Email:** security@airank.io
- **General Email:** opensource@airank.io
- **GitHub:** [@sakthiswaroop](https://github.com/sakthiswaroop)

## Acknowledgments

We thank the security researchers and contributors who have helped improve AIRank's security.
