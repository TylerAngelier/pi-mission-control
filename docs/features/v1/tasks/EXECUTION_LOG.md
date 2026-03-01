## 1.1.1 Review relevant package docs and constraints for remote agent control

**Status:** 🟦 In Progress → ✅ Done

### Changes

- `packages/web-ui/README.md`: reviewed component capabilities and storage/session patterns.
- `packages/agent/README.md`: reviewed event model, agent loop semantics, and tool execution lifecycle.
- `packages/coding-agent/README.md`: reviewed SDK/RPC options and runtime constraints.

### Tests Added/Updated

- None (discovery/documentation-only task).

### Commands Run

- `git rev-parse --show-toplevel && pwd && ls` → confirmed repo root and current working directory context.
- `cd /Users/trangelier/development/ai/pi-mono && ls docs && ls docs/design && ls docs/tasks` → confirmed docs structure did not yet exist.

### Notes

- Assumption: `pi-web-ui` will be reused as the frontend component layer with a remote adapter instead of in-browser local agent wiring.
- Follow-up verification tasks are captured in WBS sections 2–5.

### Completion Summary

- Verified current module boundaries and reusable pieces.
- Confirmed remote orchestration is not provided out-of-the-box.
- Captured constraints needed to draft the target architecture.

## 1.2.1 Author technical design for Pi Ops Console architecture, APIs, data model, and rollout

**Status:** 🟦 In Progress → ✅ Done

### Changes

- `docs/design/TECHNICAL_DESIGN.md`: created full design using required template sections.

### Tests Added/Updated

- None (documentation-only task).

### Commands Run

- `N/A` → validation waived (doc-only task; no code/build impact expected).

### Notes

- Risk of waiver: design-doc mistakes are possible without executable validation.
- Mitigation: implementation WBS includes contract and integration test tasks before rollout.

### Completion Summary

- Defined architecture across frontend, control plane, worker runtime, and storage.
- Specified API/event contracts and approval flow examples.
- Added data model, reliability strategy, security posture, and observability requirements.
- Documented alternatives and rationale for SDK/RPC-based control plane approach.

## 1.3.1 Produce implementation WBS and execution log scaffold

**Status:** 🟦 In Progress → ✅ Done

### Changes

- `docs/tasks/TASKS.md`: created WBS with numbered hierarchy and status tracking.
- `docs/tasks/EXECUTION_LOG.md`: initialized execution log entries for completed planning leaves.

### Tests Added/Updated

- None (documentation-only task).

### Commands Run

- `N/A` → validation waived (doc-only task; no runtime behavior change).

### Notes

- Future execution is intentionally deferred pending user confirmation of architecture and priorities.

### Completion Summary

- Captured a phased implementation plan from API contracts through rollout hardening.
- Marked planning leaves complete and left implementation leaves not started.
- Logged all attempted planning tasks with decisions, waivers, and follow-up scope.

## 1.4.1 Rebaseline planning docs for greenfield `pi-mission-control` repository context

**Status:** 🟦 In Progress → ✅ Done

### Changes

- `docs/tasks/TASKS.md`: reworked WBS to reflect this repository as a greenfield project.
- `docs/tasks/TASKS.md`: inserted a new **Project Bootstrap** epic before backend/worker/web implementation tasks.
- `docs/tasks/TASKS.md`: updated repo command placeholders to `TBD` until bootstrap is complete.

### Tests Added/Updated

- None (documentation-only planning update).

### Commands Run

- `pwd && ls -la` → confirmed current workspace is `/Users/trangelier/development/ai/pi-mission-control`.
- `find docs -maxdepth 3 -type f | sort` → confirmed planning docs are present in this repository.
- `find . -maxdepth 2 -type f | sort` → quick discovery check of repo contents.
- `ls -la && ls -la docs && ls -la docs/design && ls -la docs/tasks` → verified documentation directories/files.

### Notes

- Assumption: implementation should proceed in this repository and not in `pi-mono`.
- Follow-up: bootstrap tasks (2.x) must complete before any API/worker/web implementation leaves.

### Completion Summary

- Re-scoped plan to the active repository context.
- Added explicit bootstrap phase to avoid implementation before project scaffolding.
- Kept downstream architecture intact while correcting execution order.

## 2.1.1 Initialize TypeScript project structure for web app, control API, and worker packages

