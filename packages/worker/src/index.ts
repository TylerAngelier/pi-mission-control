export interface WorkerHealth {
  service: "worker";
  status: "ok";
}

export const health = (): WorkerHealth => ({
  service: "worker",
  status: "ok",
});

export {
  InMemoryApprovalController,
  PostgresApprovalController,
  createApprovalControllerFromEnv,
} from "./approval.js";
export { WorkerExecutionEngine, normalizeRuntimeEvent } from "./engine.js";
export { CodingAgentSdkRpcRuntime } from "./runtime.js";
export { LocalWorkspaceManager } from "./workspace.js";
export type {
  ApprovalController,
  ApprovalDecision,
  ApprovalRequest,
  MutableApprovalController,
  PostgresApprovalControllerOptions,
} from "./approval.js";
export type {
  CodingAgentRpcClient,
  WorkerRuntime,
} from "./runtime.js";
export type {
  RunStreamEventEnvelope,
  WorkerRunRequest,
  WorkerRuntimeEvent,
} from "./types.js";
export type {
  WorkerWorkspace,
  WorkspaceManager,
} from "./workspace.js";
