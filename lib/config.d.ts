import z from '@deepseek-ai/schemastery';
/**
 * Host row schema. Every field has a default, so the row can be enabled with
 * an empty config. The Web settings page renders the four switches and a
 * policy-textarea; the numeric fields stay in YAML (advanced tuning).
 */
export declare const Config: z<ResolvedConfig>;
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
 * Reject values the row schema cannot express (integers, ranges).
 * @param config resolved row config
 */
export declare function validateConfig(config: ResolvedConfig): void;
