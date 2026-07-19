# CASTILLITOS-SYNC-LINEAGE-INVESTIGATION-01

**Sprint:** CASTILLITOS-SYNC-LINEAGE-INVESTIGATION-01
**Date:** 2026-06-28
**Mode:** READ ONLY — no corrections, no syncs, no writes
**Scope:** Reconstruct the COMPLETE sync lineage for every Castillitos domain

---

## Phase 1: Sync Flow Catalog

### 1.1 Connectors

| ID | Source | Name | Status | Modules | Created |
|---|---|---|---|---|---|
| `cmnhu4hky0000n4y50jlhkfib` | `sag_pya_soap` | SAG PYA SOAP | ACTIVE | `["customers", "receivables"]` | 2026-04-02 |
| `cmnhu4hnp0001n4y5u7ha3xb2` | `castillitos_crm` | Castillitos CRM | ACTIVE | `["customers", "opportunities", "activities", "quotes"]` | 2026-04-02 |

**CRITICAL FINDING:** The SAG connector's `modules` array only contains `["customers", "receivables"]`.
The SyncEngine iterates `connector.modules` in `syncAll()`. This means:
- `movements`, `collections`, `orders` are synced ONLY via explicit `syncModule()` calls with a `module` param
- They are NEVER synced by `syncAll()` — a missing cron would leave them permanently stale

### 1.2 Sync Trigger Mechanism

| Mechanism | Status | Evidence |
|---|---|---|
| **Vercel Cron** | NO DATA SYNC CRONS | `vercel.json` has only: financial-memory (daily), finance/runtime (30min), video-render (2min) |
| **SyncJob table** | EMPTY | 0 records — never used |
| **Manual API call** | ONLY MECHANISM | `POST /api/orgs/[orgSlug]/connectors/[connectorId]/sync` — requires authenticated session |
| **n8n webhook** | NOT WIRED | No n8n workflow triggers for data sync |
| **Scheduled cron** | NOT IMPLEMENTED | No `app/api/cron/sync/` route exists |

**ROOT CAUSE #1: ALL data sync is manual.** No automated mechanism exists to keep any domain current.

### 1.3 Sync Pathways (Two Independent Systems)

**Pathway A — SyncEngine (Connector Framework)**
- Triggered by: `POST /api/orgs/.../connectors/{id}/sync`
- Orchestrator: `lib/connectors/core/sync-engine.ts` → `SyncEngine.syncModule()`
- Records runs in: `ConnectorRun` table
- Advances cursor in: `ConnectorCursor` table
- Domains: customers, receivables, movements, collections, orders, opportunities, activities, quotes

**Pathway B — Direct SAG Sync (Standalone Scripts)**
- Triggered by: `npx tsx scripts/_sag-inventory-sync.ts` or `scripts/_production-sync-01a.ts`
- Orchestrator: Direct function call to `syncSagInventory()` or `syncProductionOrders()`
- Records runs in: NOTHING — no ConnectorRun created
- Advances cursor in: NOTHING — no cursor tracked
- Domains: inventory (PIL), production, transfers

**This split explains why recent inventory (Jun 23) and production (Jun 25) syncs are NOT in ConnectorRun.**

---

## Phase 2: ConnectorRun Audit

### 2.1 Run Summary by Status

| Status | Count | Earliest | Latest |
|---|---|---|---|
| SUCCESS | 37 | 2026-04-03 | 2026-05-02 |
| FAILED | 23 | 2026-04-03 | 2026-05-01 |
| PARTIAL | 6 | 2026-04-21 | 2026-04-25 |
| RUNNING | 4 | 2026-04-25 02:42 | 2026-04-25 04:28 |

### 2.2 Run Summary by Module

| Module | Runs | Last Run | Total Imported |
|---|---|---|---|
| collections | 3 | 2026-05-02 | 41,095 |
| orders | 1 | 2026-04-30 | 9,045 |
| movements | 13 | 2026-04-25 | 266,619 |
| receivables | 22 | 2026-04-22 | 749,903 |
| customers | 24 | 2026-04-21 | 355,548 |
| quotes | 4 | 2026-04-03 | 285 |
| activities | 1 | 2026-04-03 | 0 |
| opportunities | 2 | 2026-04-03 | 0 |

