# Persistence Layer Technical Design

## Table of Contents

1. [Overview](#1-overview)
2. [Requirements](#2-requirements)
3. [Database Schema Design](#3-database-schema-design)
4. [TypeScript Interfaces](#4-typescript-interfaces)
5. [Repository Architecture](#5-repository-architecture)
6. [Migration Strategy](#6-migration-strategy)
7. [Event Persistence Strategy](#7-event-persistence-strategy)
8. [Operational Procedures](#8-operational-procedures)
9. [Performance Considerations](#9-performance-considerations)
10. [Security Considerations](#10-security-considerations)
11. [Monitoring and Observability](#11-monitoring-and-observability)
12. [Disaster Recovery](#12-disaster-recovery)
13. [Testing Strategy](#13-testing-strategy)
14. [Rollout Plan](#14-rollout-plan)

---

## 1. Overview

### 1.1 Purpose

This document describes the persistence layer design for Pi Mission Control, which provides durable storage for:

- **Core entities**: Users, agents, sessions, runs, approvals
- **Event streams**: Transcript events and run-scoped events
- **Workspace metadata**: Workspace definitions and isolation boundaries
- **Audit trail**: All control plane actions with full provenance

### 1.2 Design Principles

1. **PostgreSQL-first**: Use PostgreSQL as the primary database with:
   - JSONB columns for flexible event payloads
   - Native array and composite types for structured data
   - Full-text search capabilities for transcript search
   - Foreign keys for referential integrity

2. **Event sourcing-lite**: Events are persisted for replay and audit, with:
   - Immutable event logs with strict sequence ordering
   - Dual storage (run-scoped + session-scoped) for query optimization
   - Time-based partitioning for large event tables

3. **Idempotency by design**: All mutations use:
   - Deterministic ID generation (ULID or UUIDv7)
   - Optimistic concurrency control with version columns
   - Idempotency keys for external-facing operations

4. **Queryable first**: Schema optimized for:
   - Common access patterns (list by status, time range)
   - Real-time stream delivery (sequence-based cursors)
   - Administrative queries (orphaned resources, retention)

5. **Migration-ready**: Support:
   - Zero-downtime schema migrations
   - Backward-compatible API versioning
   - Graceful migration from in-memory to database

### 1.3 Current State

The system currently uses in-memory persistence (`InMemoryControlApiStore`) which:

- **Pros**: Fast, simple, no operational overhead
- **Cons**: No durability, no cross-process sharing, lost data on restart

This design document specifies the migration to PostgreSQL-based persistence while maintaining API compatibility.

---

## 2. Requirements

### 2.1 Functional Requirements

| Requirement | Description | Priority |
|-------------|-------------|----------|
| PERSIST-001 | All control plane entities must be durable across restarts | P0 |
| PERSIST-002 | Events must be persisted in strict sequence order per run/session | P0 |
| PERSIST-003 | Transcript replay must support time-based and sequence-based cursors | P0 |
| PERSIST-004 | Approval state must be recoverable after worker crash | P0 |
| PERSIST-005 | Support idempotent message enqueue via idempotency key | P1 |
| PERSIST-006 | Support full-text search across transcripts | P1 |
| PERSIST-007 | Support time-to-live (TTL) for old sessions/events | P2 |
| PERSIST-008 | Support blob storage for large artifacts (patches, logs) | P2 |

### 2.2 Non-Functional Requirements

| Requirement | Target | Priority |
|-------------|--------|----------|
| PERF-001 | Write latency < 10ms (P50) for entity mutations | P0 |
| PERF-002 | Event append latency < 20ms (P50) | P0 |
| PERF-003 | Read latency < 50ms (P95) for single entity lookup | P0 |
| PERF-004 | Transcript replay throughput > 1000 events/sec | P0 |
| PERF-005 | Support 100+ concurrent writers | P1 |
| RELI-001 | 99.9% availability for read/write operations | P0 |
| RELI-002 | No data loss on single-node failure | P0 |
| RELI-003 | Recovery time < 5 minutes from backup | P1 |
| SCAL-001 | Support 1M+ events in retention window | P1 |
| SCAL-002 | Support 10K+ active sessions | P2 |

### 2.3 Constraints

1. **PostgreSQL 15+**: Must use features available in PostgreSQL 15 or later
2. **Node.js 20+**: Database client must be compatible with Node.js 20+
3. **Existing API compatibility**: Must not break existing OpenAPI contracts
4. **Docker-friendly**: Must support Docker Compose local development
5. **Minimal external dependencies**: Prefer single-database solution over multi-store

---

## 3. Database Schema Design

### 3.1 Naming Conventions

- **Tables**: `snake_case` singular (e.g., `agent`, `session`, not `agents`, `sessions`)
- **Columns**: `snake_case`
- **Indexes**: `idx_<table>_<columns>` or `uk_<table>_<columns>` for unique
- **Foreign keys**: `fk_<table>_<referenced_table>_<column>`
- **Constraints**: `chk_<table>_<condition>`
- **Sequences**: Used for sequence numbers (auto-generated)

### 3.2 Core Tables

#### 3.2.1 Users

```sql
CREATE TABLE users (
    id                TEXT PRIMARY KEY,
    email             TEXT NOT NULL UNIQUE,
    display_name      TEXT,
    external_id       TEXT,
    external_provider TEXT, -- 'oidc', 'github', etc.
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_external ON users(external_id, external_provider);

-- Comments
COMMENT ON TABLE users IS 'User accounts and identity mapping';
COMMENT ON COLUMN users.external_id IS 'External identity provider user ID';
COMMENT ON COLUMN users.external_provider IS 'External identity provider (oidc, github, etc.)';
```

#### 3.2.2 Workspace

```sql
CREATE TYPE workspace_isolation_mode AS ENUM ('local', 'container', 'worktree');

CREATE TABLE workspace (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT,
    repo_url        TEXT NOT NULL,
    default_branch  TEXT DEFAULT 'main',
    isolation_mode  workspace_isolation_mode NOT NULL DEFAULT 'local',
    base_path       TEXT, -- Local filesystem path or container image reference
    created_by      TEXT REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_workspace_created_by ON workspace(created_by);
CREATE INDEX idx_workspace_repo_url ON workspace(repo_url);

-- Comments
COMMENT ON TABLE workspace IS 'Workspace definitions for isolated execution environments';
COMMENT ON COLUMN workspace.isolation_mode IS 'Isolation strategy: local symlink, container, or git worktree';
COMMENT ON COLUMN workspace.base_path IS 'Local path or container reference for workspace root';
```

#### 3.2.3 Agent

```sql
CREATE TABLE agent (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    description    TEXT,
    model          TEXT NOT NULL,
    default_tools  TEXT[] NOT NULL DEFAULT ARRAY['read', 'bash', 'edit', 'write'],
    policy_id      TEXT,
    config_json    JSONB DEFAULT '{}'::jsonb, -- Extended model config
    created_by     TEXT REFERENCES users(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at     TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_agent_created_by ON agent(created_by);
CREATE INDEX idx_agent_policy_id ON agent(policy_id);

-- Comments
COMMENT ON TABLE agent IS 'Agent profiles with model, tools, and policy configuration';
COMMENT ON COLUMN agent.default_tools IS 'Default tool set for new sessions';
COMMENT ON COLUMN agent.policy_id IS 'Policy profile ID for approval gating';
COMMENT ON COLUMN agent.config_json IS 'Extended model configuration (temperature, max_tokens, etc.)';
```

#### 3.2.4 Session

```sql
CREATE TYPE session_status AS ENUM (
    'idle',
    'running',
    'waiting_approval',
    'failed',
    'archived'
);

CREATE TABLE session (
    id           TEXT PRIMARY KEY,
    agent_id     TEXT NOT NULL REFERENCES agent(id) ON DELETE RESTRICT,
    workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE RESTRICT,
    status       session_status NOT NULL DEFAULT 'idle',
    title        TEXT NOT NULL,
    created_by   TEXT NOT NULL REFERENCES users(id),
    metadata_json JSONB DEFAULT '{}'::jsonb, -- Custom session metadata
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at  TIMESTAMPTZ,
    deleted_at   TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX idx_session_agent_id ON session(agent_id);
CREATE INDEX idx_session_workspace_id ON session(workspace_id);
CREATE INDEX idx_session_created_by ON session(created_by);
CREATE INDEX idx_session_status ON session(status);
CREATE INDEX idx_session_created_at ON session(created_at DESC);

-- Composite index for session listing with filters
CREATE INDEX idx_session_status_created_at ON session(status, created_at DESC);

-- Comments
COMMENT ON TABLE session IS 'Agent sessions for persistent conversations';
COMMENT ON COLUMN session.status IS 'Current session state';
COMMENT ON COLUMN session.metadata_json IS 'Custom metadata (tags, context, etc.)';
```

#### 3.2.5 Run

```sql
CREATE TYPE run_status AS ENUM (
    'queued',
    'running',
    'waiting_approval',
    'completed',
    'failed',
    'canceled',
    'orphaned'
);

CREATE TABLE run (
    id              TEXT PRIMARY KEY,
    session_id      TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    status          run_status NOT NULL DEFAULT 'queued',
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at     TIMESTAMPTZ,
    error_code      TEXT,
    error_message   TEXT,
    cost_usd        NUMERIC(10, 4), -- Up to 9999.9999 USD
    worker_id       TEXT, -- Worker instance identifier
    retry_count     INTEGER NOT NULL DEFAULT 0,
    metadata_json   JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_run_session_id ON run(session_id);
CREATE INDEX idx_run_status ON run(status);
CREATE INDEX idx_run_started_at ON run(started_at DESC);
CREATE INDEX idx_run_worker_id ON run(worker_id);

-- Composite index for finding orphaned runs
CREATE INDEX idx_run_status_started_at ON run(status, started_at);

-- Comments
COMMENT ON TABLE run IS 'Individual agent execution runs within a session';
COMMENT ON COLUMN run.status IS 'Run lifecycle state';
COMMENT ON COLUMN run.worker_id IS 'Worker instance that processed this run';
COMMENT ON COLUMN run.retry_count IS 'Number of retry attempts';
```

#### 3.2.6 Approval

```sql
CREATE TYPE approval_state AS ENUM (
    'pending',
    'approved',
    'rejected',
    'expired'
);

CREATE TABLE approval (
    id            TEXT PRIMARY KEY,
    run_id        TEXT NOT NULL REFERENCES run(id) ON DELETE CASCADE,
    state         approval_state NOT NULL DEFAULT 'pending',
    tool_name     TEXT NOT NULL,
    tool_input    JSONB NOT NULL,
    risk_level    TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
    summary       TEXT,
    timeout_at    TIMESTAMPTZ NOT NULL,
    decided_at    TIMESTAMPTZ,
    actor_id      TEXT REFERENCES users(id),
    reason        TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_approval_run_id ON approval(run_id);
CREATE INDEX idx_approval_state ON approval(state);
CREATE INDEX idx_approval_actor_id ON approval(actor_id);
CREATE INDEX idx_approval_timeout_at ON approval(timeout_at) WHERE state = 'pending';

-- Comments
COMMENT ON TABLE approval IS 'Approval requests for gated tool actions';
COMMENT ON COLUMN approval.timeout_at IS 'When this approval automatically expires';
COMMENT ON COLUMN approval.actor_id IS 'User who approved/rejected';
```

#### 3.2.7 Message (Optional - can be derived from events)

```sql
CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system');

CREATE TABLE message (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    run_id      TEXT REFERENCES run(id) ON DELETE SET NULL,
    role        message_role NOT NULL,
    content     TEXT NOT NULL,
    metadata_json JSONB DEFAULT '{}'::jsonb,
    sequence    INTEGER NOT NULL, -- Within session
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint for sequence ordering
CREATE UNIQUE INDEX uk_message_session_sequence ON message(session_id, sequence);

-- Indexes
CREATE INDEX idx_message_session_id ON message(session_id);
CREATE INDEX idx_message_run_id ON message(run_id);
CREATE INDEX idx_message_created_at ON message(created_at DESC);

-- Comments
COMMENT ON TABLE message IS 'High-level messages within sessions (optional, events are primary)';
COMMENT ON COLUMN message.sequence IS 'Monotonic sequence number within session';
```

### 3.3 Event Tables

#### 3.3.1 Session Transcript Events

```sql
-- Event types for transcript events
CREATE TYPE transcript_event_type AS ENUM (
    'user_message_seeded',
    'message_queued',
    'message_update',
    'approval_required',
    'approval_decided',
    'run_started',
    'run_completed',
    'run_failed',
    'system_note'
);

CREATE TABLE transcript_event (
    id          BIGSERIAL PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    run_id      TEXT REFERENCES run(id) ON DELETE SET NULL,
    sequence    INTEGER NOT NULL,
    event_type  transcript_event_type NOT NULL,
    payload     JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint for strict ordering
CREATE UNIQUE INDEX uk_transcript_event_session_sequence
    ON transcript_event(session_id, sequence);

-- Indexes for query patterns
CREATE INDEX idx_transcript_event_session_id ON transcript_event(session_id);
CREATE INDEX idx_transcript_event_run_id ON transcript_event(run_id);
CREATE INDEX idx_transcript_event_created_at ON transcript_event(created_at DESC);
CREATE INDEX idx_transcript_event_payload ON transcript_event USING GIN (payload);

-- Comments
COMMENT ON TABLE transcript_event IS 'Session-scoped transcript events for conversation history';
COMMENT ON COLUMN transcript_event.sequence IS 'Sequence number within session';
COMMENT ON COLUMN transcript_event.event_type IS 'Type of event (union of all event types)';
COMMENT ON COLUMN transcript_event.payload IS 'Event-specific data as JSONB';
```

#### 3.3.2 Run Events

```sql
-- Event types for run-scoped events
CREATE TYPE run_event_type AS ENUM (
    'assistant_text_delta',
    'tool_call_started',
    'tool_call_completed',
    'run_status',
    'approval_required',
    'approval_decided',
    'run_completed',
    'run_failed'
);

CREATE TABLE run_event (
    id          BIGSERIAL PRIMARY KEY,
    run_id      TEXT NOT NULL REFERENCES run(id) ON DELETE CASCADE,
    session_id  TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    sequence    INTEGER NOT NULL,
    event_type  run_event_type NOT NULL,
    payload     JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint for strict ordering
CREATE UNIQUE INDEX uk_run_event_run_sequence
    ON run_event(run_id, sequence);

-- Indexes for query patterns
CREATE INDEX idx_run_event_run_id ON run_event(run_id);
CREATE INDEX idx_run_event_session_id ON run_event(session_id);
CREATE INDEX idx_run_event_created_at ON run_event(created_at DESC);
CREATE INDEX idx_run_event_payload ON run_event USING GIN (payload);

-- Composite index for replay queries
CREATE INDEX idx_run_event_run_sequence ON run_event(run_id, sequence);

-- Comments
COMMENT ON TABLE run_event IS 'Run-scoped events for detailed execution timeline';
COMMENT ON COLUMN run_event.sequence IS 'Sequence number within run';
COMMENT ON COLUMN run_event.event_type IS 'Type of event from worker runtime';
```

### 3.4 Idempotency Table

```sql
CREATE TABLE idempotency_key (
    key         TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id   TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

-- Indexes
CREATE INDEX idx_idempotency_key_expires_at ON idempotency_key(expires_at);

-- Comments
COMMENT ON TABLE idempotency_key IS 'Idempotency keys for deduplicating external requests';
COMMENT ON COLUMN idempotency_key.expires_at IS 'When this key can be garbage collected';
```

### 3.5 Retention Policy Tables

```sql
CREATE TABLE retention_policy (
    id              TEXT PRIMARY KEY,
    entity_type     TEXT NOT NULL UNIQUE, -- 'session', 'transcript_event', 'run_event'
    retention_days  INTEGER NOT NULL,
    hard_delete_days INTEGER NOT NULL, -- Days before hard delete from archive
    metadata_json   JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Comments
COMMENT ON TABLE retention_policy IS 'Retention policies for automated cleanup';
COMMENT ON COLUMN retention_policy.hard_delete_days IS 'Days before permanent deletion from archive';
```

### 3.6 Audit Log Table

```sql
CREATE TABLE audit_log (
    id          BIGSERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id   TEXT NOT NULL,
    action      TEXT NOT NULL, -- 'create', 'update', 'delete', 'approve', 'reject', etc.
    actor_id    TEXT REFERENCES users(id),
    actor_type  TEXT NOT NULL, -- 'user', 'system', 'worker'
    changes     JSONB, -- Before/after values or delta
    ip_address  INET,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_actor_id ON audit_log(actor_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);

-- Comments
COMMENT ON TABLE audit_log IS 'Immutable audit trail for all control plane actions';
COMMENT ON COLUMN audit_log.changes IS 'JSONB representation of state changes';
```

---

## 4. TypeScript Interfaces

### 4.1 Domain Types (packages/control-api/src/persistence/types.ts)

```typescript
/**
 * Core domain types for persistence layer
 * These map directly to database tables
 */

// ============================================================================
// Users
// ============================================================================

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  externalId: string | null;
  externalProvider: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateUserInput {
  email: string;
  displayName?: string;
  externalId?: string;
  externalProvider?: string;
}

// ============================================================================
// Workspace
// ============================================================================

export type WorkspaceIsolationMode = "local" | "container" | "worktree";

export interface Workspace {
  id: string;
  name: string;
  description: string | null;
  repoUrl: string;
  defaultBranch: string;
  isolationMode: WorkspaceIsolationMode;
  basePath: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateWorkspaceInput {
  name: string;
  description?: string;
  repoUrl: string;
  defaultBranch?: string;
  isolationMode?: WorkspaceIsolationMode;
  basePath?: string;
  createdBy?: string;
}

// ============================================================================
// Agent
// ============================================================================

export interface Agent {
  id: string;
  name: string;
  description: string | null;
  model: string;
  defaultTools: string[];
  policyId: string | null;
  configJson: Record<string, unknown>;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  model: string;
  defaultTools?: string[];
  policyId?: string;
  configJson?: Record<string, unknown>;
  createdBy?: string;
}

// ============================================================================
// Session
// ============================================================================

export type SessionStatus =
  | "idle"
  | "running"
  | "waiting_approval"
  | "failed"
  | "archived";

export interface Session {
  id: string;
  agentId: string;
  workspaceId: string;
  status: SessionStatus;
  title: string;
  createdBy: string;
  metadataJson: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  deletedAt: Date | null;
}

export interface CreateSessionInput {
  agentId: string;
  workspaceId: string;
  title: string;
  createdBy: string;
  metadataJson?: Record<string, unknown>;
  seedPrompt?: string;
}

export interface ListSessionsFilter {
  status?: SessionStatus;
  agentId?: string;
  workspaceId?: string;
  createdBy?: string;
  after?: Date; // Pagination cursor
  before?: Date;
  limit?: number;
}

// ============================================================================
// Run
// ============================================================================

export type RunStatus =
  | "queued"
  | "running"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "canceled"
  | "orphaned";

export interface Run {
  id: string;
  sessionId: string;
  status: RunStatus;
  startedAt: Date;
  finishedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  costUsd: number | null;
  workerId: string | null;
  retryCount: number;
  metadataJson: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRunInput {
  sessionId: string;
  workerId?: string;
  metadataJson?: Record<string, unknown>;
}

export interface UpdateRunInput {
  status?: RunStatus;
  finishedAt?: Date;
  errorCode?: string;
  errorMessage?: string;
  costUsd?: number;
  workerId?: string;
  metadataJson?: Record<string, unknown>;
}

export interface ListRunsFilter {
  sessionId?: string;
  status?: RunStatus;
  workerId?: string;
  after?: Date;
  before?: Date;
  limit?: number;
}

// ============================================================================
// Approval
// ============================================================================

export type ApprovalState = "pending" | "approved" | "rejected" | "expired";

export type RiskLevel = "low" | "medium" | "high";

export interface Approval {
  id: string;
  runId: string;
  state: ApprovalState;
  toolName: string;
  toolInput: Record<string, unknown>;
  riskLevel: RiskLevel;
  summary: string | null;
  timeoutAt: Date;
  decidedAt: Date | null;
  actorId: string | null;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateApprovalInput {
  runId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  riskLevel: RiskLevel;
  summary?: string;
  timeoutMs: number;
}

export interface DecideApprovalInput {
  state: "approved" | "rejected";
  actorId: string;
  reason?: string;
}

export interface ListApprovalsFilter {
  runId?: string;
  state?: ApprovalState;
  actorId?: string;
  after?: Date;
  before?: Date;
  limit?: number;
}

// ============================================================================
// Transcript Events
// ============================================================================

export type TranscriptEventType =
  | "user_message_seeded"
  | "message_queued"
  | "message_update"
  | "approval_required"
  | "approval_decided"
  | "run_started"
  | "run_completed"
  | "run_failed"
  | "system_note";

export interface TranscriptEvent {
  id: number; // BIGSERIAL
  sessionId: string;
  runId: string | null;
  sequence: number;
  eventType: TranscriptEventType;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface CreateTranscriptEventInput {
  sessionId: string;
  runId?: string;
  eventType: TranscriptEventType;
  payload: Record<string, unknown>;
}

export interface TranscriptFilter {
  sessionId: string;
  runId?: string;
  fromSequence?: number;
  toSequence?: number;
  eventTypes?: TranscriptEventType[];
  limit?: number;
}

// ============================================================================
// Run Events
// ============================================================================

export type RunEventType =
  | "assistant_text_delta"
  | "tool_call_started"
  | "tool_call_completed"
  | "run_status"
  | "approval_required"
  | "approval_decided"
  | "run_completed"
  | "run_failed";

export interface RunEvent {
  id: number; // BIGSERIAL
  runId: string;
  sessionId: string;
  sequence: number;
  eventType: RunEventType;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface CreateRunEventInput {
  runId: string;
  sessionId: string;
  eventType: RunEventType;
  payload: Record<string, unknown>;
}

export interface RunEventFilter {
  runId: string;
  sessionId?: string;
  fromSequence?: number;
  toSequence?: number;
  eventTypes?: RunEventType[];
  limit?: number;
}

// ============================================================================
// Idempotency
// ============================================================================

export interface IdempotencyKey {
  key: string;
  entityType: string;
  entityId: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface CreateIdempotencyKeyInput {
  key: string;
  entityType: string;
  entityId: string;
  ttlHours?: number; // Default 24
}

// ============================================================================
// Envelope Types (for API responses)
// ============================================================================

export interface TranscriptResponse {
  sessionId: string;
  nextSequence: number;
  events: TranscriptEvent[];
}

export interface RunEventsReplayResponse {
  runId: string;
  nextSequence: number;
  events: RunEvent[];
}

export interface RunStreamEventEnvelope {
  sessionId: string;
  runId: string;
  sequence: number;
  timestamp: string;
  event: {
    type: string;
    payload: Record<string, unknown>;
  };
}
```

### 4.2 Repository Interfaces (packages/control-api/src/persistence/repository.ts)

```typescript
/**
 * Repository interfaces for data access
 * These define the contract for persistence operations
 */

import type {
  Agent,
  Approval,
  CreateAgentInput,
  CreateApprovalInput,
  CreateRunEventInput,
  CreateRunInput,
  CreateSessionInput,
  CreateTranscriptEventInput,
  CreateWorkspaceInput,
  DecideApprovalInput,
  ListApprovalsFilter,
  ListRunsFilter,
  ListSessionsFilter,
  Run,
  RunEvent,
  RunEventFilter,
  Session,
  TranscriptEvent,
  TranscriptFilter,
  UpdateRunInput,
  User,
  Workspace,
} from "./types.js";

// ============================================================================
// Base Repository Pattern
// ============================================================================

export interface Transaction {
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface Repository {
  // Begin a transaction for multi-entity operations
  beginTransaction(): Promise<Transaction>;
}

// ============================================================================
// User Repository
// ============================================================================

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByExternalId(externalId: string, provider: string): Promise<User | null>;
  list(limit?: number): Promise<User[]>;
  create(user: User): Promise<User>;
  update(user: User): Promise<User>;
  delete(id: string): Promise<void>;
}

// ============================================================================
// Workspace Repository
// ============================================================================

export interface WorkspaceRepository {
  findById(id: string): Promise<Workspace | null>;
  findByRepoUrl(repoUrl: string): Promise<Workspace | null>;
  listByCreator(createdBy: string, limit?: number): Promise<Workspace[]>;
  list(limit?: number): Promise<Workspace[]>;
  create(input: CreateWorkspaceInput): Promise<Workspace>;
  update(workspace: Workspace): Promise<Workspace>;
  delete(id: string): Promise<void>;
}

// ============================================================================
// Agent Repository
// ============================================================================

export interface AgentRepository {
  findById(id: string): Promise<Agent | null>;
  list(limit?: number): Promise<Agent[]>;
  listByCreator(createdBy: string, limit?: number): Promise<Agent[]>;
  create(input: CreateAgentInput): Promise<Agent>;
  update(agent: Agent): Promise<Agent>;
  delete(id: string): Promise<void>;
}

// ============================================================================
// Session Repository
// ============================================================================

export interface SessionRepository {
  findById(id: string): Promise<Session | null>;
  findActiveByWorkspace(workspaceId: string): Promise<Session[]>;
  list(filter?: ListSessionsFilter): Promise<Session[]>;
  create(input: CreateSessionInput, tx?: Transaction): Promise<Session>;
  update(session: Session, tx?: Transaction): Promise<Session>;
  updateStatus(id: string, status: Session["status"], tx?: Transaction): Promise<void>;
  archive(id: string, tx?: Transaction): Promise<void>;
  delete(id: string): Promise<void>;

  // Transcript sequence management
  getNextSequence(sessionId: string, tx?: Transaction): Promise<number>;
}

// ============================================================================
// Run Repository
// ============================================================================

export interface RunRepository {
  findById(id: string): Promise<Run | null>;
  list(filter?: ListRunsFilter): Promise<Run[]>;
  findOrphaned(timeoutMinutes: number): Promise<Run[]>;
  create(input: CreateRunInput, tx?: Transaction): Promise<Run>;
  update(id: string, input: UpdateRunInput, tx?: Transaction): Promise<Run>;
  updateStatus(id: string, status: Run["status"], tx?: Transaction): Promise<void>;
  incrementRetryCount(id: string): Promise<number>;
  delete(id: string): Promise<void>;
}

// ============================================================================
// Approval Repository
// ============================================================================

export interface ApprovalRepository {
  findById(id: string): Promise<Approval | null>;
  findByRunId(runId: string): Promise<Approval[]>;
  findPendingByRunId(runId: string): Promise<Approval | null>;
  list(filter?: ListApprovalsFilter): Promise<Approval[]>;
  findExpired(): Promise<Approval[]>;
  create(input: CreateApprovalInput, tx?: Transaction): Promise<Approval>;
  decide(id: string, input: DecideApprovalInput, tx?: Transaction): Promise<Approval>;
  expire(id: string, tx?: Transaction): Promise<Approval>;
  delete(id: string): Promise<void>;
}

// ============================================================================
// Transcript Event Repository
// ============================================================================

export interface TranscriptEventRepository {
  findById(id: number): Promise<TranscriptEvent | null>;
  list(filter: TranscriptFilter): Promise<TranscriptEvent[]>;
  create(input: CreateTranscriptEventInput, tx?: Transaction): Promise<TranscriptEvent>;
  createBatch(inputs: CreateTranscriptEventInput[], tx?: Transaction): Promise<TranscriptEvent[]>;
  deleteBySession(sessionId: string, tx?: Transaction): Promise<void>;
  deleteByRun(runId: string, tx?: Transaction): Promise<void>;

  // Sequence management
  getNextSequence(sessionId: string, tx?: Transaction): Promise<number>;
}

// ============================================================================
// Run Event Repository
// ============================================================================

export interface RunEventRepository {
  findById(id: number): Promise<RunEvent | null>;
  list(filter: RunEventFilter): Promise<RunEvent[]>;
  create(input: CreateRunEventInput, tx?: Transaction): Promise<RunEvent>;
  createBatch(inputs: CreateRunEventInput[], tx?: Transaction): Promise<RunEvent[]>;
  deleteByRun(runId: string, tx?: Transaction): Promise<void>;

  // Sequence management
  getNextSequence(runId: string, tx?: Transaction): Promise<number>;
}

// ============================================================================
// Idempotency Repository
// ============================================================================

export interface IdempotencyRepository {
  findByKey(key: string): Promise<IdempotencyKey | null>;
  create(input: CreateIdempotencyKeyInput): Promise<IdempotencyKey>;
  delete(key: string): Promise<void>;
  deleteExpired(): Promise<number>;
}

// ============================================================================
// Composite Repository (all-in-one)
// ============================================================================

export interface ControlApiRepository
  extends Repository,
    UserRepository,
    WorkspaceRepository,
    AgentRepository,
    SessionRepository,
    RunRepository,
    ApprovalRepository,
    TranscriptEventRepository,
    RunEventRepository,
    IdempotencyRepository {}
```

---

## 5. Repository Architecture

### 5.1 Layer Structure

```
packages/control-api/src/persistence/
├── index.ts                    # Public exports
├── types.ts                    # Domain types
├── repository.ts              # Repository interfaces
├── database.ts                # Database connection management
├── migrations/                # SQL migration files
│   ├── 001_initial_schema.sql
│   ├── 002_add_indexes.sql
│   └── ...
├── repositories/              # Repository implementations
│   ├── base.ts               # Base repository with common queries
│   ├── user.repository.ts
│   ├── workspace.repository.ts
│   ├── agent.repository.ts
│   ├── session.repository.ts
│   ├── run.repository.ts
│   ├── approval.repository.ts
│   ├── transcript-event.repository.ts
│   ├── run-event.repository.ts
│   └── idempotency.repository.ts
├── mappers/                   # DB row -> domain object mappers
│   ├── user.mapper.ts
│   ├── workspace.mapper.ts
│   ├── agent.mapper.ts
│   ├── session.mapper.ts
│   ├── run.mapper.ts
│   └── approval.mapper.ts
└── control-api-store.ts       # Postgres implementation of ControlApiStore interface
```

### 5.2 Database Connection Management (packages/control-api/src/persistence/database.ts)

```typescript
import pg from "pg";
import { Pool, PoolConfig } from "pg";

/**
 * Database connection manager
 * Provides connection pooling and query execution
 */

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  pool?: {
    min?: number;
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
  };
}

export class Database {
  private pool: Pool;

  constructor(config: DatabaseConfig) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      min: config.pool?.min ?? 2,
      max: config.pool?.max ?? 20,
      idleTimeoutMillis: config.pool?.idleTimeoutMillis ?? 30000,
      connectionTimeoutMillis: config.pool?.connectionTimeoutMillis ?? 10000,
    });

    // Handle pool errors
    this.pool.on("error", (err) => {
      console.error("Unexpected database pool error:", err);
    });
  }

  /**
   * Execute a query and return all rows
   */
  async query<T = unknown>(
    sql: string,
    params?: unknown[]
  ): Promise<pg.QueryResult<T>> {
    const client = await this.pool.connect();
    try {
      return await client.query<T>(sql, params);
    } finally {
      client.release();
    }
  }

  /**
   * Execute a query within a transaction
   */
  async transaction<T>(
    callback: (client: pg.PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get a raw client for manual transaction management
   */
  async getClient(): Promise<pg.PoolClient> {
    return this.pool.connect();
  }

  /**
   * Close all connections in the pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }
}
```

### 5.3 Example Repository Implementation (packages/control-api/src/persistence/repositories/session.repository.ts)

```typescript
import type { Session, CreateSessionInput, ListSessionsFilter, Transaction } from "../types.js";
import type { SessionRepository } from "../repository.js";
import { Database } from "../database.js";

export class PostgresSessionRepository implements SessionRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string): Promise<Session | null> {
    const result = await this.db.query<Session>(
      `SELECT * FROM session WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async findActiveByWorkspace(workspaceId: string): Promise<Session[]> {
    const result = await this.db.query<Session>(
      `SELECT * FROM session
       WHERE workspace_id = $1
         AND status NOT IN ('archived', 'failed')
         AND deleted_at IS NULL
       ORDER BY updated_at DESC`,
      [workspaceId]
    );
    return result.rows;
  }

  async list(filter?: ListSessionsFilter): Promise<Session[]> {
    const conditions: string[] = ["deleted_at IS NULL"];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filter?.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filter.status);
    }

    if (filter?.agentId) {
      conditions.push(`agent_id = $${paramIndex++}`);
      params.push(filter.agentId);
    }

    if (filter?.workspaceId) {
      conditions.push(`workspace_id = $${paramIndex++}`);
      params.push(filter.workspaceId);
    }

    if (filter?.createdBy) {
      conditions.push(`created_by = $${paramIndex++}`);
      params.push(filter.createdBy);
    }

    if (filter?.after) {
      conditions.push(`created_at > $${paramIndex++}`);
      params.push(filter.after);
    }

    if (filter?.before) {
      conditions.push(`created_at < $${paramIndex++}`);
      params.push(filter.before);
    }

    const limit = filter?.limit ?? 100;
    params.push(limit);

    const sql = `
      SELECT * FROM session
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT $${paramIndex}
    `;

    const result = await this.db.query<Session>(sql, params);
    return result.rows;
  }

  async create(input: CreateSessionInput, tx?: Transaction): Promise<Session> {
    const sql = `
      INSERT INTO session (
        id, agent_id, workspace_id, status, title, created_by,
        metadata_json, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, NOW(), NOW()
      )
      RETURNING *
    `;

    const params = [
      input.id, // Caller should generate ID
      input.agentId,
      input.workspaceId,
      "idle",
      input.title,
      input.createdBy,
      input.metadataJson ?? {},
    ];

    // Use transaction if provided
    if (tx) {
      const client = (tx as any).client;
      const result = await client.query<Session>(sql, params);
      return result.rows[0];
    }

    const result = await this.db.query<Session>(sql, params);
    return result.rows[0];
  }

  async update(session: Session, tx?: Transaction): Promise<Session> {
    const sql = `
      UPDATE session
      SET status = $2,
          title = $3,
          metadata_json = $4,
          updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;

    const params = [
      session.id,
      session.status,
      session.title,
      session.metadataJson,
    ];

    if (tx) {
      const client = (tx as any).client;
      const result = await client.query<Session>(sql, params);
      return result.rows[0];
    }

    const result = await this.db.query<Session>(sql, params);
    return result.rows[0];
  }

  async updateStatus(
    id: string,
    status: Session["status"],
    tx?: Transaction
  ): Promise<void> {
    const sql = `UPDATE session SET status = $2, updated_at = NOW() WHERE id = $1`;

    if (tx) {
      const client = (tx as any).client;
      await client.query(sql, [id, status]);
    } else {
      await this.db.query(sql, [id, status]);
    }
  }

  async archive(id: string, tx?: Transaction): Promise<void> {
    const sql = `UPDATE session SET status = 'archived', archived_at = NOW(), updated_at = NOW() WHERE id = $1`;

    if (tx) {
      const client = (tx as any).client;
      await client.query(sql, [id]);
    } else {
      await this.db.query(sql, [id]);
    }
  }

  async delete(id: string): Promise<void> {
    await this.db.query(`UPDATE session SET deleted_at = NOW() WHERE id = $1`, [id]);
  }

  async getNextSequence(sessionId: string, tx?: Transaction): Promise<number> {
    const sql = `
      SELECT COALESCE(MAX(sequence), 0) + 1 AS next_seq
      FROM transcript_event
      WHERE session_id = $1
    `;

    if (tx) {
      const client = (tx as any).client;
      const result = await client.query<{ next_seq: number }>(sql, [sessionId]);
      return result.rows[0]?.next_seq ?? 1;
    }

    const result = await this.db.query<{ next_seq: number }>(sql, [sessionId]);
    return result.rows[0]?.next_seq ?? 1;
  }

  async beginTransaction(): Promise<Transaction> {
    const client = await this.db.getClient();
    await client.query("BEGIN");
    return {
      async commit() {
        await client.query("COMMIT");
        client.release();
      },
      async rollback() {
        await client.query("ROLLBACK");
        client.release();
      },
    };
  }
}
```

### 5.4 ControlApiStore Implementation (packages/control-api/src/persistence/control-api-store.ts)

```typescript
/**
 * PostgreSQL-backed implementation of ControlApiStore interface
 * Maintains API compatibility while providing durable persistence
 */

import { randomUUID } from "node:crypto";

import type {
  Agent,
  Approval,
  CreateApprovalInput,
  CreateRunEventInput,
  CreateRunInput,
  CreateSessionInput,
  DecideApprovalInput,
  Run,
  Session,
  TranscriptEvent,
} from "./types.js";
import type { ControlApiRepository } from "./repository.js";

export class PostgresControlApiStore {
  constructor(private readonly repository: ControlApiRepository) {}

  // ============================================================================
  // Agents
  // ============================================================================

  async listAgents(): Promise<Agent[]> {
    return this.repository.list();
  }

  async getAgent(agentId: string): Promise<Agent | null> {
    return this.repository.findById(agentId);
  }

  async createAgent(input: {
    name: string;
    model: string;
    defaultTools?: string[];
    policyId?: string;
  }): Promise<Agent> {
    return this.repository.create({
      name: input.name,
      model: input.model,
      defaultTools: input.defaultTools ?? ["read", "bash", "edit", "write"],
      policyId: input.policyId ?? "policy_default",
    });
  }

  // ============================================================================
  // Sessions
  // ============================================================================

  async listSessions(status?: Session["status"]): Promise<Session[]> {
    return this.repository.list({ status });
  }

  async getSession(sessionId: string): Promise<Session | null> {
    return this.repository.findById(sessionId);
  }

  async createSession(input: {
    agentId: string;
    workspaceId: string;
    title?: string;
    createdBy?: string;
    seedPrompt?: string;
  }): Promise<Session> {
    const sessionId = `sess_${randomUUID()}`;

    const tx = await this.repository.beginTransaction();
    try {
      const session = await this.repository.create(
        {
          id: sessionId,
          agentId: input.agentId,
          workspaceId: input.workspaceId,
          title: input.title ?? "Untitled Session",
          createdBy: input.createdBy ?? "system",
        },
        tx
      );

      if (input.seedPrompt) {
        await this.repository.create(
          {
            sessionId,
            eventType: "user_message_seeded",
            payload: { content: input.seedPrompt },
          },
          tx
        );
      }

      await tx.commit();
      return session;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  // ============================================================================
  // Runs
  // ============================================================================

  async getRun(runId: string): Promise<Run | null> {
    return this.repository.findById(runId);
  }

  // ============================================================================
  // Approvals
  // ============================================================================

  async decideApproval(input: {
    runId: string;
    approvalId: string;
    state: "approved" | "rejected";
    actorId: string;
    reason?: string;
  }): Promise<Approval> {
    const approval = await this.repository.findById(input.approvalId);
    if (!approval) {
      throw new Error("Approval not found");
    }

    const tx = await this.repository.beginTransaction();
    try {
      const updated = await this.repository.decide(
        input.approvalId,
        {
          state: input.state,
          actorId: input.actorId,
          reason: input.reason,
        },
        tx
      );

      // Update run status based on decision
      if (input.state === "approved") {
        await this.repository.updateStatus(input.runId, "completed", tx);
      } else {
        await this.repository.update(input.runId, {
          status: "failed",
          finishedAt: new Date(),
          errorCode: "approval_rejected",
          errorMessage: input.reason ?? "Approval rejected",
        });
      }

      // Update session status
      const run = await this.repository.findById(input.runId);
      if (run) {
        await this.repository.updateStatus(
          run.sessionId,
          input.state === "approved" ? "idle" : "failed",
          tx
        );
      }

      await tx.commit();
      return updated;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  // ============================================================================
  // Transcript Events
  // ============================================================================

  async getTranscript(sessionId: string, fromSequence?: number): {
    sessionId: string;
    nextSequence: number;
    events: TranscriptEvent[];
  } {
    const events = await this.repository.list({
      sessionId,
      fromSequence,
    });

    // Get next sequence
    const lastEvent = events[events.length - 1];
    const nextSequence = lastEvent ? lastEvent.sequence + 1 : 1;

    return { sessionId, nextSequence, events };
  }

  // ============================================================================
  // Run Events (Stream)
  // ============================================================================

  async getRunEvents(runId: string, afterSequence = 0): Promise<TranscriptEvent[]> {
    // Note: This returns RunEvent type, but maintaining interface compatibility
    const events = await this.repository.list({
      runId,
      fromSequence: afterSequence + 1,
    });
    return events as unknown as TranscriptEvent[];
  }

  // ============================================================================
  // Enqueue Message
  // ============================================================================

  async enqueueMessage(input: { sessionId: string; content: string }): Promise<{
    run: Run;
    approval: Approval;
  }> {
    const runId = `run_${randomUUID()}`;
    const approvalId = `apr_${randomUUID()}`;

    const tx = await this.repository.beginTransaction();
    try {
      // Create run
      const run = await this.repository.create(
        {
          sessionId: input.sessionId,
        },
        tx
      );

      // Update session status
      await this.repository.updateStatus(input.sessionId, "waiting_approval", tx);

      // Create transcript events
      await this.repository.create(
        {
          sessionId: input.sessionId,
          runId,
          eventType: "message_queued",
          payload: { runId, content: input.content },
        },
        tx
      );

      // Create run-scoped events
      await this.repository.create(
        {
          runId,
          sessionId: input.sessionId,
          eventType: "run_status",
          payload: { status: "waiting_approval" },
        },
        tx
      );

      // Create approval
      const approval = await this.repository.create(
        {
          runId,
          toolName: "bash", // Default for bootstrap
          toolInput: {},
          riskLevel: "high",
          timeoutMs: 5 * 60 * 1000, // 5 minutes
        },
        tx
      );

      await this.repository.create(
        {
          sessionId: input.sessionId,
          runId,
          eventType: "approval_required",
          payload: {
            runId,
            approvalId,
            tool: "bash",
            riskLevel: "high",
          },
        },
        tx
      );

      await tx.commit();
      return { run, approval };
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  // ============================================================================
  // Event Subscription (no-op for Postgres, handled separately via pub/sub)
  // ============================================================================

  subscribeToRunEvents(): () => void {
    // Postgres-based persistence uses NOTIFY/LISTEN for pub/sub
    // This is a no-op to maintain interface compatibility
    return () => {};
  }
}
```

---

## 6. Migration Strategy

### 6.1 Migration Tooling

Use a migration framework compatible with Node.js:

- **Recommended**: `node-pg-migrate` or `dbmate`
- **Alternative**: Custom migration runner using `pg` library

### 6.2 Migration Files Structure

```
packages/control-api/src/persistence/migrations/
├── 001_initial_schema.sql
├── 002_add_indexes.sql
├── 003_add_audit_log.sql
├── 004_add_retention_policies.sql
└── ...
```

### 6.3 Migration Runner (packages/control-api/src/persistence/migrations/runner.ts)

```typescript
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

export interface MigrationRunnerConfig {
  migrationsDir: string;
  dbConfig: pg.ConnectionConfig;
}

export class MigrationRunner {
  constructor(private readonly config: MigrationRunnerConfig) {}

  async run(): Promise<void> {
    const pool = new pg.Pool(this.config.dbConfig);

    try {
      // Create migrations table if not exists
      await pool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // Get executed migrations
      const executedResult = await pool.query(
        "SELECT name FROM schema_migrations ORDER BY id"
      );
      const executed = new Set(executedResult.rows.map((r) => r.name));

      // Get all migration files
      const files = await fs.readdir(this.config.migrationsDir);
      const sqlFiles = files
        .filter((f) => f.endsWith(".sql"))
        .sort();

      // Run pending migrations
      for (const file of sqlFiles) {
        if (executed.has(file)) {
          console.log(`Skipping ${file} (already executed)`);
          continue;
        }

        console.log(`Running ${file}...`);
        const sql = await fs.readFile(
          path.join(this.config.migrationsDir, file),
          "utf-8"
        );

        await pool.query("BEGIN");
        try {
          await pool.query(sql);
          await pool.query(
            "INSERT INTO schema_migrations (name) VALUES ($1)",
            [file]
          );
          await pool.query("COMMIT");
          console.log(`✓ ${file}`);
        } catch (error) {
          await pool.query("ROLLBACK");
          console.error(`✗ ${file}`, error);
          throw error;
        }
      }

      console.log("Migrations completed successfully");
    } finally {
      await pool.end();
    }
  }

  async rollback(steps: number = 1): Promise<void> {
    // Rollback implementation would require tracking down migrations
    // For simplicity, this is left as an exercise
    throw new Error("Rollback not implemented");
  }
}
```

### 6.4 Migration Process

1. **Development**:
   ```bash
   npm run migration:run
   ```

2. **Production**:
   - Run migrations during deployment, before starting the application
   - Use transactional migrations to allow rollback
   - Verify migration success via health check

3. **Rollback**:
   - Maintain down migration files (optional but recommended)
   - Test rollback process in staging environment

### 6.5 Backward Compatibility Strategy

1. **Dual mode support**:
   - Support both in-memory and PostgreSQL persistence via configuration
   - Allow gradual migration of existing deployments

2. **Feature flag**:
   ```bash
   PERSISTENCE_MODE=in-memory  # or postgres
   ```

3. **Data migration**:
   - For existing in-memory data, implement export/import scripts
   - Use JSON dumps for manual migration if needed

---

## 7. Event Persistence Strategy

### 7.1 Event Storage Model

Events are stored in two normalized tables:

1. **`transcript_event`**: Session-scoped events for conversation history
2. **`run_event`**: Run-scoped events for detailed execution timeline

### 7.2 Sequence Ordering

- **Session-level**: `sequence` in `transcript_event` is unique per session
- **Run-level**: `sequence` in `run_event` is unique per run
- **Sequences are allocated**: Using `COALESCE(MAX(sequence), 0) + 1`

### 7.3 Event Replay Strategy

```sql
-- Replay transcript from a specific sequence
SELECT *
FROM transcript_event
WHERE session_id = $1
  AND sequence >= $2
ORDER BY sequence;

-- Replay run events from a specific sequence
SELECT *
FROM run_event
WHERE run_id = $1
  AND sequence >= $2
ORDER BY sequence;
```

### 7.4 Batch Event Insertion

For performance, events are batch-inserted using:

```sql
INSERT INTO run_event (run_id, session_id, sequence, event_type, payload)
VALUES
  ($1, $2, $3, $4, $5::jsonb),
  ($6, $7, $8, $9, $10::jsonb),
  ...
ON CONFLICT DO NOTHING; -- Handle duplicates gracefully
```

### 7.5 Event Cleanup Strategy

1. **Time-based retention**: Delete events older than retention period
2. **Archive before delete**: Move old events to archive table
3. **Soft delete**: Use `deleted_at` for immediate deletion, hard delete later

```sql
-- Archive old transcript events
CREATE TABLE transcript_event_archive AS
SELECT * FROM transcript_event WHERE created_at < NOW() - INTERVAL '90 days';

DELETE FROM transcript_event WHERE created_at < NOW() - INTERVAL '90 days';
```

### 7.6 JSONB Indexing for Query Performance

```sql
-- GIN index for JSONB payload queries
CREATE INDEX idx_transcript_event_payload
  ON transcript_event USING GIN (payload);

-- Example: Find events with specific payload structure
SELECT *
FROM transcript_event
WHERE payload @> '{"tool": "bash"}';
```

---

## 8. Operational Procedures

### 8.1 Database Setup

#### 8.1.1 Local Development

```bash
# Start PostgreSQL via Docker Compose
docker compose up -d postgres

# Run migrations
npm run migration:run

# Verify
psql postgresql://postgres:postgres@localhost:5432/mission_control -c "\dt"
```

#### 8.1.2 Production Setup

```bash
# Create database
createdb mission_control

# Create user
psql -c "CREATE USER mission_control WITH PASSWORD 'secure_password';"
psql -c "GRANT ALL PRIVILEGES ON DATABASE mission_control TO mission_control;"

# Run migrations
npm run migration:run -- --env production
```

### 8.2 Backup and Restore

#### 8.2.1 Backup

```bash
# Full backup
pg_dump -Fc mission_control > backup_$(date +%Y%m%d).dump

# Schema-only backup
pg_dump -s mission_control > schema_$(date +%Y%m%d).sql

# Data-only backup
pg_dump -a mission_control > data_$(date +%Y%m%d).sql
```

#### 8.2.2 Restore

```bash
# Restore from dump
pg_restore -d mission_control backup_20260228.dump

# Restore with clean
pg_restore -c -d mission_control backup_20260228.dump
```

#### 8.2.3 Automated Backups

```bash
#!/bin/bash
# /usr/local/bin/backup-db.sh

BACKUP_DIR="/backups/mission_control"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

mkdir -p "$BACKUP_DIR"

# Create backup
pg_dump -Fc mission_control > "$BACKUP_DIR/backup_$DATE.dump"

# Delete old backups
find "$BACKUP_DIR" -name "backup_*.dump" -mtime +$RETENTION_DAYS -delete
```

Add to crontab:
```
0 2 * * * /usr/local/bin/backup-db.sh
```

### 8.3 Monitoring Queries

#### 8.3.1 Database Health

```sql
-- Connection count
SELECT count(*) FROM pg_stat_activity;

-- Active queries
SELECT pid, state, query, wait_event_type, wait_event
FROM pg_stat_activity
WHERE state != 'idle';

-- Table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

#### 8.3.2 Performance Monitoring

```sql
-- Slow queries (pg_stat_statements extension required)
SELECT
  query,
  calls,
  total_time,
  mean_time,
  max_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;

-- Index usage
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

#### 8.3.3 Event Table Monitoring

```sql
-- Event volume by session
SELECT
  session_id,
  count(*) AS event_count,
  min(created_at) AS first_event,
  max(created_at) AS last_event
FROM transcript_event
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY session_id
ORDER BY event_count DESC;

-- Event type distribution
SELECT
  event_type,
  count(*) AS count
FROM run_event
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY event_type
ORDER BY count DESC;
```

### 8.4 Maintenance Tasks

#### 8.4.1 Vacuum and Analyze

```sql
-- Manual vacuum
VACUUM ANALYZE transcript_event;
VACUUM ANALYZE run_event;

-- Autovacuum configuration (postgresql.conf)
autovacuum = on
autovacuum_vacuum_scale_factor = 0.1
autovacuum_analyze_scale_factor = 0.05
```

#### 8.4.2 Reindex

```sql
-- Reindex specific table
REINDEX TABLE transcript_event;

-- Reindex concurrently (PostgreSQL 12+)
REINDEX INDEX CONCURRENTLY idx_transcript_event_session_sequence;
```

#### 8.4.3 Cleanup Expired Idempotency Keys

```sql
DELETE FROM idempotency_key
WHERE expires_at < NOW();
```

### 8.5 Orphaned Resource Detection

#### 8.5.1 Find Orphaned Runs

```sql
SELECT r.*
FROM run r
WHERE r.status IN ('running', 'waiting_approval')
  AND r.started_at < NOW() - INTERVAL '30 minutes'
ORDER BY r.started_at;
```

#### 8.5.2 Find Expired Approvals

```sql
SELECT a.*
FROM approval a
WHERE a.state = 'pending'
  AND a.timeout_at < NOW()
ORDER BY a.timeout_at;
```

### 8.6 Data Retention Enforcement

```sql
-- Archive sessions older than retention period
CREATE TABLE session_archive AS
SELECT * FROM session
WHERE archived_at < NOW() - INTERVAL '180 days';

-- Delete archived sessions
DELETE FROM session
WHERE archived_at < NOW() - INTERVAL '180 days';

-- Cascade delete will clean up related records
```

---

## 9. Performance Considerations

### 9.1 Indexing Strategy

#### 9.1.1 Critical Indexes

```sql
-- Session lookup by status + time (listing)
CREATE INDEX idx_session_status_created_at
  ON session(status, created_at DESC);

-- Run lookup by session (most common query)
CREATE INDEX idx_run_session_id ON run(session_id);

-- Transcript event replay
CREATE INDEX idx_transcript_event_session_sequence
  ON transcript_event(session_id, sequence);

-- Run event replay
CREATE INDEX idx_run_event_run_sequence
  ON run_event(run_id, sequence);

-- Approval timeout checking
CREATE INDEX idx_approval_timeout_at
  ON approval(timeout_at)
  WHERE state = 'pending';
```

#### 9.1.2 Partial Indexes for Common Queries

```sql
-- Active sessions only
CREATE INDEX idx_session_active
  ON session(created_at DESC)
  WHERE status NOT IN ('archived', 'failed') AND deleted_at IS NULL;

-- Pending approvals only
CREATE INDEX idx_approval_pending
  ON approval(run_id)
  WHERE state = 'pending';
```

### 9.2 Connection Pooling

#### 9.2.1 Pool Configuration

```typescript
const poolConfig = {
  // Production settings
  min: 10,                    // Minimum connections
  max: 50,                   // Maximum connections
  idleTimeoutMillis: 30000,   // Close idle connections after 30s
  connectionTimeoutMillis: 10000, // Fail fast if no connection available
};
```

#### 9.2.2 PgBouncer (Production)

For high-concurrency production deployments, use PgBouncer:

```ini
[databases]
mission_control = host=localhost port=5432 dbname=mission_control

[pgbouncer]
listen_addr = 127.0.0.1
listen_port = 6432
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 50
```

### 9.3 Partitioning for Event Tables

For large event volumes, consider table partitioning:

```sql
-- Partition transcript_event by month
CREATE TABLE transcript_event (
  -- columns...
) PARTITION BY RANGE (created_at);

-- Create partitions
CREATE TABLE transcript_event_2026_01 PARTITION OF transcript_event
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE transcript_event_2026_02 PARTITION OF transcript_event
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- Create index on each partition
CREATE INDEX idx_transcript_event_2026_01_session_sequence
  ON transcript_event_2026_01(session_id, sequence);
```

### 9.4 Query Optimization

#### 9.4.1 Batch Insertions

```typescript
// Use COPY for bulk inserts
async bulkInsertEvents(events: CreateRunEventInput[]): Promise<void> {
  const stream = new Readable({
    objectMode: true,
    read() {
      this.push(events.shift() || null);
    },
  });

  await this.db.pool.copyFrom(
    "COPY run_event (run_id, session_id, sequence, event_type, payload) FROM STDIN",
    stream
  );
}
```

#### 9.4.2 Prepared Statements

```typescript
// Use prepared statements for repeated queries
const getRunById = await db.pool.prepare(
  "SELECT * FROM run WHERE id = $1"
);

const run = await getRunById.execute([runId]);
```

### 9.5 Caching Strategy

#### 9.5.1 Application-Level Caching

```typescript
import LRU from "lru-cache";

const sessionCache = new LRU<string, Session>({
  max: 1000,
  ttl: 60000, // 1 minute
});

async getSession(id: string): Promise<Session | null> {
  const cached = sessionCache.get(id);
  if (cached) return cached;

  const session = await repository.findById(id);
  if (session) sessionCache.set(id, session);
  return session;
}
```

#### 9.5.2 PostgreSQL Query Result Caching

```sql
-- Use materialized views for expensive aggregates
CREATE MATERIALIZED VIEW session_stats AS
SELECT
  s.id,
  s.title,
  s.status,
  count(r.id) AS run_count,
  sum(r.cost_usd) AS total_cost
FROM session s
LEFT JOIN run r ON s.id = r.session_id
GROUP BY s.id;

-- Refresh periodically
REFRESH MATERIALIZED VIEW CONCURRENTLY session_stats;
```

---

## 10. Security Considerations

### 10.1 Authentication and Authorization

#### 10.1.1 Database User Roles

```sql
-- Application user (read/write)
CREATE USER mission_control_app WITH PASSWORD 'app_password';
GRANT CONNECT ON DATABASE mission_control TO mission_control_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mission_control_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mission_control_app;

-- Read-only user (reporting)
CREATE USER mission_control_readonly WITH PASSWORD 'readonly_password';
GRANT CONNECT ON DATABASE mission_control TO mission_control_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO mission_control_readonly;

-- Admin user (maintenance only)
CREATE USER mission_control_admin WITH PASSWORD 'admin_password';
GRANT ALL PRIVILEGES ON DATABASE mission_control TO mission_control_admin;
```

#### 10.1.2 Row-Level Security (Optional)

For multi-tenant deployments, use RLS:

```sql
-- Enable RLS on session table
ALTER TABLE session ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see sessions they created
CREATE POLICY session_isolation ON session
  FOR ALL
  USING (created_by = current_user_id());

-- Policy: Users can only see sessions from their workspaces
CREATE POLICY workspace_isolation ON session
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT id FROM workspace WHERE created_by = current_user_id()
    )
  );
```

### 10.2 Encryption

#### 10.2.1 TLS/SSL Configuration

```typescript
// Enable SSL in production
const dbConfig: DatabaseConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? "5432"),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : undefined,
};
```

#### 10.2.2 Data-at-Rest Encryption

- Use disk encryption (LUKS, EBS encryption)
- Encrypt sensitive fields in JSONB using application-level encryption
- Store secrets in environment variables or secret manager (AWS Secrets Manager, HashiCorp Vault)

### 10.3 SQL Injection Prevention

- **Always use parameterized queries** (pg library automatically handles this)
- **Never concatenate user input into SQL strings**
- **Use validation layers** (Zod) before database operations

```typescript
// ✅ Good - parameterized
await db.query("SELECT * FROM session WHERE id = $1", [sessionId]);

// ❌ Bad - string concatenation
await db.query(`SELECT * FROM session WHERE id = '${sessionId}'`);
```

### 10.4 Audit Logging

All mutations should be logged to the audit_log table:

```typescript
async logAudit(params: {
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  changes?: Record<string, unknown>;
}) {
  await db.query(
    `INSERT INTO audit_log (entity_type, entity_id, action, actor_id, changes)
     VALUES ($1, $2, $3, $4, $5)`,
    [params.entityType, params.entityId, params.action, params.actorId, JSON.stringify(params.changes)]
  );
}
```

### 10.5 PII Handling

#### 10.5.1 Identify PII Fields

- `users.email`
- `users.display_name`
- `session.title` (may contain user content)
- `transcript_event.payload` (may contain user messages)

#### 10.5.2 PII Protection Strategy

1. **Access control**: Restrict who can query user data
2. **Data masking**: Mask PII in logs and error messages
3. **Retention policies**: Delete old user data per GDPR/CCPA
4. **Right to be forgotten**: Provide user data deletion endpoint

```sql
-- Delete user and all related data (cascade handles most)
BEGIN;
UPDATE users SET deleted_at = NOW() WHERE id = $1;
-- Additional cleanup for soft-delete tables
COMMIT;
```

---

## 11. Monitoring and Observability

### 11.1 Metrics to Track

#### 11.1.1 Database Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| Connection pool usage | Active / max connections | > 80% |
| Query latency (P50, P95, P99) | Query execution time | P95 > 100ms |
| Slow query count | Queries > 1 second | > 10/min |
| Transaction count | Active transactions | > 100 |
| Deadlocks | Deadlock events | > 0 |
| Table sizes | Disk usage per table | > 10GB |

#### 11.1.2 Application Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| Event write latency | Time to persist event | P95 > 50ms |
| Transcript replay latency | Time to fetch events | P95 > 200ms |
| Orphaned run count | Runs stuck in running state | > 5 |
| Expired approval count | Approvals past timeout | > 10 |

### 11.2 Logging Strategy

#### 11.2.1 Structured Logging

```typescript
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  formatters: {
    level: (label) => ({ level: label }),
  },
  serializers: {
    error: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
  },
});

logger.info(
  {
    sessionId,
    runId,
    operation: "create_run",
    durationMs: 23,
  },
  "Run created successfully"
);
```

#### 11.2.2 Query Logging

```typescript
// Enable query logging in development
if (process.env.NODE_ENV === "development") {
  this.db.pool.on("query", (query) => {
    logger.debug({
      sql: query.text,
      params: query.values,
      duration: query.duration,
    }, "Database query");
  });
}
```

### 11.3 Health Checks

#### 11.3.1 Database Health Endpoint

```typescript
async healthCheck(): Promise<{
  status: "healthy" | "degraded" | "unhealthy";
  details: {
    database: boolean;
    latency?: number;
    connections?: { active: number; idle: number };
  };
}> {
  const start = Date.now();
  const databaseHealthy = await this.db.healthCheck();
  const latency = Date.now() - start;

  const result = await this.db.query(`
    SELECT
      count(*) FILTER (WHERE state = 'active') as active,
      count(*) FILTER (WHERE state = 'idle') as idle
    FROM pg_stat_activity
    WHERE datname = current_database()
  `);

  const connections = result.rows[0];

  return {
    status: databaseHealthy && latency < 100 ? "healthy" : "degraded",
    details: {
      database: databaseHealthy,
      latency,
      connections: {
        active: parseInt(connections.active),
        idle: parseInt(connections.idle),
      },
    },
  };
}
```

### 11.4 Dashboards

#### 11.4.1 Grafana Dashboard Panels

1. **Database Connection Pool**
   - Gauge: Active connections
   - Gauge: Idle connections
   - Time series: Connection pool usage over time

2. **Query Performance**
   - Histogram: Query latency (P50, P95, P99)
   - Time series: Slow query count
   - Table: Top 10 slowest queries

3. **Event Volume**
   - Time series: Events per minute (by type)
   - Counter: Total events stored
   - Gauge: Events in retention window

4. **Resource Health**
   - Table: Orphaned runs (older than 30 min)
   - Table: Expired approvals
   - Gauge: Database size

### 11.5 Alerting

#### 11.5.1 Alert Rules

```yaml
# Prometheus alerting rules
groups:
  - name: mission_control_database
    rules:
      - alert: HighDatabaseLatency
        expr: histogram_quantile(0.95, db_query_latency_seconds) > 0.1
        for: 5m
        annotations:
          summary: "Database P95 latency exceeds 100ms"

      - alert: ConnectionPoolExhausted
        expr: db_pool_active_connections / db_pool_max_connections > 0.9
        for: 2m
        annotations:
          summary: "Database connection pool > 90% utilized"

      - alert: OrphanedRunsDetected
        expr: orphaned_runs_count > 5
        for: 10m
        annotations:
          summary: "Multiple orphaned runs detected"

      - alert: ExpiredApprovals
        expr: expired_approvals_count > 10
        annotations:
          summary: "Multiple expired approvals require cleanup"
```

---

## 12. Disaster Recovery

### 12.1 Backup Strategy

#### 12.1.1 Backup Schedule

| Backup Type | Frequency | Retention | Location |
|-------------|-----------|-----------|----------|
| Full backup | Daily | 30 days | Off-site (S3) |
| Differential | Hourly | 7 days | Off-site (S3) |
| WAL archive | Continuous | 30 days | Off-site (S3) |

#### 12.1.2 WAL Archiving

```sql
-- postgresql.conf
wal_level = replica
archive_mode = on
archive_command = 'aws s3 cp %p s3://backups/mission_control/wal/%f'
```

### 12.2 Recovery Procedures

#### 12.2.1 Point-in-Time Recovery

```bash
# Stop the application
systemctl stop mission-control-api

# Restore from backup
pg_restore -d mission_control_restore backup_20260228.dump

# Start recovery
# Edit recovery.conf (PostgreSQL 11) or use pg_ctl promote (PostgreSQL 12+)

# Verify data
psql -d mission_control_restore -c "SELECT count(*) FROM session"

# Switch traffic to restored database
# Update DNS or connection string
```

#### 12.2.2 Partial Recovery

```sql
-- Recover specific session
-- Restore backup to temporary database
createdb mission_control_temp
pg_restore -d mission_control_temp backup_20260228.dump

-- Copy specific session back to production
INSERT INTO session SELECT * FROM mission_control_temp.session WHERE id = 'sess_123';
INSERT INTO transcript_event SELECT * FROM mission_control_temp.transcript_event WHERE session_id = 'sess_123';
```

### 12.3 Failover Strategy

#### 12.3.1 Hot Standby Configuration

```sql
-- Primary (postgresql.conf)
wal_level = replica
max_wal_senders = 3
wal_keep_size = 1GB

-- Standby (recovery.conf or standby.signal)
standby_mode = on
primary_conninfo = 'host=primary-db port=5432 user=replicator password=xxx'
```

#### 12.3.2 Failover Process

```bash
# Promote standby to primary
pg_ctl promote -D /var/lib/postgresql/data

# Update application connection string
# Update DNS to point to new primary

# Reprovision new standby
```

### 12.4 Testing Recovery

#### 12.4.1 Monthly Recovery Drill

1. Take backup of production
2. Restore to staging environment
3. Run application against restored database
4. Verify data integrity and functionality
5. Document any issues or improvements

---

## 13. Testing Strategy

### 13.1 Unit Tests

Test repository methods in isolation using test database:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PostgresSessionRepository } from "../repositories/session.repository.js";
import { Database } from "../database.js";
import { randomUUID } from "node:crypto";

describe("PostgresSessionRepository", () => {
  let db: Database;
  let repo: PostgresSessionRepository;

  beforeEach(async () => {
    db = new Database({
      host: "localhost",
      port: 5432,
      database: "mission_control_test",
      user: "postgres",
      password: "postgres",
    });
    repo = new PostgresSessionRepository(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it("should create and retrieve session", async () => {
    const session = await repo.create({
      id: `sess_${randomUUID()}`,
      agentId: "agent_123",
      workspaceId: "workspace_123",
      title: "Test Session",
      createdBy: "user_123",
    });

    const retrieved = await repo.findById(session.id);
    expect(retrieved).toEqual(session);
  });

  it("should list sessions with filters", async () => {
    // Create test sessions...
    const sessions = await repo.list({ status: "idle" });
    expect(sessions.every(s => s.status === "idle")).toBe(true);
  });
});
```

### 13.2 Integration Tests

Test full transaction flows:

```typescript
describe("Session Enqueue Flow", () => {
  it("should enqueue message and create run with approval", async () => {
    const store = new PostgresControlApiStore(repository);

    const { run, approval } = await store.enqueueMessage({
      sessionId: "sess_123",
      content: "Test prompt",
    });

    expect(run.sessionId).toBe("sess_123");
    expect(approval.state).toBe("pending");

    const retrievedRun = await store.getRun(run.id);
    expect(retrievedRun).toEqual(run);
  });
});
```

### 13.3 Performance Tests

Test query performance under load:

```typescript
import { Bench } from "tinybench";

const bench = new Bench({ time: 1000 });

bench.add("create session", async () => {
  await repo.create({
    id: `sess_${randomUUID()}`,
    agentId: "agent_123",
    workspaceId: "workspace_123",
    title: "Test Session",
    createdBy: "user_123",
  });
});

bench.add("get transcript", async () => {
  await repo.list({ sessionId: "sess_123" });
});

await bench.run();
console.table(bench.table());
```

### 13.4 Test Data Management

```sql
-- Reset test database between test runs
TRUNCATE TABLE
  audit_log,
  idempotency_key,
  run_event,
  transcript_event,
  approval,
  run,
  session,
  agent,
  workspace,
  users
CASCADE;
```

---

## 14. Rollout Plan

### 14.1 Phase 1: Foundation (Week 1)

- [ ] Create migration files for initial schema
- [ ] Implement database connection management
- [ ] Set up local PostgreSQL via Docker Compose
- [ ] Implement base repository pattern
- [ ] Add migration runner scripts

**Deliverables**: Working migrations, database infrastructure

### 14.2 Phase 2: Repository Implementation (Week 2)

- [ ] Implement core repositories (User, Workspace, Agent, Session, Run)
- [ ] Implement event repositories (TranscriptEvent, RunEvent)
- [ ] Implement Approval repository
- [ ] Implement Idempotency repository
- [ ] Add unit tests for all repositories

**Deliverables**: Complete repository implementations with tests

### 14.3 Phase 3: ControlApiStore Implementation (Week 3)

- [ ] Implement PostgresControlApiStore
- [ ] Maintain compatibility with existing interface
- [ ] Add integration tests
- [ ] Add migration from in-memory to PostgreSQL

**Deliverables**: Drop-in replacement for InMemoryControlApiStore

### 14.4 Phase 4: Staging Rollout (Week 4)

- [ ] Deploy to staging environment
- [ ] Run performance tests
- [ ] Verify migration process
- [ ] Monitor metrics and logs
- [ ] Fix any issues discovered

**Deliverables**: Staging environment running PostgreSQL-backed persistence

### 14.5 Phase 5: Production Rollout (Week 5)

- [ ] Schedule production maintenance window
- [ ] Take final backup of in-memory state (if needed)
- [ ] Run migrations
- [ ] Deploy updated application
- [ ] Verify health checks
- [ ] Monitor for issues

**Deliverables**: Production environment running PostgreSQL-backed persistence

### 14.6 Phase 6: Post-Rollout (Week 6+)

- [ ] Set up automated backups
- [ ] Configure monitoring and alerting
- [ ] Document operational procedures
- [ ] Train operations team
- [ ] Plan for partitioning if event volume grows

**Deliverables**: Full operational readiness

---

## Appendix A: Environment Variables

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mission_control
DB_USER=mission_control_app
DB_PASSWORD=secure_password
DB_SSL=false

# Persistence Mode
PERSISTENCE_MODE=postgres  # or in-memory for development

# Connection Pool
DB_POOL_MIN=2
DB_POOL_MAX=20
DB_POOL_IDLE_TIMEOUT_MS=30000
DB_POOL_CONNECTION_TIMEOUT_MS=10000

# Migration
MIGRATIONS_DIR=./migrations

# Monitoring
LOG_LEVEL=info
ENABLE_QUERY_LOGGING=false
```

## Appendix B: Migration Commands

```bash
# Run all pending migrations
npm run migration:run

# Create new migration file
npm run migration:create -- name=add_user_preferences

# Rollback last migration
npm run migration:rollback

# Show migration status
npm run migration:status

# Validate migration files
npm run migration:validate
```

## Appendix C: Useful SQL Queries

### View Active Sessions

```sql
SELECT
  s.id,
  s.title,
  s.status,
  a.name AS agent,
  w.name AS workspace,
  s.created_at,
  s.updated_at
FROM session s
JOIN agent a ON s.agent_id = a.id
JOIN workspace w ON s.workspace_id = w.id
WHERE s.status IN ('running', 'waiting_approval')
ORDER BY s.updated_at DESC;
```

### View Session Statistics

```sql
SELECT
  s.id,
  s.title,
  COUNT(DISTINCT r.id) AS run_count,
  COUNT(DISTINCT te.id) AS event_count,
  MIN(r.started_at) AS first_run,
  MAX(r.finished_at) AS last_run,
  SUM(r.cost_usd) AS total_cost
FROM session s
LEFT JOIN run r ON s.id = r.session_id
LEFT JOIN transcript_event te ON s.id = te.session_id
GROUP BY s.id, s.title
ORDER BY s.updated_at DESC;
```

### Find Large Sessions

```sql
SELECT
  session_id,
  COUNT(*) AS event_count,
  pg_size_pretty(pg_total_relation_size('transcript_event')) AS table_size
FROM transcript_event
GROUP BY session_id
HAVING COUNT(*) > 10000
ORDER BY event_count DESC;
```

---

**Document Version**: 1.0
**Last Updated**: 2026-02-28
**Author**: Pi Mission Control Team
