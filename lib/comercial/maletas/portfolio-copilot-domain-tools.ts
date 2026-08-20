/**
 * lib/comercial/maletas/portfolio-copilot-domain-tools.ts
 *
 * AGENTIK-COPILOT-SALES-PORTFOLIO-READINESS-01
 *
 * Domain tool adapters for Sales Portfolio / Maletas Copilot.
 *
 * Every function:
 *   - Requires organizationId (tenant isolation)
 *   - Returns structured facts with provenance (never prose)
 *   - Wraps existing certified server authorities (no new DB queries)
 *   - Has no React dependency
 *   - Has no LLM dependency
 *
 * Canonical authorities consumed:
 *   - vendor-sample-loader.ts         → loadVendorSampleData()
 *   - supply-plan-engine.ts           → buildSalesPortfolioSupplyPlan() + copilot accessors
 *   - maletas-functional-evaluation.ts → evaluateVendorAssortment(), evaluateProductionThresholds()
 *   - maletas-canonical-inventory.ts   → MALETA_REMOVAL_LIMITS, MALETA_COVERAGE_MINIMUMS
 *   - vendor-sample-presence-engine.ts → VENDOR_BODEGA_CONFIGS
 *
 * Legacy exclusions:
 *   - maletas-runtime.ts              → LEGACY_DEAD_PATH (Excel-based)
 *   - maletas-ingestion.ts            → LEGACY_DEAD_PATH
 *   - reference-decision-engine.ts    → LEGACY (CCS-based decisions)
 *
 * SERVER ONLY — never import from client components.
 */

import "server-only";

import { loadVendorSampleData } from "./vendor-sample-loader";
import {
  getSampleCoverageSummary,
  getSampleCoverageNeeds,
  getSampleCoverageCandidates,
} from "./sample-coverage-engine";
import { VENDOR_BODEGA_CONFIGS } from "./vendor-sample-presence-engine";
import {
  MALETA_REMOVAL_LIMITS,
} from "./maletas-canonical-inventory";
import type {
  VendorSampleSnapshot,
  VendorSampleRef,
  ProductionSuggestion,
} from "./vendor-sample-types";
import type { SampleCoverageResult } from "./sample-coverage-engine";
import type {
  DataProvenance,
  DomainToolDefinition,
  PortfolioListResult,
  PortfolioDetailResult,
  PortfolioReferencesResult,
  PortfolioReferenceItem,
  WithdrawalResult,
  WithdrawalItem,
  DerroteroCoverageResult,
  DerroteroCoverageLineEntry,
  SupplyNeedsResult,
  SupplyNeedItem,
  SupplyCandidatesResult,
  SupplyCandidateItem,
  ProductionSignalsResult,
  ProductionSignalItem,
  CoverageOpportunitiesResult,
  CoverageOpportunityItem,
  PortfolioAttentionResult,
  PortfolioAttentionItem,
  PortfolioComparisonResult,
  PortfolioComparisonItem,
  SharedNeedsResult,
  SharedNeedItem,
  MultiVendorCandidatesResult,
  MultiVendorCandidateItem,
  OpDependentNeedsResult,
  OpDependentNeedItem,
} from "./portfolio-copilot-domain-types";

// ── Shared data loader (cached per request) ────────────────────────────────

type LoadedData = Awaited<ReturnType<typeof loadVendorSampleData>>;

