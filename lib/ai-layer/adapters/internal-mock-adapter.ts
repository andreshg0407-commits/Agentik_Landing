/**
 * lib/ai-layer/adapters/internal-mock-adapter.ts
 *
 * Agentik — AI Layer Foundation — Internal Mock Adapter
 * Sprint: AGENTIK-AI-LAYER-FOUNDATION-01
 *
 * Zero-latency pure mock. Used for unit tests and CI.
 * Supports: mock-text, mock-vision, mock-embedding
 */

import type { AIRequest, AIModelId } from "../ai-layer-types";
import type { ProviderAdapter, AdapterResponse, AdapterIdentity } from "./provider-adapter";

// ── Base mock adapter ─────────────────────────────────────────────────────────

abstract class InternalMockBase implements ProviderAdapter {
  abstract readonly identity: AdapterIdentity;
  abstract supports(modelId: AIModelId): boolean;

  async execute(request: AIRequest): Promise<AdapterResponse> {
    // No sleep — zero latency for tests
    const content = request.jsonMode
      ? JSON.stringify({ result: "mock_internal", model: this.identity.modelId, module: request.callerModule })
      : `[MOCK ${this.identity.modelId}] ${request.userPrompt.slice(0, 80)}`;

    return {
      success:   true,
      content,
      usage: {
        inputTokens:  Math.max(1, Math.ceil(request.userPrompt.length / 4)),
        outputTokens: Math.max(1, Math.ceil(content.length / 4)),
        requestCount: 1,
      },
      durationMs: 0,
      isMock:     true,
    };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

// ── Concrete mock adapters ─────────────────────────────────────────────────────

export class MockTextAdapter extends InternalMockBase {
  readonly identity: AdapterIdentity = {
    providerId: "internal_mock",
    modelId:    "mock-text",
    isMock:     true,
  };

  supports(modelId: AIModelId): boolean {
    return modelId === "mock-text";
  }
}

export class MockVisionAdapter extends InternalMockBase {
  readonly identity: AdapterIdentity = {
    providerId: "internal_mock",
    modelId:    "mock-vision",
    isMock:     true,
  };

  supports(modelId: AIModelId): boolean {
    return modelId === "mock-vision";
  }
}

export class MockEmbeddingAdapter extends InternalMockBase {
  readonly identity: AdapterIdentity = {
    providerId: "internal_mock",
    modelId:    "mock-embedding",
    isMock:     true,
  };

  supports(modelId: AIModelId): boolean {
    return modelId === "mock-embedding";
  }
}
