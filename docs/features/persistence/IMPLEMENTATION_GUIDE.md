# Persistence Layer Implementation Guide

## Overview

This guide provides step-by-step instructions for implementing the persistence layer migration from in-memory storage to PostgreSQL.

## Prerequisites

- Node.js 20+
- PostgreSQL 16+ (for local development)
- Docker and Docker Compose (for test environments)

## Phase 1: Foundation and Database Schema

### 1.1 Setup Persistence Infrastructure

#### 1.1.1 Add Dependencies

Add these dependencies to `packages/control-api/package.json`:

```json
{
  "dependencies": {
    "pg": "^8.11.3"
  },
  "devDependencies": {
    "@types/pg": "^8.10.9"
  }
}
```

#### 1.1.2 Create Directory Structure

Create the following directory structure in `packages/control-api/src/`:

```
persistence/
├── index.ts              # Public exports
├── types.ts              # Domain types
├── repository.ts         # Repository interfaces
├── database.ts           # Database connection manager
├── notify.ts             # PostgreSQL NOTIFY/LISTEN manager
├── control-api-store.ts  # PostgreSQL store implementation
├── migrations/
│   ├── runner.ts         # Migration execution logic
│   ├── 001_initial_schema.sql
│   └── 002_add_indexes.sql
├── repositories/
│   ├── base.ts           # Base repository class
│   ├── user.repository.ts
│   ├── workspace.repository.ts
│   ├── agent.repository.ts
│   ├── session.repository.ts
│   ├── run.repository.ts
│   ├── approval.repository.ts
│   ├── transcript-event.repository.ts
│   ├── run-event.repository.ts
│   └── idempotency.repository.ts
└── mappers/
    ├── user.mapper.ts
    ├── workspace.mapper.ts
    ├── agent.mapper.ts
    ├── session.mapper.ts
    ├── run.mapper.ts
    └── approval.mapper.ts
```

#### 1.1.3 Database Connection Manager

Implement `database.ts` with connection pooling and health checks:

```typescript
import { Pool, PoolClient } from 'pg';

export class DatabaseManager {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  async query<T = any>(text: string, params?: any[]): Promise<T[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(text, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
```

### 1.2 Database Schema and Migrations

#### 1.2.1 Initial Schema

Create `001_initial_schema.sql`:

```sql
-- Users table for authentication
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Workspaces table for repository/workspace isolation
CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    repo_url TEXT NOT NULL,
    default_branch TEXT NOT NULL DEFAULT 'main',
    isolation_mode TEXT NOT NULL DEFAULT 'local',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Agents table for agent configurations
CREATE TABLE agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    model TEXT NOT NULL,
    default_tools TEXT[] NOT NULL DEFAULT ARRAY['read', 'bash', 'edit', 'write'],
    policy_id TEXT NOT NULL DEFAULT 'policy_default',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Sessions table for user sessions
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    status TEXT NOT NULL CHECK (status IN ('idle', 'running', 'waiting_approval', 'failed', 'archived')),
    title TEXT NOT NULL,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Runs table for individual agent runs within sessions
CREATE TABLE runs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'waiting_approval', 'completed', 'failed', 'canceled', 'orphaned')),
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMP WITH TIME ZONE,
    error_code TEXT,
    cost_usd DECIMAL(10,4)
);

-- Approvals table for approval workflow
CREATE TABLE approvals (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id),
    state TEXT NOT NULL CHECK (state IN ('pending', 'approved', 'rejected', 'expired')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMP WITH TIME ZONE,
    actor_id TEXT REFERENCES users(id),
    reason TEXT
);

-- Transcript events for session-wide event history
CREATE TABLE transcript_events (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    sequence INTEGER NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    event_type TEXT NOT NULL,
    payload_json JSONB NOT NULL,
    UNIQUE(session_id, sequence)
);

-- Run events for run-specific event history
CREATE TABLE run_events (
    id SERIAL PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id),
    sequence INTEGER NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    event_type TEXT NOT NULL,
    payload_json JSONB NOT NULL,
    UNIQUE(run_id, sequence)
);

-- Idempotency keys for ensuring exactly-once processing
CREATE TABLE idempotency_keys (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Sequence generators for transcript and run events
CREATE SEQUENCE transcript_sequence_seq;
CREATE SEQUENCE run_sequence_seq;
```

#### 1.2.2 Performance Indexes

Create `002_add_indexes.sql`:

```sql
-- Session indexes
CREATE INDEX idx_sessions_agent_id ON sessions(agent_id);
CREATE INDEX idx_sessions_workspace_id ON sessions(workspace_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_created_by ON sessions(created_by);
CREATE INDEX idx_sessions_updated_at ON sessions(updated_at);

-- Run indexes
CREATE INDEX idx_runs_session_id ON runs(session_id);
CREATE INDEX idx_runs_status ON runs(status);
CREATE INDEX idx_runs_started_at ON runs(started_at);
CREATE INDEX idx_runs_finished_at ON runs(finished_at);

-- Approval indexes
CREATE INDEX idx_approvals_run_id ON approvals(run_id);
CREATE INDEX idx_approvals_state ON approvals(state);
CREATE INDEX idx_approvals_created_at ON approvals(created_at);

-- Transcript event indexes
CREATE INDEX idx_transcript_events_session_id ON transcript_events(session_id);
CREATE INDEX idx_transcript_events_sequence ON transcript_events(session_id, sequence);
CREATE INDEX idx_transcript_events_timestamp ON transcript_events(timestamp);

-- Run event indexes
CREATE INDEX idx_run_events_run_id ON run_events(run_id);
CREATE INDEX idx_run_events_sequence ON run_events(run_id, sequence);
CREATE INDEX idx_run_events_timestamp ON run_events(timestamp);

-- Idempotency key indexes
CREATE INDEX idx_idempotency_keys_expires_at ON idempotency_keys(expires_at);

-- GIN indexes for JSONB queries
CREATE INDEX idx_transcript_events_payload_gin ON transcript_events USING GIN(payload_json);
CREATE INDEX idx_run_events_payload_gin ON run_events USING GIN(payload_json);
```

