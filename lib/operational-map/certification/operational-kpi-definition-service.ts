/**
 * lib/operational-map/certification/operational-kpi-definition-service.ts
 *
 * Operational KPI Definition — Service Layer.
 *
 * INTERNAL ONLY: SUPER_ADMIN / AGENTIK_ADMIN
 *
 * Manages user-created KPI definitions. These supplement the static registry
 * with KPIs discovered during SAG meetings or operations.
 *
 * Sprint: AGENTIK-LIVE-KPI-CERTIFICATION-WORKSPACE-01
 */

import { prisma } from "@/lib/prisma";
import type { KpiRegistryEntry } from "../audit/operational-connection-audit-types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KpiDefinitionRecord {
  id:              string;
  organizationId:  string;
  kpiKey:          string;
  domain:          string;
  entityLabel:     string;
  kpiDefinition:   string;
  priority:        string;
  frequency:       string;
  sourceOfTruth:   string | null;
  formula:         string | null;
  // Governance fields (AGENTIK-OPS-CERTIFICATION-GOVERNANCE-01)
  formulaExpression:    string | null;
  formulaDescription:   string | null;
  businessDefinition:   string | null;
  dependencyType:       string | null;
  criticality:          string | null;
  sagContributions:     string[];
  agentikContributions: string[];
  expectedSources: string[];
  affectedModules: string[];
  ownerTechnical:  string | null;
  ownerBusiness:   string | null;
  ownerSag:        string | null;
  notes:           string | null;
  createdBy:       string;
  createdAt:       string;
  updatedAt:       string;
}

export interface KpiDefinitionCreateInput {
  organizationId:  string;
  domain:          string;
  entityLabel:     string;
  kpiDefinition:   string;
  priority?:       string;
  frequency?:      string;
  sourceOfTruth?:  string;
  formula?:        string;
  // Governance fields
  formulaExpression?:    string;
  formulaDescription?:   string;
  businessDefinition?:   string;
  dependencyType?:       string;
  criticality?:          string;
  sagContributions?:     string[];
  agentikContributions?: string[];
  expectedSources?: string[];
  affectedModules?: string[];
  ownerTechnical?:  string;
  ownerBusiness?:   string;
  ownerSag?:        string;
  notes?:           string;
  createdBy:        string;
}

export interface KpiDefinitionUpdateInput {
  entityLabel?:    string;
  kpiDefinition?:  string;
  priority?:       string;
  frequency?:      string;
  sourceOfTruth?:  string;
  formula?:        string;
  // Governance fields
  formulaExpression?:    string;
  formulaDescription?:   string;
  businessDefinition?:   string;
  dependencyType?:       string;
  criticality?:          string;
  sagContributions?:     string[];
  agentikContributions?: string[];
  expectedSources?: string[];
  affectedModules?: string[];
  ownerTechnical?:  string;
  ownerBusiness?:   string;
  ownerSag?:        string;
  notes?:           string;
}

// ─── Domain labels ────────────────────────────────────────────────────────────

const DOMAIN_LABELS: Record<string, string> = {
  torre_control: "Torre de Control", comercial: "Comercial",
  inventario: "Inventario", produccion: "Producción",
  cartera: "Cartera", cobranza: "Cobranza", tesoreria: "Tesorería",
  finanzas: "Finanzas", crm_pedidos: "CRM / Pedidos",
  customer_360: "Customer 360", logistica: "Logística",
  inteligencia_operacional: "Inteligencia Operacional", conciliacion: "Conciliación",
};

// ─── Delegate guard ───────────────────────────────────────────────────────────

function getDelegate() {
  const d = prisma.operationalKpiDefinition;
  if (!d) {
    console.warn(
      "[OperationalKpiDefinition] Prisma delegate not found. " +
      "Run: npx prisma generate && npx prisma db push, then restart the dev server.",
    );
    throw new Error("PRISMA_DELEGATE_MISSING: operationalKpiDefinition");
  }
  return d;
}

// ─── Row mapper ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): KpiDefinitionRecord {
  return {
    id:              r.id,
    organizationId:  r.organizationId,
    kpiKey:          r.kpiKey,
    domain:          r.domain,
    entityLabel:     r.entityLabel,
    kpiDefinition:   r.kpiDefinition,
    priority:        r.priority,
    frequency:       r.frequency,
    sourceOfTruth:   r.sourceOfTruth ?? null,
    formula:         r.formula ?? null,
    formulaExpression:    r.formulaExpression    ?? null,
    formulaDescription:   r.formulaDescription   ?? null,
    businessDefinition:   r.businessDefinition   ?? null,
    dependencyType:       r.dependencyType       ?? null,
    criticality:          r.criticality          ?? null,
    sagContributions:     Array.isArray(r.sagContributions)     ? r.sagContributions     : [],
    agentikContributions: Array.isArray(r.agentikContributions) ? r.agentikContributions : [],
    expectedSources: Array.isArray(r.expectedSources) ? r.expectedSources : [],
    affectedModules: Array.isArray(r.affectedModules) ? r.affectedModules : [],
    ownerTechnical:  r.ownerTechnical ?? null,
    ownerBusiness:   r.ownerBusiness ?? null,
    ownerSag:        r.ownerSag ?? null,
    notes:           r.notes ?? null,
    createdBy:       r.createdBy,
    createdAt:       r.createdAt.toISOString(),
    updatedAt:       r.updatedAt.toISOString(),
  };
}

