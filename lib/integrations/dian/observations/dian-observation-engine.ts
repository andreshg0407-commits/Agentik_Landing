/**
 * dian-observation-engine.ts
 *
 * AGENTIK-DIAN-OBSERVATIONS-01
 * DIAN Integration Layer — Fiscal Observation Engine
 *
 * Transforms fiscal sync memory and operational data into
 * FiscalObservation[] — deterministic, auditable, explainable.
 *
 * ── Philosophy ────────────────────────────────────────────────────────────────
 *
 *   Every observation is a factual statement, not an assessment.
 *
 *   ✅ "Castillitos habilitación: 4 SOAP faults en los últimos 7 intentos."
 *   ✅ "Certificado DIAN expira en 11 días — renovación requerida."
 *   ✅ "ARKETOPS fiscal sync sin actividad hace 4 días."
 *   ✅ "Operación fiscal estable — 8 ejecuciones consecutivas exitosas."
 *   ❌ "Riesgo tributario detectado"           (no scoring)
 *   ❌ "Posible evasión fiscal"                (no fabrication)
 *   ❌ "Agentik recomienda revisar impuestos"  (no marketing copy)
 *
 * ── Architecture ──────────────────────────────────────────────────────────────
 *
 *   PURE — zero Prisma, zero side effects.
 *   Input:  FiscalObservationInput[] (pre-fetched by dian-observation-loader.ts)
 *   Output: FiscalObservation[]
 *
 *   Rule minimum requirements (honest degradation):
 *     No history required:  cert_*, tenant_never_synced
 *     ≥1 outcome:           fiscal_memory_building, stale_fiscal_sync
 *     ≥5 outcomes:          fault patterns, unstable_environment, latency_degradation
 *     ≥10 outcomes:         latency_degradation (full comparison window)
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import crypto from "node:crypto";
import type {
  FiscalObservation,
  FiscalObservationType,
  FiscalObservationSeverity,
  FiscalObservationGroup,
  FiscalEscalationLevel,
  FiscalAttentionResult,
  FiscalObservationInput,
} from "./dian-observation-types";
import {
  certificateExpiryWindow,
  repeatedFailurePattern,
  computeSuccessRate,
  retryEscalation,
  staleFiscalSync,
  latencyDegradation,
  recoveryPattern,
  stableOperationPattern,
} from "./dian-observation-patterns";

// ── Severity rank ─────────────────────────────────────────────────────────────

const SEVERITY_RANK: Record<FiscalObservationSeverity, number> = {
  critical: 5,
  elevated: 4,
  watch:    3,
  ok:       2,
  info:     1,
};

// ── Observation builder ───────────────────────────────────────────────────────

function fiscalObs(
  input:   FiscalObservationInput,
  type:    FiscalObservationType,
  severity: FiscalObservationSeverity,
  message:  string,
  evidence: string,
  action:   string | null,
  basedOn:  number,
): FiscalObservation {
  return {
    observationId:   crypto.randomUUID(),
    organizationId:  input.organizationId,
    integrationId:   input.integrationId,
    environment:     input.environment,
    operation:       input.operation,
    generatedAt:     new Date().toISOString(),
    observationType: type,
    severity,
    message,
    evidence,
    suggestedAction: action,
    confidence:      "RULE_BASED",
    basedOnOutcomes: basedOn,
  };
}

// ── Quiet state observation (Task 7) ──────────────────────────────────────────

/**
 * Emitted when all systems are nominal and no pattern rules fire.
 * Precise and calm — not a marketing message.
 */
const QUIET_MESSAGES = [
  "Operación fiscal estable.",
  "Sin degradaciones tributarias relevantes.",
  "Memoria fiscal acumulándose.",
] as const;

// ── Main engine ───────────────────────────────────────────────────────────────

/**
 * Generate deterministic fiscal observations for one integration.
 *
 * Returns FiscalObservation[] sorted highest severity first.
 * Returns a single fiscal_memory_building observation when history is insufficient.
 * Returns a quiet stable_fiscal_ops observation when all signals are positive.
 *
 * @param input  Pre-fetched FiscalObservationInput from dian-observation-loader
 */
