import { describe, it, expect } from "vitest";
import { parsePlan } from "../src/agent/planning";
import { AgentLoop } from "../src/agent/loop";
import { ProviderRegistry } from "../src/providers/registry";
import type { ChatResult, ModelEntry, ModelProvider } from "../src/providers/types";
import { ToolRegistry } from "../src/tools/registry";
import type { AgentEvent } from "../src/agent/events";
import type { ToolContext } from "../src/tools/types";
import type { RepoIndex } from "../src/indexer/types";
import { ChangeSet } from "../src/edits/changeSet";

const model: ModelEntry = {
  id: "m",
  label: "M",
  provider: "scripted",
  slug: "scripted/model",
  contextWindow: 100000,
  supportsTools: true,
};
const index: RepoIndex = { getProjectMap: async () => "", getFileOutline: async () => "", refresh: () => {} };
function ctx(events: AgentEvent[]): ToolContext {
  return {
    workspaceRoot: "/tmp",
    changeSet: new ChangeSet(),
    index,
    approvals: { requestApproval: async () => true },
    readWorkspaceFile: async () => null,
    emit: (e) => events.push(e),
  };
}

describe("parsePlan", () => {
  it("extracts numbered steps from a plain numbered list", () => {
    const text = "1. Read server.js\n2. Add the /health route\n3. Write a test";
    const plan = parsePlan(text);
    expect(plan.steps).toEqual([
      { index: 1, text: "Read server.js" },
      { index: 2, text: "Add the /health route" },
      { index: 3, text: "Write a test" },
    ]);
  });

  it("ignores surrounding prose and accepts '1)' style, trimming whitespace", () => {
    const text = "Here's my plan:\n\n1)   Inspect the router   \n2) Add the handler\n\nLet me start.";
    const plan = parsePlan(text);
    expect(plan.steps).toEqual([
      { index: 1, text: "Inspect the router" },
      { index: 2, text: "Add the handler" },
    ]);
  });

  it("returns no steps when the model wrote no numbered plan", () => {
    expect(parsePlan("I'll just do it directly, no plan needed.").steps).toEqual([]);
    expect(parsePlan("").steps).toEqual([]);
  });
});

describe("AgentLoop planning pre-pass", () => {
  it("emits a plan event parsed from the model's first turn, before tools run", async () => {
    let call = 0;
    const provider: ModelProvider = {
      id: "scripted",
      async chat(): Promise<ChatResult> {
        call++;
        if (call === 1) {
          // First turn: the model states a plan, then calls a tool.
          return {
            content: "Here's my plan:\n1. Inspect the router\n2. Add the handler",
            toolCalls: [{ id: "c1", name: "noop", arguments: "{}" }],
            finishReason: "tool_calls",
          };
        }
        return { content: "Done.", toolCalls: [], finishReason: "stop" };
      },
    };
    const registry = new ProviderRegistry();
    registry.register(provider);
    const tools = new ToolRegistry();
    tools.register({
      schema: { name: "noop", description: "no-op", parameters: { type: "object", properties: {} } },
      execute: async () => "ok",
    });
    const events: AgentEvent[] = [];
    const loop = new AgentLoop({
      registry,
      tools,
      models: [model],
      ctx: ctx(events),
      workspaceInfo: async () => ({ workspaceName: "w", os: "os" }),
    });

    await loop.run("add a route", "m", new AbortController().signal);

    const planEvent = events.find((e) => e.type === "plan") as Extract<AgentEvent, { type: "plan" }> | undefined;
    expect(planEvent).toBeDefined();
    expect(planEvent!.steps).toEqual([
      { index: 1, text: "Inspect the router" },
      { index: 2, text: "Add the handler" },
    ]);
    // The plan must be emitted before the first tool result, so the user sees intent up front.
    const planIdx = events.findIndex((e) => e.type === "plan");
    const toolEndIdx = events.findIndex((e) => e.type === "tool-end");
    expect(planIdx).toBeGreaterThanOrEqual(0);
    expect(planIdx).toBeLessThan(toolEndIdx);
  });

  it("emits no plan event when the model's first turn has no numbered plan", async () => {
    const provider: ModelProvider = {
      id: "scripted",
      async chat(): Promise<ChatResult> {
        return { content: "Done, nothing to plan.", toolCalls: [], finishReason: "stop" };
      },
    };
    const registry = new ProviderRegistry();
    registry.register(provider);
    const events: AgentEvent[] = [];
    const loop = new AgentLoop({
      registry,
      tools: new ToolRegistry(),
      models: [model],
      ctx: ctx(events),
      workspaceInfo: async () => ({ workspaceName: "w", os: "os" }),
    });

    await loop.run("hi", "m", new AbortController().signal);

    expect(events.some((e) => e.type === "plan")).toBe(false);
  });
});
