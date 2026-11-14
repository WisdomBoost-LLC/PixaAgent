import { describe, it, expect } from "vitest";
import {
  parseOpenRouterCatalog,
  parseOpenAICatalog,
  isLocalBaseUrl,
  isCatalogFresh,
  catalogToEntry,
  groupByTier,
} from "../src/providers/catalog";

const orModel = (over: Record<string, unknown>) => ({
  id: "vendor/model",
  name: "Vendor: Model",
  context_length: 64000,
  pricing: { prompt: "0.000001", completion: "0.000002" },
  supported_parameters: ["tools", "reasoning"],
  architecture: { output_modalities: ["text"] },
  ...over,
});

describe("parseOpenRouterCatalog", () => {
  it("tags zero-priced models free and priced ones paid", () => {
    const out = parseOpenRouterCatalog({
      data: [
        orModel({ id: "a/free:free", pricing: { prompt: "0", completion: "0" } }),
        orModel({ id: "a/paid" }),
      ],
    });
    expect(out.map((m) => [m.slug, m.tier])).toEqual([
      ["a/free:free", "free"],
      ["a/paid", "paid"],
    ]);
  });

  it("treats zero price as free even without a :free suffix", () => {
    const [m] = parseOpenRouterCatalog({ data: [orModel({ id: "a/odd", pricing: { prompt: "0", completion: "0" } })] });
    expect(m.tier).toBe("free");
  });

  it("derives capabilities from supported_parameters", () => {
    const [yes, no] = parseOpenRouterCatalog({
      data: [
        orModel({ id: "a/yes", supported_parameters: ["tools", "reasoning_effort"] }),
        orModel({ id: "a/no", supported_parameters: ["temperature"] }),
      ],
    });
    expect(yes.supportsTools).toBe(true);
    expect(yes.supportsReasoningEffort).toBe(true);
    expect(no.supportsTools).toBe(false);
    expect(no.supportsReasoningEffort).toBe(false);
  });

  it("skips models that don't output text and entries without an id", () => {
    const out = parseOpenRouterCatalog({
      data: [orModel({ id: "a/img", architecture: { output_modalities: ["image"] } }), { name: "no id" }, orModel({ id: "a/ok" })],
    });
    expect(out.map((m) => m.slug)).toEqual(["a/ok"]);
  });

  it("falls back to sane defaults and never throws on garbage", () => {
    expect(parseOpenRouterCatalog(null)).toEqual([]);
    expect(parseOpenRouterCatalog({ data: "nope" })).toEqual([]);
    const [m] = parseOpenRouterCatalog({ data: [{ id: "bare/model" }] });
    expect(m.name).toBe("bare/model");
    expect(m.contextWindow).toBeGreaterThan(0);
    expect(m.tier).toBe("unknown");
  });
});

describe("parseOpenAICatalog", () => {
  it("returns ids with unknown pricing and tools assumed on", () => {
    const out = parseOpenAICatalog({ data: [{ id: "llama3.1:8b" }, { id: "qwen2.5-coder:7b" }] });
    expect(out.map((m) => m.slug)).toEqual(["llama3.1:8b", "qwen2.5-coder:7b"]);
    expect(out.every((m) => m.tier === "unknown" && m.supportsTools)).toBe(true);
  });

  it("drops embedding-only model ids", () => {
    const out = parseOpenAICatalog({ data: [{ id: "nomic-embed-text" }, { id: "text-embedding-3-small" }, { id: "llama3.1:8b" }] });
    expect(out.map((m) => m.slug)).toEqual(["llama3.1:8b"]);
  });
});

describe("isLocalBaseUrl", () => {
  it.each([
    "http://localhost:11434/v1",
    "http://127.0.0.1:1234/v1",
    "http://[::1]:8000/v1",
    "http://my-box.local:8000/v1",
  ])("treats %s as local", (u) => expect(isLocalBaseUrl(u)).toBe(true));

  it.each(["https://openrouter.ai/api/v1", "https://integrate.api.nvidia.com/v1", "not a url"])(
    "treats %s as third-party",
    (u) => expect(isLocalBaseUrl(u)).toBe(false)
  );
});

describe("isCatalogFresh", () => {
  it("is fresh inside the TTL and stale after, or when missing", () => {
    expect(isCatalogFresh(1000, 1000 + 60_000, 24 * 3600_000)).toBe(true);
    expect(isCatalogFresh(1000, 1000 + 25 * 3600_000, 24 * 3600_000)).toBe(false);
    expect(isCatalogFresh(undefined, 5, 100)).toBe(false);
  });
});

describe("catalogToEntry / groupByTier", () => {
  it("namespaces the id and carries capability flags", () => {
    const [m] = parseOpenRouterCatalog({ data: [orModel({ id: "z/glm", supported_parameters: ["tools", "reasoning"] })] });
    const e = catalogToEntry("openrouter", m);
    expect(e).toMatchObject({
      id: "openrouter:z/glm",
      provider: "openrouter",
      slug: "z/glm",
      supportsTools: true,
      supportsReasoningEffort: true,
    });
  });

  it("omits the reasoning flag entirely when unsupported", () => {
    const [m] = parseOpenAICatalog({ data: [{ id: "llama3.1:8b" }] });
    expect("supportsReasoningEffort" in catalogToEntry("ollama", m)).toBe(false);
  });

  it("groups free before paid before unknown, each sorted by name", () => {
    const models = parseOpenRouterCatalog({
      data: [
        orModel({ id: "b/paid", name: "B" }),
        orModel({ id: "a/free", name: "Zed", pricing: { prompt: "0", completion: "0" } }),
        orModel({ id: "c/free", name: "Alpha", pricing: { prompt: "0", completion: "0" } }),
        orModel({ id: "d/unk", name: "D", pricing: undefined }),
      ],
    });
    const g = groupByTier(models);
    expect(g.map((x) => x.tier)).toEqual(["free", "paid", "unknown"]);
    expect(g[0].models.map((m) => m.name)).toEqual(["Alpha", "Zed"]);
  });
});
