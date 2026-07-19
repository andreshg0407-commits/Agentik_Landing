/**
 * lib/reconciliation/loader/sag-record-loader.ts
 *
 * AGENTIK-RECON-RECORD-LOADER-01 — Phase 3
 * SAG Record Loaders
 *
 * Three loaders covering all SAG sources:
 *
 *   SagOrdersSalesLoader   — sag_orders + sag_sales
 *                            readiness: available — queries SaleRecord via fetchReconSide()
 *
 *   SagPaymentsLoader      — sag_payments (CollectionRecord)
 *                            readiness: pending_sag_validation — data exists, PUC validation pending
 *                            Loads real CollectionRecord rows and normalizes them.
 *
 *   SagReceivablesLoader   — sag_receivables (CustomerReceivable)
 *                            readiness: pending_sag_validation — cartera↔cobros flow not yet activated
 *                            Returns empty LoadResult with honest metadata.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import { prisma }                  from "@/lib/prisma";
import { RECONCILIATION_SOURCES }  from "../source-contract";
import { fetchReconSide }          from "../adapters/orders-vs-sales";
import { normalizeSagSides, NORMALIZATION_VERSION } from "./record-normalizer";
import type { ReconciliationRecordLoader, LoadResult, LoaderCapabilities } from "./record-loader";
import type { ReconciliationSourceType } from "../source-contract";
import type { CanonicalReconRecord }     from "../canonical-record";

// ── SagOrdersSalesLoader ───────────────────────────────────────────────────────

/**
 * Loads sag_orders and sag_sales.
 *
 * Uses the existing fetchReconSide() (SAG SaleRecord adapter — unchanged) combined
 * with normalizeSagSides() to produce CanonicalReconRecord[].
 *
 * The `filters.sourceType` entry determines which side to fetch.
 * The registry passes this automatically via loadSourceRecords().
 */
export class SagOrdersSalesLoader implements ReconciliationRecordLoader {
  supportsSource(sourceType: ReconciliationSourceType): boolean {
    return sourceType === "sag_orders" || sourceType === "sag_sales";
  }

  async loadRecords(
    organizationId: string,
    period:         string,
    filters?:       Record<string, unknown>,
  ): Promise<LoadResult> {
    const start      = Date.now();
    const sourceType = (filters?.sourceType as "sag_orders" | "sag_sales") ?? "sag_orders";
    const contract   = RECONCILIATION_SOURCES[sourceType];
    const importKey  = (filters?.importKey  as string) ?? "all";

    try {
      const raw     = await fetchReconSide(organizationId, period, importKey);
      const records = normalizeSagSides(raw, sourceType, period);
      return {
        records,
        sourceType,
        organizationId,
        period,
        isEmpty:              records.length === 0,
        emptyReason:          records.length === 0
          ? `Sin registros SAG para el período ${period}. Verificar importación.`
          : null,
        readiness:            contract.readiness,
        readinessNote:        contract.readinessNote,
        recordCount:          records.length,
        loadTimeMs:           Date.now() - start,
        normalizationVersion: NORMALIZATION_VERSION,
        loaderUsed:           "SagOrdersSalesLoader",
      };
    } catch (err) {
      return {
        records:              [],
        sourceType,
        organizationId,
        period,
        isEmpty:              true,
        emptyReason:          `Error al cargar SAG: ${err instanceof Error ? err.message : String(err)}`,
        readiness:            "pending_sag_validation",
        readinessNote:        "Error de conexión con SAG. Verificar sincronización.",
        recordCount:          0,
        loadTimeMs:           Date.now() - start,
        normalizationVersion: NORMALIZATION_VERSION,
        loaderUsed:           "SagOrdersSalesLoader",
      };
    }
  }

  normalize(_raw: unknown, _index: number): CanonicalReconRecord | null {
    // Batch normalization via normalizeSagSides() requires a period context.
    // Single-record normalization is not supported for the SAG aggregate format.
    return null;
  }

  getCapabilities(): LoaderCapabilities {
    return {
      supportedSources:     ["sag_orders", "sag_sales"],
      supportsFilters:      true,
      supportsDateRange:    false,
      normalizationVersion: NORMALIZATION_VERSION,
      loaderName:           "SagOrdersSalesLoader",
    };
  }
}

// ── SagPaymentsLoader ──────────────────────────────────────────────────────────

/**
 * Loads sag_payments (CollectionRecord).
 *
 * readiness = "pending_sag_validation" — data is available in Prisma
 * but PUC code validation for bank reconciliation is not yet complete.
 *
 * Loads real CollectionRecord rows for the given period and normalizes them
 * to CanonicalReconRecord[]. The workspace shows the readiness state so
 * operators know the data is experimental (not yet fully validated).
 */
export class SagPaymentsLoader implements ReconciliationRecordLoader {
  supportsSource(sourceType: ReconciliationSourceType): boolean {
    return sourceType === "sag_payments";
  }

