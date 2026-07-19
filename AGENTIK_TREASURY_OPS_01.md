# AGENTIK-TREASURY-OPS-01
## Tesorería Operativa — Operational Financial Runtime

**Sprint:** AGENTIK-TREASURY-OPS-01
**File scope:** `app/(app)/[orgSlug]/finanzas/tesoreria/page.tsx`
**Backend constraint:** NO Prisma, NO APIs, NO engine, NO SAG changes

---

## Strategic context

Tesorería Operativa is NOT:
- a generic financial dashboard
- a feature landing page
- a list of accounting modules

Tesorería Operativa IS:
- the operational center for money inside Agentik

### Complementary roles

| Module | Role |
|--------|------|
| Torre de Control | Detects · Summarizes · Prioritizes · Financial health · Intelligence |
| **Tesorería Operativa** | **Executes · Operates · Manages · Cash flow · Action** |
| Conciliación Inteligente | Matching engine · Document validation |
| Centro Documental | Financial document repository |
| Cierre Financiero | Period control · Accounting validation |
| Planeación Financiera | Forecast · Budgets · Scenarios |

---

## UX philosophy

Tesorería must feel like:
- a modern operational financial center
- Stripe Treasury · Mercury · Linear for finance
- Bloomberg simplified

NOT like:
- SAP / Quickbooks / legacy ERP
- a KPI metrics dashboard
- a traditional accounting form

Design principles: **dense · operational · alive · actionable**

---

## Page structure delivered

```
Tesorería Operativa
│
├─ 1. Operational Header
│    OperationalWorkspaceHeader · breadcrumb from Torre de Control
│    status="warning" · statusLabel="Sincronización parcial"
│
├─ 2. Operational Status Bar
│    Dark strip (C.exec) · 5 runtime badges:
│    CAJA DISPONIBLE · BANCOS ACTIVOS · PAGOS CRÍTICOS · RIESGO LIQUIDEZ · FORECAST 7D
│
├─ 3. Posición de Caja                           ← most important section
│    4 KPI cards: Disponible · Hoy · Comprometido · Proyectado 7d
│    Bank distribution table (per-bank row: balance + status + sync)
│    Dinero comprometido (CxP · nómina · pagos · IVA)
│    Riesgo inmediato (amber panel: dependencia cartera · desbalance · sobregiro)
│
├─ 4. Flujo del Día
│    5 metric cards: ingresos · egresos · identificados · sin ID · pendientes
│    Movement feed (5 rows with direction accent, amount, status badge)
│
├─ 5. Bancos y Cuentas
│    Per-bank cards (5 banks) with:
│    · Status badge · Balance · Sync time · Conciliation pending flag · CTA
│    Top border accent color by status (green/blue/amber/gray)
│
├─ 6. Obligaciones Pendientes
│    Grid table: Obligación · Cat. · Vence · Monto · Estado
│    Left border accent by severity (red/amber/gray)
│    IA amber note: Agentik risk detection + recommendation
│
├─ 7. Forecast de Caja
│    3 columns: 7 días · 30 días · 90 días
│    Each: period total + 4 variable rows (cobros/pagos/cartera/nómina)
│    Color coding: positive = green, negative = C.inkMid
│
├─ 8. IA Financiera
│    2-column panel:
│    Left: Agentik detections (4 signals with severity dots)
│    Right: Suggested actions (4 CTAs linking to operational workspaces)
│    Footer note: "Agentik actualiza señales con datos SAG sincronizados"
│
└─ 9. Centro de Acciones Operativas
     ag-action-tray: Subir extracto · Registrar movimiento · Programar pago
     Ver conciliaciones (→ /reconciliation) · Actualizar forecast · Exportar posición
```

---

## Visual language

All values follow AGENTIK-UX-SYSTEM-LOCK-01:
- `C.*` tokens only — no raw hex
- `T.mono` as `fontFamily` (string, never spread)
- `S[n]` for spacing (numeric, React interprets as px)
- `R.*` for border radii
- `E.*` for box shadows
- CSS classes: `ag-kpi-card`, `ag-op-status--*`, `ag-op-row`, `ag-action-*`, `ag-intel-header`, `ag-action-tray`

---

## Operational status bar design

The dark strip (`background: C.exec`) at the top creates a runtime feel distinct from Torre de Control.
Five badges give instant operational awareness without entering any subsection:
- **CAJA DISPONIBLE** — total cash position
- **BANCOS ACTIVOS** — how many banks are connected
- **PAGOS CRÍTICOS** — what's due today
- **RIESGO LIQUIDEZ** — immediate liquidity signal
- **FORECAST 7D** — projected position

This pattern is borrowed from Bloomberg terminal headers and Stripe's operational dashboard.

---

## Bank status system

| Status | Border color | Badge class | Action |
|--------|-------------|-------------|--------|
| `connected` | `C.green` | `ag-op-status--ok` | Ver movimientos |
| `partial` | `C.blue` | `ag-op-status--info` | Ver actividad |
| `requires_action` | `C.amber` | `ag-op-status--warning` | Subir extracto |
| `pending` | `C.inkGhost` | `ag-op-status--pending` | Configurar |

---

## IA financial layer

The IA Financiera section establishes the pattern for Agentik's financial intelligence:
1. **Detection signals** — severity-colored dot + text describing what was found
2. **Suggested actions** — direct links to the affected operational workspaces
3. **Source note** — "Agentik actualiza señales con datos SAG sincronizados"

Future activation: replace static `AI_FINDINGS` array with live calls to:
`GET /api/orgs/[orgSlug]/tesoreria/ai-signals`

---

## Future engine hooks

When backend is activated, replace these mock constants:

| Constant | Replace with |
|----------|-------------|
| `CASH` | `getTreasuryPosition(orgId)` |
| `BANKS` | `getBankAccounts(orgId)` |
| `COMMITTED` | `getCommittedPayments(orgId)` |
| `OBLIGATIONS` | `getPendingObligations(orgId)` |
| `AI_FINDINGS` | `getTreasuryAISignals(orgId)` |

Movement feed requires: `GET /api/orgs/[orgSlug]/tesoreria/movements?limit=5`
Forecast requires: `GET /api/orgs/[orgSlug]/tesoreria/forecast?periods=7,30,90`

---

## What was NOT changed

- Prisma schema — zero changes
- SAG adapters — zero changes
- Any API routes — zero changes
- Torre de Control, Conciliación, other modules — untouched

---

## TypeScript compliance

- Zero new errors introduced.
- Project total: 160 errors (unchanged from baseline).
- All helper Records are typed against `BankStatus` and `Severity` union types.
- No `as const` spreads used on T.mono (string, not object).
