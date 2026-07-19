/**
 * maletas-commercial-intelligence.ts
 *
 * MALETAS-COMMERCIAL-INTELLIGENCE-01
 *
 * Pure transformation layer — no DB, no SAG, no side effects.
 * Builds commercial intelligence ON TOP of existing engine outputs.
 *
 * Input: VendorSampleSnapshot[] + CoverageGapRef[] (already computed)
 * Output: per-vendor intelligence (score, coverage, opportunities, risk)
 */

import type { VendorSampleSnapshot, VendorSampleRef, CoverageGapRef } from "./vendor-sample-types";
import { getMinimumForLine } from "./vendor-sample-types";
import type {
  MaletaScore,
  MaletaScoreGrade,
  SubgrupoCoverage,
  CoverageOpportunity,
  CoverageOpportunityRef,
  AtRiskReference,
  VendorCommercialIntelligence,
  MaletaCommercialContext,
  MaletasCommercialIntelligenceResult,
} from "./maletas-commercial-intelligence-types";

// ── Risk threshold: refs with disponible <= minimum × 1.5 are "at risk" ─────
const RISK_MULTIPLIER = 1.5;
const MAX_OPPORTUNITY_REFS = 5;
const MAX_OPPORTUNITIES = 10;

// ── Catalog subgrupo index ──────────────────────────────────────────────────

interface CatalogSubgrupoEntry {
  subgrupoSag: string;
  subgrupoId: number | null;
  line: string;
  refs: { reference: string; description: string; centralAvailable: number }[];
}

function buildCatalogIndex(
  allVendors: VendorSampleSnapshot[],
  coverageGaps: CoverageGapRef[],
): Map<string, CatalogSubgrupoEntry> {
  const index = new Map<string, CatalogSubgrupoEntry>();

  // Index from vendor refs (all known refs in maletas)
  for (const vendor of allVendors) {
    for (const ref of vendor.refs) {
      const key = ref.subgrupoSag;
      if (!index.has(key)) {
        index.set(key, {
          subgrupoSag: ref.subgrupoSag,
          subgrupoId: ref.subgrupoId,
          line: ref.line,
          refs: [],
        });
      }
      const entry = index.get(key)!;
      // Avoid duplicate refs
      if (!entry.refs.some((r) => r.reference === ref.reference)) {
        entry.refs.push({
          reference: ref.reference,
          description: ref.description,
          centralAvailable: ref.centralAvailable,
        });
      }
    }
  }

  // Add coverage gap refs (refs NOT in any maleta but with stock)
  // Only include gaps that have a real subgrupoSag — never use line as subgrupo key
  for (const gap of coverageGaps) {
    if (!gap.subgrupoSag) continue; // skip gaps without resolved subgrupo
    const key = gap.subgrupoSag;
    if (!index.has(key)) {
      index.set(key, {
        subgrupoSag: gap.subgrupoSag,
        subgrupoId: gap.subgrupoId ?? null,
        line: gap.line,
        refs: [],
      });
    }
    const entry = index.get(key)!;
    if (!entry.refs.some((r) => r.reference === gap.reference)) {
      entry.refs.push({
        reference: gap.reference,
        description: gap.description,
        centralAvailable: gap.centralAvailable,
      });
    }
  }

  return index;
}

// ── Maleta Score ─────────────────────────────────────────────────────────────

