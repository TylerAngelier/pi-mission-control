# Agent Instructions

## Project Overview

Pi Mission Control is a web control plane for remote pi agents. It provides a control API, worker runtime, and web application for managing sessions, runs, approvals, and streaming execution events.

## Project Structure

- `packages/control-api`: control plane HTTP API and OpenAPI contracts.
- `packages/worker`: worker runtime for executing agent tasks.
- `packages/web`: web UI application package.
- `docs/design`: technical architecture and design docs.
- `docs/tasks`: WBS task plan and execution log.

## Required Onboarding

1. Read `README.md` before making changes.
2. Read project documentation in `docs/` before implementation, especially:
   - `docs/design/TECHNICAL_DESIGN.md`
   - `docs/tasks/TASKS.md`
   - `docs/tasks/EXECUTION_LOG.md`

## CI

This repository uses Drone CI.
You can run a local Drone CI with `npm run ci:drone:local`.
Read more on the implementation at `docs/ci/DRONE.md`.
