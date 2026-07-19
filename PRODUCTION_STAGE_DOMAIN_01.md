# PRODUCTION-STAGE-DOMAIN-01 — Universal Production Stage Domain

**Sprint:** PRODUCTION-STAGE-DOMAIN-01
**Date:** 2026-06-29
**Type:** ARCHITECTURE + DOMAIN DESIGN — no implementation
**TSC Baseline:** 160 (no code modified)
**Prerequisite:** PRODUCTION-TIMELINE-HARDENING-01

---

## Executive Summary

This document defines Agentik's universal Production Stage Domain — a canonical vocabulary of manufacturing stages that is ERP-independent, tenant-configurable, and industry-extensible.

**Core principle:** Agentik defines the stages. ERPs map to them. Not the other way around.

Every production event from any source (SAG, Siigo, Alegra, Odoo, SAP, proprietary data warehouse, manual entry) normalizes into one of these canonical stages. The timeline, KPIs, bottleneck analysis, and control center all consume this single domain vocabulary.

---

## Phase 1 — Archaeological Evidence

### Evidence Sources Reviewed

| Document | Key Evidence |
|---|---|
| `PRODUCTION_EXECUTION_DISCOVERY_01.md` | 17 SAG fuentes, lifecycle map, adapter audit |
| `PRODUCTION_STAGE_MAPPING_01.md` | 5 configured stages, bodega topology, WIP dominance |
| `PRODUCTION_EVENT_MODEL_01.md` | Universal event types (17), source mapping contract |
| `PRODUCTION_EVENT_MODEL_REVIEW_01.md` | Model review, multi-ERP compatibility |
| `PRODUCTION_WORKFLOW_01.md` | 12-stage Castillitos workflow, branch/merge support |
| `PRODUCTION_TIMELINE_01.md` | 3,387 timelines, 97% COMPLETE, 44-day avg cycle |
| `PRODUCTION_TIMELINE_HARDENING_01.md` | Config-driven group keys, stage readiness |
| `CASTILLITOS_OPERATIONAL_DOMAIN_ALIGNMENT_01.md` | Production as standalone domain, bodega ownership |
| `lib/production-events/production-event-mapping.ts` | CASTILLITOS_SAG_MAPPINGS (17 entries with stage transitions) |
| `lib/production-intelligence/production-stage-inference.ts` | 5-stage inference engine with document-type indicators |
| `lib/business-flow/workflow-*.ts` | Configurable workflow engine with 20+ stage properties |

### Observed Stage Transitions (from real Castillitos data)

| Stage | Source | Evidence | Status |
|---|---|---|---|
| `orden_produccion` | OP (fuente 33) | 3,376 records | SYNCED |
| `consumo_insumos` | CN (fuente 80) | 7,890 records | SYNCED |
| `confeccion_externa` | PC/EC (fuentes 99/100) | 296 movements each in SAG | NOT SYNCED |
| `servicios` | T1/T2/Y1 (fuentes 129/118/119) | 18,197 movements in SAG | NOT SYNCED |
| `entrada_producto` | ET (fuente 116) | 3,640 records | SYNCED |

### Castillitos Real Production Flow (from PRODUCTION_WORKFLOW_01)

```
crear_articulo → activacion → orden_produccion → consumo_materia_prima
→ corte → [estampacion | bordado] → confeccion → terminacion
→ empaque → entrada_producto_terminado → traslado_bodega_principal
```

This 12-stage flow was validated against 3,376 OPs. It includes branches (corte → estampacion OR bordado) and merges (both → confeccion).

### Key Finding: Two Granularity Levels Exist

1. **SAG-observable stages** (5 stages): What SAG document types prove happened. These are coarse-grained, event-driven, and evidence-based.

2. **Business-process stages** (12 stages): What the factory floor actually does. These are fine-grained, activity-driven, and may not all have document evidence.

**Design decision:** The Stage Domain must support BOTH levels — coarse stages for ERP-driven evidence, fine stages for workflow execution. The relationship is hierarchical: one coarse stage may contain multiple fine stages.

---

## Phase 2 — Canonical Stage Catalog

### Design Principles

1. **ERP-agnostic naming.** No SAG codes (CN, ET), no Siigo codes, no Odoo codes in stage identifiers.
2. **English identifiers, Spanish display names.** Code lives in English; UI renders per-locale.
3. **Universal across industries.** A textiles manufacturer, a food processor, a metal fabricator should all find their process representable.
4. **Two-tier structure.** Major stages (coarse) compose of sub-stages (fine). ERP events map to major stages. Workflow execution tracks sub-stages.
5. **Every stage must be justified.** No speculative stages.

