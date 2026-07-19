/**
 * maletas-commercial-intelligence-types.ts
 *
 * MALETAS-COMMERCIAL-INTELLIGENCE-01
 *
 * Pure types for commercial intelligence layer.
 * Built ON TOP of existing engines — no engine modification.
 */

// ── Maleta Score ────────────────────────────────────────────────────────────

export type MaletaScoreGrade = "excelente" | "buena" | "debil" | "critica";

export interface MaletaScore {
  total: number;           // 0–100
  grade: MaletaScoreGrade;
  breakdown: {
    coveragePct: number;   // % of catalog subgrupos present
    healthyPct: number;    // % of refs saludable
    replacePct: number;    // % of refs reemplazar (penalty)
    scarcityPct: number;   // % of accessory refs in escasez (penalty)
  };
}

// ── Coverage Analysis ───────────────────────────────────────────────────────

export interface SubgrupoCoverage {
  subgrupoSag: string;
  subgrupoId: number | null;
  line: string;
  present: boolean;               // vendor has at least 1 ref in this subgrupo
  refsInVendor: number;           // refs this vendor carries in this subgrupo
  refsInCatalog: number;          // total refs in catalog for this subgrupo
  centralAvailableTotal: number;  // sum of disponible for this subgrupo in catalog
}

export interface CoverageOpportunity {
  subgrupoSag: string;
  subgrupoId: number | null;
  line: string;
  availableRefs: number;          // catalog refs with stock in this subgrupo
  totalAvailableQty: number;      // sum of disponible in catalog
  topRefs: CoverageOpportunityRef[];  // up to 5 best refs to add
}

export interface CoverageOpportunityRef {
  reference: string;
  description: string;
  line: string;
  centralAvailable: number;
}

// ── Risk Analysis ───────────────────────────────────────────────────────────

export interface AtRiskReference {
  reference: string;
  description: string;
  line: string;
  subgrupoSag: string;
  centralAvailable: number;
  minimumRequired: number;
  riskRatio: number;             // centralAvailable / minimumRequired (< 1.5 = at risk)
  riskLevel: "critico" | "alto"; // <= minimum = critico, <= 1.5× = alto
}

// ── Vendor Intelligence ─────────────────────────────────────────────────────

export interface VendorCommercialIntelligence {
  vendorId: string;
  vendorName: string;
  score: MaletaScore;
  subgrupoCoverage: SubgrupoCoverage[];
  coverageOpportunities: CoverageOpportunity[];
  atRiskRefs: AtRiskReference[];
  // Summary
  subgruposPresent: number;
  subgruposMissing: number;
  subgruposTotal: number;
  coveragePct: number;
}

// ── Copilot Context (PILAR 6) ───────────────────────────────────────────────

export interface MaletaCommercialContext {
  vendorId: string;
  vendorName: string;
  coverageGapCount: number;
  coverageOpportunities: CoverageOpportunity[];
  replacementCandidateCount: number;
  riskReferenceCount: number;
  importScarcityCount: number;
  maletaScore: MaletaScore;
}

// ── Global Intelligence ─────────────────────────────────────────────────────

export interface MaletasCommercialIntelligenceResult {
  vendors: VendorCommercialIntelligence[];
  copilotContexts: MaletaCommercialContext[];
  catalogSubgrupos: number;       // total unique subgrupos in catalog
}
