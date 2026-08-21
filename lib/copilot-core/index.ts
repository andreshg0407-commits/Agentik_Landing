/**
 * lib/copilot-core/index.ts
 *
 * Copilot Core Foundation — Client-safe barrel
 * Sprint: COPILOT-CORE-FOUNDATION-01B1
 *
 * Exports only pure types and pure functions.
 * No Prisma, no SDK, no server-only dependencies.
 */

// Types
export type {
  ActorScope,
  PlatformRole,
  MembershipRole,
  CopilotSurface,
  SellerBindingSource,
  SellerBinding,
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
  AuthorityInput,
  ResolvedSellerInput,
  ScopeResolutionWarning,
  ScopeResolutionResult,
} from "./copilot-core-types";

// Authority functions
export { isCertifiedSellerSource } from "./copilot-core-types";

// Envelope
export { validateEnvelope, isValidEnvelope } from "./copilot-core-envelope";

// Capability registry
export { getCapability, listCapabilities, listCapabilitiesByModule } from "./copilot-core-capability-registry";

// Authorization
export { authorizeCopilotCapability } from "./copilot-core-authz";

// Scope resolver
export { resolveCopilotActorScope } from "./copilot-core-scope-resolver";

// Answer contract
export { resolveTruthState, validateAnswer } from "./copilot-core-answer";
export type { AnswerValidationResult } from "./copilot-core-answer";

// Intent resolver (pure)
export { resolveIntent } from "./copilot-core-intent-resolver";
export type { IntentResult } from "./copilot-core-intent-resolver";

// Mock responder (pure)
export { buildMockCopilotResponse } from "./copilot-core-mock-responder";

// Report generator (pure)
export {
  generateReport,
  isValidReportType,
  isValidReportFormat,
  reportTypeToCapabilityId,
} from "./copilot-core-report-generator";
export type { ReportType, ReportFormat, ReportOutput } from "./copilot-core-report-generator";

// Task contract (pure types only — zero integration)
export type { CopilotTaskSuggestion } from "./copilot-core-task-contract";