### Canonical Stage Definitions

| # | Code | Name (es) | Justification |
|---|---|---|---|
| 1 | `production_order` | Orden de Producción | Universal. Every manufacturing system starts with an order/work order/MO. SAG: OP (f33). Siigo: Orden de Producción. Odoo: Manufacturing Order. SAP: Production Order. |
| 2 | `material_allocation` | Asignación de Materiales | Reservation of raw materials before physical consumption. SAG: no explicit document (implicit in OP). Odoo: Check Availability. SAP: Material Staging. Some ERPs skip this. |
| 3 | `material_consumption` | Consumo de Materiales | Physical withdrawal of raw materials. Universal. SAG: CN (f80). Siigo: Consumo de MP. Odoo: Consume Components. SAP: Goods Issue. |
| 4 | `cutting` | Corte | First transformation. Textiles: fabric cutting. Metal: sheet cutting. Food: portioning. SAG: no dedicated fuente (implicit in CN or internal process). Castillitos: confirmed stage in workflow. |
| 5 | `printing` | Estampación / Impresión | Surface decoration. Textiles: screen printing, sublimation. Packaging: label printing. Optional — not all products require it. Castillitos: confirmed optional branch. |
| 6 | `embroidery` | Bordado | Textile-specific decoration. Optional. Castillitos: confirmed optional branch (alternative to printing). May not exist in non-textile industries. |
| 7 | `external_manufacturing` | Manufactura Externa | Subcontracted manufacturing. Universal concept. SAG: PC/EC (f99/f100). Siigo: Orden de Servicio. Odoo: Subcontracting. SAP: External Processing. Castillitos: 296 movements. |
| 8 | `assembly` | Confección / Ensamble | Primary assembly/construction. Textiles: sewing. Electronics: assembly. Food: mixing. Universal. Castillitos: "confeccion" — the main value-add stage. |
| 9 | `third_party_services` | Servicios de Terceros | External value-add services (not full manufacturing). SAG: T1/T2/Y1 (f129/f118/f119). 18,197 movements in SAG. Covers: finishing, embellishment, specialized treatments. |
| 10 | `finishing` | Terminación / Acabado | Final processing before packaging. Universal. Textiles: pressing, trimming, labeling. Metal: polishing. Food: glazing. Castillitos: confirmed stage. |
| 11 | `quality_control` | Control de Calidad | Inspection before packaging. Universal. May be a gate (blocking) or inline (informational). Some tenants skip it; others require it at multiple points. |
| 12 | `packaging` | Empaque | Preparing product for storage/shipment. Universal. Castillitos: confirmed stage. |
| 13 | `finished_goods_entry` | Ingreso Producto Terminado | Product enters finished goods inventory. SAG: ET (f116). Siigo: Entrada de Producción. Odoo: Produce. SAP: Goods Receipt. 3,640 records. |
| 14 | `warehouse_transfer` | Traslado a Bodega | Transfer to commercial/distribution warehouse. SAG: TR (f34), MV (f115). Marks product as commercially available. |
| 15 | `commercially_available` | Disponible Comercial | Product is available for sale. Terminal stage. May be automatic after warehouse transfer or require explicit release. |

### Stages NOT Included (with justification)

| Candidate | Why excluded |
|---|---|
| `crear_articulo` | Pre-production (product master data), not a manufacturing stage. Lives in Product Management domain. |
| `activacion` | Pre-production (product activation), not a manufacturing stage. Lives in Product Management domain. |
| `internal_transfer` | Not a stage — it's a logistics event that can happen between any two stages. Modeled as a transition, not a stage. |
| `rework` | Not a stage — it's a loop back to a previous stage. Modeled via re-entry transitions. |
| `scrap` | Not a stage — it's an outcome/event that can happen at any stage. Modeled as a stage exit event. |

---

## Phase 3 — Stage Taxonomy

### Category Definitions

| Category | Code | Description | Characteristic |
|---|---|---|---|
| **Planning** | `PLANNING` | Order and material preparation | Precedes physical transformation |
| **Transformation** | `TRANSFORMATION` | Physical product modification | Creates value, consumes resources |
| **External** | `EXTERNAL` | Work performed outside the facility | Involves third parties, logistics |
| **Control** | `CONTROL` | Inspection and quality gates | May block progression |
| **Logistics** | `LOGISTICS` | Physical movement of goods | Does not transform product |
| **Commercial** | `COMMERCIAL` | Product availability for sale | Terminal, revenue-enabling |

