# Drone CI/CD

This repository uses `.drone.yml` for CI pipelines.

## Pipelines

### 1) `pr-main-quality`

Trigger:
- `pull_request`
- `push`
- `cron`
- `custom`

Stages:
1. `install` → `npm ci`
2. `lint` → `npm run lint`
3. `typecheck` → `npm run typecheck`
4. `test` → `npm test`
5. `build` → `npm run build`
6. postgres-backed integration flow (runs on PRs and pushes):
   - `wait-for-postgres`
   - `integration-setup` → `npm run test:setup-db`
   - `integration-test` → `npm run test:integration`
   - `integration-teardown` → `npm run test:teardown-db`

Integration environment:
- `MISSION_CONTROL_TEST_DATABASE_URL=postgresql://postgres:postgres@postgres-test:5432/mission_control_test`

Notes:
- Integration suites are run serially in control-api (`--maxWorkers=1`) because they reset shared DB schema.
- Root `typecheck`/`build` run in explicit workspace dependency order (`worker` → `control-api` → `web`) so clean CI environments do not depend on pre-existing `dist/` artifacts for cross-workspace type resolution.
- Root `test`/`test:coverage` also prebuild dependent workspaces so Vitest can resolve cross-workspace package entrypoints in clean CI runs.

### 2) `docker-images` (optional)

Trigger:
- tags matching `v*`

Builds and pushes images:
- `packages/control-api/Dockerfile`
- `packages/worker/Dockerfile`

## Required Drone Secrets

Configure these in the Drone repository settings:

- `docker_registry` (example: `ghcr.io`)
- `docker_username`
- `docker_password`

Optional future secrets (only if steps are added):
- `mission_control_api_token`
- `slack_webhook` (or equivalent notifier secret)

Security checklist:
- Never commit plaintext secrets to `.drone.yml`.
- Use `from_secret` for all credentials.
- Restrict secret exposure by event/branch where possible in Drone UI.

## Branch Protection (GitHub)

After first successful Drone runs:

1. GitHub → Settings → Branches → Branch protection rules.
2. Add rule for `main`.
3. Enable:
   - Require status checks to pass before merging
   - Require branches to be up to date before merging (recommended)
4. Select Drone check for the PR pipeline (`pr-main-quality`).
5. Disable force-push and deletion as needed by team policy.

## Local parity commands

Run before pushing:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Or run the local Drone parity script:

```bash
npm run ci:drone:local
```

For full parity with CI integration job:

```bash
docker compose -f docker-compose.test.yml up -d
MISSION_CONTROL_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/mission_control_test npm run test:setup-db
MISSION_CONTROL_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/mission_control_test npm run test:integration
MISSION_CONTROL_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/mission_control_test npm run test:teardown-db
docker compose -f docker-compose.test.yml down
```

## Pipeline validation / failure-path checks

Use these checks before making Drone required:

1. **Happy path**
   - Open PR and confirm `pr-main-quality` passes.
2. **Lint failure gate**
   - Introduce a temporary lint violation, push branch, confirm pipeline fails in `lint`.
3. **Typecheck failure gate**
   - Introduce a temporary TS type error, confirm `typecheck` fails.
4. **Integration DB failure diagnostics**
   - Temporarily break DB URL or disable service on a test branch; confirm integration steps fail with actionable logs.
5. **Performance check**
   - Measure total runtime and tune caching strategy if needed.

## Troubleshooting

### `No test files found` in integration stage
Ensure integration globs include root and nested files:
- `src/*.integration.test.ts`
- `src/**/*.integration.test.ts`

### Postgres schema race errors during integration
Control-api integration tests reset schema. Keep them serial (`--maxWorkers=1`).

### Worker integration fails with FK/table dependency errors
Worker integration now supports both:
- standalone approvals-only table setup
- shared migrated control-api schema

Use `npm run test:setup-db` first when running full integration flow.
