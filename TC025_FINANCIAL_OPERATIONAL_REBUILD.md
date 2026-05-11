# TC-02.5 — Financial Operational Rebuild
## STATUS: COMPLETE
## DATE: 2026-05-07

---

## What Was Removed

| Component | Reason |
|-----------|--------|
| `ObligacionesRadar` | Redundant 3-card block using generic "PENDIENTE" badges; duplicated Bancos concept with ObligacionesCategories |
| `ObligacionesCategories` | Explicitly rejected by client — low operational value, visually noisy placeholder grid |
| `AgentikTesoreriaStrip` | Absorbed as integrated strip inside `TesoreriaOperativa` — no longer a standalone floating element |
| `PresupuestoCard` | Rewritten as `ControlPresupuestal` with corrected semantics, proper empty state, and future-ready CTAs |

**Section title:** `"Obligaciones y Presupuesto"` → `"Tesorería Operativa"`

---

## What Was Rebuilt

### Block A — `TesoreriaOperativa` (replaces 3 old components)

Three operational cards in a clean 3-column grid:

| Card | Label | Operational Empty State |
|------|-------|------------------------|
| A1 | Cuentas por pagar | "Sin proveedores registrados" · "Carga obligaciones para activar alertas de vencimiento" |
| A2 | Bancos y créditos activos | "0 créditos activos registrados" · "Sincronización bancaria pendiente de configuración" |
| A3 | Tesorería inmediata | "0 compromisos próximos" · "Sin obligaciones ni ingresos programados esta semana" |

Design principles applied:
- Left colored border (4px) instead of "PENDIENTE" badge spam
- Distinct accent colors per card (A1 blue, A2 cyan, A3 navy)
- Operational language — describes real state (0 activos, sin registros) vs generic "waiting"
- Specific CTAs: "Registrar proveedores →", "Conectar banco →", "Ver flujo de caja →"
- Agentik strip integrated at bottom: "Tesorería inteligente: Registra tus obligaciones..."

### Block B — `ControlPresupuestal` (replaces `PresupuestoCard`)

4-KPI horizontal row:

| KPI | Label |
|-----|-------|
| B1 | Presupuesto activo |
| B2 | Ejecutado |
| B3 | Disponible |
| B4 | Desviación (+/- with direction) |

Improvements:
- **Empty state**: `"No existen presupuestos activos para {periodLabel}"` (period-specific, not generic)
- **Progress bar**: Retained with green/amber/red thresholds
- **Sub-label**: `"Control por área · por tienda · por campaña · alertas de desviación"` (forward-looking capability description)
- **CTA upgrade**: Single "Crear presupuesto →" CTA + footer rail with `Ver ejecución →` + `Configurar alertas →`
- **Budget status footnote**: `"Módulo disponible · pendiente primera carga presupuestal"` (operational not placeholder)

---

## Architecture Notes (Future-Ready)

### Block A wiring path
When SAG CxP data becomes available (accounts payable sync):
- A1 (`Cuentas por pagar`): wire to `prisma.payableRecord` aggregate — total pending + overdue + next due
- A2 (`Bancos y créditos activos`): wire to manual entry model or bank API connector — loan balance + next payment date
- A3 (`Tesorería inmediata`): wire to `getFpaCashFlow()` inflow projections + A1/A2 obligations — compute 7-day surplus/deficit

The card structure is ready: change `—` values and empty state messages based on `hasData` flags.

### Block B wiring path
When Budget model is populated (via seed or UI):
- `getFpaBudgets(orgId, year)` + `getFpaVariance(orgId, year)` from `lib/finance/fpa-queries.ts` already exist
- Set `hasData = true` and map `aprobado / ejecutado / disponible / desviacion` from live query
- Progress bar already handles live data path (`hasData ? <bar> : <empty state>`)

### Remaining Dependencies

| Integration | Status | Blocks |
|-------------|--------|--------|
| SAG CxP sync (accounts payable) | Not started | A1 live data |
| Banking connector | Not started | A2 live data |
| FP&A budget seed/UI | Not started | B1-B4 live data |
| Fiscal window scoping for CxP | Not started | A1/A3 time-scoped KPIs |

---

## Section Headers

| Before | After |
|--------|-------|
| `"Obligaciones y Presupuesto"` | `"Tesorería Operativa"` |
| sublabel: `"Proveedores · Bancos · Créditos · Leasing · Presupuesto"` | sublabel: `"Cuentas por pagar · Créditos · Caja · Presupuesto"` |
| BlockNotApplicable label same | updated to `"Tesorería Operativa"` |

---

## TypeScript Status

Zero errors introduced. Only pre-existing errors in `scripts/_validate-cartera.ts` (Prisma Decimal type mismatch — unrelated, pre-sprint).

---

## CEO Reading This Section Should Now See

- **Cuentas por pagar**: What we owe suppliers (awaiting data, but structure is clear)
- **Bancos y créditos activos**: Active financial obligations (awaiting bank sync)
- **Tesorería inmediata**: 7-day cash pressure (awaiting integration)
- **No existen presupuestos activos para {period}**: Clear, period-specific budget state
- Two footer CTAs: `Ver ejecución →` and `Configurar alertas →`

The section reads as an operational financial command center, not a placeholder dashboard.
