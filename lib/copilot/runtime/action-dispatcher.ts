/**
 * lib/copilot/runtime/action-dispatcher.ts
 *
 * AGENTIK-ACTION-RUNTIME-01 — Domain-agnostic action dispatcher.
 * SERVER ONLY — no React imports, no Shopify-specific dependencies.
 * @server-only
 *
 * Design principles:
 *   - The dispatcher knows NOTHING about Shopify, Finance, or any domain.
 *   - Domain handlers are registered at startup via ActionRegistryProvider.
 *   - This file is a pure routing layer — no business logic lives here.
 *   - Fail-closed: unknown actions return a structured error, never throw.
 *
 * To add a new domain:
 *   1. Implement ActionHandler<TContext> for your domain actions.
 *   2. Implement ActionRegistryProvider to expose your handlers.
 *   3. Register the provider with dispatcher.registerProvider(provider).
 *
 * Dependency direction (must never be violated):
 *   runtime-types ← action-dispatcher ← action-runtime
 */
import "server-only";

import type {
  ExecutionContext,
  RuntimeStepSpec,
} from "./runtime-types";

// ── Action handler contracts ───────────────────────────────────────────────────

/**
 * Structured result from an action handler.
 * `data` is opaque to the runtime — only the domain handler knows its shape.
 */
export interface ActionHandlerResult {
  /** Whether the action completed without error */
  success:   boolean;
  /** Opaque domain-specific output (serializable) */
  data?:     unknown;
  /** Human-readable error if success === false */
  error?:    string;
  /** Non-fatal warnings (e.g. partial results, degraded state) */
  warnings:  string[];
  /** Optional audit note for the execution log */
  auditNote?: string;
}

/**
 * A single executable action.
 *
 * `TContext` is the domain-specific execution context (e.g. ShopifyContext).
 * The runtime passes it alongside the execution context — domains define the shape.
 *
 * The handler MUST:
 *   - Never throw unhandled exceptions (catch and return { success: false, error })
 *   - Never mutate `spec` or `ctx`
 *   - Be idempotent where possible (future: retry support)
 *   - Complete within a reasonable wall-clock time
 */
export type ActionHandler<TContext = unknown> = (
  spec:          RuntimeStepSpec,
  ctx:           ExecutionContext,
  domainContext: TContext,
) => Promise<ActionHandlerResult>;

/**
 * Lightweight metadata for a registered action.
 */
export interface ActionDefinition<TContext = unknown> {
  /** Fully-qualified action ID: "{namespace}.{functionName}" */
  actionId:           string;
  /** Domain that owns this action */
  domain:             string;
  /** Human-readable display name */
  displayName:        string;
  /** Whether human approval is required before execution */
  requiresApproval:   boolean;
  /** Whether safe for scheduled / autonomous pipelines */
  automationEligible: boolean;
  /** The executable handler */
  handler:            ActionHandler<TContext>;
}

// ── Registry provider interface ────────────────────────────────────────────────

/**
 * Abstract interface for domain action registries.
 *
 * Each domain (Shopify, Finance, Commercial, …) implements this interface
 * to expose its actions to the dispatcher. The dispatcher never imports
 * domain-specific code directly.
 *
 * `TContext` — the domain-specific context the provider requires.
 * The dispatcher passes it through unchanged to each handler.
 */
export interface ActionRegistryProvider<TContext = unknown> {
  /** Domain identifier — must match RuntimeStepSpec.domain */
  readonly domain: string;

  /**
   * Return a list of all action definitions this provider exposes.
   * Called once at registration time.
   */
  getActions(): ActionDefinition<TContext>[];

  /**
   * Resolve the domain-specific context from the execution context.
   * Called once per execution plan before steps are dispatched.
   *
   * Returns null if the context cannot be resolved (e.g. missing credentials).
   * A null result causes all steps for this domain to be blocked.
   */
  resolveContext(ctx: ExecutionContext): Promise<TContext | null>;
}

// ── Dispatch result ────────────────────────────────────────────────────────────

export type DispatchOutcome =
  | { kind: "success";      result:  ActionHandlerResult }
  | { kind: "not_found";    actionId: string; domain: string }
  | { kind: "context_error"; domain: string; reason: string }
  | { kind: "handler_error"; actionId: string; error: string };

// ── Dispatcher ────────────────────────────────────────────────────────────────

