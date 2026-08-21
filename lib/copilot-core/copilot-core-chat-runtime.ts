/**
 * lib/copilot-core/copilot-core-chat-runtime.ts
 *
 * Copilot Core — Stateless Chat Runtime
 * Sprint: COPILOT-CONVERSATIONAL-RUNTIME-01C
 *
 * SERVER-ONLY. Orchestrates: intent → authorize → fetch → mock response.
 *
 * STATELESS: No Conversation CRUD, no message persistence,
 * no AI SDK, no fetch, no external calls.
 * Each request is independent.
 */

import "server-only";

import { resolveIntent } from "./copilot-core-intent-resolver";
import { executeCopilotCapability } from "./copilot-core-gateway";
import { buildMockCopilotResponse } from "./copilot-core-mock-responder";
import type { CopilotEnvelope, CopilotAnswer } from "./copilot-core-types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CopilotChatResponse {
  readonly answer: CopilotAnswer;
  readonly requestId: string;
}

// ── Runtime ──────────────────────────────────────────────────────────────────

/**
 * Handle a single copilot message.
 * Stateless — no conversation persistence, no session state.
 */
export async function handleCopilotMessage(params: {
  envelope: CopilotEnvelope;
  userMessage: string;
}): Promise<CopilotChatResponse> {
  const { envelope, userMessage } = params;

  // Step 1: Resolve intent
  const intent = resolveIntent(userMessage);

  // Step 2: Handle unsupported intent
  if (intent.kind === "unsupported") {
    return {
      requestId: envelope.requestId,
      answer: buildMockCopilotResponse(
        null,
        "unsupported",
        "DATA_UNVERIFIED",
        [],
        envelope.organizationId,
        envelope.requestId,
      ),
    };
  }

  // Step 3: Handle ambiguous intent
  if (intent.kind === "ambiguous") {
    const candidateNames = intent.candidates
      .map((c) => c.replace("commercial.", "").replace(".read", ""))
      .join(", ");

    return {
      requestId: envelope.requestId,
      answer: {
        answerId: crypto.randomUUID(),
        text: `Tu consulta podría referirse a: ${candidateNames}. ¿Podrías ser más específico?`,
        truthState: "DATA_UNVERIFIED",
        asOf: new Date().toISOString(),
        facts: [],
        warnings: [],
        capabilityId: "clarification",
        organizationId: envelope.organizationId,
        requestId: envelope.requestId,
      },
    };
  }

  // Step 4: Execute capability
  const result = await executeCopilotCapability({
    envelope,
    capabilityId: intent.capabilityId,
    validatedArguments: {},
  });

  // Step 5: Handle denial
  if (!result.allowed) {
    return {
      requestId: envelope.requestId,
      answer: {
        answerId: crypto.randomUUID(),
        text: "No tienes permisos para acceder a esta información.",
        truthState: "DATA_UNVERIFIED",
        asOf: new Date().toISOString(),
        facts: [],
        warnings: [],
        capabilityId: intent.capabilityId,
        organizationId: envelope.organizationId,
        requestId: envelope.requestId,
      },
    };
  }

  // Step 6: Build mock response from adapter data
  if (result.answer) {
    const mockAnswer = buildMockCopilotResponse(
      result.data,
      intent.capabilityId,
      result.answer.truthState,
      result.answer.facts,
      envelope.organizationId,
      envelope.requestId,
    );
    return { requestId: envelope.requestId, answer: mockAnswer };
  }

  // Fallback
  return {
    requestId: envelope.requestId,
    answer: buildMockCopilotResponse(
      null,
      intent.capabilityId,
      "DATA_UNVERIFIED",
      [],
      envelope.organizationId,
      envelope.requestId,
    ),
  };
}
