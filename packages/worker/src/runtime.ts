import type { WorkerRunRequest, WorkerRuntimeEvent } from "./types.js";

export interface CodingAgentRpcClient {
  streamRun(input: {
    agentId: string;
    prompt: string;
  }): AsyncIterable<WorkerRuntimeEvent>;
}

export interface WorkerRuntime {
  streamRun(input: WorkerRunRequest): AsyncIterable<WorkerRuntimeEvent>;
}

export class CodingAgentSdkRpcRuntime implements WorkerRuntime {
  constructor(private readonly client: CodingAgentRpcClient) {}

  streamRun(input: WorkerRunRequest): AsyncIterable<WorkerRuntimeEvent> {
    return this.client.streamRun({
      agentId: input.agentId,
      prompt: input.prompt,
    });
  }
}
