import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, Config, inject, name } from '../lib/index.js';
import { buildConversation } from './helpers.js';

function makeHarness({
  projected = 800,
  window = 1000,
  pressureContext = false,
  compactTool = true,
  statusTool = true,
  guidance = true,
  guidanceText = '',
  retryAttempts = 2,
  retryDelayMs = 0,
  ptcTimeoutMs = 0,
  ptcModelTimeouts = {},
  policy = { thresholdRatio: 0.8, headroomTokens: 65536, retainRatio: 0.16, auto: true, modelPolicies: [] },
} = {}) {
  const session = buildConversation();
  const sections = [];
  const contexts = [];
  const calls = [];
  const tools = new Map();
  const ptcRuntime = {
    timeout: { defaultMs: 120000, maxMs: 600000 },
    resolve(request) {
      return { ...request, timeoutMs: request.timeoutMs === undefined ? 120000 : request.timeoutMs };
    },
  };
  let compactionCount = 0;
  let current = { projected, window };
  let hidden = false;

  const ctx = {
    tools: {
      register(definition) {
        tools.set(definition.name, definition);
      },
      get(toolName) {
        return hidden ? undefined : tools.get(toolName);
      },
      hide() {
        hidden = true;
      },
    },
    compaction: {
      config: policy,
      async compactIfNeeded(agent, trigger, signal) {
        calls.push({ agent, trigger, signal });
        compactionCount += 1;
        current = { projected: 300, window };
        return {
          shadowedSeqs: [1, 2],
          shadowedTokenCount: 500,
        };
      },
      async compactRegion(start, end, agent, signal) {
        calls.push({ start, end, agent, signal, retention: true });
        compactionCount += 1;
        current = { projected: 300, window };
        return { shadowedSeqs: [start, end], shadowedTokenCount: 200 };
      },
    },
    tokenMeter: {
      measure(subject) {
        const nodes = subject.surface.nodes.map((seq) => ({ seq, tokens: 100, heuristicTokens: 100 }));
        return { nodes, surfaceTokens: nodes.length * 100, totalTokens: nodes.length * 100 };
      },
    },
    systemPrompt: {
      section(entry) {
        sections.push(entry);
      },
      context(entry) {
        contexts.push(entry);
      },
    },
    llm: {
      async resolveModelInfo() {
        return { context: { contextWindow: 200000 }, defaultMaxTokens: 10000 };
      },
    },
    ptcRuntime,
    get(service) {
      if (service !== 'sessionProjections') return undefined;
      return {
        snapshot() {
          return {
            values: {
              contextPressure: {
                projectedTokens: current.projected,
                contextWindow: current.window,
              },
              contextBreakdown: {
                systemTokens: 2000,
                toolsTokens: 6000,
                messageTokens: 72000,
              },
            },
          };
        },
      };
    },
  };

  apply(ctx, Config({
    pressureContext,
    compactTool,
    statusTool,
    guidance,
    guidanceText,
    retryAttempts,
    retryDelayMs,
    ptcTimeoutMs,
    ptcModelTimeouts,
  }));
  return {
    session,
    ctx,
    ptcRuntime,
    sections,
    contexts,
    calls,
    tools,
    tool(toolName = 'compact_context') {
      return tools.get(toolName);
    },
    hide() {
      ctx.tools.hide();
    },
    get count() {
      return compactionCount;
    },
  };
}

