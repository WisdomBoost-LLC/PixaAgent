# Pixa

An AI-first IDE. A Cursor-class coding agent — plan, read, search, multi-file
edit with diff review, approval-gated terminal and git — shipped as a VS Code
extension today and as the branded **Pixa IDE** (VS Code OSS distribution)
via the `ide/` pipeline.

```
┌─ Pixa IDE (VS Code OSS + branding, ide/) ─────────────────┐
│  ┌─ pixa-agent extension (packages/pixa-agent) ─────────┐ │
│  │  Chat webview ⇄ Extension host                       │ │
│  │    AgentLoop ── ContextManager (token budgeting)     │ │
│  │      │                                               │ │
│  │      ├─ ProviderRegistry ── models.json (data-driven)│ │
│  │      │    └─ OpenRouterProvider (streaming + tools)  │ │
│  │      ├─ ToolRegistry (plugin point)                  │ │
│  │      │    fs · search(ripgrep) · terminal · git      │ │
│  │      ├─ WorkspaceIndexer (RepoIndex interface)       │ │
│  │      └─ ChangeSet → native diff → Apply/Reject       │ │
│  └──────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
                     │ HTTPS (key in SecretStorage)
               OpenRouter → GLM / Qwen / DeepSeek / Claude / GPT / Gemini
```

> **This is the OpenRouter-only build (v0.3.8).** It uses a single provider —
> OpenRouter — for all models. No NVIDIA/other backends. This is the stable
> baseline for the team to work from.

## Getting started (team onboarding)

### Prerequisites
- **Node.js 20+** ([nodejs.org](https://nodejs.org)) — check with `node -v`
- **VS Code** ([code.visualstudio.com](https://code.visualstudio.com))
- **Git**
- An **OpenRouter account + API key** — free to create at
  [openrouter.ai/keys](https://openrouter.ai/keys). Each person uses their own
  key; usage and billing stay per-person. Free models exist; paid models
  (e.g. GLM 5.2) need a few dollars of credit.

### 1. Clone and build
```bash
git clone <this-repo-url>
cd pixa            # or the folder git created
npm install
npm run compile
```

### 2. Run it — two ways

**A) Dev mode (for working on the code):**
Open the repo folder in VS Code and press **F5** ("Run Pixa Agent"). A second
VS Code window (the Extension Development Host) launches with Pixa loaded. Any
code change → stop (Shift+F5) and press F5 again, or run `npm run watch`.

**B) Install it as a real extension (to just use it):**
```bash
npm run package -w pixa-agent          # produces packages/pixa-agent/pixa-agent-<version>.vsix
code --install-extension packages/pixa-agent/pixa-agent-0.3.8.vsix --force
```
Then restart VS Code — the Pixa icon appears in the activity bar permanently.

### 3. First use
1. Open any project folder.
2. Command palette (`Ctrl+Shift+P`) → **Pixa: Set OpenRouter API Key** → paste your key.
3. Click the **Pixa icon** in the activity bar, pick a model from the dropdown,
   and describe a task.

File edits appear as a reviewable change set (Diff / Apply / Reject); every
terminal command and git commit asks for your approval first.

### Common commands
```bash
npm run compile -w pixa-agent    # build the extension bundle
npm run watch   -w pixa-agent    # rebuild on save (dev)
npm run test    -w pixa-agent    # run the test suite (vitest)
npm run typecheck -w pixa-agent  # TypeScript check, no emit
npm run package -w pixa-agent    # build the installable .vsix
```

## Design guarantees

- **Provider-agnostic.** The agent knows only the `ModelProvider` interface
  ([types.ts](packages/pixa-agent/src/providers/types.ts)). OpenRouter is the
  first backend; official APIs or self-hosted models are new classes plus a
  registry entry — the IDE and agent never change.
- **Data-driven models.** Add or swap models by editing
  [models.json](packages/pixa-agent/models.json) — no code changes.
- **Plugin-based capabilities.** Tools register through `ToolRegistry`;
  future features (MCP servers, test runners, multi-agent dispatch, inline
  completion) plug in without touching the loop. The indexer sits behind the
  `RepoIndex` interface so an embedding backend can drop in later.
- **Safety by construction.** Agent file writes only exist as a staged
  `ChangeSet` until you apply them; all paths are jailed to the workspace;
  commands and commits require an explicit click; the API key lives in VS
  Code SecretStorage.

## Extending

| To add…            | Do this                                                                 |
|--------------------|-------------------------------------------------------------------------|
| A model            | Add an entry to `packages/pixa-agent/models.json`                       |
| A provider         | Implement `ModelProvider`, register it in `extension.ts`                |
| A tool             | Implement `Tool` (schema + execute), register in `tools/registry.ts`    |
| An index backend   | Implement `RepoIndex`, swap it in `extension.ts`                        |

## Building the branded IDE

See [ide/README.md](ide/README.md). One script fetches VS Code OSS, applies
Pixa branding, bundles pixa-agent as a built-in extension, and runs the OSS
build (1–2 h first run). No VS Code source patches — upstream upgrades are a
re-run, not a merge.

## Tests

```bash
npm run test        # vitest: registry, SSE parsing, change set, path jail,
                    # context pruning, and a scripted end-to-end agent loop
npm run typecheck
```

## What's in v2 (shipped)

- **Editor context** — the agent sees your open file and selection, like Copilot
- **@-file mentions** — `@src/server.js` in chat attaches that file
- **MCP servers** — add tools via the `pixa.mcpServers` setting; they
  auto-register into the agent (Copilot-parity extensibility)
- **Diagnostics self-correction** — `get_diagnostics` reads compiler/linter
  errors so the agent fixes its own mistakes after applying edits
- **Session persistence** — chat + cost survive window reloads
- **Revert** — applied changes can be rolled back from the change-set panel
- **Cost tracking** — OpenRouter's real billed $ per request + session total

## Roadmap (v3+)

Inline tab completion · embedding/semantic index · long-term
memory · multi-agent workflows · cloud workspaces · enterprise collaboration.

Design docs: [spec](docs/superpowers/specs/2026-07-03-pixa-ide-design.md) ·
[implementation plan](docs/superpowers/plans/2026-07-03-pixa-ide-v1.md)
