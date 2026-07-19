/**
 * lib/security/vault/vault-governance.ts
 *
 * Agentik — Vault Governance Layer
 *
 * Sprint: AGENTIK-SECURITY-VAULT-AND-REAL-CONNECTORS-01 — Block A3
 *
 * Evaluates vault access decisions, resolves secret governance verdicts,
 * and produces health snapshots for the Copilot pipeline.
 *
 * Rules enforced:
 *   - Tenant isolation: secrets are only valid within orgSlug scope
 *   - Runtime degraded → restrict sensitive execution
 *   - Expired secrets → block dispatch
 *   - Revoked secrets → hard block
 *   - Rotation required → warn on dispatch
 *
 * V1: rule-based, derived from vault snapshot (no Prisma, no external vault).
 * V4: backed by live vault health checks + Prisma.VaultAuditRecord.
 */

// ── Shared status types (re-aligned with sprint spec) ──────────────────────────

export type VaultSecretStatus =
  | "active"    // Valid, verified, in-use
  | "expiring"  // < 30 days to expiry — rotation recommended
  | "expired"   // Past expiry — blocks dispatch
  | "invalid"   // Validation failed — blocks dispatch
  | "revoked";  // Explicitly revoked — hard block

export type VaultHealth = "secure" | "warning" | "critical" | "empty";

// ── Lightweight secret status record (pipeline-safe, no raw values) ───────────

export interface VaultSecretRecord {
  id:               string;
  orgSlug:          string;
  integrationId:    string;
  label:            string;
  status:           VaultSecretStatus;
  rotationRequired: boolean;
  expiresAt?:       string;   // ISO string
  daysToExpiry?:    number;   // Derived — days until expiry
}

// ── Access decision ─────────────────────────────────────────────────────────────

export interface VaultAccessDecision {
  allowed:     boolean;
  restricted:  boolean;    // Allowed with caveats
  reason:      string;
  auditTag:    string;     // Opaque audit tag (no raw secret data)
}

// ── Governance verdict ──────────────────────────────────────────────────────────

export interface VaultGovernanceVerdict {
  canDispatch:       boolean;
  blockingSecrets:   VaultSecretRecord[];
  warningSecrets:    VaultSecretRecord[];
  requiresRotation:  boolean;
  governanceSummary: string;
}

// ── Health snapshot ─────────────────────────────────────────────────────────────

export interface VaultHealthSnapshot {
  orgSlug:       string;
  health:        VaultHealth;
  totalSecrets:  number;
  activeCount:   number;
  expiringCount: number;
  expiredCount:  number;
  invalidCount:  number;
  revokedCount:  number;
  summary:       string;
  evaluatedAt:   string;   // ISO string
}

// ── Access evaluation ───────────────────────────────────────────────────────────

/**
 * Evaluates whether a secret may be accessed in the current runtime context.
 *
 * Applies:
 *   - Tenant isolation (orgSlug must match)
 *   - Runtime state restriction (degraded → restrict sensitive ops)
 *   - Secret status check (expired/revoked → block)
 */
export function evaluateVaultAccess(
  secret:       VaultSecretRecord,
  requestOrgSlug: string,
  runtimeState: string,
): VaultAccessDecision {
  const auditTag = `vault:${secret.integrationId}:${secret.id.slice(0, 8)}`;

  // Tenant isolation — hard block
  if (secret.orgSlug !== requestOrgSlug) {
    return {
      allowed:    false,
      restricted: false,
      reason:     "Acceso denegado — aislamiento de tenant violado",
      auditTag,
    };
  }

  // Revoked — hard block
  if (secret.status === "revoked") {
    return {
      allowed:    false,
      restricted: false,
      reason:     `Secreto revocado: ${secret.label}`,
      auditTag,
    };
  }

  // Expired — block dispatch
  if (secret.status === "expired" || secret.status === "invalid") {
    return {
      allowed:    false,
      restricted: false,
      reason:     `Secreto ${secret.status === "expired" ? "expirado" : "inválido"}: ${secret.label}`,
      auditTag,
    };
  }

  // Runtime degraded + sensitive integration → restrict (not block)
  if (runtimeState === "DEGRADED" && isSensitiveIntegration(secret.integrationId)) {
    return {
      allowed:    true,
      restricted: true,
      reason:     `Runtime degradado — ejecución de ${secret.label} restringida a modo supervisado`,
      auditTag,
    };
  }

  // Expiring — warn but allow
  if (secret.status === "expiring") {
    return {
      allowed:    true,
      restricted: true,
      reason:     `Secreto expirando pronto: ${secret.label} — rotación recomendada`,
      auditTag,
    };
  }

  return {
    allowed:    true,
    restricted: false,
    reason:     `Acceso permitido: ${secret.label}`,
    auditTag,
  };
}

