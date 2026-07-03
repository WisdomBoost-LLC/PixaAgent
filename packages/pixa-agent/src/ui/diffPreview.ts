import * as vscode from "vscode";
import type { ChangeSet } from "../edits/changeSet";

const ORIG_SCHEME = "pixa-orig";
const NEW_SCHEME = "pixa-new";

/**
 * Serves the original and pending content of staged changes as virtual
 * documents so we can show VS Code's native side-by-side diff.
 */
export class DiffPreview {
  private emitter = new vscode.EventEmitter<vscode.Uri>();

  constructor(private changeSet: ChangeSet) {}

  register(context: vscode.ExtensionContext): void {
    const provider: vscode.TextDocumentContentProvider = {
      onDidChange: this.emitter.event,
      provideTextDocumentContent: (uri: vscode.Uri): string => {
        const change = this.changeSet.get(uri.path.replace(/^\//, ""));
        if (!change) return "";
        return uri.scheme === ORIG_SCHEME ? change.originalContent ?? "" : change.newContent;
      },
    };
    context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(ORIG_SCHEME, provider),
      vscode.workspace.registerTextDocumentContentProvider(NEW_SCHEME, provider)
    );
  }

  /** Refresh open diff editors after the change set mutates. */
  invalidate(relPath: string): void {
    this.emitter.fire(vscode.Uri.from({ scheme: ORIG_SCHEME, path: "/" + relPath }));
    this.emitter.fire(vscode.Uri.from({ scheme: NEW_SCHEME, path: "/" + relPath }));
  }

  async open(relPath: string): Promise<void> {
    const change = this.changeSet.get(relPath);
    if (!change) return;
    const left = vscode.Uri.from({ scheme: ORIG_SCHEME, path: "/" + relPath });
    const right = vscode.Uri.from({ scheme: NEW_SCHEME, path: "/" + relPath });
    const title = `Pixa: ${relPath} (${change.originalContent === null ? "new file" : "modified"})`;
    await vscode.commands.executeCommand("vscode.diff", left, right, title, { preview: true });
  }
}
