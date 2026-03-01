import express, { type NextFunction, type Request, type Response } from "express";
import { type ZodTypeAny } from "zod";

import type { ControlApiStore } from "./control-api-store.js";
import { InMemoryControlApiStore } from "./store.js";
import {
  approvalDecisionSchema,
  createAgentSchema,
  createMessageSchema,
  createSessionSchema,
} from "./validation.js";
import type { SessionStatus } from "./types.js";

export interface AppOptions {
  authToken?: string;
  store?: ControlApiStore;
}

const sessionStatuses: SessionStatus[] = [
  "idle",
  "running",
  "waiting_approval",
  "failed",
  "archived",
];

export const createControlApiApp = (options: AppOptions = {}): express.Express => {
  const app = express();
  const authToken = options.authToken ?? process.env.MISSION_CONTROL_API_TOKEN ?? "dev-token";
  const store = options.store ?? new InMemoryControlApiStore();

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json({ service: "control-api", status: "ok" });
  });

  app.use((req, res, next) => {
    const header = req.header("authorization");
    if (!header || !header.startsWith("Bearer ")) {
      res.status(401).json({ code: "unauthorized", message: "Missing bearer token" });
      return;
    }

    const token = header.slice("Bearer ".length);
    if (token !== authToken) {
      res.status(401).json({ code: "unauthorized", message: "Invalid bearer token" });
      return;
    }

    next();
  });

  app.get("/v1/agents", async (_req, res) => {
    const items = await store.listAgents();
    res.status(200).json({ items });
  });

  app.post("/v1/agents", withZodValidation(createAgentSchema), async (req, res) => {
    const agent = await store.createAgent(req.body);
    res.status(201).json(agent);
  });

  app.get("/v1/agents/:agentId", async (req, res) => {
    const agentId = getPathParam(req, res, "agentId");
    if (!agentId) {
      return;
    }

    const agent = await store.getAgent(agentId);
    if (!agent) {
      res.status(404).json({ code: "not_found", message: "Agent not found" });
      return;
    }

    res.status(200).json(agent);
  });

  app.get("/v1/sessions", async (req, res) => {
    const rawStatus = typeof req.query.status === "string" ? req.query.status : undefined;
    if (rawStatus && !sessionStatuses.includes(rawStatus as SessionStatus)) {
      res.status(400).json({ code: "invalid_request", message: "Unsupported session status" });
      return;
    }

    const status = rawStatus as SessionStatus | undefined;
    res.status(200).json({ items: await store.listSessions(status) });
  });

  app.post("/v1/sessions", withZodValidation(createSessionSchema), async (req, res) => {
    const agent = await store.getAgent(req.body.agentId);
    if (!agent) {
      res.status(404).json({ code: "not_found", message: "Agent not found" });
      return;
    }

    const session = await store.createSession(req.body);
    res.status(201).json(session);
  });

  app.get("/v1/sessions/:sessionId", async (req, res) => {
    const sessionId = getPathParam(req, res, "sessionId");
    if (!sessionId) {
      return;
    }

    const session = await store.getSession(sessionId);
    if (!session) {
      res.status(404).json({ code: "not_found", message: "Session not found" });
      return;
    }

    res.status(200).json(session);
  });

  app.post(
    "/v1/sessions/:sessionId/messages",
    withZodValidation(createMessageSchema),
    async (req, res) => {
      const sessionId = getPathParam(req, res, "sessionId");
      if (!sessionId) {
        return;
      }

      const session = await store.getSession(sessionId);
      if (!session) {
        res.status(404).json({ code: "not_found", message: "Session not found" });
        return;
      }

      const { run, approval } = await store.enqueueMessage({
        sessionId,
        content: req.body.content,
        idempotencyKey: req.body.idempotencyKey,
      });

      res.status(202).json({
        runId: run.id,
        sessionId: run.sessionId,
        status: run.status,
        approvalId: approval.id,
      });
    }
  );

  app.get("/v1/sessions/:sessionId/transcript", async (req, res) => {
    const sessionId = getPathParam(req, res, "sessionId");
    if (!sessionId) {
      return;
    }

    const session = await store.getSession(sessionId);
    if (!session) {
      res.status(404).json({ code: "not_found", message: "Session not found" });
      return;
    }

    const fromSequence = req.query.fromSequence
      ? Number(req.query.fromSequence)
      : undefined;

    if (fromSequence !== undefined && (!Number.isInteger(fromSequence) || fromSequence < 1)) {
      res.status(400).json({
        code: "invalid_request",
        message: "fromSequence must be an integer >= 1",
      });
      return;
    }

    res.status(200).json(await store.getTranscript(sessionId, fromSequence));
  });

  app.get("/v1/runs/:runId", async (req, res) => {
    const runId = getPathParam(req, res, "runId");
    if (!runId) {
      return;
    }

    const run = await store.getRun(runId);
    if (!run) {
      res.status(404).json({ code: "not_found", message: "Run not found" });
      return;
    }

    res.status(200).json(run);
  });

  app.get("/v1/runs/:runId/events", async (req, res) => {
    const runId = getPathParam(req, res, "runId");
    if (!runId) {
      return;
    }

    const run = await store.getRun(runId);
    if (!run) {
      res.status(404).json({ code: "not_found", message: "Run not found" });
      return;
    }

    const fromSequence = req.query.fromSequence
      ? Number(req.query.fromSequence)
      : undefined;

    if (fromSequence !== undefined && (!Number.isInteger(fromSequence) || fromSequence < 1)) {
      res.status(400).json({
        code: "invalid_request",
        message: "fromSequence must be an integer >= 1",
      });
      return;
    }

    const events = await store.getRunEvents(run.id, (fromSequence ?? 1) - 1);
    const highestSequence = events.at(-1)?.sequence ?? (fromSequence ?? 1) - 1;

    res.status(200).json({
      runId: run.id,
      nextSequence: highestSequence + 1,
      events,
    });
  });

  app.get("/v1/runs/:runId/stream", async (req, res) => {
    const runId = getPathParam(req, res, "runId");
    if (!runId) {
      return;
    }

    const run = await store.getRun(runId);
    if (!run) {
      res.status(404).json({ code: "not_found", message: "Run not found" });
      return;
    }

    const lastSequence = req.query.lastSequence
      ? Number(req.query.lastSequence)
      : 0;

    if (!Number.isInteger(lastSequence) || lastSequence < 0) {
      res.status(400).json({
        code: "invalid_request",
        message: "lastSequence must be an integer >= 0",
      });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const writeEnvelope = (event: {
      event: { type: string };
      sequence: number;
    }) => {
      if (event.sequence <= lastSequence) {
        return;
      }

      res.write(`event: ${event.event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    for (const event of await store.getRunEvents(run.id, lastSequence)) {
      writeEnvelope(event);
    }

    const unsubscribe = store.subscribeToRunEvents(run.id, writeEnvelope);
    const heartbeatInterval = setInterval(() => {
      res.write(": keep-alive\n\n");
    }, 15_000);

    req.on("close", () => {
      clearInterval(heartbeatInterval);
      unsubscribe();
      res.end();
    });
  });

  app.post("/v1/runs/:runId/approve", withZodValidation(approvalDecisionSchema), async (req, res) => {
    const runId = getPathParam(req, res, "runId");
    if (!runId) {
      return;
    }

    try {
      const approval = await store.decideApproval({
        runId,
        approvalId: req.body.approvalId,
        actorId: req.body.actorId,
        reason: req.body.reason,
        state: "approved",
      });

      res.status(200).json({
        approvalId: approval.id,
        runId: approval.runId,
        state: approval.state,
        decidedAt: approval.decidedAt,
      });
    } catch (error) {
      handleStoreError(error, res);
    }
  });

  app.post("/v1/runs/:runId/reject", withZodValidation(approvalDecisionSchema), async (req, res) => {
    const runId = getPathParam(req, res, "runId");
    if (!runId) {
      return;
    }

    try {
      const approval = await store.decideApproval({
        runId,
        approvalId: req.body.approvalId,
        actorId: req.body.actorId,
        reason: req.body.reason,
        state: "rejected",
      });

      res.status(200).json({
        approvalId: approval.id,
        runId: approval.runId,
        state: approval.state,
        decidedAt: approval.decidedAt,
      });
    } catch (error) {
      handleStoreError(error, res);
    }
  });

  return app;
};

const withZodValidation = (schema: ZodTypeAny) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        code: "invalid_request",
        message: "Request body validation failed",
      });
      return;
    }

    req.body = parsed.data;
    next();
  };

const getPathParam = (req: Request, res: Response, name: string): string | undefined => {
  const value = req.params[name];
  if (!value) {
    res.status(400).json({ code: "invalid_request", message: `Missing path param: ${name}` });
    return undefined;
  }

  return value;
};

const handleStoreError = (error: unknown, res: Response): void => {
  if (error instanceof Error) {
    if (error.message.includes("not found")) {
      res.status(404).json({ code: "not_found", message: error.message });
      return;
    }

    if (error.message.includes("not pending")) {
      res.status(409).json({ code: "conflict", message: error.message });
      return;
    }
  }

  res.status(500).json({ code: "internal_error", message: "Unexpected error" });
};
