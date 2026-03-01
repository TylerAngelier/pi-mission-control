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

### Git Pre-commit Hook

A pre-commit hook automatically runs the full CI pipeline before each commit. If any check fails, the commit is blocked.

To skip the hook:
```bash
git commit --no-verify -m "WIP message"
```

The pre-commit hook runs `npm run ci:drone:local`, which executes:
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- Full integration tests with Docker Compose

To install or reinstall the hooks:
```bash
npm run hooks:install
```

Hooks are tracked in `scripts/githooks/` and installed to `.git/hooks/`.

### Manual Verification

To run checks manually before pushing:

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

### v1 Feature Implementation (In Progress)

The v1 Pi Ops Console feature implementation is actively tracked in:

- `docs/features/v1/design/TECHNICAL_DESIGN.md` — Architecture and API design
- `docs/features/v1/tasks/TASKS.md` — Implementation task breakdown (WBS)
- `docs/features/v1/tasks/EXECUTION_LOG.md` — Detailed execution log

**Progress Summary:**

✅ **Completed Sections:**
- Discovery and Planning (1.x)
- Project Bootstrap (2.x)
- Control Plane Backend (3.x) — REST API, SSE streaming, event replay
- Agent Worker Runtime (4.x) — SDK/RPC integration, workspace isolation, approval flow
- Web Application Integration (5.x) — React chat UI, sidebar, run status

🟦 **Remaining Work:**
- Review and Intervention UX (5.2.x) — Execution timeline, approval dialogs
- Hardening, Testing, and Rollout (6.x) — Validation, monitoring, staged rollout

**Current Branch:** `feat/v1-web-app-integration`

### Persistence Migration (Completed)

Database persistence layer for control-api is documented in:

- `docs/persistence/TECHNICAL_DESIGN.md`
- `docs/persistence/WBS.md`
- `docs/persistence/EXECUTION_LOG.md`

This work provides PostgreSQL-backed storage for sessions, runs, approvals, and transcripts.
