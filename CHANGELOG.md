# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-07-17

### Added

- Initial open-source release
- Multi-model LLM scanning (OpenAI, Anthropic Claude, Google Gemini, DeepSeek, )
- Brand visibility scoring (0–100 scale)
- Competitor benchmarking (up to 20 competitors per brand)
- Citation tracking and source analysis
- Prompt management with 50+ templates
- Entity intelligence and knowledge graph integration
- Gap analysis with AI-powered recommendations
- Content optimization and schema.org validation
- AXP (Agent Experience Platform) script generation
- Scheduled PDF and HTML reports
- Razorpay subscription management
- Multi-tenant workspace support
- Role-based access control
- Webhook integration framework
- Email notifications (AWS SES / SMTP)
- Docker deployment support
- PostgreSQL database with Drizzle ORM
- BullMQ + Redis job queue
- Responsive React 19 frontend with Tailwind CSS
- Admin panel for system management
- OpenAPI-compatible REST API
- Comprehensive test suite (Vitest)

### Security

- JWT + httpOnly cookie session management
- Account lockout after repeated failed login attempts
- Password hashing with bcrypt
- 2FA support via TOTP
- Rate limiting on auth, API, and admin endpoints
- Helmet.js security headers
- CORS allowlist per environment
- Audit logging for sensitive operations
- Environment validation that blocks insecure production deploys
