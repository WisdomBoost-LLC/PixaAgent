/** Parsing and formatting for @-file mentions in chat messages. Pure module. */

const MENTION_RE = /@([A-Za-z0-9_\-./\\]+\.[A-Za-z0-9]+|[A-Za-z0-9_\-./\\]*\/[A-Za-z0-9_\-./\\]+)/g;

export const MAX_ATTACHED_FILES = 5;
export const MAX_CHARS_PER_FILE = 20_000;

/** Extract candidate file paths from @-mentions. Deduplicated, order preserved. */
export function parseMentions(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of text.matchAll(MENTION_RE)) {
    const raw = match[1].replace(/[.,;:]+$/, ""); // strip trailing punctuation
    if (!seen.has(raw)) {
      seen.add(raw);
      out.push(raw);
    }
  }
  return out.slice(0, MAX_ATTACHED_FILES);
}

export interface AttachedFile {
  path: string;
  content: string;
}

/** Render attached files as a block appended to the user message. */
export function formatAttachedFiles(files: AttachedFile[], unresolved: string[]): string {
  if (files.length === 0 && unresolved.length === 0) return "";
  const parts: string[] = ["\n\n<attached-files>"];
  for (const f of files) {
    const content =
      f.content.length > MAX_CHARS_PER_FILE
        ? f.content.slice(0, MAX_CHARS_PER_FILE) + "\n… (truncated — use read_file for the rest)"
        : f.content;
    parts.push(`<file path="${f.path}">\n${content}\n</file>`);
  }
  for (const miss of unresolved) {
    parts.push(`<file path="${miss}" error="not found in workspace" />`);
  }
  parts.push("</attached-files>");
  return parts.join("\n");
}
