## What this does and why

<!-- The why matters more than the what — the diff already shows what changed. -->

## Testing

- [ ] `npm run typecheck -w pixa-agent` passes
- [ ] `npm run test:offline -w pixa-agent` passes
- [ ] Manually verified in the Extension Development Host (F5), if this touches the webview UI

## Checklist

- [ ] This doesn't weaken any of the [load-bearing safety rules](../CONTRIBUTING.md#load-bearing-rules--dont-break-these) (staged edits, approval-gated commands, path jail, secrets-only-in-SecretStorage) — or if it does, I've explained why above
- [ ] New logic has a test, if it's pure/testable (see [CONTRIBUTING.md](../CONTRIBUTING.md))
