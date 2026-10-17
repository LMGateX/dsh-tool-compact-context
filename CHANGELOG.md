# Changelog

## 0.4.0

- Trigger native context compaction through `compactIfNeeded(agent, 'pressure', signal)`.
- Add a below-threshold fallback that selects with the backend's native `retainTokens` and runs the native `compactRegion` transaction.
- Add bounded retries with backoff for transient model/API failures; deterministic failures are not retried.
- Add optional `context_status` with native threshold/retention probing.
- Add Web settings UI with switches, policy text, and timeout/retry fields displayed in seconds.
- Add experimental per-provider/model PTC budget defaults via `ptcTimeoutMs` / `ptcModelTimeouts`.
- Declare `engines.dsh` compatibility and document DSH 0.2.1-rc.1/rc.2 checks.
