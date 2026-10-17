/**
 * Read the newest next-request prompt estimate and route capacity.
 * Prefers the token meter's projection (O(1), provider-anchored), falls back
 * to a full measurement when projections are unavailable, and degrades to an
 * empty reading rather than breaking prompt assembly. The optional pressure
 * line passes `measure: false` so a hidden line never pays an O(surface) scan
 * on every prompt assembly.
 */
export function readPressure(ctx, session, options = {}) {
    const projections = ctx.get('sessionProjections');
    if (projections !== undefined && projections !== null) {
        try {
            const snapshot = projections.snapshot(session, ['contextPressure']);
            const value = snapshot?.values?.contextPressure;
            const tokens = value?.projectedTokens ?? value?.pressureTokens;
            const window = value?.contextWindow;
            if (typeof tokens === 'number' && tokens >= 0 && typeof window === 'number' && window > 0) {
                return { tokens, window, source: 'provider' };
            }
            if (typeof tokens === 'number' && tokens >= 0) {
                return { tokens, source: 'provider' };
            }
        }
        catch {
            // The projection may not be registered or materialized yet; measure instead.
        }
    }
    if (options.measure === false)
        return { source: 'unknown' };
    try {
        const measured = ctx.tokenMeter.measure(session);
        const tokens = typeof measured?.surfaceTokens === 'number' ? measured.surfaceTokens : measured?.totalTokens;
        if (typeof tokens === 'number' && tokens >= 0)
            return { tokens, source: 'surface' };
    }
    catch {
        // A measurement failure must not make prompt assembly fail.
    }
    return { source: 'unknown' };
}
/**
 * Read the heuristic system/tools/messages composition, when the composition
 * registers that projection. This is an estimate, not a billing record.
 */
export function readBreakdown(ctx, session) {
    const projections = ctx.get('sessionProjections');
    if (projections === undefined || projections === null)
        return undefined;
    try {
        const snapshot = projections.snapshot(session, ['contextBreakdown']);
        const value = snapshot?.values?.contextBreakdown;
        if (value === undefined)
            return undefined;
        return {
            systemTokens: typeof value.systemTokens === 'number' ? value.systemTokens : 0,
            toolsTokens: typeof value.toolsTokens === 'number' ? value.toolsTokens : 0,
            messageTokens: typeof value.messageTokens === 'number' ? value.messageTokens : 0,
        };
    }
    catch {
        return undefined;
    }
}
/** Quantized percentage of the window in use, or undefined when unknown. */
export function pressurePercent(pressure, step) {
    if (typeof pressure.tokens !== 'number' || typeof pressure.window !== 'number' || pressure.window <= 0) {
        return undefined;
    }
    const raw = Math.round((pressure.tokens / pressure.window) * 100 / step) * step;
    return Math.max(0, Math.min(100, raw));
}
/**
 * The optional runtime-context line. It is deliberately quantized: runtime
 * context snapshots are appended when their text changes, so a per-step
 * percentage would append a message every step.
 */
export function pressureText(pressure, config, toolAvailable = true) {
    const percent = pressurePercent(pressure, config.pressureStep);
    if (percent === undefined)
        return '';
    if (typeof pressure.tokens === 'number' && typeof pressure.window === 'number') {
        if (pressure.tokens / pressure.window < config.notifyAtRatio)
            return '';
    }
    const advice = toolAvailable
        ? ' A compact_context tool can condense older history if the remaining work needs more room.'
        : '';
    return `Estimated context use: ~${String(percent)}% of the window.${advice}`;
}
