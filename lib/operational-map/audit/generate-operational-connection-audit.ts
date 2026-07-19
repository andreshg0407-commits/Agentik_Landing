/**
 * lib/operational-map/audit/generate-operational-connection-audit.ts
 *
 * Operational Connection Audit Generator.
 *
 * INTERNAL ONLY: SUPER_ADMIN / AGENTIK_ADMIN
 *
 * Transforms the KPI registry into a full OperationalConnectionAudit:
 *   Phase 2 — Core audit rows from KPI registry
 *   Phase 3 — Apply automatic detectors
 *   Phase 5 — Connection status per KPI
 *   Phase 6 — Domain readiness scores (0–100)
 *
 * Sprint: AGENTIK-OPERATIONAL-CONNECTION-AUDIT-01
 */

import { OPERATIONAL_KPI_REGISTRY } from "./operational-kpi-registry";
import { detectFlags, hasAnyIssue, isCriticalIssue } from "./connection-detectors";
import type {
  OperationalConnectionAudit,
  OperationalConnectionAuditRow,
  DomainAuditSummary,
  ConnectionHealth,
} from "./operational-connection-audit-types";
import type { OperationalDomainKey } from "../operational-source-map";
import type { KpiCertificationRecord } from "../certification/operational-kpi-certification-types";
import { computeOperationalTrustScore } from "../certification/operational-kpi-certification-service";
import type { KpiDefinitionRecord } from "../certification/operational-kpi-definition-service";
import { definitionToRegistryEntry } from "../certification/operational-kpi-definition-service";
import type { KpiSourceRecord } from "../certification/operational-kpi-source-service";

// ─── Domain label map ─────────────────────────────────────────────────────────

const DOMAIN_LABELS: Record<string, string> = {
  torre_control:            "Torre de Control",
  comercial:                "Comercial",
  inventario:               "Inventario",
  produccion:               "Producción",
  cartera:                  "Cartera",
  cobranza:                 "Cobranza",
  tesoreria:                "Tesorería",
  finanzas:                 "Finanzas",
  crm_pedidos:              "CRM / Pedidos",
  customer_360:             "Customer 360",
  logistica:                "Logística",
  inteligencia_operacional: "Inteligencia Operacional",
  conciliacion:             "Conciliación",
};

// ─── Readiness weights per priority ───────────────────────────────────────────

const PRIORITY_WEIGHT: Record<string, number> = {
  critical: 1.0,
  high:     0.6,
  medium:   0.3,
  low:      0.1,
};

/**
 * A KPI is "ready" if its connectionHealth is one of these.
 * Manual counts as 50% ready (partial credit).
 */
const FULLY_READY: ConnectionHealth[] = ["live"];
const PARTIALLY_READY: ConnectionHealth[] = ["partial", "manual"];

// ─── Core generator ───────────────────────────────────────────────────────────

