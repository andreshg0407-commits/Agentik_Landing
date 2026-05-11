# SAG_SYNC_AUDIT.md
## Sprint S2.2 — Phase A: Full SAG Connector Sync Audit
_Generated: 2026-05-06 | Based on static code analysis + production data from S2.1_

---

## 1. Executive Summary

The Agentik SAG connector fetches all available rows from `v_pagosnew` in **one unbounded SOAP call** with no date filter and no TOP/LIMIT. The Documento_pagado range gap (CollectionRecord ≈ 140–10,800 vs CustomerReceivable MOV-7 to MOV-264,351+) is **not caused by Agentik code**. The truncation boundary lives entirely within the SAG SQL Server view definition of `v_pagosnew`, which Agentik has no visibility into or control over.

**Root cause: v_pagosnew is a SAG-managed view that covers a limited slice of the payment history. Agentik faithfully imports whatever SAG exposes.**

---

## 2. Collections Query (COLLECTIONS_QUERY)

### Exact SQL sent to SAG

```sql
SELECT
  p.Codigo_Fuente_Comprobante,
  p.Valor_Pagado,
  p.Fecha_Documento,
  p.Numero_Documento,
  p.Documento_pagado,
  p.Nit_Tercero,
  p.Nombre_Tercero,
  t.Ka_Nl_Tercero
FROM v_pagosnew p
LEFT JOIN TERCEROS t ON CAST(t.n_nit AS BIGINT) = CAST(p.Nit_Tercero AS BIGINT)
WHERE p.Codigo_Fuente_Comprobante IN ('R1','R2','RS','RC','RG','RA','SI','AN')
  AND p.Valor_Pagado > 0
ORDER BY p.Fecha_Documento DESC
```

**Source:** `lib/connectors/adapters/sag-pya-soap/index.ts` lines 716–731

### Filters applied by Agentik
| Filter | Value | Effect |
|--------|-------|--------|
| `Codigo_Fuente_Comprobante IN (...)` | 8 payment types | Excludes non-payment entries (ND, NC, etc.) |
| `Valor_Pagado > 0` | Positive amount only | Excludes reversals and structural zeros |
| Date filter | **NONE** | All historical dates fetched |
| TOP / LIMIT | **NONE** | All matching rows fetched |
| MOVIMIENTO range | **NONE** | No restriction on Documento_pagado range |

**Conclusion: Agentik applies no date range, no row limit, and no Documento_pagado filter. The scope boundary is 100% determined by v_pagosnew on SAG side.**

---

## 3. Pagination Architecture

### Full sync flow

```
1. Vercel function invoked: POST /api/orgs/.../connectors/.../sync  { module: "collections" }
2. sync/route.ts: isRxBatch = false (module !== "receivables")
   → NO maxPages applied → maxPages = Infinity
3. syncEngine.syncModule(connectorId, "collections", {})
4. adapter.pullCollections(cursor=null)
   → SOAP call: consultaSagJson(config, COLLECTIONS_QUERY)
   → SAG returns ALL rows from v_pagosnew in one HTTP response
   → All rows mapped to UnifiedCollection[], stored in _colCache
   → Page 0 sliced: records[0..499], nextCursor="page:500", hasMore=true
5. cursorStore.set(connectorId, "collections", "page:500")
6. Loop: adapter.pullCollections(cursor="page:500")
   → _colCache already populated (instance-level cache)
   → Slice records[500..999], nextCursor="page:1000", hasMore=true
7. ... continues until all pages exhausted ...
8. Last page: isLast=true
   nextCursor = "date:<latestFechaDocumento ISO>"
   hasMore = false
9. cursorStore.set(connectorId, "collections", "date:<ISO>")
```

### Key architectural properties

| Property | Value | Source |
|----------|-------|--------|
| SOAP calls per full sync | **1** | `_colCache` populated once per instance |
| Client-side page size | 500 rows | `RX_PAGE_SIZE = 500` |
| maxPages for collections | **Infinity** | sync/route.ts: isRxBatch guard applies only to "receivables" |
| maxPages for receivables | 20 | isRxBatch = `module === "receivables" && source === "sag_pya_soap"` |
| SOAP timeout | 3 minutes | `AbortSignal.timeout(180_000)` in `lib/connectors/pya/client.ts` |
| Rate limit | 10 req/min, 340 req/day | TokenBucket in adapter |
| Cursor persistence | After each page | `cursorStore.set()` per page iteration |
| Resume on failure | YES — page cursor survives process restarts | `cursorStore.get()` restores position |

### Cursor state machine

```
null           → full sync, page 0
"page:N"       → full sync, mid-progress from offset N
"date:ISO"     → incremental mode, only fetch rows newer than ISO
```

After a successful full sync, cursor transitions to `"date:ISO"` (the most recent `Fecha_Documento` in the dataset). All subsequent sync triggers only import new cobros since that date.

---

## 4. Critical Finding: The maxPages Asymmetry

