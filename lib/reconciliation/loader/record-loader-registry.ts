/**
 * lib/reconciliation/loader/record-loader-registry.ts
 *
 * AGENTIK-RECON-RECORD-LOADER-01 — Phase 4
 * Record Loader Registry
 *
 * Central registry: ReconciliationSourceType → ReconciliationRecordLoader
 *
 * All 11 source types in ReconciliationSourceType are covered.
 * resolveLoader() never throws — always returns a loader.
 * loadBothSides() is the primary entry point for the rule engine API route.
 *
 * Adding a new loader:
 *   1. Create the loader class in its own file (see sag-record-loader.ts as reference).
 *   2. Import it here.
 *   3. Add the entry to LOADER_REGISTRY.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import {
  SagOrdersSalesLoader,
  SagPaymentsLoader,
  SagReceivablesLoader,
}                             from "./sag-record-loader";
import { BankRecordLoader }   from "./bank-record-loader";
import {
  DianXmlLoader,
  DianInvoiceLoader,
}                             from "./dian-record-loader";
import { RECONCILIATION_SOURCES } from "../source-contract";
import { NORMALIZATION_VERSION }  from "./record-normalizer";
import type { ReconciliationRecordLoader, LoadResult, LoaderCapabilities } from "./record-loader";
import type { ReconciliationSourceType } from "../source-contract";
import type { CanonicalReconRecord }     from "../canonical-record";

// ── Stub loader ────────────────────────────────────────────────────────────────

/**
 * StubLoader covers sources with no wired adapter yet.
 *
 * Always returns an empty LoadResult with the source contract's
 * readiness and readinessNote. No data is fabricated.
 *
 * Registered for: payment_gateway, manual_upload, spreadsheet, erp_external.
 */
class StubLoader implements ReconciliationRecordLoader {
  constructor(private readonly source: ReconciliationSourceType) {}

  supportsSource(sourceType: ReconciliationSourceType): boolean {
    return sourceType === this.source;
  }

  async loadRecords(
    organizationId: string,
    period:         string,
  ): Promise<LoadResult> {
    const contract = RECONCILIATION_SOURCES[this.source];
    return {
      records:              [],
      sourceType:           this.source,
      organizationId,
      period,
      isEmpty:              true,
      emptyReason:          contract.readinessNote,
      readiness:            contract.readiness,
      readinessNote:        contract.readinessNote,
      recordCount:          0,
      loadTimeMs:           0,
      normalizationVersion: NORMALIZATION_VERSION,
      loaderUsed:           `StubLoader(${this.source})`,
    };
  }

  normalize(_raw: unknown, _index: number): CanonicalReconRecord | null {
    return null;
  }

  getCapabilities(): LoaderCapabilities {
    return {
      supportedSources:     [this.source],
      supportsFilters:      false,
      supportsDateRange:    false,
      normalizationVersion: NORMALIZATION_VERSION,
      loaderName:           `StubLoader(${this.source})`,
    };
  }
}

// ── Singleton instances ────────────────────────────────────────────────────────

const sagOrdersSales   = new SagOrdersSalesLoader();
const sagPayments      = new SagPaymentsLoader();
const sagReceivables   = new SagReceivablesLoader();
const bank             = new BankRecordLoader();
const dianXml          = new DianXmlLoader();
const dianInvoice      = new DianInvoiceLoader();
const paymentGateway   = new StubLoader("payment_gateway");
const manualUpload     = new StubLoader("manual_upload");
const spreadsheetStub  = new StubLoader("spreadsheet");
const erpExternal      = new StubLoader("erp_external");

// ── Registry map ──────────────────────────────────────────────────────────────

const LOADER_REGISTRY: Readonly<Record<ReconciliationSourceType, ReconciliationRecordLoader>> = {
  sag_orders:      sagOrdersSales,
  sag_sales:       sagOrdersSales,
  sag_payments:    sagPayments,
  sag_receivables: sagReceivables,
  bank_statement:  bank,
  dian_xml:        dianXml,
  dian_invoice:    dianInvoice,
  payment_gateway: paymentGateway,
  manual_upload:   manualUpload,
  spreadsheet:     spreadsheetStub,
  erp_external:    erpExternal,
} as const;

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Resolve the loader for a given source type.
 *
 * Always returns a loader — the caller receives an honest LoadResult
 * even for unavailable or future sources.
 */
export function resolveLoader(sourceType: ReconciliationSourceType): ReconciliationRecordLoader {
  return LOADER_REGISTRY[sourceType];
}

/**
 * Load records for one source type.
 *
 * Convenience wrapper: resolves the loader and calls loadRecords().
 * Passes `sourceType` in filters so SagOrdersSalesLoader can resolve which side to fetch.
 */
export async function loadSourceRecords(
  sourceType:     ReconciliationSourceType,
  organizationId: string,
  period:         string,
  filters?:       Record<string, unknown>,
): Promise<LoadResult> {
  return resolveLoader(sourceType).loadRecords(organizationId, period, {
    ...filters,
    sourceType,
  });
}

/**
 * Load both sides (A and B) in parallel.
 *
 * Primary entry point for the rule engine API route and any workspace
 * that needs to feed CanonicalReconRecord[] to the Rule Engine.
 *
 * Returns [LoadResult for A, LoadResult for B].
 */
export async function loadBothSides(
  sourceAType:    ReconciliationSourceType,
  sourceBType:    ReconciliationSourceType,
  organizationId: string,
  period:         string,
  filters?:       { a?: Record<string, unknown>; b?: Record<string, unknown> },
): Promise<[LoadResult, LoadResult]> {
  return Promise.all([
    loadSourceRecords(sourceAType, organizationId, period, filters?.a),
    loadSourceRecords(sourceBType, organizationId, period, filters?.b),
  ]);
}

/**
 * Describe all registered loaders and their capabilities.
 * Used by governance, debugging, and future admin tooling.
 */
export function getAllLoaderCapabilities(): Array<{
  sourceType:   ReconciliationSourceType;
  capabilities: LoaderCapabilities;
}> {
  return (Object.keys(LOADER_REGISTRY) as ReconciliationSourceType[]).map(sourceType => ({
    sourceType,
    capabilities: LOADER_REGISTRY[sourceType].getCapabilities(),
  }));
}
