# TC-03.5 — Executive KPI Trust Layer
## STATUS: IMPLEMENTED
## DATE: 2026-05-07

---

## 1. All Modified KPI Semantics

### Change 1 — "Cobros recibidos hoy" (B1 daily card)
| Field | Before | After |
|-------|--------|-------|
| Sub label | `${n} recibos · R1/R2/almacenes` | `${n} recibos · SAG registrado · pendiente conciliación` |
| Risk | Implied these cobros were confirmed/final | Communicates operational nature: registered but not reconciled |
| File | `executive/page.tsx` ~line 790 | — |

### Change 2 — "Cobros del período" label (B2 Row 1)
| Field | Before | After |
|-------|--------|-------|
| Card label | `Cobros del período` | `Cobros identificados` |
| Context note (new) | — | `Cobros SAG registrados · vinculación a facturas en proceso` |
| Risk | "del período" implied a closed, reconciled total | "identificados" correctly communicates these are matched SAG receipts, not reconciled payments |
| File | `executive/page.tsx` ~line 1008 | — |

### Change 3 — "Cartera 2026 · F1" context note (B2 Row 1)
| Field | Before | After |
|-------|--------|-------|
| Sub note (new) | — | `Cartera SAG · pendiente conciliación bancaria` |
| Risk | No context on data source or reconciliation state | Small muted note clarifies SAG origin and pending reconciliation without alarming |
| File | `executive/page.tsx` ~line 991 | — |

### Change 4 — Cobros ratio text (B2 Row 1, consolidado view)
| Field | Before | After |
|-------|--------|-------|
| Ratio label | `Cobros cubren X% de cartera por gestionar` | `Estimado: cobros representan X% de cartera por gestionar` |
| Risk | Implied a precise financial coverage calculation. In reality both numerator (cobros unreconciled) and denominator (cartera unreconciled) are independently unlinked. | "Estimado:" prefix signals this is an approximation, not a reconciled efficiency figure |
| File | `executive/page.tsx` ~line 961 | — |

---

## 2. Metrics That Remain Provisional

| KPI | Why Provisional | Display Signal |
|-----|----------------|----------------|
| Cobros identificados (B2) | SAG receipts not yet linked to specific invoices | Label: "identificados" + footer note |
| Tasa de recaudo estimada (B4 Subbloque C) | Divides unreconciled cobros by all-time invoiced | Already labeled "estimada" + sub "no reconciliado" ✓ |
| Cobros representan X% de cartera (ratio) | Both sides unreconciled | Prefixed with "Estimado:" |
| Cobros recibidos hoy (B1) | Daily SAG import, not matched to invoices | Sub: "pendiente conciliación" |

---

## 3. Metrics Already Trustworthy

| KPI | Why Trustworthy | Source |
|-----|----------------|--------|
| Cartera vencida (aging, DPD, concentración) | CustomerReceivable is live SAG data with fiscal window scoping | CustomerReceivable table |
| Facturado acumulado (histórico) | SaleRecord OFICIAL (F1 only) — legal document base | SaleRecord |
| Cobros identificados (B4) | Already labeled "sin conciliar" ✓ | CollectionRecord / cobros-breakdown |
| DPD máximo | Calculated from CustomerReceivable.daysOverdue — structural field | CustomerReceivable |
| Alertas críticas count | Binary signal — alert exists or not | BusinessAlert |
| Cartera histórica por depurar | Clearly labeled as "pendiente conciliación con XML" with amber color scheme | CustomerReceivable pre-2026 |

---

## 4. Metrics That Become Trustworthy After Reconciliation

| KPI | Current State | Post-Reconciliation State |
|-----|--------------|--------------------------|
| Cobros identificados | Registered SAG receipts (v_pagosnew) | Becomes "Cobros conciliados" once matched to CustomerReceivable |
| Tasa de recaudo | Estimated: SAG cobros / invoiced (unlinked) | Becomes exact: confirmed payments / invoiced (linked) |
| Cobros ratio vs cartera | Approximation: unreconciled / unreconciled | Becomes: verified payments / verified open balance |
| Cartera 2026 · F1 total | SAG open balance (may include paid but unmatched docs) | Becomes: net of confirmed payments |
| Cartera histórica (2023–2025) | Still open in SAG pending XML matching | Resolves to PAID or WRITTEN_OFF per document |

---

## 5. Recommended Future Trust-State System

Agentik should eventually support per-KPI trust states as metadata:

```
VERIFIED         — Reconciled against two independent sources (e.g. bank + SAG)
PARTIAL          — Reconciled against one source; second source pending
PENDING          — Registered but not yet reconciled
ESTIMATED        — Computed from unreconciled inputs (ratio / projection)
PROJECTED        — Forward-looking extrapolation (daily rate × days)
LIVE             — Real-time feed (no reconciliation gap possible)
```

### Proposed UI pattern (future):
A small trust badge or dot beside each KPI value:
- `●` green = VERIFIED / LIVE
- `◐` blue = PARTIAL
- `○` amber = PENDING / ESTIMATED
- `~` grey = PROJECTED

This system should NOT be implemented yet. The semantic architecture is ready:
- `CobrosKpis.hasRealAmounts` → partial signal already in data layer
- `CarteraKpis.hasData` → present/absent signal
- `SourceSplitOverview.legacyAssumedPct` → trust degradation signal

When auto-reconciliation matures (lib/finance/auto-reconcile.ts + shadow-reconciliation.ts),
the trust state can be promoted automatically from PENDING → PARTIAL → VERIFIED.

---

## Summary

Torre de Control now communicates financial data with appropriate epistemic humility:

- **Cartera data**: trustworthy (SAG live) with a note about pending bank reconciliation
- **Cobros data**: clearly labeled as "identified/registered", not "reconciled"
- **Ratios**: marked as "estimated" where both inputs are unreconciled
- **Language style**: operational, not alarming — "pendiente conciliación" not "data unreliable"

A CEO reading this dashboard understands:
> "Cobros identificados" = we know money came in; we're still matching it to specific invoices.
> "Cartera SAG · pendiente conciliación bancaria" = this is real AR data; bank cross-check pending.
> "Estimado: cobros representan X%" = directional signal, not audited ratio.

This is enterprise-grade transparency without technical accounting jargon.
