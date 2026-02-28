# Technical Design

## 1. Overview

- **Goal**
  - Build a web application ("Pi Ops Console") that can control remote pi agents from one UI: browse chats/sessions, send prompts, monitor tool execution, and manage long-running tasks with CLI-equivalent behavior.
- **Non-goals**
  - Replacing the local pi CLI for all workflows in v1.
  - Building a general multi-tenant SaaS billing platform.
  - Supporting arbitrary non-pi agent runtimes in v1.
- **Users / Stakeholders**
  - Individual developers running multiple agent sessions.
  - Team leads/reviewers who need visibility and approval control.
  - Platform/infra maintainers operating agent workers.
- **Acceptance Criteria (DoD)**
  - A user can create/select an agent session from the web app and send prompts.
  - The UI streams live agent events (assistant deltas, tool calls, tool output, stop/error).
  - Sessions and transcripts persist and can be reopened.
  - Agent runs execute in isolated workspaces and preserve CLI-like tool behavior.
  - Approval gates can block/allow configured risky actions (e.g., write/edit/bash patterns).

## 2. Current State

- Architecture summary (as-is)
  - `@mariozechner/pi-web-ui` provides reusable chat components and local browser storage/session flows.
  - `@mariozechner/pi-agent-core` provides stateful agent loops, tool execution, and streaming events.
  - `@mariozechner/pi-coding-agent` provides interactive CLI plus SDK/RPC modes.
- Key modules / boundaries
  - Web UI components are presentation-centric and assume in-process agent usage.
  - Coding-agent is optimized for terminal and local execution.
  - No built-in centralized control plane for remote multi-agent orchestration.
- Constraints / pain points
  - Need parity with CLI semantics while running remotely.
  - Need safe multi-session isolation and auditable actions.
  - Need durable event persistence + real-time fan-out to browsers.

## 3. Proposed Solution

- **Architecture:** components + responsibilities
  1. **Web Frontend (packages/web-ui consumer app)**
     - Reuse chat/event components from `pi-web-ui`.
     - Add custom panes: session list, task queue, execution timeline, approval inbox, diff/log viewer.
  2. **Control Plane API (new service)**
     - AuthN/AuthZ, workspace routing, lifecycle APIs, persistence orchestration.
     - Event streaming to clients over WebSocket/SSE.
  3. **Agent Worker Service (new service)**
     - Runs pi agent sessions via coding-agent SDK/RPC in isolated execution environments.
     - Executes tools and emits normalized event envelopes.
  4. **Persistence Layer**
     - Relational DB for users, agents, sessions, tasks, approvals, run metadata.
     - Blob/object storage for transcripts, patches, large logs, exported artifacts.
  5. **Workspace Manager**
     - Creates per-session worktrees/containers, handles cleanup and retention.

- **Interfaces / APIs:** endpoints, events, contracts (include examples)
  - REST (control operations)
    - `POST /v1/agents` create agent profile/runtime config.
    - `POST /v1/sessions` create session (`agentId`, `workspaceId`, optional seed prompt).
    - `POST /v1/sessions/:id/messages` enqueue user message.
    - `POST /v1/runs/:id/approve` or `/reject` for gated actions.
    - `GET /v1/sessions/:id/transcript` fetch persisted timeline.
  - Realtime stream (WebSocket or SSE)
    - Event envelope:
      ```json
      {
        "sessionId": "sess_123",
        "runId": "run_456",
        "sequence": 87,
        "timestamp": "2026-02-28T23:00:00.000Z",
        "event": {
          "type": "message_update",
          "assistantMessageEvent": {
            "type": "text_delta",
            "delta": "Working on it..."
          }
        }
      }
      ```
  - Approval request contract
    ```json
    {
      "approvalId": "apr_123",
      "sessionId": "sess_123",
      "tool": "bash",
      "riskLevel": "high",
      "summary": "Command touches git history",
      "payload": { "command": "git rebase -i HEAD~5" },
      "expiresAt": "2026-02-28T23:10:00.000Z"
    }
    ```

- **Data model changes:** schema, migrations, backward-compat notes
  - `agents(id, name, model, default_tools, policy_id, created_at, updated_at)`
  - `workspaces(id, repo_url, default_branch, isolation_mode, created_at)`
  - `sessions(id, agent_id, workspace_id, status, title, created_by, created_at, updated_at)`
  - `runs(id, session_id, status, started_at, finished_at, error_code, cost_usd)`
  - `messages(id, session_id, run_id, role, content_json, sequence, created_at)`
  - `events(id, run_id, sequence, type, payload_json, created_at)`
  - `approvals(id, run_id, tool, payload_json, state, decided_by, decided_at)`
  - Backward compatibility: no breaking changes to existing `pi-web-ui` components; integration occurs via adapter layer and additional app-level state.