export function generateFiscalObservations(
  input: FiscalObservationInput,
): FiscalObservation[] {
  const result: FiscalObservation[] = [];
  const mem     = input.fiscalMemory;
  const outcomes = mem?.recentOutcomes ?? [];
  const n        = outcomes.length;
  const totalRuns = (mem?.successCount ?? 0) + (mem?.failureCount ?? 0);

  // ── R_CERT_* — Certificate health (no history required) ───────────────────
  {
    const expiryInput = input.certExpiresAt ?? mem?.certExpiresAt;
    const expiry = certificateExpiryWindow(expiryInput);

    if (expiry.window === "expired") {
      result.push(fiscalObs(
        input, "cert_expired", "critical",
        `Certificado DIAN expiró hace ${Math.abs(expiry.daysRemaining!)} día${Math.abs(expiry.daysRemaining!) !== 1 ? "s" : ""}. La integración fiscal no puede operar.`,
        `certExpiresAt: ${expiryInput} — pasado ${Math.abs(expiry.daysRemaining!)} días`,
        "Renovar el certificado DIAN inmediatamente y actualizar la configuración de integración.",
        n,
      ));
      return result; // terminal — nothing else matters until cert is renewed
    }

    if (expiry.window === "critical") {
      result.push(fiscalObs(
        input, "cert_expiring_soon", "critical",
        `Certificado DIAN expira en ${expiry.daysRemaining} día${expiry.daysRemaining !== 1 ? "s" : ""}. Acción urgente requerida.`,
        `certExpiresAt: ${expiryInput} — ${expiry.daysRemaining} días restantes`,
        "Renovar el certificado DIAN antes del vencimiento para evitar interrupción del servicio.",
        n,
      ));
    } else if (expiry.window === "elevated") {
      result.push(fiscalObs(
        input, "cert_expiring_soon", "elevated",
        `Certificado DIAN expira en ${expiry.daysRemaining} días. Renovación recomendada.`,
        `certExpiresAt: ${expiryInput} — ${expiry.daysRemaining} días restantes`,
        "Iniciar proceso de renovación del certificado DIAN.",
        n,
      ));
    } else if (expiry.window === "watch") {
      result.push(fiscalObs(
        input, "cert_expiring_soon", "watch",
        `Certificado DIAN expira en ${expiry.daysRemaining} días.`,
        `certExpiresAt: ${expiryInput} — ${expiry.daysRemaining} días restantes`,
        "Programar renovación del certificado DIAN.",
        n,
      ));
    }
    // ok and unknown: no observation emitted (unknown handled below as info)

    if (expiry.window === "unknown" && totalRuns > 0) {
      result.push(fiscalObs(
        input, "cert_health_unknown", "info",
        "Metadatos del certificado DIAN no disponibles — estado de vencimiento no verificado.",
        "certExpiresAt: no registrado (requiere parseo exitoso de PKCS#12)",
        "Verificar que el certificado está siendo parseado correctamente en cada sincronización.",
        n,
      ));
    }
  }

  // ── R_NEVER_SYNCED — No sync history at all ──────────────────────────────
  if (totalRuns === 0) {
    result.push(fiscalObs(
      input, "tenant_never_synced", "info",
      "Integración DIAN configurada sin sincronizaciones registradas aún.",
      "successCount: 0, failureCount: 0 — recentOutcomes vacío",
      "Ejecutar primera sincronización fiscal para iniciar acumulación de memoria.",
      0,
    ));
    return result;
  }

  // ── R_MEMORY_BUILDING — Insufficient history for pattern rules ───────────
  if (totalRuns < 5) {
    result.push(fiscalObs(
      input, "fiscal_memory_building", "info",
      `Memoria fiscal acumulándose — ${totalRuns} ejecución${totalRuns !== 1 ? "es" : ""} registrada${totalRuns !== 1 ? "s" : ""} (se necesitan 5 para detectar patrones).`,
      `totalRuns: ${totalRuns} (successCount: ${mem!.successCount}, failureCount: ${mem!.failureCount})`,
      null,
      n,
    ));
    // Still emit stale/cert rules even with low history
    return sortObservations(result);
  }

  // ── R_STALE_SYNC — No recent sync activity ───────────────────────────────
  {
    const stale = staleFiscalSync(mem?.lastRunAt, 3);
    if (stale.isStale && stale.daysAgo !== null) {
      const severity: FiscalObservationSeverity =
        stale.daysAgo >= 7 ? "critical" :
        stale.daysAgo >= 3 ? "elevated" : "watch";

      result.push(fiscalObs(
        input, "stale_fiscal_sync", severity,
        `Sincronización fiscal sin actividad hace ${stale.daysAgo} día${stale.daysAgo !== 1 ? "s" : ""}.`,
        `lastRunAt: ${mem!.lastRunAt} — ${stale.daysAgo} días sin ejecución`,
        "Verificar que el cron de sincronización DIAN está activo y los secretos no han expirado.",
        n,
      ));
    }
  }

  // ── Pattern rules (require ≥5 outcomes) ──────────────────────────────────

  // R_REPEATED_SOAP_FAULT — SOAP_FAULT appearing ≥3 times in last 10 outcomes
  {
    const fault = repeatedFailurePattern(outcomes, "SOAP_FAULT", 3, 10);
    if (fault.detected) {
      const severity: FiscalObservationSeverity = fault.count >= 5 ? "critical" : "elevated";
      result.push(fiscalObs(
        input, "repeated_soap_fault", severity,
        `${fault.count} SOAP faults en los últimos ${fault.window} intentos — DIAN rechazando solicitudes.`,
        `recentOutcomes[last ${fault.window}]: SOAP_FAULT × ${fault.count}`,
        "Verificar credenciales DIAN, estado del certificado y configuración de NIT.",
        n,
      ));
    }
  }

  // R_REPEATED_WSSE_FAILURE — WSSE signing errors (cert or key problem)
  {
    const wsse = repeatedFailurePattern(outcomes, "WSSE_SIGNING_FAILED", 2, 10);
    if (wsse.detected) {
      result.push(fiscalObs(
        input, "repeated_wsse_failure", "elevated",
        `${wsse.count} errores de firma WS-Security en los últimos ${wsse.window} intentos — problema con el certificado o la clave privada.`,
        `recentOutcomes[last ${wsse.window}]: WSSE_SIGNING_FAILED × ${wsse.count}`,
        "Verificar integridad del archivo .p12 y contraseña del certificado en el vault.",
        n,
      ));
    }
  }

  // R_UNSTABLE_ENVIRONMENT — Success rate below 50%
  {
    const sr = computeSuccessRate(outcomes, 10);
    if (sr.totalCount >= 5 && sr.rate < 0.5) {
      const severity: FiscalObservationSeverity = sr.rate < 0.3 ? "critical" : "elevated";
      const failCount = sr.totalCount - sr.successCount;
      result.push(fiscalObs(
        input, "unstable_environment", severity,
        `Entorno fiscal inestable — ${failCount} de ${sr.totalCount} sincronizaciones recientes fallaron (${Math.round(sr.rate * 100)}% de éxito).`,
        `recentOutcomes[last ${sr.window}]: successCount=${sr.successCount}, failed=${failCount}`,
        "Revisar conectividad con el endpoint DIAN y validar configuración del tenant.",
        n,
      ));
    }
  }

  // R_LATENCY_DEGRADATION — Latency increasing significantly (≥10 outcomes)
  {
    const latency = latencyDegradation(mem?.recentLatencies ?? []);
    if (latency.isDegrading && latency.pctChange !== null) {
      const severity: FiscalObservationSeverity = latency.pctChange >= 100 ? "elevated" : "watch";
      result.push(fiscalObs(
        input, "latency_degradation", severity,
        `Latencia DIAN degradada — promedio reciente ${Math.round(latency.recentAvg!)}ms vs ${Math.round(latency.previousAvg!)}ms anterior (+${Math.round(latency.pctChange)}%).`,
        `recentLatencies[last 10]: recent avg=${Math.round(latency.recentAvg!)}ms, previous avg=${Math.round(latency.previousAvg!)}ms`,
        "Monitorear conectividad con el endpoint DIAN habilitación.",
        n,
      ));
    }
  }

  // R_RETRY_ESCALATION — Consecutive syncs requiring retries
  {
    const retries = retryEscalation(mem?.retryStreak ?? 0, 3);
    if (retries.detected) {
      result.push(fiscalObs(
        input, "retry_escalation", "watch",
        `${retries.consecutiveStreak} sincronizaciones consecutivas requirieron reintentos — señal de inestabilidad transitoria.`,
        `retryStreak: ${retries.consecutiveStreak} ejecuciones consecutivas con retryCount > 0`,
        "Verificar disponibilidad del endpoint DIAN y latencia de red.",
        n,
      ));
    }
  }

  // R_SYNC_RECOVERY — Was failing, now succeeding (positive signal)
  {
    const recovery = recoveryPattern(mem?.operationalStreak ?? 0, mem?.failureCount ?? 0, 3);
    if (recovery.detected) {
      result.push(fiscalObs(
        input, "sync_recovery", "ok",
        `Sincronización fiscal recuperada — ${recovery.operationalStreak} ejecuciones exitosas consecutivas tras historial de fallos.`,
        `operationalStreak: ${recovery.operationalStreak}, failureCount histórico: ${mem!.failureCount}`,
        null,
        n,
      ));
    }
  }

  // ── No actionable signals — quiet state (Task 7) ──────────────────────────
  if (result.length === 0) {
    const stable = stableOperationPattern(
      mem?.operationalStreak ?? 0,
      outcomes,
      5,
      0.9,
    );

    if (stable.detected) {
      result.push(fiscalObs(
        input, "stable_fiscal_ops", "ok",
        `Operación fiscal estable — ${stable.streak} ejecuciones exitosas consecutivas (${Math.round(stable.successRate * 100)}% de éxito en las últimas 10).`,
        `operationalStreak: ${stable.streak}, successRate(10): ${Math.round(stable.successRate * 100)}%`,
        null,
        n,
      ));
    } else {
      // Some history but no strong positive or negative signal — calm info
      result.push(fiscalObs(
        input, "stable_fiscal_ops", "info",
        QUIET_MESSAGES[Math.floor(Math.random() * QUIET_MESSAGES.length)],
        `totalRuns: ${totalRuns}, lastStatus: ${mem?.lastStatus ?? "unknown"}`,
        null,
        n,
      ));
    }
  }

  return sortObservations(result);
}