### 2.3 Hung Runs (status=RUNNING, never finalized)

| ID | Module | Started | Rows Read |
|---|---|---|---|
| `cmodfrolp00006my5s3og2flw` | movements | 2026-04-25 02:42 | 0 |
| `cmodieg8x0000mry5cy0g2w0u` | movements | 2026-04-25 03:55 | 0 |
| `cmodj7grk000049y50hi6tdwl` | movements | 2026-04-25 04:18 | 0 |
| `cmodjknzn0000d0y5n8rjl7jj` | movements | 2026-04-25 04:28 | 0 |

**All 4 hung runs are movements on Apr 25.** Reads=0 means the SOAP call itself timed out before returning data. The adapter does not finalize the ConnectorRun on timeout — it stays as RUNNING forever.

### 2.4 Failed Runs — Error Analysis

| Date | Module | Error |
|---|---|---|
| 2026-05-01 | collections | `PYA_SAG_ERROR [FALLIDO]: Invalid column name 'Fecha_Pago', 'Nro_Comprobante', 'Ka_Nl_Movimiento', 'Fecha_Pago'` |
| 2026-04-25 (x3) | movements | `PYA_SAG_ERROR [FALLIDO]: Object reference not set to an instance of an object` |
| 2026-04-22 | receivables | `Reset manual: proceso zombie terminado sin finalizar (no timeout configurado)` |
| 2026-04-21 (x2) | receivables | Same zombie reset |
| 2026-04-21 | receivables | `Object reference not set to an instance of an object` |
| 2026-04-21 | customers | `Object reference not set to an instance of an object` |

**Error patterns:**
1. **SAG NullReferenceException** — server-side crash on the SOAP endpoint. Intermittent. Not fixable from Agentik side.
2. **Invalid column name** — collections query used wrong column names (`Fecha_Pago` instead of `Fecha_Documento`). Fixed in code but never re-run.
3. **Zombie process** — sync hung indefinitely, manually reset via `_reset-rx-sync.ts`.

---

## Phase 3: SalesImportBatch Audit

10 batches, ALL from April 25, 2026. All linked to movements sync runs.

| Batch | Scope Key (RunId) | Imported | Status |
|---|---|---|---|
| 1 | `cmodf8xh90000wky5aaujwft2` | 16,458 | DONE |
| 2 | `cmodfrolp00006my5s3og2flw` | 20,500 | DONE |
| 3 | `cmodg8iu50000jey5mnhdudut` | 25,000 | DONE |
| 4 | `cmodgqmnh0000rky51lea5hvb` | 24,999 | DONE |
| 5 | `cmodhdq700000ayy5ge7fzvt4` | 24,999 | DONE |
| 6 | `cmodieg8x0000mry5cy0g2w0u` | 17,000 | DONE |
| 7 | `cmodj7grk000049y50hi6tdwl` | 4,500 | DONE |
| 8 | `cmodjknzn0000d0y5n8rjl7jj` | 5,500 | DONE |
| 9 | `cmodk3gdt0000mcy5zbkh6bu5` | 50,000 | DONE |
| 10 | `cmodki2790000v6y5e7x5by3s` | 125,163 | DONE |

**Total:** 314,119 records across 10 batches (some runs processed same rows — scope keys map to ConnectorRun IDs including hung ones).

---

## Phase 4: Inventory Lineage

### PIL (ProductInventoryLevel) Path — LIVE

```
SAG SOAP API (MOVIMIENTOS_ITEMS + v_articulos)
  → lib/connectors/adapters/sag-pya-soap/catalog/sag-variants-sync.ts  [syncSagVariants()]
  → lib/connectors/adapters/sag-pya-soap/inventory/sag-inventory-normalizer.ts  [normalizeForUpsert()]
  → lib/connectors/adapters/sag-pya-soap/inventory/sag-inventory-sync.ts  [syncSagInventory()]
    → Prisma: ProductVariant.upsert() + ProductInventoryLevel.create/update()
    ← scripts/_sag-inventory-sync.ts (manual CLI trigger)
```