test('registers the expected plugin surface', () => {
  assert.equal(name, 'dsh-tool-compact-context');
  const defaults = Config({});
  assert.equal(defaults.compactTool, true);
  assert.equal(defaults.statusTool, false);
  assert.equal(defaults.guidance, false);
  assert.equal(defaults.pressureContext, false);
  assert.equal(defaults.retryAttempts, 2);
  assert.equal(defaults.retryDelayMs, 1000);
  assert.equal(defaults.ptcTimeoutMs, 0);
  assert.deepEqual(defaults.ptcModelTimeouts, {});
  assert.deepEqual(inject, ['tools', 'compaction', 'tokenMeter', 'systemPrompt', 'llm']);
  const harness = makeHarness();
  assert.equal(harness.tool('compact_context').name, 'compact_context');
  assert.equal(harness.tool('context_status').name, 'context_status');
  assert.equal(harness.sections.length, 1);
  assert.match(harness.sections[0].text({}), /## Context management/);
  assert.match(harness.sections[0].text({}), /compact_context/);
  // The automatic pressure line is off by default.
  assert.equal(harness.contexts.length, 0);
});

test('uses a configured PTC default when run_code omits timeoutMs', () => {
  const harness = makeHarness({ ptcTimeoutMs: 300000 });
  const spec = harness.ptcRuntime.resolve({ program: '', bindings: [] });
  assert.equal(spec.timeoutMs, 300000);
});

test('uses and caps a per-model PTC default', () => {
  const harness = makeHarness({
    ptcTimeoutMs: 300000,
    ptcModelTimeouts: { 'slow/m': 900000 },
  });
  harness.session.requestHeader = () => ({ config: { provider: 'slow', model: 'm', maxTokens: 1000 } });
  const spec = harness.ptcRuntime.resolve({
    program: '',
    bindings: [],
    stateOwner: { session: harness.session, options: {} },
  });
  assert.equal(spec.timeoutMs, 600000);
});

test('respects an explicit run_code timeout', () => {
  const harness = makeHarness({ ptcTimeoutMs: 300000 });
  const spec = harness.ptcRuntime.resolve({ program: '', bindings: [], timeoutMs: 1000 });
  assert.equal(spec.timeoutMs, 1000);
});

test('uses custom guidance text when provided', () => {
  const harness = makeHarness({ guidance: true, guidanceText: 'CUSTOM POLICY: compact before large reads.' });
  assert.equal(harness.sections[0].text({}), 'CUSTOM POLICY: compact before large reads.');
});

test('the optional pressure line is registered only when enabled', () => {
  const harness = makeHarness({ pressureContext: true });
  assert.equal(harness.contexts.length, 1);
});

test('delegates compaction to the native pressure policy', async () => {
  const harness = makeHarness({ projected: 800, window: 1000 });
  const signal = new AbortController().signal;
  const agent = { session: harness.session, options: {} };
  const result = await harness.tool().execute({}, { agent, signal });
  assert.deepEqual(result, {
    ok: true,
    compactedItems: 2,
    freedTokens: 500,
    contextPercent: 30,
    mode: 'pressure',
  });
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0].agent, agent);
  assert.equal(harness.calls[0].trigger, 'pressure');
  assert.equal(harness.calls[0].signal, signal);
});

test('reports an explicit failure when the native retention policy is unavailable', async () => {
  const harness = makeHarness({ projected: 200, window: 1000 });
  harness.ctx.compaction.compactIfNeeded = async () => null;
  harness.ctx.compaction.config = undefined;
  const result = await harness.tool().execute(
    {},
    {
      agent: { session: harness.session, options: { provider: 'test', model: 'test' } },
      signal: new AbortController().signal,
    },
  );
  assert.equal(result.ok, false);
  assert.match(result.reason, /native pressure policy did not compact/);
  assert.match(result.reason, /retained-tail policy is unavailable/);
  assert.equal(harness.count, 0);
});

test('falls back to the native retained-tail policy below the threshold', async () => {
  const harness = makeHarness({
    projected: 200,
    window: 1000,
    policy: { thresholdRatio: 0.8, headroomTokens: 100, retainRatio: 0.5, auto: true, modelPolicies: [] },
  });
  harness.ctx.compaction.compactIfNeeded = async () => null;
  harness.session.requestHeader = () => ({ config: { provider: 'test', model: 'test', maxTokens: 100 } });
  const result = await harness.tool().execute(
    {},
    {
      agent: { session: harness.session, options: { provider: 'test', model: 'test' } },
      signal: new AbortController().signal,
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'retention');
  assert.equal(result.compactedItems, 2);
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0].retention, true);
  assert.equal(harness.calls[0].start, harness.session.surface.nodes[1]);
  assert.equal(harness.calls[0].end, harness.session.surface.nodes[2]);
});

test('rejects arguments because the native policy owns selection', async () => {
  const harness = makeHarness();
  const exec = { agent: { session: harness.session, options: {} }, signal: new AbortController().signal };
  const keepTurns = await harness.tool().execute({ keep_turns: 0 }, exec);
  assert.equal(keepTurns.ok, false);
  assert.match(keepTurns.reason, /takes no arguments/);
  const unknown = await harness.tool().execute({ keepTurns: 1 }, exec);
  assert.equal(unknown.ok, false);
  assert.match(unknown.reason, /takes no arguments/);
  const notObject = await harness.tool().execute('nope', exec);
  assert.equal(notObject.ok, false);
  assert.equal(harness.count, 0);
});

