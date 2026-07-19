# VENDOR-SAMPLE-LEDGER-01 — Sprint Documentation

**Sprint:** VENDOR-SAMPLE-LEDGER-01
**Module:** Comercial > Maletas
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)

---

## Objective

Transform the Maletas module from a configuration/coverage screen into an **operational control center for commercial samples**. Each vendor is a card with health state, inventory breakdown, replacement suggestions, and production alerts — all driven by real data from `CommercialCoverageSnapshot`.

---

## Architecture

```
CommercialCoverageSnapshot (15,309 rows / 3,071 unique refs)
        |
        v
vendor-sample-loader.ts  (Prisma query, DISTINCT ON refCode)
        |
        v
vendor-sample-types.ts   (domain types: SampleState, VendorHealth, etc.)
        |
        v
page.tsx (server component)
        |
        v
maletas-client.tsx (operational UI)
```

### Why vendor-sample-loader.ts instead of the engine pipeline?

The existing engine pipeline (`buildMaletasRuntime` -> `vendor-sample-service.ts`) requires `CommercialCaseItem` rows (vendor assignments) or Excel files. Neither exists:
- `CommercialCaseItem`: 0 rows
- `MALETAS_EXCEL_PATH` / `DISPONIBLE_EXCEL_PATH`: not configured

But `CommercialCoverageSnapshot` has 15,309 rows with real availability data from SAG sync. The loader reads directly from this table, bypassing the engine.

The `vendor-sample-service.ts` remains available for when vendor-specific assignments are populated (Excel or CRM data).

---

## Files Created/Modified

| File | Action | Purpose |
|---|---|---|
| `lib/comercial/maletas/vendor-sample-types.ts` | Created | Domain types: SampleState, VendorHealth, VendorSampleRef, VendorSampleSnapshot, MaletasExecutiveSummary, CoverageGapRef, ProductionSuggestion |
| `lib/comercial/maletas/vendor-sample-service.ts` | Created | Pure transformation layer from MaletasOperationalContext (engine path) |
| `lib/comercial/maletas/vendor-sample-loader.ts` | Created | Server-side Prisma loader from CommercialCoverageSnapshot (active path) |
| `app/(app)/[orgSlug]/comercial/maletas/page.tsx` | Rewritten | Simplified: imports loadVendorSampleData, passes props to client |
| `app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx` | Rewritten | Full operational UI: vendor cards, drawer, tables, executive summary |

---

## Business Rules

| Line | Minimum Units | Description |
|---|---|---|
| LT (Latin Kids) | 30 | Higher volume line |
| CS (Castillitos) | 20 | Core line |
| IMPORT / Other | 10 | Lower volume |

---

## Operational States (SampleState)

| State | Condition | Color | Action |
|---|---|---|---|
| `saludable` | disponible >= minimum | Green | None |
| `riesgo` | 0 < disponible < minimum | Amber | Revisar inventario |
| `critica` | disponible === 0 | Red | Reposicion urgente |
| `sin_inventario` | No central availability | Red | Sin stock disponible |
| `reemplazar` | Below minimum, replacement found | Blue | Reemplazar referencia |
| `sugerir_op` | Zero stock, no replacement | Purple | Solicitar produccion |

---

## Vendor Health (VendorHealth)

| Health | Condition |
|---|---|
| `saludable` | < 15% critical AND < 50 critical refs |
| `riesgo` | < 30% combined risk OR < 100 risk refs |
| `critico` | >= 15% critical OR >= 50 critical refs |
| `sin_datos` | No refs assigned |

---

## Replacement Engine

Deterministic, same-line + same-category matching:

1. Build index of healthy refs with `centralAvailable >= minimumRequired * 2`
2. For each ref in `riesgo` or `critica` state:
   - Look up candidates in same `line|category` bucket
   - Pick candidate with highest `centralAvailable`
   - Set state to `reemplazar` with replacement details
3. If no replacement found and `centralAvailable <= 0`: set to `sugerir_op`

Categories extracted from description keywords: PIJAMA, CONJUNTO, VESTIDO, CAMISETA, ABRIGO, BODY, SHORT, PANTALON, OTRO.

---

## Vendor Configuration

| ID | Name | Warehouse Code | Warehouse Name |
|---|---|---|---|
| ORLANDO | Orlando | 35 | VEND ORLANDO |
| CARLOS_LEON | Carlos Leon | 36 | VEND CARLOS LEON |
| LUIS | Luis | 37 | VEND LUIS |
| NESTOR | Nestor | 38 | VEND NESTOR |
| CARLOS_VILLA | Carlos Villa | 39 | VEND CARLOS VILLA |
| FREDY | Fredy | 40 | VEND FREDY |

---

## UI Components

- **Executive Summary Strip**: KPI row (active vendors, distributed refs, critical, replace, production, coverage gaps)
- **Vendor Cards**: Health bar, metrics grid, state distribution bar, issue badges
- **Vendor Detail Drawer**: KPI grid, health badge, state filter tabs, full reference table with replacement arrows, suggested actions panel
- **Production Suggestions Table**: Reference, description, central availability, demand, affected vendors, urgency
- **Coverage Gaps Table**: References with high availability suitable for broader distribution

All components use AGENTIK design system tokens (C, T, S, R, E), ag-op-table/ag-op-row classes, T.mono typography, and OperationalWorkspaceHeader.

---

## Data Flow

```
1. page.tsx calls loadVendorSampleData(organization.id)
2. Loader queries: SELECT DISTINCT ON ("refCode") ... FROM "CommercialCoverageSnapshot"
3. Each row classified: deriveState(disponible, minimum) -> SampleState
4. Replacement engine runs: applyReplacements(catalog)
5. 6 vendor snapshots built (all share same catalog)
6. Coverage gaps: refs with disponible >= 50 and state === "saludable"
7. Production suggestions: refs with state === "sugerir_op" or (critica + disponible <= 0)
8. Executive summary aggregated
9. All passed as props to MaletasClient
```

---

## Dependencies

- `CommercialCoverageSnapshot` Prisma model (existing, 15,309 rows synced from SAG)
- `OperationalSideDrawer` component
- `OperationalWorkspaceHeader` component
- AGENTIK design system tokens

No new Prisma models. No new migrations. No SAG adapter changes. No engine changes.
