/**
 * lib/control-center/tenant-health.ts
 *
 * Agentik — Tenant Health Aggregation
 *
 * Sprint: AGENTIK-TENANT-INTEGRATION-MANAGER-AND-CONTROL-CENTER-01 — Block C4
 *
 * Builds, summarizes, and detects instability in tenant health snapshots.
 * Considers runtime, integrations, incidents, vault, governance, and execution state.
 *
 * V1: single-tenant (castillitos) model — multi-tenant architecture ready.
 * V4: aggregated from real Prisma multi-tenant state per org.
 */

import type { TenantIntegrationSummary } from "../integrations/tenant-integration-state";

// ── Tenant health level ───────────────────────────────────────────────────────

export type TenantHealthLevel =
  | "healthy"      // All systems nominal
  | "degraded"     // Partial issues — reduced capacity
  | "critical"     // Active blocking issues
  | "offline"      // Not reachable / not configured
  | "instability"; // Oscillating between states — needs monitoring

// ── Instability signal ────────────────────────────────────────────────────────

export interface TenantInstabilitySignal {
  tenantId:    string;
  orgSlug:     string;
  factor:      string;
  severity:    "critical" | "high" | "medium" | "low";
  description: string;
  recommendation: string;
}

// ── Tenant health record ──────────────────────────────────────────────────────

export interface TenantHealthRecord {
  orgSlug:             string;
  tenantName:          string;
  healthLevel:         TenantHealthLevel;
  runtimeState:        string;
  vaultHealth:         string;
  integrationSummary:  TenantIntegrationSummary;
  incidentCount:       number;
  criticalIncidents:   number;
  governanceBlocked:   boolean;
  executionCapacity:   number;      // 0–100%
  dispatchReady:       boolean;
  replayContinuity:    boolean;
  instabilitySignals:  TenantInstabilitySignal[];
  summary:             string;
  lastEvaluatedAt:     string;
}

// ── Tenant health map ─────────────────────────────────────────────────────────

export interface TenantHealthMap {
  tenants:           TenantHealthRecord[];
  totalCount:        number;
  healthyCount:      number;
  degradedCount:     number;
  criticalCount:     number;
  instabilityCount:  number;
  overallHealth:     TenantHealthLevel;
  summary:           string;
}

// ── Build params ──────────────────────────────────────────────────────────────

export interface BuildTenantHealthParams {
  orgSlug:            string;
  tenantName:         string;
  runtimeState:       string;
  vaultHealth:        string;
  integrationSummary: TenantIntegrationSummary;
  incidentCount:      number;
  criticalIncidents:  number;
  governanceBlocked:  boolean;
  executionCapacity:  number;
  dispatchReady:      boolean;
  replayContinuity:   boolean;
}

// ── Core: build tenant health record ─────────────────────────────────────────

/**
 * Builds a tenant health record from all signals.
 */
export function buildTenantHealthMap(
  tenants: BuildTenantHealthParams[],
): TenantHealthMap {
  const records = tenants.map(buildTenantHealthRecord);

  const healthyCount    = records.filter(r => r.healthLevel === "healthy").length;
  const degradedCount   = records.filter(r => r.healthLevel === "degraded").length;
  const criticalCount   = records.filter(r => r.healthLevel === "critical").length;
  const instabilityCount = records.filter(r => r.healthLevel === "instability").length;

  const overallHealth: TenantHealthLevel =
    criticalCount > 0    ? "critical"     :
    instabilityCount > 0 ? "instability"  :
    degradedCount > 0    ? "degraded"     :
    healthyCount > 0     ? "healthy"      :
    "offline";

  const summary = summarizeTenantHealth({ records, criticalCount, degradedCount, healthyCount });

  return {
    tenants: records,
    totalCount:    records.length,
    healthyCount,
    degradedCount,
    criticalCount,
    instabilityCount,
    overallHealth,
    summary,
  };
}

// ── Individual tenant health builder ─────────────────────────────────────────

function buildTenantHealthRecord(p: BuildTenantHealthParams): TenantHealthRecord {
  const instabilitySignals = detectTenantInstability(p);

  const healthLevel: TenantHealthLevel =
    p.criticalIncidents > 0 || p.vaultHealth === "critical" || p.runtimeState === "BLOCKED"
      ? "critical"
    : instabilitySignals.filter(s => s.severity === "high" || s.severity === "critical").length > 1
      ? "instability"
    : p.incidentCount > 0 || p.vaultHealth === "warning" || p.runtimeState === "DEGRADED" || p.governanceBlocked
      ? "degraded"
    : "healthy";

  const summary = buildTenantSummary(healthLevel, p);

  return {
    orgSlug:            p.orgSlug,
    tenantName:         p.tenantName,
    healthLevel,
    runtimeState:       p.runtimeState,
    vaultHealth:        p.vaultHealth,
    integrationSummary: p.integrationSummary,
    incidentCount:      p.incidentCount,
    criticalIncidents:  p.criticalIncidents,
    governanceBlocked:  p.governanceBlocked,
    executionCapacity:  p.executionCapacity,
    dispatchReady:      p.dispatchReady,
    replayContinuity:   p.replayContinuity,
    instabilitySignals,
    summary,
    lastEvaluatedAt: new Date().toISOString(),
  };
}

