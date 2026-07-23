# AGENTIK-ORDERS-SAG-HISTORICAL-READ-COMPLETENESS-01

Sprint: SAG Historical Order Read Completeness
Tenant: Castillitos
Date: 2026-07-23

---

## 1. Architecture Before Go-Live

### Order Sources (3 independent tables)

| Source | Table | Records | Purpose |
|---|---|---|---|
| SAG Historical | CustomerOrderRecord | 9,678 | PD orders from SAG MOVIMIENTOS |
| CRM Legacy | CRMQuote | ~285 | Quotes from SuiteCRM V8 |
| Agentik Native | AgentExecution | 1 | Orders created in wizard |

### Problems Identified

1. **Seller always empty** in list view (hardcoded `sellerName: ""`)
2. **Drawer slow** (2 SOAP calls per open: MOVIMIENTOS + TERCEROS)
3. **94 orders missing lines** (MOVIMIENTOS_ITEMS never synced)
4. **No line aggregates** persisted (lineCount, totalUnits, totalLineValue)
5. **rawJson empty** for all 9,678 records
6. **No origin classification** (SAG vs Agentik vs CRM)
7. **No data authority rules** (SAG could overwrite Agentik data)

---

## 2. Architecture After Go-Live

### OrderOrigin (canonical)

```typescript
type OrderOrigin =
  | "SAG_HISTORICAL"    // Orders from SAG before go-live
  | "AGENTIK_NATIVE"    // Orders from Agentik wizard
  | "CRM_LEGACY";       // Orders inherited from CRM
```

### Data Authority

| Field Group | SAG_HISTORICAL | AGENTIK_NATIVE | CRM_LEGACY |
|---|---|---|---|
| Header | SAG | AGENTIK | CRM |
| Lines | SAG | AGENTIK | CRM |
| Seller | SAG | AGENTIK | CRM |
| Customer | SAG | AGENTIK | CRM |
| Status | SAG | AGENTIK | SAG |
| Invoice | SAG | SAG | SAG |
| Dispatch | SAG | SAG | SAG |

### Go-Live Cutoff

```typescript
AGENTIK_ORDERS_GO_LIVE_AT: Date | null = null; // Set on go-live day
```

- Explicit source always has priority over date.
- A SAG order created after go-live is still SAG_HISTORICAL.
- An Agentik order created before go-live is still AGENTIK_NATIVE.

**Procedure for go-live day:**
1. Set `AGENTIK_ORDERS_GO_LIVE_AT` in `order-authority.ts`.
2. Deploy.
3. New wizard orders classified AGENTIK_NATIVE.
4. Historical SAG orders remain SAG_HISTORICAL.
5. No backfill on AGENTIK_NATIVE orders.

---

## 3. No-Degradation Rules

A SAG sync MUST NOT:
- Replace non-empty Agentik data with null/empty.
- Replace Agentik lines with an empty SAG line set.
- Remove Agentik seller because SAG doesn't return one.
- Overwrite Agentik customer data.

A SAG sync MAY:
- Fill empty fields on Agentik orders (enrichment).
- Set invoice/dispatch (SAG-authoritative fields).
- Update post-creation status (acceptance, rejection, cancellation).

Differences are logged as inconsistencies, not silently merged.

---

## 4. Line Coverage

### Before Sprint

| Metric | Value |
|---|---|
| Orders with lines | 9,584 / 9,678 (99.0%) |
| Total lines | 1,140,881 |
| Orders without lines | 94 |

### After Sprint

| Metric | Value |
|---|---|
| Orders with lines | 9,670 / 9,678 (99.9%) |
| Total lines | 1,148,087 (+7,206) |
| Orders without lines | 8 |
| Line aggregates persisted | 9,670 (99.9%) |

---

## 5. Seller Coverage

### Before Sprint

| Metric | Value |
|---|---|
| Seller in list view | 0 / 9,678 (0%) |
| SOAP calls per drawer | 2 |

### After Sprint

| Source | Count | Confidence |
|---|---|---|
| SAG MOVIMIENTOS | 4,619 | HIGH |
| CRM quote history | 1,590 | MEDIUM |
| Unavailable | 3,469 | NONE |
| **Total resolved** | **6,209 (64.2%)** | |

### Seller Coverage by Year

| Year | Resolved | Total | Coverage |
|---|---|---|---|
| 2020 | 801 | 803 | 99.8% |
| 2021 | 1,789 | 1,808 | 98.9% |
| 2022 | 1,089 | 1,438 | 75.7% |
| 2023 | 342 | 1,431 | 23.9% |
| 2024 | 467 | 1,300 | 35.9% |
| 2025 | 670 | 1,783 | 37.6% |
| 2026 | 1,051 | 1,115 | 94.3% |

### Gap Classification (3,469 unresolved)

All 3,469 have `sellerTerceroId IS NULL` in SAG. The field `ka_nl_tercero_vend` was genuinely never populated in SAG for these orders (2023-2025 gap period). No TERCEROS lookup failure. No zero-value IDs. Seller data simply does not exist in the source system.

### Seller Display in UI

| SellerDisplayStatus | Label |
|---|---|
| SAG_CONFIRMED | "Vendedor SAG confirmado" |
| CRM_INFERRED | "Vendedor inferido desde CRM" |
| UNAVAILABLE | "No informado por SAG" |

---

## 6. Eight Orders Without Lines

All 8 exist as headers in SAG MOVIMIENTOS (sc_anulado='N'), but have **zero rows in MOVIMIENTOS_ITEMS**. All have amount=0 and vendedor=null.

