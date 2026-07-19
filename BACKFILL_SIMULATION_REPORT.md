# BACKFILL_SIMULATION_REPORT.md
## Sprint S2.2 — Phase D: Dry-Run Backfill Simulation Report
_Generated: 2026-05-06 | Based on real production data: Castillitos tenant_

---

## Executive Summary

The dry-run simulation confirms the historical backfill is **technically straightforward** and **safe to execute** once SAG expands `v_pagosnew`. The backfill requires a single cursor reset and one sync trigger. All prerequisites except the SAG-side view expansion are already satisfied.

**One surprise finding:** The mapper fix (`Documento_pagado` before `Numero_Factura`) is **already applied** in `lib/connectors/adapters/sag-pya-soap/mappers.ts` — this prerequisite from S2.1 has been completed.

---

## 1. Current State at Simulation Time

| Metric | Value |
|--------|-------|
| CollectionRecord rows | 20,534 |
| Documento_pagado range | 1 → 2,000,346 (effective max ~10,761) |
| CustomerReceivable rows | 124,998 |
| erpId range | MOV-7 → MOV-269,337 |
| Matched receivables | **5,167 (4.1%)** |
| Matched cobro amount | $14,265,019,748 COP |
| Total receivable balance | $32,679,885,952 COP |
| Unmatched balance | **$18,414,866,205 COP** |

---

## 2. Prerequisite Status

| Prerequisite | Status | Notes |
|-------------|--------|-------|
| SAG v_pagosnew expansion | **PENDING** | External — SAG team coordination required |
| Mapper fix (Documento_pagado first) | **APPLIED** | Detected in `mappers.ts` — mapper reads `Documento_pagado` before `Numero_Factura` |
| Collections cursor (cleared) | Not yet cleared | Currently `date:2026-04-30T05:00:00.000Z` — clear when ready to backfill |
| Connector ID | `cmnhu4hky0000n4y50jlhkfib` | Ready |
| Shadow engine baseline | COMPLETE | `SHADOW_RECONCILIATION_AUDIT.md` |
| Movement range baseline | COMPLETE | `_movement-range-audit.ts` run this sprint |

**The only blocking prerequisite is the SAG team expanding v_pagosnew.**

---

## 3. Coverage Gap (Detailed)

| MOV Range | Receivables | Balance (COP) | Cobros Today | Cobro Amt Today |
|-----------|-------------|---------------|-------------|-----------------|
| MOV 1–5,000 (covered) | 2,962 | $2,674,666,775 | 7,998 | $8,211,881,899 |
| MOV 5,001–10,000 (covered) | 2,603 | $1,076,662,241 | 3,398 | $5,455,256,035 |
| MOV 10,001–50,000 (gap) | 16,073 | $5,165,851,353 | 309 | $597,881,814 |
| MOV 50,001–100,000 (gap) | 19,582 | $5,809,217,252 | 0 | $0 |
| MOV 100,001–200,000 (gap) | 49,843 | $13,558,779,238 | 0 | $0 |
| MOV 200,001+ (gap) | 33,935 | $6,575,274,314 | 0 | $0 |

**Notable:** MOV 10,001–50,000 has 309 cobros ($598M) — partial coverage already exists for that range from the 517 cobros with Documento_pagado 10,001–20,000.

---

## 4. Projected Outcomes by Expansion Scenario

### Conservative scenario
_v_pagosnew partially expanded (MOV 10K–100K only)_

| Metric | Value |
|--------|-------|
| New cobro rows | +50,000 → total 70,534 |
| Client-side pages | 142 |
| Sync duration | ~4.7 min (3 Vercel invocations) |
| Matched receivables after | ~49,999 (40%) |
| Uplift vs today | +44,832 receivables (+868%) |

### Mid scenario
_v_pagosnew expanded to cover MOV 10K–200K_

| Metric | Value |
|--------|-------|
| New cobro rows | +150,000 → total 170,534 |
| Client-side pages | 342 |
| Sync duration | ~11.4 min (7 Vercel invocations) |
| Matched receivables after | ~74,999 (60%) |
| Uplift vs today | +69,832 receivables (+1,351%) |

### Optimistic scenario
_v_pagosnew covers full history to MOV-269K+_

| Metric | Value |
|--------|-------|
| New cobro rows | +400,000 → total 420,534 |
| Client-side pages | 842 |
| Sync duration | ~28.1 min (16 Vercel invocations) |
| Matched receivables after | ~93,749 (75%) |
| Uplift vs today | +88,582 receivables (+1,714%) |

---

## 5. Safety Validation

### Dedup integrity
```
Duplicate naturalKey rows: 0 (CLEAN)
Empty naturalKey rows:     0 (CLEAN)
```

The naturalKey unique constraint is intact. Running the backfill N times will produce the same result as running it once — no duplicates possible.

### Rate limit feasibility
- 1 SOAP call total (entire v_pagosnew in one request)
- Daily budget consumed: 1 / 340 = **0.29%**
- DB page writes do NOT consume SOAP rate limit tokens
- Rate limit is not a bottleneck for backfill

### Cursor reset safety
- Before: `date:2026-04-30T05:00:00.000Z` (incremental mode)
- After clear(): null (full sync on next trigger)
- Recovery: if backfill fails mid-way, cursor shows last completed page (e.g., `page:1000`) → resume exactly from that offset
- Worst case: lose progress on current page → at most 500 rows re-imported (skipped as duplicates by naturalKey)

---

## 6. Execution Checklist

When SAG confirms v_pagosnew expansion:

```
[ ] 1. Record current cursor value (date:2026-04-30T05:00:00.000Z) for rollback
[ ] 2. Run _movement-range-audit.ts — confirm baseline metrics
[ ] 3. Clear collections cursor:
        cursorStore.clear("cmnhu4hky0000n4y50jlhkfib", "collections")
[ ] 4. Trigger first sync:
        POST /api/orgs/castillitos/connectors/cmnhu4hky0000n4y50jlhkfib/sync
        body: { "module": "collections" }
[ ] 5. Monitor response: check rowsRead vs expected (should be much larger than 27,850)
[ ] 6. Continue triggering sync until resumable=false
[ ] 7. Run _movement-range-audit.ts again — verify new Documento_pagado max
[ ] 8. Run _shadow-recon-audit.ts — verify improved match rate
[ ] 9. Report new coverage % to team
```

---

## 7. Conclusion

| Aspect | Assessment |
|--------|-----------|
| Technical readiness | **100%** — all Agentik code is ready |
| Prerequisites met | **5/6** — only SAG view expansion pending |
| Risk level | **LOW** — additive, reversible, idempotent |
| Blocking factor | **SAG coordination** — no estimated timeline |
| Alternative path | Sprint S3 can start now with current 5,167 matched receivables |
| Estimated execution time | 5–30 minutes after SAG confirms expansion |

The backfill is ready to execute on 1 hour's notice once SAG confirms v_pagosnew expansion.
