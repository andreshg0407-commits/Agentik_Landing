# SAG_RELATIONSHIP_DISCOVERY.md
## Sprint S2 — Phase C: SAG Data Relationship Investigation
_Generated: 2026-05-05 | Status: AUTHORITATIVE_

---

## 1. Purpose

This document maps all known relationships between SAG PYA SOAP data entities and how they are (or are not) available via the current integration. The goal is to determine what reconciliation signals SAG provides today versus what must be inferred or supplemented by Agentik.

---

## 2. SAG Data Entities Available via PYA SOAP

### 2.1 TERCEROS (Customer Master)
**Sync path:** `sag-pya-soap/index.ts` → `customerProfileStorage.upsertMany()`
**SAG fields mapped:**
| SAG field | Agentik field | Notes |
|-----------|--------------|-------|
| ka_nl_tercero | sagTerceroId (NOT mapped) | THE ROOT BUG — stored as SaleRecord.customerNit string, never written to CustomerProfile |
| nombre_comercial | name | |
| razon_social | legalName | |
| nit | nit, nitNormalized | |
| email, telefono | contactEmail, contactPhone | |

**Missing:** `sagTerceroId` is never set on `CustomerProfile` by this path. See `ARCHITECTURE_ROADMAP.md` Sprint S1 for fix.

---

### 2.2 MOVIMIENTOS / VENTAS (Sales Movements)
**Sync path:** `sag-pya-soap/mappers.ts` → `SaleRecord`
**Key fields:**
| SAG field | Agentik field | Reconciliation relevance |
|-----------|--------------|------------------------|
| ka_nl_tercero | customerNit (as string) | Customer identity — sagTerceroId stored as NIT |
| comprobante | comprobante | Document reference |
| tipo_comprobante prefix | comprobanteCode | Payment type taxonomy |
| fecha_documento | saleDate | |
| valor_neto | amount | Negative for cobros in SAG |
| ka_nl_almacen | storeSlug | |
| ka_nl_vendedor | sellerSlug | |
| fuente | sagSourceType | OFICIAL / REMISION |

**Reconciliation signal:** `comprobanteCode` is the primary SAG signal for payment type classification. It encodes whether a movement is a sale, cobro, or consignación.

---

### 2.3 CARTERA / RECEIVABLES (v_saldos_cartera or equivalent)
**Sync path:** `sag-pya-soap/storage.ts` → `CustomerReceivable` via `refreshProfileReceivables()`
**Key fields:**
| SAG field | Agentik field | Notes |
|-----------|--------------|-------|
| tercero_id / nit | customerId (via profile lookup) | LEGACY_NIT_JOIN risk |
| documento | sagDocumentId, documentNumber | Invoice identifier |
| saldo | balanceDue | SAG's reported balance |
| vencimiento | dueDate | |
| dias_vencido | daysOverdue | |
| cubo_vencimiento | agingBucket | 0-30 / 31-60 / 61-90 / 90+ |
| valor_original | originalAmount | |

**Critical finding:** SAG provides `saldo` (balance) directly. This is the SAG-authoritative balance. However, `CustomerReceivable.balanceDue` in Agentik is only updated via `PaymentAllocation` (UI path), NOT by re-reading SAG's `saldo`. This creates permanent divergence once any payment is registered manually.

**Proposed resolution:** When auto-reconcile (Sprint S3) creates a `PaymentAllocation` from a `CollectionRecord`, it should validate that `balanceDue - allocatedAmount` matches SAG's reported `saldo`. If they differ, flag for human review.

---

### 2.4 COBROS / PAGOS (v_pagosnew or equivalent)
**Sync path:** `sag-pya-soap/index.ts` → `CollectionRecord`
**Key fields:**
| SAG field | Agentik field | Reconciliation relevance |
|-----------|--------------|------------------------|
| tercero_id | sagTerceroId | Customer identity (direct, no NIT ambiguity) |
| nit | customerNit | Real NIT |
| valor | amount | Payment amount (positive in cobros view) |
| fecha_pago | paymentDate | |
| tipo_comprobante | comprobanteCode | Finality classification |
| comprobante | comprobante | Document reference |
| documentos_aplicados | appliedFacts (JSONB) | SAG-provided invoice associations |

**`documentos_aplicados` (appliedFacts) investigation:**
SAG may include a list of invoices this cobro was applied to. If present, this is the strongest possible reconciliation signal — SAG itself is telling us which receivables this payment closes.

**Current status:** Written to `CollectionRecord.appliedFacts` during sync. NEVER read by any service. This is the highest-value dead data in the system.

**Proposed Sprint S3 first step:** Parse `appliedFacts` to extract `invoiceRef` values and attempt direct match to `CustomerReceivable.sagDocumentId` or `documentNumber`.

---

### 2.5 FUENTES (Source Semantics — Fuente 1 / Fuente 2)
**Reference:** `lib/sag/master-data/castillitos-fuentes.ts`, `lib/sag/source-semantics.ts`
**Reconciliation relevance:**

| sagSourceType | Meaning | Reconciliation treatment |
|--------------|---------|------------------------|
| OFICIAL (Fuente 1) | Revenue-grade confirmed sale | Use for revenue reporting and cobros |
| REMISION (Fuente 2) | Operational demand / pre-sale | Use for demand planning, NOT for cobros |

