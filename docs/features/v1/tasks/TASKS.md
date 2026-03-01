# Task Management (WBS)

## Status Legend

- ⬜ Not Started
- 🟦 In Progress
- ✅ Done
- ⛔ Blocked
- 🚫 Won't Complete

## Repo Commands

- **Build:** `npm run build`
- **Test:** `npm test`
- **Lint/Format (optional):** `npm run lint`

## WBS

### 1. Discovery and Planning ✅

- **1.1 Product Discovery ✅**
  - 1.1.1 Review relevant pi package docs and constraints for remote agent control ✅
- **1.2 Technical Design Draft ✅**
  - 1.2.1 Author technical design for Pi Ops Console architecture, APIs, data model, and rollout ✅
- **1.3 Planning Artifacts ✅**
  - 1.3.1 Produce implementation WBS and execution log scaffold ✅
- **1.4 Repository Rebaseline ✅**
  - 1.4.1 Rebaseline planning docs for greenfield `pi-mission-control` repository context ✅

### 2. Project Bootstrap ✅

- **2.1 Monorepo/App Foundation ✅**
  - 2.1.1 Initialize TypeScript project structure for web app, control API, and worker packages ✅
  - 2.1.2 Add shared config (tsconfig, lint, test runner, env handling) and npm scripts ✅
- **2.2 Development Runtime ✅**
  - 2.2.1 Add local dev orchestration (concurrently/docker compose) for api + worker + db ✅
  - 2.2.2 Verify bootstrap build/test/lint commands and update Repo Commands section ✅
- **2.3 Documentation Bootstrap ✅**
  - 2.3.1 Add README.md to root and each package (`control-api`, `worker`, `web`) ✅
  - 2.3.2 Add explicit root README test instructions for workspace and per-package runs ✅

### 3. Control Plane Backend ✅

- **3.1 Session/Run API Surface ✅**
  - 3.1.1 Define OpenAPI contracts for agents, sessions, messages, runs, approvals ✅
  - 3.1.2 Implement REST handlers with auth, validation, and persistence ✅
- **3.2 Realtime Event Stream ✅**
  - 3.2.1 Implement stream gateway (WebSocket/SSE) with per-run sequence ordering ✅
  - 3.2.2 Add reconnect cursor support (`lastSequence`) and replay endpoint ✅

### 4. Agent Worker Runtime ✅

- **4.1 Worker Execution Engine ✅**
  - 4.1.1 Integrate coding-agent SDK/RPC loop and normalize emitted events ✅
  - 4.1.2 Add workspace isolation lifecycle (create, mount, cleanup) ✅
- **4.2 Approval and Policy Hooks ✅**
  - 4.2.1 Add policy matcher for risky tool calls (bash/edit/write categories) 🚫 Won't Complete
  - 4.2.2 Implement pause/resume flow for approve/reject/timeout ✅

### 5. Web Application Integration 🟦

- **5.1 Session Console UI ✅**
  - 5.1.1 Compose pi-web-ui chat components with remote event adapter ✅
  - 5.1.2 Build session/task sidebar and run status indicators ✅
- **5.2 Review and Intervention UX 🟦**
  - 5.2.1 Add execution timeline (tool calls, logs, state transitions) ✅
  - 5.2.2 Add approval inbox and action dialogs (approve/reject with context) ⬜

### 6. Hardening, Testing, and Rollout ⬜

- **6.1 Validation ⬜**
  - 6.1.1 Add unit/integration/contract tests for control plane and worker contracts ⬜
  - 6.1.2 Run package-level checks/tests for touched modules and fix all failures ⬜
- **6.2 Rollout Operations ⬜**
  - 6.2.1 Add metrics, dashboards, and alerts for queue lag, failures, and approval latency ⬜
  - 6.2.2 Perform staged rollout with feature flag and rollback playbook ⬜

## Per-Task Completion Summaries

