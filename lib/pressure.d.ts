import type { Context } from '@deepseek-ai/cordis';
import type { Session } from '@deepseek-ai/dsh-session';
/** Where an occupancy figure came from. */
export type PressureSource = 'provider' | 'surface' | 'unknown';
/** The newest next-request occupancy reading. */
export interface PressureReading {
    readonly tokens?: number;
    readonly window?: number;
    readonly source: PressureSource;
}
/** Heuristic composition of the next request. */
export interface BreakdownReading {
    readonly systemTokens: number;
    readonly toolsTokens: number;
    readonly messageTokens: number;
}
/**
 * Read the newest next-request prompt estimate and route capacity.
 * Prefers the token meter's projection (O(1), provider-anchored), falls back
 * to a full measurement when projections are unavailable, and degrades to an
 * empty reading rather than breaking prompt assembly. The optional pressure
 * line passes `measure: false` so a hidden line never pays an O(surface) scan
 * on every prompt assembly.
 */
export declare function readPressure(ctx: Context, session: Session, options?: {
    readonly measure?: boolean;
}): PressureReading;
/**
 * Read the heuristic system/tools/messages composition, when the composition
 * registers that projection. This is an estimate, not a billing record.
 */
export declare function readBreakdown(ctx: Context, session: Session): BreakdownReading | undefined;
/** Quantized percentage of the window in use, or undefined when unknown. */
export declare function pressurePercent(pressure: PressureReading, step: number): number | undefined;
/**
 * The optional runtime-context line. It is deliberately quantized: runtime
 * context snapshots are appended when their text changes, so a per-step
 * percentage would append a message every step.
 */
export declare function pressureText(pressure: PressureReading, config: {
    notifyAtRatio: number;
    pressureStep: number;
}, toolAvailable?: boolean): string;
