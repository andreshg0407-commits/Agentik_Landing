# Maletas — UI Vision Document
**Sprint:** AGENTIK-COMERCIAL-MALETAS-INTELLIGENCE-01
**Status:** PRE-BUILD — no code created yet. Engine validated first.
**UX System:** AGENTIK-UX-SYSTEM-LOCK-01

---

## Core principle

Maletas is NOT inventory.

Maletas is **cobertura operacional comercial**.

The UI must answer one question above all:
> ¿La operación comercial tiene cobertura suficiente para vender sin romper producción?

This translates into three operational zones:
1. **Vendedores** — state of each case, per vendor × line
2. **Referencias** — item-level coverage, velocity, action
3. **Producción / Reposición** — what needs to happen and when

---

## Route structure

```
/[orgSlug]/comercial/maletas
  ├── page.tsx               → Server Component (loads engine context)
  ├── maletas-client.tsx     → Canvas client
  └── components/
        ├── maletas-header.tsx
        ├── case-grid.tsx
        ├── items-table.tsx
        └── drawers/
              ├── case-drawer.tsx
              └── item-drawer.tsx
```

---

## Layout blueprint (Agentik UX)

```
┌─────────────────────────────────────────────────────────┐
│  OperationalWorkspaceHeader                             │
│  "Maletas Comerciales" · Línea LT · CS · [timestamp]   │
│  Status strip: COBERTURA · REPOSICIÓN · PRODUCCIÓN      │
└─────────────────────────────────────────────────────────┘

┌──────────────────────── BLOQUE 1 ──────────────────────┐
│  KPI Strip (4 cards, ag-kpi-card)                      │
│  Referencias activas | Cobertura crítica               │
│  Listas para reponer | Recomendaciones producción       │
└────────────────────────────────────────────────────────┘

┌──────────────────────── BLOQUE 2 ──────────────────────┐
│  Panel: VENDEDORES (ag-op-table)                        │
│  Vendedor | Línea | Refs OK | Alertas | Cobertura avg   │
│  Presión Op. | Riesgo | → Drawer                       │
└────────────────────────────────────────────────────────┘

┌──────────────────────── BLOQUE 3 ──────────────────────┐
│  Panel: REFERENCIAS EN ALERTA (ag-op-table)            │
│  Ref | Descripción | Línea | Disponible | Cobertura    │
│  Velocidad | Estado | Acción → Drawer                  │
└────────────────────────────────────────────────────────┘

┌──────────────────────── BLOQUE 4 ──────────────────────┐
│  Panel: PRODUCCIÓN SUGERIDA (ag-op-table)              │
│  Ref | Descripción | Urgencia | Afecta | Qty sugerida  │
│  Cobertura restante | Lote | → Drawer                  │
└────────────────────────────────────────────────────────┘

┌──────────────────────── BLOQUE 5 ──────────────────────┐
│  Panel: STOCK MUERTO (colapsado por defecto)           │
│  Refs sin rotación con disponible alto                 │
│  Riesgo comercial | Sugerencia | → Acción             │
└────────────────────────────────────────────────────────┘

RIGHT RAIL: David
  → Señales de cobertura crítica
  → Vendedor en riesgo
  → Referencia caliente vs agotándose
  → Dependencia reposición
```

---

## Header: OperationalWorkspaceHeader

```tsx
<OperationalWorkspaceHeader
  title="Maletas Comerciales"
  subtitle={`LT · CS · ${activeSalesReps} vendedores · ${generatedAt}`}
  statusItems={[
    { label: "COBERTURA CRÍTICA", value: coverageCritical, variant: "critical" },
    { label: "LISTAS REPONER",    value: readyToReplenish, variant: "info" },
    { label: "PRODUCCIÓN",        value: productionRecommendations, variant: "warning" },
    { label: "PRESIÓN OP.",       value: `${operationalPressure}%`, variant: operationalPressure > 60 ? "critical" : "normal" },
  ]}
/>
```

---

## KPI Cards (4 — ag-kpi-card)

| Card | Value | Variant |
|---|---|---|
| Referencias activas | totalReferences | neutral |
| Cobertura crítica | coverageCritical | critical if > 0 |
| Listas para reponer | readyToReplenish | info |
| Recomendaciones producción | productionRecommendations | warning if > 0 |

Each card is clickable → opens drawer for that category.

---

## BLOQUE 2 — Vendedores table

```
ag-op-table
  ag-op-row per vendedor × línea
```

Columns:
| Col | Data | Render |
|---|---|---|
| Vendedor | salesRepName | T.mono |
| Línea | LT / CS | ag-op-status badge |
| Refs OK | refsOk / refsTotal | T.mono fraction |
| Alertas | alertCount | ag-op-status--critical if > 0 |
| Cobertura avg | coverageAvgDays | T.mono + "d" |
| Presión | presionOperacional | 0–100% bar |
| Riesgo | riesgoComercial | ag-op-status--{variant} |
| CTA | → | ag-action-ghost "Ver maleta" |

Row highlights:
- Riesgo `critico` → row background subtle red
- Presión > 60% → row background subtle amber

**Drawer: Case Drawer (per vendor × line)**
Opens with:
1. Header: vendedor + línea + estado
2. Mini KPI strip: OK / agotadas / bajo mínimo / en proceso
3. Table: all assigned refs with individual status + action
4. Lines fuertes / débiles
5. Dependencia producción bar
6. CTA: "Reponer ahora" / "Solicitar producción" / "Revisar"

---

## BLOQUE 3 — Referencias en alerta

Only shows refs with status ≠ ok, sorted by operationalScore desc.

