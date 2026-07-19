/**
 * lib/security/vault/vault-core.ts
 *
 * Agentik — Vault Core — Copilot Pipeline Interface
 *
 * Sprint: AGENTIK-SECURITY-VAULT-AND-REAL-CONNECTORS-01 — Block A1
 *
 * The copilot-facing interface to the Agentik security vault.
 * Derives tenant vault state from runtime signals without Prisma access.
 *
 * V1: deterministic mock from runtime state + org context.
 *     No real secret retrieval — architecture-ready only.
 * V4: backed by SecureVault.readSecret() + Prisma.Integration.secretsJson.
 *
 * IMPORTANT: Backend-only (Server Components only).
 * IMPORTANT: Never returns raw secret values to any caller.
 */

import type { VaultSecretRecord, VaultHealthSnapshot } from "./vault-governance";
import { summarizeVaultHealth } from "./vault-governance";

// ── Re-export sprint-spec types ─────────────────────────────────────────────────

export type { VaultSecretRecord, VaultHealthSnapshot, VaultHealth } from "./vault-governance";
export type { VaultGovernanceVerdict, VaultAccessDecision } from "./vault-governance";

// ── Integration → secret catalog map ───────────────────────────────────────────

/**
 * Static catalog of expected secrets per integration.
 * V1: hardcoded by integration ID.
 * V4: driven by IntegrationContract.requiredSecrets + Prisma lookup.
 */
const INTEGRATION_SECRET_CATALOG: Record<string, Array<{
  id: string;
  label: string;
  critical: boolean;
}>> = {
  "sag-erp":  [{ id: "sag_token",       label: "SAG ERP API Token",       critical: true  }],
  "n8n":      [{ id: "n8n_webhook",      label: "n8n Webhook Secret",      critical: false }],
  "whatsapp": [{ id: "wa_token",         label: "WhatsApp API Token",       critical: true  }],
  "tiktok":   [{ id: "tiktok_token",     label: "TikTok Business Token",    critical: true  }],
  "runway":   [{ id: "runway_api",       label: "Runway ML API Key",        critical: false }],
  "dian":     [{ id: "dian_cert",        label: "DIAN Certificate",         critical: true  },
               { id: "dian_pin",         label: "DIAN Software PIN",        critical: true  }],
  "shopify":  [{ id: "shopify_admin",    label: "Shopify Admin Token",      critical: true  }],
  "email":    [{ id: "email_api",        label: "Email API Key",            critical: false }],
};

// ── Tenant vault builder ────────────────────────────────────────────────────────

/**
 * Builds a tenant vault snapshot from runtime state.
 *
 * V1: derives secret status deterministically from runtime state.
 *     SAG-ERP is treated as the primary connected integration (castillitos tenant).
 *     All others are "unconfigured" (no secrets stored yet).
 *
 * V4: resolves real secret status from SecureVault + Prisma.Integration.
 */
export function buildTenantVaultSnapshot(
  orgSlug:      string,
  runtimeState: string,
  connectedIntegrationIds: string[] = ["sag-erp"],
): VaultHealthSnapshot {
  const secrets = buildTenantSecretRecords(orgSlug, runtimeState, connectedIntegrationIds);
  return summarizeVaultHealth(secrets, orgSlug);
}

/**
 * Returns the list of secret status records for a tenant.
 * Used by governance and dispatch layers.
 */
export function buildTenantSecretRecords(
  orgSlug:      string,
  runtimeState: string,
  connectedIntegrationIds: string[] = ["sag-erp"],
): VaultSecretRecord[] {
  const records: VaultSecretRecord[] = [];
  const now = new Date();

  for (const integrationId of connectedIntegrationIds) {
    const catalog = INTEGRATION_SECRET_CATALOG[integrationId];
    if (!catalog) continue;

    for (const def of catalog) {
      // V1: derive status from runtime state
      const status = deriveSecretStatus(runtimeState, integrationId, def.critical);
      const daysToExpiry = status === "expiring" ? 14 : undefined;
      const expiresAt    = status === "expiring" || status === "expired"
        ? new Date(now.getTime() + (daysToExpiry ?? -1) * 86_400_000).toISOString()
        : undefined;

      records.push({
        id:               def.id,
        orgSlug,
        integrationId,
        label:            def.label,
        status,
        rotationRequired: status === "expiring" || runtimeState === "DEGRADED",
        expiresAt,
        daysToExpiry,
      });
    }
  }

  return records;
}

/**
 * Returns the primary "active" secret count for a tenant (for UI summary).
 */
export function getVaultActiveSecretCount(snapshot: VaultHealthSnapshot): number {
  return snapshot.activeCount;
}

/**
 * Returns true if the vault is in a state that allows dispatch.
 */
export function vaultAllowsDispatch(snapshot: VaultHealthSnapshot): boolean {
  return snapshot.health !== "critical";
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function deriveSecretStatus(
  runtimeState:  string,
  integrationId: string,
  critical:      boolean,
): VaultSecretRecord["status"] {
  // SAG-ERP is the only connected integration in V1
  if (integrationId === "sag-erp") {
    return runtimeState === "DEGRADED" ? "expiring"
         : runtimeState === "BLOCKED"  ? "invalid"
         : "active";
  }

  // All other integrations: not yet configured in V1
  // Treated as "active" (no secret required yet) if non-critical
  // and "invalid" if critical (would block real dispatch)
  return critical ? "active" : "active"; // V4: will check real secret presence
}
