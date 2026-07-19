/**
 * lib/ai-layer/adapters/openai-adapter.ts
 *
 * Agentik — AI Layer Foundation — OpenAI Mock Adapter
 * Sprint: AGENTIK-AI-LAYER-FOUNDATION-01
 *
 * MOCK ONLY — no real OpenAI SDK calls.
 * Simulates realistic usage statistics and latency.
 * Supports: gpt-4.5, gpt-4o-mini
 */

import type { AIRequest, AIModelId } from "../ai-layer-types";
import type { ProviderAdapter, AdapterResponse, AdapterIdentity } from "./provider-adapter";

// ── Mock response generator ───────────────────────────────────────────────────

function mockOpenAIResponse(request: AIRequest, modelId: AIModelId): string {
  if (request.jsonMode) {
    return JSON.stringify({
      result:    "mock_openai_json",
      model:     modelId,
      module:    request.callerModule,
      timestamp: new Date().toISOString(),
    });
  }
  return `[MOCK OpenAI ${modelId}] Response to: "${request.userPrompt.slice(0, 60)}..." — caller: ${request.callerModule}`;
}

function estimateTokens(text: string): number {
  // Rough approximation: 1 token ≈ 4 chars
  return Math.max(1, Math.ceil(text.length / 4));
}

// ── GPT-4.5 adapter ───────────────────────────────────────────────────────────

export class Gpt45Adapter implements ProviderAdapter {
  readonly identity: AdapterIdentity = {
    providerId: "openai",
    modelId:    "gpt-4.5",
    isMock:     true,
  };

  async execute(request: AIRequest): Promise<AdapterResponse> {
    const start = Date.now();

    try {
      // Simulate latency: 300-600ms
      await sleep(300 + Math.floor(Math.random() * 300));

      const content      = mockOpenAIResponse(request, "gpt-4.5");
      const inputTokens  = estimateTokens((request.systemPrompt ?? "") + request.userPrompt);
      const outputTokens = estimateTokens(content);
      const durationMs   = Date.now() - start;

      return {
        success:   true,
        content,
        usage: {
          inputTokens,
          outputTokens,
          requestCount: 1,
        },
        durationMs,
        isMock: true,
      };
    } catch (err) {
      return {
        success:   false,
        usage:     { inputTokens: 0, outputTokens: 0, requestCount: 1 },
        durationMs: Date.now() - start,
        isMock:    true,
        error:     err instanceof Error ? err.message : "Unknown adapter error",
      };
    }
  }

  supports(modelId: AIModelId): boolean {
    return modelId === "gpt-4.5";
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

// ── GPT-4o Mini adapter ────────────────────────────────────────────────────────

export class Gpt4oMiniAdapter implements ProviderAdapter {
  readonly identity: AdapterIdentity = {
    providerId: "openai",
    modelId:    "gpt-4o-mini",
    isMock:     true,
  };

  async execute(request: AIRequest): Promise<AdapterResponse> {
    const start = Date.now();

    try {
      // Faster than gpt-4.5: 100-200ms
      await sleep(100 + Math.floor(Math.random() * 100));

      const content      = mockOpenAIResponse(request, "gpt-4o-mini");
      const inputTokens  = estimateTokens((request.systemPrompt ?? "") + request.userPrompt);
      const outputTokens = estimateTokens(content);
      const durationMs   = Date.now() - start;

      return {
        success:   true,
        content,
        usage: {
          inputTokens,
          outputTokens,
          requestCount: 1,
        },
        durationMs,
        isMock: true,
      };
    } catch (err) {
      return {
        success:   false,
        usage:     { inputTokens: 0, outputTokens: 0, requestCount: 1 },
        durationMs: Date.now() - start,
        isMock:    true,
        error:     err instanceof Error ? err.message : "Unknown adapter error",
      };
    }
  }

  supports(modelId: AIModelId): boolean {
    return modelId === "gpt-4o-mini";
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
