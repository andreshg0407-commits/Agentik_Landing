# PRODUCTION-WORKFLOW-01

## Configurable Business Flow Engine

**Estado:** Completo
**Fecha:** 2026-06-25
**TSC Baseline:** 160 (sin regresion)

---

## 1. Vision

Agentik NO impone procesos. Agentik modela procesos.

Cada tenant puede construir sus propios flujos sin modificar codigo.
El motor es reutilizable por Produccion, Compras, Comercial, Cobranza,
RRHH, Calidad, Despachos y cualquier flujo empresarial futuro.

---

## 2. Arquitectura

```
lib/business-flow/
  workflow-types.ts        — Dominios, estados, prioridades, entity binding
  workflow-stage.ts        — Etapas configurables (20+ propiedades)
  workflow-transition.ts   — Transiciones con condiciones, reglas, grafos
  workflow-definition.ts   — Definicion completa + validador estructural
  workflow-instance.ts     — Instancia de ejecucion + creador
  workflow-state.ts        — Stage/workflow progress + computation
  workflow-history.ts      — Audit trail completo (22 event types)
  workflow-metrics.ts      — Metricas de rendimiento
  workflow-template.ts     — Plantillas pre-configuradas
  workflow-engine.ts       — Contrato del motor (IWorkflowEngine)
  workflow-utils.ts        — Helpers: SLA, navegacion, estimacion
  index.ts                 — Barrel export (client-safe)
```

---

## 3. Contratos

### 3.1 WorkflowDefinition

```typescript
interface WorkflowDefinition {
  id, organizationId, domain, code, name, description,
  entityType, enabled, version,
  stages: WorkflowStageDefinition[],
  initialStageCode, terminalStageCodes,
  transitions: WorkflowTransition[],
  createdAt, updatedAt, metadata
}
```

Incluye validador: `validateWorkflowDefinition()` verifica estructura del grafo.

### 3.2 WorkflowStageDefinition

20+ propiedades configurables por etapa:

| Categoria | Propiedades |
|---|---|
| Identidad | id, code, name, description, order |
| Visual | icon, color |
| Timing | estimatedDurationHours, slaHours |
| Permisos | requiredRoles[] |
| Comportamiento | allowSkip, allowSplit, allowMerge, requiresApproval |
| Side Effects | generatesInventory, generatesCost, generatesEvents, generatesAlerts, generatesTimeline |

### 3.3 WorkflowTransition

Soporta grafos dirigidos (no solo lineal):

```typescript
interface WorkflowTransition {
  sourceStageCode, targetStageCode,
  mode: "manual" | "automatic" | "scheduled" | "approval",
  conditions[], rules[], permissions[],
  label, priority, isDefault, metadata
}
```

Helpers: `transitionsFrom()`, `transitionsTo()`, `isBranchPoint()`, `isMergePoint()`.

### 3.4 WorkflowInstance

```typescript
interface WorkflowInstance {
  id, workflowDefinitionId, workflowCode, organizationId,
  entityBinding: WorkflowEntityBinding,
  status, priority, currentStageCode,
  stageProgress: Record<string, StageProgress>,
  progress: WorkflowProgress,
  history: WorkflowHistoryEntry[],
  metrics: WorkflowInstanceMetrics,
  createdAt, startedAt, expectedFinishAt, completedAt,
  assignedTo, createdBy, metadata
}
```

### 3.5 WorkflowHistoryEntry

22 event types:

| Categoria | Eventos |
|---|---|
| Stage lifecycle | stage_entered, stage_completed, stage_skipped, stage_failed |
| Approvals | approval_requested, approval_granted, approval_rejected |
| Workflow lifecycle | workflow_started, completed, cancelled, paused, resumed, failed, blocked, unblocked |
| Operations | assignment_changed, comment_added, attachment_added, priority_changed, sla_breached, sla_warning |
| Splits/Merges | split_created, merge_completed |

### 3.6 WorkflowInstanceMetrics

Metricas comunes reutilizables por cualquier dominio:

| Metrica | Tipo |
|---|---|
| totalDurationMinutes | number |
| activeDurationMinutes | number |
| pausedDurationMinutes | number |
| blockedDurationMinutes | number |
| stagesCompleted | number |
| stagesSkipped | number |
| approvalCount | number |
| rejectionCount | number |
| blockCount | number |
| retryCount | number |
| slaBreachCount | number |
| averageStageMinutes | number or null |
| longestStageCode | string or null |
| longestStageMinutes | number or null |

