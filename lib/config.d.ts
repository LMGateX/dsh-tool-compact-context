/**
 * Host row schema. Every field has a default, so the row can be enabled with
 * an empty config.
 *
 * The fields rendered by the Web form are marked volatile on purpose: DSH's
 * settings service builds a row form only from volatile fields, and a settings
 * write is accepted only beneath a volatile node. The numeric watermark fields
 * (notifyAtRatio, pressureStep) stay in YAML and are deliberately not volatile.
 */
export declare const Config: Schemastery<any, any, any>;
/** Resolved row config passed to apply(). */
export interface ResolvedConfig {
    compactTool: boolean;
    statusTool: boolean;
    guidance: boolean;
    guidanceText: string;
    pressureContext: boolean;
    notifyAtRatio: number;
    pressureStep: number;
    retryAttempts: number;
    retryDelayMs: number;
    ptcTimeoutMs: number;
    ptcModelTimeouts: Record<string, number>;
}
/**
 * Resolve a loader-passed config whose volatile fields are accessors.
 * The schema applies defaults and validates the plain values; the accessor
 * wrappers it produces for volatile fields are unwrapped for apply() and the
 * tool implementations.
 *
 * @param raw row config: plain values, volatile accessors, or a mix
 * @returns a plain resolved config
 */
export declare function resolveConfig(raw?: unknown): ResolvedConfig;
/**
 * Reject values the row schema cannot express (integers, ranges).
 * @param config resolved row config
 */
export declare function validateConfig(config: ResolvedConfig): void;
