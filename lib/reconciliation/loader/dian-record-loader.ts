/**
 * lib/reconciliation/loader/dian-record-loader.ts
 *
 * AGENTIK-RECON-RECORD-LOADER-01 — Phase 3
 * DIAN Record Loaders
 *
 *   DianXmlLoader     — dian_xml     (readiness: requires_upload)
 *   DianInvoiceLoader — dian_invoice (readiness: requires_credential)
 *
 * Both return empty LoadResult with honest metadata. No data is fabricated.
 *
 * When DIAN integration is live:
 *
 *   DianXmlLoader (requires_upload):
 *     1. Accept uploaded XML files via a document upload endpoint (future sprint)
 *     2. Parse each XML using the DIAN UBL 2.1 schema
 *     3. Normalize CUFE + invoice fields → CanonicalReconRecord
 *     Fields:
 *       id             = `dian_xml:${index}:${cufe}`
 *       sourceId       = "dian_xml"
 *       externalId     = CUFE
 *       documentType   = "FE" (Factura Electrónica)
 *       documentNumber = invoice number (Número de Factura)
 *       thirdPartyId   = customer NIT (Adquiriente NIT)
 *       amount         = TotalFactura (base + IVA)
 *       currency       = "COP"
 *       date           = IssueDate (ISO date string)
 *       reference      = CUFE (used as reference for bank matching)
 *       accountCode    = null (DIAN XML does not carry PUC codes)
 *       status         = dian status code (accepted, rejected, etc.)
 *
 *   DianInvoiceLoader (requires_credential):
 *     1. Query DIAN GetAcquirer API with valid certificate
 *     2. Normalize each invoice record → CanonicalReconRecord
 *     (Same field mapping as DianXmlLoader)
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import { RECONCILIATION_SOURCES } from "../source-contract";
import { NORMALIZATION_VERSION }  from "./record-normalizer";
import type { ReconciliationRecordLoader, LoadResult, LoaderCapabilities } from "./record-loader";
import type { ReconciliationSourceType } from "../source-contract";
import type { CanonicalReconRecord }     from "../canonical-record";

// ── DianXmlLoader ──────────────────────────────────────────────────────────────

export class DianXmlLoader implements ReconciliationRecordLoader {
  supportsSource(sourceType: ReconciliationSourceType): boolean {
    return sourceType === "dian_xml";
  }

  async loadRecords(
    organizationId: string,
    period:         string,
  ): Promise<LoadResult> {
    const contract = RECONCILIATION_SOURCES["dian_xml"];
    return {
      records:              [],
      sourceType:           "dian_xml",
      organizationId,
      period,
      isEmpty:              true,
      emptyReason:          contract.readinessNote,
      readiness:            contract.readiness,
      readinessNote:        contract.readinessNote,
      recordCount:          0,
      loadTimeMs:           0,
      normalizationVersion: NORMALIZATION_VERSION,
      loaderUsed:           "DianXmlLoader",
    };
  }

  normalize(_raw: unknown, _index: number): CanonicalReconRecord | null {
    return null;
  }

  getCapabilities(): LoaderCapabilities {
    return {
      supportedSources:     ["dian_xml"],
      supportsFilters:      false,
      supportsDateRange:    false,
      normalizationVersion: NORMALIZATION_VERSION,
      loaderName:           "DianXmlLoader",
    };
  }
}

// ── DianInvoiceLoader ──────────────────────────────────────────────────────────

export class DianInvoiceLoader implements ReconciliationRecordLoader {
  supportsSource(sourceType: ReconciliationSourceType): boolean {
    return sourceType === "dian_invoice";
  }

  async loadRecords(
    organizationId: string,
    period:         string,
  ): Promise<LoadResult> {
    const contract = RECONCILIATION_SOURCES["dian_invoice"];
    return {
      records:              [],
      sourceType:           "dian_invoice",
      organizationId,
      period,
      isEmpty:              true,
      emptyReason:          contract.readinessNote,
      readiness:            contract.readiness,
      readinessNote:        contract.readinessNote,
      recordCount:          0,
      loadTimeMs:           0,
      normalizationVersion: NORMALIZATION_VERSION,
      loaderUsed:           "DianInvoiceLoader",
    };
  }

  normalize(_raw: unknown, _index: number): CanonicalReconRecord | null {
    return null;
  }

  getCapabilities(): LoaderCapabilities {
    return {
      supportedSources:     ["dian_invoice"],
      supportsFilters:      false,
      supportsDateRange:    false,
      normalizationVersion: NORMALIZATION_VERSION,
      loaderName:           "DianInvoiceLoader",
    };
  }
}
