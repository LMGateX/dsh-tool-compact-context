import type { Context } from '@deepseek-ai/cordis';
import { Config, resolveConfig } from './config.js';
/** Stable Cordis plugin name. */
export declare const name = "dsh-tool-compact-context";
/** Services the tools cannot work without. */
export declare const inject: string[];
export { Config, resolveConfig };
/**
 * Register the optional prompt contributions and the enabled tools.
 *
 * The Web form fields are volatile, so the loader hands them over as accessors
 * and emits `loader/volatile-update` for a live write. Resolve them to plain
 * values, build one disposable layout, and rebuild that layout when a setting
 * changes so the switches apply without a profile restart.
 *
 * @param ctx plugin context
 * @param rawConfig loader-resolved row config (plain values or volatile accessors)
 */
export declare function apply(ctx: Context, rawConfig?: Record<string, unknown>): void;
