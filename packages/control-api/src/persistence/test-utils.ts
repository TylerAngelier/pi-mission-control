import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import { DatabaseManager } from "./database.js";
import { PostgresControlApiRepository } from "./repositories/control-api.repository.js";

export interface SeededData {
  userId: string;
  workspaceId: string;
  agentId: string;
  sessionId: string;
}

export const withRollbackTransaction = async <T>(
  db: DatabaseManager,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const client = await db.getClient();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("ROLLBACK");
    return result;
  } finally {
    client.release();
  }
};

export const seedPersistenceData = async (db: DatabaseManager): Promise<SeededData> => {
  const repository = new PostgresControlApiRepository(db);

  const userId = `user_${randomUUID()}`;
  const workspaceId = `workspace_${randomUUID()}`;
  const agentId = `agent_${randomUUID()}`;
  const sessionId = `sess_${randomUUID()}`;

  await db.query(
    `INSERT INTO users (id, email, display_name)
     VALUES ($1, $2, $3)`,
    [userId, `${userId}@example.com`, "Seed User"]
  );

  await db.query(
    `INSERT INTO workspaces (id, name, repo_url, default_branch, isolation_mode)
     VALUES ($1, $2, $3, 'main', 'local')`,
    [workspaceId, "Seed Workspace", "https://example.com/repo.git"]
  );

  await repository.createAgent({
    id: agentId,
    name: "Seed Agent",
    model: "anthropic/claude-sonnet-4-5-20250929",
    defaultTools: ["read", "bash", "edit", "write"],
    policyId: "policy_default",
  });

  await repository.createSession({
    id: sessionId,
    agentId,
    workspaceId,
    title: "Seed Session",
    createdBy: userId,
  });

  return { userId, workspaceId, agentId, sessionId };
};

export const fixtureFactory = {
  agent: (overrides: Partial<{ name: string; model: string }> = {}) => ({
    name: overrides.name ?? "Fixture Agent",
    model: overrides.model ?? "anthropic/claude-sonnet-4-5-20250929",
  }),
  session: (overrides: Partial<{ title: string; workspaceId: string }> = {}) => ({
    title: overrides.title ?? "Fixture Session",
    workspaceId: overrides.workspaceId ?? "workspace_fixture",
  }),
  message: (overrides: Partial<{ content: string; idempotencyKey: string }> = {}) => ({
    content: overrides.content ?? "Fixture message",
    idempotencyKey: overrides.idempotencyKey,
  }),
};
