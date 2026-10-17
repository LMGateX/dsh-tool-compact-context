# Changelog

## 0.4.2

- Skip redundant full-surface measurements on the compaction path: the retained-tail fallback measures once (it previously measured up to three times when the token-meter projection was unavailable), and tool-result percentages read only the projection because a measure-only reading cannot supply a window.
- Read the optional pressure line from the already-driven session projection (`cachedSnapshot`) instead of materializing every projection unit on each prompt assembly; fall back to the exact snapshot when the cell is absent or trailing.
- Cache `compact_context` visibility per agent and invalidate it on `tools/change`, so optional prompt callbacks no longer rebuild the tool registry view every model step.

## 0.4.1

- Install the experimental PTC timeout wrapper only when `ptcTimeoutMs` or `ptcModelTimeouts` is configured, and skip route lookup for global-only defaults.
- Select the retained-tail cut with one prefix pass instead of rescanning the prefix for every candidate tool-pair boundary.
- Keep the optional pressure line on the token-meter projection; if the projection has not materialized, omit the line instead of running a full `measure()` on every prompt assembly.
- Retry HTTP 408/425/429/5xx, and classify `MAX_TOKENS` plus invalid model-metadata codes as deterministic so they do not spend retry backoff.

## 0.4.0

- Trigger native context compaction through `compactIfNeeded(agent, 'pressure', signal)`.
- Add a below-threshold fallback that selects with the backend's native `retainTokens` and runs the native `compactRegion` transaction.
- Add bounded retries with backoff for transient model/API failures; deterministic failures are not retried.
- Add optional `context_status` with native threshold/retention probing.
- Add Web settings UI with switches, policy text, and timeout/retry fields displayed in seconds.
- Add experimental per-provider/model PTC budget defaults via `ptcTimeoutMs` / `ptcModelTimeouts`.
- Declare `engines.dsh` compatibility and document DSH 0.2.1-rc.1/rc.2 checks.
