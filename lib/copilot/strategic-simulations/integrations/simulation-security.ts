// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 24 — Security Integration

export interface SimulationSecurityContext {
  readonly orgSlug:           string;
  readonly dataClassification: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";
  readonly tenantIsolated:    boolean;
  readonly auditRequired:     boolean;
  readonly encryptionRequired: boolean;
}

export function buildSimulationSecurityContext(orgSlug: string): SimulationSecurityContext {
  return {
    orgSlug,
    dataClassification:  "CONFIDENTIAL",
    tenantIsolated:      true,
    auditRequired:       true,
    encryptionRequired:  false,   // simulation output is non-sensitive by default
  };
}

export function assertSimulationTenantIsolation(
  orgSlug:    string,
  resourceOrgSlug: string,
  resourceType: string
): void {
  if (resourceOrgSlug !== orgSlug) {
    throw new Error(`Security violation: ${resourceType} belongs to "${resourceOrgSlug}", not "${orgSlug}"`);
  }
}

export function sanitizeSimulationOutput<T extends Record<string, unknown>>(output: T): T {
  // Simulations never contain secrets or PII, but we strip internal debug fields
  const sanitized = { ...output };
  delete sanitized["_debug"];
  delete sanitized["_internal"];
  return sanitized as T;
}
