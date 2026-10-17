import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Context } from '@deepseek-ai/cordis';
import type { Session } from '@deepseek-ai/dsh-session';
import type { PressureReading } from './pressure.js';
/**
 * Structural view of the mounted compaction backend's resolved config.
 * Reading this field is a best-effort probe: only the shipped basic backend
 * exposes it, and the seam itself does not require it.
 */
export interface BackendConfigLike {
    readonly thresholdRatio?: number;
    readonly headroomTokens?: number;
    readonly retainRatio?: number;
    readonly retainTokens?: number;
    readonly auto?: boolean;
    readonly modelPolicies?: readonly ModelPolicyLike[];
}
/** One exact provider/model override inside the backend config. */
export interface ModelPolicyLike extends BackendConfigLike {
    readonly provider: string;
    readonly model: string;
}
/** What the status tool can say about current compaction policy. */
export interface PolicyReading {
    readonly known: boolean;
    readonly backend: string;
    readonly auto?: boolean;
    readonly thresholdTokens?: number;
    readonly thresholdRatio?: number;
    readonly retainTokens?: number;
    readonly invalidReason?: string;
}
/**
 * Report the effective automatic-compaction policy for the current route.
 *
 * The canonical policy still lives in the backend: this only reproduces the
 * basic backend's documented `floor(min(W * ratio, W - O - headroom))`
 * formula so a model that asks for a reading does not have to guess. Any
 * missing fact produces `known: false` or an `invalidReason`, never an
 * invented number.
 */
export declare function readPolicy(ctx: Context, session: Session, agent: Agent, pressure: PressureReading, signal: AbortSignal): Promise<PolicyReading>;