| Attribute | Value |
|---|---|
| Trigger | Manual script: `npx tsx scripts/_sag-inventory-sync.ts` |
| ConnectorRun recorded | NO |
| Cursor tracked | NO |
| Last sync | 2026-06-23 (PIL `syncedAt` column) |
| Records | 156,832 |
| Batch size | 25 parallel upserts |
| Error handling | try/catch per variant, errors counted, not thrown |
| Full replace | YES — single date in `syncedAt` = all records refreshed |

### CCS (CommercialCoverageSnapshot) Path — DERIVED

```
ProductInventoryLevel (PIL)
  → lib/inventory/inventory-control-service.ts  [buildInventoryControlSnapshot()]
    OR
  → lib/comercial/inventory/loaders.ts  [loadAvailability()]
  → Prisma: CommercialCoverageSnapshot.upsert()
    ← UI page load (server component) triggers rebuild
```

| Attribute | Value |
|---|---|
| Trigger | UI page load (server component on /comercial/inventario or /comercial/tiendas) |
| Last snapshot | 2026-06-28 (today — rebuilt on page load) |
| Records | 3,048 |
| Source | PIL data + `Math.max(0, pilSum - pendingOrders)` where pendingOrders always = 0 |

**CRITICAL BUG:** `pendingOrders` always 0 because CustomerOrderRecord status is `'PENDIENTE'` in DB but code filters for `'open'`. Availability is overstated by the sum of all pending orders.

---

## Phase 5: Commercial Coverage Lineage

```
PIL (ProductInventoryLevel)
  → SaleRecord (last 90 days sales velocity)
  → CustomerOrderRecord (pending orders — BROKEN, always 0)
  → lib/comercial/inventory/coverage-engine.ts
    → CommercialCoverageSnapshot.upsert()
```

**Breakpoint:** Order deduction never happens. Status mismatch `'PENDIENTE'` vs `'open'`.

---

## Phase 6: Orders Lineage

```
SAG SOAP API (MOVIMIENTOS WHERE k_n_clase_fuente=4)
  → lib/connectors/adapters/sag-pya-soap/index.ts  [pullMovements() → _orderCache side-effect]
  → lib/connectors/adapters/sag-pya-soap/mappers.ts  [mapSagOrder()]
  → lib/connectors/adapters/sag-pya-soap/storage.ts  [customerOrderStorage.upsertMany()]
    → Prisma: CustomerOrderRecord.upsert() by (organizationId, erpMovId)
    ← POST /api/orgs/.../connectors/{id}/sync  {module: "orders"}
```

| Attribute | Value |
|---|---|
| Trigger | Manual API call with `module: "orders"` |
| ConnectorRun recorded | YES |
| Last sync | 2026-04-29 (single run, 9,045 records) |
| Status on import | `'PENDIENTE'` (hardcoded default from SAG) |
| Batch size | 200 (ORDER_BATCH_SIZE) |
| Dedup key | `(organizationId, erpMovId)` |

**CRITICAL:** Orders depend on `pullMovements()` being called first (populates `_orderCache` as side-effect). The "orders" module call internally triggers `pullMovements(undefined)` if the cache is cold. This means **every orders sync also pulls ALL movements** — an expensive SOAP call.

**BROKEN:** Order status is never updated after import. SAG does not provide order lifecycle status. All 9,045 orders are stuck as `'PENDIENTE'` forever.

---

## Phase 7: Receivables Lineage

```
SAG SOAP API (MOVIMIENTOS + MOVIMIENTOS_ITEMS + FUENTES + TERCEROS JOIN)
  → lib/connectors/adapters/sag-pya-soap/index.ts  [pullReceivables()]
    → Filter: sc_cobrar_pagar = 'C' (AR only, skip AP)
  → lib/connectors/adapters/sag-pya-soap/mappers.ts  [mapSagReceivable()]
  → lib/connectors/adapters/sag-pya-soap/storage.ts  [customerReceivableStorage.upsertMany()]
    → Prisma.$transaction(ops) — batch of 500 upserts
    → Post-batch: refreshProfileReceivables() per NIT
    ← POST /api/orgs/.../connectors/{id}/sync  {module: "receivables"}
```