### Stage Classification

| Stage | Category | Transforms Product | Affects Inventory | Affects Cost | Is Terminal |
|---|---|---|---|---|---|
| `production_order` | PLANNING | No | No (creates commitment) | No | No |
| `material_allocation` | PLANNING | No | Yes (reserves) | No | No |
| `material_consumption` | TRANSFORMATION | No (withdraws only) | Yes (decreases raw) | Yes | No |
| `cutting` | TRANSFORMATION | Yes | No (internal WIP) | Yes | No |
| `printing` | TRANSFORMATION | Yes | No (internal WIP) | Yes | No |
| `embroidery` | TRANSFORMATION | Yes | No (internal WIP) | Yes | No |
| `external_manufacturing` | EXTERNAL | Yes | Yes (leaves/enters facility) | Yes | No |
| `assembly` | TRANSFORMATION | Yes | No (internal WIP) | Yes | No |
| `third_party_services` | EXTERNAL | Yes | No (internal WIP typically) | Yes | No |
| `finishing` | TRANSFORMATION | Yes | No (internal WIP) | Yes | No |
| `quality_control` | CONTROL | No | No | No (unless rejects) | No |
| `packaging` | TRANSFORMATION | Yes (final form) | No (internal WIP) | Yes | No |
| `finished_goods_entry` | LOGISTICS | No | Yes (WIP → finished) | No | No |
| `warehouse_transfer` | LOGISTICS | No | Yes (moves between locations) | No | No |
| `commercially_available` | COMMERCIAL | No | No (status change only) | No | Yes |

---

## Phase 4 — ProductionStageDefinition

```typescript
interface ProductionStageDefinition {
  /** Unique identifier. Snake_case, English. */
  id: string;

  /** Machine-readable code. Same as id for now. */
  code: string;

  /** Display name (default locale). */
  name: string;

  /** Detailed description. */
  description: string;

  /** Stage category. */
  category: "PLANNING" | "TRANSFORMATION" | "EXTERNAL" | "CONTROL" | "LOGISTICS" | "COMMERCIAL";

  /** Display order in the standard flow (1-based). */
  displayOrder: number;

  /** Is this stage required in every production profile? */
  isRequired: boolean;

  /** Is this a terminal stage (no outbound transitions)? */
  isTerminal: boolean;

  /** Can a production order re-enter this stage after leaving? */
  allowsReentry: boolean;

  /** Can this stage be skipped in the production flow? */
  allowsSkip: boolean;

  /** Does this stage transform the product physically? */
  transformsProduct: boolean;

  /** Does this stage affect inventory levels? */
  affectsInventory: boolean;

  /** Does this stage generate cost? */
  generatesCost: boolean;

  /** Does this stage require external parties? */
  requiresExternalParty: boolean;

  /** Is this stage a quality gate (can block progression)? */
  isQualityGate: boolean;
}
```

### Full Catalog Instance

| id | category | order | required | terminal | reentry | skip | transforms | inventory | cost | external | gate |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `production_order` | PLANNING | 1 | Yes | No | No | No | No | No | No | No | No |
| `material_allocation` | PLANNING | 2 | No | No | No | Yes | No | Yes | No | No | No |
| `material_consumption` | TRANSFORMATION | 3 | Yes | No | No | No | No | Yes | Yes | No | No |
| `cutting` | TRANSFORMATION | 4 | No | No | No | Yes | Yes | No | Yes | No | No |
| `printing` | TRANSFORMATION | 5 | No | No | No | Yes | Yes | No | Yes | No | No |
| `embroidery` | TRANSFORMATION | 6 | No | No | No | Yes | Yes | No | Yes | No | No |
| `external_manufacturing` | EXTERNAL | 7 | No | No | Yes | Yes | Yes | Yes | Yes | Yes | No |
| `assembly` | TRANSFORMATION | 8 | No | No | No | Yes | Yes | No | Yes | No | No |
| `third_party_services` | EXTERNAL | 9 | No | No | Yes | Yes | Yes | No | Yes | Yes | No |
| `finishing` | TRANSFORMATION | 10 | No | No | No | Yes | Yes | No | Yes | No | No |
| `quality_control` | CONTROL | 11 | No | No | Yes | Yes | No | No | No | No | Yes |
| `packaging` | TRANSFORMATION | 12 | No | No | No | Yes | Yes | No | Yes | No | No |
| `finished_goods_entry` | LOGISTICS | 13 | Yes | No | No | No | No | Yes | No | No | No |
| `warehouse_transfer` | LOGISTICS | 14 | No | No | No | Yes | No | Yes | No | No | No |
| `commercially_available` | COMMERCIAL | 15 | No | Yes | No | No | No | No | No | No | No |

