# Persistence Layer Operations Guide

## Overview

This guide covers operational procedures for running and maintaining the Pi Mission Control persistence layer with PostgreSQL in production environments.

## Infrastructure Requirements

### Minimum Production Specifications

**PostgreSQL**:
- CPU: 4 cores minimum, 8 cores recommended
- Memory: 16GB minimum, 32GB recommended
- Storage: 100GB SSD minimum, 500GB recommended
- Version: PostgreSQL 16+
- Replication: Streaming replication with 1+ replicas

### Network Requirements

- Latency: < 1ms between application and database
- Bandwidth: 1Gbps minimum
- Security: TLS encryption for all connections
- Monitoring: Network metrics collection enabled

## Database Setup

### PostgreSQL Configuration

**Production postgresql.conf**:
```ini
# Memory Settings
shared_buffers = 4GB                  # 25% of RAM
effective_cache_size = 12GB           # 75% of RAM
work_mem = 256MB
maintenance_work_mem = 1GB

# Connection Settings
max_connections = 200
shared_preload_libraries = 'pg_stat_statements'

# Performance Settings
random_page_cost = 1.1                # SSD optimization
effective_io_concurrency = 200
max_worker_processes = 8
max_parallel_workers = 8
max_parallel_workers_per_gather = 4

# WAL Settings
wal_level = replica
max_wal_size = 4GB
min_wal_size = 1GB
checkpoint_completion_target = 0.9

# Logging Settings
log_destination = 'csvlog'
logging_collector = on
log_directory = 'pg_log'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
log_min_duration_statement = 1000     # Log queries > 1s
log_checkpoints = on
log_connections = on
log_disconnections = on
log_lock_waits = on
```

**Replication Setup**:
```sql
-- Primary server
CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD '<strong_password>';

-- Recovery configuration for replicas
standby_mode = 'on'
primary_conninfo = 'host=<primary_ip> port=5432 user=replicator'
restore_command = 'cp /archive/%f %p'
```

### Database User Management

```sql
-- Application user with limited privileges
CREATE USER mission_control_app WITH PASSWORD '<strong_password>';
GRANT CONNECT ON DATABASE mission_control TO mission_control_app;
GRANT USAGE ON SCHEMA public TO mission_control_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mission_control_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO mission_control_app;

-- Read-only user for analytics
CREATE USER mission_control_readonly WITH PASSWORD '<strong_password>';
GRANT CONNECT ON DATABASE mission_control TO mission_control_readonly;
GRANT USAGE ON SCHEMA public TO mission_control_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO mission_control_readonly;

-- Migration user
CREATE USER mission_control_migrations WITH PASSWORD '<strong_password>';
GRANT CONNECT ON DATABASE mission_control TO mission_control_migrations;
GRANT ALL PRIVILEGES ON SCHEMA public TO mission_control_migrations;
```

## Deployment Procedures

### Database Migration

**Pre-Migration Checklist**:
- [ ] Full database backup completed
- [ ] Migration scripts tested in staging
- [ ] Application rollback plan ready
- [ ] Monitoring dashboards configured
- [ ] Maintenance window scheduled

**Migration Execution**:
```bash
# 1. Backup current database
pg_dump -h <primary_host> -U mission_control_app -d mission_control > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Run database migrations
npm run migration:run

# 3. Verify migration success
psql -h <primary_host> -U mission_control_app -d mission_control -c "SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1;"

# 4. Run smoke tests
npm run test:smoke

# 5. Update application configuration
# Set PERSISTENCE_MODE=postgres
```

**Rollback Procedure**:
```bash
# 1. Stop application services
kubectl scale deployment mission-control-api --replicas=0

# 2. Restore database backup
psql -h <primary_host> -U mission_control_app -d mission_control < backup_YYYYMMDD_HHMMSS.sql

# 3. Rollback migrations if needed
npm run migration:rollback -- --to=<target_migration>

# 4. Restart services with old configuration
kubectl scale deployment mission-control-api --replicas=3
```

### Application Deployment

**Environment Configuration**:
```yaml
# production.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: mission-control-config
data:
  DATABASE_URL: "postgresql://mission_control_app:<password>@postgres-primary:5432/mission_control"
  PERSISTENCE_MODE: "postgres"
  LOG_LEVEL: "info"
  
---
apiVersion: v1
kind: Secret
metadata:
  name: mission-control-secrets
type: Opaque
data:
  DATABASE_PASSWORD: <base64_encoded_password>
```

**Health Checks**:
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8787
  initialDelaySeconds: 30
  periodSeconds: 10
  
readinessProbe:
  httpGet:
    path: /ready
    port: 8787
  initialDelaySeconds: 5
  periodSeconds: 5
  failureThreshold: 3
