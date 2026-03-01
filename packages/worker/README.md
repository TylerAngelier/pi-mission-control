# @pi-mission-control/worker

Remote agent worker package for Pi Mission Control.

## Purpose

This package will run pi agent sessions in isolated environments and stream normalized events back to the control plane.

## Current State

Bootstrap scaffold with:

- `src/index.ts` health helper + worker runtime exports
- `src/engine.ts` event normalization + sequence-aware execution engine
- `src/runtime.ts` SDK/RPC runtime adapter abstraction
- `src/workspace.ts` local workspace lifecycle manager (`create`, `mount`, `cleanup`)
- `src/dev.ts` placeholder dev process
- package-level lint/test/typecheck/build scripts

## Commands

From repo root:

```bash
npm run dev --workspace @pi-mission-control/worker
npm run lint --workspace @pi-mission-control/worker
npm run test --workspace @pi-mission-control/worker
npm run typecheck --workspace @pi-mission-control/worker
npm run build --workspace @pi-mission-control/worker
```
