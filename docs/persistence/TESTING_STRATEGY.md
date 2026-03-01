# Persistence Layer Testing Strategy

## Overview

This document outlines the comprehensive testing strategy for the persistence layer migration from in-memory storage to PostgreSQL.

## Testing Pyramid

### 1. Unit Tests (Fast, Isolated)

**Purpose**: Test individual components in isolation with mocked dependencies.

**Coverage Areas**:
- Repository methods (CRUD operations)
- Row mappers (entity conversion)
- Event serialization/deserialization
- Business logic validation
- Error handling paths

**Tools**: Vitest, test doubles, fakes

**Examples**:
```typescript
describe('AgentRepository', () => {
  it('should create agent with valid data', async () => {
    const mockDb = createMockDatabaseManager();
    const repo = new AgentRepository(mockDb);
    
    const agent = await repo.create({
      name: 'Test Agent',
      model: 'gpt-4',
      defaultTools: ['read', 'write']
    });
    
    expect(agent.id).toBeDefined();
    expect(agent.name).toBe('Test Agent');
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO agents'),
      expect.any(Array)
    );
  });
});
```

### 2. Integration Tests (Slower, Real Dependencies)

**Purpose**: Test component interactions with real PostgreSQL instances.

**Coverage Areas**:
- Repository → Database interactions
- Transaction boundaries and rollbacks
- PostgreSQL NOTIFY/LISTEN message delivery
- Cross-service data flows
- Error propagation through layers

**Tools**: Testcontainers, Docker Compose, real databases

**Test Database Setup**:
```typescript
// tests/integration/setup.ts
export async function setupIntegrationTest(): Promise<TestContext> {
  // Start test containers
  const pgContainer = await new PostgresContainer().start();
  
  // Create schema
  const db = new DatabaseManager(pgContainer.getConnectionUri());
  const runner = new MigrationRunner(db);
  await runner.runMigrations();
  
  return {
    db,
    cleanup: async () => {
      await db.close();
      await pgContainer.stop();
    }
  };
}
```

### 3. End-to-End Tests (Slowest, Full System)

**Purpose**: Test complete user workflows across all services.

**Coverage Areas**:
- API → Repository → Database → NOTIFY/LISTEN → Worker flows
- Approval workflows across distributed services
- Event streaming from persistence to UI
- Error scenarios and recovery
- Performance under realistic load

**Tools**: Playwright/Testify for API, Docker Compose for orchestration

## Test Categories

### Database Tests

**Repository Layer Tests**:
- Test all CRUD operations with real data
- Verify constraint enforcement (foreign keys, unique constraints)
- Test transaction rollback scenarios
- Validate query performance and indexing

**Schema Migration Tests**:
- Test forward migrations
- Test rollback capabilities
- Verify data integrity after migrations
- Test migration idempotency

**Data Consistency Tests**:
- Test concurrent operations
- Verify referential integrity
- Test sequence generation and gaps
- Validate data type mappings

### Integration Tests

**Cross-Service Tests**:
- API → Database → Event Publisher → LISTEN → Event Subscriber
- Worker → PostgreSQL Approval → API → Database
- UI → API → Event Streaming → UI updates

**Error Scenarios**:
- Database connection failures
- Network partition scenarios
- Partial failure recovery

## Test Environment Management

### Test Database Strategy

**Per-Test Isolation**:
- Use PostgreSQL transactions with rollback for each test
- Reset sequences between tests
- Clean up created data automatically

**Test Data Management**:
- Use factory pattern for test data creation
- Implement fixtures for common scenarios
- Use deterministic IDs for reproducible tests

```typescript
// tests/fixtures/factories.ts
export class AgentFactory {
  static create(overrides?: Partial<CreateAgentInput>): CreateAgentInput {
    return {
      name: 'Test Agent',
      model: 'gpt-4',
      defaultTools: ['read', 'write'],
      ...overrides
    };
  }
  
  static async persist(
    db: DatabaseManager,
    overrides?: Partial<CreateAgentInput>
  ): Promise<Agent> {
    const repo = new AgentRepository(db);
    return repo.create(this.create(overrides));
  }
}
```

### Container-Based Testing

