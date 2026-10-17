import z from '@deepseek-ai/schemastery';
/**
 * Host row schema. Every field has a default, so the row can be enabled with
 * an empty config. The Web settings page renders the four switches and a
 * policy-textarea; the numeric fields stay in YAML (advanced tuning).
 */
export const Config = z.object({
    compactTool: z.boolean().default(true)
        .description('Expose the model-facing compact_context tool.'),
    statusTool: z.boolean().default(false)
        .description('Expose the read-only context_status tool. Opt-in: its schema and results can influence behavior and history.'),
    guidance: z.boolean().default(false)
        .description('Add a context-policy section to the system prompt. Off by default: prefer writing the strategy in AGENTS.md, or enable this and optionally customize guidanceText.'),
    guidanceText: z.string().default('')
        .description('Custom policy text for the guidance section. Empty uses the built-in default. Only used when guidance is true; capped at 8000 characters.'),
    pressureContext: z.boolean().default(false)
        .description('Experimental: append a quantized context-pressure line as runtime context. Off by default because it adds unrequested content and history.'),
    notifyAtRatio: z.number().default(0.25)
        .description('Window fraction at which the optional pressure line appears.'),
    pressureStep: z.number().default(10)
        .description('Percentage quantization for the optional pressure line.'),
    retryAttempts: z.number().default(2)
        .description('Additional attempts after a transient compaction failure (for example a model API error). Deterministic failures such as an oversized summary are not retried.'),
    retryDelayMs: z.number().default(1000)
        .description('Base delay between transient-failure retries, in milliseconds; doubles per attempt.'),
    ptcTimeoutMs: z.number().default(0)
        .description('Experimental: default PTC run timeout in milliseconds when run_code did not pass timeoutMs. 0 leaves the deployment default. Requires a mounted PtcRuntime whose resolve() can be wrapped.'),
    ptcModelTimeouts: z.dict(z.number()).default({})
        .description('Experimental per-provider/model PTC defaults, keyed by "provider/model"; applies when run_code did not pass timeoutMs.'),
});
/**
 * Reject values the row schema cannot express (integers, ranges).
 * @param config resolved row config
 */
export function validateConfig(config) {
    const integer = (key, min) => {
        const value = config[key];
        if (!Number.isInteger(value) || value < min) {
            throw new TypeError(`tool-compact-context: ${key} must be an integer >= ${String(min)}`);
        }
    };
    if (typeof config.compactTool !== 'boolean')
        throw new TypeError('tool-compact-context: compactTool must be a boolean');
    if (typeof config.statusTool !== 'boolean')
        throw new TypeError('tool-compact-context: statusTool must be a boolean');
    if (typeof config.guidance !== 'boolean')
        throw new TypeError('tool-compact-context: guidance must be a boolean');
    if (typeof config.guidanceText !== 'string')
        throw new TypeError('tool-compact-context: guidanceText must be a string');
    if (config.guidanceText.length > 8000)
        throw new TypeError('tool-compact-context: guidanceText must be at most 8000 characters');
    if (typeof config.pressureContext !== 'boolean')
        throw new TypeError('tool-compact-context: pressureContext must be a boolean');
    integer('pressureStep', 1);
    if (config.pressureStep > 50)
        throw new TypeError('tool-compact-context: pressureStep must be at most 50');
    if (typeof config.notifyAtRatio !== 'number' || !(config.notifyAtRatio >= 0 && config.notifyAtRatio < 1)) {
        throw new TypeError('tool-compact-context: notifyAtRatio must be a number in [0, 1)');
    }
    integer('retryAttempts', 0);
    if (config.retryAttempts > 5)
        throw new TypeError('tool-compact-context: retryAttempts must be at most 5');
    integer('retryDelayMs', 0);
    if (config.retryDelayMs > 60000)
        throw new TypeError('tool-compact-context: retryDelayMs must be at most 60000');
    integer('ptcTimeoutMs', 0);
    if (config.ptcModelTimeouts === null || typeof config.ptcModelTimeouts !== 'object' || Array.isArray(config.ptcModelTimeouts)) {
        throw new TypeError('tool-compact-context: ptcModelTimeouts must be an object keyed by provider/model');
    }
    for (const [key, value] of Object.entries(config.ptcModelTimeouts)) {
        if (!key.includes('/'))
            throw new TypeError(`tool-compact-context: ptcModelTimeouts key ${JSON.stringify(key)} must be "provider/model"`);
        if (!Number.isInteger(value) || value <= 0)
            throw new TypeError(`tool-compact-context: ptcModelTimeouts[${JSON.stringify(key)}] must be a positive integer`);
    }
}