function computeScore(
  vendor: VendorSampleSnapshot,
  vendorSubgrupos: Set<string>,
  catalogSubgrupoCount: number,
): MaletaScore {
  if (vendor.totalRefs === 0) {
    return {
      total: 0,
      grade: "critica",
      breakdown: { coveragePct: 0, healthyPct: 0, replacePct: 0, scarcityPct: 0 },
    };
  }

  const coveragePct = catalogSubgrupoCount > 0
    ? (vendorSubgrupos.size / catalogSubgrupoCount) * 100
    : 0;

  const healthyPct = (vendor.healthyRefs / vendor.totalRefs) * 100;
  const replacePct = (vendor.replaceRefs / vendor.totalRefs) * 100;
  const scarcityPct = vendor.accessoryRefs > 0
    ? (vendor.accessoryScarcityRefs / vendor.accessoryRefs) * 100
    : 0;

  // Weighted score:
  //   40% coverage breadth
  //   35% healthy ratio
  //   15% replace penalty (inverted)
  //   10% scarcity penalty (inverted)
  const coverageScore = Math.min(coveragePct, 100) * 0.4;
  const healthyScore = healthyPct * 0.35;
  const replacePenalty = replacePct * 0.15;
  const scarcityPenalty = scarcityPct * 0.10;

  const total = Math.round(
    Math.max(0, Math.min(100, coverageScore + healthyScore - replacePenalty - scarcityPenalty)),
  );

  const grade: MaletaScoreGrade =
    total >= 90 ? "excelente"
    : total >= 70 ? "buena"
    : total >= 50 ? "debil"
    : "critica";

  return {
    total,
    grade,
    breakdown: {
      coveragePct: Math.round(coveragePct),
      healthyPct: Math.round(healthyPct),
      replacePct: Math.round(replacePct),
      scarcityPct: Math.round(scarcityPct),
    },
  };
}

// ── Coverage Analysis ───────────────────────────────────────────────────────

function computeSubgrupoCoverage(
  vendor: VendorSampleSnapshot,
  catalogIndex: Map<string, CatalogSubgrupoEntry>,
): SubgrupoCoverage[] {
  // What subgrupos does this vendor have?
  const vendorSubgrupoRefs = new Map<string, number>();
  for (const ref of vendor.refs) {
    vendorSubgrupoRefs.set(ref.subgrupoSag, (vendorSubgrupoRefs.get(ref.subgrupoSag) ?? 0) + 1);
  }

  const coverage: SubgrupoCoverage[] = [];
  for (const [key, entry] of catalogIndex) {
    const refsInVendor = vendorSubgrupoRefs.get(key) ?? 0;
    coverage.push({
      subgrupoSag: entry.subgrupoSag,
      subgrupoId: entry.subgrupoId,
      line: entry.line,
      present: refsInVendor > 0,
      refsInVendor,
      refsInCatalog: entry.refs.length,
      centralAvailableTotal: entry.refs.reduce((s, r) => s + Math.max(r.centralAvailable, 0), 0),
    });
  }

  // Sort: missing first, then by available stock desc
  coverage.sort((a, b) => {
    if (a.present !== b.present) return a.present ? 1 : -1;
    return b.centralAvailableTotal - a.centralAvailableTotal;
  });

  return coverage;
}

// ── Coverage Opportunities ──────────────────────────────────────────────────

function computeCoverageOpportunities(
  vendor: VendorSampleSnapshot,
  catalogIndex: Map<string, CatalogSubgrupoEntry>,
): CoverageOpportunity[] {
  const vendorRefs = new Set(vendor.refs.map((r) => r.reference));
  const vendorSubgrupos = new Set(vendor.refs.map((r) => r.subgrupoSag));

  const opportunities: CoverageOpportunity[] = [];

  for (const [key, entry] of catalogIndex) {
    // Only subgrupos NOT present in this vendor, OR underrepresented
    const vendorCount = vendor.refs.filter((r) => r.subgrupoSag === key).length;

    // Find refs in this subgrupo that the vendor doesn't carry and have stock
    const availableRefs = entry.refs.filter(
      (r) => !vendorRefs.has(r.reference) && r.centralAvailable > 0,
    );

    if (availableRefs.length === 0) continue;

    // Prioritize subgrupos the vendor is missing entirely
    const isMissing = !vendorSubgrupos.has(key);

    const totalAvailableQty = availableRefs.reduce((s, r) => s + r.centralAvailable, 0);

    const topRefs: CoverageOpportunityRef[] = availableRefs
      .sort((a, b) => b.centralAvailable - a.centralAvailable)
      .slice(0, MAX_OPPORTUNITY_REFS)
      .map((r) => ({
        reference: r.reference,
        description: r.description,
        line: entry.line,
        centralAvailable: r.centralAvailable,
      }));

    opportunities.push({
      subgrupoSag: entry.subgrupoSag,
      subgrupoId: entry.subgrupoId,
      line: entry.line,
      availableRefs: availableRefs.length,
      totalAvailableQty,
      topRefs,
    });
  }

  // Sort: missing subgrupos first, then by totalAvailableQty desc
  opportunities.sort((a, b) => b.totalAvailableQty - a.totalAvailableQty);

  return opportunities.slice(0, MAX_OPPORTUNITIES);
}