// ── Multi-tenant engine ───────────────────────────────────────────────────────

/**
 * Generate fiscal observations for all tenants in a group.
 * Returns observations for all tenants, sorted by severity.
 *
 * Each tenant's observations are independent — no cross-tenant data access.
 */
export function generateFiscalObservationsForAllTenants(
  inputs: FiscalObservationInput[],
): FiscalObservation[] {
  const all = inputs.flatMap(input => generateFiscalObservations(input));
  return sortObservations(all);
}

// ── Observation grouping (Task 8) ─────────────────────────────────────────────

/**
 * Group fiscal observations by type across tenants.
 *
 * When ≥2 observations share the same observationType across different tenants,
 * synthesize them into one FiscalObservationGroup with a combined message.
 *
 * Reduces alert fatigue for multi-tenant operations.
 * Example: "3 tenants presentan SOAP faults repetitivos." (not 3 separate alerts)
 */
export function groupFiscalObservations(
  observations: FiscalObservation[],
): FiscalObservationGroup[] {
  const typeMap = new Map<FiscalObservationType, FiscalObservation[]>();

  for (const obs of observations) {
    const existing = typeMap.get(obs.observationType) ?? [];
    typeMap.set(obs.observationType, [...existing, obs]);
  }

  const groups: FiscalObservationGroup[] = [];
  for (const [type, obsList] of typeMap.entries()) {
    const highestSeverity = obsList.reduce((best, o) =>
      (SEVERITY_RANK[o.severity] ?? 0) > (SEVERITY_RANK[best.severity] ?? 0) ? o : best,
    ).severity;

    const orgIds = [...new Set(obsList.map(o => o.organizationId))];
    const count  = orgIds.length;

    groups.push({
      observationType:    type,
      severity:           highestSeverity,
      tenantCount:        count,
      organizationIds:    orgIds,
      message:            synthesizeGroupMessage(type, count),
      maxBasedOnOutcomes: Math.max(...obsList.map(o => o.basedOnOutcomes)),
    });
  }

  return groups.sort(
    (a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0),
  );
}

