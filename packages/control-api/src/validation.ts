import { z } from "zod";

export const createAgentSchema = z.object({
  name: z.string().min(1),
  model: z.string().min(1),
  defaultTools: z.array(z.string().min(1)).optional(),
  policyId: z.string().min(1).optional(),
});

export const createSessionSchema = z.object({
  agentId: z.string().min(1),
  workspaceId: z.string().min(1),
  title: z.string().min(1).optional(),
  seedPrompt: z.string().min(1).optional(),
});

export const createMessageSchema = z.object({
  content: z.string().min(1),
  idempotencyKey: z.string().min(1).optional(),
});

export const approvalDecisionSchema = z.object({
  approvalId: z.string().min(1),
  actorId: z.string().min(1),
  reason: z.string().min(1).optional(),
});
