# PRODUCTION-STATUS-VALIDATION-02 — Validation Report

**Date:** 2026-06-25
**Mode:** READ-ONLY — zero writes to SAG
**Tenant:** Castillitos
**Database:** INDDIANAA_CASTILLO-ALZATE

---

## Executive Summary

SAG production model validated across 5 phases. The OP (Orden de Produccion) lifecycle is well-understood but the **OP-to-ET linkage is broken** — articulo-based matching yields zero results, meaning we cannot calculate pending production (OP qty minus ET qty) without further investigation into the actual cross-reference mechanism.

**GO/NO-GO Decision: CONDITIONAL GO** — See section below.

---

## 10 Mandatory Questions — Answers

### Q1. How many distinct OP states exist in SAG?

**Answer: 2 states only.**

| State | Count | % |
|---|---|---|
| Open (cerrado=N, anulado=N) | 3,352 | 99.3% |
| Closed (cerrado=S, anulado=N) | 24 | 0.7% |

No other combinations exist. `sc_anulado=S` count: **0**. No OP has ever been anulled.
All flags (`sc_facturado`, `sc_remision_flag`, `sc_generado`, `sc_impreso`) are uniform across all OPs.

### Q2. What determines if an OP is "active" vs "terminated"?

**Answer: `sc_dcto_cerrado` is the sole indicator.**

- `sc_dcto_cerrado = 'N'` → Active (open)
- `sc_dcto_cerrado = 'S'` → Terminated (closed)

However, this flag is **operationally unreliable** — only 24 OPs have ever been closed, all from June-July 2021, all by the same user (Tatiana Andrea Onate Rua). No OP has been closed since July 2021. The business effectively **never closes OPs**.

### Q3. Are there anulled OPs?

**Answer: Zero.** No OP in the entire history has `sc_anulado = 'S'`.

### Q4. What is the OP creation frequency?

**Answer: 30-102 OPs per month (2025-2026).**

| Period | OPs/month (avg) |
|---|---|
| 2025 H1 | 48 |
| 2025 H2 | 67 |
| 2026 YTD | 38 |

Current month (June 2026): 26 OPs created through June 23.

### Q5. How does OP relate to PT (Producto Terminado / ET entries)?

**Answer: THE RELATIONSHIP IS UNRESOLVED.**

Three cross-reference strategies were tested:

1. **Document number matching** (`n_numero_documento`): INVALID — OP and ET use independent consecutive sequences. Same number in different fuentes refers to unrelated documents.

2. **`ss_remision` field**: OPs carry values like "3384-1" but these do NOT match ET `ss_remision` values. The OP `ss_remision` pattern is consistently `OP_number + 2` with "-1" suffix — it likely references a *different* document type (possibly a Salida de Produccion), not ET directly.

3. **Articulo-based matching** (same `ka_nl_articulo` + `ss_talla` + `ss_color`): **RETURNED ZERO RESULTS.** ET items for the same articulos as recent OPs yielded 0 matches. This means either:
   - OP and ET track different `ka_nl_articulo` IDs for the same physical product
   - ET uses a transformed/composite articulo ID
   - The relationship passes through an intermediate document (e.g., Salida de Produccion, fuente 117)

### Q6. Can we calculate pending production (OP qty - ET qty)?

**Answer: NOT YET.** The articulo-based matching returned zero ET items for OP articulos. Without a reliable OP→ET linkage, pending production cannot be calculated.

The 3,944 OP line items from 2026 all show 100% pending (zero ET counterpart), which is statistically impossible for a business producing daily. This confirms the matching strategy is wrong, not that nothing has been produced.

### Q7. Do OPs ever get closed after production completes?

**Answer: Effectively no.** Only 24 OPs were ever closed (all from a 1-month window in 2021). The remaining 3,352 open OPs span 2020-2026. Closed OP items also show zero ET matches, confirming the cross-reference issue is systemic.

**Implication for sync:** We cannot use `sc_dcto_cerrado` as a production completion indicator. An alternative vigency rule is needed (e.g., date-based: OPs older than N months are considered "historically completed").

### Q8. What is the `ss_remision` pattern on OPs?

**Answer: Consistent `OP_number + 2` with "-1" suffix.**

| OP # | ss_remision |
|---|---|
| 3382 | 3384-1 |
| 3381 | 3383-1 |
| 3380 | 3382-1 |
| 3378 | 3380-1 |

This +2 offset with "-1" suffix is 100% consistent across all 30 sampled recent OPs. The referenced number likely points to a Salida de Produccion (fuente 117 or similar), not directly to an ET.

### Q9. What is the observation text pattern?

**Answer: 100% uniform.**

- **OP:** "Generado desde el sistema de Produccion. Inicio de Orden de Produccion" (3,376 OPs)
- **ET:** "Generado por el sistema de Produccion. Entradas a Almacen de Orden de Produccion" (3,638 ETs)

No manual observations, no custom notes. All system-generated.

### Q10. What is the agotados-vs-production cross-reference result?