// ── Attention router ──────────────────────────────────────────────────────────

const MAX_ADDITIONAL_SIGNALS = 3;

/**
 * Route a flat FiscalObservation[] into a prioritized attention result.
 * Caps display at 1 primary + 3 grouped signals (mirrors financial attention-router).
 */
export function routeFiscalAttention(
  observations: FiscalObservation[],
): FiscalAttentionResult {
  const sorted = sortObservations(observations);
  const primaryObservation = sorted[0] ?? null;
  const remaining          = sorted.slice(1);

  const groups      = groupFiscalObservations(remaining);
  const shownGroups = groups.slice(0, MAX_ADDITIONAL_SIGNALS);
  const hiddenCount = groups.slice(MAX_ADDITIONAL_SIGNALS)
    .reduce((s, g) => s + g.tenantCount, 0);

  const escalationLevel = deriveFiscalEscalation(observations);
  const { headline, context } = buildFiscalAttentionSummary(escalationLevel, observations);

  const affectedTenants = new Set(
    observations
      .filter(o => o.severity !== "ok" && o.severity !== "info")
      .map(o => o.organizationId),
  ).size;

  return {
    primaryObservation,
    groupedSignals:    shownGroups,
    escalationLevel,
    headline,
    context,
    affectedTenants,
    quietCount:        hiddenCount,
    recommendedAction: primaryObservation?.suggestedAction ?? null,
  };
}

// ── Escalation derivation ─────────────────────────────────────────────────────

