import type { Session, SessionSeq } from '@deepseek-ai/dsh-session';
/** The priced surface shape needed by the native-retention selector. */
export interface NativeSurfaceMeasurement {
    readonly nodes: readonly {
        readonly seq: SessionSeq;
        readonly tokens: number;
        readonly heuristicTokens: number;
    }[];
}
/** One inclusive surface range. */
export interface NativeRange {
    readonly start: SessionSeq;
    readonly end: SessionSeq;
}
/**
 * Select a range exactly like compaction-basic's private
 * `selectCompactableRange(session, measurement, retainTokens)`:
 * accumulate from the tail until the native retain budget is met, move the cut
 * back to a tool-pairing-balanced position, and start after the system node.
 *
 * This is a compatibility shim for the missing public "manual compaction"
 * trigger. The retention value comes from the backend config; the plugin adds
 * no keep-turns/min-free knobs of its own.
 */
export declare function selectNativeRetentionRange(session: Session, measurement: NativeSurfaceMeasurement, retainTokens: number): NativeRange | null;
