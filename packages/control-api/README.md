# @pi-mission-control/control-api

Control plane API package for Pi Mission Control.

## Purpose

This package hosts APIs for:

- agent/session/run lifecycle management
- realtime event fanout metadata
- approval workflows for gated tool actions
- durable in-memory or postgres-backed persistence modes

## Current State

Implemented with:

- `src/app.ts` Express API handlers + auth + validation
- `src/store.ts` in-memory store implementation
- `src/persistence/` postgres persistence layer (database manager, migrations, repository, store)
- `src/store-factory.ts` env-driven dual-mode store initialization
- `openapi/openapi.yaml` API contract for agents, sessions, runs, messages, and approvals

## Persistence Modes

- `PERSISTENCE_MODE=in-memory` (default)
- `PERSISTENCE_MODE=postgres` (requires `MISSION_CONTROL_DATABASE_URL`)

## Commands

From repo root:

```bash
npm run dev --workspace @pi-mission-control/control-api
npm run lint --workspace @pi-mission-control/control-api
npm run test --workspace @pi-mission-control/control-api
npm run test:integration --workspace @pi-mission-control/control-api
npm run typecheck --workspace @pi-mission-control/control-api
npm run build --workspace @pi-mission-control/control-api
npm run migration:run --workspace @pi-mission-control/control-api
npm run migration:status --workspace @pi-mission-control/control-api
npm run migration:rollback --workspace @pi-mission-control/control-api
npm run test:setup-db --workspace @pi-mission-control/control-api
npm run test:teardown-db --workspace @pi-mission-control/control-api
```
