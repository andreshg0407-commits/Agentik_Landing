# TC-04 — Operational Drilldown Correction
## STATUS: COMPLETE
## DATE: 2026-05-07

---

## What Was Wrong

| Card | Old behavior | Problem |
|------|-------------|---------|
| Cobros recibidos hoy | `href → /reconciliation` | Blind shortcut to another module — no composition shown |
| Cobros identificados | `<div>` — dead (not a link) | Zero action — user had no path forward |
| Consignaciones pendientes | `href → /reconciliation` | Blind shortcut — no record detail, no composition |
| Cuentas por pagar | Shows `$0` but `79 docs` | Misleading headline — SAG SOAP does not populate AP amounts |
| Tesorería inmediata | Showed pending deposits | Wrong definition — duplicated "Consignaciones pendientes" |

---

## What Was Changed

### 1. Cobros recibidos hoy

**Before:** card `href → /${orgSlug}/reconciliation`

**After:** card `href → #detail-cobros-hoy` (anchor scroll to inline detail section)

Detail section (`CobrosHoyDetailSection`) shows:
- Each `CollectionRecord` row for the operational day
- Columns: Fuente · Tercero · Comprobante · Fecha · Monto
- Source: `collectionRecord.findMany` scoped to `latestOpDayStart..latestOpDayEnd`
- Action buttons: "Conciliar →" → `/reconciliation`

Shown only when `records.length > 0`.

---

### 2. Cobros identificados

**Before:** `<div>` — static text, no action

**After:** `<a href="#detail-cobros-identificados">` — scrolls to composition detail

Detail section (`CobrosIdentificadosDetailSection`) shows:
- Breakdown by source group (R1/R2/RS-RA/AN)
- Columns: Fuente · Descripción · Recibos · Total
- Source: existing `cobrosSegments` — no new query needed
- Action buttons: "Gestionar conciliación →" · "Ver cartera →"

Shown only when `cobrosSegments.grandTotal > 0`.

---

### 3. Consignaciones pendientes

**Before:** card `href → /${orgSlug}/reconciliation`

**After:** card `href → #detail-consignaciones` (anchor scroll)

Detail section (`ConsignacionesDetailSection`) shows:
- Individual `SaleRecord` rows for `PENDING_DEPOSIT_SOURCES` (B1/B2/H1/H2/CP)
- Columns: Fuente · Referencia · Tercero · Fecha · Monto · Estado
- Status badge: "PENDIENTE" on every row
- Source: `getPendingDepositDetail(orgId)` — new query in `cobros-detail.ts`
- Action buttons: "Identificar →" · "Ver conciliación inteligente →"

Shown only when `aggregate.count > 0`.

---

### 4. Cuentas por pagar

**AP $0 investigation result:**

SAG SOAP mapper does NOT populate `amount` for AP document codes (C1/G1/C2).
The `amount` field on `SaleRecord` is `0` for all AP documents. This is a known
data gap documented in `cobros-breakdown.ts`: "Codes that have no amount in the SOAP
response arrive as 0 — that is a sync/mapper data gap, not a sign issue."

This is NOT an error in `getApKpis()` — the registry filters are correct. The data
simply does not exist at the source level.

**Fix: show doc count instead of `$0`**

```typescript
// Before:
const cxpValue = hasAp ? fmtCOP(apKpis.netBalance) : "—";
// → renders "$0" when amount missing from SOAP — misleading

// After:
const cxpAmtAvail = hasAp && apKpis.netBalance > 0;
const cxpValue = !hasAp ? "—"
  : cxpAmtAvail ? fmtCOP(apKpis.netBalance)
  : `${apKpis.totalCreated.count} docs`;   // honest: no amount available
```

State label updated: `"79 docs · monto sin detalle SAG"` instead of `"79 docs · saldo neto"`.

Card `href` changed: `→ #detail-cxp`

Detail section (`CxpDetailSection`) shows:
- Urgency block: oldest AP obligation (supplier, date-proxy, source, total count)
- AP document list (C1/G1/C2 records)
- Columns: Fuente · Proveedor · Referencia · Fecha doc · Monto
- "sin monto SOAP" label on rows where amount=0
- Clear label: "fecha doc (proxy)" — never claims "vencimiento"
- Source: `getApDocumentDetail(orgId, carteraWindow)` + `getOldestApRecord(orgId)`