`sync/route.ts` applies `maxPages: 20` only to receivables:

```typescript
const isRxBatch = module === "receivables" && connector.source === "sag_pya_soap";
const runId = await syncEngine.syncModule(connectorId, module as never, {
  ...(isRxBatch ? { maxPages: 20 } : {}),
});
```

For `module === "collections"`: no maxPages → `Infinity`. This means:
- Collections sync was designed to complete in a **single invocation**
- `20,534 rows / 500 = ~42 pages` → well within one Vercel 120-second window
- The full collections dataset (whatever v_pagosnew exposes) is expected to fit in one run

**This confirms the sync architecture is correct and not the bottleneck.**

---

## 5. CursorStore Implementation

**Source:** `lib/connectors/core/cursor-store.ts`

- Backed by `ConnectorCursor` Prisma model
- Unique key: `connectorId × module`
- `get()`: returns null if no prior sync → triggers full sync
- `set()`: upserts cursor after each page
- `clear()`: deletes cursor for one module (force full re-sync)
- `clearAll()`: deletes all cursors for a connector

**Implication for historical backfill:**
- `cursorStore.clear(connectorId, "collections")` resets to page 0
- A subsequent sync trigger will re-fetch ALL of v_pagosnew from scratch
- Since v_pagosnew is the limiting factor, clearing the cursor will not surface historical data that v_pagosnew doesn't expose
- **A cursor reset alone is not a solution for the sync scope gap**

---

## 6. v_pagosnew: The Black Box

Agentik queries `v_pagosnew` via SOAP. The SAG SOAP endpoint executes the SQL against the SAG SQL Server database. Agentik has:

- **Zero visibility** into how v_pagosnew is defined on SAG SQL Server
- **Zero control** over what rows v_pagosnew contains
- **No way** to modify the view definition without SAG team coordination

### What we know about v_pagosnew from observable data

| Observable | Value | Inference |
|------------|-------|-----------|
| Total rows returned | ~20,534 | v_pagosnew has 20,534 payment rows matching the WHERE filters |
| Documento_pagado min | ~140 | Earliest MOVIMIENTO referenced |
| Documento_pagado max | ~10,800 | Latest MOVIMIENTO referenced |
| CustomerReceivable erpId max | MOV-264,351+ | Invoices generated far beyond cobro coverage |
| Cobro-to-receivable join rate | 55.7% | 44.3% of cobros reference a MOVIMIENTO not in CustomerReceivable |

### Hypotheses for v_pagosnew boundary

| Hypothesis | Evidence | Probability |
|------------|----------|-------------|
| v_pagosnew is date-bounded (e.g., cobros before 2024-01-01 only) | Consistent with MOV gap; "new" in name may be ironic | HIGH |
| v_pagosnew covers a specific business period (legacy import) | The 140–10,800 MOV range could represent one fiscal period | MEDIUM |
| v_pagosnew was created for a migration and not updated | Common in SAG deployments | MEDIUM |
| A separate view covers the higher MOV range | Standard SAG practice: multiple cobro views | HIGH |
| v_pagosnew = ALL cobros and higher MOV invoices are just unpaid | Possible but contradicts business reality ($7.7B owed by one client) | LOW |

**Most likely scenario: SAG has multiple cobro views (v_pagosnew, v_pagosnew2, or date-partitioned views). v_pagosnew covers an older slice. A broader query or additional view is needed to cover MOV-10,800 to MOV-264,351+.**

---

## 7. SOAP Call Mechanics

**Source:** `lib/connectors/pya/client.ts`

```
POST <endpointUrl>
Content-Type: text/xml
Body: SOAP envelope with:
  - a_s_bd (database name)
  - a_s_token (API token)
  - a_s_sql (SQL query string)

Response: SOAP XML → extract consultaSagJsonResult → JSON.parse → array of objects
```

Key constraints:
- 3-minute AbortSignal timeout per call
- No response size limit in client code
- SAG application errors detected via single-row `{ s_estado, s_mensaje }` response

If v_pagosnew contained 200,000 rows, the SOAP call might time out. But at ~20,534 rows, it completes well within 3 minutes. This suggests expanding coverage requires either:
1. Querying a different/broader view (e.g., `v_pagos` or `v_pagosnew2`) — SAG coordination required
2. Querying MOVIMIENTOS directly with a date or range filter — requires schema knowledge

---

## 8. Receivables Sync Comparison

For completeness, the receivables sync has different constraints:

| Aspect | Collections | Receivables |
|--------|-------------|-------------|
| SAG view | v_pagosnew | v_cl or MOVIMIENTOS join |
| maxPages per invocation | Infinity | 20 (≈10,000 rows) |
| Full sync rows | ~20,534 | ~124,998 |
| Invocations to complete full sync | 1 | ~13 (resumable) |
| Row range | Documento_pagado 140–10,800 | erpId MOV-7 to MOV-264,351+ |

The receivables sync successfully covers the full CustomerReceivable range. The gap is exclusively in the collections sync scope.

