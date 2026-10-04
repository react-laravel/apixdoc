# ApiX Docs

**English** | [简体中文](README.zh-CN.md)

A web platform for API documentation, request testing, and team collaboration.
Built with Next.js, React, TypeScript, and PostgreSQL.

**[Open ApiX Docs](https://apixdoc.dogeow.com/)** ·
[Getting started](#getting-started) · [Documentation](#documentation)

The deployed site requires an account for the workspace. This is an application
entry point, not an anonymous sandbox. Accounts are created by an administrator
or through a team invitation; there are no published demo credentials.

## Screenshots

Real, signed-out browser captures from the deployed site on **2026-09-30**.
These show the public entry pages, not the authenticated API editor or debugger.
See [screenshot sources](docs/screenshots/README.md).

### Public homepage

![ApiX Docs public homepage with the product logo and login entry](docs/screenshots/home-2026-09-30.jpg)

### Login

![ApiX Docs login form with empty email and password fields](docs/screenshots/login-2026-09-30.jpg)

The email shown in the empty form is a UI placeholder, not a demo account.

## Features

- **API documentation:** projects, folders, Markdown descriptions, parameters,
  headers, request bodies, response examples, and schemas.
- **Request testing:** environments and variables, path/query parameters,
  Bearer/Basic/API Key authentication, request cancellation, response statistics,
  searchable session-scoped history with method/result filters, and cURL import/export.
- **Request and response JSON:** validation and editing for request bodies and examples;
  API responses support raw, formatted JSON, and structure views while copying,
  downloading, and importing examples preserve the original content.
- **Import and export:** OpenAPI 3.0/3.1 JSON/YAML and Postman Collection 2.1,
  import previews, retained source files, and same-format export.
- **Documentation sharing:** independent document pages, public/private access,
  versioned publication snapshots, and rollback.
- **Team workflows:** organizations, invitations, role-based access, document
  history, restore/recycle-bin flows, and editing-conflict protection.
- **Operations:** account management, audit records, health checks, responsive
  layouts, and dark mode.

Supported workflows and limits are recorded in the [product roadmap](docs/PRODUCT_ROADMAP.md).
Advanced format conversion, SSO, automated account emails, billing, and broader
backup/operations capabilities remain ongoing work; the project does not claim
that every planned commercial feature is complete.

## Getting started

### Requirements

- Node.js **22**, matching [`.nvmrc`](.nvmrc), and npm.
- A PostgreSQL database and database user for this application.
- Use a separate development database. Migration, seeding, and database-backed
  verification commands can change data.

### Install and configure

```bash
git clone https://github.com/react-laravel/apixdoc.git
cd apixdoc
nvm use
npm ci
```

If you do not use nvm, select Node.js 22 with your preferred version manager.
Create a local `.env` file with your own values:

```dotenv
DATABASE_URL="postgresql://YOUR_USER:YOUR_PASSWORD@127.0.0.1:5432/apixdoc?schema=public"
AUTH_SECRET="REPLACE_WITH_A_LONG_RANDOM_SECRET"
AUTH_URL="http://localhost:3000"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="REPLACE_WITH_A_UNIQUE_ADMIN_PASSWORD"
```

Generate a random value for `AUTH_SECRET`, for example:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Replace every placeholder before continuing. The initial administrator password
must be at least **12 characters** and at most **72 UTF-8 bytes**. Keep `.env` and
all credentials private; environment files are ignored by Git.

### Initialize and run

```bash
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Open **<http://localhost:3000>** and sign in with the administrator you configured.
The seed creates the initial administrator only when appropriate; it does not
reset an existing administrator's password or promote an existing regular user.
See [account management](docs/ACCOUNTS.md).

Start editing the homepage in `src/app/page.tsx`. Next.js updates the page during
development. The app uses `next/font` for Geist fonts.

### Checks and production build

```bash
npm run lint
npm test
npx tsc --noEmit
npm run build
npm run start
```

`npm run start` serves the existing production build on port 3000 by default.
Additional scripts include `test:watch`, `test:coverage`, `db:migrate` (development
migrations), and `db:studio` (database inspection/editing).

For browser tests, install the test browser with `npx playwright install chromium`,
then run `npm run test:e2e`. The [Playwright configuration](playwright.config.ts)
starts/reuses the local development server at port 3000. Tests requiring login
or database data still need the corresponding local environment.

The `test:team`, `test:documents`, `test:publications`, `test:audit`, and
`test:accounts` scripts exercise database-backed workflows. Read the related
documentation before running them and use disposable local test data.

## Project structure

```text
src/app/             Pages and API routes
src/components/      Workspace, documentation, JSON, and shared UI components
src/lib/             Authentication, database, requests, permissions, and models
prisma/              Database schema, migrations, and administrator seed
scripts/             Workflow verification and operational scripts
tests/e2e/           Playwright browser tests
docs/                Feature, deployment, and operations documentation
```

## Documentation

Some detailed development documents are currently written in Chinese.

- [Product roadmap and current limits](docs/PRODUCT_ROADMAP.md)
- [Team collaboration and permissions](docs/TEAM_COLLABORATION.md)
- [Document history and conflict handling](docs/DOCUMENT_HISTORY.md)
- [Project publication snapshots](docs/PROJECT_PUBLICATIONS.md)
- [Request history, filters, and display privacy](docs/REQUEST_HISTORY.md)
- [Account management and recovery](docs/ACCOUNTS.md)
- [Audit and operations](docs/AUDIT_AND_OPERATIONS.md)
- [Production deployment](docs/DEPLOYMENT.md)
- [Screenshot sources](docs/screenshots/README.md)

## Deployment

The repository's configured deployment uses a GitHub Actions self-hosted runner,
Deployer, PostgreSQL, PM2, and nginx. **Pushing to `main` triggers a production
deployment.** Follow the project's [deployment guide](docs/DEPLOYMENT.md) for
environment variables, migrations, administrator initialization, and process setup.

A bare Next.js deployment is not a complete installation: this application also
needs its database and authentication configuration.

## Learn more about Next.js

This project was bootstrapped with `create-next-app`. Useful framework resources:

- [Next.js documentation](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)
- [Next.js on GitHub](https://github.com/vercel/next.js)

The language links at the top switch this README, not the application's UI language.