---

### 5. Tesorería inmediata

**Before:** showed `pendingDeposits` (consignaciones B1/B2/H1/H2/CP) — wrong definition, duplicated "Consignaciones pendientes" card.

**After:** shows AP obligation urgency signal — answers "What payment requires the fastest attention?"

New logic:
```typescript
// Headline: total AP obligation count
const depValue = hasOldestAp ? `${totalApDocs}` : "—";
// State: oldest obligation date (clearly labeled as proxy, not vencimiento)
const depState = `obligaciones · más antigua: ${urgentDate} (fecha doc)`;
// Note: oldest supplier name
const depNote = `Proveedor más antiguo: ${urgentName}`;
```

Card sublabel updated: `"Obligaciones · presión de pago más antigua"`
CTA updated: `"Ver obligaciones →"` → `#detail-cxp`
Card uses `oldestAp: ApDocumentRecord | null` prop from server component.

---

## New Data Services

### `lib/finance/cobros-detail.ts` (NEW)

| Function | Query | Use |
|----------|-------|-----|
| `getTodayCollectionDetail(orgId, start, end, take=25)` | `collectionRecord.findMany` scoped to op day | Cobros hoy drilldown |
| `getPendingDepositDetail(orgId, take=25)` | `saleRecord.findMany` WHERE comprobanteCode IN PENDING_DEPOSIT_SOURCES | Consignaciones drilldown |

### `lib/finance/ap-kpis.ts` (EXTENDED)

| Function | Query | Use |
|----------|-------|-----|
| `getApDocumentDetail(orgId, window, take=25)` | `saleRecord.findMany` WHERE comprobanteCode IN AP_CREATION_SOURCES | CxP document list |
| `getOldestApRecord(orgId)` | `saleRecord.findFirst` AP_CREATION_SOURCES ORDER BY saleDate ASC | Tesorería inmediata urgency signal |

All source code groups imported from `lib/financial/source-registry.ts` — no hardcoded arrays.

---

## Data Limitations Found

| Limitation | Impact | Status |
|-----------|--------|--------|
| AP amounts (C1/G1/C2) are 0 — SOAP mapper gap | CxP card cannot show peso amount | Handled — shows doc count instead |
| SaleRecord has no `dueDate` | Can't show AP aging buckets | Handled — uses `saleDate` labeled as "fecha doc (proxy)" |
| Bank/credit data not in SAG | "Bancos y créditos" card remains placeholder | Accepted — no fake data introduced |
| CollectionRecord `documentNumber` may be null | "Comprobante" column shows "—" for some rows | Acceptable — data quality gap in SAG |

---

## Detail Panel Components Added

| Component | Anchor | Data Source | Actions Available |
|-----------|--------|-------------|-------------------|
| `CobrosHoyDetailSection` | `#detail-cobros-hoy` | `CollectionDetailRecord[]` | Conciliar |
| `CobrosIdentificadosDetailSection` | `#detail-cobros-identificados` | `CobrosSegments` | Gestionar conciliación · Ver cartera |
| `ConsignacionesDetailSection` | `#detail-consignaciones` | `DepositDetailRecord[]` | Identificar · Ver conciliación inteligente |
| `CxpDetailSection` | `#detail-cxp` / `#detail-urgente` | `ApDocumentRecord[]` + `ApDocumentRecord | null` | Ver obligaciones |

---

## UX Pattern After TC-04

```
Card click
  → anchor scroll to #detail-[name]
  → inline detail section (same page, no navigation)
  → record list with composition
  → action buttons (primary + secondary)
  → optional: link to external module from detail footer

Never:
  Card click → random module (blind shortcut)
```

---

## TypeScript Status

Zero errors introduced. Zero pre-existing errors affected.

---

## FIN + TC Sprint Status

| Sprint | Status |
|--------|--------|
| FIN-01 | COMPLETE — Financial Source Intelligence Map |
| FIN-02 | COMPLETE — Financial Source Registry |
| FIN-03 | COMPLETE — Torre de Control Registry Migration |
| FIN-03.5 | COMPLETE — AP / Treasury Activation |
| TC-04 | **COMPLETE** — Operational Drilldown Correction |
| FIN-04 | PENDING — Root SI fix in source-semantic-rules.ts |
