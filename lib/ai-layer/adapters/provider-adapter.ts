/**
 * lib/ai-layer/adapters/provider-adapter.ts
 *
 * Agentik — AI Layer Foundation — Provider Adapter Contract
 * Sprint: AGENTIK-AI-LAYER-FOUNDATION-01
 *
 * Pure domain. No Prisma. No React. No server-only. Client-safe.
 *
 * All provider adapters (real or mock) must implement ProviderAdapter.
 * The AI Layer service depends on this interface, never on concrete adapters.
 */

import type {
  AIRequest,
  AIResponse,
  AIUsage,
  AIModelId,
  AIProviderId,
} from "../ai-layer-types";

// ── Adapter response ──────────────────────────────────────────────────────────

export interface AdapterResponse {
  /** Whether the adapter call succeeded. */
  success: boolean;

  /** Raw text output from the provider. */
  content?: string;

  /** Usage statistics reported by the provider. */
  usage: AIUsage;

  /** Wall-clock duration of the adapter call in ms. */
  durationMs: number;

  /** Provider-native error if success=false. */
  error?: string;

  /** Whether this was a mock response (no real provider call). */
  isMock: boolean;

  /** Non-fatal warnings from the adapter. */
  warnings?: string[];
}

// ── Adapter identity ──────────────────────────────────────────────────────────

export interface AdapterIdentity {
  providerId: AIProviderId;
  modelId:    AIModelId;
  isMock:     boolean;
}

// ── Provider adapter interface ────────────────────────────────────────────────

/**
 * The contract every provider adapter must implement.
 * Adapters are stateless — no shared mutable state.
 * All adapters return AdapterResponse — never throw.
 */
export interface ProviderAdapter {
  /**
   * Adapter identity for routing and audit.
   */
  readonly identity: AdapterIdentity;

  /**
   * Execute the AI request.
   * Must never throw — catch all errors and return success=false.
   */
  execute(request: AIRequest): Promise<AdapterResponse>;

  /**
   * Returns true if this adapter can handle the given model ID.
   */
  supports(modelId: AIModelId): boolean;

  /**
   * Health check. Returns true if the adapter is operational.
   * For mocks, always returns true.
   */
  healthCheck(): Promise<boolean>;
}

// ── Adapter registry interface ────────────────────────────────────────────────

/**
 * Registry of all available adapters keyed by model ID.
 */
export interface AdapterRegistry {
  get(modelId: AIModelId): ProviderAdapter | undefined;
  getAll(): ProviderAdapter[];
  register(adapter: ProviderAdapter): void;
}

// ── Default adapter registry ──────────────────────────────────────────────────

class DefaultAdapterRegistry implements AdapterRegistry {
  private readonly _adapters = new Map<string, ProviderAdapter>();

  get(modelId: AIModelId): ProviderAdapter | undefined {
    return this._adapters.get(modelId);
  }

  getAll(): ProviderAdapter[] {
    return Array.from(this._adapters.values());
  }

  register(adapter: ProviderAdapter): void {
    for (const modelId of this._getSupportedModels(adapter)) {
      this._adapters.set(modelId, adapter);
    }
  }

  private _getSupportedModels(adapter: ProviderAdapter): string[] {
    // The adapter knows its own modelId; adapters that handle multiple models
    // register themselves multiple times.
    return [adapter.identity.modelId];
  }
}

export function createAdapterRegistry(): AdapterRegistry {
  return new DefaultAdapterRegistry();
}