test('requires an agent turn', async () => {
  const harness = makeHarness();
  const result = await harness.tool().execute({}, { signal: new AbortController().signal });
  assert.equal(result.ok, false);
  assert.match(result.reason, /agent turn/);
});

test('retries a transient model failure with backoff', async () => {
  const harness = makeHarness();
  let attempts = 0;
  harness.ctx.compaction.compactIfNeeded = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('upstream 503 overloaded');
    return { shadowedSeqs: [1], shadowedTokenCount: 10 };
  };
  const result = await harness.tool().execute(
    {},
    { agent: { session: harness.session, options: {} }, signal: new AbortController().signal },
  );
  assert.equal(result.ok, true);
  assert.equal(attempts, 2);
});

test('does not retry a deterministic oversized-summary failure', async () => {
  const harness = makeHarness();
  let attempts = 0;
  harness.ctx.compaction.compactIfNeeded = async () => {
    attempts += 1;
    throw new Error('summary is not smaller than the shadowed content');
  };
  const result = await harness.tool().execute(
    {},
    { agent: { session: harness.session, options: {} }, signal: new AbortController().signal },
  );
  assert.equal(result.ok, false);
  assert.equal(attempts, 1);
});

test('stops after the configured transient retry budget', async () => {
  const harness = makeHarness({ retryAttempts: 1 });
  let attempts = 0;
  harness.ctx.compaction.compactIfNeeded = async () => {
    attempts += 1;
    throw new Error('upstream 503 overloaded');
  };
  const result = await harness.tool().execute(
    {},
    { agent: { session: harness.session, options: {} }, signal: new AbortController().signal },
  );
  assert.equal(result.ok, false);
  assert.match(result.reason, /compaction failed/);
  assert.equal(attempts, 2);
});

test('maps a busy compaction to a readable reason', async () => {
  const harness = makeHarness();
  harness.ctx.compaction.compactIfNeeded = async () => {
    const error = new Error('busy');
    error.code = 'busy';
    throw error;
  };
  const result = await harness.tool().execute(
    {},
    { agent: { session: harness.session, options: {} }, signal: new AbortController().signal },
  );
  assert.equal(result.ok, false);
  assert.match(result.reason, /already running/);
});

test('retries once after a surface change', async () => {
  const harness = makeHarness();
  let attempts = 0;
  harness.ctx.compaction.compactIfNeeded = async () => {
    attempts += 1;
    if (attempts === 1) {
      const error = new Error('compaction: session surface changed during summarization');
      error.name = 'SurfaceChangedError';
      throw error;
    }
    return { shadowedSeqs: [1, 2], shadowedTokenCount: 10 };
  };
  const result = await harness.tool().execute(
    {},
    { agent: { session: harness.session, options: {} }, signal: new AbortController().signal },
  );
  assert.equal(result.ok, true);
  assert.equal(attempts, 2);
});

test('reports a persistent surface change after the retry', async () => {
  const harness = makeHarness();
  harness.ctx.compaction.compactIfNeeded = async () => {
    const error = new Error('compaction: session surface changed during summarization');
    error.name = 'SurfaceChangedError';
    throw error;
  };
  const result = await harness.tool().execute(
    {},
    { agent: { session: harness.session, options: {} }, signal: new AbortController().signal },
  );
  assert.equal(result.ok, false);
  assert.match(result.reason, /conversation changed/);
});

test('injects a quantized pressure line only above the floor', () => {
  const harness = makeHarness({ projected: 800, window: 1000, pressureContext: true });
  const text = harness.contexts[0].text({ agent: { session: harness.session } });
  assert.match(text, /~80% of the window/);

  const low = makeHarness({ projected: 200, window: 1000, pressureContext: true });
  assert.equal(low.contexts[0].text({ agent: { session: low.session } }), '');
  assert.equal(harness.contexts[0].text({}), '');
});

