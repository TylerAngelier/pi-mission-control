# @pi-mission-control/control-api

Control plane API package for Pi Mission Control.

## Purpose

This package will host APIs for:

- agent/session/run lifecycle management
- realtime event fanout metadata
- approval workflows for gated tool actions

## Current State

Bootstrap scaffold with:

- `src/index.ts` health helper
- `src/dev.ts` placeholder dev process
- package-level lint/test/typecheck/build scripts

## Commands

From repo root:

```bash
npm run dev --workspace @pi-mission-control/control-api
npm run lint --workspace @pi-mission-control/control-api
npm run test --workspace @pi-mission-control/control-api
npm run typecheck --workspace @pi-mission-control/control-api
npm run build --workspace @pi-mission-control/control-api
```