**Status:** 🟦 In Progress → ✅ Done

### Changes

- `package.json`: created root npm workspace with shared scripts (`build`, `test`, `lint`, `typecheck`) and TypeScript dependency.
- `tsconfig.base.json`: added strict shared TypeScript compiler baseline.
- `.gitignore`: added standard Node/TS ignores.
- `packages/control-api/*`: added package manifest, tsconfig, and `src/index.ts` scaffold.
- `packages/worker/*`: added package manifest, tsconfig, and `src/index.ts` scaffold.
- `packages/web/*`: added package manifest, tsconfig, and `src/index.ts` scaffold.

### Tests Added/Updated

- None (bootstrap scaffolding task).

### Commands Run

- `find . -maxdepth 3 -type f | sort` → verified initial repo contents before scaffolding.
- `npm install` → succeeded; workspace dependencies installed.
- `npm run typecheck` → succeeded across `control-api`, `web`, and `worker` packages.
- `npm test` → succeeded (placeholder test scripts).

### Notes

- Added placeholder test/lint scripts intentionally for early bootstrap; real test/lint tooling is deferred to task `2.1.2`.
- Adjusted root script syntax to `--workspaces` to avoid npm flag warnings.

### Completion Summary

- Established a working TypeScript workspace layout for three core packages.
- Verified scaffolding compiles via workspace typecheck.
- Confirmed workspace test command executes cleanly.
- Set foundation for shared tooling/config task (`2.1.2`).

## 2.1.2 Add shared config (tsconfig, lint, test runner, env handling) and npm scripts

**Status:** 🟦 In Progress → ✅ Done

### Changes

- `package.json`: added shared dev tooling dependencies (`eslint`, `typescript-eslint`, `vitest`, `@types/node`) and workspace scripts.
- `eslint.config.mjs`: added root TypeScript-aware ESLint flat config.
- `vitest.workspace.ts`: added shared workspace test runner config.
- `.env.example`: added initial environment variable template for web/api/worker.
- `packages/*/package.json`: replaced placeholder lint/test scripts with real commands.
- `packages/*/vitest.config.ts`: added per-package Vitest configs.
- `packages/*/src/index.test.ts`: added smoke tests validating each package health helper.

### Tests Added/Updated

- `packages/control-api/src/index.test.ts`: verifies `control-api` health contract.
- `packages/web/src/index.test.ts`: verifies `web` health contract.
- `packages/worker/src/index.test.ts`: verifies `worker` health contract.

### Commands Run

- `npm install` → succeeded; installed lint/test dependencies.
- `npm run typecheck` → succeeded across all workspace packages.
- `npm test` → succeeded; all 3 Vitest suites passed.
- `npm run lint` → succeeded across all workspace packages.

### Notes

- Lint and test scaffolding is intentionally minimal and ready for expansion as real modules are added.
- Repo command section in `TASKS.md` remains `TBD` until `2.2.2` verifies final bootstrap runtime commands.

### Completion Summary

- Introduced shared static analysis and test tooling for the whole workspace.
- Added reproducible smoke tests to keep bootstrap packages verifiable.
- Added env template baseline for local development configuration.
- Confirmed lint/test/typecheck gates are green after setup.

## 2.2.1 Add local dev orchestration (concurrently/docker compose) for api + worker + db

**Status:** 🟦 In Progress → ✅ Done

### Changes

- `docker-compose.yml`: added local infrastructure services (`postgres`, `redis`) with persistent volumes.
- `package.json`: added root scripts `infra:up`, `infra:down`, and `dev` orchestration via `concurrently`.
- `package.json`: added `concurrently` and `tsx` dev dependencies.
- `packages/control-api/package.json`: added `dev` script using `tsx --env-file`.
- `packages/worker/package.json`: added `dev` script using `tsx --env-file`.
- `packages/control-api/src/dev.ts`: added placeholder API dev process heartbeat.
- `packages/worker/src/dev.ts`: added placeholder worker dev process heartbeat.

### Tests Added/Updated

- No new tests required (orchestration/bootstrap wiring only; existing smoke tests remain sufficient).

### Commands Run

- `docker --version && docker compose version` → confirmed Docker/Compose availability.
- `npm install` → succeeded; installed new orchestration dependencies.
- `docker compose config >/tmp/compose.out && echo ok` → succeeded; compose file validated.
- `npm run lint && npm test && npm run typecheck` → all commands succeeded across workspace packages.