```

## Monitoring and Alerting

### Key Metrics

**Database Metrics**:
- Connection pool utilization (target: < 80%)
- Query execution time (p95 < 100ms)
- Transaction success rate (target: > 99.9%)
- Replication lag (target: < 1s)
- Disk usage (target: < 80%)
- WAL file size monitoring
- NOTIFY/LISTEN channel activity

**Application Metrics**:
- Event publishing rate
- Event consumption lag
- Approval decision latency
- Error rates by endpoint
- Request latency distribution

### Prometheus Configuration

**Database Exporter**:
```yaml
- job_name: 'postgres-exporter'
  static_configs:
    - targets: ['postgres-exporter:9187']
  scrape_interval: 15s
  metrics_path: /metrics
```

**Grafana Dashboard Alerts**:
```yaml
# High database connection utilization
- alert: DatabaseConnectionPoolHigh
  expr: pg_stat_activity_count / pg_settings_max_connections > 0.8
  for: 2m
  labels:
    severity: warning
  annotations:
    summary: "Database connection pool utilization high"
    description: "Connection pool utilization is {{ $value }}%"

# Event streaming lag
- alert: EventStreamingLag
  expr: event_streaming_lag_seconds > 30
  for: 1m
  labels:
    severity: warning
  annotations:
    summary: "Event streaming lag detected"
    description: "Event streaming lag is {{ $value }} seconds"
```

## Backup and Recovery

### Database Backup Strategy

**Daily Full Backups**:
```bash
#!/bin/bash
# backup.sh
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/postgres"
DB_NAME="mission_control"

# Create backup directory
mkdir -p $BACKUP_DIR

# Full backup with custom format
pg_dump -h postgres-primary -U mission_control_migrations \
  -d $DB_NAME \
  --format=custom \
  --compress=9 \
  --file=$BACKUP_DIR/full_backup_$DATE.dump

# Verify backup
pg_restore --list $BACKUP_DIR/full_backup_$DATE.dump > /dev/null
if [ $? -eq 0 ]; then
  echo "Backup successful: full_backup_$DATE.dump"
else
  echo "Backup verification failed"
  exit 1
fi

# Cleanup old backups (keep 7 days)
find $BACKUP_DIR -name "full_backup_*.dump" -mtime +7 -delete
```

**Point-in-Time Recovery**:
```bash
# Enable WAL archiving
archive_mode = on
archive_command = 'cp %p /archive/wal/%f'
archive_timeout = 300

# Recovery procedure
pg_basebackup -h postgres-primary -U replicator -D /recovery/base_backup -Ft -z -P
# Edit recovery.conf to specify target time
pg_ctl start -D /recovery/base_backup
```

## Troubleshooting

### Common Database Issues

**High Connection Usage**:
```sql
-- Check active connections
SELECT count(*) FROM pg_stat_activity;

-- Check long-running queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query 
FROM pg_stat_activity 
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes';

-- Kill specific connection
SELECT pg_terminate_backend(pid);
```

**Slow Query Analysis**:
```sql
-- Enable query statistics
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Analyze slow queries
SELECT query, calls, total_time, mean_time, stddev_time
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;
```

**Lock Contention**:
```sql
-- Check blocked queries
SELECT blocked_locks.pid AS blocked_pid,
       blocked_activity.usename AS blocked_user,
       blocking_locks.pid AS blocking_pid,
       blocking_activity.usename AS blocking_user,
       blocked_activity.query AS blocked_statement,
       blocking_activity.query AS current_statement_in_blocking_process
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;
```

## Performance Tuning

### Database Optimization

**Index Analysis**:
```sql
-- Check index usage
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats 
WHERE schemaname = 'public';

-- Find missing indexes
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats 
WHERE schemaname = 'public' AND tablename LIKE '%events%'
ORDER BY n_distinct DESC;

-- Analyze query performance
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM transcript_events WHERE session_id = 'sess_123';
```

**Table Partitioning**:
```sql
-- Partition transcript events by time
CREATE TABLE transcript_events_2024_01 PARTITION OF transcript_events
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- Create automatic partitions
CREATE OR REPLACE FUNCTION create_monthly_partition()
RETURNS void AS $$
DECLARE
    start_date date;
    end_date date;
    partition_name text;
BEGIN
    start_date := date_trunc('month', CURRENT_DATE + interval '1 month');
    end_date := start_date + interval '1 month';
    partition_name := 'transcript_events_' || to_char(start_date, 'YYYY_MM');
    
    EXECUTE format('CREATE TABLE %I PARTITION OF transcript_events FOR VALUES FROM (%L) TO (%L)',
                   partition_name, start_date, end_date);
END;
$$ LANGUAGE plpgsql;
```

## Security

### Database Security

**Connection Security**:
```ini
# Enforce SSL connections
ssl = on
ssl_cert_file = '/etc/ssl/certs/server.crt'
ssl_key_file = '/etc/ssl/private/server.key'
```

**Row Level Security**:
```sql
-- Enable RLS for sensitive tables
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Create policy for user data access
CREATE POLICY user_sessions_policy ON sessions
FOR ALL TO mission_control_app
USING (created_by = current_setting('app.current_user_id'));
```

This operations guide provides comprehensive procedures for managing the persistence layer in production environments.