export function deriveFiscalEscalation(
  observations: FiscalObservation[],
): FiscalEscalationLevel {
  if (observations.length === 0) return "quiet";

  const hasCritical  = observations.some(o => o.severity === "critical");
  const hasElevated  = observations.some(o => o.severity === "elevated");
  const watchCount   = observations.filter(o => o.severity === "watch").length;
  const onlyOk       = observations.every(o => o.severity === "ok");
  const onlyBuilding = observations.every(
    o => o.observationType === "fiscal_memory_building" || o.observationType === "tenant_never_synced",
  );
  const onlyInfo     = observations.every(o => o.severity === "info" || o.severity === "ok");

  if (hasCritical)                    return "urgent";
  if (hasElevated || watchCount >= 3) return "elevated";
  if (watchCount > 0)                 return "watch";
  if (onlyOk)                         return "positive";
  if (onlyBuilding)                   return "building";
  if (onlyInfo)                       return "building";
  return "quiet";
}

// ── Private helpers ───────────────────────────────────────────────────────────

function sortObservations(obs: FiscalObservation[]): FiscalObservation[] {
  return [...obs].sort(
    (a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0),
  );
}

function synthesizeGroupMessage(type: FiscalObservationType, count: number): string {
  const tenants = count === 1 ? "1 tenant" : `${count} tenants`;
  switch (type) {
    case "cert_expired":          return `${tenants} con certificado DIAN expirado.`;
    case "cert_expiring_soon":    return `${tenants} con certificado DIAN próximo a vencer.`;
    case "cert_health_unknown":   return `${tenants} sin metadatos de certificado verificados.`;
    case "repeated_soap_fault":   return `${tenants} presentan SOAP faults repetitivos.`;
    case "repeated_wsse_failure": return `${tenants} presentan fallos de firma WS-Security.`;
    case "repeated_auth_failure": return `${tenants} con fallos de autenticación repetidos.`;
    case "unstable_environment":  return `${tenants} con entorno fiscal inestable.`;
    case "latency_degradation":   return `${tenants} con degradación de latencia DIAN.`;
    case "stale_fiscal_sync":     return `${tenants} sin sincronización fiscal reciente.`;
    case "tenant_never_synced":   return `${tenants} sin sincronizaciones registradas.`;
    case "retry_escalation":      return `${tenants} con reintentos consecutivos escalados.`;
    case "sync_recovery":         return `${tenants} en recuperación de sincronización fiscal.`;
    case "stable_fiscal_ops":     return `${tenants} con operación fiscal estable.`;
    case "fiscal_memory_building":return `${tenants} acumulando memoria fiscal inicial.`;
    default:                      return `${tenants} con señal fiscal activa.`;
  }
}

function buildFiscalAttentionSummary(
  level:        FiscalEscalationLevel,
  observations: FiscalObservation[],
): { headline: string; context: string } {
  const headline = (() => {
    switch (level) {
      case "urgent":   return "Atención fiscal requerida";
      case "elevated": return "Atención fiscal requerida";
      case "watch":    return "Seguimiento fiscal recomendado";
      case "positive": return "Operación fiscal en orden";
      case "building": return "Memoria fiscal acumulándose";
      case "quiet":    return "Sin señales fiscales relevantes";
    }
  })();

  const context = (() => {
    if (level === "building") {
      return "integración DIAN configurada — historial insuficiente para análisis de patrones";
    }
    if (level === "quiet" || level === "positive") {
      return "todas las sincronizaciones fiscales en estado nominal";
    }

    const actionable = observations.filter(
      o => o.severity === "critical" || o.severity === "elevated" || o.severity === "watch",
    );
    if (actionable.length === 0) return "";

    const top = actionable[0];
    switch (top.observationType) {
      case "cert_expired":          return "certificado DIAN expirado — integración bloqueada";
      case "cert_expiring_soon":    return `certificado DIAN próximo a vencer`;
      case "repeated_soap_fault":   return "SOAP faults repetitivos detectados";
      case "repeated_wsse_failure": return "fallos de firma WS-Security";
      case "unstable_environment":  return "tasa de éxito fiscal baja";
      case "stale_fiscal_sync":     return "sincronización fiscal inactiva";
      case "latency_degradation":   return "latencia DIAN degradada";
      case "retry_escalation":      return "reintentos consecutivos escalados";
      default:                      return `${actionable.length} señal${actionable.length > 1 ? "es" : ""} fiscal${actionable.length > 1 ? "es" : ""} activa${actionable.length > 1 ? "s" : ""}`;
    }
  })();

  return { headline, context };
}