### 3.7 IWorkflowEngine

```typescript
interface IWorkflowEngine {
  // Definitions
  getDefinition, getDefinitionById, listDefinitions, saveDefinition, validateDefinition
  // Lifecycle
  startWorkflow, advanceWorkflow, pauseWorkflow, resumeWorkflow, blockWorkflow, cancelWorkflow
  // Querying
  getInstance, listInstancesForEntity, listInstancesByStatus
  // Metrics
  getAggregateMetrics
}
```

---

## 4. Compatibilidad con Business Entities

Las instancias se asocian a entidades via `WorkflowEntityBinding`:

```typescript
interface WorkflowEntityBinding {
  entityId: string;
  entityType: BusinessEntityType;
  entityLabel: string;
}
```

Nunca directamente. Nunca importando LiveProduct o LiveVendor.
Siempre a traves del contrato de binding.

---

## 5. Ejemplo Completo: Castillitos Produccion

Flujo real validado contra SAG (3,376 OPs sincronizadas):

```
crear_articulo
  ↓
activacion
  ↓
orden_produccion
  ↓
consumo_materia_prima
  ↓
corte
  ↓ ─────────────────────┐
estampacion              bordado
  ↓                        ↓
  └────────┬───────────────┘
           ↓
       confeccion
           ↓
       terminacion
           ↓
        empaque
           ↓
   entrada_producto_terminado
           ↓
   traslado_bodega_principal
```

### Definicion (documentacion, NO codificada en el motor)

```typescript
const castillitosProduccion: WorkflowDefinition = {
  id: "wf-prod-castillitos",
  organizationId: "castillitos",
  domain: "production",
  code: "produccion_castillitos",
  name: "Flujo de Produccion Castillitos",
  description: "Proceso completo desde creacion de articulo hasta bodega principal",
  entityType: "production_order",
  enabled: true,
  version: 1,
  stages: [
    { code: "crear_articulo",               name: "Crear Articulo",               order: 1  },
    { code: "activacion",                   name: "Activacion",                   order: 2  },
    { code: "orden_produccion",             name: "Orden de Produccion",          order: 3  },
    { code: "consumo_materia_prima",        name: "Consumo Materia Prima",        order: 4, generatesInventory: true, generatesCost: true },
    { code: "corte",                        name: "Corte",                        order: 5, generatesCost: true },
    { code: "estampacion",                  name: "Estampacion",                  order: 6, allowSkip: true, generatesCost: true },
    { code: "bordado",                      name: "Bordado",                      order: 7, allowSkip: true, generatesCost: true },
    { code: "confeccion",                   name: "Confeccion",                   order: 8, allowMerge: true, generatesCost: true },
    { code: "terminacion",                  name: "Terminacion",                  order: 9  },
    { code: "empaque",                      name: "Empaque",                      order: 10 },
    { code: "entrada_producto_terminado",   name: "Entrada Producto Terminado",   order: 11, generatesInventory: true },
    { code: "traslado_bodega_principal",    name: "Traslado Bodega Principal",    order: 12 },
  ],
  initialStageCode: "crear_articulo",
  terminalStageCodes: ["traslado_bodega_principal"],
  transitions: [
    // Linear path
    { from: "crear_articulo",             to: "activacion" },
    { from: "activacion",                 to: "orden_produccion" },
    { from: "orden_produccion",           to: "consumo_materia_prima" },
    { from: "consumo_materia_prima",      to: "corte" },
    // Branch: corte → estampacion OR bordado
    { from: "corte",                      to: "estampacion" },
    { from: "corte",                      to: "bordado" },
    // Both paths merge at confeccion
    { from: "estampacion",                to: "confeccion" },
    { from: "bordado",                    to: "confeccion" },
    // Continue linear
    { from: "confeccion",                 to: "terminacion" },
    { from: "terminacion",               to: "empaque" },
    { from: "empaque",                    to: "entrada_producto_terminado" },
    { from: "entrada_producto_terminado", to: "traslado_bodega_principal" },
  ],
};
```

### SAG Data Points

- `ka_ni_fuente = 33` → Orden de Produccion (OP)
- `ka_ni_fuente = 116` → Entrada de Terminados (ET)
- `sc_dcto_cerrado`: 'N' = abierto, 'S' = cerrado
- 99.3% de OPs nunca se cierran en SAG
- OP → ET linkage roto (requiere investigacion)
- 94.9% de referencias en OPs matchean con catalogo