// ── Risk Analysis ───────────────────────────────────────────────────────────

function computeAtRiskRefs(vendor: VendorSampleSnapshot): AtRiskReference[] {
  const atRisk: AtRiskReference[] = [];

  for (const ref of vendor.refs) {
    // Import refs use their own scarcity model, skip here
    if (ref.isAccessory) continue;

    const minimum = ref.minimumRequired;
    const riskThreshold = minimum * RISK_MULTIPLIER;

    // At risk: saludable but close to minimum, OR already reemplazar
    if (ref.centralAvailable <= riskThreshold && ref.centralAvailable > 0) {
      const riskRatio = minimum > 0 ? ref.centralAvailable / minimum : 0;
      const riskLevel = ref.centralAvailable <= minimum ? "critico" : "alto";

      atRisk.push({
        reference: ref.reference,
        description: ref.description,
        line: ref.line,
        subgrupoSag: ref.subgrupoSag,
        centralAvailable: ref.centralAvailable,
        minimumRequired: minimum,
        riskRatio: Math.round(riskRatio * 100) / 100,
        riskLevel,
      });
    }
  }

  // Sort: critico first, then by riskRatio ascending
  atRisk.sort((a, b) => {
    if (a.riskLevel !== b.riskLevel) return a.riskLevel === "critico" ? -1 : 1;
    return a.riskRatio - b.riskRatio;
  });

  return atRisk;
}

// ── Main builder ────────────────────────────────────────────────────────────

export function buildCommercialIntelligence(
  vendors: VendorSampleSnapshot[],
  coverageGaps: CoverageGapRef[],
): MaletasCommercialIntelligenceResult {
  const catalogIndex = buildCatalogIndex(vendors, coverageGaps);
  const catalogSubgrupoCount = catalogIndex.size;

  const vendorIntelligence: VendorCommercialIntelligence[] = [];
  const copilotContexts: MaletaCommercialContext[] = [];

  for (const vendor of vendors) {
    const vendorSubgrupos = new Set(vendor.refs.map((r) => r.subgrupoSag));
    const subgrupoCoverage = computeSubgrupoCoverage(vendor, catalogIndex);
    const coverageOpportunities = computeCoverageOpportunities(vendor, catalogIndex);
    const atRiskRefs = computeAtRiskRefs(vendor);
    const score = computeScore(vendor, vendorSubgrupos, catalogSubgrupoCount);

    const missingSubgrupos = subgrupoCoverage.filter((s) => !s.present).length;

    vendorIntelligence.push({
      vendorId: vendor.vendorId,
      vendorName: vendor.vendorName,
      score,
      subgrupoCoverage,
      coverageOpportunities,
      atRiskRefs,
      subgruposPresent: vendorSubgrupos.size,
      subgruposMissing: missingSubgrupos,
      subgruposTotal: catalogSubgrupoCount,
      coveragePct: catalogSubgrupoCount > 0
        ? Math.round((vendorSubgrupos.size / catalogSubgrupoCount) * 100)
        : 0,
    });

    // Copilot context (PILAR 6)
    copilotContexts.push({
      vendorId: vendor.vendorId,
      vendorName: vendor.vendorName,
      coverageGapCount: missingSubgrupos,
      coverageOpportunities,
      replacementCandidateCount: vendor.replaceRefs,
      riskReferenceCount: atRiskRefs.length,
      importScarcityCount: vendor.accessoryScarcityRefs,
      maletaScore: score,
    });
  }

  return {
    vendors: vendorIntelligence,
    copilotContexts,
    catalogSubgrupos: catalogSubgrupoCount,
  };
}