---

## Phase 5 — Stage Transitions

### Standard Flow (Linear)

```
production_order
  → material_allocation (optional)
  → material_consumption
  → cutting
  → [printing | embroidery] (optional branches)
  → assembly
  → finishing
  → quality_control (optional gate)
  → packaging
  → finished_goods_entry
  → warehouse_transfer (optional)
  → commercially_available
```

### Transition Rules

| From | To | Type | Condition |
|---|---|---|---|
| `production_order` | `material_allocation` | optional | If ERP supports reservation |
| `production_order` | `material_consumption` | standard | Direct if no allocation stage |
| `material_allocation` | `material_consumption` | standard | Materials confirmed |
| `material_consumption` | `cutting` | standard | Materials withdrawn |
| `material_consumption` | `external_manufacturing` | alternative | If cutting is outsourced |
| `cutting` | `printing` | branch | If product requires printing |
| `cutting` | `embroidery` | branch | If product requires embroidery |
| `cutting` | `assembly` | skip | If no decoration needed |
| `printing` | `assembly` | merge | After decoration |
| `embroidery` | `assembly` | merge | After decoration |
| `assembly` | `third_party_services` | optional | If specialized services needed |
| `assembly` | `finishing` | standard | Direct to finishing |
| `third_party_services` | `finishing` | standard | After services |
| `external_manufacturing` | `third_party_services` | optional | If services after external mfg |
| `external_manufacturing` | `finishing` | standard | Direct to finishing |
| `finishing` | `quality_control` | optional | If QC is configured |
| `finishing` | `packaging` | skip | If no QC |
| `quality_control` | `packaging` | pass | QC passed |
| `quality_control` | `finishing` | reentry | QC failed, rework |
| `quality_control` | `cutting` | reentry | QC failed, major rework |
| `packaging` | `finished_goods_entry` | standard | Product packaged |
| `finished_goods_entry` | `warehouse_transfer` | optional | If separate transfer step |
| `finished_goods_entry` | `commercially_available` | direct | If no transfer needed |
| `warehouse_transfer` | `commercially_available` | standard | Product in commercial location |

### Alternative Flows

**Full External Manufacturing:**
```
production_order → material_consumption → external_manufacturing
→ third_party_services → finishing → packaging → finished_goods_entry
```

**Simple Internal Manufacturing (no decoration):**
```
production_order → material_consumption → cutting → assembly
→ finishing → packaging → finished_goods_entry
```

**Import/Reception Only:**
```
production_order → finished_goods_entry → warehouse_transfer → commercially_available
```

**Maquila (contract manufacturing):**
```
production_order → material_consumption → external_manufacturing
→ finished_goods_entry
```

---

## Phase 6 — Production Stage Profiles

### Profile Design

```typescript
interface ProductionStageProfile {
  /** Unique profile identifier. */
  id: string;

  /** Human-readable name. */
  name: string;

  /** Description of the manufacturing pattern. */
  description: string;

  /** Which stages are active in this profile. */
  activeStages: string[];

  /** Which stages are required (cannot be skipped). */
  requiredStages: string[];

  /** Which stages are optional (can be skipped). */
  optionalStages: string[];

  /** Valid transitions for this profile. */
  transitions: Array<{ from: string; to: string }>;

  /** Industries this profile applies to. */
  industries: string[];
}
```

### Predefined Profiles

#### 1. Textil Completo (`textile_full`)

**For:** Castillitos, manufacturers with internal production + external subcontracting + decoration

```
Active: production_order, material_consumption, cutting, printing,
        embroidery, external_manufacturing, assembly, third_party_services,
        finishing, quality_control, packaging, finished_goods_entry,
        warehouse_transfer, commercially_available

Required: production_order, material_consumption, assembly,
          finished_goods_entry

Optional: cutting, printing, embroidery, external_manufacturing,
          third_party_services, finishing, quality_control, packaging,
          warehouse_transfer, commercially_available
```

#### 2. Textil Básico (`textile_basic`)