---

## 6. Eventos Futuros (Business Event Engine)

NO implementados. Documentados para futura integracion.

| Evento | Trigger |
|---|---|
| `workflow.started` | Se inicia un flujo |
| `workflow.completed` | Se completa el flujo |
| `workflow.cancelled` | Se cancela el flujo |
| `workflow.failed` | El flujo falla |
| `workflow.blocked` | El flujo se bloquea por dependencia |
| `workflow.unblocked` | Se desbloquea el flujo |
| `stage.entered` | Se entra a una etapa |
| `stage.completed` | Se completa una etapa |
| `stage.skipped` | Se omite una etapa |
| `stage.sla_breached` | Se incumple el SLA de una etapa |
| `approval.requested` | Se solicita aprobacion |
| `approval.granted` | Se concede aprobacion |
| `approval.rejected` | Se rechaza aprobacion |

---

## 7. Compatibilidad Futura

### Business Event Engine

Cada transicion emitira un `BusinessEvent` con:
- type: `stage.completed`
- domain: workflow domain
- entityId: workflow instance ID
- payload: from stage, to stage, duration, actor

### Rule Engine

Las transiciones con conditions/rules se evaluaran via Rule Engine:
- conditions evaluan payload del workflow
- rules evaluan estado de Business Entities relacionadas

### Action Engine

Las stages con `generatesAlerts`, `generatesEvents`, `generatesCost`
dispararán ActionRequests via Action Engine:
- `create_alert` cuando se breachea SLA
- `send_notification` cuando se requiere aprobacion
- `update_kpi` cuando se completa una etapa

### Business Knowledge Graph

El workflow alimentara el Knowledge Graph:
- WorkflowDefinition → nodo tipo "Process"
- WorkflowStageDefinition → nodos tipo "ProcessStage"
- WorkflowTransition → edges entre stages
- WorkflowInstance → nodo tipo "ProcessExecution"
- Stage transitions → temporal edges con timestamps

---

## 8. Archivos del Sprint

| Archivo | Proposito |
|---|---|
| `lib/business-flow/workflow-types.ts` | 13 dominios, 9 estados, prioridades, entity binding |
| `lib/business-flow/workflow-stage.ts` | 20+ props configurables por etapa, builder |
| `lib/business-flow/workflow-transition.ts` | Grafos dirigidos, condiciones, reglas, modes, graph helpers |
| `lib/business-flow/workflow-definition.ts` | Definicion completa, validador estructural, helpers |
| `lib/business-flow/workflow-instance.ts` | Instancia de ejecucion, creator con initial state |
| `lib/business-flow/workflow-state.ts` | Stage/workflow progress, computation |
| `lib/business-flow/workflow-history.ts` | 22 event types, audit trail, builder |
| `lib/business-flow/workflow-metrics.ts` | 14 metricas, aggregate, computation |
| `lib/business-flow/workflow-template.ts` | 7 builtin templates, template contract |
| `lib/business-flow/workflow-engine.ts` | IWorkflowEngine (16 methods), future events |
| `lib/business-flow/workflow-utils.ts` | SLA, navigation, estimation helpers |
| `lib/business-flow/index.ts` | Barrel export (client-safe) |

---

## 9. Roadmap

### Phase 2: Persistence
- [ ] Prisma models: WorkflowDefinition, WorkflowInstance, WorkflowHistory
- [ ] In-memory IWorkflowEngine implementation
- [ ] Definition CRUD API routes
- [ ] Instance lifecycle API routes

### Phase 3: Castillitos Production Flow
- [ ] Create workflow definition for Castillitos produccion
- [ ] Connect to ProductionOrder sync (3,376 OPs)
- [ ] Resolve OP → ET linkage to track stage progression
- [ ] SLA monitoring per stage

### Phase 4: UI
- [ ] Workflow definition editor (tenant-configurable)
- [ ] Workflow instance tracker (visual pipeline)
- [ ] Stage detail panel
- [ ] SLA dashboard

### Phase 5: Integration
- [ ] Emit BusinessEvents on stage transitions
- [ ] Connect to Rule Engine for conditional transitions
- [ ] Connect to Action Engine for automated side effects
- [ ] Feed Business Knowledge Graph
