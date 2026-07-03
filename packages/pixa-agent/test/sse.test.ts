import { describe, it, expect } from "vitest";
import { parseSseChunk, accumulateToolCallDelta, extractUsage, type ToolCallAccumulator } from "../src/providers/openrouter";

describe("parseSseChunk", () => {
  it("splits complete events and keeps partial tail", () => {
    const buffer = 'data: {"a":1}\n\ndata: {"b":2}\n\ndata: {"c"';
    const { events, rest } = parseSseChunk(buffer);
    expect(events).toEqual(['{"a":1}', '{"b":2}']);
    expect(rest).toBe('data: {"c"');
  });

  it("handles [DONE] and comment lines", () => {
    const buffer = ": OPENROUTER PROCESSING\n\ndata: {\"x\":1}\n\ndata: [DONE]\n\n";
    const { events, rest } = parseSseChunk(buffer);
    expect(events).toEqual(['{"x":1}', "[DONE]"]);
    expect(rest).toBe("");
  });

  it("handles CRLF separators", () => {
    const buffer = 'data: {"a":1}\r\n\r\ndata: {"b":2}\r\n\r\n';
    const { events } = parseSseChunk(buffer);
    expect(events).toEqual(['{"a":1}', '{"b":2}']);
  });
});

describe("accumulateToolCallDelta", () => {
  it("merges streamed tool call fragments by index", () => {
    const acc: ToolCallAccumulator = {};
    accumulateToolCallDelta(acc, [{ index: 0, id: "call_1", function: { name: "read_file", arguments: '{"pa' } }]);
    accumulateToolCallDelta(acc, [{ index: 0, function: { arguments: 'th":"a.ts"}' } }]);
    accumulateToolCallDelta(acc, [{ index: 1, id: "call_2", function: { name: "list_directory", arguments: "{}" } }]);
    const calls = Object.keys(acc)
      .map(Number)
      .sort((a, b) => a - b)
      .map((i) => acc[i]);
    expect(calls).toEqual([
      { id: "call_1", name: "read_file", arguments: '{"path":"a.ts"}' },
      { id: "call_2", name: "list_directory", arguments: "{}" },
    ]);
  });
});

describe("extractUsage", () => {
  it("returns null when no usage field is present", () => {
    expect(extractUsage({ choices: [{}] })).toBeNull();
  });

  it("parses prompt/completion/total tokens and real cost", () => {
    const parsed = { usage: { prompt_tokens: 120, completion_tokens: 340, total_tokens: 460, cost: 0.000821 } };
    expect(extractUsage(parsed)).toEqual({
      promptTokens: 120,
      completionTokens: 340,
      totalTokens: 460,
      costUsd: 0.000821,
    });
  });

  it("reports costUsd as null (not 0) when the provider omits cost", () => {
    const parsed = { usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } };
    expect(extractUsage(parsed)?.costUsd).toBeNull();
  });
});
