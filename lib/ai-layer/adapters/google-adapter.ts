/**
 * lib/ai-layer/adapters/google-adapter.ts
 *
 * Agentik — AI Layer Foundation — Google Mock Adapter
 * Sprint: AGENTIK-AI-LAYER-FOUNDATION-01
 *
 * MOCK ONLY — no real Google AI SDK calls.
 * Supports: gemini-2.0-flash, gemini-1.5-pro
 */

import type { AIRequest, AIModelId } from "../ai-layer-types";
import type { ProviderAdapter, AdapterResponse, AdapterIdentity } from "./provider-adapter";

// ── Mock response generator ───────────────────────────────────────────────────

function mockGoogleResponse(request: AIRequest, modelId: AIModelId): string {
  if (request.jsonMode) {
    return JSON.stringify({
      result:    "mock_google_json",
      model:     modelId,
      module:    request.callerModule,
      timestamp: new Date().toISOString(),
    });
  }
  return `[MOCK Google ${modelId}] Response to: "${request.userPrompt.slice(0, 60)}..." — caller: ${request.callerModule}`;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

// ── Gemini 2.0 Flash adapter ──────────────────────────────────────────────────

export class Gemini20FlashAdapter implements ProviderAdapter {
  readonly identity: AdapterIdentity = {
    providerId: "google",
    modelId:    "gemini-2.0-flash",
    isMock:     true,
  };

  async execute(request: AIRequest): Promise<AdapterResponse> {
    const start = Date.now();

    try {
      // Flash is fastest: 80-160ms
      await sleep(80 + Math.floor(Math.random() * 80));

      const content      = mockGoogleResponse(request, "gemini-2.0-flash");
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
    return modelId === "gemini-2.0-flash";
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

// ── Gemini 1.5 Pro adapter ─────────────────────────────────────────────────────

export class Gemini15ProAdapter implements ProviderAdapter {
  readonly identity: AdapterIdentity = {
    providerId: "google",
    modelId:    "gemini-1.5-pro",
    isMock:     true,
  };

  async execute(request: AIRequest): Promise<AdapterResponse> {
    const start = Date.now();

    try {
      // Pro is mid-range: 200-400ms
      await sleep(200 + Math.floor(Math.random() * 200));

      const content      = mockGoogleResponse(request, "gemini-1.5-pro");
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
    return modelId === "gemini-1.5-pro";
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
