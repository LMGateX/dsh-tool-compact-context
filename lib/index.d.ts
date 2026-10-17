import type { Context } from '@deepseek-ai/cordis';
import { Config } from './config.js';
import type { ResolvedConfig } from './config.js';
/** Stable Cordis plugin name. */
export declare const name = "dsh-tool-compact-context";
/** Services the tools cannot work without. */
export declare const inject: string[];
export { Config };
/**
 * Register the optional prompt contributions and the enabled tools.
 * @param ctx plugin context
 * @param config resolved row config
 */
export declare function apply(ctx: Context, config: ResolvedConfig): void;
