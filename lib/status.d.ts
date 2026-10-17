import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Context } from '@deepseek-ai/cordis';
/** A read-only snapshot returned by the context_status tool. */
export interface ContextStatus {
    readonly ok: boolean;
    readonly reason?: string;
    readonly tokens?: number;
    readonly window?: number;
    readonly percent?: number;
    readonly remaining?: number;
    readonly source?: string;
    readonly policyKnown?: boolean;
    readonly auto?: boolean;
    readonly threshold?: number;
    readonly thresholdPercent?: number;
    readonly retain?: number;
    readonly aboveThreshold?: boolean;
    readonly backend?: string;
    readonly policyReason?: string;
    readonly systemTokens?: number;
    readonly toolsTokens?: number;
    readonly messageTokens?: number;
}
/** Options parsed from the status tool arguments. */
export interface StatusOptions {
    readonly includePolicy: boolean;
    readonly includeBreakdown: boolean;
}
/**
 * Build one status reading. Every expensive or optional fact is best-effort:
 * a missing projection, adapter capability, or backend config produces an
 * explicit unknown rather than an error.
 */
export declare function buildStatus(ctx: Context, agent: Agent, options: StatusOptions, signal: AbortSignal): Promise<ContextStatus>;
/**
 * Render a status reading as compact model-facing text. The result is a normal
 * tool result: it enters history only because the model asked for it.
 */
export declare function renderStatus(value: ContextStatus): string;