**For:** Small manufacturers with internal production only, no subcontracting

```
Active: production_order, material_consumption, cutting, assembly,
        finishing, packaging, finished_goods_entry

Required: production_order, material_consumption, cutting, assembly,
          finished_goods_entry

Optional: finishing, packaging
```

#### 3. Manufactura Externa (`external_manufacturing`)

**For:** Companies that outsource all manufacturing (maquila)

```
Active: production_order, material_consumption, external_manufacturing,
        quality_control, finished_goods_entry, warehouse_transfer

Required: production_order, external_manufacturing, finished_goods_entry

Optional: material_consumption, quality_control, warehouse_transfer
```

#### 4. Importación (`import_reception`)

**For:** Companies that import finished goods (no manufacturing)

```
Active: production_order, quality_control, finished_goods_entry,
        warehouse_transfer, commercially_available

Required: production_order, finished_goods_entry

Optional: quality_control, warehouse_transfer, commercially_available
```

#### 5. Maquila (`contract_manufacturing`)

**For:** Contract manufacturers who receive materials and return finished goods

```
Active: production_order, material_consumption, cutting, assembly,
        finishing, packaging, finished_goods_entry

Required: production_order, material_consumption, assembly,
          finished_goods_entry

Optional: cutting, finishing, packaging
```

#### 6. Personalizado (`custom`)

**For:** Tenants who define their own stage flow

```
Active: [configured by tenant]
Required: production_order, finished_goods_entry (minimum)
Optional: [all others]
```

---

## Phase 7 — ERP → Stage Domain Mapping

### Architecture

```
┌──────────────────┐
│   ERP Document    │  SAG CN / Siigo Consumo / Odoo Consume / SAP GI
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Event Mapper    │  ProductionEventSourceMapping (already exists)
│  (per ERP)       │  Maps source doc type → ProductionEventType
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ ProductionEvent  │  Universal event (already exists)
│ + stageFrom/To   │  Carries stage transitions
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Stage Domain    │  ProductionStageDefinition catalog (THIS SPRINT)
│  (canonical)     │  ERP-agnostic stage vocabulary
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Timeline        │  ProductionTimeline (already exists)
│  + Stage KPIs    │  Chronological projection with per-stage metrics
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Control Center  │  Production module UI (future)
│  + Bottlenecks   │  Dashboard, alerts, capacity
└──────────────────┘
```

### ERP-Specific Mapping Tables

#### SAG PYA (Castillitos)

| SAG Fuente | SAG Code | ProductionEventType | Stage From | Stage To |
|---|---|---|---|---|
| 33 | OP | PRODUCTION_ORDER_CREATED | — | `production_order` |
| 80 | CN | MATERIAL_CONSUMED | `production_order` | `material_consumption` |
| 99 | PC | EXTERNAL_SERVICE_STARTED | `material_consumption` | `external_manufacturing` |
| 100 | EC | EXTERNAL_SERVICE_COMPLETED | `external_manufacturing` | `third_party_services` |
| 129 | T1 | PRODUCTION_MOVED_STAGE | `external_manufacturing` | `third_party_services` |
| 118 | T2 | PRODUCTION_MOVED_STAGE | `external_manufacturing` | `third_party_services` |
| 119 | Y1 | PRODUCTION_MOVED_STAGE | `external_manufacturing` | `third_party_services` |
| 116 | ET | PRODUCTION_COMPLETED | `third_party_services` | `finished_goods_entry` |
| 115 | MV | PRODUCTION_TRANSFERRED | — | — (internal transfer, no stage change) |
| 34 | TR | PRODUCTION_TRANSFERRED | `finished_goods_entry` | `warehouse_transfer` |

**Note:** SAG does not have explicit documents for `cutting`, `printing`, `embroidery`, `assembly`, `finishing`, `quality_control`, or `packaging`. These are internal factory activities between CN and ET that SAG does not track. They exist in the Castillitos workflow but are invisible to the ERP. Future visibility requires either: (a) manual stage tracking in Agentik, or (b) IoT/barcode integration.

#### Siigo (conceptual)

| Siigo Document | ProductionEventType | Stage From | Stage To |
|---|---|---|---|
| Orden de Producción | PRODUCTION_ORDER_CREATED | — | `production_order` |
| Consumo de MP | MATERIAL_CONSUMED | `production_order` | `material_consumption` |
| Entrada de Producción | PRODUCTION_COMPLETED | — | `finished_goods_entry` |

#### Odoo (conceptual)

