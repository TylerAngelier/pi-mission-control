# @pi-mission-control/web

Web application package for Pi Mission Control.

## Purpose

This package hosts Pi Ops Console-facing UI state primitives for:

- browsing sessions/chats
- prompting remote agents
- viewing live run timelines
- approving/rejecting gated actions

## Current State

Implemented with:

- `src/session-store.ts` API-backed session store with:
  - `/v1/ui/sessions` refresh support
  - TTL cache behavior
  - optional storage-backed offline cache fallback
  - session SSE subscription and reconnect behavior
- package-level lint/test/typecheck/build scripts

## Commands

From repo root:

```bash
npm run lint --workspace @pi-mission-control/web
npm run test --workspace @pi-mission-control/web
npm run typecheck --workspace @pi-mission-control/web
npm run build --workspace @pi-mission-control/web
```
