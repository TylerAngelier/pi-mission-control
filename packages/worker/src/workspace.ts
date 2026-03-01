import { randomUUID } from "node:crypto";
import { mkdir, rm, symlink } from "node:fs/promises";
import { join } from "node:path";

export interface WorkerWorkspace {
  id: string;
  sessionId: string;
  rootPath: string;
  mountPath: string;
  mountedSourcePath: string | null;
  createdAt: string;
}

export interface WorkspaceManager {
  createWorkspace(sessionId: string): Promise<WorkerWorkspace>;
  mountWorkspace(workspaceId: string, sourcePath: string): Promise<WorkerWorkspace>;
  cleanupWorkspace(workspaceId: string): Promise<void>;
}

export interface LocalWorkspaceManagerOptions {
  baseDirectory: string;
  now?: () => Date;
  createId?: () => string;
}

export class LocalWorkspaceManager implements WorkspaceManager {
  private readonly workspaces = new Map<string, WorkerWorkspace>();
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(private readonly options: LocalWorkspaceManagerOptions) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? (() => `ws_${randomUUID()}`);
  }

  async createWorkspace(sessionId: string): Promise<WorkerWorkspace> {
    const id = this.createId();
    const rootPath = join(this.options.baseDirectory, `${sessionId}-${id}`);
    const mountPath = join(rootPath, "repo");

    await mkdir(rootPath, { recursive: true });

    const workspace: WorkerWorkspace = {
      id,
      sessionId,
      rootPath,
      mountPath,
      mountedSourcePath: null,
      createdAt: this.now().toISOString(),
    };

    this.workspaces.set(id, workspace);
    return workspace;
  }

  async mountWorkspace(workspaceId: string, sourcePath: string): Promise<WorkerWorkspace> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error("Workspace not found");
    }

    if (workspace.mountedSourcePath) {
      throw new Error("Workspace is already mounted");
    }

    await symlink(sourcePath, workspace.mountPath, "dir");

    const updated: WorkerWorkspace = {
      ...workspace,
      mountedSourcePath: sourcePath,
    };

    this.workspaces.set(updated.id, updated);
    return updated;
  }

  async cleanupWorkspace(workspaceId: string): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error("Workspace not found");
    }

    await rm(workspace.rootPath, { recursive: true, force: true });
    this.workspaces.delete(workspaceId);
  }
}
