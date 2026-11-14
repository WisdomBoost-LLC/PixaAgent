import { describe, it, expect, vi } from "vitest";
import { CatalogService, type CatalogSource, type CatalogStore } from "../src/providers/catalogService";

const store = (): CatalogStore & { data: Map<string, unknown> } => {
  const data = new Map<string, unknown>();
  return { data, get: <T>(k: string) => data.get(k) as T | undefined, update: (k, v) => void data.set(k, v) };
};

const OR: CatalogSource = { id: "openrouter", name: "OpenRouter", kind: "third-party", baseUrl: "https://openrouter.ai/api/v1", parser: "openrouter", requiresApiKey: false };
const OLLAMA: CatalogSource = { id: "ollama", name: "Ollama", kind: "local", baseUrl: "http://localhost:11434/v1", parser: "openai", requiresApiKey: false };

const okJson = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const orBody = { data: [{ id: "a/free:free", name: "A", pricing: { prompt: "0", completion: "0" }, supported_parameters: ["tools"] }] };

const make = (fetchFn: typeof fetch, s = store(), now = () => 1_000_000, key = async () => undefined as string | undefined) =>
  ({ svc: new CatalogService(s, fetchFn, now, key), s });

describe("CatalogService.load", () => {
  it("fetches live, parses, and caches", async () => {
    const f = vi.fn(async () => okJson(orBody));
    const { svc, s } = make(f as unknown as typeof fetch);
    const r = await svc.load(OR);
    expect(r.models.map((m) => m.slug)).toEqual(["a/free:free"]);
    expect(r).toMatchObject({ stale: false });
    expect(f).toHaveBeenCalledWith("https://openrouter.ai/api/v1/models", expect.anything());
    expect(s.data.has("pixa.catalog.openrouter")).toBe(true);
  });

  it("serves a fresh cache without hitting the network", async () => {
    const f = vi.fn(async () => okJson(orBody));
    const { svc } = make(f as unknown as typeof fetch);
    await svc.load(OR);
    await svc.load(OR);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("force=true bypasses a fresh cache", async () => {
    const f = vi.fn(async () => okJson(orBody));
    const { svc } = make(f as unknown as typeof fetch);
    await svc.load(OR);
    await svc.load(OR, true);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("falls back to a stale cache when the network fails, flagging it", async () => {
    let t = 1_000_000;
    const s = store();
    const good = make(vi.fn(async () => okJson(orBody)) as unknown as typeof fetch, s, () => t);
    await good.svc.load(OR);
    t += 48 * 3600_000; // past TTL
    const bad = make(vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch, s, () => t);
    const r = await bad.svc.load(OR);
    expect(r.models).toHaveLength(1);
    expect(r.stale).toBe(true);
    expect(r.error).toMatch(/offline/);
  });

  it("returns an empty list with an error when there is no cache and the fetch fails", async () => {
    const { svc } = make(vi.fn(async () => ({ ok: false, status: 500 }) as Response) as unknown as typeof fetch);
    const r = await svc.load(OLLAMA);
    expect(r.models).toEqual([]);
    expect(r.error).toMatch(/500/);
  });

  it("does not cache an empty response", async () => {
    const { svc, s } = make(vi.fn(async () => okJson({ data: [] })) as unknown as typeof fetch);
    const r = await svc.load(OLLAMA);
    expect(r.models).toEqual([]);
    expect(s.data.has("pixa.catalog.ollama")).toBe(false);
  });

  it("sends the provider key only when the provider needs one", async () => {
    const f = vi.fn(async () => okJson({ data: [{ id: "m" }] }));
    const src: CatalogSource = { ...OLLAMA, id: "nim", kind: "third-party", baseUrl: "https://x.example/v1", requiresApiKey: true };
    const { svc } = make(f as unknown as typeof fetch, store(), () => 1, async () => "sk-secret");
    await svc.load(src);
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toEqual({ Authorization: "Bearer sk-secret" });

    const f2 = vi.fn(async () => okJson({ data: [{ id: "m" }] }));
    const { svc: svc2 } = make(f2 as unknown as typeof fetch, store(), () => 1, async () => "sk-secret");
    await svc2.load(OLLAMA);
    expect((f2.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toEqual({});
  });
});
