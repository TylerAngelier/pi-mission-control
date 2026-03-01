#!/usr/bin/env bash
set -euo pipefail

TEST_DB_URL="${MISSION_CONTROL_TEST_DATABASE_URL:-postgresql://postgres:postgres@localhost:5433/mission_control_test}"

cleanup() {
  set +e
  MISSION_CONTROL_TEST_DATABASE_URL="$TEST_DB_URL" npm run test:teardown-db >/dev/null 2>&1
  docker compose -f docker-compose.test.yml down >/dev/null 2>&1
}

trap cleanup EXIT

echo "[drone-local] lint"
npm run lint

echo "[drone-local] typecheck"
npm run typecheck

echo "[drone-local] test"
npm test

echo "[drone-local] build"
npm run build

echo "[drone-local] start postgres service"
docker compose -f docker-compose.test.yml up -d

echo "[drone-local] integration setup"
MISSION_CONTROL_TEST_DATABASE_URL="$TEST_DB_URL" npm run test:setup-db

echo "[drone-local] integration test"
MISSION_CONTROL_TEST_DATABASE_URL="$TEST_DB_URL" npm run test:integration

echo "[drone-local] complete"
