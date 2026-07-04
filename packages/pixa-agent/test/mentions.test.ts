import { describe, it, expect } from "vitest";
import { parseMentions, formatAttachedFiles } from "../src/agent/mentions";

describe("parseMentions", () => {
  it("extracts file-like mentions with extensions and paths", () => {
    expect(parseMentions("fix @src/server.js and check @routes/index.js please")).toEqual([
      "src/server.js",
      "routes/index.js",
    ]);
  });

  it("strips trailing punctuation and dedupes", () => {
    expect(parseMentions("look at @a.ts, then @a.ts again.")).toEqual(["a.ts"]);
  });

  it("ignores emails and bare @words", () => {
    expect(parseMentions("mail me at foo@bar and hi @everyone")).toEqual([]);
  });

  it("caps at 5 files", () => {
    const text = "@a.ts @b.ts @c.ts @d.ts @e.ts @f.ts";
    expect(parseMentions(text)).toHaveLength(5);
  });
});

describe("formatAttachedFiles", () => {
  it("returns empty string when nothing to attach", () => {
    expect(formatAttachedFiles([], [])).toBe("");
  });

  it("wraps content in file tags and reports unresolved", () => {
    const out = formatAttachedFiles([{ path: "a.ts", content: "const x = 1;" }], ["ghost.ts"]);
    expect(out).toContain('<file path="a.ts">');
    expect(out).toContain("const x = 1;");
    expect(out).toContain('path="ghost.ts" error="not found in workspace"');
  });

  it("truncates oversized content", () => {
    const out = formatAttachedFiles([{ path: "big.ts", content: "x".repeat(30_000) }], []);
    expect(out).toContain("truncated");
    expect(out.length).toBeLessThan(21_000);
  });
});
