import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ensureGitExcluded } from "../src/indexer/vectorStore";

describe("ensureGitExcluded hygiene", () => {
  let tempDir: string;
  let excludePath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pixa-hygiene-"));
    fs.mkdirSync(path.join(tempDir, ".git"));
    excludePath = path.join(tempDir, ".git", "info", "exclude");
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // non-fatal
    }
  });

  it("creates .git/info/exclude with .pixa/\\n when missing, and never touches .gitignore", () => {
    expect(ensureGitExcluded(tempDir)).toBe(true);
    expect(fs.readFileSync(excludePath, "utf8")).toBe(".pixa/\n");
    expect(fs.existsSync(path.join(tempDir, ".gitignore"))).toBe(false);
  });

  it("appends with correct newline handling when the file lacks a trailing newline", () => {
    fs.mkdirSync(path.dirname(excludePath));
    fs.writeFileSync(excludePath, "# local excludes");
    expect(ensureGitExcluded(tempDir)).toBe(true);
    expect(fs.readFileSync(excludePath, "utf8")).toBe("# local excludes\n.pixa/\n");
  });

  it("is a no-op when .pixa/ or .pixa is already present", () => {
    fs.mkdirSync(path.dirname(excludePath));
    fs.writeFileSync(excludePath, "node_modules/\n.pixa\n");
    expect(ensureGitExcluded(tempDir)).toBe(false);
    expect(fs.readFileSync(excludePath, "utf8")).toBe("node_modules/\n.pixa\n");
  });

  it("does nothing outside a git repo", () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), "pixa-nogit-"));
    try {
      expect(ensureGitExcluded(plain)).toBe(false);
      expect(fs.readdirSync(plain)).toEqual([]);
    } finally {
      fs.rmSync(plain, { recursive: true, force: true });
    }
  });

  it("does nothing when .git is a file (worktree/submodule)", () => {
    const wt = fs.mkdtempSync(path.join(os.tmpdir(), "pixa-wt-"));
    try {
      fs.writeFileSync(path.join(wt, ".git"), "gitdir: /elsewhere\n");
      expect(ensureGitExcluded(wt)).toBe(false);
      expect(fs.readdirSync(wt)).toEqual([".git"]);
    } finally {
      fs.rmSync(wt, { recursive: true, force: true });
    }
  });
});
