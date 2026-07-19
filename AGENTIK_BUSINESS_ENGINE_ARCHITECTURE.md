# AGENTIK-ARCHITECTURE-BUSINESS-ENGINE-01

## Arquitectura del Business Engine

**Estado:** Contratos definidos. Implementacion pendiente.
**Fecha:** 2026-06-25
**TSC Baseline:** 160 (sin regresion)

---

## 1. Principio Central

Agentik no construye modulos aislados. Cada modulo alimenta y consume una misma inteligencia operacional.

El Business Engine es la capa que formaliza este principio en contratos ejecutables:

```
Evento de Negocio --> Motor de Reglas --> Motor de Acciones --> Destino
```

Los modulos NUNCA se comunican directamente entre si. Emiten eventos. El Business Engine los enruta.

---

## 2. Los Cinco Motores

### 2.1 Business Event Engine (`lib/business-engine/events/event-types.ts`)

**Responsabilidad:** Connective tissue entre todos los modulos.

- 11 dominios de eventos: commercial, inventory, production, purchasing, finance, collection, marketing, hr, quality, dispatch, system
- 30+ tipos de eventos tipados (order.created, inventory.depleted, production.sla_breached, etc.)
- Patron pub/sub con wildcards (e.g. `"inventory.*"`)
- Cada BusinessEvent incluye: organizationId, entityId, entityType, severity, correlationId, source

**Contrato:** `IEventEngine` — emit, emitBatch, subscribe, unsubscribe, getRecentEvents

**Regla critica:** Los modulos NUNCA importan otros modulos. Solo emiten eventos.

### 2.2 Business Rule Engine (`lib/business-engine/rules/rule-types.ts`)

**Responsabilidad:** Separar eventos de reacciones. Las reglas son configurables por tenant.

- Pipeline: Event --> Rule Engine --> Action Engine --> Destination
- Condiciones con operadores: equals, greater_than, contains, in, exists, etc.
- Campo `field` usa dot notation para evaluar payloads de eventos
- Rate limiting por regla (maximas ejecuciones por hora)
- Prioridad para ordenar evaluacion de reglas
- Test mode: evaluar regla contra evento de ejemplo sin ejecutar acciones

**Contrato:** `IRuleEngine` — evaluate, listRules, saveRule, deleteRule, testRule

**Regla critica:** Nuevas reglas se agregan sin modificar ningun modulo.

### 2.3 Action Engine (`lib/business-engine/actions/action-types.ts`)

**Responsabilidad:** Ejecutor centralizado de acciones. Las acciones NUNCA viven dentro de modulos.

18 tipos de accion organizados en 6 categorias:
- **Alerting:** create_alert, send_notification, send_email, send_whatsapp
- **Dashboard:** update_dashboard, update_david, update_timeline, update_kpi
- **Operations:** request_production, request_transfer, request_purchase, block_order, unblock_order
- **Approvals:** request_approval, auto_approve
- **Automation:** trigger_workflow, trigger_automation
- **Analytics:** update_indicators, log_event

**Contrato:** `IActionEngine` — execute, executeBatch, registerHandler, listRegisteredTypes

**Patron:** Handler registry. Cada tipo de accion tiene un IActionHandler independiente con execute() y validate().

### 2.4 Business Flow Engine (`lib/business-engine/flow/flow-types.ts`)

**Responsabilidad:** Modelar procesos operativos configurables por tenant.

- 10 dominios de flujo: production, purchasing, commercial, collection, inventory, quality, dispatch, hr, approval, automation
- Cada etapa (FlowStageDefinition) tiene 15+ propiedades configurables:
  - Comportamiento: consumesInventory, generatesCosts, generatesEvents, requiresApproval
  - Flexibilidad: canSplitProduction, canBeSkipped, isMandatory
  - SLA: expectedDurationHours, slaHours
  - Permisos: responsibleRoles, permissions
  - Transiciones: nextStages[]
- FlowInstance rastrea entidades (OPs, OCs, etc.) a traves de sus etapas
- Historial completo de transiciones con duracion y notas

**Contrato:** `IFlowEngine` — getFlowDefinition, listFlowDefinitions, saveFlowDefinition, startFlow, advanceFlow, getFlowInstance, listFlowInstances

**Regla critica:** Agentik modela procesos, NO impone procesos. Cada flujo es 100% configurable por tenant.

### 2.5 Digital Business Entities (`lib/business-engine/entities/entity-types.ts`)

**Responsabilidad:** Representaciones operacionales vivas de entidades de negocio.

Cada entidad importante NO es solo un registro de base de datos. Es una entidad viviente con estado operacional en tiempo real.

5 entidades definidas:
- **DigitalProduct:** stock, variantes agotadas, pedidos pendientes, produccion activa
- **DigitalCustomer:** lifetime value, balance pendiente, estado crediticio
- **DigitalVendor:** maleta activa, ventas hoy/mes, tasa de cumplimiento
- **DigitalStore:** SKUs, agotados, ventas, necesidad de surtido
- **DigitalProductionOrder:** etapa actual, cantidad ordenada, estado abierto/cerrado