// ─── Key generation ───────────────────────────────────────────────────────────

function generateKpiKey(domain: string, label: string): string {
  return `custom_${domain}_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40)}_${Date.now().toString(36)}`;
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function getAllKpiDefinitions(
  organizationId: string,
): Promise<KpiDefinitionRecord[]> {
  const rows = await getDelegate().findMany({
    where:   { organizationId },
    orderBy: [{ domain: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(mapRow);
}

export async function getKpiDefinition(
  organizationId: string,
  kpiKey:         string,
): Promise<KpiDefinitionRecord | null> {
  const row = await getDelegate().findUnique({
    where: { organizationId_kpiKey: { organizationId, kpiKey } },
  });
  return row ? mapRow(row) : null;
}

export async function createKpiDefinition(
  input: KpiDefinitionCreateInput,
): Promise<KpiDefinitionRecord> {
  const kpiKey = generateKpiKey(input.domain, input.entityLabel);
  const row = await getDelegate().create({
    data: {
      organizationId:  input.organizationId,
      kpiKey,
      domain:          input.domain,
      entityLabel:     input.entityLabel,
      kpiDefinition:   input.kpiDefinition,
      priority:        input.priority ?? "medium",
      frequency:       input.frequency ?? "daily",
      sourceOfTruth:   input.sourceOfTruth ?? null,
      formula:         input.formula ?? null,
      formulaExpression:    input.formulaExpression    ?? null,
      formulaDescription:   input.formulaDescription   ?? null,
      businessDefinition:   input.businessDefinition   ?? null,
      dependencyType:       input.dependencyType       ?? null,
      criticality:          input.criticality          ?? "OPERATIONAL",
      sagContributions:     input.sagContributions     ?? [],
      agentikContributions: input.agentikContributions ?? [],
      expectedSources: input.expectedSources ?? [],
      affectedModules: input.affectedModules ?? [],
      ownerTechnical:  input.ownerTechnical ?? null,
      ownerBusiness:   input.ownerBusiness ?? null,
      ownerSag:        input.ownerSag ?? null,
      notes:           input.notes ?? null,
      createdBy:       input.createdBy,
    },
  });
  return mapRow(row);
}

export async function updateKpiDefinition(
  organizationId: string,
  kpiKey:         string,
  input:          KpiDefinitionUpdateInput,
): Promise<KpiDefinitionRecord> {
  const row = await getDelegate().update({
    where: { organizationId_kpiKey: { organizationId, kpiKey } },
    data:  input,
  });
  return mapRow(row);
}

export async function deleteKpiDefinition(
  organizationId: string,
  kpiKey:         string,
): Promise<void> {
  await getDelegate().delete({
    where: { organizationId_kpiKey: { organizationId, kpiKey } },
  });
}

/**
 * Convert a KpiDefinitionRecord to the KpiRegistryEntry shape
 * so it can be merged with the static registry in the audit generator.
 */
export function definitionToRegistryEntry(def: KpiDefinitionRecord): KpiRegistryEntry {
  return {
    domain:              def.domain as KpiRegistryEntry["domain"],
    entityKey:           def.kpiKey,
    entityLabel:         def.entityLabel,
    kpiDefinition:       def.kpiDefinition,
    priority:            def.priority as KpiRegistryEntry["priority"],
    frequency:           (def.frequency as KpiRegistryEntry["frequency"]) ?? "daily",
    sourceOfTruth:       (def.sourceOfTruth ?? "Agentik") as KpiRegistryEntry["sourceOfTruth"],
    expectedSources:     def.expectedSources,
    actualSources:       [],
    connectionHealth:    "pending",
    dataFreshness:       "unknown",
    confidenceLevel:     "none",
    sagQueryStatus:      "placeholder",
    sagTableConfirmed:   false,
    sagFieldsConfirmed:  false,
    riskDescription:     def.notes ?? "KPI definido en reunión — fuente pendiente de confirmar.",
    recommendedAction:   "Configurar fuentes y aprobar en Centro de Certificación.",
    affectedModules:     def.affectedModules,
  };
}