function provenance(loadedAt: string, extra?: string[]): DataProvenance {
  return {
    source: "vendor-sample-loader (SAG SOAP + Prisma)",
    asOf: loadedAt,
    limitations: [
      "Snapshot at request time — not real-time",
      ...(extra ?? []),
    ],
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. getSalesPortfolios — list all portfolios
// ══════════════════════════════════════════════════════════════════════════════

export async function getSalesPortfolios(
  orgId: string,
): Promise<PortfolioListResult> {
  const data = await loadVendorSampleData(orgId);
  return {
    portfolios: data.vendors.map((v) => ({
      vendorId: v.vendorId,
      vendorName: v.vendorName,
      isActive: v.isActive,
      totalRefs: v.totalRefs,
      totalUnits: v.totalUnits,
      health: v.health,
      replaceRefs: v.replaceRefs,
      healthyRefs: v.healthyRefs,
      provenance: provenance(data.loadedAt),
    })),
    provenance: provenance(data.loadedAt),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. getSalesPortfolio — single portfolio detail
// ══════════════════════════════════════════════════════════════════════════════

export async function getSalesPortfolio(
  orgId: string,
  vendorId: string,
): Promise<PortfolioDetailResult | null> {
  const data = await loadVendorSampleData(orgId);
  const v = data.vendors.find((x) => x.vendorId === vendorId);
  if (!v) return null;
  return {
    vendorId: v.vendorId,
    vendorName: v.vendorName,
    isActive: v.isActive,
    totalRefs: v.totalRefs,
    totalUnits: v.totalUnits,
    estimatedValue: v.estimatedValue,
    health: v.health,
    healthyRefs: v.healthyRefs,
    replaceRefs: v.replaceRefs,
    sinDatosRefs: v.sinDatosRefs,
    riesgoAgotamientoRefs: v.riesgoAgotamientoRefs,
    lines: v.lines,
    provenance: provenance(data.loadedAt),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. getSalesPortfolioReferences — refs in a portfolio
// ══════════════════════════════════════════════════════════════════════════════

function mapRef(r: VendorSampleRef): PortfolioReferenceItem {
  return {
    reference: r.reference,
    description: r.description,
    line: r.line,
    subgrupoSag: r.subgrupoSag,
    grupoSag: r.grupoSag,
    sizeClass: r.sizeClass,
    centralAvailable: r.centralAvailable,
    stockDataState: r.stockDataState,
    sampleState: r.state,
    commercialHealth: r.commercialHealth,
    suggestedAction: r.suggestedAction,
    suggestedActionExplanation: null,
    imageUrl: r.imageUrl,
  };
}

export async function getSalesPortfolioReferences(
  orgId: string,
  vendorId: string,
  options?: { line?: string },
): Promise<PortfolioReferencesResult | null> {
  const data = await loadVendorSampleData(orgId);
  const v = data.vendors.find((x) => x.vendorId === vendorId);
  if (!v) return null;

  let refs = v.refs.filter((r) => r.state !== "reemplazar");
  if (options?.line) refs = refs.filter((r) => r.line === options.line);

  return {
    vendorId: v.vendorId,
    vendorName: v.vendorName,
    references: refs.map(mapRef),
    provenance: provenance(data.loadedAt),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. getSalesPortfolioWithdrawalItems — retiro refs
// ══════════════════════════════════════════════════════════════════════════════

export async function getSalesPortfolioWithdrawalItems(
  orgId: string,
  vendorId: string,
): Promise<WithdrawalResult | null> {
  const data = await loadVendorSampleData(orgId);
  const v = data.vendors.find((x) => x.vendorId === vendorId);
  if (!v) return null;

  const retiro = v.refs.filter((r) => r.state === "reemplazar");
  const items: WithdrawalItem[] = retiro.map((r) => ({
    reference: r.reference,
    description: r.description,
    line: r.line,
    subgrupoSag: r.subgrupoSag,
    centralAvailable: r.centralAvailable,
    removalReason: "stock_below_threshold",
    removalDomain: "OPERATIONAL",
    imageUrl: r.imageUrl ?? null,
  }));

  return {
    vendorId: v.vendorId,
    vendorName: v.vendorName,
    items,
    provenance: provenance(data.loadedAt),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. getSalesPortfolioDerrotero — effective assortment catalog
// ══════════════════════════════════════════════════════════════════════════════

export async function getSalesPortfolioDerrotero(
  orgId: string,
  vendorId: string,
): Promise<DerroteroCoverageResult | null> {
  const data = await loadVendorSampleData(orgId);
  const v = data.vendors.find((x) => x.vendorId === vendorId);
  if (!v) return null;

  const coverageAll = getSampleCoverageSummary(data.sampleCoverage);
  const vc = coverageAll.find((c) => c.vendorId === vendorId);

  if (!vc) {
    return {
      vendorId, vendorName: v.vendorName,
      lines: [], overallCompletionPct: 0,
      provenance: provenance(data.loadedAt, ["No derrotero configured for this vendor"]),
    };
  }

  // Break coverage down by line from sample coverage positions
  const vendorCov = data.sampleCoverage.vendorCoverages.find((p) => p.vendorId === vendorId);
  const byLine = new Map<string, DerroteroCoverageLineEntry>();

  if (vendorCov) {
    for (const pos of vendorCov.positions) {
      const lineKey = resolveLineKey(pos.commercialWorld, pos.brand);
      if (!byLine.has(lineKey)) {
        byLine.set(lineKey, { line: lineKey, completionPct: 0, totalEntries: 0, completeEntries: 0, missingEntries: 0, excessEntries: 0 });
      }
      const entry = byLine.get(lineKey)!;
      entry.totalEntries++;
      if (pos.missingReferences <= 0) entry.completeEntries++;
      else entry.missingEntries++;
    }

    // Add excess from coverage
    for (const excess of vendorCov.excessPositions ?? []) {
      const lineKey = resolveLineKey(excess.commercialWorld, excess.brand);
      if (!byLine.has(lineKey)) {
        byLine.set(lineKey, { line: lineKey, completionPct: 0, totalEntries: 0, completeEntries: 0, missingEntries: 0, excessEntries: 0 });
      }
      byLine.get(lineKey)!.excessEntries++;
    }

    for (const entry of byLine.values()) {
      entry.completionPct = entry.totalEntries > 0
        ? Math.round((entry.completeEntries / entry.totalEntries) * 100)
        : 0;
    }
  }

  return {
    vendorId, vendorName: v.vendorName,
    lines: [...byLine.values()],
    overallCompletionPct: vc.completionPct,
    provenance: provenance(data.loadedAt),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. getSalesPortfolioCoverageForVendor — sample coverage needs for a vendor
// ══════════════════════════════════════════════════════════════════════════════

export async function getSalesPortfolioCoverageForVendor(
  orgId: string,
  vendorId: string,
): Promise<SupplyNeedsResult | null> {
  const data = await loadVendorSampleData(orgId);
  const v = data.vendors.find((x) => x.vendorId === vendorId);
  if (!v) return null;

  const allNeeds = getSampleCoverageNeeds(data.sampleCoverage);
  const vendorNeeds = allNeeds.filter((n) => n.vendorId === vendorId);

  const needs: SupplyNeedItem[] = vendorNeeds.map((n) => {
    const vc = data.sampleCoverage.vendorCoverages.find((p) => p.vendorId === vendorId);
    const pos = vc?.positions.find((p) => p.subgroupName === n.subgroupName);
    return {
      subgroupName: n.subgroupName,
      brand: n.brand,
      commercialWorld: pos?.commercialWorld ?? "",
      missingReferences: n.missingReferences,
      bestAction: n.status,
      bestActionExplanation: n.statusExplanation,
      candidateCount: n.candidateCount,
    };
  });

  return {
    vendorId, vendorName: v.vendorName,
    needs,
    provenance: provenance(data.loadedAt),
  };
}

/** @deprecated Use getSalesPortfolioCoverageForVendor */
export const getSalesPortfolioSupplyPlanForVendor = getSalesPortfolioCoverageForVendor;

// ══════════════════════════════════════════════════════════════════════════════
// 7. getSalesPortfolioCoverageCandidatesForPosition
// ══════════════════════════════════════════════════════════════════════════════

export async function getSalesPortfolioCoverageCandidatesForPosition(
  orgId: string,
  vendorId: string,
  subgroupName: string,
): Promise<SupplyCandidatesResult> {
  const data = await loadVendorSampleData(orgId);
  const raw = getSampleCoverageCandidates(data.sampleCoverage, vendorId, subgroupName);

  const candidates: SupplyCandidateItem[] = raw.map((c) => ({
    reference: c.reference,
    description: c.description,
    action: c.status,
    source: c.source,
    availableQty: c.availableQty,
    pendingQty: c.pendingQty,
    pendingQtyQuality: c.pendingQty != null ? "ESTIMATED" : null,
    opNumber: c.opNumber,
    confidence: "HIGH",
    explanation: c.explanation,
  }));

  return {
    vendorId, subgroupName, candidates,
    provenance: provenance(data.loadedAt, [
      "pendingQtyQuality=ESTIMATED when OP line data unavailable",
    ]),
  };
}

/** @deprecated Use getSalesPortfolioCoverageCandidatesForPosition */
export async function getSalesPortfolioSupplyCandidatesForPosition(
  orgId: string,
  vendorId: string,
  subgroupName: string,
): Promise<SupplyCandidatesResult> {
  return getSalesPortfolioCoverageCandidatesForPosition(orgId, vendorId, subgroupName);
}

// ══════════════════════════════════════════════════════════════════════════════
// 8. getSalesPortfolioProductionSignals
// ══════════════════════════════════════════════════════════════════════════════

export async function getSalesPortfolioProductionSignals(
  orgId: string,
): Promise<ProductionSignalsResult> {
  const data = await loadVendorSampleData(orgId);
  const signals: ProductionSignalItem[] = data.productionSuggestions.map((p: ProductionSuggestion) => ({
    subgrupoSag: p.subgrupoSag,
    line: p.line,
    centralAvailable: p.centralAvailable,
    minimumRequired: p.minimumRequired,
    shortfall: p.shortfall,
    suggestedQty: p.suggestedQty,
    urgency: p.urgency,
    affectedVendorCount: p.affectedVendors.length,
    reason: p.reasonType,
  }));

  return {
    signals,
    provenance: provenance(data.loadedAt),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 9. getSalesPortfolioCoverageOpportunities
// ══════════════════════════════════════════════════════════════════════════════

export async function getSalesPortfolioCoverageOpportunities(
  orgId: string,
): Promise<CoverageOpportunitiesResult> {
  const data = await loadVendorSampleData(orgId);
  const cr = data.coverageResult;

  const mapTextile = (r: LoadedData["coverageResult"]["textileCoverage"][number]): CoverageOpportunityItem => ({
    reference: r.replacementReference,
    description: r.replacementDescription,
    line: r.line,
    subgrupoSag: r.subgroup,
    grupoSag: r.group ?? null,
    sizeClass: null,
    centralAvailable: r.availableNow ?? 0,
    eligibleVendorCount: r.targets?.length ?? 0,
  });

  const mapImport = (r: LoadedData["coverageResult"]["importCoverage"][number]): CoverageOpportunityItem => ({
    reference: r.replacementReference,
    description: r.replacementDescription,
    line: "IMPORT",
    subgrupoSag: r.sizeClass,
    grupoSag: null,
    sizeClass: r.sizeClass,
    centralAvailable: r.availableNow,
    eligibleVendorCount: r.targets?.length ?? 0,
  });

  return {
    textileOpportunities: cr.textileCoverage.map(mapTextile),
    importOpportunities: cr.importCoverage.map(mapImport),
    provenance: provenance(data.loadedAt),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 10. emitPortfolioAttentionSignals — deterministic attention
// ══════════════════════════════════════════════════════════════════════════════

export async function emitPortfolioAttentionSignals(
  orgId: string,
): Promise<PortfolioAttentionResult> {
  const data = await loadVendorSampleData(orgId);
  const now = new Date().toISOString();
  const items: PortfolioAttentionItem[] = [];

  for (const v of data.vendors) {
    if (!v.isActive) continue;

    const retiroRefs = v.refs.filter((r) => r.state === "reemplazar");
    const commercialRefs = v.refs.filter((r) => r.state !== "reemplazar");

    // PORTFOLIO_WITHDRAWAL_REQUIRED
    if (retiroRefs.length > 0) {
      items.push({
        type: "PORTFOLIO_WITHDRAWAL_REQUIRED",
        severity: retiroRefs.length >= 5 ? "critical" : "warning",
        sellerId: v.vendorId,
        portfolioId: v.vendorId,
        world: null,
        line: null,
        title: `${v.vendorName}: ${retiroRefs.length} referencia(s) para retirar`,
        evidence: {
          retiroCount: retiroRefs.length,
          vendorId: v.vendorId,
          firstRetiroRef: retiroRefs[0]?.reference ?? null,
          firstRetiroImageUrl: retiroRefs[0]?.imageUrl ?? null,
        },
        suggestedAction: "Revisar lista de retiro y coordinar con vendedor",
        suggestedDestination: "retiro",
        deduplicationKey: `withdrawal:${orgId}:${v.vendorId}`,
        createdAt: now,
      });
    }

    // PORTFOLIO_COVERAGE_AT_RISK — from sample coverage
    const coverageAll = getSampleCoverageSummary(data.sampleCoverage);
    const vc = coverageAll.find((c) => c.vendorId === v.vendorId);
    if (vc && vc.completionPct < 70) {
      items.push({
        type: "PORTFOLIO_COVERAGE_AT_RISK",
        severity: vc.completionPct < 50 ? "critical" : "warning",
        sellerId: v.vendorId,
        portfolioId: v.vendorId,
        world: null,
        line: null,
        title: `${v.vendorName}: cobertura derrotero ${vc.completionPct}%`,
        evidence: {
          completionPct: vc.completionPct,
          missingEntries: vc.missingEntries,
          totalEntries: vc.totalEntries,
        },
        suggestedAction: "Abrir Cobertura de mostrario para completar posiciones",
        suggestedDestination: "surtido",
        deduplicationKey: `coverage:${orgId}:${v.vendorId}`,
        createdAt: now,
      });
    }
  }

  // PORTFOLIO_SUPPLY_REQUIRED — missing positions with candidates
  const needs = getSampleCoverageNeeds(data.sampleCoverage);
  const withCandidates = needs.filter((n) => n.candidateCount > 0 &&
    (n.status === "B01_AVAILABLE" || n.status === "OP_INCOMING"));
  if (withCandidates.length > 0) {
    items.push({
      type: "PORTFOLIO_SUPPLY_REQUIRED",
      severity: withCandidates.length >= 5 ? "critical" : "warning",
      sellerId: null,
      portfolioId: null,
      world: null,
      line: null,
      title: `${withCandidates.length} posiciones con candidato disponible`,
      evidence: {
        positionsWithCandidate: withCandidates.length,
        byAction: {
          bodega: withCandidates.filter((n) => n.status === "B01_AVAILABLE").length,
          op: withCandidates.filter((n) => n.status === "OP_INCOMING").length,
        },
      },
      suggestedAction: "Revisar cobertura de mostrario para enviar muestras",
      suggestedDestination: "cobertura",
      deduplicationKey: `supply:${orgId}:actionable`,
      createdAt: now,
    });
  }

  // PORTFOLIO_NO_SUPPLY_CANDIDATE — missing positions without any candidate
  const noCandidates = needs.filter((n) => n.candidateCount === 0 && (n.status === "PRODUCTION_REQUIRED" || n.status === "IMPORT_UNAVAILABLE" || n.status === "DATA_UNVERIFIED"));
  if (noCandidates.length > 0) {
    items.push({
      type: "PORTFOLIO_NO_SUPPLY_CANDIDATE",
      severity: noCandidates.length >= 3 ? "warning" : "info",
      sellerId: null,
      portfolioId: null,
      world: null,
      line: null,
      title: `${noCandidates.length} posiciones sin candidato de cobertura`,
      evidence: { positionsWithoutCandidate: noCandidates.length },
      suggestedAction: "Evaluar produccion o recompra para estas posiciones",
      suggestedDestination: "inteligencia",
      deduplicationKey: `nocand:${orgId}:sincobertura`,
      createdAt: now,
    });
  }

  // PORTFOLIO_PRODUCTION_REQUIRED
  const urgentProd = data.productionSuggestions.filter(
    (p: ProductionSuggestion) => p.urgency === "alta" || p.urgency === "media",
  );
  if (urgentProd.length > 0) {
    items.push({
      type: "PORTFOLIO_PRODUCTION_REQUIRED",
      severity: urgentProd.some((p: ProductionSuggestion) => p.urgency === "alta") ? "critical" : "warning",
      sellerId: null,
      portfolioId: null,
      world: null,
      line: null,
      title: `${urgentProd.length} subgrupo(s) requieren produccion`,
      evidence: {
        urgentCount: urgentProd.filter((p: ProductionSuggestion) => p.urgency === "alta").length,
        mediumCount: urgentProd.filter((p: ProductionSuggestion) => p.urgency === "media").length,
      },
      suggestedAction: "Revisar senales de produccion",
      suggestedDestination: "produccion",
      deduplicationKey: `production:${orgId}:urgent`,
      createdAt: now,
    });
  }

  // PORTFOLIO_OP_CANDIDATE_AVAILABLE
  const opCandidates = needs.filter((n) => n.status === "OP_INCOMING");
  if (opCandidates.length > 0) {
    items.push({
      type: "PORTFOLIO_OP_CANDIDATE_AVAILABLE",
      severity: "info",
      sellerId: null,
      portfolioId: null,
      world: null,
      line: null,
      title: `${opCandidates.length} posiciones con OP pendiente`,
      evidence: { opPositionCount: opCandidates.length },
      suggestedAction: "Posiciones que se completaran cuando llegue produccion",
      suggestedDestination: "surtido",
      deduplicationKey: `op:${orgId}:pending`,
      createdAt: now,
    });
  }

  // Sort by severity
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  items.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));

  return {
    items,
    provenance: provenance(data.loadedAt),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 11. ANALYTIC: comparePortfolios
// ══════════════════════════════════════════════════════════════════════════════

export async function comparePortfolios(
  orgId: string,
): Promise<PortfolioComparisonResult> {
  const data = await loadVendorSampleData(orgId);
  const coverageAll = getSampleCoverageSummary(data.sampleCoverage);

  const portfolios: PortfolioComparisonItem[] = data.vendors
    .filter((v) => v.isActive)
    .map((v) => {
      const coverage = coverageAll.find((c) => c.vendorId === v.vendorId);
      const retiroRefs = v.refs.filter((r) => r.state === "reemplazar");
      return {
        vendorId: v.vendorId,
        vendorName: v.vendorName,
        derroteroCompletionPct: coverage?.completionPct ?? 0,
        missingPositions: coverage?.missingEntries ?? 0,
        retiroCount: retiroRefs.length,
        retiroPct: v.totalRefs > 0 ? Math.round((retiroRefs.length / v.totalRefs) * 100) : 0,
      };
    });

  return {
    portfolios,
    provenance: provenance(data.loadedAt),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 12. ANALYTIC: findSharedSupplyNeeds
// ══════════════════════════════════════════════════════════════════════════════

export async function findSharedSupplyNeeds(
  orgId: string,
): Promise<SharedNeedsResult> {
  const data = await loadVendorSampleData(orgId);
  const allNeeds = getSampleCoverageNeeds(data.sampleCoverage);

  // Group by subgroupName across vendors
  const bySubgroup = new Map<string, { vendors: Set<string>; brand: string | null; world: string; bestAction: string }>();
  for (const n of allNeeds) {
    const vc = data.sampleCoverage.vendorCoverages.find((p) => p.vendorId === n.vendorId);
    const pos = vc?.positions.find((p) => p.subgroupName === n.subgroupName);
    const world = pos?.commercialWorld ?? "";
    const key = `${n.subgroupName}:${world}`;
    if (!bySubgroup.has(key)) {
      bySubgroup.set(key, { vendors: new Set(), brand: n.brand, world, bestAction: n.status });
    }
    bySubgroup.get(key)!.vendors.add(n.vendorId);
  }

  const needs: SharedNeedItem[] = [...bySubgroup.entries()]
    .filter(([, v]) => v.vendors.size > 1)
    .map(([key, v]) => ({
      subgroupName: key.split(":")[0],
      brand: v.brand,
      world: v.world,
      vendorIds: [...v.vendors],
      vendorCount: v.vendors.size,
      bestAction: v.bestAction,
    }))
    .sort((a, b) => b.vendorCount - a.vendorCount);

  return {
    needs,
    provenance: provenance(data.loadedAt),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 13. ANALYTIC: findMultiVendorCandidates
// ══════════════════════════════════════════════════════════════════════════════

export async function findMultiVendorCandidates(
  orgId: string,
): Promise<MultiVendorCandidatesResult> {
  const data = await loadVendorSampleData(orgId);

  // Collect all candidates across all vendors
  const byRef = new Map<string, { desc: string; available: number; vendors: Set<string>; subgroup: string }>();
  for (const vc of data.sampleCoverage.vendorCoverages) {
    for (const pos of vc.positions) {
      for (const c of pos.candidates) {
        if (!c.reference || c.status !== "B01_AVAILABLE") continue;
        const key = c.reference.toUpperCase();
        if (!byRef.has(key)) {
          byRef.set(key, { desc: c.description, available: c.availableQty ?? 0, vendors: new Set(), subgroup: pos.subgroupName });
        }
        byRef.get(key)!.vendors.add(vc.vendorId);
      }
    }
  }

  const candidates: MultiVendorCandidateItem[] = [...byRef.entries()]
    .filter(([, v]) => v.vendors.size > 1)
    .map(([ref, v]) => ({
      reference: ref,
      description: v.desc,
      centralAvailable: v.available,
      eligibleVendorCount: v.vendors.size,
      eligibleVendorIds: [...v.vendors],
      subgroupName: v.subgroup,
    }))
    .sort((a, b) => b.eligibleVendorCount - a.eligibleVendorCount);

  return {
    candidates,
    provenance: provenance(data.loadedAt),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 14. ANALYTIC: findOpDependentNeeds
// ══════════════════════════════════════════════════════════════════════════════

export async function findOpDependentNeeds(
  orgId: string,
): Promise<OpDependentNeedsResult> {
  const data = await loadVendorSampleData(orgId);
  const needs: OpDependentNeedItem[] = [];

  for (const vc of data.sampleCoverage.vendorCoverages) {
    for (const pos of vc.positions) {
      if (pos.status !== "OP_INCOMING") continue;
      const opCandidate = pos.candidates.find((c) => c.status === "OP_INCOMING");
      needs.push({
        vendorId: vc.vendorId,
        vendorName: vc.vendorName,
        subgroupName: pos.subgroupName,
        opNumber: opCandidate?.opNumber ?? null,
        pendingQty: opCandidate?.pendingQty ?? null,
        pendingQtyQuality: opCandidate?.pendingQty != null ? "ESTIMATED" : null,
        explanation: pos.statusExplanation,
      });
    }
  }

  return {
    needs,
    provenance: provenance(data.loadedAt, [
      "pendingQtyQuality=ESTIMATED — ET line-level data not yet available",
    ]),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function resolveLineKey(commercialWorld: string, brand: string | null): string {
  if (commercialWorld === "IMPORTACION") return "IMPORT";
  if (brand === "Castillitos") return "CS";
  if (brand === "Latin Kids") return "LT";
  return commercialWorld;
}

// ══════════════════════════════════════════════════════════════════════════════
// TOOL REGISTRY
// ══════════════════════════════════════════════════════════════════════════════

export const PORTFOLIO_DOMAIN_TOOL_REGISTRY: DomainToolDefinition[] = [
  // ── READ tools ──────────────────────────────────────────────────────────

  {
    name: "getSalesPortfolios",
    description: "List all sales portfolios (maletas) with vendor, health, and sample counts",
    category: "READ",
    approvalRequired: false,
    permission: "org:read",
    inputSchema: { orgId: "string" },
    outputType: "PortfolioListResult",
  },
  {
    name: "getSalesPortfolio",
    description: "Get detail for a single sales portfolio: vendor info, health, ref counts, lines",
    category: "READ",
    approvalRequired: false,
    permission: "org:read",
    inputSchema: { orgId: "string", vendorId: "string" },
    outputType: "PortfolioDetailResult | null",
  },
  {
    name: "getSalesPortfolioReferences",
    description: "Get all current samples (referencias) in a portfolio, optionally filtered by line",
    category: "READ",
    approvalRequired: false,
    permission: "org:read",
    inputSchema: { orgId: "string", vendorId: "string", line: "string?" },
    outputType: "PortfolioReferencesResult | null",
  },
  {
    name: "getSalesPortfolioWithdrawalItems",
    description: "Get samples that should be withdrawn (retiro) from a portfolio with removal reason",
    category: "READ",
    approvalRequired: false,
    permission: "org:read",
    inputSchema: { orgId: "string", vendorId: "string" },
    outputType: "WithdrawalResult | null",
  },
  {
    name: "getSalesPortfolioDerrotero",
    description: "Get effective assortment rules (Derrotero) for a portfolio with per-line coverage breakdown",
    category: "READ",
    approvalRequired: false,
    permission: "org:read",
    inputSchema: { orgId: "string", vendorId: "string" },
    outputType: "DerroteroCoverageResult | null",
  },
  {
    name: "getSalesPortfolioCoverageForVendor",
    description: "Get all missing Derrotero positions and their sample coverage status for a vendor",
    category: "READ",
    approvalRequired: false,
    permission: "org:read",
    inputSchema: { orgId: "string", vendorId: "string" },
    outputType: "SupplyNeedsResult | null",
  },
  {
    name: "getSalesPortfolioCoverageCandidatesForPosition",
    description: "Get eligible coverage candidates for a specific missing position (references available in warehouse or OP)",
    category: "READ",
    approvalRequired: false,
    permission: "org:read",
    inputSchema: { orgId: "string", vendorId: "string", subgroupName: "string" },
    outputType: "SupplyCandidatesResult",
  },
  {
    name: "getSalesPortfolioProductionSignals",
    description: "Get production suggestions based on subgroup-level stock thresholds and maleta demand",
    category: "READ",
    approvalRequired: false,
    permission: "org:read",
    inputSchema: { orgId: "string" },
    outputType: "ProductionSignalsResult",
  },
  {
    name: "getSalesPortfolioCoverageOpportunities",
    description: "Get references in central warehouse that could be added to portfolios (textile + import)",
    category: "READ",
    approvalRequired: false,
    permission: "org:read",
    inputSchema: { orgId: "string" },
    outputType: "CoverageOpportunitiesResult",
  },

  // ── ANALYZE tools ───────────────────────────────────────────────────────

  {
    name: "emitPortfolioAttentionSignals",
    description: "Get all current attention signals: withdrawals needed, coverage at risk, supply candidates available, production required, OP pending",
    category: "ANALYZE",
    approvalRequired: false,
    permission: "org:read",
    inputSchema: { orgId: "string" },
    outputType: "PortfolioAttentionResult",
  },
  {
    name: "comparePortfolios",
    description: "Compare all active portfolios: Derrotero completion, missing positions, retiro counts",
    category: "ANALYZE",
    approvalRequired: false,
    permission: "org:read",
    inputSchema: { orgId: "string" },
    outputType: "PortfolioComparisonResult",
  },
  {
    name: "findSharedSupplyNeeds",
    description: "Find Derrotero positions missing across multiple vendors — shared production/recompra priority",
    category: "ANALYZE",
    approvalRequired: false,
    permission: "org:read",
    inputSchema: { orgId: "string" },
    outputType: "SharedNeedsResult",
  },
  {
    name: "findMultiVendorCandidates",
    description: "Find warehouse references eligible for multiple vendors — multi-maleta coverage from one ref",
    category: "ANALYZE",
    approvalRequired: false,
    permission: "org:read",
    inputSchema: { orgId: "string" },
    outputType: "MultiVendorCandidatesResult",
  },
  {
    name: "findOpDependentNeeds",
    description: "Find positions that depend on pending OP (production orders) to be fulfilled, with OP provenance",
    category: "ANALYZE",
    approvalRequired: false,
    permission: "org:read",
    inputSchema: { orgId: "string" },
    outputType: "OpDependentNeedsResult",
  },

  // ── PREPARE tools ───────────────────────────────────────────────────────

  {
    name: "prepareSalesPortfolioSupplyRecommendation",
    description: "Generate a structured supply recommendation for a vendor based on current supply plan (advisory, no inventory changes)",
    category: "PREPARE",
    approvalRequired: false,
    permission: "org:read",
    inputSchema: { orgId: "string", vendorId: "string" },
    outputType: "SupplyNeedsResult",
  },

  // ── APPROVAL_REQUIRED tools ─────────────────────────────────────────────

  {
    name: "activateSalesPortfolio",
    description: "Activate a vendor's portfolio (maleta) in the system",
    category: "APPROVAL_REQUIRED",
    approvalRequired: true,
    permission: "org:admin",
    inputSchema: { orgId: "string", vendorId: "string", actorId: "string" },
    outputType: "void",
  },
  {
    name: "deactivateSalesPortfolio",
    description: "Deactivate a vendor's portfolio — excludes from coverage analysis",
    category: "APPROVAL_REQUIRED",
    approvalRequired: true,
    permission: "org:admin",
    inputSchema: { orgId: "string", vendorId: "string", reason: "string", actorId: "string" },
    outputType: "void",
  },
  {
    name: "updateDerroteroEntry",
    description: "Change target units or priority for a Derrotero position",
    category: "APPROVAL_REQUIRED",
    approvalRequired: true,
    permission: "org:write",
    inputSchema: { orgId: "string", catalogId: "string", subgroupCode: "string", targetUnits: "number", actorId: "string" },
    outputType: "void",
  },
];