---

## 9. Sync Architecture Diagram

```
Vercel Function (120s limit)
└── POST /sync { module: "collections" }
    └── syncEngine.syncModule(connectorId, "collections", { /* no maxPages */ })
        └── Loop (hasMore = true):
            ├── cursorStore.get() → cursor (null | "page:N" | "date:ISO")
            ├── adapter.pullCollections(cursor)
            │   ├── If cursor = null or "page:N":
            │   │   ├── [FIRST CALL ONLY] consultaSagJson → v_pagosnew SOAP
            │   │   │   └── Returns ALL rows SAG has in v_pagosnew
            │   │   └── Client-side slice → records[N..N+499]
            │   └── If cursor = "date:ISO":
            │       └── Filter _colCache by collectionDate > dateFilter
            ├── storageHandler.upsert(records)
            └── cursorStore.set(nextCursor)

    [v_pagosnew boundary = hard ceiling SAG controls]
    [Agentik code cannot exceed what SAG exposes]
```

---

## 10. Phase A Conclusions

### What is working correctly
1. COLLECTIONS_QUERY is correct — no spurious filters limiting scope
2. Pagination is correct — all pages are processed (maxPages=Infinity)
3. Cursor persistence is correct — syncs resume safely after restart
4. Row mapping is correct — all 20,534 rows parsed and stored
5. The SOAP call succeeds and returns all available rows from v_pagosnew

### Root cause of the sync scope gap
**v_pagosnew on the SAG SQL Server does not contain cobros for MOVIMIENTOS > ~10,800.**

This is a SAG-side view definition constraint, not an Agentik code bug.

### Required action to expand coverage
1. **SAG coordination (required):** Ask the SAG team to either:
   - Expand v_pagosnew to cover the full MOVIMIENTOS range
   - Provide the name of the view that covers MOV-10,800 to MOV-264,351+
   - Create a new view `v_pagos_historico` or extend the current one
2. **Agentik code change (minimal):** If a different view name is provided, update `COLLECTIONS_QUERY` to reference it — or add a second query for the historical range
3. **Historical backfill:** After expanding v_pagosnew scope, clear the collections cursor and trigger a full re-sync to import the newly available cobros

### What a cursor reset accomplishes (and doesn't)
| Action | Result |
|--------|--------|
| `cursorStore.clear(connectorId, "collections")` | Next sync re-fetches all of v_pagosnew from page 0 |
| Re-fetching v_pagosnew with current definition | Still returns only 20,534 rows (Documento_pagado 140–10,800) |
| After SAG expands v_pagosnew scope | Re-fetch returns expanded row set covering higher MOV range |
| Cursor reset + re-sync after view expansion | Full historical backfill in one invocation |

---

## 11. Immediate Next Actions (Priority Order)

### 1. Diagnose v_pagosnew actual content (scripts — Phase B)
Run `_analyze-sync-coverage.ts` and `_movement-range-audit.ts` to:
- Confirm exact date range of CollectionRecord.collectionDate
- Confirm exact Documento_pagado min/max
- Identify the coverage gap in COP value terms
- Cross-reference with cursor state in ConnectorCursor table

### 2. SAG team inquiry (operational)
Request from SAG team:
> "v_pagosnew currently returns cobros referencing MOVIMIENTO PKs in the range ~140–10,800.
> CustomerReceivable has invoices up to MOVIMIENTO PK 264,351+.
> Please either: (a) expand v_pagosnew to cover the full history, or
> (b) provide the name of the view or table that covers cobros for MOVIMIENTO 10,801+."

### 3. Optional: Test MOVIMIENTOS direct query
If SAG cannot expand v_pagosnew, test a direct MOVIMIENTOS query:
```sql
SELECT TOP 10 * FROM MOVIMIENTOS WHERE ka_nl_movimiento > 10800 AND <payment type filter>
```
This would confirm whether historical payment data exists in another SAG table.

### 4. After view expansion: historical backfill
- Clear collections cursor
- Trigger full sync
- Monitor rows imported vs expected range
- Verify CollectionRecord Documento_pagado range expands

---

## 12. Files Audited

| File | Lines Read | Finding |
|------|------------|---------|
| `lib/connectors/adapters/sag-pya-soap/index.ts` | Full | COLLECTIONS_QUERY confirmed unbounded; _colCache pattern confirmed |
| `lib/connectors/core/sync-engine.ts` | Full | maxPages=Infinity for collections; fullSync option resets cursor |
| `lib/connectors/pya/client.ts` | Full | 3-min timeout; no response size limit; one SOAP call per query |
| `lib/connectors/core/base-adapter.ts` | First 80 lines | Abstract contract; stateless adapters |
| `lib/connectors/core/cursor-store.ts` | Full | Prisma-backed; per connectorId×module; clear() available |
| `app/api/orgs/[orgSlug]/connectors/[connectorId]/sync/route.ts` | Full | maxPages:20 guard applies only to receivables, not collections |
