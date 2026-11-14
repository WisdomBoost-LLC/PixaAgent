import type { ModelEntry } from "./types";

/** globalState key holding models the user picked from a live provider list. */
export const PICKED_MODELS_KEY = "pixa.pickedModels";
export const LAST_MODEL_KEY = "pixa.lastModelId";
export const MAX_PICKED = 40;

/** Most-recent-first, deduped by id, capped so the store can't grow without bound. */
export function rememberPicked(list: ModelEntry[], entry: ModelEntry, cap: number = MAX_PICKED): ModelEntry[] {
  return [entry, ...list.filter((m) => m.id !== entry.id)].slice(0, cap);
}
