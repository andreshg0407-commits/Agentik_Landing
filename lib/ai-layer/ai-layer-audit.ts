/**
 * lib/ai-layer/ai-layer-audit.ts
 *
 * Agentik — AI Layer Foundation — Audit Utilities
 * Sprint: AGENTIK-AI-LAYER-FOUNDATION-01
 *
 * Pure domain. No Prisma. No React. No server-only. Client-safe.
 *
 * Creates structured audit events for all AI Layer calls.
 * Never throws.
 */

import type { AIRequest, AIResponse, AIExecutionMetadata, AIProviderId, AIModelId } from "./ai-layer-types";

// ── Audit event types ─────────────────────────────────────────────────────────

export type AILayerAuditEventType =
  | "REQUEST_RECEIVED"
  | "ROUTING_RESOLVED"
  | "ADAPTER_CALLED"
  | "ADAPTER_SUCCEEDED"
  | "ADAPTER_FAILED"
  | "BILLING_RECORDED"
  | "BILLING_FAILED"
  | "REQUEST_SUCCEEDED"
  | "REQUEST_FAILED"
  | "ROUTING_FALLBACK";

// ── Audit event ───────────────────────────────────────────────────────────────

export interface AILayerAuditEvent {
  eventType:      AILayerAuditEventType;
  callerModule:   string;
  orgSlug:        string;
  requestId:      string;
  providerId?:    AIProviderId;
  modelId?:       AIModelId;
  creditsCharged?: number;
  durationMs?:    number;
  isMock?:        boolean;
  message:        string;
  metadata?:      Record<string, unknown>;
  timestamp:      string;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createAILayerAuditEvent(
  eventType: AILayerAuditEventType,
  params: {
    callerModule:   string;
    orgSlug:        string;
    requestId:      string;
    providerId?:    AIProviderId;
    modelId?:       AIModelId;
    creditsCharged?: number;
    durationMs?:    number;
    isMock?:        boolean;
    message:        string;
    metadata?:      Record<string, unknown>;
  },
): AILayerAuditEvent {
  return {
    eventType,
    ...params,
    timestamp: new Date().toISOString(),
  };
}

// ── Request audit ─────────────────────────────────────────────────────────────

export function auditRequestReceived(request: AIRequest, requestId: string): AILayerAuditEvent {
  return createAILayerAuditEvent("REQUEST_RECEIVED", {
    callerModule: request.callerModule,
    orgSlug:      request.orgSlug,
    requestId,
    message:      `AI request received from ${request.callerModule} (capabilities: ${request.requiredCapabilities.join(", ")}).`,
    metadata: {
      requiredCapabilities: request.requiredCapabilities,
      routingStrategy:      request.routingStrategy,
      preferredModelId:     request.preferredModelId,
      preferredProviderId:  request.preferredProviderId,
    },
  });
}

export function auditRoutingResolved(
  requestId:      string,
  request:        AIRequest,
  providerId:     AIProviderId,
  modelId:        AIModelId,
  reason:         string,
  estimatedCredits: number,
): AILayerAuditEvent {
  return createAILayerAuditEvent("ROUTING_RESOLVED", {
    callerModule:    request.callerModule,
    orgSlug:         request.orgSlug,
    requestId,
    providerId,
    modelId,
    creditsCharged:  estimatedCredits,
    message:         `Routing resolved → ${modelId} via ${providerId}. ${reason}`,
  });
}

export function auditAdapterSucceeded(
  requestId:  string,
  request:    AIRequest,
  meta:       AIExecutionMetadata,
): AILayerAuditEvent {
  return createAILayerAuditEvent("ADAPTER_SUCCEEDED", {
    callerModule:    request.callerModule,
    orgSlug:         request.orgSlug,
    requestId,
    providerId:      meta.providerId,
    modelId:         meta.modelId,
    creditsCharged:  meta.creditsCharged,
    durationMs:      meta.durationMs,
    isMock:          meta.isMock,
    message:         `Adapter succeeded in ${meta.durationMs}ms. Mock=${meta.isMock}. Credits=${meta.creditsCharged}.`,
  });
}

export function auditAdapterCalled(
  requestId:  string,
  request:    AIRequest,
  providerId: AIProviderId,
  modelId:    AIModelId,
): AILayerAuditEvent {
  return createAILayerAuditEvent("ADAPTER_CALLED", {
    callerModule: request.callerModule,
    orgSlug:      request.orgSlug,
    requestId,
    providerId,
    modelId,
    message:      `Adapter called: ${modelId} via ${providerId}.`,
  });
}

export function auditAdapterFailed(
  requestId: string,
  request:   AIRequest,
  error:     string,
  providerId?: AIProviderId,
  modelId?:    AIModelId,
): AILayerAuditEvent {
  return createAILayerAuditEvent("ADAPTER_FAILED", {
    callerModule: request.callerModule,
    orgSlug:      request.orgSlug,
    requestId,
    providerId,
    modelId,
    message:      `Adapter failed: ${error}`,
  });
}

export function auditBillingRecorded(
  requestId:  string,
  request:    AIRequest,
  credits:    number,
  modelId:    AIModelId,
): AILayerAuditEvent {
  return createAILayerAuditEvent("BILLING_RECORDED", {
    callerModule:   request.callerModule,
    orgSlug:        request.orgSlug,
    requestId,
    modelId,
    creditsCharged: credits,
    message:        `Billing recorded: ${credits} credits for model ${modelId}.`,
  });
}

export function auditRequestSucceeded(
  requestId:  string,
  request:    AIRequest,
  meta:       AIExecutionMetadata,
): AILayerAuditEvent {
  return createAILayerAuditEvent("REQUEST_SUCCEEDED", {
    callerModule:    request.callerModule,
    orgSlug:         request.orgSlug,
    requestId,
    providerId:      meta.providerId,
    modelId:         meta.modelId,
    creditsCharged:  meta.creditsCharged,
    durationMs:      meta.durationMs,
    isMock:          meta.isMock,
    message:         `Request succeeded. Model=${meta.modelId}. Credits=${meta.creditsCharged}. Duration=${meta.durationMs}ms.`,
  });
}

export function auditRequestFailed(
  requestId: string,
  request:   AIRequest,
  error:     string,
): AILayerAuditEvent {
  return createAILayerAuditEvent("REQUEST_FAILED", {
    callerModule: request.callerModule,
    orgSlug:      request.orgSlug,
    requestId,
    message:      `Request failed: ${error}`,
  });
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface AIRequestValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateAIRequest(request: AIRequest): AIRequestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!request.callerModule || request.callerModule.trim() === "") {
    errors.push("callerModule must not be empty.");
  }

  if (!request.orgSlug || request.orgSlug.trim() === "") {
    errors.push("orgSlug must not be empty.");
  }

  if (!request.userPrompt || request.userPrompt.trim() === "") {
    errors.push("userPrompt must not be empty.");
  }

  if (!request.requiredCapabilities || request.requiredCapabilities.length === 0) {
    errors.push("requiredCapabilities must not be empty.");
  }

  if (request.temperature !== undefined && (request.temperature < 0 || request.temperature > 1)) {
    errors.push("temperature must be between 0 and 1.");
  }

  if (request.maxOutputTokens !== undefined && request.maxOutputTokens < 1) {
    errors.push("maxOutputTokens must be >= 1.");
  }

  return { valid: errors.length === 0, errors, warnings };
}