  async loadRecords(
    organizationId: string,
    period:         string,
  ): Promise<LoadResult> {
    const start    = Date.now();
    const contract = RECONCILIATION_SOURCES["sag_payments"];

    // Parse YYYYMM into first/last day of month for collectionDate range
    const year  = parseInt(period.slice(0, 4), 10);
    const month = parseInt(period.slice(4, 6), 10) - 1; // JS months: 0-indexed
    const from  = new Date(year, month, 1);
    const to    = new Date(year, month + 1, 0, 23, 59, 59);

    try {
      const rows = await prisma.collectionRecord.findMany({
        where: {
          organizationId,
          collectionDate: { gte: from, lte: to },
        },
        orderBy: { collectionDate: "asc" },
        select: {
          id:              true,
          erpMovId:        true,
          comprobanteCode: true,
          documentNumber:  true,
          collectionDate:  true,
          customerNit:     true,
          customerName:    true,
          amount:          true,
          currency:        true,
          bankReference:   true,
          appliedStatus:   true,
          naturalKey:      true,
        },
      });

      const records: CanonicalReconRecord[] = rows.map((r, i) => ({
        id:             `sag_payments:${i}:${r.id}`,
        sourceId:       "sag_payments" as const,
        externalId:     r.erpMovId ? String(r.erpMovId) : r.naturalKey,
        documentType:   r.comprobanteCode,
        documentNumber: r.documentNumber ?? null,
        thirdPartyId:   r.customerNit   ?? null,
        thirdPartyName: r.customerName  ?? null,
        amount:         r.amount.toNumber(),
        currency:       r.currency ?? "COP",
        date:           r.collectionDate.toISOString().slice(0, 10),
        dueDate:        null,
        reference:      r.bankReference ?? null,
        accountCode:    null,
        status:         String(r.appliedStatus).toLowerCase(),
        rawRef:         `CollectionRecord:${r.id}`,
        metadata: {
          comprobanteCode: r.comprobanteCode,
          naturalKey:      r.naturalKey,
          period,
        },
      }));

      return {
        records,
        sourceType:           "sag_payments",
        organizationId,
        period,
        isEmpty:              records.length === 0,
        emptyReason:          records.length === 0
          ? `Sin cobros SAG para el período ${period}`
          : null,
        readiness:            contract.readiness,
        readinessNote:        contract.readinessNote,
        recordCount:          records.length,
        loadTimeMs:           Date.now() - start,
        normalizationVersion: NORMALIZATION_VERSION,
        loaderUsed:           "SagPaymentsLoader",
      };
    } catch (err) {
      return {
        records:              [],
        sourceType:           "sag_payments",
        organizationId,
        period,
        isEmpty:              true,
        emptyReason:          `Error al cargar cobros SAG: ${err instanceof Error ? err.message : String(err)}`,
        readiness:            contract.readiness,
        readinessNote:        contract.readinessNote,
        recordCount:          0,
        loadTimeMs:           Date.now() - start,
        normalizationVersion: NORMALIZATION_VERSION,
        loaderUsed:           "SagPaymentsLoader",
      };
    }
  }

  normalize(_raw: unknown, _index: number): CanonicalReconRecord | null {
    return null;
  }

  getCapabilities(): LoaderCapabilities {
    return {
      supportedSources:     ["sag_payments"],
      supportsFilters:      false,
      supportsDateRange:    true,
      normalizationVersion: NORMALIZATION_VERSION,
      loaderName:           "SagPaymentsLoader",
    };
  }
}

// ── SagReceivablesLoader ───────────────────────────────────────────────────────

/**
 * Loads sag_receivables (CustomerReceivable).
 *
 * readiness = "pending_sag_validation" — cartera data exists but the
 * conciliation flow (cartera ↔ cobros) has not yet been activated.
 *
 * Returns an empty LoadResult with honest readiness metadata.
 * No data is fabricated.
 */
export class SagReceivablesLoader implements ReconciliationRecordLoader {
  supportsSource(sourceType: ReconciliationSourceType): boolean {
    return sourceType === "sag_receivables";
  }

  async loadRecords(
    organizationId: string,
    period:         string,
  ): Promise<LoadResult> {
    const contract = RECONCILIATION_SOURCES["sag_receivables"];
    return {
      records:              [],
      sourceType:           "sag_receivables",
      organizationId,
      period,
      isEmpty:              true,
      emptyReason:          contract.readinessNote,
      readiness:            contract.readiness,
      readinessNote:        contract.readinessNote,
      recordCount:          0,
      loadTimeMs:           0,
      normalizationVersion: NORMALIZATION_VERSION,
      loaderUsed:           "SagReceivablesLoader",
    };
  }

  normalize(_raw: unknown, _index: number): CanonicalReconRecord | null {
    return null;
  }

  getCapabilities(): LoaderCapabilities {
    return {
      supportedSources:     ["sag_receivables"],
      supportsFilters:      false,
      supportsDateRange:    false,
      normalizationVersion: NORMALIZATION_VERSION,
      loaderName:           "SagReceivablesLoader",
    };
  }
}
