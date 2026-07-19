# HISTORICAL_BACKFILL_STRATEGY.md
## Sprint S2.2 — Phase C: Historical Backfill Design
_Generated: 2026-05-06 | Based on S2.2 Phase A+B findings_

---

## 1. Context and Prerequisites

This document describes the safe strategy for backfilling historical CollectionRecord data once SAG expands the `v_pagosnew` view to cover MOVIMIENTOS PKs 10,762–269,337+.

**Current state:**
- CollectionRecord: 20,534 rows, Documento_pagado range 1–10,761 (97.5% of volume)
- CustomerReceivable: 124,998 rows, erpId range MOV-7 to MOV-269,337
- Reconcilable today: 5,167 receivables (4.1%)
- Expected after backfill: 55,000–90,000 receivables (44–72%)

**Hard prerequisites before any backfill:**
1. SAG team confirms v_pagosnew expansion (or provides alternate view name)
2. Mapper fix applied (`Documento_pagado` before `Numero_Factura` in `mappers.ts`)
3. Shadow engine run to validate join quality on expanded data

**No schema changes required for the backfill itself.** CollectionRecord already has all needed fields. The backfill is a data-only operation.

---

## 2. Backfill Design Principles

### Non-negotiable constraints
1. **Idempotent** — running the backfill twice must not create duplicate rows
2. **Resumable** — if the process fails mid-way, the next run continues from where it stopped
3. **Observable** — every page logged with row counts, cursor state, and timing
4. **Non-destructive** — existing CollectionRecord rows must not be modified or deleted
5. **No balance writes** — the backfill only populates CollectionRecord; Sprint S3 will apply those to balances
6. **Rate-limit safe** — must respect TokenBucket (10 req/min, 340 req/day)

### Deduplication mechanism
CollectionRecord uses a `naturalKey` unique index: `@@unique([organizationId, naturalKey])`.
The natural key formula (from mapper):
- If `erpMovId` available: `hash(erpMovId)`
- Else: `hash(comprobanteCode + documentNumber + collectionDate)`

The upsert in the storage handler uses `naturalKey` for conflict resolution. Existing rows are **skipped** (not updated) — this is safe because if a row already exists with the same natural key, the new data would be identical.

**Idempotency guarantee:** Running the full backfill N times produces the same result as running it once.

---

## 3. Backfill Execution Path

### Option A: Cursor reset + full re-sync (recommended)

This is the simplest and most reliable approach:

```
Step 1: Confirm v_pagosnew expansion with SAG team
Step 2: Run _simulate-historical-backfill.ts (dry run — see Phase D)
Step 3: If simulation looks good:
  a. cursorStore.clear(connectorId, "collections")
  b. POST /api/orgs/{orgSlug}/connectors/{connectorId}/sync { module: "collections" }
  c. Monitor logs for rowsRead, rowsImported, rowsSkipped counts
  d. Repeat until resumable=false OR single run completes
Step 4: Run _movement-range-audit.ts again to verify new coverage
Step 5: Run _shadow-recon-audit.ts to measure improved reconciliation rate
```

**Why this works:**
- `cursorStore.clear()` resets cursor to null → next sync is a full re-sync from page 0
- `_colCache` is populated fresh with ALL rows from the expanded v_pagosnew
- Existing rows hit the naturalKey unique constraint → skipped (no duplicates)
- New rows (from expanded range) are inserted
- Cursor advances page-by-page, persisted after each page → safe to interrupt and resume
- No `maxPages` constraint on collections module → completes in a single invocation

**Expected row counts after expansion:**
- Current: 20,534 rows (Documento_pagado 1–10,761)
- After expansion: estimated 100,000–400,000 rows (depending on SAG cobro history depth)
- New rows: 80,000–380,000 additional cobros

### Option B: Incremental range query (advanced — requires SAG cooperation)

If SAG provides a way to query cobros by Documento_pagado range:

```sql
-- Hypothetical new query for high-MOV range
SELECT ... FROM v_pagosnew
WHERE Documento_pagado BETWEEN 10762 AND 269337
  AND Codigo_Fuente_Comprobante IN ('R1','R2','RS','RC','RG','RA','SI','AN')
  AND Valor_Pagado > 0
ORDER BY Documento_pagado ASC
```