Todas comparten `OperationalState`:
```typescript
interface OperationalState {
  health: "healthy" | "warning" | "critical" | "unknown";
  activeAlertCount: number;
  pendingActionCount: number;
  lastUpdatedAt: string | null;
  lastSyncedAt: string | null;
  completeness: number; // 0-100
}
```

**Contrato:** `IEntityEngine` — resolve, resolveBatch, search

---

## 3. Relacion con el Executive Intelligence Engine

El Executive Intelligence Engine (`lib/intelligence/executive/`) fue el PRIMER motor de inteligencia implementado. Representa el patron que los motores del Business Engine deben seguir:

```
Executive Intelligence Engine (implementado)
  |
  +-- commercial-engine.ts    --> Futuro consumidor de BusinessEvents del dominio "commercial"
  +-- inventory-engine.ts     --> Futuro consumidor de BusinessEvents del dominio "inventory"
  +-- production-engine.ts    --> Futuro consumidor de BusinessEvents del dominio "production"
  +-- executive-kpis.ts       --> Futuro consumidor de DigitalEntity.operationalState
  +-- executive-alerts.ts     --> Futuro proveedor de ActionRequests tipo "create_alert"
  +-- executive-recommendations.ts --> Futuro proveedor de ActionRequests tipo "update_david"
  +-- executive-timeline.ts   --> Futuro consumidor de BusinessEvents para timeline
```

**Ruta de migracion:**
1. Los data engines (commercial, inventory, production) actualmente consultan Prisma directamente
2. Al implementar el Event Engine, estos engines se convierten en suscriptores de BusinessEvents
3. Los intelligence engines (alerts, recommendations) se convierten en generadores de ActionRequests
4. El dashboard se convierte en un consumidor pasivo de DigitalEntities con OperationalState

**No hay breaking change.** La migracion es aditiva: los engines existentes siguen funcionando mientras se conectan gradualmente al Business Engine.

---

## 4. Sales Performance Center

Vision: Centro de rendimiento comercial que unifica vendedores, maletas y tiendas.

### Maletas vs Tiendas — Diferencias de Comportamiento

| Dimension | Maleta (Vendedor) | Tienda (Punto de Venta) |
|---|---|---|
| Movilidad | Movil — el vendedor lleva la maleta | Fija — la tienda tiene ubicacion permanente |
| Inventario | Temporal — la maleta se arma y desarma | Permanente — el inventario se repone |
| Flujo de reposicion | Armar maleta = seleccionar referencias | Surtido = transferencia de bodega a tienda |
| KPI principal | Tasa de cumplimiento (vendido/llevado) | Ventas por m2, rotacion de inventario |
| Agotados | Referencia agotada EN la maleta | SKU agotado EN la tienda |
| Ciclo | Por viaje/ruta del vendedor | Continuo |
| Entity digital | DigitalVendor + case (maleta) | DigitalStore |

Ambas entidades comparten el mismo pipeline de eventos:
- `sales.case_assigned` / `sales.case_depleted` (maleta)
- `inventory.depleted` / `inventory.transferred` (tienda)

El Sales Performance Center NO es un modulo nuevo — es una vista unificada que consume DigitalVendor y DigitalStore del Entity Engine.

---

## 5. Production Workflow — Caso Castillitos

Estado actual (validado con SAG 2026-06-25):
- 3,376 OPs sincronizadas (3,352 abiertas, 24 cerradas)
- 56,586 lineas de produccion
- OP-to-ET linkage: ROTO (las 3 estrategias de cruce fallaron)
- 94.9% de referencias en OPs matchean con catalogo de productos

### Flujo de Produccion Castillitos (candidato para FlowDefinition)

```
Corte --> Bordado/Estampacion --> Fileteado --> Confeccion --> Terminacion --> Empaque --> Bodega
```

Cada etapa seria un FlowStageDefinition con:
- SLA configurado por tenant
- Eventos automaticos al avanzar etapa
- Costos generados por etapa
- Consumo de inventario (materias primas) en Corte

**Prerequisito:** Resolver el cruce OP-to-ET antes de implementar FlowInstances.

---

## 6. Informes vs Torre de Control

| Concepto | Informes (Executive Dashboard) | Torre de Control |
|---|---|---|
| Proposito | Vista consolidada del estado del negocio | Monitoreo en tiempo real con accion inmediata |
| Frecuencia | Consulta bajo demanda | Stream continuo |
| Profundidad | KPIs agregados, tendencias, recomendaciones | Alertas atomicas, operaciones individuales |
| Accion | Leer, analizar, decidir | Intervenir, aprobar, escalar |
| Motor principal | Executive Intelligence Engine | Business Event Engine + Action Engine |
| Tiempo | Historico + estado actual | Ahora + proximo |