test('hides its prompt contributions when the tool is restricted away', () => {
  const harness = makeHarness({ pressureContext: true });
  harness.hide();
  assert.equal(harness.sections[0].text({ agent: {} }), '');
  assert.equal(harness.contexts[0].text({ agent: { session: harness.session } }), '');
});

test('the status tool reads occupancy and the backend policy', async () => {
  const harness = makeHarness({ projected: 80000, window: 200000 });
  const result = await harness.tool('context_status').execute(
    { include_breakdown: true },
    {
      agent: { session: harness.session, options: { provider: 'test', model: 'test' } },
      signal: new AbortController().signal,
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.tokens, 80000);
  assert.equal(result.window, 200000);
  assert.equal(result.percent, 40);
  assert.equal(result.remaining, 120000);
  assert.equal(result.source, 'provider');
  assert.equal(result.policyKnown, true);
  assert.equal(result.auto, true);
  assert.equal(result.threshold, 124464);
  assert.equal(result.thresholdPercent, 62);
  assert.equal(result.retain, 30400);
  assert.equal(result.aboveThreshold, false);
  assert.equal(result.systemTokens, 2000);
  assert.equal(result.toolsTokens, 6000);
  assert.equal(result.messageTokens, 72000);

  const text = harness.tool('context_status').output.render({}, result)[0].text;
  assert.match(text, /Context: ~40%/);
  assert.match(text, /threshold ~124,464/);
  assert.match(text, /Breakdown/);
});

test('the status tool degrades when the backend exposes no config', async () => {
  const harness = makeHarness();
  harness.ctx.compaction.config = undefined;
  const result = await harness.tool('context_status').execute(
    {},
    {
      agent: { session: harness.session, options: { provider: 'test', model: 'test' } },
      signal: new AbortController().signal,
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.policyKnown, false);
  assert.match(result.policyReason, /does not expose/);
});

test('the status tool reports an invalid retention policy without inventing numbers', async () => {
  const harness = makeHarness({
    projected: 50000,
    window: 200000,
    policy: { thresholdRatio: 0.8, headroomTokens: 1000, retainTokens: 999999, auto: true, modelPolicies: [] },
  });
  const result = await harness.tool('context_status').execute(
    {},
    {
      agent: { session: harness.session, options: { provider: 'test', model: 'test' } },
      signal: new AbortController().signal,
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.policyKnown, true);
  assert.equal(result.threshold, 160000);
  assert.equal(result.retain, 999999);
  assert.match(result.policyReason, /retained tail/);
});

test('the status tool honors model-policy retention precedence', async () => {
  const harness = makeHarness({
    projected: 50000,
    window: 200000,
    policy: {
      thresholdRatio: 0.8,
      headroomTokens: 1000,
      retainTokens: 45000,
      auto: true,
      modelPolicies: [{ provider: 'test', model: 'test', retainRatio: 0.1 }],
    },
  });
  const result = await harness.tool('context_status').execute(
    {},
    {
      agent: { session: harness.session, options: { provider: 'test', model: 'test' } },
      signal: new AbortController().signal,
    },
  );
  assert.equal(result.policyKnown, true);
  assert.equal(result.retain, 19000);
});

test('both tools can be switched off independently', () => {
  const noStatus = makeHarness({ statusTool: false });
  assert.equal(noStatus.tool('context_status'), undefined);
  assert.notEqual(noStatus.tool('compact_context'), undefined);

  const noCompact = makeHarness({ compactTool: false, pressureContext: true });
  assert.equal(noCompact.tool('compact_context'), undefined);
  assert.notEqual(noCompact.tool('context_status'), undefined);
  assert.equal(noCompact.sections.length, 0);
  assert.equal(noCompact.contexts.length, 0);

  const noGuidance = makeHarness({ guidance: false });
  assert.equal(noGuidance.sections.length, 0);
});

test('renders success and failure results', () => {
  const harness = makeHarness();
  const success = harness.tool().output.render({}, {
    ok: true,
    compactedItems: 2,
    freedTokens: 1234,
    contextPercent: 40,
  });
  assert.match(success[0].text, /Compacted 2 older history items/);
  assert.match(success[0].text, /continue the task/);
  const failure = harness.tool().output.render({}, { ok: false, reason: 'nothing to do' });
  assert.equal(failure[0].text, 'nothing to do');
});
