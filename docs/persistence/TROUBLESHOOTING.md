# Persistence Layer Troubleshooting Guide

## Overview

This guide covers common issues, debugging procedures, and solutions for problems that may arise with the PostgreSQL persistence layer.

## Quick Diagnosis Checklist

### Initial Health Checks

```bash
# Check database connectivity
psql -h $DATABASE_HOST -U mission_control_app -d mission_control -c "SELECT 1;"

# Check application health
curl http://localhost:8787/health

# Check database migrations
npm run migration:status
```

### Log Locations

**Application Logs**:
- stdout/stderr (structured JSON)
- Log level: info, warn, error

**PostgreSQL Logs**:
- Location: `/var/log/postgresql/`
- Key files: `postgresql-YYYY-MM-DD.log`
- Slow query log: `postgresql-slow.log`

## Database Issues

### Connection Problems

**Symptoms**:
- `Connection refused` errors
- `Too many connections` errors
- Connection timeouts

**Diagnosis**:
```sql
-- Check current connections
SELECT count(*) as total_connections,
       count(*) FILTER (WHERE state = 'active') as active_connections
FROM pg_stat_activity;

-- Check connection limits
SHOW max_connections;

-- Check for connection leaks by application
SELECT datname, usename, count(*) as connection_count
FROM pg_stat_activity
GROUP BY datname, usename
ORDER BY connection_count DESC;

-- Check long-running connections
SELECT pid, usename, application_name, 
       state_change, now() - state_change as duration
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY duration DESC;
```

**Solutions**:

1. **Increase connection pool size**:
   ```javascript
   // In database.ts
   const pool = new Pool({
     connectionString,
     max: 30, // Increase from default
     idleTimeoutMillis: 30000,
     connectionTimeoutMillis: 2000,
   });
   ```

2. **Fix connection leaks**:
   ```typescript
   // Ensure proper connection cleanup
   async withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
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
       client.release(); // Always release!
     }
   }
   ```

3. **Kill problematic connections**:
   ```sql
   SELECT pg_terminate_backend(pid) 
   FROM pg_stat_activity 
   WHERE usename = 'mission_control_app' 
     AND state = 'idle' 
     AND now() - state_change > interval '1 hour';
   ```

### Performance Issues

**Symptoms**:
- Slow query responses
- High CPU usage
- Database locks

**Diagnosis**:
```sql
-- Find slow queries
SELECT query, calls, total_time, mean_time, stddev_time,
       total_time/calls as avg_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;

-- Check for table bloat
SELECT schemaname, tablename, 
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
       pg_stat_get_tuples_returned(c.oid) as n_tup_read,
       pg_stat_get_tuples_fetched(c.oid) as n_tup_fetched
FROM pg_class c
LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE relkind = 'r'
AND schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC;
```

**Solutions**:

1. **Optimize slow queries**:
   ```sql
   -- Add missing indexes
   CREATE INDEX CONCURRENTLY idx_sessions_status_updated 
   ON sessions(status, updated_at);
   
   -- Analyze query execution plan
   EXPLAIN (ANALYZE, BUFFERS) 
   SELECT * FROM sessions 
   WHERE status = 'running' 
   ORDER BY updated_at DESC 
   LIMIT 10;
   ```

2. **Update table statistics**:
   ```sql
   ANALYZE sessions;
   ANALYZE runs;
   ANALYZE transcript_events;
   ```

3. **Reindex fragmented tables**:
   ```sql
   REINDEX TABLE CONCURRENTLY transcript_events;
   REINDEX TABLE CONCURRENTLY run_events;
   ```

### Migration Issues

**Symptoms**:
- Migration failures
- Schema inconsistencies
- Data corruption

**Diagnosis**:
```bash
# Check migration status
npm run migration:status

# Check database schema
psql -h $DATABASE_HOST -U mission_control_app -d mission_control -c "\dt"

# Check specific table structure
psql -h $DATABASE_HOST -U mission_control_app -d mission_control -c "\d sessions"
```

**Solutions**:

1. **Fix failed migration**:
   ```bash
   # Rollback to last known good state
   npm run migration:rollback -- --to=<last_good_migration>
   
   # Fix migration script
   # Re-run migration
   npm run migration:run
   ```

