import type { Context } from '@deepseek-ai/cordis';
import type { ResolvedConfig } from './config.js';

/** Minimal structural view of the PTC runtime's public resolve() seam. */
interface PtcRunRequestLike {
  readonly timeoutMs?: number | null;
  readonly stateOwner?: object;
}

interface PtcRunSpecLike {
  readonly timeoutMs?: number | null;
}

interface PtcRuntimeLike {
  readonly timeout?: { readonly maxMs: number };
  resolve(request: PtcRunRequestLike): PtcRunSpecLike;
}

/** Route the run_code state owner carries, when it is an Agent. */
function routeOf(owner: object | undefined): { provider: string; model: string } | undefined {
  if (owner === undefined) return undefined;
  const agent = owner as {
    session?: { requestHeader?: () => { config?: { provider?: unknown; model?: unknown } } | undefined };
    options?: { provider?: unknown; model?: unknown };
  };
  const header = typeof agent.session?.requestHeader === 'function' ? agent.session.requestHeader()?.config : undefined;
  if (typeof header?.provider === 'string' && header.provider.length > 0
    && typeof header.model === 'string' && header.model.length > 0) {
    return { provider: header.provider, model: header.model };
  }
  if (typeof agent.options?.provider === 'string' && agent.options.provider.length > 0
    && typeof agent.options.model === 'string' && agent.options.model.length > 0) {
    return { provider: agent.options.provider, model: agent.options.model };
  }
  return undefined;
}

/**
 * Experimental: give run_code a longer default deadline for slow models.
 *
 * The public PtcRuntime has no timeout hook; this wraps its public resolve()
 * method so an omitted run_code timeoutMs can be replaced per provider/model.
 * An explicit model-supplied timeoutMs (including null) is always respected.
 * The wrapper is installed only when configured and is restored on disposal.
 */
export function installPtcTimeoutOverride(ctx: Context, config: ResolvedConfig): void {
  const hasModelTimeouts = Object.keys(config.ptcModelTimeouts).length > 0;
  if (config.ptcTimeoutMs <= 0 && !hasModelTimeouts) return;
  const context = ctx as unknown as {
    ptcRuntime?: PtcRuntimeLike;
    get?: (name: string) => unknown;
  };
  let runtime: PtcRuntimeLike | undefined;
  try {
    runtime = (context.get?.('ptcRuntime') ?? context.ptcRuntime) as PtcRuntimeLike | undefined;
  } catch {
    return;
  }
  if (runtime === undefined || typeof runtime.resolve !== 'function') return;
  const original = runtime.resolve;
  const choose = (request: PtcRunRequestLike): number | undefined => {
    if (request.timeoutMs !== undefined) return undefined;
    let exact: number | undefined;
    if (hasModelTimeouts) {
      const route = routeOf(request.stateOwner);
      if (route !== undefined) exact = config.ptcModelTimeouts[`${route.provider}/${route.model}`];
    }
    const desired = exact ?? config.ptcTimeoutMs;
    if (desired <= 0) return undefined;
    const max = runtime.timeout?.maxMs;
    return max === undefined ? desired : Math.min(desired, max);
  };
  const wrapped = function wrappedResolve(this: PtcRuntimeLike, request: PtcRunRequestLike): PtcRunSpecLike {
    const chosen = choose(request);
    return chosen === undefined ? original.call(this, request) : original.call(this, { ...request, timeoutMs: chosen });
  };
  try {
    runtime.resolve = wrapped;
  } catch {
    return;
  }
  const effect = (ctx as unknown as { effect?: (execute: () => () => void) => void }).effect;
  effect?.(() => () => {
    if (runtime.resolve === wrapped) runtime.resolve = original;
  });
}
