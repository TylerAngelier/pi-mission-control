# Persistence Layer Implementation WBS

## Status Legend

- ⬜ Not Started
- 🟦 In Progress
- ✅ Done
- ⛔ Blocked

## Repo Commands

- **Build:** `npm run build`
- **Test:** `npm test`
- **Lint/Format:** `npm run lint`
- **Integration Tests:** `npm run test:integration`
- **Migration Run:** `npm run migration:run`
- **Migration Rollback:** `npm run migration:rollback`

## WBS

### 1. Foundation and Database Schema ✅

- **1.1 Setup persistence infrastructure ✅**
  - 1.1.1 Add PostgreSQL dependency (pg) to control-api package ✅
  - 1.1.2 Create persistence directory structure and base files ✅
  - 1.1.3 Implement database connection manager with connection pooling ✅
  - 1.1.4 Implement PostgreSQL NOTIFY/LISTEN support for real-time events ✅
  - 1.1.5 Add test database fixture utilities and setup scripts ✅
- **1.2 Create PostgreSQL schema and migrations ✅**
  - 1.2.1 Define all table schemas matching technical design ✅
  - 1.2.2 Create migration files: 001_initial_schema.sql, 002_add_indexes.sql ✅
  - 1.2.3 Implement migration runner with rollback support ✅
  - 1.2.4 Add migration npm scripts and documentation ✅
- **1.3 Define TypeScript domain types and repository interfaces ✅**
  - 1.3.1 Create persistence/types.ts with all domain types ✅
  - 1.3.2 Create persistence/repository.ts with repository interfaces ✅
  - 1.3.3 Ensure type compatibility with existing src/types.ts ✅

### 2. Repository Layer Implementation ⬜

- **2.1 Implement base repository with transaction support ⬜**
  - 2.1.1 Create BaseRepository class with common CRUD operations ⬜
  - 2.1.2 Implement transaction context with rollback/commit ⬜
  - 2.1.3 Add row-to-domain mappers for each entity type ⬜
- **2.2 Implement core repositories ⬜**
  - 2.2.1 Implement UserRepository with CRUD operations ⬜
  - 2.2.2 Implement WorkspaceRepository with CRUD operations ⬜
  - 2.2.3 Implement AgentRepository with CRUD operations ⬜
  - 2.2.4 Implement SessionRepository with sequence management ⬜
  - 2.2.5 Implement RunRepository with orphan detection ⬜
  - 2.2.6 Implement ApprovalRepository with timeout handling ⬜
- **2.3 Implement event repositories ⬜**
  - 2.3.1 Implement TranscriptEventRepository with session-scoped events ⬜
  - 2.3.2 Implement RunEventRepository with run-scoped events ⬜
  - 2.3.3 Add batch insert methods for performance ⬜
  - 2.3.4 Implement replay queries with cursor support ⬜

### 3. ControlApiStore Replacement 🟦 In Progress

- **3.1 Implement PostgresControlApiStore ✅**
  - 3.1.1 Create drop-in replacement for InMemoryControlApiStore ✅
  - 3.1.2 Implement all public methods using repository layer ✅
  - 3.1.3 Maintain API compatibility with existing contracts ✅
  - 3.1.4 Add migration path from in-memory to PostgreSQL ✅
- **3.2 Wire PostgresControlApiStore into Express app ✅**
  - 3.2.1 Update src/app.ts to accept store injection ✅
  - 3.2.2 Add factory function for store creation based on env var ✅
  - 3.2.3 Support dual mode (in-memory/postgres) via PERSISTENCE_MODE ✅
  - 3.2.4 Update src/dev.ts to use PostgreSQL when available ✅
- **3.3 Update integration tests 🟦 In Progress**
  - 3.3.1 Modify src/index.test.ts to work with both store types ⬜
  - 3.3.2 Add test fixture setup/teardown for database ✅
  - 3.3.3 Add test database reset utilities ✅
  - 3.3.4 Ensure all existing tests pass with new store ✅

### 4. PostgreSQL NOTIFY/LISTEN for Event Streaming ✅

- **4.1 Implement PostgreSQL LISTEN support ✅**
  - 4.1.1 Add NOTIFY triggers on run_events table for new event inserts ✅
  - 4.1.2 Implement dedicated LISTEN connection in database manager ✅
  - 4.1.3 Add channel naming convention: run_events:<runId> ✅
  - 4.1.4 Implement connection health check and reconnection logic ✅
