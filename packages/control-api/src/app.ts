import express, { type NextFunction, type Request, type Response } from "express";
import { type ZodTypeAny } from "zod";

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
  store?: InMemoryControlApiStore;
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

  app.get("/v1/agents", (_req, res) => {
    res.status(200).json({ items: store.listAgents() });
  });

  app.post("/v1/agents", withZodValidation(createAgentSchema), (req, res) => {
    const agent = store.createAgent(req.body);
    res.status(201).json(agent);
  });

  app.get("/v1/agents/:agentId", (req, res) => {
    const agentId = getPathParam(req, res, "agentId");
    if (!agentId) {
      return;
    }

    const agent = store.getAgent(agentId);
    if (!agent) {
      res.status(404).json({ code: "not_found", message: "Agent not found" });
      return;
    }

    res.status(200).json(agent);
  });

  app.get("/v1/sessions", (req, res) => {
    const rawStatus = typeof req.query.status === "string" ? req.query.status : undefined;
    if (rawStatus && !sessionStatuses.includes(rawStatus as SessionStatus)) {
      res.status(400).json({ code: "invalid_request", message: "Unsupported session status" });
      return;
    }

    const status = rawStatus as SessionStatus | undefined;
    res.status(200).json({ items: store.listSessions(status) });
  });

  app.post("/v1/sessions", withZodValidation(createSessionSchema), (req, res) => {
    const agent = store.getAgent(req.body.agentId);
    if (!agent) {
      res.status(404).json({ code: "not_found", message: "Agent not found" });
      return;
    }

    const session = store.createSession(req.body);
    res.status(201).json(session);
  });

  app.get("/v1/sessions/:sessionId", (req, res) => {
    const sessionId = getPathParam(req, res, "sessionId");
    if (!sessionId) {
      return;
    }

    const session = store.getSession(sessionId);
    if (!session) {
      res.status(404).json({ code: "not_found", message: "Session not found" });
      return;
    }

    res.status(200).json(session);
  });

  app.post(
    "/v1/sessions/:sessionId/messages",
    withZodValidation(createMessageSchema),
    (req, res) => {
      const sessionId = getPathParam(req, res, "sessionId");
      if (!sessionId) {
        return;
      }

      const session = store.getSession(sessionId);
      if (!session) {
        res.status(404).json({ code: "not_found", message: "Session not found" });
        return;
      }

      const { run, approval } = store.enqueueMessage({
        sessionId,
        content: req.body.content,
      });

      res.status(202).json({
        runId: run.id,
        sessionId: run.sessionId,
        status: run.status,
        approvalId: approval.id,
      });
    }
  );

  app.get("/v1/sessions/:sessionId/transcript", (req, res) => {
    const sessionId = getPathParam(req, res, "sessionId");
    if (!sessionId) {
      return;
    }

    const session = store.getSession(sessionId);
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

    res.status(200).json(store.getTranscript(sessionId, fromSequence));
  });

  app.get("/v1/runs/:runId", (req, res) => {
    const runId = getPathParam(req, res, "runId");
    if (!runId) {
      return;
    }

    const run = store.getRun(runId);
    if (!run) {
      res.status(404).json({ code: "not_found", message: "Run not found" });
      return;
    }

    res.status(200).json(run);
  });

  app.post("/v1/runs/:runId/approve", withZodValidation(approvalDecisionSchema), (req, res) => {
    const runId = getPathParam(req, res, "runId");
    if (!runId) {
      return;
    }

    try {
      const approval = store.decideApproval({
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

  app.post("/v1/runs/:runId/reject", withZodValidation(approvalDecisionSchema), (req, res) => {
    const runId = getPathParam(req, res, "runId");
    if (!runId) {
      return;
    }

    try {
      const approval = store.decideApproval({
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
