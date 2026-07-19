/**
 * lib/finance/intelligence/financial-evidence-engine.ts
 *
 * Builds evidence entries and identifies missing evidence gaps.
 * Every EvidenceEntry is deterministic: same data → same confidence.
 *
 * Confidence scoring rules:
 *   - count > 0 and state REAL     → 0.9
 *   - count > 0 and state PARTIAL  → 0.65
 *   - count > 0 and state STALE    → 0.4
 *   - count = 0 or state MISSING   → 0.0
 *   - state BROKEN                 → 0.1
 *
 * Note: FinancialGraph is an in-memory runtime (no Prisma model).
 * Graph node/edge counts come from the graph health summary, not Prisma.
 *
 * Sprint: AGENTIK-FINANCIAL-INTELLIGENCE-LAYER-01
 */

import { prisma }                                          from "@/lib/prisma";
import { getGraphHealthSummary }                           from "@/lib/finance/graph/graph-snapshot";
import { EvidenceEntry, EvidenceIndex, MissingEvidence, FinancialDataState } from "./financial-intelligence-types";
import { DataFreshnessReport }                             from "./financial-intelligence-types";

// ── Confidence derivation ─────────────────────────────────────────────────────

function deriveConfidence(count: number, state: FinancialDataState): number {
  if (count === 0 || state === "MISSING") return 0.0;
  if (state === "BROKEN")                 return 0.1;
  if (state === "STALE")                  return 0.4;
  if (state === "PARTIAL")                return 0.65;
  return 0.9; // REAL
}

function deriveState(count: number, isStale: boolean, isMissing: boolean): FinancialDataState {
  if (isMissing || count === 0) return "MISSING";
  if (isStale)                  return "STALE";
  return "REAL";
}

function makeEntry(
  label:   string,
  source:  string,
  model:   string,
  count:   number,
  syncAt:  Date | null,
  freshnessReport: DataFreshnessReport,
  notes?:  string,
): EvidenceEntry {
  const freshEntry = freshnessReport.sources.find(s => s.source === model);
  const isStale    = freshEntry ? freshEntry.isStale : syncAt === null;
  const isMissing  = !freshEntry || freshEntry.lastSyncAt === null;
  const state      = deriveState(count, isStale, isMissing);
  const confidence = deriveConfidence(count, state);
  return {
    label,
    source,
    model,
    count,
    confidence,
    state,
    syncAt: syncAt?.toISOString() ?? null,
    notes,
  };
}

// ── Source queries ────────────────────────────────────────────────────────────

async function countCollections(orgId: string) {
  return prisma.collectionRecord.count({ where: { organizationId: orgId } }).catch(() => 0);
}

async function latestCollectionAt(orgId: string): Promise<Date | null> {
  const r = await prisma.collectionRecord.findFirst({
    where: { organizationId: orgId }, orderBy: { createdAt: "desc" }, select: { createdAt: true },
  }).catch(() => null);
  return r?.createdAt ?? null;
}

async function countSales(orgId: string) {
  return prisma.saleRecord.count({ where: { organizationId: orgId } }).catch(() => 0);
}

async function latestSaleAt(orgId: string): Promise<Date | null> {
  // SaleRecord uses saleDate as its primary temporal field
  const r = await prisma.saleRecord.findFirst({
    where: { organizationId: orgId }, orderBy: { saleDate: "desc" }, select: { saleDate: true },
  }).catch(() => null);
  return r?.saleDate ?? null;
}

async function countReceivables(orgId: string) {
  return prisma.customerReceivable.count({ where: { organizationId: orgId } }).catch(() => 0);
}

async function latestReceivableAt(orgId: string): Promise<Date | null> {
  // CustomerReceivable uses syncedAt as its audit timestamp
  const r = await prisma.customerReceivable.findFirst({
    where: { organizationId: orgId }, orderBy: { syncedAt: "desc" }, select: { syncedAt: true },
  }).catch(() => null);
  return r?.syncedAt ?? null;
}

async function countBankAccounts(orgId: string) {
  return prisma.bankAccount.count({ where: { organizationId: orgId } }).catch(() => 0);
}

async function latestBankAccountAt(orgId: string): Promise<Date | null> {
  const r = await prisma.bankAccount.findFirst({
    where: { organizationId: orgId }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true },
  }).catch(() => null);
  return r?.updatedAt ?? null;
}

async function countBankMovements(orgId: string) {
  return prisma.bankMovement.count({ where: { organizationId: orgId } }).catch(() => 0);
}

async function latestBankMovementAt(orgId: string): Promise<Date | null> {
  const r = await prisma.bankMovement.findFirst({
    where: { organizationId: orgId }, orderBy: { createdAt: "desc" }, select: { createdAt: true },
  }).catch(() => null);
  return r?.createdAt ?? null;
}

async function countBudgets(orgId: string) {
  return prisma.budget.count({ where: { organizationId: orgId } }).catch(() => 0);
}

async function latestBudgetAt(orgId: string): Promise<Date | null> {
  const r = await prisma.budget.findFirst({
    where: { organizationId: orgId }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true },
  }).catch(() => null);
  return r?.updatedAt ?? null;
}

