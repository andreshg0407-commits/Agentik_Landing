/**
 * lib/ai-layer/adapters/anthropic-adapter.ts
 *
 * Agentik — AI Layer Foundation — Anthropic Mock Adapter
 * Sprint: AGENTIK-AI-LAYER-FOUNDATION-01
 *
 * MOCK ONLY — no real Anthropic SDK calls.
 * Supports: claude-sonnet-4-6, claude-opus-4-6
 */

import type { AIRequest, AIModelId } from "../ai-layer-types";
import type { ProviderAdapter, AdapterResponse, AdapterIdentity } from "./provider-adapter";

// ── Mock response generator ───────────────────────────────────────────────────

function mockAnthropicResponse(request: AIRequest, modelId: AIModelId): string {
  if (request.jsonMode) {
    return JSON.stringify({
      result:    "mock_anthropic_json",
      model:     modelId,
      module:    request.callerModule,
      timestamp: new Date().toISOString(),
    });
  }
  return `[MOCK Anthropic ${modelId}] Response to: "${request.userPrompt.slice(0, 60)}..." — caller: ${request.callerModule}`;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

// ── Claude Sonnet 4.6 adapter ─────────────────────────────────────────────────

export class ClaudeSonnet46Adapter implements ProviderAdapter {
  readonly identity: AdapterIdentity = {
    providerId: "anthropic",
    modelId:    "claude-sonnet-4-6",
    isMock:     true,
  };

  async execute(request: AIRequest): Promise<AdapterResponse> {
    const start = Date.now();

    try {
      await sleep(250 + Math.floor(Math.random() * 200));

      const content      = mockAnthropicResponse(request, "claude-sonnet-4-6");
      const inputTokens  = estimateTokens((request.systemPrompt ?? "") + request.userPrompt);
      const outputTokens = estimateTokens(content);

      return {
        success:   true,
        content,
        usage: {
          inputTokens,
          outputTokens,
          requestCount: 1,
        },
        durationMs: Date.now() - start,
        isMock:     true,
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
    return modelId === "claude-sonnet-4-6";
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

// ── Claude Opus 4.6 adapter ───────────────────────────────────────────────────

export class ClaudeOpus46Adapter implements ProviderAdapter {
  readonly identity: AdapterIdentity = {
    providerId: "anthropic",
    modelId:    "claude-opus-4-6",
    isMock:     true,
  };

  async execute(request: AIRequest): Promise<AdapterResponse> {
    const start = Date.now();

    try {
      // Opus is slower: 400-700ms
      await sleep(400 + Math.floor(Math.random() * 300));

      const content      = mockAnthropicResponse(request, "claude-opus-4-6");
      const inputTokens  = estimateTokens((request.systemPrompt ?? "") + request.userPrompt);
      const outputTokens = estimateTokens(content);

      return {
        success:   true,
        content,
        usage: {
          inputTokens,
          outputTokens,
          requestCount: 1,
        },
        durationMs: Date.now() - start,
        isMock:     true,
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
    return modelId === "claude-opus-4-6";
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