**Answer: 68 agotado references evaluated — ALL show "AGOTADA SIN PRODUCCION".**

| Classification | Count | % |
|---|---|---|
| Agotada con produccion activa | 0 | 0% |
| Agotada sin produccion | 68 | 100% |
| Agotada con produccion completada | 0 | 0% |

This result is consistent with the broken OP→ET matching (Q5/Q6). However, it may also reflect reality: agotado products (pet toys, baby items, imported goods) are likely **purchased, not manufactured** — they would never appear in production OPs, which track Castillitos's own manufacturing (clothing lines like L-3560, L-3613, etc.).

---

## Production Model Summary

### What we know with certainty

1. **SAG uses MOVIMIENTOS as a universal ledger** — no dedicated production tables exist
2. **OP = fuente 33** (Orden de Produccion), **ET = fuente 116** (Entrada de Producto Terminado)
3. **3,376 total OPs** ever created, 3,352 still open
4. **3,638 total ETs** ever created
5. **OPs are never formally closed** — sc_dcto_cerrado is not maintained
6. **Production is active** — ~30-100 OPs/month, ETs generated daily (most recent: June 24, 2026)
7. **All observations are system-generated** — no manual metadata
8. **OP ss_remision follows a deterministic +2 offset pattern** — likely pointing to intermediate documents

### What remains unresolved

1. **OP→ET cross-reference mechanism** — the three obvious strategies (doc number, ss_remision, articulo) all failed. The actual linkage likely passes through intermediate fuentes (Salida de Produccion = 117, Consumo de MP = 80, etc.)
2. **Whether agotado products have production** — current data says no, but this may be correct (agotados are imported goods, not manufactured)
3. **How to determine OP completion** — without ET matching or sc_dcto_cerrado, there's no reliable way to know if an OP has been fulfilled

### Intermediate document hypothesis

The `ss_remision` offset pattern (+2) suggests a chain:

```
OP (fuente 33) → [fuente X, doc OP#+1] → [fuente Y, doc OP#+2] → ... → ET (fuente 116)
```

The intermediate steps likely include:
- **Salida de MP** (fuente 117): raw material exit from warehouse
- **Consumo de Produccion** (fuente 80): material consumption
- **Entrada de PT** (fuente 116): finished goods entry

A deeper investigation of the `ss_remision` chain across fuentes 80, 117, 114, 115 would reveal the actual linkage graph.

---

## GO/NO-GO Decision for PRODUCTION-SYNC-01

### CONDITIONAL GO

**What we CAN sync now (Phase A):**

1. **OP headers** — all open OPs with date, status, document number
2. **OP line items** — articulo, talla, color, cantidad per OP
3. **ET headers** — all ET entries with date
4. **OP-to-product resolution** — map `ka_nl_articulo` to ProductVariant via `k_sc_codigo_articulo`
5. **Active production flag** — "this reference has OPs in 2026" (binary yes/no)

**What we CANNOT sync yet (Phase B — requires further investigation):**

1. **Pending production quantity** — requires OP→ET linkage resolution
2. **OP completion status** — requires either ET matching or intermediate document chain
3. **Production timeline** — requires the full OP→intermediate→ET chain

### Recommended next step

**PRODUCTION-LINKAGE-INVESTIGATION-01:** A focused investigation of fuentes 80 (CN), 114, 115, 117, 118, 119 to discover the actual OP→ET chain. Specifically:
- Query items from fuentes 80, 117 for the same `ka_nl_articulo` as recent OPs
- Trace the `ss_remision` values across the intermediate fuentes
- Map the complete production lifecycle for a single known OP

### What Agentik can say today

With Phase A sync only:

- "Referencia L-3560 tiene 5 ordenes de produccion activas en 2026 por 625 unidades totales."
- "Referencia 14455-1 (Kit de Aseo para Mascotas) NO tiene ordenes de produccion — es producto importado."

What Agentik CANNOT say until Phase B:

- "Referencia L-3560 tiene 180 unidades pendientes de produccion." (requires ET matching)

---

## Evidence Artifacts

| Artifact | Location |
|---|---|
| Phase 1 forensics script | `scripts/_production-forensics.ts` |
| Phase 2 forensics script | `scripts/_production-forensics-p2.ts` |
| Forensics report | `PRODUCTION_FORENSICS_REPORT.md` |
| Validation script | `scripts/_production-status-validation.ts` |
| This document | `PRODUCTION_STATUS_VALIDATION.md` |

---

## Data Snapshot (2026-06-25)

| Metric | Value |
|---|---|
| Total OPs | 3,376 |
| Open OPs | 3,352 (99.3%) |
| Closed OPs | 24 (0.7%, all from 2021) |
| Anulled OPs | 0 |
| Total ETs | 3,638 |
| 2026 OP line items | 3,944 |
| 2026 ET line items matching OP articulos | 0 |
| Agotado references evaluated | 68 |
| Agotados with active production | 0 |
| OP→ET linkage status | UNRESOLVED |