- **Control flow:** step-by-step sequences for key paths
  1. **Start session**
     - User creates/selects session in web UI.
     - Control plane allocates worker + isolated workspace.
     - Session metadata persisted; client subscribes to realtime channel.
  2. **Prompt agent**
     - UI posts message; control plane enqueues run.
     - Worker executes agent loop and streams normalized events.
     - Control plane persists events/messages and forwards to subscribed clients.
  3. **Approval gate path**
     - Worker intercepts policy-matching tool action, emits `approval_required`.
     - Run pauses until approve/reject/timeout.
     - Decision resumes run or returns tool error + explanatory event.

- **Edge cases & error handling:** retries, idempotency, failure modes
  - Idempotency keys on message enqueue to avoid duplicate runs on retries.
  - Worker heartbeats; control plane marks runs as `orphaned` and supports resume/replay.
  - Sequence numbers enforce deterministic event ordering per run.
  - Approval timeout policy defaults to deny for high-risk actions.
  - Network disconnects: client reconnects with `lastSequence` to catch up.

- **Security & compliance:** authn/z, secrets, PII, audit, least privilege
  - OIDC/JWT auth for users; role-based permissions for session access and approvals.
  - Provider keys stored server-side in encrypted secret store; never exposed to browser.
  - Per-workspace filesystem/container isolation; least-privilege runtime user.
  - Immutable audit log for prompts, tool calls, approval decisions, and actor identity.

- **Observability:** logs, metrics, traces, dashboards/alerts (if relevant)
  - Structured logs keyed by `sessionId`/`runId`/`workspaceId`.
  - Metrics: run duration, queue delay, approval latency, failure rates by tool/provider.
  - Distributed traces across API -> worker -> provider calls.
  - Alerts on worker crash loops, stuck approvals, and event-stream lag.

## 4. Alternatives Considered

- Option A: Thin wrapper around CLI processes over PTY
  - Pros: fastest prototype, high behavioral parity with terminal output.
  - Cons: brittle parsing, poor typed contracts, harder replay/idempotency.
- Option B: Native service using coding-agent SDK/RPC + normalized event model
  - Pros: typed events, better control flow, cleaner persistence/replay, easier policy hooks.
  - Cons: more upfront implementation effort.
- Decision + rationale
  - Choose **Option B** for maintainability and product-grade reliability; optionally use PTY mode only as a temporary fallback for unsupported cases.

## 5. Testing Strategy

- Unit tests (what, where)
  - Control plane policy engine, approval state machine, idempotency, event envelope serializer.
- Integration tests (dependencies, setup)
  - API + worker + DB with seeded workspace; validate end-to-end prompt/tool/approval flow.
- Contract/API tests (if applicable)
  - OpenAPI/JSON-schema validation for REST and realtime event payloads.
- Regression/performance tests (if applicable)
  - Session replay regression suite and concurrent-run load tests (N workers × M sessions).

## 6. Rollout Plan

- Backwards compatibility strategy
  - Keep existing local web-ui example intact; introduce remote mode behind config flag.
- Feature flags (if applicable)
  - `remoteAgentControl`, `approvalGates`, `multiWorkspace`.
- Migration plan (stepwise)
  1. Internal alpha with single workspace and single worker.
  2. Add durable queue + restart-safe resume.
  3. Add approvals and audit trails.
  4. Expand to multi-workspace/team RBAC.
- Monitoring plan
  - Launch with dashboards for run success rate, stream latency, queue depth.
- Rollback plan
  - Disable `remoteAgentControl` flag and fall back to local/in-process agent mode.

## 7. Risks & Mitigations

- Risk -> mitigation
  - Event schema drift between worker and UI -> versioned event contracts + contract tests.
  - Unbounded workspace/resource growth -> TTL cleanup + quotas + retention policies.
  - Security regressions in remote execution -> isolation hardening + approval defaults + audit.
  - User confusion between session/task/run concepts -> explicit UI hierarchy and terminology.
- Open questions
  - Preferred queue/event infrastructure (Redis Streams vs NATS vs Postgres-based queue).
  - Required tenancy model for first release (single-team vs org multi-tenant).
  - Whether to support direct git operations in v1 or gate behind explicit policy profiles.
