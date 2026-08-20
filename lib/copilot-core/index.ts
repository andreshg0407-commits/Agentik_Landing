/**
 * lib/copilot-core/index.ts
 *
 * Copilot Core Foundation — Client-safe barrel
 * Sprint: COPILOT-CORE-FOUNDATION-01A
 *
 * Exports only pure types and pure functions.
 * No Prisma, no SDK, no server-only dependencies.
 */

// Types
export type {
  ActorScope,
  PlatformRole,
  OrganizationRole,
  CopilotSurface,
  CopilotEnvelope,
  ResourceScope,
  EnvelopeValidationResult,
  RiskClass,
  TruthRequirement,
  CopilotCapability,
  DenialReason,
  AuthorizationResult,
  TruthState,
  FactRef,
  CopilotWarningCode,
  CopilotWarning,
  CopilotAnswer,
} from "./copilot-core-types";

// Envelope
export { validateEnvelope, isValidEnvelope } from "./copilot-core-envelope";

// Capability registry
export { getCapability, listCapabilities, listCapabilitiesByModule } from "./copilot-core-capability-registry";

// Authorization
export { authorizeCopilotCapability } from "./copilot-core-authz";

// Answer contract
export { resolveTruthState, validateAnswer } from "./copilot-core-answer";
export type { AnswerValidationResult } from "./copilot-core-answer";
