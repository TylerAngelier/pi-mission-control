import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DatabaseManager } from "./database.js";
import { MigrationRunner } from "./migrations/runner.js";
import { PostgresNotifyManager } from "./notify.js";
import { PostgresRunEventRepository } from "./repositories/run-event.repository.js";

const databaseUrl = process.env.MISSION_CONTROL_TEST_DATABASE_URL;
const runIntegration = Boolean(databaseUrl);

describe.skipIf(!runIntegration)("persistence load and failover validations", () => {
  let db: DatabaseManager;
  let notify: PostgresNotifyManager;

  beforeAll(async () => {
    db = new DatabaseManager({ connectionString: databaseUrl });
    await db.query("DROP SCHEMA public CASCADE");
    await db.query("CREATE SCHEMA public");

    const migrationsDirectory = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "migrations"
    );

    await new MigrationRunner(db, { migrationsDirectory }).run();

    await db.query(`INSERT INTO users (id, email, display_name) VALUES ('user_load', 'load@example.com', 'Load User')`);
    await db.query(
      `INSERT INTO workspaces (id, name, repo_url, default_branch, isolation_mode)
       VALUES ('workspace_load', 'Load Workspace', 'https://example.com/repo.git', 'main', 'local')`
    );
    await db.query(
      `INSERT INTO agents (id, name, model, default_tools, policy_id)
       VALUES ('agent_load', 'Load Agent', 'anthropic/claude-sonnet-4-5-20250929', ARRAY['read','bash','edit','write'], 'policy_default')`
    );
    await db.query(
      `INSERT INTO sessions (id, agent_id, workspace_id, status, title, created_by)
       VALUES ('sess_load', 'agent_load', 'workspace_load', 'running', 'Load Session', 'user_load')`
    );
    await db.query(
      `INSERT INTO runs (id, session_id, status)
       VALUES ('run_load', 'sess_load', 'running')`
    );

    notify = new PostgresNotifyManager(db);
  });

  afterAll(async () => {
    await notify.close();
    await db.close();
  });

  it("ingests run events at acceptable throughput", async () => {
    const repository = new PostgresRunEventRepository(db);
    const count = 200;
    const start = Date.now();

    for (let index = 0; index < count; index += 1) {
      await repository.create({
        runId: "run_load",
        sessionId: "sess_load",
        type: "assistant_text_delta",
        payload: { chunk: index },
      });
    }

    const durationMs = Date.now() - start;
    const eventsPerSecond = (count / durationMs) * 1000;

    expect(eventsPerSecond).toBeGreaterThan(100);
  });

  it("delivers NOTIFY/LISTEN events under load", async () => {
    const received: number[] = [];

    const unsubscribe = await notify.subscribe("load_channel", (payload) => {
      const parsed = JSON.parse(payload) as { index: number };
      received.push(parsed.index);
    });

    await Promise.all(
      Array.from({ length: 50 }, (_, index) =>
        notify.publish("load_channel", JSON.stringify({ index }))
      )
    );

    await new Promise((resolve) => setTimeout(resolve, 100));
    await unsubscribe();

    expect(received.length).toBe(50);
  });

  it("recovers after listener restart (failover simulation)", async () => {
    await notify.close();

    const recovered: string[] = [];
    const unsubscribe = await notify.subscribe("failover_channel", (payload) => {
      recovered.push(payload);
    });

    await notify.publish("failover_channel", JSON.stringify({ recovered: true }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    await unsubscribe();
    expect(recovered).toContain('{"recovered":true}');
  });
});