2. **Manual schema repair**:
   ```sql
   -- Example: Fix foreign key constraint
   ALTER TABLE sessions 
   DROP CONSTRAINT IF EXISTS sessions_agent_id_fkey;
   
   ALTER TABLE sessions 
   ADD CONSTRAINT sessions_agent_id_fkey 
   FOREIGN KEY (agent_id) REFERENCES agents(id);
   ```

## Application Issues

### Store Initialization Failures

**Symptoms**:
- Application fails to start
- Store initialization errors
- Database connection failures

**Diagnosis**:
```typescript
// Add detailed logging during initialization
export async function createStore(): Promise<ControlApiStore> {
  console.log('Initializing store...');
  
  try {
    if (process.env.PERSISTENCE_MODE === 'postgres') {
      console.log('Connecting to PostgreSQL:', process.env.DATABASE_URL?.replace(/:.*@/, ':***@'));
      const db = new DatabaseManager(process.env.DATABASE_URL!);
      
      console.log('Testing database connection...');
      const healthy = await db.healthCheck();
      if (!healthy) {
        throw new Error('Database health check failed');
      }
      
      console.log('Creating PostgreSQL store...');
      return new PostgresControlApiStore(db);
    } else {
      console.log('Using in-memory store');
      return new InMemoryControlApiStore();
    }
  } catch (error) {
    console.error('Store initialization failed:', error);
    throw error;
  }
}
```

**Solutions**:

1. **Add environment validation**:
   ```typescript
   function validateEnvironment(): void {
     const required = ['DATABASE_URL'];
     const missing = required.filter(key => !process.env[key]);
     
     if (missing.length > 0) {
       throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
     }
   }
   ```

2. **Implement health checks**:
   ```typescript
   app.get('/health', async (req, res) => {
     const health = {
       status: 'ok',
       database: 'unknown',
       timestamp: new Date().toISOString()
     };
     
     try {
       health.database = await db.healthCheck() ? 'ok' : 'error';
     } catch (error) {
       health.database = 'error';
     }
     
     const overallHealthy = health.database === 'ok';
     res.status(overallHealthy ? 200 : 503).json(health);
   });
   ```

### Event Streaming Issues

**Symptoms**:
- SSE connections drop
- Events not received by clients
- Out-of-order events

**Diagnosis**:
```typescript
// Add logging to event publishing
async addRunEvent(runId: string, type: string, payload: any): Promise<void> {
  console.log(`Adding run event: run=${runId}, type=${type}`);
  
  try {
    // Persist to database
    await this.addRunEventToDatabase(runId, type, payload);
    
    // Notify via PostgreSQL LISTEN
    const channel = `run_events:${runId}`;
    console.log(`Notifying channel: ${channel}`);
    
    await this.db.query(`NOTIFY ${channel}, '${JSON.stringify({ runId, type, payload })}'`);
    console.log('Event notified successfully');
  } catch (error) {
    console.error('Failed to publish run event:', error);
    throw error;
  }
}
```

**Solutions**:

1. **Implement event buffering**:
   ```typescript
   class EventBuffer {
     private buffer = new Map<string, any[]>();
     private bufferSize = 100;
     
     addEvent(key: string, event: any): void {
       const events = this.buffer.get(key) || [];
       events.push(event);
       
       if (events.length > this.bufferSize) {
         events.shift(); // Remove oldest
       }
       
       this.buffer.set(key, events);
     }
     
     getEvents(key: string, fromSequence = 0): any[] {
       const events = this.buffer.get(key) || [];
       return events.filter(event => event.sequence > fromSequence);
     }
   }
   ```

2. **Add connection monitoring**:
   ```typescript
   app.get('/v1/runs/:runId/stream', async (req, res) => {
     const { runId } = req.params;
     const { lastSequence = 0 } = req.query;
     
     res.writeHead(200, {
       'Content-Type': 'text/event-stream',
       'Cache-Control': 'no-cache',
       'Connection': 'keep-alive',
     });
     
     // Keep connection alive
     const keepAlive = setInterval(() => {
       res.write(': keep-alive\n\n');
     }, 30000);
     
     // Handle client disconnect
     req.on('close', () => {
       console.log(`SSE client disconnected from run: ${runId}`);
       clearInterval(keepAlive);
     });
     
     // Send initial backfill from database
     const events = await store.getRunEvents(runId, lastSequence);
     events.forEach(event => {
       res.write(`data: ${JSON.stringify(event)}\n\n`);
     });
     
     // Subscribe to new events via PostgreSQL LISTEN
     const unsubscribe = store.subscribeToRunEvents(runId, (event) => {
       res.write(`data: ${JSON.stringify(event)}\n\n`);
     });
   });
   ```