This would allow targeted backfill without re-fetching already-imported rows. However, it requires SAG to support parameterized queries or a new view with range support, which is uncertain. **Option A is preferred** for its simplicity.

### Option C: Multiple view union (if SAG has separate views)

If SAG provides `v_pagosnew2` for the modern range:

```typescript
// Additional query to add to the adapter:
const COLLECTIONS_QUERY_EXTENDED = [
  "SELECT ... FROM v_pagosnew2 p",
  "LEFT JOIN TERCEROS t ON ...",
  "WHERE p.Codigo_Fuente_Comprobante IN (...)",
  "  AND p.Valor_Pagado > 0",
  "ORDER BY p.Documento_pagado DESC",
].join(" ");
```

The adapter could query both views, merge results (dedup by naturalKey), and paginate the combined set. This approach requires a minimal adapter change but maintains the same storage/dedup contract.

---

## 4. Chunking Strategy

### Current capacity
- SOAP response: 20,534 rows → well within 3-minute timeout
- Client-side pagination: 500 rows/page → 41 pages
- One Vercel invocation covers all 41 pages (maxPages=Infinity, no 120s constraint at 41×DB-write cycles)

### After expansion (estimated 100,000–400,000 rows)
- SOAP response: may be larger but same endpoint → monitor for timeout
- Client-side pagination: 200–800 pages at 500/page
- Single Vercel invocation should still handle all pages if SOAP call completes

**If SOAP call times out (3-minute limit):**
The SOAP client's `AbortSignal.timeout(180_000)` will abort the request. If this happens with a larger response, the SAG team may need to optimize v_pagosnew or the query may need a TOP/ORDER strategy to fetch in date-range chunks.

**Chunking fallback (if needed):**
If the expanded v_pagosnew returns too many rows for one SOAP call:
```
Chunk 1: WHERE Documento_pagado BETWEEN 1 AND 50000
Chunk 2: WHERE Documento_pagado BETWEEN 50001 AND 150000
Chunk 3: WHERE Documento_pagado BETWEEN 150001 AND 269337
```
Each chunk becomes a separate sync trigger. Dedup by naturalKey handles any overlap between chunks. This requires a minor adapter enhancement to support range parameters.

---

## 5. Cursor Management

### Before backfill
```
Current state:  cursor[collections] = "date:2026-04-30T05:00:00.000Z"
After clear():  cursor[collections] = (deleted — null on next get())
```

### During backfill (page-based mode)
```
Page 0:   cursor = null     → fetches ALL rows from v_pagosnew → stores page:500
Page 1:   cursor = page:500 → slice 500–999 → stores page:1000
Page N:   cursor = page:N   → slice N..N+499 → isLast? store date:ISO : page:N+500
```

### After backfill completes
```
Final state: cursor[collections] = "date:<latestFechaDocumento ISO>"
Mode: INCREMENTAL — subsequent syncs only fetch cobros newer than this date
```

### Resume-after-failure
If the sync process fails mid-page (Vercel timeout, DB error, etc.):
- The cursor was persisted after the last successful page
- Next invocation reads `cursor = "page:N"` and resumes from offset N
- No data loss, no duplicates

---

## 6. Duplicate Prevention Details

### Primary dedup key
```typescript
naturalKey = sha256(erpMovId.toString()).slice(0, 16)         // if erpMovId present
           // or
naturalKey = sha256(`${code}|${docNum}|${dateISO}`).slice(0, 16)  // fallback
```

### Storage handler behavior
The `upsertCollection` storage handler uses:
```prisma
await prisma.collectionRecord.upsert({
  where:  { organizationId_naturalKey: { organizationId, naturalKey } },
  update: {},   // intentionally empty — existing rows not modified
  create: { ...fields },
})
```

This means: existing rows are fully preserved during backfill. Only new rows are inserted.

### Edge case: naturalKey collision
If two different cobros produce the same naturalKey (hash collision), the second is silently skipped. Risk: negligible given sha256 truncated to 16 hex chars (64-bit space) across ~20,534–400,000 rows.

---

## 7. Observability Plan