### Notes

- The `dev` process currently runs placeholder API/worker loops; functional runtime behavior will be implemented in later backend/worker tasks.
- Compose was validated but not started persistently during this task.

### Completion Summary

- Added repeatable local infra definition for database and queue dependencies.
- Added one-command dev orchestration for infra + API + worker process shells.
- Kept quality gates green after introducing orchestration dependencies.
- Prepared ground for `2.2.2` command verification and repo command section finalization.

## 2.2.2 Verify bootstrap build/test/lint commands and update Repo Commands section

**Status:** 🟦 In Progress → ✅ Done

### Changes

- `docs/tasks/TASKS.md`: updated **Repo Commands** from `TBD` to validated commands.
- `docs/tasks/TASKS.md`: marked `2.2.2` complete and rolled up `2.2`/`2` statuses to ✅.

### Tests Added/Updated

- None (validation/documentation update task).

### Commands Run

- `npm run build` → succeeded across all workspace packages.
- `npm run lint && npm test && npm run typecheck` → all commands succeeded across all workspace packages.

### Notes

- Bootstrap quality gates are now executable and documented for future tasks.

### Completion Summary

- Confirmed all core workspace gates are green.
- Converted task doc placeholders into concrete, validated repo commands.
- Closed out Project Bootstrap epic as complete.

## 2.3.1 Add README.md to root and each package (`control-api`, `worker`, `web`)

**Status:** 🟦 In Progress → ✅ Done

### Changes

- `README.md`: added repository overview, requirements, setup, workspace commands, and project status links.
- `packages/control-api/README.md`: added package purpose, current scaffold status, and package command usage.
- `packages/worker/README.md`: added package purpose, current scaffold status, and package command usage.
- `packages/web/README.md`: added package purpose, current scaffold status, and package command usage.
- `docs/tasks/TASKS.md`: added WBS task `2.3.1` and completion summary entry.

### Tests Added/Updated

- None (documentation-only task).

### Commands Run

- `npm run lint && npm test && npm run typecheck` → all commands succeeded across workspace packages.

### Notes

- Readmes intentionally describe current bootstrap state and future intent to keep expectations accurate.

### Completion Summary

- Added onboarding documentation at both root and package levels.
- Standardized how to run per-package commands from repo root.
- Kept existing quality gates green after docs update.

## 3.1.1 Define OpenAPI contracts for agents, sessions, messages, runs, approvals

**Status:** 🟦 In Progress → ✅ Done

### Changes

- `packages/control-api/openapi/openapi.yaml`: added OpenAPI 3.1 contract for v1 control-plane resources and operations.
- `packages/control-api/openapi/openapi.yaml`: defined schemas for `Agent`, `Session`, `Run`, transcript events, approval decisions, and error responses.
- `packages/control-api/README.md`: documented location and scope of the OpenAPI contract.
- `docs/tasks/TASKS.md`: marked `3.1.1` as complete and updated WBS roll-up status.

### Tests Added/Updated

- None (contract/documentation task; no runtime handler implementation yet).

### Commands Run

- `npm run lint && npm test && npm run typecheck` → all commands succeeded across workspace packages.

### Notes

- Assumption: contract-first implementation; handler behavior in `3.1.2` should conform to this spec.
- Follow-up: add contract validation tests once handlers are implemented (`6.1.1`).

### Completion Summary

- Established canonical API contracts for control-plane operations.
- Covered session message enqueue and transcript retrieval flows.
- Added run approval/rejection endpoints with typed decision payloads.
- Preserved green quality gates after introducing the spec.

## 3.1.2 Implement REST handlers with auth, validation, and persistence

**Status:** 🟦 In Progress → ✅ Done

### Changes

