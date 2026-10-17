/** Model-facing tool name. */
export declare const COMPACT_TOOL = "compact_context";
/** Model-facing read-only status tool name. */
export declare const STATUS_TOOL = "context_status";
/**
 * Static policy paragraph. Its bytes never change for a given deployment, so
 * it does not churn the prompt prefix; the optional runtime pressure line is a
 * separate, off-by-default contribution.
 */
export declare const GUIDANCE: string;
/** Model-facing description for the compaction tool. */
export declare function compactDescription(): string;
/** Model-facing description for the read-only status tool. */
export declare function statusDescription(): string;
