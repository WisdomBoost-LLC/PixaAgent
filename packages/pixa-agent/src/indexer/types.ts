/** Repository index abstraction. Backends are swappable (workspace scan now, embeddings later). */
export interface RepoIndex {
  /** Compact directory tree of the workspace, capped to ~8000 chars. */
  getProjectMap(): Promise<string>;
  /** Symbol outline (classes/functions/methods with lines) for one file. */
  getFileOutline(path: string): Promise<string>;
  /** Invalidate caches; next call rescans. */
  refresh(): void;
}
