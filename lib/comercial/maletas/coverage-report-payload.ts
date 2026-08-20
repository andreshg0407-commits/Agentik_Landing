/**
 * lib/comercial/maletas/coverage-report-payload.ts
 *
 * Server-side payload builder for coverage reports (PDF + XML).
 * Single source of truth — both formats consume the same payload.
 *
 * MALETAS-COBERTURA-REPORT-08B2R4A
 *
 * Pure computation — no Prisma, no UI, no side effects.
 */

import type {
  VendorSampleCoverage,
  CoveragePosition,
  CoverageCandidate,
  CoverageStatus,
} from "./sample-coverage-engine";
import { WHOLESALE_THRESHOLDS } from "./sample-coverage-engine";
import type { VendorBodegaConfig } from "./vendor-sample-presence-engine";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CoverageReportPosition {
  positionId: string;
  groupName: string;
  subgroupName: string;
  targetReferences: number;
  currentReferences: number;
  missingReferences: number;
  status: CoverageStatus;
  statusExplanation: string;
  candidate: {
    reference: string;
    description: string;
    availableQty: number | null;
    pendingQty: number | null;
    source: string;
    explanation: string;
  } | null;
}

export interface CoverageReportPayload {
  reportId: string;
  schemaVersion: "maletas-coverage-report.v1";
  generatedAt: string;        // ISO 8601
  sourceUpdatedAt: string;    // ISO 8601 — loadedAt from data loader
  truthState: "SAG_CERTIFIED" | "PARTIAL" | "EMPTY";

  // Organization
  organization: {
    id: string;
    name: string;
    slug: string;
  };

  // Vendor
  vendor: {
    id: string;
    name: string;
    bodegaKaNl: number;
  };

  // Derrotero
  derroteroVersion: string;   // "MALETA_COVERAGE_MINIMUMS.v1"
  thresholds: {
    castillitos: number;
    latinKids: number;
    importacion: number;
  };

  // KPIs
  totalPositions: number;
  coveredPositions: number;
  missingPositions: number;
  b01Available: number;
  opIncoming: number;
  productionRequired: number;
  importUnavailable: number;
  dataUnverified: number;

  // Invariant check
  invariantValid: boolean;

  // Warnings
  hasUnverifiedData: boolean;

  // Full reconciliation
  positions: CoverageReportPosition[];
}

// ── Builder ──────────────────────────────────────────────────────────────────

export function buildCoverageReportPayload(
  vendorCov: VendorSampleCoverage,
  vendorConfig: VendorBodegaConfig,
  org: { id: string; name: string; slug: string },
  sourceUpdatedAt: string,
): CoverageReportPayload {
  const now = new Date();
  // Bogota time zone for reportId uniqueness
  const bogotaDate = now.toLocaleDateString("sv-SE", { timeZone: "America/Bogota" });
  const bogotaTime = now.toLocaleTimeString("en-GB", {
    timeZone: "America/Bogota",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const reportId = `cov-${vendorCov.vendorId}-${bogotaDate}-${bogotaTime.replace(/:/g, "")}`;

  const invariantSum =
    vendorCov.b01Available +
    vendorCov.opIncoming +
    vendorCov.productionRequired +
    vendorCov.importUnavailable +
    vendorCov.dataUnverified;

  const positions: CoverageReportPosition[] = vendorCov.positions.map((pos) => {
    const topCandidate = pos.candidates[0] ?? null;
    return {
      positionId: pos.positionId,
      groupName: pos.groupName,
      subgroupName: pos.subgroupName,
      targetReferences: pos.targetReferences,
      currentReferences: pos.currentReferences,
      missingReferences: pos.missingReferences,
      status: pos.status,
      statusExplanation: pos.statusExplanation,
      candidate: topCandidate
        ? {
            reference: topCandidate.reference,
            description: topCandidate.description,
            availableQty: topCandidate.availableQty,
            pendingQty: topCandidate.pendingQty,
            source: topCandidate.source,
            explanation: topCandidate.explanation,
          }
        : null,
    };
  });

  const truthState: CoverageReportPayload["truthState"] =
    vendorCov.dataUnverified > 0
      ? "PARTIAL"
      : vendorCov.missingEntries === 0
        ? "SAG_CERTIFIED"
        : "SAG_CERTIFIED";

  return {
    reportId,
    schemaVersion: "maletas-coverage-report.v1",
    generatedAt: now.toISOString(),
    sourceUpdatedAt,
    truthState: vendorCov.totalDerroteroEntries === 0 ? "EMPTY" : truthState,
    organization: org,
    vendor: {
      id: vendorCov.vendorId,
      name: vendorCov.vendorName,
      bodegaKaNl: vendorConfig.bodegaKaNl,
    },
    derroteroVersion: "MALETA_COVERAGE_MINIMUMS.v1",
    thresholds: {
      castillitos: WHOLESALE_THRESHOLDS.CS,
      latinKids: WHOLESALE_THRESHOLDS.LT,
      importacion: WHOLESALE_THRESHOLDS.IMPORT_SM,
    },
    totalPositions: vendorCov.totalDerroteroEntries,
    coveredPositions: vendorCov.completeEntries,
    missingPositions: vendorCov.missingEntries,
    b01Available: vendorCov.b01Available,
    opIncoming: vendorCov.opIncoming,
    productionRequired: vendorCov.productionRequired,
    importUnavailable: vendorCov.importUnavailable,
    dataUnverified: vendorCov.dataUnverified,
    invariantValid: invariantSum === vendorCov.missingEntries,
    hasUnverifiedData: vendorCov.dataUnverified > 0,
    positions,
  };
}