export function generateOperationalConnectionAudit(
  organizationId: string | null,
  certifications: KpiCertificationRecord[] = [],
  customKpis:     KpiDefinitionRecord[]    = [],
  kpiSources:     KpiSourceRecord[]        = [],
): OperationalConnectionAudit {
  // Build lookup maps
  const certMap    = new Map<string, KpiCertificationRecord>();
  for (const c of certifications) certMap.set(c.kpiKey, c);

  // Source map: kpiKey → sources[] (to derive actualSources for custom KPIs)
  const sourceMap  = new Map<string, KpiSourceRecord[]>();
  for (const s of kpiSources) {
    const list = sourceMap.get(s.kpiKey) ?? [];
    list.push(s);
    sourceMap.set(s.kpiKey, list);
  }

  const generatedAt = new Date().toISOString();

  // Merge static registry + custom KPIs from DB
  const customEntries = customKpis.map(def => {
    const entry = definitionToRegistryEntry(def);
    // Enrich actualSources from kpiSources if available
    const sources = sourceMap.get(def.kpiKey) ?? [];
    if (sources.length > 0) {
      entry.actualSources = sources.map(s => `${s.sourceName} (${s.sourceRole})`);
      // Determine health from source validation state
      const primarySource = sources.find(s => s.sourceOfTruth) ?? sources[0];
      if (primarySource) {
        entry.connectionHealth = primarySource.sagValidated && primarySource.queryValidated
          ? "partial"
          : "pending";
      }
    }
    return entry;
  });

  const allEntries = [...OPERATIONAL_KPI_REGISTRY, ...customEntries];

  // ── Phase 2+3: Build audit rows ──────────────────────────────────────────
  const rows: OperationalConnectionAuditRow[] = allEntries.map((entry, idx) => {
    const flags         = detectFlags(entry);
    const weight        = PRIORITY_WEIGHT[entry.priority] ?? 0.1;
    const isFullyReady  = FULLY_READY.includes(entry.connectionHealth);
    const isPartlyReady = PARTIALLY_READY.includes(entry.connectionHealth);
    const isReady       = isFullyReady || isPartlyReady;

    // Merge certification overlay from DB
    const cert     = certMap.get(entry.entityKey) ?? null;
    const trust    = computeOperationalTrustScore(entry.connectionHealth, cert);

    return {
      ...entry,
      id:                  `audit-${entry.domain}-${entry.entityKey}-${idx}`,
      domainLabel:         DOMAIN_LABELS[entry.domain] ?? entry.domain,
      flags,
      readinessWeight:     weight,
      isReady,
      lastSyncAt:          cert?.lastSyncAt ?? null,
      certificationStatus: cert?.certificationStatus ?? null,
      productionReady:     cert?.productionReady ?? false,
      validatedBy:         cert?.validatedBy ?? null,
      lastValidatedAt:     cert?.lastValidatedAt ?? null,
      confidenceScore:     cert?.confidenceScore ?? 0,
      businessApproved:    cert?.businessApproved ?? false,
      sagApproved:         cert?.sagApproved ?? false,
      trustScore:          trust.total,
      trustGrade:          trust.grade,
    };
  });

  // ── Phase 6: Domain readiness scores ────────────────────────────────────
  const domainKeys = [...new Set(rows.map(r => r.domain))];

  const byDomain: DomainAuditSummary[] = domainKeys.map(domain => {
    const domainRows = rows.filter(r => r.domain === domain);
    const label      = DOMAIN_LABELS[domain] ?? domain;

    // Weighted readiness: fully ready = 100%, partially ready = 50%
    let totalWeight  = 0;
    let earnedWeight = 0;

    const byHealth: DomainAuditSummary["byHealth"] = {
      live: 0, mock: 0, partial: 0, stale: 0,
      disconnected: 0, pending: 0, wrong_source: 0, manual: 0,
    };

    let criticalIssues = 0;
    let topBlockingScore = -1;
    let topBlockingKpi: string | null = null;

    for (const row of domainRows) {
      const w = row.readinessWeight;
      totalWeight += w;

      if (FULLY_READY.includes(row.connectionHealth)) {
        earnedWeight += w;
      } else if (PARTIALLY_READY.includes(row.connectionHealth)) {
        earnedWeight += w * 0.5;
      }

      const h = row.connectionHealth as keyof typeof byHealth;
      if (h in byHealth) byHealth[h]++;

      if (isCriticalIssue(row, row.flags)) {
        criticalIssues++;
        if (w > topBlockingScore) {
          topBlockingScore = w;
          topBlockingKpi   = row.entityLabel;
        }
      }
    }

    const readinessScore = totalWeight > 0
      ? Math.round((earnedWeight / totalWeight) * 100)
      : 0;

    return {
      domain: domain as OperationalDomainKey,
      label,
      readinessScore,
      totalKpis: domainRows.length,
      byHealth,
      criticalIssues,
      topBlockingKpi,
    };
  });

  // ── Overall scores ──────────────────────────────────────────────────────
  const totalKpis = rows.length;

  let globalTotalWeight  = 0;
  let globalEarnedWeight = 0;
  for (const row of rows) {
    globalTotalWeight += row.readinessWeight;
    if (FULLY_READY.includes(row.connectionHealth)) {
      globalEarnedWeight += row.readinessWeight;
    } else if (PARTIALLY_READY.includes(row.connectionHealth)) {
      globalEarnedWeight += row.readinessWeight * 0.5;
    }
  }

  const overallReadinessScore = globalTotalWeight > 0
    ? Math.round((globalEarnedWeight / globalTotalWeight) * 100)
    : 0;

  const totalIssues    = rows.filter(r => hasAnyIssue(r.flags)).length;
  const criticalIssues = rows.filter(r => isCriticalIssue(r, r.flags)).length;

  // ── Flag aggregates ─────────────────────────────────────────────────────
  const byFlag = {
    mock:           rows.filter(r => r.flags.isMock).length,
    partial:        rows.filter(r => r.flags.isPartial).length,
    stale:          rows.filter(r => r.flags.isStale).length,
    wrongSource:    rows.filter(r => r.flags.isWrongSource).length,
    manual:         rows.filter(r => r.flags.isManual).length,
    disconnected:   rows.filter(r => r.flags.isDisconnected).length,
    sagUnvalidated: rows.filter(r => r.flags.isSagUnvalidated).length,
  };

  return {
    generatedAt,
    organizationId,
    rows,
    byDomain,
    overallReadinessScore,
    totalKpis,
    totalIssues,
    criticalIssues,
    byFlag,
  };
}

// ─── Filter utilities ─────────────────────────────────────────────────────────

export function filterAuditRows(
  audit: OperationalConnectionAudit,
  opts: {
    domain?:     string;
    health?:     string;
    priority?:   string;
    flag?:       string;
    onlyIssues?: boolean;
  },
): OperationalConnectionAuditRow[] {
  let rows = audit.rows;

  if (opts.domain)     rows = rows.filter(r => r.domain === opts.domain);
  if (opts.health)     rows = rows.filter(r => r.connectionHealth === opts.health);
  if (opts.priority)   rows = rows.filter(r => r.priority === opts.priority);
  if (opts.onlyIssues) rows = rows.filter(r => hasAnyIssue(r.flags));

  if (opts.flag) {
    const f = opts.flag as keyof OperationalConnectionAuditRow["flags"];
    rows = rows.filter(r => r.flags[f] === true);
  }

  return rows;
}
