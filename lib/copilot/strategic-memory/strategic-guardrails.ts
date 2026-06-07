// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Strategic Guardrails — enforce safety constraints

import type {
  StrategicMemoryEntry,
  StrategicMemoryRelation,

} from "./strategic-memory-types";
import type { StrategicMemoryInput } from "./strategic-memory-builder";

export type StrategicGuardrailViolation =
  | "NO_EVIDENCE"
  | "CROSS_TENANT_VIOLATION"
  | "SECRET_DETECTED"
  | "CREDENTIAL_DETECTED"
  | "VAULT_REFERENCE_DETECTED"
  | "PII_BYPASS_DETECTED"
  | "ORPHAN_RELATION"
  | "INVALID_CONFIDENCE"
  | "MISSING_RATIONALE"
  | "INVALID_ORG_SLUG";

export interface StrategicGuardrailResult {
  readonly passed: boolean;
  readonly violations: StrategicGuardrailViolation[];
  readonly warnings: string[];
}

// Patterns that indicate forbidden content
const SECRET_PATTERNS = [
  /password\s*[:=]/i,
  /api[_-]?key\s*[:=]/i,
  /token\s*[:=]/i,
  /secret\s*[:=]/i,
  /private[_-]?key/i,
  /bearer\s+[a-zA-Z0-9]/i,
];

const CREDENTIAL_PATTERNS = [
  /username\s*[:=]/i,
  /passwd\s*[:=]/i,
];

const VAULT_PATTERNS = [
  /vault:\/\//i,
  /smem_vault_/i,
];

function containsForbiddenContent(text: string): {
  hasSecret: boolean;
  hasCredential: boolean;
  hasVaultRef: boolean;
} {
  const hasSecret = SECRET_PATTERNS.some((p) => p.test(text));
  const hasCredential = CREDENTIAL_PATTERNS.some((p) => p.test(text));
  const hasVaultRef = VAULT_PATTERNS.some((p) => p.test(text));
  return { hasSecret, hasCredential, hasVaultRef };
}

export function validateStrategicMemoryInput(
  input: StrategicMemoryInput,
  expectedOrgSlug: string
): StrategicGuardrailResult {
  const violations: StrategicGuardrailViolation[] = [];
  const warnings: string[] = [];

  // Org isolation
  if (input.orgSlug !== expectedOrgSlug) {
    violations.push("CROSS_TENANT_VIOLATION");
  }

  // Valid org slug
  if (!input.orgSlug || input.orgSlug.trim() === "") {
    violations.push("INVALID_ORG_SLUG");
  }

  // Rationale required
  if (!input.rationale || input.rationale.trim().length < 5) {
    violations.push("MISSING_RATIONALE");
  }

  // Confidence range
  if (input.confidenceScore !== undefined) {
    if (input.confidenceScore < 0 || input.confidenceScore > 1) {
      violations.push("INVALID_CONFIDENCE");
    }
  }

  // Forbidden content check
  const allText = `${input.title} ${input.description} ${input.rationale}`;
  const forbidden = containsForbiddenContent(allText);
  if (forbidden.hasSecret) violations.push("SECRET_DETECTED");
  if (forbidden.hasCredential) violations.push("CREDENTIAL_DETECTED");
  if (forbidden.hasVaultRef) violations.push("VAULT_REFERENCE_DETECTED");

  // Evidence warning (not a blocker — strategic memory can be created without evidence)
  if (!input.evidenceIds || input.evidenceIds.length === 0) {
    warnings.push("No evidence provided — strategic memory is less credible without evidence");
  }

  return { passed: violations.length === 0, violations, warnings };
}

export function validateStrategicRelation(
  relation: StrategicMemoryRelation,
  orgSlug: string,
  knownIds: Set<string>
): StrategicGuardrailResult {
  const violations: StrategicGuardrailViolation[] = [];
  const warnings: string[] = [];

  if (relation.orgSlug !== orgSlug) {
    violations.push("CROSS_TENANT_VIOLATION");
  }

  if (!knownIds.has(relation.sourceId) || !knownIds.has(relation.targetId)) {
    violations.push("ORPHAN_RELATION");
  }

  return { passed: violations.length === 0, violations, warnings };
}

export function validateCrossTenantIsolation(
  entries: StrategicMemoryEntry[],
  orgSlug: string
): StrategicGuardrailResult {
  const violations: StrategicGuardrailViolation[] = [];
  const warnings: string[] = [];
  const foreign = entries.filter((e) => e.orgSlug !== orgSlug);
  if (foreign.length > 0) {
    violations.push("CROSS_TENANT_VIOLATION");
    warnings.push(`${foreign.length} entries from foreign tenants blocked`);
  }
  return { passed: violations.length === 0, violations, warnings };
}

export function filterTenantEntries(
  entries: StrategicMemoryEntry[],
  orgSlug: string
): StrategicMemoryEntry[] {
  return entries.filter((e) => e.orgSlug === orgSlug);
}

export function filterTenantRelations(
  relations: StrategicMemoryRelation[],
  orgSlug: string
): StrategicMemoryRelation[] {
  return relations.filter((r) => r.orgSlug === orgSlug);
}

export function assertStrategicTenantIsolation(
  orgSlug: string,
  entityOrgSlug: string,
  entityType: string
): void {
  if (orgSlug !== entityOrgSlug) {
    throw new Error(
      `Tenant isolation violation: ${entityType} belongs to "${entityOrgSlug}", not "${orgSlug}"`
    );
  }
}
