# Pi Mission Control

[![CI (Drone)](https://drone.trangelier.dev/api/badges/TylerAngelier/pi-mission-control/status.svg)](https://drone.trangelier.dev/TylerAngelier/pi-mission-control)

Web control plane for remote pi agents.

This repository contains a TypeScript workspace with:

- `packages/control-api` — control plane API service (sessions/runs/events/approvals)
- `packages/worker` — remote agent worker runtime
- `packages/web` — web UI application shell for Pi Ops Console

## Requirements

- Node.js 20+
- npm 10+
- Docker + Docker Compose (for local Postgres/Redis)

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment template:

   ```bash
   cp .env.example .env
   ```

3. Run quality checks:

   ```bash
   npm run lint
   npm test
   npm run typecheck
   npm run build
   ```

4. Start local infrastructure only:

   ```bash
   npm run infra:up
   ```

5. Run database migrations (when using `PERSISTENCE_MODE=postgres`):

   ```bash
   npm run migration:run
   ```

6. Run dev orchestration (infra + control-api + worker):

   ```bash
   npm run dev
   ```

## Test Instructions

Run the full workspace test suite:

```bash
npm test
```

Run coverage across all workspaces:

```bash
npm run test:coverage
```

Run tests for a single package:

```bash
npm test --workspace @pi-mission-control/control-api
npm test --workspace @pi-mission-control/worker
npm test --workspace @pi-mission-control/web
```

Run PostgreSQL integration tests (env-gated):

```bash
docker compose -f docker-compose.test.yml up -d
npm run test:setup-db
npm run test:integration
npm run test:teardown-db
```

Recommended verification order before committing:

```bash
npm run lint
npm test
npm run typecheck
npm run build
```

## Workspace Commands

- `npm run build` — build all packages
- `npm test` — run tests in all packages
- `npm run lint` — lint all packages
- `npm run typecheck` — typecheck all packages
- `npm run infra:up` / `npm run infra:down` — manage local Postgres/Redis
- `npm run migration:run` / `npm run migration:status` / `npm run migration:rollback` — manage control-api migrations
- `npm run test:setup-db` / `npm run test:teardown-db` — reset integration test database
- `npm run test:integration` — run postgres integration tests

## CI/CD (Drone)

- Pipeline definition: `.drone.yml`
- Setup + branch protection + troubleshooting: `docs/ci/DRONE.md`

## Project Status

Persistence migration work is actively tracked in:

- `docs/persistence/TECHNICAL_DESIGN.md`
- `docs/persistence/WBS.md`
- `docs/persistence/EXECUTION_LOG.md`

Core architecture planning is documented in:

- `docs/design/TECHNICAL_DESIGN.md`
- `docs/tasks/TASKS.md`
- `docs/tasks/EXECUTION_LOG.md`