| # | erpMovId | Date | Status | Customer (masked) | Classification |
|---|---|---|---|---|---|
| 8144 | 228204 | 2025-08-05 | FACTURADO | EL T*** DE LOS M*** | EMPTY_CONFIRMED |
| 6799 | 183175 | 2024-09-27 | FACTURADO | ALIANZA M*** SAS | EMPTY_CONFIRMED |
| 6115 | 165057 | 2024-05-16 | FACTURADO | EL S*** BG S.A.S | EMPTY_CONFIRMED |
| 5217 | 133347 | 2023-08-03 | FACTURADO | J*** P*** D*** | EMPTY_CONFIRMED |
| 4472 | 118726 | 2023-03-14 | FACTURADO | J*** P*** D*** | EMPTY_CONFIRMED |
| 4393 | 117208 | 2023-02-27 | FACTURADO | R*** G*** C*** | EMPTY_CONFIRMED |
| 3647 | 92063 | 2022-08-10 | FACTURADO | M*** I*** P*** | EMPTY_CONFIRMED |
| 3033 | 74824 | 2022-03-31 | CANCELADO | R*** DE J*** F*** | CANCELLED |

**Classification logic:**
- 7 orders: Header exists, no lines in SAG, amount=0, status=FACTURADO -> EMPTY_CONFIRMED (header-only PD documents, likely converted directly to invoice without line detail)
- 1 order: Status=CANCELADO -> CANCELLED

**Not "0 lines" — these are "lines not applicable" or "historical without detail".**

---

## 7. Backfill Result

| Step | Records | Duration |
|---|---|---|
| Seller resolution (SAG SOAP + CRM) | 6,209 resolved | ~29 min |
| Line sync (94 missing orders) | 7,206 lines created | ~9s |
| Line aggregates | 9,670 computed | ~29 min (bundled) |
| Idempotency verification | 0 new work on re-run | ~22s |

---

## 8. Performance

### Drawer Load (5 sample orders)

| Order | Lines | DB Time | Seller | SOAP |
|---|---|---|---|---|
| #9994 | 525 | 549ms | persisted | SKIP |
| #9999 | 1 | 185ms | persisted | SKIP |
| #9995 | 12 | 253ms | persisted | SKIP |
| #9997 | 381 | 276ms | SOAP needed | YES |
| #9998 | 747 | 343ms | SOAP needed | YES |

- **No N+1**: Single query with `include: { lines: true }`.
- **No SOAP when seller persisted**: 64.2% of orders skip SOAP entirely.
- **Remaining 35.8%**: Seller genuinely missing in SAG. SOAP call attempts resolution but will find nothing (field null in source). Could be optimized to skip SOAP for known-null records in a future sprint.

---

## 9. Limitations

1. **35.8% seller gap is permanent**: SAG did not populate ka_nl_tercero_vend for 2023-2025 orders. No source system has this data.
2. **8 orders have no lines**: These are genuinely empty in SAG. No data to recover.
3. **Reconciliation**: totalHeaderSag vs totalLinesComputed shows DIFFERENCE on some orders (discounts, IVA, partial invoicing). This is expected business behavior, not a bug.
4. **Go-live date not set**: AGENTIK_ORDERS_GO_LIVE_AT = null. Must be configured on actual go-live day.
5. **rawJson still empty**: The backfill populated sellerTerceroId but rawJson remains `{}` for historical records. Future re-sync will populate it.

---

## 10. Files

### Modified

| File | Change |
|---|---|
| `prisma/schema.prisma` | +7 columns on CustomerOrderRecord |
| `lib/connectors/adapters/sag-pya-soap/index.ts` | Added ka_nl_tercero_vend to MOVIMIENTOS query |
| `lib/connectors/adapters/sag-pya-soap/storage.ts` | Persist sellerTerceroId as first-class column |
| `lib/comercial/pedidos/order-types.ts` | OrderOrigin expanded, DataAuthority, LineDataStatus, SellerDisplayStatus types |
| `lib/comercial/pedidos/order-service.ts` | Read persisted seller, skip SOAP, canonical origins |
| `app/(app)/[orgSlug]/comercial/pedidos/pedidos-client.tsx` | Support new origin values |

### New (versioned)

| File | Purpose |
|---|---|
| `lib/comercial/pedidos/order-authority.ts` | Origin classification, field authority, merge rules, go-live cutoff |
| `lib/comercial/pedidos/order-sag-backfill.ts` | Backfill service for seller + line aggregates |
| `lib/comercial/pedidos/__tests__/order-sag-historical-read-completeness.test.ts` | 50 tests, 10 suites |
| `prisma/migrations/20260723000000_order_seller_and_aggregates/migration.sql` | Migration |
| `docs/audits/AGENTIK-ORDERS-SAG-HISTORICAL-READ-COMPLETENESS-01.md` | This document |

### Scripts (excluded from commit — one-time runners)

| File | Purpose | Exclude? |
|---|---|---|
| `scripts/_backfill-order-seller-and-lines.ts` | Backfill runner | YES — backfill complete |
| `scripts/_sync-missing-order-lines.ts` | Line sync runner | YES — sync complete |
| `scripts/_investigate-empty-orders.ts` | SAG investigation | YES — one-time diagnostic |
| `scripts/_perf-drawer-orders.ts` | Performance measurement | YES — one-time diagnostic |
| `scripts/_server-only-shim.js` | server-only bypass for scripts | YES — not needed in production |

### TSC

194 errors (baseline, 0 new).
