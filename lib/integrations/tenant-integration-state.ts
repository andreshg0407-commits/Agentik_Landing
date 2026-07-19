/**
 * lib/integrations/tenant-integration-state.ts
 *
 * Agentik — Tenant Integration State
 *
 * Sprint: AGENTIK-TENANT-INTEGRATION-MANAGER-AND-CONTROL-CENTER-01 — Block A1
 *
 * Models the per-tenant, per-connector integration state.
 * Aggregates vault, runtime, governance, and dispatch readiness
 * into a single integration health record.
 *
 * V1: deterministic from runtime + vault signals — no Prisma.
 * V4: resolved from Prisma.Integration + live vault + connector health check.
 */

// ── Integration status ────────────────────────────────────────────────────────

export type TenantIntegrationStatus =
  | "disconnected"    // Not configured for this tenant
  | "pending_setup"   // Configured but not yet validated
  | "connected"       // Active and healthy
  | "degraded"        // Partial availability — reduced dispatch
  | "blocked"         // Hard block — runtime or vault prevents dispatch
  | "revoked"         // Credentials revoked — intervention required
  | "expiring";       // Credentials expiring soon — rotation needed

// ── Integration health ────────────────────────────────────────────────────────

export type IntegrationHealthLevel = "healthy" | "warning" | "critical" | "offline";

// ── Scope / permission record ─────────────────────────────────────────────────

export interface IntegrationScope {
  scope:       string;    // e.g. "read:customers", "publish:posts"
  granted:     boolean;
  required:    boolean;   // Is this scope required for dispatch?
}

export interface IntegrationPermission {
  permission:  string;    // e.g. "send_message", "create_product"
  available:   boolean;
  restricted:  boolean;   // Available but with caveats
}

// ── Tenant integration state record ──────────────────────────────────────────

export interface TenantIntegrationState {
  id:               string;          // Synthetic state record ID
  orgSlug:          string;
  integrationId:    string;          // connector ID (n8n, whatsapp, etc.)
  integrationName:  string;
  status:           TenantIntegrationStatus;
  health:           IntegrationHealthLevel;
  scopes:           IntegrationScope[];
  permissions:      IntegrationPermission[];
  runtimeReady:     boolean;         // Runtime state allows dispatch
  vaultReady:       boolean;         // Vault secrets are valid
  dispatchReady:    boolean;         // All gates passed — dispatch available
  governanceReady:  boolean;         // Governance rules allow dispatch
  replayContinuity: boolean;         // Audit trail is intact
  riskLevel:        string;          // "low" | "medium" | "high" | "critical"
  requiredSecrets:  string[];        // Secret IDs needed (from vault catalog)
  lastValidatedAt?: string;          // ISO timestamp
  expiresAt?:       string;          // ISO timestamp — credential expiry
  blockReason?:     string;          // Why dispatch is blocked
  warnings:         string[];        // Non-blocking issues
}

// ── Integration state summary ─────────────────────────────────────────────────

export interface TenantIntegrationSummary {
  totalCount:        number;
  connectedCount:    number;
  degradedCount:     number;
  blockedCount:      number;
  expiringCount:     number;
  disconnectedCount: number;
  dispatchReadyCount: number;
  overallHealth:     IntegrationHealthLevel;
  summary:           string;
}

// ── Risk classification helpers ───────────────────────────────────────────────

/**
 * Maps integration status to health level.
 */
export function statusToHealth(status: TenantIntegrationStatus): IntegrationHealthLevel {
  switch (status) {
    case "connected":     return "healthy";
    case "degraded":      return "warning";
    case "expiring":      return "warning";
    case "blocked":       return "critical";
    case "revoked":       return "critical";
    case "pending_setup": return "offline";
    case "disconnected":  return "offline";
    default:              return "offline";
  }
}

/**
 * Returns a human-readable label for an integration status.
 */
export function getIntegrationStatusLabel(status: TenantIntegrationStatus): string {
  const LABELS: Record<TenantIntegrationStatus, string> = {
    disconnected:  "Sin configurar",
    pending_setup: "Configuración pendiente",
    connected:     "Conectado",
    degraded:      "Degradado",
    blocked:       "Bloqueado",
    revoked:       "Revocado",
    expiring:      "Expirando",
  };
  return LABELS[status] ?? status;
}

/**
 * Returns the dot color for an integration status (token-safe hex values).
 */
export function getIntegrationStatusColor(status: TenantIntegrationStatus): string {
  switch (status) {
    case "connected":     return "#16a34a";  // C.green
    case "degraded":      return "#d97706";  // C.amber
    case "expiring":      return "#d97706";  // C.amber
    case "blocked":       return "#dc2626";  // C.red
    case "revoked":       return "#dc2626";  // C.red
    default:              return "#94a3b8";  // C.inkGhost
  }
}