| Odoo Operation | ProductionEventType | Stage From | Stage To |
|---|---|---|---|
| Manufacturing Order (confirmed) | PRODUCTION_ORDER_CREATED | — | `production_order` |
| Check Availability | MATERIAL_RESERVED | `production_order` | `material_allocation` |
| Consume Components | MATERIAL_CONSUMED | `material_allocation` | `material_consumption` |
| Work Order (per operation) | PRODUCTION_MOVED_STAGE | varies | varies |
| Produce | PRODUCTION_COMPLETED | — | `finished_goods_entry` |

#### SAP (conceptual)

| SAP Transaction | ProductionEventType | Stage From | Stage To |
|---|---|---|---|
| CO01 (Create Production Order) | PRODUCTION_ORDER_CREATED | — | `production_order` |
| MIGO (Goods Issue) | MATERIAL_CONSUMED | `production_order` | `material_consumption` |
| CO11N (Confirm Operation) | PRODUCTION_MOVED_STAGE | varies | varies |
| MIGO (Goods Receipt) | PRODUCTION_COMPLETED | — | `finished_goods_entry` |

#### Data Warehouse Propio (conceptual)

| Source Table/View | ProductionEventType | Stage From | Stage To |
|---|---|---|---|
| `fact_production_orders` | PRODUCTION_ORDER_CREATED | — | `production_order` |
| `fact_material_issues` | MATERIAL_CONSUMED | `production_order` | `material_consumption` |
| `fact_production_output` | PRODUCTION_COMPLETED | — | `finished_goods_entry` |
| `fact_stage_transitions` | PRODUCTION_MOVED_STAGE | varies | varies |

**Key insight:** Simpler ERPs (Siigo, Alegra) have only 3 stages visible: order → consumption → entry. The Stage Domain must work with as few as 3 observable stages. The intervening stages (cutting, assembly, etc.) are enrichment that comes from workflow execution, manual tracking, or IoT — not from the ERP.

---

## Phase 8 — Stage-Level Indicators

### Per-Stage Metrics

```typescript
interface StageMetrics {
  /** Stage identifier. */
  stageCode: string;

  /** Number of production orders currently in this stage. */
  wipCount: number;

  /** Total units currently in this stage. */
  wipUnits: number;

  /** Average time spent in this stage (days). */
  avgDurationDays: number | null;

  /** Median time spent in this stage (days). */
  medianDurationDays: number | null;

  /** Minimum time observed (days). */
  minDurationDays: number | null;

  /** Maximum time observed (days). */
  maxDurationDays: number | null;

  /** Number of orders that exceeded the SLA for this stage. */
  delayCount: number;

  /** Delay rate (delayCount / total orders through this stage). */
  delayRate: number;

  /** Cumulative material cost up to and including this stage. */
  cumulativeCost: number;

  /** Incremental cost added by this stage specifically. */
  incrementalCost: number;

  /** Total units that have entered this stage (historical). */
  totalUnitsEntered: number;

  /** Total units that have exited this stage (historical). */
  totalUnitsExited: number;

  /** Throughput: units exited per day (rolling average). */
  throughputPerDay: number | null;

  /** Stage utilization: proportion of time with WIP > 0. */
  utilizationRate: number | null;
}
```

### Aggregate Metrics

```typescript
interface ProductionStageSnapshot {
  /** Organization ID. */
  organizationId: string;

  /** When this snapshot was computed. */
  computedAt: string;

  /** Profile used for this snapshot. */
  profileId: string;

  /** Per-stage metrics. */
  stages: StageMetrics[];

  /** Total WIP across all stages. */
  totalWip: number;

  /** Total WIP units across all stages. */
  totalWipUnits: number;

  /** Total cumulative cost. */
  totalCost: number;

  /** Average full-cycle duration (days). */
  avgCycleDays: number | null;

  /** Bottleneck stage (longest average duration). */
  bottleneckStage: string | null;

  /** Accumulation stage (highest WIP count). */
  accumulationStage: string | null;

  /** Delay stage (highest delay rate). */
  delayStage: string | null;
}
```

---

## Phase 9 — Bottleneck Model

### Bottleneck Detection

A bottleneck is identified by comparing three independent signals:

| Signal | Metric | Detection Rule |
|---|---|---|
| **Duration bottleneck** | `avgDurationDays` | Stage with highest average duration relative to its neighbors |
| **Accumulation bottleneck** | `wipCount` | Stage with highest WIP count (orders piling up) |
| **Delay bottleneck** | `delayRate` | Stage with highest proportion of SLA breaches |