// ── Detect tenant instability ─────────────────────────────────────────────────

/**
 * Detects instability signals for a tenant.
 */
export function detectTenantInstability(
  p: BuildTenantHealthParams,
): TenantInstabilitySignal[] {
  const signals: TenantInstabilitySignal[] = [];

  if (p.criticalIncidents > 0) {
    signals.push({
      tenantId:    p.orgSlug,
      orgSlug:     p.orgSlug,
      factor:      "critical_incidents",
      severity:    "critical",
      description: `${p.criticalIncidents} incidente${p.criticalIncidents > 1 ? "s" : ""} crítico${p.criticalIncidents > 1 ? "s" : ""} activo${p.criticalIncidents > 1 ? "s" : ""}`,
      recommendation: "Revisar y resolver incidentes críticos antes de continuar operaciones",
    });
  }

  if (p.vaultHealth === "critical") {
    signals.push({
      tenantId:    p.orgSlug,
      orgSlug:     p.orgSlug,
      factor:      "vault_critical",
      severity:    "critical",
      description: "Vault en estado crítico — secretos bloqueados",
      recommendation: "Rotar o revalidar credenciales afectadas inmediatamente",
    });
  }

  if (p.runtimeState === "DEGRADED") {
    signals.push({
      tenantId:    p.orgSlug,
      orgSlug:     p.orgSlug,
      factor:      "runtime_degraded",
      severity:    "high",
      description: "Runtime en modo degradado — dispatch restringido",
      recommendation: "Investigar causa de degradación y activar recovery si disponible",
    });
  }

  if (p.governanceBlocked) {
    signals.push({
      tenantId:    p.orgSlug,
      orgSlug:     p.orgSlug,
      factor:      "governance_blocked",
      severity:    "high",
      description: "Gobernanza bloqueó ejecuciones — reglas activas",
      recommendation: "Revisar reglas de gobernanza y aprobar operaciones pendientes",
    });
  }

  if (!p.replayContinuity) {
    signals.push({
      tenantId:    p.orgSlug,
      orgSlug:     p.orgSlug,
      factor:      "replay_gap",
      severity:    "medium",
      description: "Gap de continuidad en auditoría",
      recommendation: "Verificar integridad de replay antes de próximas ejecuciones críticas",
    });
  }

  if (p.integrationSummary.blockedCount > 0) {
    signals.push({
      tenantId:    p.orgSlug,
      orgSlug:     p.orgSlug,
      factor:      "integrations_blocked",
      severity:    "medium",
      description: `${p.integrationSummary.blockedCount} integración${p.integrationSummary.blockedCount > 1 ? "es" : ""} bloqueada${p.integrationSummary.blockedCount > 1 ? "s" : ""}`,
      recommendation: "Revisar credenciales y estado de vault para integraciones afectadas",
    });
  }

  return signals;
}

// ── Summarize tenant health ───────────────────────────────────────────────────

/**
 * Returns a 1-line aggregate health summary.
 */
export function summarizeTenantHealth(p: {
  records:       TenantHealthRecord[];
  criticalCount: number;
  degradedCount: number;
  healthyCount:  number;
}): string {
  if (p.records.length === 0) return "Sin tenants configurados";
  if (p.criticalCount > 0) {
    return `${p.criticalCount} tenant${p.criticalCount > 1 ? "s" : ""} en estado crítico — intervención requerida`;
  }
  if (p.degradedCount > 0) {
    return `${p.degradedCount} tenant${p.degradedCount > 1 ? "s" : ""} degradado${p.degradedCount > 1 ? "s" : ""} — capacidad reducida`;
  }
  return `${p.healthyCount} tenant${p.healthyCount > 1 ? "s" : ""} saludable${p.healthyCount > 1 ? "s" : ""} — sistema operativo`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildTenantSummary(
  health: TenantHealthLevel,
  p: BuildTenantHealthParams,
): string {
  switch (health) {
    case "critical":    return p.criticalIncidents > 0 ? `${p.criticalIncidents} incidente${p.criticalIncidents > 1 ? "s" : ""} crítico${p.criticalIncidents > 1 ? "s" : ""}` : "Estado crítico";
    case "instability": return "Inestabilidad detectada — monitoreo intensivo";
    case "degraded":    return p.governanceBlocked ? "Gobernanza activa — dispatch reducido" : `Runtime ${p.runtimeState.toLowerCase()} — capacidad reducida`;
    case "healthy":     return `${p.integrationSummary.connectedCount} integración${p.integrationSummary.connectedCount > 1 ? "es" : ""} activa${p.integrationSummary.connectedCount > 1 ? "s" : ""}`;
    default:            return "Sin datos";
  }
}
