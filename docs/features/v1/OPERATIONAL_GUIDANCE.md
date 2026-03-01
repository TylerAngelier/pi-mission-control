# Operational Guidance - Pi Mission Control v1

## Overview

This document provides operational guidance for monitoring, alerting, and rollout of the Pi Mission Control v1 features.

## 6.2.1 Metrics, Dashboards, and Alerts

### Key Metrics to Monitor

#### Application Performance Metrics
- **Request Latency**: API endpoint response times (p50, p95, p99)
  - Target: p95 < 500ms for all endpoints
  - Endpoints: `/v1/sessions`, `/v1/sessions/:id/messages`, `/v1/runs/:id/approve`, `/v1/runs/:id/reject`
- **Stream Latency**: Time from event generation to client delivery via SSE
  - Target: p95 < 100ms from worker emit to client receive
- **Queue Depth**: Number of pending runs/approvals
  - Alert if > 100 pending runs
  - Alert if > 10 pending approvals

#### Worker Metrics
- **Run Success Rate**: Percentage of runs completed successfully
  - Target: > 95%
- **Run Duration**: Time from queue to completion
  - Alert on outlier: p99 > 10x median duration
- **Tool Execution Time**: Per-tool performance metrics
  - Alert: bash operations > 30s, read operations > 5s

#### Approval Metrics
- **Approval Latency**: Time from approval_required to decision
  - Target: median < 5 minutes
  - Alert: median > 15 minutes
- **Approval Timeout Rate**: Percentage of approvals expiring before decision
  - Target: < 5%
  - Alert: > 10%

### Dashboard Recommendations

Create dashboards in your monitoring system (e.g., Grafana, Datadog, CloudWatch) with these panels:

1. **Request Rate & Latency Panel**
   - Line chart: requests/second over time
   - Heatmap: latency by endpoint

2. **Stream Health Panel**
   - Gauge: active SSE connections
   - Time series: messages delivered/second
   - Bar chart: stream reconnection rate

3. **Queue Depth Panel**
   - Gauge: pending runs
   - Gauge: pending approvals
   - Time series: historical queue depth

4. **Run Status Panel**
   - Pie chart: runs by status (queued/running/completed/failed)
   - Time series: run success rate over time

5. **Approval Flow Panel**
   - Time series: approval latency (p50, p95, p99)
   - Bar chart: approvals by risk level (low/medium/high)
   - Single stat: approval timeout rate

### Alerting Rules

Configure these alerts:

**Critical Alerts (Page immediately):**
- API error rate > 5%
- Worker crash (exit code != 0)
- Database connection failures
- SSE stream delivery failure > 1%

**Warning Alerts (Send notification within 5 minutes):**
- p95 latency > 1s for any endpoint
- Queue depth > 50 pending runs
- Queue depth > 5 pending approvals
- Approval latency median > 10 minutes

**Info Alerts (Log for trend analysis):**
- Queue depth trending upward
- Approval latency trending upward
- Run success rate < 90%

## 6.2.2 Staged Rollout with Feature Flags

### Feature Flags

Use environment variables for gradual rollout:

```bash
# Feature flags
ENABLE_REMOTE_AGENT_CONTROL=true
ENABLE_APPROVAL_GATES=true
ENABLE_MULTI_WORKSPACE=true

# Rollout stages (0-100%)
REMOTE_AGENT_CONTROL_ROLLOUT_PERCENTAGE=100
APPROVAL_GATES_ROLLOUT_PERCENTAGE=100
```

### Rollout Stages

#### Stage 1: Internal Alpha (0-10%)
- Target users: Core development team
- Duration: 1 week
- Success criteria: No critical bugs, stable performance
- Rollback trigger: Any critical bug or p95 latency > 2s

#### Stage 2: Selected Beta (10-50%)
- Target users: Early adopters and power users
- Duration: 2 weeks
- Success criteria: No critical bugs, approval flow used 50+ times
- Rollback trigger: Data loss, approval decisions not persisting

#### Stage 3: General Availability (50-100%)
- Target users: All users
- Duration: 1 week monitoring before marking GA
- Success criteria: 99.9% uptime, p95 latency < 500ms
- Rollback trigger: Any data corruption, security issue

### Rollback Playbook

**When to Rollback:**
1. Critical bug discovered during rollout
2. Performance degradation (p95 latency > 2x baseline)
3. Data loss or corruption
4. Security vulnerability
5. Approval gates not functioning

**Rollback Steps:**
1. Set feature flag to 0%:
   ```bash
   REMOTE_AGENT_CONTROL_ROLLOUT_PERCENTAGE=0
   ```
2. Deploy configuration change to all instances
3. Verify rollback complete:
   - No new sessions created
   - Existing sessions still functional
   - Dashboard metrics return to baseline
4. Investigate root cause of rollback trigger
5. Fix issue and restart rollout from Stage 1

**Post-Rollback Verification:**
- Monitor error logs for related issues
- Check database consistency
- Verify no orphaned runs/approvals
- Confirm UI displays correctly for rolled-back users

### Health Check Endpoints

Add these endpoints for monitoring system probes:

```typescript
// Control API Health
GET /health
Response: { service: "control-api", status: "ok" }

// Worker Health
GET /worker/health
Response: { service: "worker", status: "ok", activeRuns: number }

// Stream Health Check
GET /v1/sessions/:sessionId/health
Response: { streamConnected: boolean, lastEventTime: string }
```

### Monitoring System Integration

Integrate with your monitoring stack:

**Prometheus Metrics Export:**
```typescript
// Add to control-api/src/metrics.ts
import { register, Counter, Histogram } from 'prom-client';

const apiRequestDuration = new Histogram({
  name: 'pi_mission_control_api_request_duration_seconds',
  help: 'API request duration in seconds',
  labelNames: ['method', 'route', 'status_code']
});

const activeSseConnections = new Gauge({
  name: 'pi_mission_control_active_sse_connections',
  help: 'Number of active SSE connections'
});

register.register(apiRequestDuration, activeSseConnections);
```

**Structured Logging:**
```typescript
// Use JSON logging for log aggregation
logger.info({
  timestamp: new Date().toISOString(),
  service: "pi-mission-control",
  level: "info",
  component: "control-api",
  event: "message_enqueued",
  sessionId,
  runId,
  durationMs
});
```

## Rollout Checklist

Before rolling out to production:

- [ ] All critical alerts configured and tested
- [ ] Dashboards created and validated
- [ ] Feature flag infrastructure in place
- [ ] Rollback playbook documented and tested
- [ ] Load testing completed (validate 100 concurrent users)
- [ ] Security review completed
- [ ] Database backups verified
- [ ] Runbook for incident response created
- [ ] On-call rotation established
- [ ] Post-mortem template defined

## Incident Response

For major incidents:

1. **Identify**: Alert triggered within 5 minutes
2. **Triage**: Classify severity (P0-P3)
   - P0: Service down, data loss
   - P1: Degraded, critical features broken
   - P2: Minor degradation, non-critical features broken
   - P3: Cosmetic, no impact
3. **Mobilize**: On-call engineer assigned per rotation
4. **Mitigate**: Execute rollback or fix per playbook
5. **Communicate**: Update status page and notify stakeholders
6. **Resolve**: Fix issue and validate
7. **Post-mortem**: Document root cause and preventative measures

## Success Criteria

v1 is considered successfully rolled out when:

- All features (remote agent control, approval gates, multi-workspace) enabled
- p95 API latency < 500ms
- p95 SSE stream latency < 100ms
- Run success rate > 95%
- Approval timeout rate < 5%
- Uptime > 99.9% for 30 days
- Zero critical security incidents