- `packages/control-api/src/app.ts`: implemented Express API routes for agents, sessions, message enqueue, transcript retrieval, run lookup, and approve/reject decisions.
- `packages/control-api/src/app.ts`: added bearer-token auth middleware and request validation/error handling paths.
- `packages/control-api/src/store.ts`: added in-memory persistence layer for agents/sessions/runs/approvals/transcript events.
- `packages/control-api/src/validation.ts`: added Zod request schemas for create/decision endpoints.
- `packages/control-api/src/types.ts`: added domain types for statuses, entities, and transcript events.
- `packages/control-api/src/index.ts`: added server bootstrap helper (`startControlApiServer`) and app export.
- `packages/control-api/src/dev.ts`: replaced placeholder heartbeat with actual HTTP server startup.
- `packages/control-api/src/index.test.ts`: added integration tests for auth guard and enqueue→approve→run/transcript flow.
- `packages/control-api/openapi/openapi.yaml`: updated `RunAcceptedResponse` to include `approvalId` and added bearer security scheme.
- `packages/control-api/package.json`: added runtime and test dependencies for API implementation.
- `docs/tasks/TASKS.md`: marked `3.1.2` complete and updated completion summary.

### Tests Added/Updated

- `packages/control-api/src/index.test.ts`: added protected-route auth test.
- `packages/control-api/src/index.test.ts`: added end-to-end creation/enqueue/approve/transcript assertions.

### Commands Run

- `npm install` → succeeded; installed control-api API/test dependencies.
- `npm run lint --workspace @pi-mission-control/control-api` → succeeded.
- `npm test --workspace @pi-mission-control/control-api` → succeeded; 3 tests passed.
- `npm run lint && npm test && npm run typecheck` → all workspace checks succeeded.

### Notes

- Persistence is currently process-local in-memory storage; database-backed repositories remain a follow-up for backend hardening tasks.
- Auth currently uses a static bearer token from env (`MISSION_CONTROL_API_TOKEN`) suitable for local/dev bootstrap.

### Completion Summary

- Delivered first functional control-plane API surface aligned to the OpenAPI contract.
- Implemented auth + validation + persistence requirements for task 3.1.2.
- Added integration tests covering key happy-path and auth protection behavior.
- Kept full workspace lint/test/typecheck gates green.

## 2.3.2 Add explicit root README test instructions for workspace and per-package runs

**Status:** 🟦 In Progress → ✅ Done

### Changes

- `README.md`: added a dedicated **Test Instructions** section.
- `README.md`: documented full-workspace and package-scoped `npm test` commands.
- `README.md`: documented recommended pre-commit verification order (`lint`, `test`, `typecheck`, `build`).
- `docs/tasks/TASKS.md`: added and completed WBS leaf `2.3.2`.

### Tests Added/Updated

- None (documentation-only update).

### Commands Run

- `npm test` → succeeded across all workspace packages.

### Notes

- Instructions now reflect current scripts and package naming conventions.

### Completion Summary

- Added clear, actionable test workflow guidance at repo root.
- Reduced onboarding ambiguity for full-suite vs package-only test runs.
- Kept test gate green after documentation update.

## 3.2.1 Implement stream gateway (WebSocket/SSE) with per-run sequence ordering

**Status:** 🟦 In Progress → ✅ Done

### Changes

- `packages/control-api/src/store.ts`: added run-scoped event storage, per-run sequence counters, and pub/sub listeners.
- `packages/control-api/src/types.ts`: added `RunStreamEventEnvelope` type for stream payloads.
- `packages/control-api/src/app.ts`: added SSE endpoint `GET /v1/runs/:runId/stream` with backlog replay and live event delivery.
- `packages/control-api/openapi/openapi.yaml`: documented stream endpoint for `text/event-stream` responses.
- `packages/control-api/src/index.test.ts`: added integration test validating SSE response and in-order per-run sequence delivery.
- `docs/tasks/TASKS.md`: marked `3.2.1` complete and updated completion summary.

### Tests Added/Updated

- `packages/control-api/src/index.test.ts`: added stream-ordering integration test for run event sequence envelopes.

### Commands Run

- `npm run lint --workspace @pi-mission-control/control-api && npm test --workspace @pi-mission-control/control-api && npm run typecheck --workspace @pi-mission-control/control-api` → all succeeded after stream implementation.
- `npm run lint && npm test && npm run typecheck` → all workspace checks succeeded.

### Notes

- Gateway currently uses SSE and in-process memory pub/sub; durable replay cursor support is intentionally deferred to `3.2.2`.

### Completion Summary

- Delivered first live run-event streaming endpoint in the control API.
- Guaranteed deterministic ordering via run-local sequence numbering.
- Added test coverage to validate stream event ordering behavior.
- Preserved green lint/test/typecheck gates across the workspace.

