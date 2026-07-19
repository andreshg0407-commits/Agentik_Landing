/**
 * lib/reconciliation/loader/bank-record-loader.ts
 *
 * AGENTIK-RECON-RECORD-LOADER-01 — Phase 3
 * Bank Statement Record Loader
 *
 * readiness: requires_integration
 *
 * Bank feed or CSV upload is not yet configured. Returns empty LoadResult
 * with honest metadata. No data is fabricated.
 *
 * When bank integration is live, this loader will:
 *   1. Query a BankTransaction table (to be modeled in a future sprint)
 *   2. Normalize rows → CanonicalReconRecord using the bank normalization pipeline
 *   3. Return real records with readiness = "available"
 *
 * Normalization plan (future — do NOT implement yet):
 *   id             = `bank_statement:${index}:${txnRef}`
 *   sourceId       = "bank_statement"
 *   externalId     = bank transaction reference
 *   documentType   = "EXTRACTO"
 *   documentNumber = bank reference or cheque number
 *   thirdPartyId   = null (bank statements rarely carry NIT)
 *   amount         = credit − debit (signed; positive = credit)
 *   currency       = "COP"
 *   date           = transactionDate (ISO date string)
 *   reference      = description from bank
 *   accountCode    = SAG PUC code for the bank account (from bank-account-registry)
 *   status         = "posted"
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import { RECONCILIATION_SOURCES } from "../source-contract";
import { NORMALIZATION_VERSION }  from "./record-normalizer";
import type { ReconciliationRecordLoader, LoadResult, LoaderCapabilities } from "./record-loader";
import type { ReconciliationSourceType } from "../source-contract";
import type { CanonicalReconRecord }     from "../canonical-record";

export class BankRecordLoader implements ReconciliationRecordLoader {
  supportsSource(sourceType: ReconciliationSourceType): boolean {
    return sourceType === "bank_statement";
  }

  async loadRecords(
    organizationId: string,
    period:         string,
  ): Promise<LoadResult> {
    const contract = RECONCILIATION_SOURCES["bank_statement"];
    return {
      records:              [],
      sourceType:           "bank_statement",
      organizationId,
      period,
      isEmpty:              true,
      emptyReason:          contract.readinessNote,
      readiness:            contract.readiness,
      readinessNote:        contract.readinessNote,
      recordCount:          0,
      loadTimeMs:           0,
      normalizationVersion: NORMALIZATION_VERSION,
      loaderUsed:           "BankRecordLoader",
    };
  }

  normalize(_raw: unknown, _index: number): CanonicalReconRecord | null {
    return null;
  }

  getCapabilities(): LoaderCapabilities {
    return {
      supportedSources:     ["bank_statement"],
      supportsFilters:      false,
      supportsDateRange:    true,
      normalizationVersion: NORMALIZATION_VERSION,
      loaderName:           "BankRecordLoader",
    };
  }
}