/**
 * Resolves the full governance verdict for dispatching against a connector.
 * Aggregates all secret access decisions into a single dispatch verdict.
 */
export function resolveSecretGovernance(
  secrets:      VaultSecretRecord[],
  orgSlug:      string,
  runtimeState: string,
): VaultGovernanceVerdict {
  if (secrets.length === 0) {
    return {
      canDispatch:       true,
      blockingSecrets:   [],
      warningSecrets:    [],
      requiresRotation:  false,
      governanceSummary: "Sin secretos requeridos — despacho libre",
    };
  }

  const blockingSecrets: VaultSecretRecord[] = [];
  const warningSecrets:  VaultSecretRecord[] = [];

  for (const secret of secrets) {
    const decision = evaluateVaultAccess(secret, orgSlug, runtimeState);

    if (!decision.allowed) {
      blockingSecrets.push(secret);
    } else if (decision.restricted) {
      warningSecrets.push(secret);
    }
  }

  const requiresRotation = secrets.some(s => s.rotationRequired || s.status === "expiring");
  const canDispatch = blockingSecrets.length === 0;

  const governanceSummary =
    blockingSecrets.length > 0
      ? `${blockingSecrets.length} secreto${blockingSecrets.length > 1 ? "s" : ""} bloqueando despacho — intervención requerida`
      : warningSecrets.length > 0
      ? `${warningSecrets.length} advertencia${warningSecrets.length > 1 ? "s" : ""} de vault — despacho supervisado`
      : requiresRotation
      ? "Rotación recomendada — despacho permitido con monitoreo"
      : "Vault saludable — despacho disponible";

  return {
    canDispatch,
    blockingSecrets,
    warningSecrets,
    requiresRotation,
    governanceSummary,
  };
}

/**
 * Summarizes the current vault health across all tenant secrets.
 */
export function summarizeVaultHealth(secrets: VaultSecretRecord[], orgSlug: string): VaultHealthSnapshot {
  if (secrets.length === 0) {
    return {
      orgSlug,
      health:        "empty",
      totalSecrets:  0,
      activeCount:   0,
      expiringCount: 0,
      expiredCount:  0,
      invalidCount:  0,
      revokedCount:  0,
      summary:       "Sin secretos configurados",
      evaluatedAt:   new Date().toISOString(),
    };
  }

  const active    = secrets.filter(s => s.status === "active").length;
  const expiring  = secrets.filter(s => s.status === "expiring").length;
  const expired   = secrets.filter(s => s.status === "expired").length;
  const invalid   = secrets.filter(s => s.status === "invalid").length;
  const revoked   = secrets.filter(s => s.status === "revoked").length;

  const health: VaultHealth =
    revoked > 0 || (expired + invalid) > 0 ? "critical" :
    expiring > 0                            ? "warning"  :
    "secure";

  const summary =
    health === "critical" ? `${expired + invalid + revoked} secreto${expired + invalid + revoked > 1 ? "s" : ""} requieren atención inmediata`  :
    health === "warning"  ? `${expiring} secreto${expiring > 1 ? "s" : ""} próximos a expirar — rotación recomendada` :
    `${active} secreto${active > 1 ? "s" : ""} activo${active > 1 ? "s" : ""} — vault seguro`;

  return {
    orgSlug,
    health,
    totalSecrets:  secrets.length,
    activeCount:   active,
    expiringCount: expiring,
    expiredCount:  expired,
    invalidCount:  invalid,
    revokedCount:  revoked,
    summary,
    evaluatedAt:   new Date().toISOString(),
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

/**
 * Returns true if the integration is considered sensitive (blocks on degraded runtime).
 */
function isSensitiveIntegration(integrationId: string): boolean {
  const SENSITIVE = new Set(["dian", "banking", "sag-erp", "dian-connector"]);
  return SENSITIVE.has(integrationId);
}