- 1.1.1: Reviewed relevant `pi-web-ui`, `pi-agent-core`, and `pi-coding-agent` documentation; captured capabilities/constraints for remote orchestration.
- 1.2.1: Authored `docs/design/TECHNICAL_DESIGN.md` covering architecture, API/event contracts, data model, control flows, alternatives, testing, and rollout/risks.
- 1.3.1: Produced initial WBS and execution logging structure.
- 1.4.1: Rebased plan to this greenfield repo and inserted explicit bootstrap phase before backend/worker/web implementation.
- 2.1.1: Initialized root npm workspace and TypeScript baseline with package skeletons for `web`, `control-api`, and `worker`; installed dependencies and validated `npm run typecheck` + `npm test`.
- 2.1.2: Added shared ESLint + Vitest configuration, package-level lint/test scripts, `.env.example`, and smoke tests for each package; validated lint/test/typecheck successfully.
- 2.2.1: Added Docker Compose services (Postgres/Redis), root orchestration scripts (`infra:up`, `infra:down`, `dev`), and placeholder `dev` entrypoints for API/worker packages.
- 2.2.2: Verified `npm run build`, `npm test`, `npm run lint`, and `npm run typecheck`; updated Repo Commands with concrete validated commands.
- 2.3.1: Added onboarding READMEs for repo root and all package workspaces with purpose, status, and command usage.
- 2.3.2: Expanded root README with dedicated test instructions, package-scoped test commands, and recommended pre-commit verification order.
- 3.1.1: Added `packages/control-api/openapi/openapi.yaml` with v1 contract definitions for agents, sessions, messages, runs, approvals, and transcript retrieval; validated repository lint/test/typecheck.
- 3.1.2: Implemented Express-based REST handlers with bearer auth, Zod request validation, and in-memory persistence for agents/sessions/runs/approvals/transcripts; added integration tests for auth and end-to-end enqueue/approve flow.
- 3.2.1: Implemented SSE run-event stream endpoint (`GET /v1/runs/:runId/stream`) with in-memory pub/sub and per-run sequence ordering; added integration test verifying ordered stream envelopes.
- 3.2.2: Added run-event replay endpoint (`GET /v1/runs/:runId/events?fromSequence=`) and stream cursor support (`lastSequence`) for SSE reconnect semantics; added integration test coverage for replay/cursor behavior.
- 4.1.1: Implemented worker SDK/RPC execution abstractions (`WorkerRuntime`, `CodingAgentSdkRpcRuntime`) and a `WorkerExecutionEngine` that normalizes runtime events into control-plane envelopes with per-run sequence ordering; added worker tests for normalization, sequencing, runtime error mapping, and RPC delegation; validated full workspace lint/test/typecheck/build.
- 4.1.2: Added `LocalWorkspaceManager` with explicit create/mount/cleanup lifecycle for isolated worker directories, including symlink-based repo mount tracking and error handling for missing/already-mounted workspaces; expanded worker tests to cover lifecycle success and error paths; validated full workspace lint/test/typecheck/build.
- 4.2.1: Marked 🚫 Won't Complete for v1 scope; policy matcher categorization will be deferred to a future version while keeping approval flow support available.
- 4.2.2: Added pause/resume approval flow in worker execution engine with `InMemoryApprovalController` handling approve/reject/timeout decisions, plus tests for approved, rejected, timed out, and missing-controller paths; validated full workspace lint/test/typecheck/build.
- 5.1.1: Installed React and TypeScript React types; created chat component types and interfaces (`ChatMessage`, `ToolCall`, `ExecutionEvent`, `RemoteEventAdapterOptions`, etc.); implemented `RemoteEventAdapter` class for connecting to control API SSE streams with automatic reconnect, run ID tracking, and event normalization; created React components (`Chat`, `ChatMessage`, `ToolCall`) for displaying messages and tool executions; added comprehensive unit tests for `RemoteEventAdapter` covering connection state management, event handling (message updates, tool calls, approval events), and run lifecycle tracking; updated `packages/web/tsconfig.json` to enable React JSX compilation; exported chat module APIs from `packages/web/src/index.ts` and `packages/web/src/chat/index.ts`; validated full workspace lint/test/typecheck/build.
- 5.1.2: Created `Sidebar` React component displaying session list with status icons, active session highlighting, and new session creation button; implemented `RunStatus` React component for displaying current run state with status indicator, cost, timestamps, and error information; updated `Chat` component to accept optional `runStatus` prop and integrate `RunStatus` display; installed testing dependencies (`@testing-library/react`, `@testing-library/jest-dom`, `jsdom`); configured Vitest to use jsdom environment for component testing; added comprehensive tests for `Sidebar` (13 tests) covering rendering, interactions, status icons, and timestamp formatting; added comprehensive tests for `RunStatus` (18 tests) covering all run states, metadata display, and edge cases; updated `Chat` component types to include `runStatus` option; exported new components from chat module; validated full workspace lint/test/typecheck/build with all 47 tests passing.
- 5.2.1: Created `ExecutionTimeline` React component for displaying chronological timeline of events (tool calls, state changes, approvals) with expand/collapse toggle, event type icons, severity color coding, and collapsible detail views; implemented `toTimelineEvents` helper function to convert `ExecutionEvent` and `ToolCall` arrays into unified `TimelineEvent` format with proper sorting; integrated `ExecutionTimeline` into `Chat` component using `toTimelineEvents` helper; added comprehensive tests (15 tests) for timeline rendering, expand/collapse behavior, event sorting, status display, and helper function behavior; added `TimelineEvent` type with event metadata (type, severity, status, details); validated full workspace lint/test/typecheck/build with all 61 tests passing.
- 5.2.2: _(empty until completed)_
- 6.1.1: _(empty until completed)_
- 6.1.2: _(empty until completed)_
- 6.2.1: _(empty until completed)_
- 6.2.2: _(empty until completed)_
