/**
 * lib/integrations/sag/data-contract/sag-field-catalog.ts
 *
 * SAG Field Catalog — flat index of all fields across all domains,
 * with KPI traceability and module impact matrix.
 *
 * Use this catalog to:
 * - Understand what SAG field powers which Agentik KPI
 * - Identify which modules go dark when a SAG field is unavailable
 * - Generate access requests to SAG with a single domain list
 *
 * Sprint: AGENTIK-SAG-DATA-CONTRACT-01
 */

import { SAG_MASTER_CONTRACT }   from "./sag-domain-contracts";
import type { SagField, AgentikKpi, AgentikModule, SagDomainId } from "./sag-data-contract";

// ── Extended catalog entry ─────────────────────────────────────────────────────

export interface CatalogEntry extends SagField {
  domain:   SagDomainId;
  viewName: string;       // Suggested vw_agentik_* view that should expose this field
}

// ── Build flat catalog from master contract ────────────────────────────────────

export const SAG_FIELD_CATALOG: CatalogEntry[] = SAG_MASTER_CONTRACT.domains.flatMap(domain =>
  domain.fields.map(field => ({
    ...field,
    domain:   domain.id,
    viewName: domain.suggestedView ?? `vw_agentik_${domain.id}`,
  }))
);

// ── KPI → Fields traceability matrix ──────────────────────────────────────────
//
// Answer: "Which SAG fields must be available to compute a given KPI?"

export type KpiTraceabilityMatrix = Record<AgentikKpi, CatalogEntry[]>;

export function buildKpiTraceabilityMatrix(): KpiTraceabilityMatrix {
  const matrix = {} as KpiTraceabilityMatrix;

  for (const entry of SAG_FIELD_CATALOG) {
    for (const kpi of entry.kpiTraceability) {
      if (!matrix[kpi]) matrix[kpi] = [];
      matrix[kpi].push(entry);
    }
  }

  return matrix;
}

// ── Module → Fields impact matrix ─────────────────────────────────────────────
//
// Answer: "Which SAG fields does module X depend on?"

export type ModuleFieldMatrix = Record<AgentikModule, CatalogEntry[]>;

export function buildModuleFieldMatrix(): ModuleFieldMatrix {
  const matrix = {} as ModuleFieldMatrix;

  for (const entry of SAG_FIELD_CATALOG) {
    for (const mod of entry.modulosImpactados) {
      if (!matrix[mod]) matrix[mod] = [];
      matrix[mod].push(entry);
    }
  }

  return matrix;
}

// ── Fields by status ───────────────────────────────────────────────────────────

export function getFieldsByStatus(status: SagField["status"]): CatalogEntry[] {
  return SAG_FIELD_CATALOG.filter(f => f.status === status);
}

export function getMandatoryFields(): CatalogEntry[] {
  return SAG_FIELD_CATALOG.filter(f => f.obligatorio);
}

export function getBlockedMandatoryFields(): CatalogEntry[] {
  return SAG_FIELD_CATALOG.filter(f =>
    f.obligatorio && (f.status === "pending_access" || f.status === "unavailable")
  );
}

// ── View → Fields index ────────────────────────────────────────────────────────
//
// Answer: "What columns should each vw_agentik_* view contain?"

export type ViewFieldIndex = Record<string, CatalogEntry[]>;

export function buildViewFieldIndex(): ViewFieldIndex {
  const index: ViewFieldIndex = {};

  for (const entry of SAG_FIELD_CATALOG) {
    if (!index[entry.viewName]) index[entry.viewName] = [];
    index[entry.viewName].push(entry);
  }

  return index;
}

// ── Integration readiness by domain ───────────────────────────────────────────
//
// Returns a readiness score 0–100 for each domain based on field access status.

export interface DomainReadiness {
  domain:          SagDomainId;
  totalFields:     number;
  confirmedFields: number;
  mandatoryReady:  number;
  mandatoryTotal:  number;
  score:           number;   // 0–100, based on mandatory fields
  blockers:        string[]; // Campo names that are mandatory but not confirmed
}