### Bottleneck Classification

```typescript
interface BottleneckAnalysis {
  /** Stage identified as bottleneck. */
  stageCode: string;

  /** Bottleneck type. */
  type: "duration" | "accumulation" | "delay" | "compound";

  /** Severity (0-100). */
  severity: number;

  /** Evidence supporting the classification. */
  evidence: string[];

  /** Impact on overall cycle time (estimated days added). */
  cycleDaysImpact: number | null;

  /** Impact on cost (estimated additional cost). */
  costImpact: number | null;

  /** Suggested actions (informational only). */
  suggestions: string[];
}
```

### Compound Bottlenecks

When a stage ranks highest in 2 or more signals, it's a **compound bottleneck** — the most severe type. Severity formula:

```
severity = min(100, (rank_duration + rank_accumulation + rank_delay) * 15)
```

Where rank is the position (1 = worst) among all stages for that signal.

### Bottleneck Evolution

Track bottleneck changes over time to detect whether interventions are working:

```typescript
interface BottleneckTrend {
  stageCode: string;
  periods: Array<{
    periodStart: string;
    periodEnd: string;
    avgDuration: number | null;
    wipCount: number;
    delayRate: number;
    severity: number;
  }>;
  trend: "improving" | "stable" | "worsening";
}
```

---

## Phase 10 — Production Control Center v2

### Module Identity

| Attribute | Value |
|---|---|
| **Module name** | Producción |
| **Level** | First-level module (NOT a sub-module of Comercial) |
| **Route** | `/[orgSlug]/produccion` |
| **Domain owner** | Gerencia de Producción |
| **Nav position** | After Comercial, before Finanzas |
| **Agent** | Pablo (operations + production intelligence) |

### Screen Architecture

#### 1. Dashboard (`/produccion`)

