# @pi-mission-control/web

Web application package for Pi Mission Control.

## Purpose

This package will host the Pi Ops Console UI for:

- browsing sessions/chats
- prompting remote agents
- viewing live run timelines
- approving/rejecting gated actions

## Current State

Bootstrap scaffold with:

- `src/index.ts` health helper
- package-level lint/test/typecheck/build scripts

## Commands

From repo root:

```bash
npm run lint --workspace @pi-mission-control/web
npm run test --workspace @pi-mission-control/web
npm run typecheck --workspace @pi-mission-control/web
npm run build --workspace @pi-mission-control/web
```
