# Persistence Layer Contribution Guidelines

## Scope

These guidelines apply to persistence-related changes in:

- `packages/control-api/src/persistence/**`
- migration scripts in `packages/control-api/src/persistence/migrations/**`
- persistence integration tests and DB setup scripts

## Rules

1. **Schema changes require migrations**
   - Never modify existing migration files after merge.
   - Add new forward-only migration files with monotonic numbering.

2. **Preserve API compatibility**
   - Keep `ControlApiStore` behavior consistent between in-memory and postgres modes.
   - Update tests when behavior changes.

3. **Validate locally before commit**

   ```bash
   npm run typecheck
   npm run lint
   npm test
   npm run build
   ```

4. **For persistence-specific changes, run integration checks**

   ```bash
   docker compose -f docker-compose.test.yml up -d
   npm run test:setup-db
   npm run test:integration
   npm run test:teardown-db
   ```

5. **Document operational impact**
   - Update `docs/persistence/OPERATIONS.md` and/or `docs/persistence/TROUBLESHOOTING.md` for any runbook change.

## Style

- Keep SQL idempotent where practical (`IF NOT EXISTS` for additive changes).
- Prefer explicit column lists in insert/select queries.
- Keep repository methods focused on one entity operation at a time.
