# Changelog

All notable changes to Pixa Agent are documented here.

## [0.6.1] — 2026-07-23

### Added
- In-panel Providers UI: add/delete providers, quick-setup presets (Ollama, LM Studio, vLLM, NVIDIA NIM, OpenRouter), and live model discovery via `/models`
- Command-safety policy: known-destructive commands are blocked before execution, on top of the existing per-command approval gate
- Recovery for tool calls some local-model runtimes return as text instead of the native `tool_calls` field, so smaller local coding models can run agent tasks
- Reasoning-effort picker for models that support it (OpenRouter's `reasoning: { effort }`)
- "Reject all" for staged changes, alongside the existing "Apply all"

### Fixed
- Extension failing to activate after packaging (a dependency wasn't bundled into the `.vsix`)
- Plan checklist not rendering for most models (parser expected a numbered list; the prompt didn't ask for one)
- Diff review being easy to miss — the proposed-file name is now clickable and opens the diff directly

## [0.6.0] and earlier

Pre-launch development. See git history for detail.
