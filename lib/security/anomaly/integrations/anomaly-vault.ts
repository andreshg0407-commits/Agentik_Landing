/**
 * lib/security/anomaly/integrations/anomaly-vault.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * Anomaly ← Vault Integration
 *
 * Server-only. Consumes Vault access events for anomaly detection.
 * Never logs secret values.
 */

import "server-only";

import type { AnomalyContext } from "../anomaly-types";

// ── Vault Event Input ─────────────────────────────────────────────────────────

export interface VaultAnomalyEventInput {
  orgSlug:     string;
  userId?:     string;
  agentId?:    string;
  sessionId?:  string;
  operation:   "READ" | "WRITE" | "DELETE" | "LIST" | "ROTATE";
  secretAlias: string;   // alias only — never the secret value
  success:     boolean;
  timestamp?:  string;
}

// ── vaultEventToAnomalyContext ────────────────────────────────────────────────

/**
 * vaultEventToAnomalyContext — convert a Vault operation event to AnomalyContext.
 * NEVER includes secret values, only aliases and operation metadata.
 */
export function vaultEventToAnomalyContext(input: VaultAnomalyEventInput): AnomalyContext {
  return {
    orgSlug:    input.orgSlug,
    userId:     input.userId,
    agentId:    input.agentId,
    sessionId:  input.sessionId,
    resource:   "VAULT",
    operation:  input.operation,
    timestamp:  input.timestamp ?? new Date().toISOString(),
    eventData:  {
      isVaultAccess: true,
      resource:      "VAULT",
      operation:     input.operation,
      secretAlias:   input.secretAlias,   // alias only — never the value
      success:       input.success,
      // Never include: secretValue, plaintext, decryptedValue
    },
  };
}

/**
 * isVaultEnumerationPattern — heuristic check for enumeration.
 * Returns true if the operation pattern looks like secret enumeration.
 */
export function isVaultEnumerationPattern(operations: VaultAnomalyEventInput[]): boolean {
  try {
    if (operations.length < 5) return false;
    const listOps = operations.filter(op => op.operation === "LIST");
    const readOps = operations.filter(op => op.operation === "READ");
    // Enumeration: LIST followed by many READs in a short window
    return listOps.length >= 1 && readOps.length >= 5;
  } catch {
    return false;
  }
}
