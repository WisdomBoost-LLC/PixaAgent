import type { Tool } from "./types";
import { runShell, formatShellResult } from "./terminal";

const gitStatus: Tool = {
  schema: {
    name: "git_status",
    description: "Show git status of the workspace (branch, staged/unstaged changes). Read-only.",
    parameters: { type: "object", properties: {} },
  },
  async execute(_args, ctx) {
    const r = await runShell("git status --branch --short", ctx.workspaceRoot);
    return r.code === 0 ? r.stdout || "(clean working tree)" : formatShellResult(r);
  },
};

const gitDiff: Tool = {
  schema: {
    name: "git_diff",
    description: "Show the current git diff (optionally for one file). Read-only.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Optional workspace-relative path to diff" },
      },
    },
  },
  async execute(args: { path?: string }, ctx) {
    const cmd = args.path ? `git diff -- "${args.path.replace(/"/g, '')}"` : "git diff";
    const r = await runShell(cmd, ctx.workspaceRoot);
    if (r.code !== 0) return formatShellResult(r);
    const out = r.stdout.trim();
    return out ? (out.length > 8000 ? out.slice(0, 8000) + "\n… (diff truncated)" : out) : "(no unstaged changes)";
  },
};

const gitCommit: Tool = {
  schema: {
    name: "git_commit",
    description:
      "Stage all changes and commit with the given message. THE USER MUST APPROVE the commit. Only use after your staged file changes were applied by the user.",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "Commit message" },
      },
      required: ["message"],
    },
  },
  async execute(args: { message: string }, ctx) {
    const approved = await ctx.approvals.requestApproval("commit", args.message);
    if (!approved) return "User declined the commit.";
    const msg = args.message.replace(/"/g, "'");
    const add = await runShell("git add -A", ctx.workspaceRoot);
    if (add.code !== 0) return formatShellResult(add);
    const commit = await runShell(`git commit -m "${msg}"`, ctx.workspaceRoot);
    return formatShellResult(commit);
  },
};

export const gitTools: Tool[] = [gitStatus, gitDiff, gitCommit];
