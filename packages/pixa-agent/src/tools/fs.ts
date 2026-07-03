import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Tool, ToolContext } from "./types";
import { resolveInWorkspace } from "./paths";

const MAX_LINES = 2000;

/** Current content the agent should see: pending staged content wins over disk. */
async function effectiveContent(relPath: string, ctx: ToolContext): Promise<string | null> {
  const staged = ctx.changeSet.get(relPath);
  if (staged && staged.status === "pending") return staged.newContent;
  const abs = resolveInWorkspace(ctx.workspaceRoot, relPath);
  return ctx.readWorkspaceFile(abs);
}

function numberLines(content: string, offset: number, limit: number): string {
  const lines = content.split("\n");
  const slice = lines.slice(offset, offset + limit);
  const numbered = slice.map((l, i) => `${offset + i + 1}\t${l}`).join("\n");
  const remaining = lines.length - (offset + slice.length);
  return remaining > 0 ? `${numbered}\n… (${remaining} more lines — use offset to read further)` : numbered;
}

const readFile: Tool = {
  schema: {
    name: "read_file",
    description:
      "Read a file from the workspace. Returns numbered lines. If the file has pending staged edits, you see the pending content.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Workspace-relative file path" },
        offset: { type: "number", description: "0-based line to start from (default 0)" },
        limit: { type: "number", description: `Max lines to return (default ${MAX_LINES})` },
      },
      required: ["path"],
    },
  },
  async execute(args: { path: string; offset?: number; limit?: number }, ctx) {
    const content = await effectiveContent(args.path, ctx);
    if (content === null) return `Error: file not found: ${args.path}`;
    return numberLines(content, Math.max(0, args.offset ?? 0), Math.min(args.limit ?? MAX_LINES, MAX_LINES));
  },
};

const editFile: Tool = {
  schema: {
    name: "edit_file",
    description:
      "Replace one exact occurrence of old_string with new_string in a file. The old_string must be unique in the file — include surrounding lines to disambiguate. The edit is STAGED for user review, not written to disk.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Workspace-relative file path" },
        old_string: { type: "string", description: "Exact text to replace (must match uniquely)" },
        new_string: { type: "string", description: "Replacement text" },
      },
      required: ["path", "old_string", "new_string"],
    },
  },
  async execute(args: { path: string; old_string: string; new_string: string }, ctx) {
    const abs = resolveInWorkspace(ctx.workspaceRoot, args.path);
    const original = await ctx.readWorkspaceFile(abs);
    if (original === null && !ctx.changeSet.get(args.path)) {
      return `Error: file not found: ${args.path} — use create_file for new files.`;
    }
    const result = ctx.changeSet.stageEdit(args.path, original ?? "", args.old_string, args.new_string);
    if (!result.ok) return `Error: ${result.error}`;
    return `Staged edit to ${args.path} (pending user review).`;
  },
};

const writeFile: Tool = {
  schema: {
    name: "write_file",
    description:
      "Replace the entire content of a file. Prefer edit_file for small changes. The write is STAGED for user review.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Workspace-relative file path" },
        content: { type: "string", description: "Full new file content" },
      },
      required: ["path", "content"],
    },
  },
  async execute(args: { path: string; content: string }, ctx) {
    const abs = resolveInWorkspace(ctx.workspaceRoot, args.path);
    const original = await ctx.readWorkspaceFile(abs);
    ctx.changeSet.stageWrite(args.path, original, args.content);
    return `Staged full write of ${args.path} (pending user review).`;
  },
};

const createFile: Tool = {
  schema: {
    name: "create_file",
    description: "Create a new file with the given content. STAGED for user review.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Workspace-relative path for the new file" },
        content: { type: "string", description: "Initial content (default empty)" },
      },
      required: ["path"],
    },
  },
  async execute(args: { path: string; content?: string }, ctx) {
    const abs = resolveInWorkspace(ctx.workspaceRoot, args.path);
    const existing = await ctx.readWorkspaceFile(abs);
    if (existing !== null) {
      return `Error: ${args.path} already exists — use edit_file or write_file.`;
    }
    ctx.changeSet.stageWrite(args.path, null, args.content ?? "");
    return `Staged new file ${args.path} (pending user review).`;
  },
};

const listDirectory: Tool = {
  schema: {
    name: "list_directory",
    description: "List entries of a workspace directory.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Workspace-relative directory (default '.')" },
      },
    },
  },
  async execute(args: { path?: string }, ctx) {
    const abs = resolveInWorkspace(ctx.workspaceRoot, args.path ?? ".");
    let entries;
    try {
      entries = await fs.readdir(abs, { withFileTypes: true });
    } catch {
      return `Error: not a readable directory: ${args.path ?? "."}`;
    }
    if (entries.length === 0) return "(empty directory)";
    return entries
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
      .map((e) => (e.isDirectory() ? `${e.name}${path.sep}` : e.name))
      .join("\n");
  },
};

export const fsTools: Tool[] = [readFile, editFile, writeFile, createFile, listDirectory];