## Performance Debugging

### Slow Query Analysis

**Identify Problem Queries**:
```sql
-- Find queries taking > 100ms
SELECT query, calls, total_time, mean_time, rows
FROM pg_stat_statements
WHERE mean_time > 100
ORDER BY mean_time DESC;

-- Check index effectiveness
SELECT schemaname, tablename, indexname, idx_scan, 
       idx_tup_read, idx_tup_fetch,
       idx_scan::float / (SELECT sum(seq_scan) FROM pg_stat_user_tables WHERE tablename = pg_stat_user_indexes.tablename) as index_usage_ratio
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC;
```

**Query Optimization**:
```sql
-- Example: Optimize transcript event queries
-- Before: Full table scan
EXPLAIN (ANALYZE) 
SELECT * FROM transcript_events 
WHERE session_id = 'sess_123' AND sequence > 100;

-- After: Use composite index
CREATE INDEX CONCURRENTLY idx_transcript_events_session_sequence 
ON transcript_events(session_id, sequence);

-- Verify index usage
EXPLAIN (ANALYZE) 
SELECT * FROM transcript_events 
WHERE session_id = 'sess_123' AND sequence > 100;
```

### Memory Usage Analysis

**Application Memory**:
```bash
# Node.js memory usage
node --inspect app.js
# Open Chrome DevTools > Node.js icon > Memory tab

# Monitor memory leaks
npm install -g clinic
clinic doctor -- node app.js
```

**Database Memory**:
```sql
-- Check memory usage by table
SELECT schemaname, tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
       pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

## Monitoring and Alerting

### Key Metrics to Watch

**Database Metrics**:
- Connection pool utilization (>80% = alert)
- Query latency (p95 > 100ms = alert)
- Replication lag (>1s = alert)
- Disk usage (>80% = alert)
- NOTIFY/LISTEN channel latency (>5s = alert)

**Application Metrics**:
- Event publishing rate (drops > 50% = alert)
- Approval decision latency (>30s = alert)
- Error rate (>5% = alert)

### Log Analysis

**Structured Logging Example**:
```typescript
// Add correlation IDs for request tracing
import { v4 as uuidv4 } from 'uuid';

app.use((req, res, next) => {
  req.correlationId = req.headers['x-correlation-id'] || uuidv4();
  res.setHeader('x-correlation-id', req.correlationId);
  
  logger.info('Request started', {
    correlationId: req.correlationId,
    method: req.method,
    path: req.path,
    userAgent: req.headers['user-agent']
  });
  
  next();
});
```

**Log Queries**:
```bash
# Find database errors
grep "ERROR.*database" /var/log/app/app.log | tail -20

# Find slow requests
grep "duration.*ms" /var/log/app/app.log | awk '$NF > 1000' | tail -10
```

## Emergency Procedures

### Database Corruption

**Symptoms**:
- Data inconsistency errors
- Constraint violations
- Query returning wrong results

**Emergency Response**:
```bash
# 1. Stop application
kubectl scale deployment mission-control-api --replicas=0

# 2. Create emergency backup
pg_dump -h $DATABASE_HOST -U mission_control_migrations mission_control > emergency_backup_$(date +%s).sql

# 3. Restore from last known good backup
psql -h $DATABASE_HOST -U mission_control_migrations mission_control < backup_YYYYMMDD_HHMMSS.sql

# 4. Run data consistency checks
npm run db:consistency-check

# 5. Restart application
kubectl scale deployment mission-control-api --replicas=3
```

### Total System Outage

**Recovery Checklist**:
- [ ] Check infrastructure health (VMs, network, storage)
- [ ] Restart database services
- [ ] Run database consistency checks
- [ ] Clear application caches
- [ ] Restart application services
- [ ] Verify health endpoints
- [ ] Monitor for errors
- [ ] Notify stakeholders

This troubleshooting guide provides comprehensive procedures for diagnosing and resolving common issues with the persistence layer.