Columns:
| Col | Data | Notes |
|---|---|---|
| Ref | reference | T.mono, monospace |
| Descripción | description | T.sans, truncated |
| Línea | LT/CS | badge |
| Disponible | currentUnits | T.mono |
| Cobertura | coverageDays + "d" or "—" | T.mono |
| Velocidad | dailyVelocity/day | T.mono, null = "sin datos" |
| Estado | CoverageStatus | ag-op-status--{variant} |
| Acción | recommendedAction | ag-action-primary/secondary |

Filters (top-right of section):
- Línea: LT / CS / Todas
- Estado: Ruptura / Bajo mínimo / En proceso / Todas
- Vendedor: multi-select

**Drawer: Item Drawer**
1. Ref + description + line badge
2. Disponible / inventario / pedidos (from snapshot)
3. Coverage gauge: days remaining + status
4. Velocity chart stub (when SAG data available): units 30d histogram
5. Assigned vendors: list with per-vendor status
6. Action section:
   - REPONER: "Disponible: X unidades" → CTA to replenishment flow (future)
   - PRODUCIR: "Faltante: X unidades sugeridas" → link to production module (future)
   - ESPERAR: "Lote [label] en proceso" → badge
7. Impact: which vendors are affected

---

## BLOQUE 4 — Producción sugerida

Only shows refs with recommendedAction = PRODUCIR, sorted by priority asc.

Columns:
| Col | Data | Notes |
|---|---|---|
| Ref | reference | T.mono |
| Descripción | description | T.sans |
| Urgencia | urgency | ag-op-status--{critica→critical, urgente→warning...} |
| Afecta | affectedSalesRepCount + " vendedores" | T.mono |
| Faltante | totalMissing | T.mono |
| Qty sugerida | suggestedQty | T.mono, bold |
| Cobertura rest. | coverageDaysRemaining + "d" | T.mono |
| Lote | batchLabel or "—" | T.mono, stale if no batch |
| CTA | → | "Ver detalle" |

Urgency → status variant mapping:
```
critica    → ag-op-status--critical
urgente    → ag-op-status--critical
alta       → ag-op-status--warning
importante → ag-op-status--warning
normal     → ag-op-status--info
```

---

## BLOQUE 5 — Stock muerto (collapsed)

```tsx
<WorkspaceSection
  title="Stock sin rotación"
  collapsible
  defaultCollapsed
  badge={deadStockSignals.length > 0 ? deadStockSignals.length : undefined}
>
```

Columns: Ref / Descripción / Disponible / Motivo / Riesgo / Sugerencia

---

## Drawer system

Uses `OperationalSideDrawer` pattern (existing `components/workspace/operational-side-drawer.tsx`).

DrawerCtx union type:
```typescript
type DrawerCtx =
  | { type: "case";     salesRepId: string; line: CommercialCaseLine }
  | { type: "item";     refCode: string }
  | { type: "production"; refCode: string }
  | { type: "summary";  category: "coverage" | "replenish" | "production" }
```

---

## Right rail — David agent

David receives `intelligence.copilotSignals` sorted by severity.

Signal rendering (in rail, NOT in canvas):
- `cobertura_critica` → red indicator, title + body
- `referencia_caliente` → amber indicator, velocity context
- `vendedor_en_riesgo` → amber, presión % + line
- `referencia_muerta` → blue info, disponible locked
- `produccion_insuficiente` → red, urgency + qty

David narrative (future AI generation from signals):
> "Nestor tiene 12 referencias bajo mínimo en LT. L-2407 con cobertura crítica de 2d — referencia caliente. Coordinar reposición antes de fin de semana."

---

## CSS / token rules

- T.mono for ALL operational values (refs, units, dates, percentages)
- T.sans ONLY for descriptions and narrative text
- ag-op-status--{variant} for all status badges
- ag-op-table + ag-op-row for all tables
- ag-kpi-card for KPI cards
- ag-action-primary for primary CTAs
- NO raw hex colors
- NO Tailwind color classes
- NO ag-copilot-zone or ag-ai-strip in canvas

Status variant mapping:
| Coverage status | CSS variant |
|---|---|
| sin_stock | ag-op-status--critical |
| ruptura_inminente | ag-op-status--critical |
| cobertura_baja | ag-op-status--warning |
| cobertura_estable | ag-op-status--info |
| cobertura_alta | ag-op-status--success |
| sin_rotacion | ag-op-status--stale |
| sin_datos_velocidad | ag-op-status--stale |

---

## Relationship to other modules

| Module | Relationship |
|---|---|
| Inventario/SAG | Source of `CommercialInventorySnapshot` availability data |
| Producción | `ProductionSignal` → creates production order (future integration) |
| Comercial/Clientes | Sales rep → customer activity correlation (future) |
| Copilot/David | Consumes `CopilotSignal[]` for narrative in right rail |
| Conciliación | Low priority — maletas is commercial, not financial |

---

## Operational states per section

| State | Canvas behavior |
|---|---|
| `loading` | OperationalWorkspaceHeader skeleton + table placeholders |
| `empty` | EmptyOperationalState: "No hay datos de maletas para esta organización" + CTA to configure |
| `ready` | Full render |
| `stale` | Status strip shows "DATOS DESACTUALIZADOS" badge, refresh CTA |
| `no_sag_data` | Intelligence layer shows "Sin datos SAG" → coverage/velocity sections hidden or show "sin datos" state |
| `degraded` | Partial data — show what's available, mark unknown sections clearly |

---

## Sprint after this document

**AGENTIK-MALETAS-UI-01**

Phases:
1. Server page + client scaffold (maletas-client.tsx)
2. OperationalWorkspaceHeader + KPI strip
3. Vendedores table + Case drawer
4. Referencias en alerta table + Item drawer
5. Producción sugerida table
6. Stock muerto section (collapsed)
7. Right rail David signals
8. Filters + line switcher (LT/CS)
9. TSC + visual review
