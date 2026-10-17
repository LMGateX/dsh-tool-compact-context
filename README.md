# dsh-tool-compact-context

Model-facing, on-demand context compaction for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

`compact_context` asks the deployment's native compaction machinery to run **inside the current turn**:

- at or above the native pressure threshold: `compactIfNeeded(agent, 'pressure', signal)`, the same path pre-step auto-compaction uses;
- below the threshold: the native `retainTokens` retained-tail selection plus the native `compactRegion` transaction, so the model can compact early without introducing a second compaction policy.

The model gets a normal tool result and the agent loop continues with the compacted surface. Thresholds, retention, model routing, tool-result pruning and retry policy stay in `compaction-basic`; the plugin adds no custom keep-turns knobs.

## Features

- **Native policy first** — above the threshold it delegates to the existing compaction engine.
- **Early compaction** — below the threshold it uses the backend's native retained-tail budget and native transaction.
- **Transient retries** — model/API/network failures are retried with backoff; deterministic failures (oversized summary, invalid config, busy lock) are returned immediately.
- **Optional status tool** — `context_status` reads occupancy and the native threshold/retained tail; off by default.
- **Optional prompt policy** — guidance is off by default; write the strategy in `AGENTS.md` or enable the built-in/custom section.
- **Settings UI** — four switches, timeout/retry fields in **seconds**, and a policy textarea.
- **PTC budget helper** — experimental per-provider/model defaults for `run_code` when `timeoutMs` is omitted.

## Install

Requirements: DSH with `@deepseek-ai/dsh-compaction-basic` (or a backend implementing `compactIfNeeded` and `compactRegion`).

From GitHub (includes built `lib` and `client` artifacts):

```bash
cd ~/.dsh/profiles/web
pnpm add github:LMGateX/dsh-tool-compact-context#v0.4.1
```

Then add `dsh-tool-compact-context` after `@deepseek-ai/dsh-base` in `dsh.profile.bundles`, or add the insert entry from [cordis.patch.yml](cordis.patch.yml) to the profile patch. Restart the profile when hot reload is unavailable.

## Compatibility

- Tested against DSH **0.2.1-rc.1** at runtime: 31/31 tests and TypeScript checks pass.
- **0.2.1-rc.2** release notes only cover DeepSeek-V4.1-Flash and Search/Fetch; the rc.1→rc.2 source diff for compaction, tools, PTC runtime and settings/plugin-manager packages is package-version-only, with no API changes.
- `engines.dsh`: `>=0.2.1-alpha.4 <0.3.0`.
- At the time of the rc.2 check its npm packages were not published yet, so the rc.2 conclusion is source-diff based.

## Development

```bash
pnpm install
pnpm run build
pnpm test
```

Host source is `src/*.ts` → `lib`; the settings page is `client-src/main.ts` → `client/main.js` (classic script). Tests use the DSH packages available in the profile/install.

## Docs

- [中文 README](README.zh.md)
- [cordis.patch.yml](cordis.patch.yml)
- [Changelog](CHANGELOG.md)

This is a community plugin, not an official DeepSeek Harness component.

## License

MIT. See [LICENSE](LICENSE).
