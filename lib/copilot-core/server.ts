/**
 * lib/copilot-core/server.ts
 *
 * Copilot Core — Server-Only Barrel
 * Sprint: COPILOT-CONVERSATIONAL-RUNTIME-01C
 *
 * SERVER-ONLY. Exports all server-side copilot-core modules.
 * Import this barrel from server components and API routes only.
 */

import "server-only";

export { buildCopilotEnvelope } from "./copilot-core-envelope-builder";
export { executeCopilotCapability } from "./copilot-core-gateway";
export { handleCopilotMessage } from "./copilot-core-chat-runtime";
export { checkRateLimit } from "./copilot-core-rate-limiter";
export type { CopilotChatResponse } from "./copilot-core-chat-runtime";
export type { CopilotCapabilityResult, CopilotAdapter, CopilotAdapterContext, CopilotAdapterResult } from "./copilot-core-gateway";
export type { RateLimitResult } from "./copilot-core-rate-limiter";
