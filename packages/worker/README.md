# @pi-mission-control/worker

Remote agent worker package for Pi Mission Control.

## Purpose

This package runs pi agent sessions in isolated environments and streams normalized events back to the control plane.

## Current State

Implemented with:

- `src/engine.ts` event normalization + sequence-aware execution engine
- `src/runtime.ts` SDK/RPC runtime adapter abstraction
- `src/workspace.ts` local workspace lifecycle manager (`create`, `mount`, `cleanup`)
- `src/approval.ts` in-memory and postgres approval controllers
- `src/approval.integration.test.ts` env-gated postgres approval integration test

## Approval Controller Modes

- `InMemoryApprovalController` for local/dev and unit tests
- `PostgresApprovalController` for distributed approval decisions via DB + NOTIFY/LISTEN
- `createApprovalControllerFromEnv()` selects mode based on `PERSISTENCE_MODE`

## Commands

From repo root:

```bash
npm run dev --workspace @pi-mission-control/worker
npm run lint --workspace @pi-mission-control/worker
npm run test --workspace @pi-mission-control/worker
npm run typecheck --workspace @pi-mission-control/worker
npm run build --workspace @pi-mission-control/worker
```