### Metrics to capture per sync run
- `rowsRead`: total rows from SAG SOAP response
- `rowsImported`: new rows inserted into CollectionRecord
- `rowsSkipped`: rows rejected (dedup hits = already imported + zero-amount + unknown code)
- `rowsErrored`: rows that failed DB write (should be 0)
- `cursorBefore` / `cursorAfter`: page progress visibility
- `startedAt` / `finishedAt`: timing per invocation

### Post-backfill validation queries
Run `_movement-range-audit.ts` after backfill to verify:
1. New total row count in CollectionRecord
2. Updated Documento_pagado max
3. New matched receivable count (Section 5 of the audit script)
4. Updated coverage percentages

### Expected outcomes after successful backfill
| Metric | Before | After (estimated) |
|--------|--------|------------------|
| CollectionRecord rows | 20,534 | 100,000–400,000 |
| Documento_pagado max | ~10,761 | ~269,337+ |
| Matched receivables | 5,167 (4.1%) | 55,000–90,000 (44–72%) |
| Reconcilable balance | $1.6B | $15B–$25B |

---

## 8. Risk Register

| Risk | Severity | Mitigation |
|------|----------|-----------|
| SOAP timeout with expanded v_pagosnew | MEDIUM | Monitor first run; if timeout occurs, implement chunk queries |
| SAG v_pagosnew takes days/weeks to expand | HIGH | No mitigation (external dependency). Sprint S3 can proceed with current 5,167 receivables while waiting. |
| Natural key collision on new rows | LOW | Hash space (64-bit) >> row count; negligible |
| Rate limiter (340 req/day) hit during backfill | LOW | 1 SOAP call per full sync, ~42+ DB-write pages, well under rate limit |
| Vercel 120s timeout during page writes | LOW | maxPages=Infinity + 41–800 pages at ~2s/page = 82s–1600s. For >400 pages, may need multiple invocations. Cursor handles resume. |
| Duplicate appliedFacts on re-sync | NONE | update:{} ensures existing rows are not modified |
| Sprint S3 write engine reads stale CollectionRecord during backfill | LOW | S3 engine uses snapshotted joins; backfill adds rows, never removes. Any run during backfill is safe (just less complete). |

---

## 9. Backfill Trigger Checklist

Before triggering historical backfill:

- [ ] SAG team has confirmed v_pagosnew expansion (or new view provided)
- [ ] `_simulate-historical-backfill.ts` dry run completed with expected row counts
- [ ] Mapper fix applied (`Documento_pagado` before `Numero_Factura`)
- [ ] Shadow engine run shows ≥20% improvement in match rate on simulated expanded data
- [ ] ConnectorCursor for `collections` module backed up (note current value before clearing)
- [ ] Monitoring window scheduled (avoid triggering during business-critical hours)

---

## 10. Rollback Plan

There is no true rollback needed — the backfill is additive only. However:

**If new rows contain bad data:**
```sql
-- Delete only rows created after backfill timestamp (example)
DELETE FROM "CollectionRecord"
WHERE "organizationId" = '<orgId>'
  AND "createdAt" > '<backfill-start-timestamp>'
  AND CAST("rawJson"->'raw'->>'Documento_pagado' AS INTEGER) > 10761;
```

**If cursor gets corrupted:**
```typescript
await cursorStore.set(connectorId, "collections", "date:2026-04-30T05:00:00.000Z");
// Restores to pre-backfill incremental state
```

**No production balance data is touched by the backfill.** The only affected table is `CollectionRecord`.

---

## 11. Phase C Conclusion

The historical backfill strategy is:
1. **Simple** — cursor reset + sync trigger, existing dedup handles everything
2. **Safe** — additive only, no existing rows touched, no balance writes
3. **Resilient** — cursor-based resume after any failure
4. **Observable** — row counts and cursor state logged per page

**The only blocker is external: SAG must expand v_pagosnew.** All Agentik code is already capable of handling a larger response. The adapter, storage handler, dedup, and cursor mechanism are production-ready for backfill.

**Estimated implementation time after SAG unblocks:**
- Mapper fix: 5 minutes
- Cursor clear + sync trigger: 2 minutes
- Monitoring + validation: 30 minutes
- Total: ~1 hour of engineering time