## 3.2.2 Add reconnect cursor support (`lastSequence`) and replay endpoint

**Status:** 🟦 In Progress → ✅ Done

### Changes

- `packages/control-api/src/app.ts`: added run replay endpoint `GET /v1/runs/:runId/events` with `fromSequence` validation.
- `packages/control-api/src/app.ts`: extended SSE endpoint to support `lastSequence` cursor for reconnect semantics.
- `packages/control-api/src/store.ts`: extended run event retrieval to support sequence-based filtering.
- `packages/control-api/openapi/openapi.yaml`: documented replay endpoint, stream cursor query parameter, and replay/stream envelope schemas.
- `packages/control-api/src/index.test.ts`: added integration test for replay and reconnect cursor behavior.
- `docs/tasks/TASKS.md`: marked `3.2.2` complete and rolled up section statuses.

### Tests Added/Updated

- `packages/control-api/src/index.test.ts`: added replay endpoint + cursor-aware stream assertions.

### Commands Run

- `npm run lint --workspace @pi-mission-control/control-api && npm test --workspace @pi-mission-control/control-api && npm run typecheck --workspace @pi-mission-control/control-api` → all succeeded.
- `npm run lint && npm test && npm run typecheck` → all workspace checks succeeded.

### Notes

- Replay endpoint currently serves in-memory event history for the running process; durable cross-restart replay remains a future persistence enhancement.

### Completion Summary

- Added explicit replay API for run event backfill.
- Added reconnect cursor support to avoid re-sending already-consumed SSE events.
- Kept stream contract and implementation aligned with OpenAPI updates.
- Preserved green lint/test/typecheck gates across the repo.

## 4.1.1 Integrate coding-agent SDK/RPC loop and normalize emitted events

**Status:** 🟦 In Progress → ✅ Done

### Changes

- `packages/worker/src/types.ts`: added worker run request/runtime event types and normalized run stream envelope shape.
- `packages/worker/src/runtime.ts`: added `WorkerRuntime` abstraction plus `CodingAgentSdkRpcRuntime` adapter for SDK/RPC client loop integration.
- `packages/worker/src/engine.ts`: added `WorkerExecutionEngine` and `normalizeRuntimeEvent` mapping to convert runtime events into control-plane-compatible envelopes with per-run sequence ordering.
- `packages/worker/src/index.ts`: exported worker runtime/engine APIs for package consumers.
- `packages/worker/src/dev.ts`: updated startup log to reflect available SDK/RPC execution scaffold.
- `packages/worker/src/index.test.ts`: added tests for event normalization, sequencing, runtime error mapping, and RPC delegation.
- `docs/tasks/TASKS.md`: marked task `4.1.1` complete and updated roll-up status for section 4/4.1.

### Tests Added/Updated

- `packages/worker/src/index.test.ts`: added 4 new coverage scenarios for runtime loop delegation, normalized event shape, sequence ordering, and runtime failure handling.

### Commands Run

- `npm run lint --workspace @pi-mission-control/worker && npm test --workspace @pi-mission-control/worker && npm run typecheck --workspace @pi-mission-control/worker && npm run build --workspace @pi-mission-control/worker` → all succeeded.
- `npm run lint && npm test && npm run typecheck && npm run build` → all workspace checks succeeded.

### Notes

- The SDK/RPC integration is intentionally adapter-based (`CodingAgentRpcClient`) to keep the worker decoupled from transport implementation details while enabling direct wiring in a later task.
- Workspace/container lifecycle is still pending and tracked under `4.1.2`.

### Completion Summary

- Added a concrete worker execution engine capable of consuming runtime event streams.
- Normalized runtime events into deterministic control-plane envelopes suitable for API stream persistence/fan-out.
- Added failure handling that emits `run_failed` when runtime streaming throws.
- Added unit coverage and validated green lint/test/typecheck/build gates across the full monorepo.

## 4.1.2 Add workspace isolation lifecycle (create, mount, cleanup)

**Status:** 🟦 In Progress → ✅ Done

### Changes

