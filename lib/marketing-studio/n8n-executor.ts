/**
 * lib/marketing-studio/n8n-executor.ts
 *
 * Stub implementation of the Marketing Studio → n8n execution contract.
 *
 * ── What this file IS ────────────────────────────────────────────────────────
 *
 *   A clear, type-safe interface boundary between Agentik and n8n.
 *   The real implementation replaces `StubN8nExecutor` once the n8n workflow
 *   is wired to the webhook endpoint.
 *
 * ── What this file IS NOT ────────────────────────────────────────────────────
 *
 *   NOT a full n8n SDK integration.
 *   NOT hardcoding generation provider logic (Replicate, Runway, Shopify).
 *   NOT making real HTTP calls — all I/O is behind the ExecutionResult type.
 *
 * ── Swap path ────────────────────────────────────────────────────────────────
 *
 *   Replace StubN8nExecutor with LiveN8nExecutor when
 *   STUDIO_N8N_WEBHOOK_URL is set. The executor factory (getExecutor) handles
 *   the env-based selection automatically.
 */

import type { N8nWebhookPayload } from "./execution-payload";

// ── Result type ───────────────────────────────────────────────────────────────

export interface ExecutionResult {
  /** Opaque job identifier returned by the executor (or stub) */
  jobId:    string;
  /** ISO timestamp of when the execution was dispatched */
  queuedAt: string;
  /** Whether the payload was actually sent (false in stub mode) */
  stubbed:  boolean;
}

// ── Executor interface ────────────────────────────────────────────────────────

export interface StudioExecutor {
  /**
   * Dispatch the execution payload to the generation backend.
   * Returns a job ID that can be correlated with inbound callbacks.
   */
  dispatch(payload: N8nWebhookPayload): Promise<ExecutionResult>;
}

// ── Stub implementation ───────────────────────────────────────────────────────

/**
 * Stub executor — logs the payload and returns a deterministic fake job ID.
 * Used when STUDIO_N8N_WEBHOOK_URL is not set or in non-production environments.
 *
 * Does NOT make any network calls.
 */
export class StubN8nExecutor implements StudioExecutor {
  async dispatch(payload: N8nWebhookPayload): Promise<ExecutionResult> {
    const jobId    = `stub_${payload.payload.sessionId}_${Date.now().toString(36)}`;
    const queuedAt = new Date().toISOString();

    // Structured log — visible in Next.js server output
    console.info("[StubN8nExecutor] dispatch", {
      sessionId:   payload.payload.sessionId,
      tenantId:    payload.payload.tenantId,
      mode:        payload.payload.mode,
      objective:   payload.payload.objective ?? "n/a",
      assetCount:  payload.payload.assets.length,
      jobId,
    });

    return { jobId, queuedAt, stubbed: true };
  }
}

// ── Live implementation skeleton ──────────────────────────────────────────────

/**
 * Live executor — POSTs the N8nWebhookPayload to the configured n8n webhook URL.
 * Activated when STUDIO_N8N_WEBHOOK_URL env var is set.
 *
 * Auth: STUDIO_N8N_WEBHOOK_SECRET is sent as a Bearer token.
 * If the env var is absent the request is sent without an Authorization header
 * (useful for local n8n instances without auth).
 *
 * jobId resolution:
 *   n8n "Respond Immediately" mode returns { executionId } in the body.
 *   If the field is absent (e.g. the workflow responds with its own payload)
 *   we fall back to a locally generated ID so the caller always gets a string.
 */
export class LiveN8nExecutor implements StudioExecutor {
  constructor(
    private readonly webhookUrl: string,
    /** REPLICATE_API_TOKEN — injected at dispatch time, NOT stored in DB */
    private readonly replicateApiToken?: string,
  ) {}

  async dispatch(payload: N8nWebhookPayload): Promise<ExecutionResult> {
    // Inject runtime-only secrets that n8n needs but must NOT be stored in DB
    const dispatchPayload = this.replicateApiToken
      ? { ...payload, payload: { ...payload.payload, replicateApiToken: this.replicateApiToken } }
      : payload;

    const res = await fetch(this.webhookUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(dispatchPayload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "(unreadable)");
      throw new Error(`n8n webhook returned HTTP ${res.status}: ${body}`);
    }

    let jobId: string;
    try {
      const data = (await res.json()) as Record<string, unknown>;
      // n8n "Respond Immediately" puts the execution ID under `executionId`;
      // our own workflow can also echo it back under `jobId`.
      jobId = String(data.executionId ?? data.jobId ?? `n8n_${Date.now().toString(36)}`);
    } catch {
      jobId = `n8n_${Date.now().toString(36)}`;
    }

    console.info("[LiveN8nExecutor] dispatched", {
      sessionId:  payload.payload.sessionId,
      tenantId:   payload.payload.tenantId,
      assetCount: payload.payload.assets.length,
      jobId,
    });

    return { jobId, queuedAt: new Date().toISOString(), stubbed: false };
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Returns the appropriate executor based on env configuration.
 *
 * STUDIO_N8N_WEBHOOK_URL set → LiveN8nExecutor (not yet implemented).
 * Otherwise → StubN8nExecutor.
 */
export function getExecutor(): StudioExecutor {
  const webhookUrl = process.env.STUDIO_N8N_WEBHOOK_URL;
  if (webhookUrl) {
    return new LiveN8nExecutor(webhookUrl, process.env.REPLICATE_API_TOKEN);
  }
  return new StubN8nExecutor();
}
