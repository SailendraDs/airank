# Contributing to AIRank

Thank you for your interest in contributing! This guide covers everything you need to know to contribute effectively.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Code Style](#code-style)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Feature Requests](#feature-requests)
- [Community](#community)

---

## Code of Conduct

This project follows the [Contributor Covenant](https://www.contributor-covenant.org/) code of conduct. By participating, you agree to uphold a welcoming and inclusive environment.

---

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/yourusername/airank.git`
3. Create a branch: `git checkout -b feature/my-new-feature`
4. Make your changes
5. Run tests and lint: `npm run lint`
6. Commit and push
7. Open a Pull Request

---

## Development Setup

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database URL and API keys

# Run database migrations
npm run db:migrate

# Start development (frontend + backend)
npm run dev
```

### Requirements

- Node.js >= 18
- PostgreSQL >= 14
- Redis (for job queue)
- npm or pnpm

---

## How to Contribute

### Report Bugs

- Use the GitHub Issues tab
- Search existing issues first to avoid duplicates
- Include: steps to reproduce, expected behavior, actual behavior, environment details

### Suggest Features

- Open a GitHub Issue with the `enhancement` label
- Describe the use case, not just the solution
- Discuss with maintainers before large implementations

### Submit Pull Requests

1. **Small changes** (< 50 lines): Open directly with a clear description
2. **Medium changes** (50-200 lines): Open an issue first for discussion
3. **Large changes** (> 200 lines): Propose via a design document in a GitHub Discussion

---

## Code Style

### TypeScript

- Use TypeScript for all new code
- Prefer explicit types over `any`
- Use `interface` for object shapes, `type` for unions/aliases
- Keep functions under 50 lines where possible
- Use meaningful variable names (no single-letter variables except loop counters)

### Formatting

- Run `npm run format` before committing
- Follow existing patterns in the codebase
- Use 2-space indentation

### Linting

- Run `npm run lint` and fix all warnings
- ESLint configuration is in `.eslintrc.json`

### Database

- Use Drizzle ORM for all database access
- Follow the naming convention in `shared/schema.ts`
- Run `npm run db:migrate` for schema changes
- Include seed data in `server/services/seed-data.ts` for new tables

### React Components

- Use functional components with hooks
- Keep components focused (single responsibility)
- Extract reusable logic to custom hooks
- Use the existing ShadCN/ui components when possible

### API Routes

- Add routes in the appropriate file under `server/routes.ts` or `server/routes/`
- Include input validation
- Return consistent error formats
- Add request logging

---

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`

**Examples:**
```
feat(llm): add DeepSeek provider support
fix(auth): resolve OAuth callback edge case
docs(readme): add deployment instructions
refactor(db): extract seed data to separate service
```

---

## Pull Request Process

1. **Update the README** if your changes affect usage or configuration
2. **Update the migration guide** if you change the database schema
3. **Add tests** for new functionality
4. **Ensure CI passes** (lint, type check, tests)
5. **Request review** from at least one maintainer

### PR Checklist

- [ ] Code compiles without errors
- [ ] Linting passes (`npm run lint`)
- [ ] Tests pass (`npm test`)
- [ ] Documentation updated
- [ ] Database migrations included (if applicable)
- [ ] No hardcoded secrets or credentials
- [ ] Follows existing code patterns

---

## Reporting Bugs

When filing a bug report, please include:

1. **Summary**: Brief description of the bug
2. **Steps to reproduce**: Numbered list of exact steps
3. **Expected behavior**: What should happen
4. **Actual behavior**: What actually happens
5. **Environment**: OS, Node version, database version
6. **Logs**: Relevant log output (redact any secrets)
7. **Screenshots**: If applicable

---

## Feature Requests

We love hearing ideas! For feature requests:

1. Check existing issues to avoid duplicates
2. Describe the problem you're solving (not just the solution)
3. Explain who benefits and why
4. Consider edge cases and complexity

---

## Maintainer Notes

This project follows AI Credits standards:

- Maintain a [CHANGELOG.md](CHANGELOG.md) for user-facing changes
- Tag releases with semantic versioning
- Review PRs within 5 business days
- Credit contributors in release notes

---

## Questions?

- Open a [GitHub Discussion](https://github.com/yourusername/airank/discussions) for general questions
- Join our community chat (coming soon)
- Email: opensource@airank.io

Thank you for contributing! 🚀