**Docker Compose for Integration**:
```yaml
# docker-compose.test.yml
version: '3.8'
services:
  postgres-test:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: mission_control_test
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
    ports:
      - "5433:5432"
```

**Test Container Orchestration**:
```typescript
// tests/integration/containers.ts
export class TestContainers {
  private static containers: Array<{ stop: () => Promise<void> }> = [];
  
  static async startPostgres(): Promise<string> {
    const container = await new PostgresContainer()
      .withDatabase('mission_control_test')
      .withUsername('test')
      .withPassword('test')
      .start();
    
    this.containers.push(container);
    return container.getConnectionUri();
  }
  
  static async cleanup(): Promise<void> {
    await Promise.all(
      this.containers.map(container => container.stop())
    );
    this.containers = [];
  }
}
```

## Performance Testing

### Load Testing Scenarios

**Database Performance**:
- Concurrent user operations (create sessions, enqueue messages)
- Large transcript retrieval queries
- Event history replay performance
- Index effectiveness verification
- NOTIFY/LISTEN throughput

**End-to-End Performance**:
- Full user journey latency
- Event streaming latency
- Multi-instance coordination overhead

### Performance Test Tools

```typescript
// tests/performance/load-test.ts
describe('Load Tests', () => {
  it('should handle 100 concurrent session creations', async () => {
    const promises = Array.from({ length: 100 }, () =>
      store.createSession({
        agentId: testAgent.id,
        workspaceId: testWorkspace.id,
        title: `Load Test Session ${Math.random()}`
      })
    );
    
    const startTime = Date.now();
    const sessions = await Promise.all(promises);
    const duration = Date.now() - startTime;
    
    expect(sessions).toHaveLength(100);
    expect(duration).toBeLessThan(5000); // 5 seconds
  });
});
```

## Test Automation

### CI/CD Integration

**GitHub Actions Workflow**:
```yaml
name: Persistence Tests
on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:unit

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run migration:run
      - run: npm run test:integration

  performance-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:performance
```

### Local Development Testing

**Test Scripts**:
```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest --exclude '**/*.integration.test.ts'",
    "test:integration": "vitest --run '**/*.integration.test.ts'",
    "test:e2e": "vitest --run '**/*.e2e.test.ts'",
    "test:performance": "vitest --run '**/*.perf.test.ts'",
    "test:coverage": "vitest --coverage",
    "test:watch": "vitest --watch"
  }
}
```

## Test Data Management

### Test Data Strategies

**Deterministic Test Data**:
- Use seeded random generators for reproducible tests
- Maintain test data versioning
- Implement data cleanup strategies

**Boundary Condition Testing**:
- Test with empty datasets
- Test with maximum size data
- Test with malformed data
- Test with unicode and special characters

### Test Utilities

**Database Utilities**:
```typescript
// tests/utils/database.ts
export class DatabaseTestUtils {
  static async resetDatabase(db: DatabaseManager): Promise<void> {
    await db.query(`
      TRUNCATE TABLE 
        transcript_events,
        run_events,
        approvals,
        runs,
        sessions,
        agents,
        workspaces,
        users,
        idempotency_keys
      RESTART IDENTITY CASCADE;
    `);
  }
  
  static async seedTestData(db: DatabaseManager): Promise<SeedData> {
    const userRepo = new UserRepository(db);
    const workspaceRepo = new WorkspaceRepository(db);
    const agentRepo = new AgentRepository(db);
    
    const user = await userRepo.create({
      email: 'test@example.com',
      name: 'Test User'
    });
    
    const workspace = await workspaceRepo.create({
      name: 'Test Workspace',
      repoUrl: 'https://github.com/test/repo'
    });
    
    const agent = await agentRepo.create({
      name: 'Test Agent',
      model: 'gpt-4'
    });
    
    return { user, workspace, agent };
  }
}
```

## Quality Gates

### Test Coverage Requirements

- **Unit Tests**: 95%+ line coverage
- **Integration Tests**: 100% repository coverage
- **E2E Tests**: All critical user journeys
- **Performance Tests**: SLA compliance verification

### Test Quality Standards

- No flaky tests
- All tests must be deterministic
- Proper cleanup in all test scenarios
- Comprehensive error case coverage
- Performance regression detection

This testing strategy ensures comprehensive validation of the persistence layer migration while maintaining development velocity and reliability.