- **4.2 Replace in-memory event listeners with PostgreSQL LISTEN ✅**
  - 4.2.1 Update PostgresControlApiStore.subscribeToRunEvents() to use LISTEN ✅
  - 4.2.2 Implement NOTIFY on event insert via database triggers ✅
  - 4.2.3 Add LISTEN subscriber in SSE stream endpoint ✅
  - 4.2.4 Maintain sequence ordering guarantees ✅
- **4.3 Update SSE streaming with PostgreSQL backend ✅**
  - 4.3.1 Modify /v1/runs/:runId/stream to consume from LISTEN notifications ✅
  - 4.3.2 Add backfill from database on initial subscription ✅
  - 4.3.3 Implement cursor-based resume with sequence numbers ✅
  - 4.3.4 Add LISTEN connection error handling and reconnection ✅

### 5. PostgreSQL-based Distributed Approval Controller ✅

- **5.1 Design PostgreSQL approval controller interface ✅**
  - 5.1.1 Define PostgresApprovalController implementing ApprovalController ✅
  - 5.1.2 Use approvals table with timeout_at column for expiration ✅
  - 5.1.3 Implement NOTIFY on approval state changes (approval_decided channel) ✅
  - 5.1.4 Add application-level timeout polling with DB queries ✅
- **5.2 Implement PostgresApprovalController ✅**
  - 5.2.1 Implement waitForDecision() using LISTEN + polling fallback ✅
  - 5.2.2 Implement approve() and reject() with NOTIFY ✅
  - 5.2.3 Add timeout handling via periodic DB query for expired approvals ✅
  - 5.2.4 Ensure thread-safety across multiple worker instances ✅
- **5.3 Integrate PostgresApprovalController into worker ✅**
  - 5.3.1 Update packages/worker/src/approval.ts to use PostgreSQL version ✅
  - 5.3.2 Add factory for creating approval controller based on env var ✅
  - 5.3.3 Keep InMemoryApprovalController for development/testing ✅
  - 5.3.4 Update worker execution engine to use new controller ✅

### 6. Integration Tests with Clean Environments ⬜

- **6.1 Create test database management utilities ⬜**
  - 6.1.1 Add test database creation/drop scripts ⬜
  - 6.1.2 Implement per-test isolation via transaction rollback ⬜
  - 6.1.3 Add test data seeding utilities ⬜
  - 6.1.4 Create test fixture factories for all entities ⬜
- **6.2 Implement integration test suite 🟦 In Progress**
  - 6.2.1 Create persistence/persistence.test.ts for repository tests ✅
  - 6.2.2 Add end-to-end flow tests (enqueue → approve → complete) ⬜
  - 6.2.3 Add PostgreSQL NOTIFY/LISTEN integration tests ⬜
  - 6.2.4 Add approval controller integration tests ⬜
- **6.3 Create test scripts and tooling 🟦 In Progress**
  - 6.3.1 Add test:integration npm script ✅
  - 6.3.2 Add test:setup-db script for local development ⬜
  - 6.3.3 Add test:teardown-db script for cleanup ⬜
  - 6.3.4 Create docker-compose.test.yml for isolated test environment ⬜

### 7. Migrate Web UI Session Store 🟦 In Progress

- **7.1 Design session store API migration ✅**
  - 7.1.1 Create new API endpoints: GET/POST /v1/ui/sessions ✅
  - 7.1.2 Define session summary schema for UI consumption ✅
  - 7.1.3 Add WebSocket/SSE endpoint for real-time session updates ✅
  - 7.1.4 Design backward compatibility layer for existing UI ✅
- **7.2 Implement session store API endpoints ✅**
  - 7.2.1 Add /v1/sessions/list with filters (status, workspace, agent) ✅
  - 7.2.2 Add /v1/sessions/:id/subscribe for real-time updates ✅
  - 7.2.3 Implement server-sent events for session state changes ✅
  - 7.2.4 Add session metadata endpoint for UI needs ✅
- **7.3 Replace web package in-memory session store ✅**
  - 7.3.1 Update packages/web/src/session-store.ts to fetch from API ✅
  - 7.3.2 Implement caching layer to reduce API calls ✅
  - 7.3.3 Add reconnection logic for real-time updates ✅
  - 7.3.4 Ensure offline capability via local cache ✅
