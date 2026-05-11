# FIN-03 — Torre de Control Registry Audit
## DATE: 2026-05-07

---

## Audit Scope

Files audited for hardcoded source arrays, implicit source assumptions, and
registry non-compliance inside Torre de Control financial logic.

---

## Full Audit Table

| File | Function / Query | Hardcoded Sources | Issue | Replace With | Risk | Status |
|------|-----------------|-------------------|-------|--------------|------|--------|
| `lib/finance/cobros-breakdown.ts` | `getCobrosBreakdown()` allCodes build | `CODIGOS_COBROS_EMPRESA` (R1,R2) | Named constant, acceptable | Keep — correct | LOW | PENDING |
| `lib/finance/cobros-breakdown.ts` | `getCobrosBreakdown()` allCodes build | `CODIGOS_COBROS_ALMACEN_ACTIVOS` (RS,RC,RG,RA) | Named constant, acceptable | Keep — correct | LOW | PENDING |
| `lib/finance/cobros-breakdown.ts` | `getCobrosBreakdown()` allCodes build | `CODIGOS_RETAIL_FINANCIERO` (SI, AN) | **SI CONFLICT** — SI is EXCLUIR | Filter via `isCollectionSource()` | HIGH | **MIGRATED** |
| `lib/finance/cobros-breakdown.ts` | `getCobrosBreakdown()` consignaciones | `CODIGOS_CONSIGNACIONES_PENDIENTES` | Named constant, duplicate of registry | `PENDING_DEPOSIT_SOURCES` | LOW | **MIGRATED** |
| `lib/castillitos/source-rules.ts` | `SET_RETAIL_FINANCIERO` | `_codeSet(CODIGOS_RETAIL_FINANCIERO)` | **SI CONFLICT** — SI enters SET | Filter via `NA_ELIMINATED_CODES` | HIGH | **MIGRATED** |
| `lib/castillitos/source-rules.ts` | `getCollectionSourceCodes("consolidado")` | Spreads `CODIGOS_RETAIL_FINANCIERO` | **SI CONFLICT** — SI in collection codes | Filter `CODIGOS_RETAIL_FINANCIERO` via registry | HIGH | **MIGRATED** |
| `lib/castillitos/source-rules.ts` | `getCollectionSourceCodes("tiendas")` | Spreads `CODIGOS_RETAIL_FINANCIERO` | **SI CONFLICT** — SI in tiendas collection | Filter `CODIGOS_RETAIL_FINANCIERO` via registry | HIGH | **MIGRATED** |
| `lib/castillitos/source-rules.ts` | `getF1CollectionSourceCodes()` | PYA_SOURCE_REGISTRY businessLayer=COLLECTION_F1 | **SI CONFLICT** — SI classified OFICIAL in source-semantic-rules.ts → appears in result | Filter result via `NA_ELIMINATED_CODES` | HIGH | **MIGRATED** |
| `lib/castillitos/source-rules.ts` | `getCashSourceCodes()` | PYA_SOURCE_REGISTRY COLLECTION_F1 + F2 | **SI CONFLICT** — SI in cash codes | Filter result via `NA_ELIMINATED_CODES` | HIGH | **MIGRATED** |
| `lib/castillitos/source-rules.ts` | `getPendingDepositSourceCodes()` | `CODIGOS_CONSIGNACIONES_PENDIENTES` | Named constant, duplicate of registry | `PENDING_DEPOSIT_SOURCES` | LOW | **MIGRATED** |
| `lib/finance/cobros-kpis.ts` | `COBRO_CODES` | Was `["R1","R2","RS","RC","RG","RA","SI","AN"]` | SI included | `COLLECTION_SOURCES` | HIGH | DONE (FIN-02) |
| `lib/finance/fpa-queries.ts` | All queries | `sagSourceType: "OFICIAL"` / `"REMISION"` | Clean — uses semantic type not code-level | No change needed | NONE | CLEAN |
| `lib/finance/cartera-kpis.ts` | `getCarteraKpis()` | `CustomerReceivable` (no comprobanteCode) | Clean — AR layer, no fuente codes | No change needed | NONE | CLEAN |
| `lib/finance/receivables-snapshot.ts` | `getReceivablesSnapshot()` | `CustomerReceivable` (no comprobanteCode) | Clean — AR layer | No change needed | NONE | CLEAN |
| `app/(app)/[orgSlug]/executive/page.tsx` | All data fetches | Delegates to castillitos/source-rules.ts | Clean — no direct hardcoding | No change needed | NONE | CLEAN |
| `lib/sag/master-data/source-semantic-rules.ts` | `CODIGOS_RETAIL_FINANCIERO` | `["SI", "AN"]` | **ROOT CONFLICT** — SI classified OFICIAL, included in cobros | Should be `["AN"]` | ROOT CAUSE | PENDING (blocked: 26k token file) |