#### 1.2.3 Migration Runner

Implement `migrations/runner.ts`:

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';
import { DatabaseManager } from '../database.js';

interface Migration {
  id: string;
  filename: string;
  sql: string;
  checksum: string;
}

export class MigrationRunner {
  constructor(private db: DatabaseManager) {}

  async runMigrations(): Promise<void> {
    await this.ensureMigrationsTable();
    
    const migrations = await this.loadMigrations();
    const appliedMigrations = await this.getAppliedMigrations();
    
    for (const migration of migrations) {
      if (!appliedMigrations.has(migration.id)) {
        console.log(`Running migration: ${migration.filename}`);
        await this.db.withTransaction(async (client) => {
          await client.query(migration.sql);
          await client.query(
            'INSERT INTO schema_migrations (id, filename, checksum, applied_at) VALUES ($1, $2, $3, NOW())',
            [migration.id, migration.filename, migration.checksum]
          );
        });
        console.log(`Migration completed: ${migration.filename}`);
      }
    }
  }

  async rollbackMigration(targetId: string): Promise<void> {
    const appliedMigrations = await this.getAppliedMigrations();
    const migrationsToRollback = Array.from(appliedMigrations.keys())
      .filter(id => id > targetId)
      .reverse();

    for (const migrationId of migrationsToRollback) {
      console.log(`Rolling back migration: ${migrationId}`);
      // Implement rollback logic based on migration metadata
      await this.db.query('DELETE FROM schema_migrations WHERE id = $1', [migrationId]);
      console.log(`Rollback completed: ${migrationId}`);
    }
  }

  private async ensureMigrationsTable(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);
  }

  private async loadMigrations(): Promise<Migration[]> {
    const migrationsDir = join(__dirname, '.');
    const migrationFiles = ['001_initial_schema.sql', '002_add_indexes.sql'];
    
    return migrationFiles.map(filename => {
      const sql = readFileSync(join(migrationsDir, filename), 'utf-8');
      const id = filename.replace('.sql', '');
      const checksum = this.calculateChecksum(sql);
      
      return { id, filename, sql, checksum };
    });
  }

  private async getAppliedMigrations(): Promise<Set<string>> {
    const rows = await this.db.query<{ id: string }>(
      'SELECT id FROM schema_migrations ORDER BY id'
    );
    return new Set(rows.map(row => row.id));
  }

  private calculateChecksum(sql: string): string {
    // Simple checksum implementation - use crypto for production
    return Buffer.from(sql.replace(/\s+/g, ' ').trim()).toString('base64');
  }
}
```

## Testing Strategy

### Test Database Setup

Create a test database setup script:

```typescript
// tests/setup.ts
import { DatabaseManager } from '../src/persistence/database.js';

export const TEST_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/mission_control_test';

export async function setupTestDatabase(): Promise<DatabaseManager> {
  const db = new DatabaseManager(TEST_DATABASE_URL);
  
  // Clean database
  await db.query(`
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
  `);
  
  // Run migrations
  const runner = new MigrationRunner(db);
  await runner.runMigrations();
  
  return db;
}

export async function teardownTestDatabase(db: DatabaseManager): Promise<void> {
  await db.close();
}
```

### Integration Test Example

```typescript
// persistence.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, DatabaseManager } from '../tests/setup.js';
import { PostgresControlApiStore } from '../src/persistence/control-api-store.js';

describe('PostgresControlApiStore', () => {
  let db: DatabaseManager;
  let store: PostgresControlApiStore;

  beforeEach(async () => {
    db = await setupTestDatabase();
    store = new PostgresControlApiStore(db);
  });

  afterEach(async () => {
    await teardownTestDatabase(db);
  });

  it('should create and retrieve agents', async () => {
    const agent = await store.createAgent({
      name: 'Test Agent',
      model: 'gpt-4',
      defaultTools: ['read', 'write'],
    });

    const retrieved = await store.getAgent(agent.id);
    expect(retrieved).toEqual(agent);
  });

  // Add more test cases...
});
```

## Environment Configuration

Update `.env.example`:

```env
# Control API
MISSION_CONTROL_PORT=8787
MISSION_CONTROL_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mission_control

# Persistence Mode (memory or postgres)
PERSISTENCE_MODE=postgres

# Test environment
MISSION_CONTROL_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mission_control_test
```

## Development Workflow

1. Start local infrastructure: `npm run infra:up`
2. Run migrations: `npm run migration:run`
3. Start development server: `npm run dev`
4. Run tests: `npm test`
5. Run integration tests: `npm run test:integration`

## Production Deployment

1. Configure production database connections
2. Run database migrations: `npm run migration:run -- --env=production`
3. Deploy application with `PERSISTENCE_MODE=postgres`
4. Monitor health checks and metrics
5. Set up backup and monitoring

This implementation guide provides the foundation for the persistence layer migration. Each phase should be implemented sequentially with thorough testing at each step.
