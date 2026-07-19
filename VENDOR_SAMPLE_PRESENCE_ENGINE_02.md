# VENDOR-SAMPLE-PRESENCE-ENGINE-02

**Sprint:** VENDOR-SAMPLE-PRESENCE-ENGINE-02
**Module:** Comercial > Maletas
**Status:** VALIDATED
**TSC Baseline:** 160 (maintained)
**Prerequisite:** VENDOR-SAMPLE-LEDGER-RECONCILIATION-01 (forensics)

---

## Root Cause

ENGINE-01 grouped transfers by `(ref, talla, color)` with `HAVING net_qty > 0`. This filters out negative variants *before* reference-level aggregation, inflating presence counts via "talla swaps":

```
Ref CGJ-1752285:
  T:2/CF1 → IN=0 OUT=1 NET=-1  ← filtered out by HAVING > 0
  T:3/GR1 → IN=1 OUT=0 NET=+1  ← engine sees this → PRESENT

Ref-level truth: IN=1 OUT=1 NET=0 → ABSENT
```

The business question is: "Does the vendor have a sample of this reference?" — not "Do any talla/color variants have positive net?"

## Fix Applied

### SQL Change (buildVendorBalanceQuery)

**Before (ENGINE-01):**
```sql
SELECT ref, descr, ss_talla, ss_color, net_qty
FROM movimientos_traslados mt ...
GROUP BY ref, descr, ss_talla, ss_color
HAVING net_qty > 0
```

**After (ENGINE-02):**
```sql
SELECT ref, descr, net_qty FROM (
  SELECT
    v.k_sc_codigo_articulo AS ref,
    MAX(v.sc_detalle_articulo) AS descr,
    SUM(CASE WHEN destino = BOD THEN qty ELSE 0 END) -
    SUM(CASE WHEN origen = BOD THEN qty ELSE 0 END) AS net_qty
  FROM movimientos_traslados mt ...
  GROUP BY v.k_sc_codigo_articulo
) sub
WHERE net_qty > 0
```

### Type Changes

- `VendorPresenceItem`: Removed `talla` and `color` fields
- `BalanceRow`: Removed `ss_talla` and `ss_color` fields
- Aggregation loop: Replaced variant-collapse Map with simple row iteration (SQL returns 1 row per ref)

## Validation Results (2026-07-01)

### ENGINE-02 vs Expected (Forensic Audit)

| Vendor | Old (v1) | New (v2) | Swaps Eliminated | Expected | Delta | Grade |
|---|---|---|---|---|---|---|
| Orlando (45) | 273 | 209 | 64 | 209 | 0 | IDEAL |
| Carlos Leon (46) | 259 | 259 | 0 | 259 | 0 | IDEAL |
| Luis (47) | 0 | 0 | 0 | 0 | 0 | IDEAL |
| Nestor (48) | 311 | 240 | 71 | 240 | 0 | IDEAL |
| Carlos Villa (49) | 305 | 271 | 34 | 271 | 0 | IDEAL |
| Fredy (50) | 11 | 4 | 7 | 4 | 0 | IDEAL |
| **Total** | **1,159** | **983** | **176** | **983** | **0** | **IDEAL** |

### Cross-Validation (ENGINE-02 vs Forensic Ledger)

All 6 bodegas: **EXACT MATCH** (0 refs only-in-engine, 0 refs only-in-ledger).

## Verdict

**ENGINE-02 VALIDATION PASSED**

- All vendors: delta = 0 (IDEAL grade, <= 2% threshold)
- Engine SQL and forensic ledger SQL produce identical ref sets
- 176 talla swap phantom refs correctly eliminated
- Orlando: 273 → 209 (target achieved)

## Risks Remaining

1. **Exceso refs (net > 1):** ~20 refs across all vendors have net balance > 1. These are correctly shown as PRESENT but may indicate duplicate transfers in SAG. Non-blocking — mostrario model treats them as binary presence.

2. **Negative refs (net < 0):** ~45 refs with negative balance. These are correctly excluded (net <= 0 → ABSENT). Root cause: returns without matching inbound in SAG F34. Data quality issue in SAG, not in the engine.

3. **SAG rate limits:** 10 queries/min. With 4 active vendors × 2 queries each = 8 queries per load cycle. Within limits but leaves little headroom.

## Files Modified

| File | Change |
|---|---|
| `lib/comercial/maletas/vendor-sample-presence-engine.ts` | SQL: ref-level GROUP BY, types: remove talla/color, aggregation: simplified |
| `scripts/_validate-vendor-presence-engine-02.ts` | NEW — validation script |

## Validation Script

```bash
env $(grep -E '^[A-Z_]+=' .env | tr '\n' ' ') npx tsx scripts/_validate-vendor-presence-engine-02.ts
```