| Attribute | Value |
|---|---|
| Trigger | Manual API call with `module: "receivables"` |
| ConnectorRun recorded | YES |
| Last sync | 2026-04-22 (22 runs over 2 days, 124,998 records total) |
| Cursor strategy | `page:N` → `date:ISO` (client-side pagination of SAG's single response) |
| Page size | 500 (RX_PAGE_SIZE), max 20 pages per invocation |
| Batch size | 500 ($transaction batch) with row-by-row fallback |
| Dedup key | `(organizationId, erpId)` where erpId = ka_nl_movimiento |

**BROKEN:**
- `paidAmount` is always 0 (no payment source in SAG — PAGOS table exists but is empty)
- `agingBucket` computed at sync time, never recalculated
- `daysOverdue` frozen at Apr 22 values (67 days stale)

---

## Phase 8: Sales Lineage

```
SAG SOAP API (same MOVIMIENTOS query as receivables)
  → lib/connectors/adapters/sag-pya-soap/index.ts  [pullMovements()]
    → Filter: exclude class-4 orders (→ _orderCache) and non-AR rows
  → lib/connectors/adapters/sag-pya-soap/mappers.ts  [mapSagMovement()]
  → lib/connectors/adapters/sag-pya-soap/storage.ts  [saleRecordStorage.upsertMany()]
    → Creates SalesImportBatch per run
    → Prisma: SaleRecord.upsert() by (organizationId, naturalKey)
    ← POST /api/orgs/.../connectors/{id}/sync  {module: "movements"}
```

| Attribute | Value |
|---|---|
| Trigger | Manual API call with `module: "movements"` |
| ConnectorRun recorded | YES |
| Last sync | 2026-04-25 (13 runs, 266,619 imported) |
| Total SaleRecords | 125,163 |
| Date range | Up to 2026-04-30 (saleDate) |
| Dedup key | `(organizationId, naturalKey)` where naturalKey = SHA256("MOV-{erpMovId}") |
| Batch size | 200 (SALE_BATCH_SIZE), Promise.allSettled per batch |

**NOTE:** Movements and orders share the SAME SOAP query. Class-4 rows become orders; all others become SaleRecords.

---

## Phase 9: Collections Lineage

```
SAG SOAP API (v_pagosnew view)
  → lib/connectors/adapters/sag-pya-soap/index.ts  [pullCollections()]
    → Filter: Codigo_Fuente_Comprobante IN ('R1','R2','RS','RC','RG','RA','SI','AN')
    → Filter: Valor_Pagado > 0
  → lib/connectors/adapters/sag-pya-soap/mappers.ts  [mapSagCollection()]
  → lib/connectors/adapters/sag-pya-soap/storage.ts  [collectionStorage.upsertMany()]
    → Prisma: CollectionRecord.upsert() by (organizationId, naturalKey)
    ← POST /api/orgs/.../connectors/{id}/sync  {module: "collections"}
```

| Attribute | Value |
|---|---|
| Trigger | Manual API call with `module: "collections"` |
| ConnectorRun recorded | YES |
| Last sync | 2026-05-02 (3 runs, 20,534 unique records) |
| Latest collectionDate | 2026-04-30 |
| Dedup key | `(organizationId, naturalKey)` |
| Batch size | 200 (COLLECTION_BATCH_SIZE), Promise.allSettled |

**CRITICAL:** CollectionRecords are synced but NEVER applied to CustomerReceivable.paidAmount. The `appliedStatus` field exists but is never set. Collections and receivables are two disconnected datasets.

---

## Phase 10: Production Lineage

```
SAG SOAP API (MOVIMIENTOS WHERE ka_ni_fuente=33)
  → lib/connectors/adapters/sag-pya-soap/production/sag-production-sync.ts  [syncProductionOrders()]
    → Fetch headers, then fetch MOVIMIENTOS_ITEMS for those headers
  → lib/connectors/adapters/sag-pya-soap/production/sag-production-normalizer.ts  [buildProductionSnapshots()]
  → Prisma: ProductionOrder.upsert() + ProductionOrderLine.upsert()
    ← scripts/_production-sync-01a.ts (manual CLI trigger)
```

| Attribute | Value |
|---|---|
| Trigger | Manual script: `npx tsx scripts/_production-sync-01a.ts` |
| ConnectorRun recorded | NO |
| Cursor tracked | NO |
| Last sync | 2026-06-25 (ProductionOrder.syncedAt) |
| ProductionOrder count | 3,376 |
| ProductionOrderLine count | 56,586 |
| Batch size | 50 OPs per $transaction, 120s timeout |

---

## Phase 11: Transfer Lineage

```
SAG SOAP API (MOVIMIENTOS WHERE ka_ni_fuente IN (34, 206))
  → lib/connectors/adapters/sag-pya-soap/transfers/sag-transfer-sync.ts  [syncInventoryTransfers()]
  → lib/connectors/adapters/sag-pya-soap/transfers/sag-transfer-normalizer.ts  [buildTransferSnapshots()]
  → Prisma: InventoryTransfer.upsert() + InventoryTransferLine.upsert()
    ← NO TRIGGER EXISTS — code is written but never called
```

| Attribute | Value |
|---|---|
| Trigger | NONE — no script, no API route |
| DB tables | `InventoryTransfer` and `InventoryTransferLine` DO NOT EXIST in database |
| Code status | Complete sync service exists but no Prisma migration created |
| ConnectorRun recorded | NO |

**CRITICAL:** Transfer sync is fully implemented in code but:
1. No Prisma migration for `InventoryTransfer` / `InventoryTransferLine` tables
2. No script to invoke `syncInventoryTransfers()`
3. No API route to trigger it
4. Complete dead code path

---

## Phase 12: Maletas Lineage

```
VendorCommercialBag / VendorBagItem / VendorBagOrderLine (Prisma models)
  → lib/comercial/maletas/ (domain logic)
  → app/(app)/[orgSlug]/comercial/maletas/ (UI)
```

| Attribute | Value |
|---|---|
| Source | Agentik-native (user-created, not synced from SAG) |
| Sync | N/A — maletas are not imported from external sources |
| Tables | VendorCommercialBag, VendorBagItem, VendorBagOrderLine exist in DB |
| Data | Created by users through the UI, linked to ProductEntity/ProductVariant |

**Not a sync issue.** Maletas are operational entities created in Agentik, not imported data.

---

## Phase 13: CRM (Quotes/Opportunities/Activities) Lineage

```
SuiteCRM V8 JSON:API
  → lib/connectors/adapters/castillitos-crm/index.ts  [CastillitosCrmAdapter]
    → pullCustomers() / pullOpportunities() / pullActivities() / pullQuotes()
  → lib/connectors/adapters/castillitos-crm/storage.ts
    → crmCustomerStorage / crmOpportunityStorage / crmActivityStorage / crmQuoteStorage
  → Prisma: CustomerProfile (CRM fields) / CRMOpportunity / CRMActivity / CRMQuote
    ← POST /api/orgs/.../connectors/{id}/sync  {module: "quotes"|"customers"|...}
```

| Attribute | Value |
|---|---|
| Trigger | Manual API call |
| ConnectorRun recorded | YES |
| Last quotes sync | 2026-04-03 (285 records) |
| Last customers sync | 2026-04-21 (CRM source) |
| CRM config | Requires `clientId` + `clientSecret` in Connector.config |
| Batch size | 200 per batch, V8 page size 500 |

**BLOCKER:** CRM `clientId`/`clientSecret` status unknown — may have expired. Last CRM sync was Apr 3 for quotes.

---

## Phase 14: Token/Access Audit

### SAG PYA SOAP

| Parameter | Source | Status |
|---|---|---|
| Token | `Connector.config.token` → fallback `PYA_SOAP_TOKEN` env → `SAG_TEST_TOKEN` env | Token present (env vars) |
| Endpoint | `Connector.config.endpointUrl` → `PYA_SOAP_ENDPOINT` env → hardcoded Azure URL | Active |
| Database | `Connector.config.database` → `PYA_SAG_BD` env | Set |
| Rate limit | 10 req/min, 340 req/day (in-memory token bucket) | Enforced |

### Castillitos CRM

| Parameter | Source | Status |
|---|---|---|
| Base URL | `Connector.config.baseUrl` | `https://crm-castillitos.jrconsultores.com.co/pruebas` |
| Token endpoint | `Connector.config.tokenEndpoint` | Same domain `/Api/access_token` |
| Client ID/Secret | `Connector.config.clientId/clientSecret` | UNKNOWN — not in env vars, only in DB |

---

## Phase 15: Breakpoint Map

### Complete Breakpoint Inventory

| # | Domain | Last Alive | Breakpoint | Type | Impact |
|---|---|---|---|---|---|
| BP-01 | **All domains** | N/A | No automated sync (cron/webhook) | INFRASTRUCTURE | ALL data stops flowing when no human triggers sync |
| BP-02 | **Receivables** | Apr 22 | Manual sync not repeated since Apr 22 | HUMAN | 67 days stale, $0 paidAmount, frozen aging buckets |
| BP-03 | **Movements/Sales** | Apr 25 | Hung SOAP calls (4 RUNNING runs) + no retry | INFRASTRUCTURE | 64 days stale |
| BP-04 | **Orders** | Apr 29 | Single sync run, never repeated | HUMAN | Status stuck as 'PENDIENTE', never lifecycle-updated |
| BP-05 | **Orders→Coverage** | Forever | `'PENDIENTE'` vs `'open'` status filter mismatch | BUG | pendingOrders always 0, availability overstated |
| BP-06 | **Collections→Cartera** | May 2 | Collections synced but never applied to receivables | MISSING LOGIC | paidAmount always $0 despite 20,534 payment records |
| BP-07 | **Collections** | May 2 | Column name error in SOAP query (fixed in code, never re-run) | BUG+HUMAN |
| BP-08 | **Transfers** | Never | No Prisma migration, no script, no API route | UNFINISHED | Transfer data never imported despite complete sync code |
| BP-09 | **Inventory (PIL)** | Jun 23 | Standalone script, no cron, no ConnectorRun tracking | INFRASTRUCTURE | 5 days stale, no monitoring |
| BP-10 | **Production** | Jun 25 | Standalone script, no cron, no ConnectorRun tracking | INFRASTRUCTURE | 3 days stale, no monitoring |
| BP-11 | **CRM Quotes** | Apr 3 | Never re-synced after initial import | HUMAN | 86 days stale |
| BP-12 | **CCS→Orders** | Forever | CCS rebuilds on page load but uses broken order data | BUG | Coverage calculations always wrong |
| BP-13 | **Hung runs** | Apr 25 | 4 ConnectorRun records stuck as RUNNING, no cleanup | BUG | Pollutes run history, no alerting |
| BP-14 | **Aging buckets** | Apr 22 | Computed at sync time, never recalculated | DESIGN | All aging data 67 days wrong |

---

## Phase 16: Root Cause Matrix

### Primary Root Causes

| # | Root Cause | Breakpoints Affected | Severity | Fix Complexity |
|---|---|---|---|---|
| RC-01 | **No automated sync infrastructure** | BP-01, BP-02, BP-03, BP-04, BP-07, BP-09, BP-10, BP-11 | CRITICAL | Medium — add Vercel cron routes |
| RC-02 | **Two disconnected sync pathways** | BP-09, BP-10, BP-13 | HIGH | Medium — unify under SyncEngine |
| RC-03 | **Order status mapping bug** | BP-05, BP-12 | HIGH | Low — fix `'PENDIENTE'` → `'open'` filter |
| RC-04 | **Collections never applied to receivables** | BP-06 | HIGH | Medium — build reconciliation engine |
| RC-05 | **Transfer migration never created** | BP-08 | MEDIUM | Low — `prisma migrate dev` + script |
| RC-06 | **Aging buckets never recalculated** | BP-14 | MEDIUM | Low — add recalc in cron or on-read |
| RC-07 | **SOAP timeout not handled gracefully** | BP-03, BP-13 | MEDIUM | Low — finalize RUNNING runs on timeout |

### Dependency Graph

```
RC-01 (no cron) ──────────────┐
                               ├─→ ALL domains stale
RC-02 (split pathways) ───────┘

RC-03 (status bug) ────────────→ BP-05 (orders broken)
                               └─→ BP-12 (CCS broken)

RC-04 (no reconciliation) ────→ BP-06 (paidAmount = $0)
                               └─→ BP-14 (aging wrong)

RC-05 (no migration) ─────────→ BP-08 (transfers dead code)

RC-06 (aging frozen) ──────────→ BP-14 (aging buckets wrong)

RC-07 (timeout handling) ─────→ BP-03 (hung runs)
                               └─→ BP-13 (zombie records)
```

---

## Phase 17: Recovery Plan

### P0 — Fix Now (blocks all sync)

| Action | Files | Effort |
|---|---|---|
| **Create sync cron route** | `app/api/cron/sync/route.ts` + update `vercel.json` | 2h |
| **Fix order status filter** | Find all `status === 'open'` → `status === 'PENDIENTE'` | 30m |
| **Finalize hung ConnectorRun records** | Script to update RUNNING → FAILED with error message | 30m |

### P1 — Fix This Sprint (data quality)

| Action | Files | Effort |
|---|---|---|
| **Unify Pathway B under SyncEngine** | Register inventory/production as SyncEngine modules | 4h |
| **Add aging bucket recalculation** | Add to cron or loader (recompute `daysOverdue` from today) | 2h |
| **Create transfer Prisma migration** | `prisma migrate dev` for InventoryTransfer/Line tables | 1h |
| **Build collection→receivable reconciliation** | Apply CollectionRecord amounts to CustomerReceivable.paidAmount | 8h |
| **Re-run all domain syncs** | Execute full sync for: receivables, movements, collections, orders, customers, quotes | 4h |

### P2 — Structural Improvements

| Action | Files | Effort |
|---|---|---|
| **Add sync monitoring/alerting** | Detect stale domains, alert via BusinessAlert | 4h |
| **Add SOAP timeout handling** | Finalize RUNNING → FAILED on adapter timeout | 2h |
| **Add ConnectorRun tracking to Pathway B** | Record runs for inventory/production syncs | 2h |
| **Validate CRM credentials** | Test CRM connection, refresh if needed | 1h |

### P3 — Long-term Architecture

| Action | Effort |
|---|---|
| Build SAG webhook receiver (push-based sync) | 2 weeks |
| Implement incremental cursor for all standalone syncs | 1 week |
| Add order lifecycle tracking (PENDIENTE → DESPACHADO → ENTREGADO) | 1 week |
| Build paidAmount reconciliation engine (match payments to invoices) | 2 weeks |

---

## Appendix A: Complete Sync Timeline

```
2026-04-02  Connectors created (SAG PYA SOAP + Castillitos CRM)
2026-04-03  CRM: quotes (285), opportunities (0), activities (0) synced
2026-04-03  SAG: first customer syncs (FAILED, then SUCCESS)
2026-04-21  SAG: customers (355,548 total imported across 24 runs)
2026-04-22  SAG: receivables (124,998 across 22 runs, 2 days)
            ↳ 3 zombie processes manually reset
2026-04-25  SAG: movements (266,619 across 13 runs)
            ↳ 4 hung RUNNING runs never finalized
            ↳ 3 FAILED: SAG NullReferenceException
            ↳ SalesImportBatch: 10 batches, 125,163 final SaleRecords
2026-04-29  SAG: orders (9,045 — single run, all PENDIENTE)
2026-05-01  SAG: collections FAILED (wrong column names)
2026-05-02  SAG: collections SUCCESS (20,534 records from v_pagosnew)
            ↳ Last ConnectorRun-tracked sync
--- 52 DAYS GAP (no ConnectorRun-tracked sync) ---
2026-06-23  Inventory (PIL): 156,832 levels via standalone script
2026-06-25  Production: 3,376 orders + 56,586 lines via standalone script
2026-06-28  CCS: 3,048 snapshots rebuilt on UI page load (today)
```

## Appendix B: Table Existence Audit

| Table | Exists | Records | Last Data |
|---|---|---|---|
| ProductInventoryLevel | YES | 156,832 | Jun 23 |
| ProductionOrder | YES | 3,376 | Jun 25 |
| ProductionOrderLine | YES | 56,586 | Jun 25 |
| CustomerOrderRecord | YES | 9,045 | Apr 29 |
| CustomerReceivable | YES | 124,998 | Apr 22 |
| CollectionRecord | YES | 20,534 | May 2 |
| SaleRecord | YES | 125,163 | Apr 25 |
| CommercialCoverageSnapshot | YES | 3,048 | Jun 28 |
| CRMQuote | YES | 285 | Apr 3 |
| CustomerProfile | YES | ~15,000+ | Apr 21 |
| SalesImportBatch | YES | 10 | Apr 25 |
| InventoryTransfer | NO | — | — |
| InventoryTransferLine | NO | — | — |
| SyncJob | YES | 0 | — |
| ConnectorMapping | YES | 0 | — |
| IntegrationConnection | YES | 0 | — |

## Appendix C: File Index

### Sync Infrastructure
- `lib/connectors/core/sync-engine.ts` — SyncEngine orchestrator
- `lib/connectors/core/connector-registry.ts` — Adapter registry
- `lib/connectors/core/cursor-store.ts` — Cursor persistence
- `lib/connectors/core/dedup.ts` — Intra-page deduplication
- `lib/connectors/adapters/index.ts` — Registration side-effects (storage handlers + adapters)

### SAG PYA SOAP Adapter
- `lib/connectors/adapters/sag-pya-soap/index.ts` — SagPyaSoapAdapter (pull*)
- `lib/connectors/adapters/sag-pya-soap/storage.ts` — Storage handlers (upsertMany)
- `lib/connectors/adapters/sag-pya-soap/mappers.ts` — SAG row → unified record mappers
- `lib/connectors/adapters/sag-pya-soap/query-catalog.ts` — SQL query templates

### Standalone Sync Services (Pathway B)
- `lib/connectors/adapters/sag-pya-soap/inventory/sag-inventory-sync.ts` — PIL sync
- `lib/connectors/adapters/sag-pya-soap/production/sag-production-sync.ts` — Production sync
- `lib/connectors/adapters/sag-pya-soap/transfers/sag-transfer-sync.ts` — Transfer sync (DEAD CODE)
- `scripts/_sag-inventory-sync.ts` — CLI trigger for inventory
- `scripts/_production-sync-01a.ts` — CLI trigger for production

### CRM Adapter
- `lib/connectors/adapters/castillitos-crm/index.ts` — CastillitosCrmAdapter
- `lib/connectors/adapters/castillitos-crm/storage.ts` — CRM storage handlers
- `lib/connectors/adapters/castillitos-crm/client.ts` — OAuth2 + JSON:API transport

### API Routes
- `app/api/orgs/[orgSlug]/connectors/[connectorId]/sync/route.ts` — Manual sync trigger
- `app/api/orgs/[orgSlug]/integrations/sag/sync-inventory/route.ts` — V1 CCS manual upload
- `vercel.json` — Cron definitions (NO data sync crons)

---

**END OF INVESTIGATION**

Trust Score Impact: This investigation confirms all findings from CASTILLITOS-DATA-FRESHNESS-FORENSICS-01
and adds the EXACT file paths, function chains, and breakpoints for every domain.

The single most impactful fix is RC-01: adding a Vercel cron route that calls
`POST /api/orgs/castillitos/connectors/{id}/sync` for each module on a schedule.
This would unbreak 8 of 14 breakpoints immediately.