```
┌─────────────────────────────────────────────────────────────┐
│  OperationalWorkspaceHeader: "Producción"                   │
│  Subtitle: "Ciclo productivo • Control • Costos"            │
├─────────────────────────────────────────────────────────────┤
│  Signal Strip                                               │
│  [OPs activas: 3,352] [WIP: 1.3M uds] [Ciclo: 44d avg]   │
│  [Costo acum: $334M] [Bottleneck: confeccion_externa]      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Stage Pipeline (visual)                                    │
│  ┌────┐  ┌────┐  ┌────┐  ┌────┐  ┌────┐  ┌────┐          │
│  │ OP │→│ CN │→│Ext │→│Svc │→│ ET │→│ B01│          │
│  │3352│  │7890│  │ 296│  │18K │  │3640│  │ 469│          │
│  └────┘  └────┘  └────┘  └────┘  └────┘  └────┘          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Tabs:                                                      │
│  [Órdenes] [Timeline] [Etapas] [Costos] [Bottlenecks]     │
│  [Capacidad] [Alertas]                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 2. Órdenes Tab (`/produccion/ordenes`)

- Table of production orders with current stage, days in process, cost
- Filters: stage, status, reference, date range
- Detail drawer: full timeline for selected OP

#### 3. Timeline Tab (`/produccion/timeline`)

- Chronological view of production events
- Filter by OP, reference, date range
- Quality classification (COMPLETE / PARTIAL / INCOMPLETE)
- Duration metrics

#### 4. Etapas Tab (`/produccion/etapas`)

- Per-stage cards with WIP, avg duration, throughput, delay rate
- Visual pipeline with flow indicators
- Stage drill-down: which OPs are in this stage

#### 5. Costos Tab (`/produccion/costos`)

- Material cost breakdown by stage
- Cumulative vs incremental cost visualization
- Top 10 most expensive OPs
- Cost per unit analysis

#### 6. Bottlenecks Tab (`/produccion/cuellos-de-botella`)

- Bottleneck analysis cards (duration, accumulation, delay)
- Compound bottleneck alerts
- Historical trend (improving / stable / worsening)

#### 7. Capacidad Tab (`/produccion/capacidad`)

- Stage throughput vs demand
- Utilization rates
- Capacity planning (future, when forecasting data available)

#### 8. Alertas Tab (`/produccion/alertas`)

- SLA breaches by stage
- Anomaly detection (unusual duration, unexpected stage skip)
- Stalled orders (no stage progression > N days)

---

## Phase 11 — Readiness Assessment

### Multi-ERP Compatibility

| ERP | Observable Stages | Profile | Ready |
|---|---|---|---|
| SAG PYA | 5 (OP, CN, PC/EC, T1/T2/Y1, ET) | `textile_full` | YES — after sync of PC/EC/T1/T2/Y1 |
| Siigo | 3 (Order, Consumption, Entry) | `textile_basic` | YES — minimal 3-stage flow |
| Alegra | 2 (Order, Entry) | `import_reception` | YES — 2-stage flow |
| Odoo | 5+ (MO, Availability, Consume, Work Orders, Produce) | `textile_full` | YES — rich stage data |
| SAP | 5+ (CO01, MIGO-GI, CO11N, MIGO-GR) | `textile_full` | YES — rich stage data |
| Data Warehouse | Varies | `custom` | YES — configurable |

### Multi-Tenant Compatibility

The Stage Domain supports multi-tenant by design:

1. **Profile per tenant.** Each organization selects or customizes a production profile.
2. **Stage config per tenant.** `ProductionTimelineStageConfig` (from HARDENING-01) drives readiness.
3. **Source config per tenant.** `ProductionTimelineSourceConfig` (from HARDENING-01) drives OP synthesis.
4. **No shared state.** All queries are scoped by `organizationId`.

### Data Warehouse Compatibility

The Stage Domain is compatible with a proprietary data warehouse:

1. **Stage definitions** are pure domain types — no ERP dependency.
2. **Stage metrics** are computed from `ProductionEvent[]` — any source that produces events works.
3. **Bottleneck analysis** is a derived projection — no stored state required.
4. A DWH adapter would map `fact_stage_transitions` → `ProductionEvent` with `stageFrom`/`stageTo`.

---

## Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | SAG doesn't track 10 of 15 stages (cutting through packaging are invisible) | Accept coarse granularity from ERP. Fine stages require workflow execution or manual tracking. |
| R2 | Stage naming may not match tenant's internal terminology | Display names are tenant-configurable. Canonical codes are fixed. |
| R3 | Profile transitions may be too rigid for complex manufacturing | Allow `custom` profile with arbitrary transitions. |
| R4 | Bottleneck detection requires sufficient data volume | Minimum threshold: 50 orders through a stage before computing metrics. |
| R5 | Multi-ERP tenants (same org, multiple ERPs) may produce duplicate events | Idempotency via existing `@@unique([organizationId, sourceSystem, sourceDocumentType, sourceDocumentId])`. |
| R6 | Quality control as a gate requires approval workflow | QC gate behavior is FUTURE — current design is observational only. |

---

## Roadmap

### PRODUCTION-STAGE-ACTIVATION-01 (next)
- Implement `ProductionStageDefinition` types in `lib/production-stages/`
- Implement `ProductionStageProfile` with preset profiles
- Implement stage-level metrics computation from `ProductionTimeline`
- Wire existing `stageFrom`/`stageTo` from `CASTILLITOS_SAG_MAPPINGS` to canonical codes
- Update `ProductionTimelineStageConfig` to reference canonical catalog

### PRODUCTION-STAGE-SYNC-01
- Sync PC/EC (fuentes 99/100) to `ProductionEvent`
- Sync T1/T2/Y1 (fuentes 129/118/119) to `ProductionEvent`
- Validate stage transitions with real data

### PRODUCTION-STAGE-METRICS-01
- Implement `StageMetrics` computation
- Implement bottleneck detection
- Implement bottleneck trend tracking

### PRODUCTION-CONTROL-CENTER-01
- Create `/produccion` module as first-level route
- Implement dashboard with stage pipeline visualization
- Implement per-stage drill-down

### PRODUCTION-WORKFLOW-INTEGRATION-01
- Connect `lib/business-flow/` workflow engine to stage domain
- Enable manual stage tracking for ERP-invisible stages
- SLA monitoring per stage

---

## Verification

- [x] No SAG dependency in canonical stage definitions
- [x] No Castillitos dependency in stage catalog
- [x] Compatible with Data Warehouse (events → stages → metrics)
- [x] Compatible with future ERPs (Siigo, Odoo, SAP, Alegra)
- [x] Compatible with multi-tenant (profile per org, config per org)
- [x] Two-tier design supports both ERP-coarse and workflow-fine granularity
- [x] Existing `ProductionEvent.stageFrom`/`stageTo` fields align with canonical codes
- [x] No code modified — TSC baseline: 160
- [x] No stages activated — domain design only
