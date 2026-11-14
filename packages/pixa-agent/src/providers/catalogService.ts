import {
  CATALOG_TTL_MS,
  isCatalogFresh,
  parseOpenAICatalog,
  parseOpenRouterCatalog,
  type CatalogModel,
} from "./catalog";
import { modelsEndpointUrl } from "./providerForm";

/**
 * Fetches and caches each provider's live model list. No vscode import: the
 * host passes in a key-value store, a fetch function and a key lookup, so the
 * cache/fallback rules are unit-testable.
 */

export interface CatalogStore {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void> | void;
}

export interface CatalogSource {
  id: string;
  name: string;
  kind: "third-party" | "local";
  baseUrl: string;
  parser: "openrouter" | "openai";
  requiresApiKey: boolean;
}

export interface CatalogResult {
  models: CatalogModel[];
  /** True when the list came from an expired cache because the live fetch failed. */
  stale: boolean;
  error?: string;
  fetchedAt?: number;
}

interface CachedCatalog {
  fetchedAt: number;
  models: CatalogModel[];
}

const FETCH_TIMEOUT_MS = 8000;
const cacheKey = (id: string) => `pixa.catalog.${id}`;

export class CatalogService {
  constructor(
    private store: CatalogStore,
    private fetchFn: typeof fetch = fetch,
    private now: () => number = Date.now,
    private getApiKey: (providerId: string) => Promise<string | undefined> = async () => undefined
  ) {}

  /** Last successfully fetched list for a provider, however old. Used to resolve a picked model offline. */
  cached(providerId: string): CatalogModel[] {
    return this.store.get<CachedCatalog>(cacheKey(providerId))?.models ?? [];
  }

  async load(source: CatalogSource, force = false): Promise<CatalogResult> {
    const cached = this.store.get<CachedCatalog>(cacheKey(source.id));
    if (!force && cached && isCatalogFresh(cached.fetchedAt, this.now(), CATALOG_TTL_MS)) {
      return { models: cached.models, stale: false, fetchedAt: cached.fetchedAt };
    }

    try {
      const models = await this.fetchLive(source);
      if (models.length === 0) throw new Error("The provider returned no models.");
      const fetchedAt = this.now();
      await this.store.update(cacheKey(source.id), { fetchedAt, models } satisfies CachedCatalog);
      return { models, stale: false, fetchedAt };
    } catch (e) {
      const error = (e as Error)?.message || "Request failed.";
      if (cached) return { models: cached.models, stale: true, error, fetchedAt: cached.fetchedAt };
      return { models: [], stale: false, error };
    }
  }

  private async fetchLive(source: CatalogSource): Promise<CatalogModel[]> {
    const key = source.requiresApiKey ? await this.getApiKey(source.id) : undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await this.fetchFn(modelsEndpointUrl(source.baseUrl), {
        signal: controller.signal,
        headers: key ? { Authorization: `Bearer ${key}` } : {},
      });
      if (!res.ok) throw new Error(`Server responded with ${res.status}.`);
      const json = await res.json();
      return source.parser === "openrouter" ? parseOpenRouterCatalog(json) : parseOpenAICatalog(json);
    } finally {
      clearTimeout(timer);
    }
  }
}