export function computeDomainReadiness(): DomainReadiness[] {
  return SAG_MASTER_CONTRACT.domains.map(domain => {
    const fields          = domain.fields;
    const confirmed       = fields.filter(f => f.status === "confirmed" || f.status === "agreed").length;
    const mandatory       = fields.filter(f => f.obligatorio);
    const mandatoryReady  = mandatory.filter(f => f.status === "confirmed" || f.status === "agreed").length;
    const blockers        = mandatory
      .filter(f => f.status !== "confirmed" && f.status !== "agreed")
      .map(f => f.campo);

    const score = mandatory.length === 0
      ? 0
      : Math.round((mandatoryReady / mandatory.length) * 100);

    return {
      domain:          domain.id,
      totalFields:     fields.length,
      confirmedFields: confirmed,
      mandatoryReady,
      mandatoryTotal:  mandatory.length,
      score,
      blockers,
    };
  });
}

// ── Access request summary ─────────────────────────────────────────────────────
//
// Generates a human-readable list of SAG tables/views that Agentik
// needs access to, grouped by domain and priority.

export interface AccessRequest {
  domain:          SagDomainId;
  prioridad:       1 | 2 | 3;
  tablesNeeded:    string[];
  viewToCreate:    string;
  mandatoryFields: string[];
  optionalFields:  string[];
}

export function buildAccessRequestList(): AccessRequest[] {
  return SAG_MASTER_CONTRACT.domains
    .sort((a, b) => a.prioridad - b.prioridad)
    .map(domain => ({
      domain:          domain.id,
      prioridad:       domain.prioridad,
      tablesNeeded:    domain.primaryTables,
      viewToCreate:    domain.suggestedView ?? `vw_agentik_${domain.id}`,
      mandatoryFields: domain.fields.filter(f => f.obligatorio).map(f => f.campo),
      optionalFields:  domain.fields.filter(f => !f.obligatorio).map(f => f.campo),
    }));
}

// ── Executive summary ──────────────────────────────────────────────────────────

export interface ContractExecutiveSummary {
  totalDomains:          number;
  domainsAgreed:         number;
  domainsInReview:       number;
  domainsDraft:          number;
  totalFields:           number;
  fieldsConfirmed:       number;
  fieldsPendingAccess:   number;
  fieldsUnconfirmed:     number;
  viewsToRequest:        number;
  viewsSubmitted:        number;
  viewsReady:            number;
  criticalKpisUnlocked:  AgentikKpi[];
  criticalKpisBlocked:   AgentikKpi[];
}

export function buildExecutiveSummary(): ContractExecutiveSummary {
  const domains        = SAG_MASTER_CONTRACT.domains;
  const fields         = SAG_FIELD_CATALOG;
  const views          = SAG_MASTER_CONTRACT.viewRequests;
  const kpiMatrix      = buildKpiTraceabilityMatrix();

  const criticalKpis: AgentikKpi[] = [
    "ventas_brutas", "ventas_netas", "pagos_recibidos",
    "cartera_vencida", "cartera_corriente", "recaudos_dia",
    "saldo_bancos", "flujo_caja_operativo",
  ];

  const criticalKpisUnlocked = criticalKpis.filter(kpi => {
    const required = kpiMatrix[kpi] ?? [];
    return required.length > 0 && required.every(f =>
      f.status === "confirmed" || f.status === "agreed"
    );
  });

  const criticalKpisBlocked = criticalKpis.filter(kpi =>
    !criticalKpisUnlocked.includes(kpi)
  );

  return {
    totalDomains:         domains.length,
    domainsAgreed:        domains.filter(d => d.status === "agreed" || d.status === "integrated").length,
    domainsInReview:      domains.filter(d => d.status === "in_review").length,
    domainsDraft:         domains.filter(d => d.status === "draft").length,
    totalFields:          fields.length,
    fieldsConfirmed:      fields.filter(f => f.status === "confirmed" || f.status === "agreed").length,
    fieldsPendingAccess:  fields.filter(f => f.status === "pending_access" || f.status === "pending_view").length,
    fieldsUnconfirmed:    fields.filter(f => f.status === "unconfirmed").length,
    viewsToRequest:       views.length,
    viewsSubmitted:       views.filter(v => v.status !== "not_submitted").length,
    viewsReady:           views.filter(v => v.status === "ready" || v.status === "integrated").length,
    criticalKpisUnlocked,
    criticalKpisBlocked,
  };
}