/**
 * Central action dispatcher.
 *
 * Responsibilities:
 *   - Maintain a flat map of actionId → ActionDefinition
 *   - Resolve domain context once per execution (cached per dispatch call)
 *   - Route step specs to the correct handler
 *   - Catch all handler errors and return structured DispatchOutcome
 *
 * Usage:
 *   const dispatcher = new ActionDispatcher();
 *   dispatcher.registerProvider(shopifyProvider);
 *   dispatcher.registerProvider(financeProvider);
 *
 *   const outcome = await dispatcher.dispatch(stepSpec, ctx);
 */
export class ActionDispatcher {
  /** Flat map: actionId → definition */
  private readonly actions = new Map<string, ActionDefinition<unknown>>();

  /** Providers by domain — for context resolution */
  private readonly providers = new Map<string, ActionRegistryProvider<unknown>>();

  /** Per-execution domain context cache (keyed by domain) */
  private contextCache = new Map<string, unknown | null>();

  // ── Registration ────────────────────────────────────────────────────────────

  /**
   * Register a domain provider and index all its actions.
   *
   * Duplicate actionId registrations are rejected with a warning — the first
   * registration wins. This protects against accidental double-registration.
   */
  registerProvider(provider: ActionRegistryProvider<unknown>): void {
    if (this.providers.has(provider.domain)) {
      console.warn(
        `[ActionDispatcher] Domain "${provider.domain}" already registered — skipping duplicate.`,
      );
      return;
    }

    this.providers.set(provider.domain, provider);

    for (const action of provider.getActions()) {
      if (this.actions.has(action.actionId)) {
        console.warn(
          `[ActionDispatcher] Action "${action.actionId}" already registered — skipping duplicate.`,
        );
        continue;
      }
      this.actions.set(action.actionId, action as ActionDefinition<unknown>);
    }
  }

  // ── Lookup ──────────────────────────────────────────────────────────────────

  /**
   * Find an action definition by actionId. Returns undefined if not found.
   */
  findAction(actionId: string): ActionDefinition<unknown> | undefined {
    return this.actions.get(actionId);
  }

  /**
   * List all registered domains.
   */
  listDomains(): string[] {
    return [...this.providers.keys()];
  }

  /**
   * List all registered actions (metadata only, no handlers).
   */
  listActions(): Omit<ActionDefinition<unknown>, "handler">[] {
    return [...this.actions.values()].map(({ handler: _h, ...rest }) => rest);
  }

  // ── Context resolution ──────────────────────────────────────────────────────

  /**
   * Resolve the domain context for the given execution.
   * Results are cached within this dispatcher instance (one cache per execution).
   *
   * Call `clearContextCache()` between executions to avoid stale contexts.
   */
  async resolveDomainContext(
    domain: string,
    ctx:    ExecutionContext,
  ): Promise<unknown | null> {
    if (this.contextCache.has(domain)) {
      return this.contextCache.get(domain) ?? null;
    }

    const provider = this.providers.get(domain);
    if (!provider) {
      this.contextCache.set(domain, null);
      return null;
    }

    const resolved = await provider.resolveContext(ctx);
    this.contextCache.set(domain, resolved);
    return resolved;
  }

  /**
   * Clear the domain context cache.
   * MUST be called between separate execution plan runs.
   */
  clearContextCache(): void {
    this.contextCache = new Map();
  }

  // ── Dispatch ────────────────────────────────────────────────────────────────

  /**
   * Dispatch a single step to its registered handler.
   *
   * Order of operations:
   *   1. Look up the action definition
   *   2. Resolve domain context (cached)
   *   3. Invoke the handler
   *   4. Catch any unhandled exception and return handler_error
   *
   * This method NEVER throws. All failure paths return a typed DispatchOutcome.
   */
  async dispatch(
    spec: RuntimeStepSpec,
    ctx:  ExecutionContext,
  ): Promise<DispatchOutcome> {
    // ── Step 1: Lookup ──────────────────────────────────────────────────────
    const action = this.actions.get(spec.actionId);

    if (!action) {
      return {
        kind:     "not_found",
        actionId: spec.actionId,
        domain:   spec.domain,
      };
    }

    // ── Step 2: Domain context ──────────────────────────────────────────────
    const domainContext = await this.resolveDomainContext(spec.domain, ctx);

    if (domainContext === null) {
      return {
        kind:   "context_error",
        domain: spec.domain,
        reason: `Domain context could not be resolved for "${spec.domain}". ` +
                `Check credentials and tenant configuration.`,
      };
    }

    // ── Step 3: Handler invocation ──────────────────────────────────────────
    try {
      const result = await action.handler(spec, ctx, domainContext);
      return { kind: "success", result };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        kind:     "handler_error",
        actionId: spec.actionId,
        error:    `Unhandled exception in handler for "${spec.actionId}": ${message}`,
      };
    }
  }
}
