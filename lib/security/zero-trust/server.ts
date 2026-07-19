/**
 * lib/security/zero-trust/server.ts
 *
 * AGENTIK-SECURITY-ZERO-TRUST-01
 * Zero Trust Server Barrel — Server-Only Exports
 *
 * IMPORTANT: This file must only be imported in server components,
 * API routes, Server Actions, and lib/ files marked `import "server-only"`.
 * Never import in client components or pages without explicit server guard.
 */

import "server-only";

// ── Core Policy Engine ────────────────────────────────────────────────────────
export {
  evaluateZeroTrust,
  isZeroTrustAllowed,
  assertZeroTrust,
} from "./zero-trust-policy-engine";

// ── Agent Security ────────────────────────────────────────────────────────────
export {
  canAgentAccess,
  validateAgentScope,
  evaluateAgentTrust,
  getAgentDomain,
  KNOWN_AGENT_IDS,
} from "./agent-security";

export type { AgentDomain } from "./agent-security";

// ── Integration Security ──────────────────────────────────────────────────────
export {
  validateIntegrationAccess,
  evaluateIntegrationTrust,
  denyCompromisedIntegration,
  getIntegrationScope,
  KNOWN_INTEGRATION_IDS,
} from "./integration-security";

export type {
  IntegrationScope,
  IntegrationAccessRequest,
} from "./integration-security";

// ── Executive Brain Security ──────────────────────────────────────────────────
export {
  validateExecutiveBrainAccess,
  canAgentReadExecutiveBrain,
  canAgentWriteMemory,
} from "./executive-brain-security";

export type {
  ExecutiveBrainAccessRequest,
  ExecutiveBrainAccessResult,
} from "./executive-brain-security";

// ── Copilot Security ──────────────────────────────────────────────────────────
export {
  canAccessCopilot,
  canDelegateTask,
  canReadMemory,
  canWriteMemory,
  canExecuteAgent,
} from "./copilot-security";

export type {
  CopilotAccessRequest,
  CopilotAccessResult,
  DelegationRequest,
  DelegationResult,
} from "./copilot-security";

// ── Vault Security ────────────────────────────────────────────────────────────
export {
  validateVaultAccess,
  canRotateSecret,
  canManageEncryptionKey,
} from "./vault-security";

export type {
  VaultAccessRequest,
  VaultAccessResult,
} from "./vault-security";

// ── Security Audit Bridge ─────────────────────────────────────────────────────
export {
  buildZeroTrustAuditRecord,
  buildSecurityEventAuditRecord,
  shouldAuditEvaluation,
  shouldAuditSecurityEvent,
} from "./security-audit";

export type { ZeroTrustAuditRecord } from "./security-audit";