**Current gap:** `sagSourceType` is stored on `SaleRecord` but NOT on `CollectionRecord`. Cobros in `CollectionRecord` have no explicit Fuente flag. The `comprobanteCode` provides an indirect signal (R1 = Fuente 1 empresa, R2 = Fuente 2 empresa).

**Proposed convention:**
```typescript
function inferCollectionSourceType(comprobanteCode: string): "OFICIAL" | "REMISION" | "PENDING" {
  if (["R1","RS","RC","RG","RA","SI","AN"].includes(comprobanteCode)) return "OFICIAL";
  if (["R2"].includes(comprobanteCode)) return "REMISION";
  if (["CP","B1","B2","H1","H2"].includes(comprobanteCode)) return "PENDING";
  return "OFICIAL"; // safe default for unknown codes
}
```

---

## 3. SAG Relationship Data: What EXISTS vs What is MISSING

### 3.1 Relationships SAG DOES provide (via current sync)

| Relationship | SAG signal | Agentik capture | Used? |
|-------------|-----------|----------------|-------|
| Cobro → Customer | sagTerceroId (direct) | CollectionRecord.sagTerceroId | YES — for identity |
| Cobro → Invoice (SAG-side) | appliedFacts / documentos_aplicados | CollectionRecord.appliedFacts | NO — dead write |
| Receivable → Customer | tercero_id / nit | CustomerReceivable.customerId (via profile lookup) | PARTIAL — LEGACY_NIT_JOIN |
| Receivable → SAG document | documento | CustomerReceivable.sagDocumentId | YES |
| Movement → Source type | fuente | SaleRecord.sagSourceType | YES |
| Movement → Payment type | tipo_comprobante prefix | SaleRecord.comprobanteCode | YES |

### 3.2 Relationships SAG does NOT provide

| Missing relationship | Impact | Workaround |
|--------------------|--------|-----------|
| Cobro → Receivable (direct FK in SAG DB) | Cannot auto-allocate | Must use appliedFacts + fuzzy match |
| Receivable → Cobro history | Cannot show payment history per invoice | Must infer from CollectionRecord + date range |
| Invoice payment status (PAGADO flag) | Cannot confirm if SAG considers invoice closed | Must compare saldo → 0 |
| Bank confirmation event (final PAGO) | Consignaciones unconfirmed until SAG processes | Must poll and check comprobanteCode transition |

### 3.3 The `Documento_pagado` Gap (from ARCHITECTURE_ROADMAP.md)

The SAG team was expected to deliver a `Documento_pagado` / invoice-payment view that would provide a direct Cobro → Invoice FK. **This has NOT been delivered.** Until it is, auto-reconciliation must rely on:
1. `appliedFacts` JSONB (if populated by SAG)
2. Fuzzy match: `(sagTerceroId, amount, date window ±3 days)`
3. Manual human confirmation for ambiguous cases

---

## 4. SAG Cobro → CustomerReceivable Match Confidence Matrix

| Match signals available | Confidence | Action |
|------------------------|-----------|--------|
| appliedFacts.invoiceRef → CustomerReceivable.sagDocumentId | VERY HIGH (>95%) | Auto-allocate |
| sagTerceroId + exact amount + date ±1d + single open receivable | HIGH (>85%) | Auto-allocate with audit log |
| sagTerceroId + amount ±5% + date ±7d + single open receivable | MEDIUM (60-85%) | Queue for human confirmation |
| sagTerceroId only + multiple open receivables | LOW (<60%) | Human must select |
| No sagTerceroId (customerNit fallback) + amount | LOW (<50%) | Human must confirm identity first |

---

## 5. Key SAG Adapter Files

| File | Purpose |
|------|---------|
| `lib/connectors/adapters/sag-pya-soap/index.ts` | Main sync orchestrator |
| `lib/connectors/adapters/sag-pya-soap/mappers.ts` | SAG field → Agentik type mapping |
| `lib/connectors/adapters/sag-pya-soap/storage.ts` | DB write layer (CustomerProfile, CollectionRecord, CustomerReceivable) |
| `lib/connectors/pya/client.ts` | SOAP client for PYA API calls |
| `lib/sag/source-semantics.ts` | Fuente 1 / Fuente 2 classification logic |
| `lib/sag/master-data/castillitos-fuentes.ts` | Tenant-specific FUENTE registry |

---

## 6. Recommended SAG Sync Enhancements (Sprint S3 Prerequisites)

Before Sprint S3 auto-reconciliation can run:

1. **Parse `appliedFacts`** — Add typed parser for `CollectionRecord.appliedFacts` JSONB to extract `invoiceRef[]`
2. **Validate sagTerceroId on CollectionRecord** — Confirm all CollectionRecords have `sagTerceroId` populated (run `SELECT COUNT(*) FROM "CollectionRecord" WHERE "sagTerceroId" IS NULL`)
3. **Confirm SAG saldo → CustomerReceivable sync cadence** — Understand how often SAG's cartera view is updated relative to cobro processing
4. **Map comprobanteCode → finality** — Implement `FINAL_COBRO_CODES` constant and apply as filter in all cobro-reading services
5. **Investigate pending → final transition** — Does SAG update the comprobanteCode when a CP/B1/B2 consignación is confirmed? If yes, re-sync is sufficient. If no, a separate confirmation event is needed.