// ── Main evidence builder ─────────────────────────────────────────────────────

export async function buildEvidenceIndex(
  orgId:     string,
  freshness: DataFreshnessReport,
): Promise<EvidenceIndex> {
  const [
    colCount, colAt,
    saleCount, saleAt,
    recvCount, recvAt,
    bankAccCount, bankAccAt,
    bankMovCount, bankMovAt,
    budgetCount, budgetAt,
    graphHealth,
  ] = await Promise.all([
    countCollections(orgId),         latestCollectionAt(orgId),
    countSales(orgId),               latestSaleAt(orgId),
    countReceivables(orgId),         latestReceivableAt(orgId),
    countBankAccounts(orgId),        latestBankAccountAt(orgId),
    countBankMovements(orgId),       latestBankMovementAt(orgId),
    countBudgets(orgId),             latestBudgetAt(orgId),
    getGraphHealthSummary(orgId).catch(() => null),
  ]);

  const graphNodeCount = graphHealth?.totalNodes ?? 0;
  const graphEdgeCount = graphHealth?.totalEdges ?? 0;
  // Use CollectionRecord as freshness proxy for FinancialGraph
  const graphAt        = colAt;

  const index: EvidenceIndex = {
    collections:    makeEntry("Recaudos registrados",          "CollectionRecord",   "CollectionRecord",   colCount,      colAt,      freshness),
    sales:          makeEntry("Facturas / ventas registradas", "SaleRecord",         "SaleRecord",         saleCount,     saleAt,     freshness),
    receivables:    makeEntry("Cuentas por cobrar",            "CustomerReceivable", "CustomerReceivable", recvCount,     recvAt,     freshness),
    bankAccounts:   makeEntry("Cuentas bancarias",             "BankAccount",        "BankAccount",        bankAccCount,  bankAccAt,  freshness),
    bankMovements:  makeEntry("Movimientos bancarios",         "BankMovement",       "BankMovement",       bankMovCount,  bankMovAt,  freshness),
    budgets:        makeEntry("Presupuestos",                  "Budget",             "Budget",             budgetCount,   budgetAt,   freshness),
    graphNodes:     makeEntry(
      "Nodos del grafo financiero",
      "FinancialGraph",
      "FinancialGraph",
      graphNodeCount,
      graphAt,
      freshness,
      graphNodeCount === 0 ? "Grafo vacío — construir desde fuentes primarias" : undefined,
    ),
    graphEdges:     makeEntry(
      "Relaciones del grafo financiero",
      "FinancialGraph",
      "FinancialGraph",
      graphEdgeCount,
      graphAt,
      freshness,
      graphNodeCount === 0 ? "Sin nodos — edges inútiles" : undefined,
    ),
  };

  return index;
}

// ── Missing evidence detector ─────────────────────────────────────────────────

export function detectMissingEvidence(index: EvidenceIndex): MissingEvidence[] {
  const gaps: MissingEvidence[] = [];

  if (index.bankAccounts?.state === "MISSING") {
    gaps.push({
      what:     "Cuentas bancarias no configuradas",
      affects:  ["liquidez", "conciliacion", "tesoreria"],
      severity: "critical",
      action:   "Conectar al menos una cuenta bancaria vía integración bancaria",
    });
  }

  if (index.bankMovements?.state === "MISSING" && (index.bankAccounts?.count ?? 0) > 0) {
    gaps.push({
      what:     "Sin movimientos bancarios recientes",
      affects:  ["conciliacion", "liquidez"],
      severity: "high",
      action:   "Sincronizar movimientos bancarios — última actualización ausente",
    });
  }

  if (index.collections?.state === "MISSING") {
    gaps.push({
      what:     "Sin registros de recaudo",
      affects:  ["liquidez", "cobranza", "cierre"],
      severity: "high",
      action:   "Registrar pagos recibidos o importar desde fuente contable",
    });
  }

  if (index.receivables?.state === "MISSING") {
    gaps.push({
      what:     "Cartera no cargada",
      affects:  ["cobranza", "cierre"],
      severity: "medium",
      action:   "Importar cartera de clientes desde SAG o sistema contable",
    });
  }

  if (index.budgets?.state === "MISSING") {
    gaps.push({
      what:     "Sin presupuestos definidos",
      affects:  ["planeacion"],
      severity: "medium",
      action:   "Crear presupuesto en módulo Planeación para activar análisis FPA",
    });
  }

  if (index.graphNodes?.state === "MISSING") {
    gaps.push({
      what:     "Grafo financiero vacío",
      affects:  ["conciliacion", "cierre", "integridad"],
      severity: "high",
      action:   "Ejecutar construcción inicial del grafo financiero",
    });
  }

  if (index.bankAccounts?.state === "STALE") {
    gaps.push({
      what:     "Cuentas bancarias desactualizadas",
      affects:  ["liquidez", "tesoreria"],
      severity: "high",
      action:   "Forzar re-sincronización de cuentas bancarias",
    });
  }

  return gaps;
}
