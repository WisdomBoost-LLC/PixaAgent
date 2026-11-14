import { describe, it, expect } from "vitest";
import { rememberPicked } from "../src/providers/pickedModels";
import type { ModelEntry } from "../src/providers/types";

const e = (id: string): ModelEntry => ({ id, label: id, provider: "p", slug: id, contextWindow: 1, supportsTools: true });

describe("rememberPicked", () => {
  it("puts the newest first and dedupes by id", () => {
    const out = rememberPicked([e("a"), e("b")], e("b"));
    expect(out.map((m) => m.id)).toEqual(["b", "a"]);
  });
  it("caps the list, dropping the oldest", () => {
    const out = rememberPicked([e("a"), e("b"), e("c")], e("d"), 3);
    expect(out.map((m) => m.id)).toEqual(["d", "a", "b"]);
  });
});