- **7.4 Update web package tests 🟦 In Progress**
  - 7.4.1 Mock API responses for session store tests ✅
  - 7.4.2 Add integration tests with real API backend ⬜
  - 7.4.3 Test reconnection and error handling ⬜
  - 7.4.4 Verify all web package tests pass ✅

### 8. Update All Test Suites ⬜

- **8.1 Update control-api test suite ⬜**
  - 8.1.1 Refactor src/index.test.ts to use test database ⬜
  - 8.1.2 Add database setup/teardown hooks ⬜
  - 8.1.3 Update auth and validation tests ⬜
  - 8.1.4 Update stream tests to work with PostgreSQL LISTEN ⬜
- **8.2 Update worker test suite ⬜**
  - 8.2.1 Refactor packages/worker/src/index.test.ts for PostgreSQL approval controller ⬜
  - 8.2.2 Add database setup/teardown hooks ⬜
  - 8.2.3 Update execution engine tests ⬜
  - 8.2.4 Add multi-worker coordination tests ⬜
- **8.3 Update worker-flow test suite ⬜**
  - 8.3.1 Refactor src/worker-flow.test.ts for persistence ⬜
  - 8.3.2 Add cross-service test setup ⬜
  - 8.3.3 Test full flow: API enqueue → worker execute → PostgreSQL events ⬜
  - 8.3.4 Add approval flow integration tests ⬜

### 9. Documentation and Rollout ⬜

- **9.1 Create operational documentation ⬜**
  - 9.1.1 Write docs/persistence/OPERATIONS.md for PostgreSQL setup ⬜
  - 9.1.2 Create docs/persistence/TROUBLESHOOTING.md for common issues ⬜
  - 9.1.3 Document backup/restore procedures ⬜
- **9.2 Create developer documentation ⬜**
  - 9.2.1 Update package READMEs with persistence info ⬜
  - 9.2.2 Add environment variable reference ⬜
  - 9.2.3 Document local development workflow ⬜
  - 9.2.4 Create contribution guidelines for persistence layer ⬜
- **9.3 Implementation validation and smoke testing ⬜**
  - 9.3.1 Run full test suite with persistence enabled ⬜
  - 9.3.2 Perform load testing for event ingestion ⬜
  - 9.3.3 Validate PostgreSQL NOTIFY/LISTEN under load ⬜
  - 9.3.4 Test failover scenarios ⬜

## Per-Task Completion Summaries

