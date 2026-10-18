import type { Context } from '@deepseek-ai/cordis';
import type { ResolvedConfig } from './config.js';
/**
 * Experimental: give run_code a longer default deadline for slow models.
 *
 * The public PtcRuntime has no timeout hook; this wraps its public resolve()
 * method so an omitted run_code timeoutMs can be replaced per provider/model.
 * An explicit model-supplied timeoutMs (including null) is always respected.
 * The wrapper is installed only when configured; the caller owns the
 * returned restore function so a volatile config change can replace it.
 * @param ctx plugin context
 * @param config plain resolved row config
 * @returns a disposer restoring the original resolve(), or undefined when
 *   nothing was configured or the runtime seam is unavailable
 */
export declare function installPtcTimeoutOverride(ctx: Context, config: ResolvedConfig): (() => void) | undefined;