---

## SI Contamination Chain

```
source-semantic-rules.ts
  cobro(111, "SI", "SISTECREDIT", "OFICIAL", ...) ← ROOT CONFLICT
  CODIGOS_RETAIL_FINANCIERO = ["SI", "AN"]
        │
        ├── cobros-breakdown.ts
        │     sum(CODIGOS_RETAIL_FINANCIERO) ← includes SI
        │     → retailFinanciero includes SI amount (0 in practice)
        │
        └── castillitos/source-rules.ts
              SET_RETAIL_FINANCIERO = _codeSet(CODIGOS_RETAIL_FINANCIERO) ← includes SI
                    │
                    ├── getCollectionSourceCodes("consolidado") ← includes SI
                    ├── getCollectionSourceCodes("tiendas") ← includes SI
                    ├── isStoreSource("SI") = true ← wrong
                    │
                    └── PYA_SOURCE_REGISTRY derives businessLayer for SI:
                          familiaDocumento=PAGO_CLIENTE, capaDato=SAG_OFICIAL
                          → _deriveBusinessLayer → COLLECTION_F1
                                │
                                ├── getF1CollectionSourceCodes() ← includes SI
                                └── getCashSourceCodes() ← includes SI
```

**Why SI doesn't corrupt actual KPIs today:**
SI (ka_ni=111) is `ACTIVO=SI` in source-semantic-rules.ts (the cobro() helper hardcodes active=true).
However, SI has `IMPACTA COBROS=NO` in FUENTES.xlsx, meaning no SaleRecord or CollectionRecord
rows exist with comprobanteCode="SI". Every function that includes SI returns 0 for SI amounts.
The semantic classification is wrong but the KPI values are accidentally correct.

**Why fixing it still matters:**
- Wrong classification can mask future data integrity issues
- If anyone ever imports SAG data with comprobanteCode="SI", it would silently enter cobros totals
- The registry's `assertKnownFinancialSource` catches this at import boundaries

---

## Out of Scope for FIN-03 (Future Migrations)

| File | Issue | Sprint |
|------|-------|--------|
| `source-semantic-rules.ts` | Root SI classification (`cobro(111, "SI", "OFICIAL", ...)`) | FIN-04+ (large file) |
| `lib/reconciliation/applied-facts-parser.ts` | Source code patterns | FIN-04+ |
| `lib/finance/auto-reconcile.ts` | Source code matching | FIN-04+ |
| `lib/connectors/adapters/sag-pya-soap/mappers.ts` | `assertKnownFinancialSource` at import boundary | FIN-04+ |
| `lib/customer360/service.ts` | Source code references | FIN-04+ |

---

## Files That Are Already Clean (No Migration Needed)

| File | Reason |
|------|--------|
| `lib/finance/fpa-queries.ts` | Uses `sagSourceType` (OFICIAL/REMISION) — semantic type layer, orthogonal to code registry |
| `lib/finance/cartera-kpis.ts` | Operates on `CustomerReceivable` — no comprobanteCode filtering |
| `lib/finance/receivables-snapshot.ts` | Same as cartera-kpis.ts |
| `lib/sales/source-rules.ts` | Uses `sagSourceType` (OFICIAL/REMISION) — orthogonal semantic layer |
| `app/(app)/[orgSlug]/executive/page.tsx` | Delegates entirely to castillitos/source-rules.ts |