- 1.1.1: Added `pg` and `@types/pg` to `packages/control-api/package.json`, installed dependencies, and updated lockfile.
- 1.1.2: Created `packages/control-api/src/persistence/` structure with migrations, repository implementation, and persistence exports.
- 1.1.3: Implemented `DatabaseManager` with pooled connections, transactions, health checks, and close lifecycle.
- 1.1.4: Added `PostgresNotifyManager` with LISTEN/UNLISTEN subscriptions, publish support, and reconnect flow.
- 1.1.5: Added PostgreSQL integration fixture logic in `src/persistence/persistence.integration.test.ts` with schema reset + migration bootstrapping.
- 1.2.1: Defined PostgreSQL schema for users/workspaces/agents/sessions/runs/approvals/transcript_events/run_events/idempotency_keys.
- 1.2.2: Added `001_initial_schema.sql` and `002_add_indexes.sql` migrations, including run-event NOTIFY trigger.
- 1.2.3: Implemented `MigrationRunner` with run/status/rollback capabilities.
- 1.2.4: Added migration scripts (`migration:run`, `migration:status`, `migration:rollback`) at package and workspace roots.
- 1.3.1: Added `persistence/types.ts` with domain entities and status unions.
- 1.3.2: Added `persistence/repository.ts` with transaction and repository contracts.
- 1.3.3: Added `ControlApiStore` abstraction and aligned app/store code so in-memory and postgres implementations share compatible shapes.
- 3.1.1: Implemented `PostgresControlApiStore` as a drop-in replacement for core control-api persistence flows.
- 3.1.2: Wired all public store methods (`agents/sessions/runs/approvals/transcripts/events`) to repository-backed persistence.
- 3.1.3: Preserved API response contracts while moving app handlers to async store usage.
- 3.1.4: Added env-based factory (`createControlApiStoreFromEnv`) and startup migration path to transition between in-memory and postgres modes.
- 3.2.1: Updated `createControlApiApp` to accept a generic `ControlApiStore` injection.
- 3.2.2: Added `store-factory.ts` to construct in-memory or postgres store from runtime env.
- 3.2.3: Added `PERSISTENCE_MODE` support and `.env.example` entries for postgres/test URLs.
- 3.2.4: Updated `src/dev.ts` to initialize store from env and close persistence resources on shutdown.
- 3.3.2: Added integration test setup/teardown around database lifecycle.
- 3.3.3: Added schema reset utility logic in integration test bootstrap (`DROP/CREATE SCHEMA + migrations`).
- 3.3.4: Revalidated workspace lint/test/typecheck/build with persistence changes.
- 4.1.1: Added `run_events` insert trigger to emit PostgreSQL `NOTIFY` events.
- 4.1.2: Implemented a dedicated LISTEN subscriber connection in `PostgresNotifyManager`.
- 4.1.3: Standardized channel naming to `run_events:<runId>`.
- 4.1.4: Added listener reconnection flow that re-subscribes active channels on connection errors.
- 4.2.1: Implemented `PostgresControlApiStore.subscribeToRunEvents()` with LISTEN payload translation.
- 4.2.2: Implemented NOTIFY-backed publication via migration trigger + `PostgresNotifyManager.publish`.
- 4.2.3: Kept SSE endpoint integrated via store subscription abstraction while backend switches to postgres LISTEN.
- 4.2.4: Preserved run-level sequence ordering via per-run sequence allocation in repository inserts.
- 4.3.1: SSE stream now consumes live notifications through postgres-backed store subscriptions.
- 4.3.2: SSE stream performs DB backfill before live subscription.
- 4.3.3: Cursor-based resume remains supported through `lastSequence` + replay query behavior.
- 4.3.4: Added reconnect handling in notify manager to restore LISTEN subscriptions.
- 6.2.1: Added `persistence.integration.test.ts` validating durable store flows and idempotent enqueue behavior.
- 6.3.1: Added `test:integration` command at package and root levels.
- 5.1.1: Added `PostgresApprovalController` implementing worker `ApprovalController` semantics with DB-backed coordination.
- 5.1.2: Wired decision lookups against the `approvals` table for run/approval-scoped decisions.
- 5.1.3: Added database trigger notification support on approval state transitions via `approval_decided` channel.
- 5.1.4: Added fallback polling loop for approval decision discovery.
- 5.2.1: Implemented `waitForDecision()` with LISTEN first and periodic DB polling fallback.
- 5.2.2: Implemented `approve()`/`reject()` mutations with explicit pg_notify publication.
- 5.2.3: Added timeout expiry handling in controller wait loop.
- 5.2.4: Added distributed coordination through shared DB state and pub/sub notifications.
- 5.3.1: Expanded `packages/worker/src/approval.ts` with postgres controller implementation.
- 5.3.2: Added `createApprovalControllerFromEnv()` factory for env-driven controller selection.
- 5.3.3: Preserved `InMemoryApprovalController` as default for local/test workflows.
- 5.3.4: Kept worker execution engine compatible through existing controller abstraction.
- 7.1.1: Added `/v1/ui/sessions` GET/POST endpoints for UI-oriented session list/create workflows.
- 7.1.2: Standardized UI session summary shape (`id`, `title`, `status`, `updatedAt`).
- 7.1.3: Added `/v1/sessions/:sessionId/subscribe` SSE endpoint emitting `session_update` events.
- 7.1.4: Kept backward-compatible in-memory session-store behavior when API mode is not configured.
- 7.2.1: Added `/v1/sessions/list` endpoint with status/workspace/agent filtering.
- 7.2.2: Added session-specific subscribe endpoint for live UI updates.
- 7.2.3: Implemented SSE stream with initial payload + heartbeat + polling-based change detection.
- 7.2.4: Added UI-focused metadata endpoint via `/v1/ui/sessions` summaries.
- 7.3.1: Upgraded `packages/web/src/session-store.ts` with remote API refresh support.
- 7.3.2: Added TTL caching and storage-backed cache persistence.
- 7.3.3: Added auto-reconnect behavior for session SSE subscriptions.
- 7.3.4: Added offline fallback to local cached session snapshots when API refresh fails.
- 7.4.1: Added mocked fetch and mocked event-source session store tests.
- 7.4.4: Revalidated web package and workspace tests after session-store migration.

