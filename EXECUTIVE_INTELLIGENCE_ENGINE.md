# Executive Intelligence Engine

**Sprint:** INFORMES-EJECUTIVOS-CASTILLITOS-03
**Date:** 2026-06-25
**Status:** COMPLETE

---

## Architecture

```
lib/intelligence/executive/
  executive-types.ts          — All types (ExecutiveDashboard model)
  executive-utils.ts          — Shared utilities (buildKpi, date helpers)
  executive-engine.ts         — Orchestrator (runExecutiveEngine)
  executive-dashboard.ts      — Public facade (getExecutiveDashboard)
  commercial-engine.ts        — Orders, fulfillment, top refs/clients/vendors
  inventory-engine.ts         — Agotados, stock critico, coverage
  production-engine.ts        — OP snapshot data (from PRODUCTION-SYNC-01A)
  executive-kpis.ts           — KPI computation engine
  executive-alerts.ts         — Alert generation engine
  executive-recommendations.ts — David recommendation engine
  executive-timeline.ts       — Timeline event engine
```

## Data Flow

```
getExecutiveDashboard(orgId)
  └─ runExecutiveEngine(orgId)
       ├─ Phase 1: Data Engines (parallel)
       │    ├─ runCommercialEngine(orgId)  → CommercialData
       │    ├─ runInventoryEngine(orgId)   → InventoryData
       │    └─ runProductionEngine(orgId)  → ProductionData
       │
       ├─ Phase 2: Intelligence Engines (parallel, no DB)
       │    ├─ computeKpis(commercial, inventory)        → ExecutiveKpis
       │    ├─ computeAlerts(commercial, inventory, prod) → ExecutiveAlert[]
       │    ├─ computeRecommendations(...)                → ExecutiveRecommendation[]
       │    └─ runTimelineEngine(orgId)                   → TimelineEvent[]
       │
       └─ Phase 3: Health computation
            └─ computeHealth(...)  → ExecutiveHealth
```

## Engine Responsibilities

| Engine | Domain | DB Access | Output |
|---|---|---|---|
| CommercialEngine | Orders, fulfillment, rankings | CRMQuote, CRMQuoteLine, ProductVariant, ProductInventoryLevel | CommercialData |
| InventoryEngine | Stock levels, agotados, coverage | ProductInventoryLevel, ProductEntity, ConnectorRun | InventoryData |
| ProductionEngine | OP snapshot data | ProductionOrder, ProductionOrderLine | ProductionData |
| KPIEngine | All KPI calculations | None (pure computation) | ExecutiveKpis |
| AlertEngine | Alert generation | None (pure computation) | ExecutiveAlert[] |
| RecommendationEngine | David recommendations | None (pure computation) | ExecutiveRecommendation[] |
| TimelineEngine | Recent activity events | CRMQuote, ProductionOrder | TimelineEvent[] |

## Contracts

### ExecutiveDashboard (main output)

Contains all data needed by the Dashboard UI:

- `summary` — Daily KPIs (pedidos, valor, clientes, referencias, vendedores)
- `commercial` — Full commercial data object
- `inventory` — Full inventory data object
- `production` — Production snapshot data
- `kpis` — Computed executive KPIs
- `alerts` — Ordered by priority
- `recommendations` — David's recommendations (ordered by priority)
- `timeline` — Recent activity events
- `health` — System health (commercial, inventory, production, overall)
- `lastSync` — Last SAG sync timestamp
- `generatedAt` — When this dashboard was generated
- Convenience accessors: `agotados`, `stockCritico`, `topReferencias`, `topClientes`, `topVendedores`, `fulfillment`

### Rules

1. **No Prisma in React components** — Dashboard only renders the model
2. **No business logic in React** — All calculations live in engines
3. **Engines are isolated** — Each engine knows only its domain
4. **KPI/Alert/Recommendation engines are pure** — No DB access, operate on engine outputs
5. **Data engines can fail gracefully** — Production engine catches errors and returns defaults

## Dependencies

```
Dashboard Page (server)
  └─ getExecutiveDashboard() — the ONLY import
       └─ executive-engine.ts
            ├─ commercial-engine.ts → prisma (CRMQuote, ProductVariant, etc.)
            ├─ inventory-engine.ts  → prisma (ProductInventoryLevel, etc.)
            ├─ production-engine.ts → prisma (ProductionOrder, etc.)
            ├─ executive-kpis.ts    → pure computation
            ├─ executive-alerts.ts  → pure computation
            ├─ executive-recommendations.ts → pure computation
            └─ executive-timeline.ts → prisma (CRMQuote, ProductionOrder)
```

## Preparation for Data Warehouse

The architecture is designed so that when a Data Warehouse (Snowflake, BigQuery, Fabric, Databricks, ClickHouse) is introduced:

1. **Only data engines change** — Replace Prisma queries with DW queries
2. **Intelligence engines (KPI, Alert, Recommendation) remain untouched** — They operate on typed interfaces, not DB results
3. **Dashboard UI remains untouched** — It consumes only ExecutiveDashboard
4. **No consumer code changes** — The `getExecutiveDashboard()` contract stays the same

To migrate to a DW:
- Create new implementations of `runCommercialEngine`, `runInventoryEngine`, `runProductionEngine` that query the DW
- Swap the imports in `executive-engine.ts`
- Everything else (KPIs, alerts, recommendations, timeline, UI) works unchanged

## Future Extensions

Engines prepared for future integration:

| Module | Engine | Status |
|---|---|---|
| Produccion completa | ProductionEngine | Ready (pending OP->ET linkage) |
| Compras | PurchasingEngine | Not yet created |
| Finanzas | FinanceEngine | Not yet created |
| Cobranza | CollectionEngine | Not yet created |
| Marketing | MarketingEngine | Not yet created |
| RRHH | WorkforceEngine | Not yet created |
| IA Empresarial | AIEngine | Not yet created |

Alert categories prepared:
- stock_critico, referencia_agotada, pedido_bloqueado (active)
- sync_error, cliente_bloqueado, produccion_detenida, cobranza_critica, sag_error (ready for wiring)

Timeline event types prepared:
- pedido_creado, nueva_op (active)
- pedido_sincronizado, pedido_entregado, inventario_agotado, inventario_recuperado, op_cerrada, entrada_pt, traslado_bodega, pago_recibido, cobranza_realizada, alerta_ia, actividad_usuario (ready for wiring)

## TSC Baseline

**160** — zero new errors introduced.
