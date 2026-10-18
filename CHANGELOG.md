# Changelog

## 0.4.4

- Fix the Web settings form's dark-theme contrast. The form used `--dsw-alias-bg-primary` / `--dsw-alias-border-secondary`, which this DSH build does not define, so inputs and buttons fell back to white while the primary text stayed white. They now use the shell's real layer/border tokens (`--dsw-alias-bg-layer-3`, `--dsw-alias-border-l4`, `--dsw-radius-md`), and the checkboxes use the native accent color.
- No behavior or configuration changes; this is a client-only visual fix.

## 0.4.3

- Fix the Web settings form never appearing on DSH 0.2.1-rc.2: mark the fields the form edits as volatile so the settings service generates the row's configuration namespace. Previously the client form was implemented but its host schema was not volatile, so the plugin manager had no configuration entry to show.
- Apply volatile settings changes live: the host unwraps loader accessors and rebuilds the tool/prompt layout on `loader/volatile-update`, so toggling a switch no longer needs a profile restart.
- Keep the PTC timeout wrapper replaceable across live reconfiguration and restore it when the plugin unloads.

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
