import type { ModelEntry } from "./types";
import { parseModelsResponse } from "./providerForm";

/**
 * Live model catalog: what a provider says it serves *right now*, so we never
 * maintain a hand-written model list that goes stale (free models in particular
 * are retired often). Pure module — no vscode, no network; the host fetches and
 * hands the JSON in.
 */

export type PriceTier = "free" | "paid" | "unknown";

export interface CatalogModel {
  /** The id the provider expects in a request (e.g. "z-ai/glm-5.2", "llama3.1:8b"). */
  slug: string;
  name: string;
  contextWindow: number;
  supportsTools: boolean;
  supportsReasoningEffort: boolean;
  /** "unknown" for providers that don't report pricing (most OpenAI-compatible ones). */
  tier: PriceTier;
}

export const DEFAULT_CATALOG_CONTEXT = 128_000;
export const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object";

function priceTier(pricing: unknown): PriceTier {
  if (!isObj(pricing)) return "unknown";
  const prompt = Number(pricing.prompt);
  const completion = Number(pricing.completion);
  if (!Number.isFinite(prompt) || !Number.isFinite(completion)) return "unknown";
  return prompt === 0 && completion === 0 ? "free" : "paid";
}

/** OpenRouter's /models carries pricing, context length and supported parameters. */
export function parseOpenRouterCatalog(json: unknown): CatalogModel[] {
  const data = isObj(json) && Array.isArray(json.data) ? json.data : [];
  const out: CatalogModel[] = [];
  for (const raw of data) {
    if (!isObj(raw) || typeof raw.id !== "string" || !raw.id.trim()) continue;
    const outputs = isObj(raw.architecture) && Array.isArray(raw.architecture.output_modalities)
      ? raw.architecture.output_modalities
      : ["text"];
    if (!outputs.includes("text")) continue;

    const params = Array.isArray(raw.supported_parameters) ? (raw.supported_parameters as unknown[]) : [];
    const ctx = typeof raw.context_length === "number" && raw.context_length > 0 ? raw.context_length : DEFAULT_CATALOG_CONTEXT;
    out.push({
      slug: raw.id.trim(),
      name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : raw.id.trim(),
      contextWindow: ctx,
      supportsTools: params.includes("tools"),
      supportsReasoningEffort: params.includes("reasoning") || params.includes("reasoning_effort"),
      tier: priceTier(raw.pricing),
    });
  }
  return out;
}

const EMBEDDING_ID = /embed/i;

/** Any OpenAI-compatible /models (Ollama, LM Studio, vLLM, NIM…): ids only, so pricing is unknown. */
export function parseOpenAICatalog(json: unknown): CatalogModel[] {
  return parseModelsResponse(json)
    .filter((id) => !EMBEDDING_ID.test(id))
    .map((id) => ({
      slug: id,
      name: id,
      contextWindow: DEFAULT_CATALOG_CONTEXT,
      supportsTools: true,
      supportsReasoningEffort: false,
      tier: "unknown" as const,
    }));
}

/** localhost / loopback / *.local base URLs are "Local"; everything else is "Third-party". */
export function isLocalBaseUrl(baseUrl: string): boolean {
  let host: string;
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1" || host.endsWith(".local");
}

export function isCatalogFresh(fetchedAt: number | undefined, now: number, ttlMs: number = CATALOG_TTL_MS): boolean {
  return typeof fetchedAt === "number" && now - fetchedAt < ttlMs;
}

/** Registry entry for a catalog pick. Ids are namespaced `provider:slug`, like user providers. */
export function catalogToEntry(providerId: string, m: CatalogModel): ModelEntry {
  return {
    id: `${providerId}:${m.slug}`,
    label: m.name,
    provider: providerId,
    slug: m.slug,
    contextWindow: m.contextWindow,
    supportsTools: m.supportsTools,
    // Only present when true: absent means "unknown", never a claimed false.
    ...(m.supportsReasoningEffort ? { supportsReasoningEffort: true } : {}),
  };
}

const TIER_ORDER: PriceTier[] = ["free", "paid", "unknown"];

export function groupByTier(models: CatalogModel[]): { tier: PriceTier; models: CatalogModel[] }[] {
  return TIER_ORDER.map((tier) => ({
    tier,
    models: models.filter((m) => m.tier === tier).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => g.models.length > 0);
}