La Torre de Control sera el primer consumidor en tiempo real del Business Event Engine. Los Informes seguiran siendo un consumidor batch del Executive Intelligence Engine.

---

## 7. Preparacion para la Bodega de Datos

El Business Engine esta disenado para ser la fuente de eventos que alimenta una futura Data Warehouse:

```
Modulos --> Business Event Engine --> [Event Store] --> Data Warehouse
                                  |
                                  +--> Rule Engine --> Action Engine (tiempo real)
```

**Principios de diseno para DW-readiness:**

1. **Eventos inmutables:** BusinessEvent es un registro historico. Nunca se modifica.
2. **Correlation IDs:** Permiten trazar cadenas de eventos relacionados.
3. **Entity references:** entityId + entityType en cada evento permiten join con dimensiones.
4. **Temporal marks:** occurredAt es el timestamp de negocio, no de sistema.
5. **Domain isolation:** Cada evento pertenece a un unico dominio, facilitando particionamiento.

Cuando se implemente el Event Store (Phase 2), bastara con persistir BusinessEvents en una tabla append-only para tener la materia prima de cualquier modelo analitico.

---

## 8. Roadmap Recomendado de Implementacion

### Phase 1: Foundations (actual)
- [x] Contratos y tipos definidos (5 archivos en lib/business-engine/)
- [x] Executive Intelligence Engine implementado (lib/intelligence/executive/)
- [x] Production Sync 01A completo (3,376 OPs + 56,586 lineas)
- [x] TSC baseline mantenido en 160

### Phase 2: Event Engine Implementation
- [ ] In-memory event bus con pub/sub
- [ ] Event Store (tabla append-only en Prisma)
- [ ] Primeros emisores: production-sync emite production.order_created
- [ ] Primeros suscriptores: executive-timeline consume eventos
- **Prerequisito:** Ningun modulo existente se rompe. El Event Engine es aditivo.

### Phase 3: Rule Engine + Action Engine
- [ ] Rule evaluator con condiciones tipadas
- [ ] Action handler registry con los primeros 5 handlers
- [ ] UI de configuracion de reglas (tenant-scoped)
- [ ] Primeras reglas: inventory.depleted --> create_alert + send_notification

### Phase 4: Flow Engine (Production Workflow)
- [ ] Resolver cruce OP-to-ET en SAG
- [ ] FlowDefinition para produccion Castillitos
- [ ] FlowInstance tracking por OP
- [ ] SLA monitoring y eventos automaticos

### Phase 5: Digital Entities + Sales Performance Center
- [ ] Entity resolution para DigitalProduct (combina inventario + produccion + pedidos)
- [ ] Entity resolution para DigitalVendor (combina maletas + ventas + clientes)
- [ ] Entity resolution para DigitalStore (combina inventario + ventas + surtido)
- [ ] Sales Performance Center como vista unificada

### Phase 6: Torre de Control
- [ ] Real-time event stream en UI (WebSocket o SSE)
- [ ] Action Engine connected a la UI
- [ ] Approval workflows via Flow Engine
- [ ] David como consumidor inteligente de eventos

---

## 9. Archivos del Sprint

| Archivo | Proposito |
|---|---|
| `lib/business-engine/events/event-types.ts` | 30+ event types, BusinessEvent, IEventEngine |
| `lib/business-engine/rules/rule-types.ts` | BusinessRule, conditions, IRuleEngine |
| `lib/business-engine/actions/action-types.ts` | 18 action types, IActionHandler, IActionEngine |
| `lib/business-engine/flow/flow-types.ts` | FlowStageDefinition, FlowDefinition, FlowInstance, IFlowEngine |
| `lib/business-engine/entities/entity-types.ts` | 5 DigitalEntity types, OperationalState, IEntityEngine |

---

## 10. Decisiones Arquitecturales Cerradas

1. **Eventos, no imports directos.** Los modulos se comunican SOLO via BusinessEvents.
2. **Reglas configurables por tenant.** El comportamiento del sistema se configura, no se programa.
3. **Acciones centralizadas.** El Action Engine es el unico ejecutor. Los modulos NO ejecutan acciones.
4. **Flujos configurables.** Los procesos operativos son FlowDefinitions, no codigo hardcoded.
5. **Entidades digitales vivas.** Cada entidad de negocio tiene OperationalState en tiempo real.
6. **Executive Intelligence Engine sigue funcionando.** La migracion al Business Engine es aditiva.
7. **DW-ready desde dia uno.** Los eventos son inmutables, tienen correlationId y timestamps de negocio.
8. **Maletas y Tiendas son entidades diferentes** con flujos distintos pero el mismo pipeline de eventos.
9. **Informes y Torre de Control son superficies diferentes** que consumen los mismos motores.
10. **Phase 2 no rompe Phase 1.** Cada fase es aditiva, no destructiva.
