import type { ToolSchema } from "../providers/types";
import type { ChangeSet } from "../edits/changeSet";
import type { RepoIndex } from "../indexer/types";
import type { AgentEvent } from "../agent/events";

/** Bridge to the UI: resolves when the user clicks Run/Commit or Skip. */
export interface ApprovalService {
  requestApproval(kind: "command" | "commit", detail: string): Promise<boolean>;
}

export interface ToolContext {
  workspaceRoot: string;
  changeSet: ChangeSet;
  index: RepoIndex;
  approvals: ApprovalService;
  /** Read a file from disk; null if it doesn't exist. Host injects the fs implementation. */
  readWorkspaceFile(absPath: string): Promise<string | null>;
  emit(event: AgentEvent): void;
}

export interface Tool {
  schema: ToolSchema;
  /** Returns the string handed back to the model. Errors should be returned, not thrown, where possible. */
  execute(args: any, ctx: ToolContext): Promise<string>;
}
