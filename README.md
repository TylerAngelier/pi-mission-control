# Pi Mission Control

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

5. Run dev orchestration (infra + control-api + worker placeholders):

   ```bash
   npm run dev
   ```

## Workspace Commands

- `npm run build` — build all packages
- `npm test` — run tests in all packages
- `npm run lint` — lint all packages
- `npm run typecheck` — typecheck all packages
- `npm run infra:up` / `npm run infra:down` — manage local Postgres/Redis

## Project Status

This is a bootstrap phase for the Pi Ops Console architecture documented in:

- `docs/design/TECHNICAL_DESIGN.md`
- `docs/tasks/TASKS.md`
- `docs/tasks/EXECUTION_LOG.md`
