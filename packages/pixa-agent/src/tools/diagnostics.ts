import * as path from "node:path";
import type { Tool } from "./types";
import { resolveInWorkspace } from "./paths";

const MAX_ENTRIES = 100;

/**
 * Read VS Code's live compiler/linter diagnostics so the agent can verify its
 * own applied edits and self-correct — mirroring Copilot's error-aware loop.
 * Lazy-requires vscode (same pattern as search.ts) to stay unit-test friendly.
 */
const getDiagnostics: Tool = {
  schema: {
    name: "get_diagnostics",
    description:
      "Get current compiler/linter errors and warnings from the editor. Use after your edits were applied to verify they compile; fix any errors you introduced.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Optional workspace-relative file to filter to; omit for the whole workspace" },
      },
    },
  },
  async execute(args: { path?: string }, ctx) {
    let vscode: typeof import("vscode");
    try {
      vscode = require("vscode");
    } catch {
      return "Error: diagnostics are only available inside the editor.";
    }

    const severityName = ["Error", "Warning", "Info", "Hint"];
    let entries: { uri: import("vscode").Uri; diags: readonly import("vscode").Diagnostic[] }[];

    if (args.path) {
      const abs = resolveInWorkspace(ctx.workspaceRoot, args.path);
      const uri = vscode.Uri.file(abs);
      entries = [{ uri, diags: vscode.languages.getDiagnostics(uri) }];
    } else {
      entries = vscode.languages.getDiagnostics().map(([uri, diags]) => ({ uri, diags }));
    }

    const lines: string[] = [];
    for (const { uri, diags } of entries) {
      if (uri.scheme !== "file") continue;
      const rel = path.relative(ctx.workspaceRoot, uri.fsPath).split(path.sep).join("/");
      if (rel.startsWith("..")) continue; // outside workspace
      for (const d of diags) {
        if (d.severity > vscode.DiagnosticSeverity.Warning) continue; // errors + warnings only
        lines.push(`${severityName[d.severity]} ${rel}:${d.range.start.line + 1} — ${d.message.replace(/\s+/g, " ").trim()}`);
        if (lines.length >= MAX_ENTRIES) break;
      }
      if (lines.length >= MAX_ENTRIES) break;
    }

    if (lines.length === 0) {
      return args.path ? `No errors or warnings in ${args.path}.` : "No errors or warnings in the workspace.";
    }
    const header = `${lines.length}${lines.length >= MAX_ENTRIES ? "+" : ""} diagnostic(s):`;
    return [header, ...lines].join("\n");
  },
};

export const diagnosticsTools: Tool[] = [getDiagnostics];