- `packages/worker/src/workspace.ts`: added `LocalWorkspaceManager` with explicit `createWorkspace`, `mountWorkspace`, and `cleanupWorkspace` lifecycle methods.
- `packages/worker/src/workspace.ts`: added workspace metadata model (`WorkerWorkspace`) and lifecycle manager interfaces.
- `packages/worker/src/index.ts`: exported workspace lifecycle APIs for package consumers.
- `packages/worker/src/index.test.ts`: added workspace lifecycle integration-style tests for create/mount/cleanup and error cases.
- `packages/worker/README.md`: updated package scaffold docs to include runtime engine and workspace lifecycle components.
- `docs/tasks/TASKS.md`: marked task `4.1.2` complete and rolled up `4.1` status to ✅.

### Tests Added/Updated

- `packages/worker/src/index.test.ts`: added 2 workspace lifecycle tests covering happy-path directory creation/symlink mount/cleanup and missing-workspace error handling.

### Commands Run

- `npm run lint --workspace @pi-mission-control/worker && npm test --workspace @pi-mission-control/worker && npm run typecheck --workspace @pi-mission-control/worker && npm run build --workspace @pi-mission-control/worker` → all succeeded.
- `npm run lint && npm test && npm run typecheck && npm run build` → all workspace checks succeeded.

### Notes

- Mounting currently uses local directory symlinks as a lightweight stand-in for container/worktree mounts; stronger isolation mechanisms can be swapped in behind the same interface later.
- Approval/policy runtime controls remain pending under section `4.2`.

### Completion Summary

- Implemented a concrete workspace lifecycle manager for worker-run isolation.
- Added deterministic workspace metadata tracking and guardrails for invalid lifecycle operations.
- Added tests to validate lifecycle behavior and error paths.
- Preserved green lint/test/typecheck/build gates across the monorepo.

## 4.2.1 Add policy matcher for risky tool calls (bash/edit/write categories)

**Status:** 🟦 In Progress → 🚫 Won't Complete

### Changes

- `docs/tasks/TASKS.md`: marked task `4.2.1` as 🚫 Won't Complete for this version.

### Tests Added/Updated

- None (scope decision/documentation-only task).

### Commands Run

- `N/A` → validation waived (documentation-only scope decision; no runtime behavior changes).

### Notes

- Product decision: risk-category policy matching is deferred from v1 to reduce implementation scope.
- Mitigation: keep approval pause/resume primitives in place via `4.2.2`, so policy matching can be layered later without redesign.

### Completion Summary

- Explicitly removed policy-matcher implementation from current release scope.
- Documented decision and rationale directly in WBS tracking.
- Preserved downstream ability to add matcher logic in a future version.

## 4.2.2 Implement pause/resume flow for approve/reject/timeout

**Status:** 🟦 In Progress → ✅ Done

### Changes

- `packages/worker/src/approval.ts`: added `InMemoryApprovalController` and approval decision contracts for waiting, approving, rejecting, and timing out decisions.
- `packages/worker/src/engine.ts`: added pause/resume logic for `approval_required` events, including `approval_decided` emission and failure handling for reject/timeout/missing controller.
- `packages/worker/src/types.ts`: added approval runtime event variants (`approval_required`, `approval_decided`).
- `packages/worker/src/index.ts`: exported approval controller and associated types.
- `packages/worker/src/index.test.ts`: added approval flow tests for approve resume, reject fail, timeout fail, and missing-controller fail paths.
- `packages/worker/README.md`: documented approval controller scaffold in worker package overview.
- `docs/tasks/TASKS.md`: marked `4.2.2` complete.

### Tests Added/Updated

- `packages/worker/src/index.test.ts`: added approval flow coverage for approved, rejected, expired, and missing controller scenarios.

### Commands Run

- `npm run lint --workspace @pi-mission-control/worker && npm test --workspace @pi-mission-control/worker && npm run typecheck --workspace @pi-mission-control/worker && npm run build --workspace @pi-mission-control/worker` → all succeeded.
- `npm run lint && npm test && npm run typecheck && npm run build` → all workspace checks succeeded.

### Notes

- Approval flow is currently in-memory and process-local, suitable for bootstrap development; persistent/distributed approval state can be introduced later behind the same interface.

### Completion Summary

- Implemented worker pause/resume behavior around approval gates.
- Added deterministic decision handling for approve/reject/timeout outcomes.
- Emitted normalized decision/failure events suitable for control-plane streaming.
- Preserved green lint/test/typecheck/build gates across the monorepo.
