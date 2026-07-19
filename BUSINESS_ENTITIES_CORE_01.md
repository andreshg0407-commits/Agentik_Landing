# BUSINESS-ENTITIES-CORE-01

## Nucleo Comun de Business Entities

**Estado:** Completo
**Fecha:** 2026-06-25
**TSC Baseline:** 160 (sin regresion)

---

## 1. Vision

Los modulos no se consultan entre si. Los modulos consultan motores y entidades vivas.

Incorrecto:
```
Comercial -> Pedidos -> Inventario -> Produccion -> Maletas
```

Correcto:
```
Comercial -> Business Entity Engine -> LiveVendor / LiveProduct / LiveCustomer
                                    -> Business Event Engine
                                    -> Executive Intelligence Engine
```

Si manana se construye un modulo Comercial para otra empresa, ese modulo NO
reescribe logica de vendedores, productos o clientes. Consulta el cerebro comun.

---

## 2. Contratos Creados

### 2.1 BusinessEntity (base universal)

```typescript
interface BusinessEntity {
  entityId: string;
  organizationId: string;
  entityType: BusinessEntityType;
  displayName: string;
  status: BusinessEntityStatus;
  state: BusinessEntityState;
  health: BusinessEntityHealth;
  metrics: BusinessEntityMetric[];
  alerts: BusinessEntityAlert[];
  recommendations: BusinessEntityRecommendation[];
  timeline: BusinessEntityTimelineEvent[];
  relations: BusinessEntityRelation[];
  aiContext: BusinessEntityAIContext | null;
  dataFreshness: DataFreshness;
  lastSyncAt: string | null;
  updatedAt: string;
  metadata: Record<string, unknown>;
}
```

11 entity types soportados: vendor, product, customer, production_order,
sales_portfolio, store, order, inventory_location, supplier,
financial_account, collection_account.

### 2.2 BusinessEntityState

7 niveles: healthy, attention_needed, warning, critical, blocked, inactive, unknown.

Incluye: level, reason, severity, lastChangedAt, source, signals[].

Helpers: `buildStateFromSignals()`, `computeHighestSeverity()`, `severityToStateLevel()`.

### 2.3 BusinessEntityHealth (multi-dimensional)

8 dimensiones: overall, commercial, inventory, production, financial, operational, sync, ai.

Cada dimension: healthy | degraded | critical | unavailable | unknown.

Helpers: `buildDimension()`, `computeOverallHealth()`, `emptyHealth()`, `unavailableDimension()`.

No todas las dimensiones aplican a todas las entidades:
- LiveVendor: commercial, inventory, operational, sync
- LiveProduct: commercial, inventory, production
- LiveStore: commercial, inventory, operational
- LiveProductionOrder: production, operational

### 2.4 BusinessEntityAlert

Campos: id, entityId, entityType, category, severity, title, description,
source, priority, action, relatedEntityIds, createdAt, expiresAt, acknowledged, metadata.

11 categorias: inventory, production, commercial, financial, sync,
customer, vendor, portfolio, store, order, system.

Alertas NO ejecutan acciones. Solo describen condiciones.

### 2.5 BusinessEntityRecommendation

Campos: id, entityId, entityType, priority, severity, title, description,
recommendedAction, source, confidence, suggestedOnly, relatedEntityIds, createdAt, metadata.

Regla obligatoria: `suggestedOnly: true` hasta que exista Action Engine con aprobaciones.

### 2.6 BusinessEntityTimelineEvent

36+ event types organizados por dominio:
vendor (5), product (4), order (5), production (5), store (3),
customer (4), portfolio (3), finance (3), system (3).

Campos: id, entityId, entityType, eventType, title, description,
source, occurredAt, relatedEntityIds, metadata.

### 2.7 BusinessEntityMetric

Campos: key, label, value, unit, period, delta, trend, source, updatedAt.

9 periodos: today, yesterday, week, month, quarter, year, rolling_7d, rolling_30d, all_time.
4 trends: up, down, flat, unknown.
8 units: currency, count, percent, days, hours, units, ratio, score, none.

### 2.8 BusinessEntityRelation

Campos: sourceEntityId, sourceEntityType, targetEntityId, targetEntityType,
relationType, strength, metadata.

11 relation types: owns, assigned_to, contains, sold_by, ordered_by,
stored_in, produced_by, blocked_by, depends_on, affects, belongs_to.

4 strengths: strong, moderate, weak, inferred.

### 2.9 BusinessEntitySnapshot

Campos: entity, capturedAt, version, source, dataFreshness, isPartial, warnings.

Preparado para cache, executive reports, copilot context, Data Warehouse.

### 2.10 BusinessEntityAIContext

Campos: summary, keyFacts[], risks[], opportunities[],
recommendedQuestions[], lastAnalyzedAt.

Contrato definido. No se llaman modelos de IA en este sprint.

### 2.11 DataFreshness

Niveles: fresh, stale, expired, unknown.
Campos: level, lastUpdatedAt, expectedRefreshIntervalSeconds, source.

---

## 3. Relacion con LiveVendor

LiveVendor (COMERCIAL-VENDEDORES-LIVE-01) fue la primera entidad viva.
No se modifica en este sprint.

Se creo `lib/business-entities/adapters/live-vendor-adapter.ts` que convierte
LiveVendor -> BusinessEntity -> BusinessEntitySnapshot sin modificar el original.

Mapeo:
- `vendor.identity` -> entityId, displayName, status, metadata
- `vendor.commercial` -> metrics[] (10 metricas)
- `vendor.activeCase` -> health.inventory, dataFreshness
- `vendor.orders` -> signals[] (blocked_orders)
- `vendor.fulfillment` -> signals[] (low_fulfillment), metrics[]
- `vendor.alerts` -> alerts[] (adaptados a BusinessEntityAlert)
- `vendor.recommendations` -> recommendations[] (adaptados a BusinessEntityRecommendation)
- Operacional -> state (via buildStateFromSignals)
- Identity + alerts + case -> aiContext

### Migracion Futura (no hoy)

En un sprint futuro, LiveVendor puede implementar BusinessEntity directamente.
El adapter garantiza compatibilidad retroactiva mientras eso ocurre.

---

## 4. Relacion con LiveProduct (futuro)

```typescript
LiveProduct implementara BusinessEntity con:
  health: { commercial, inventory, production }
  metrics: [stock_total, depleted_variants, pending_orders, daily_velocity, coverage_days]
  relations: [stored_in -> inventory_location, produced_by -> production_order, sold_by -> vendor]
  timeline: [product_out_of_stock, product_recovered, product_price_changed]
```

---

## 5. Relacion con LiveCustomer (futuro)

```typescript
LiveCustomer implementara BusinessEntity con:
  health: { commercial, financial }
  metrics: [lifetime_value, outstanding_balance, days_since_last_order, total_orders]
  relations: [ordered_by -> order, assigned_to -> vendor]
  timeline: [customer_order_created, customer_payment_received, customer_overdue]
```

---

## 6. Relacion con LiveProductionOrder (futuro)

```typescript
LiveProductionOrder implementara BusinessEntity con:
  health: { production, operational }
  metrics: [quantity_ordered, lines_count, days_open, completion_percent]
  relations: [contains -> product, depends_on -> inventory_location]
  timeline: [production_started, production_stage_changed, production_completed]
```

---

## 7. Relacion con LivePortfolio (futuro)

```typescript
LivePortfolio implementara BusinessEntity con:
  health: { commercial, inventory }
  metrics: [total_references, depleted_references, portfolio_value, coverage_days]
  relations: [owned_by -> vendor, contains -> product]
  timeline: [portfolio_reference_added, portfolio_reference_removed, portfolio_replenished]
```

---

## 8. Relacion con LiveStore (futuro)

```typescript
LiveStore implementara BusinessEntity con:
  health: { commercial, inventory, operational }
  metrics: [total_skus, depleted_skus, sales_today, replenishment_needed]
  relations: [contains -> product, stored_in -> inventory_location]
  timeline: [store_out_of_stock, store_replenished, store_transfer_completed]
```

---

## 9. Relacion con Business Event Engine

BusinessEntityTimelineEvent es el precursor de BusinessEvent.

Cuando se implemente el Event Engine:
- Timeline events se emiten como BusinessEvents
- El Event Engine persiste eventos en event store
- Subscribers reciben eventos en tiempo real
- Timeline views consumen desde event store

La transicion es aditiva: los timeline events actuales siguen funcionando.

---

## 10. Relacion con Executive Intelligence Engine

El Executive Intelligence Engine actualmente consulta Prisma directamente.

Con Business Entities Core:
- Los data engines resuelven entidades vivas
- El dashboard consume snapshots, no queries directas
- Las alertas del ejecutivo son agregaciones de BusinessEntityAlert
- Las recomendaciones del ejecutivo son agregaciones de BusinessEntityRecommendation

Ruta de migracion:
1. Cada data engine resuelve BusinessEntity[] via resolvers
2. Executive Intelligence agrega snapshots
3. Dashboard consume el agregado

---

## 11. Relacion con Data Warehouse

BusinessEntity esta disenado para ser DW-ready:
- Metrics tienen period + source -> fact tables
- Relations tienen source/target types -> dimension joins
- Snapshots tienen capturedAt + version -> temporal tracking
- Timeline events tienen occurredAt -> event fact table
- DataFreshness tracks staleness -> data quality monitoring

---

## 12. Archivos del Sprint

| Archivo | Proposito |
|---|---|
| `lib/business-entities/core/business-entity-types.ts` | BusinessEntity base, EntityType, DataFreshness, IBusinessEntityResolver, IBusinessEntityEngine |
| `lib/business-entities/core/business-entity-state.ts` | 7 state levels, signals, severity, helpers |
| `lib/business-entities/core/business-entity-health.ts` | 8-dimension health model, helpers |
| `lib/business-entities/core/business-entity-alerts.ts` | Alert model, 11 categories, builder |
| `lib/business-entities/core/business-entity-recommendations.ts` | Recommendation model, suggestedOnly rule, builder |
| `lib/business-entities/core/business-entity-timeline.ts` | 36+ event types, builder |
| `lib/business-entities/core/business-entity-metrics.ts` | Generic metrics, 9 periods, 4 trends, builder |
| `lib/business-entities/core/business-entity-relations.ts` | 11 relation types, 4 strengths, helpers |
| `lib/business-entities/core/business-entity-snapshot.ts` | Snapshot + AI readiness context |
| `lib/business-entities/core/business-entity-utils.ts` | Freshness eval, alert counting, entity sorting |
| `lib/business-entities/core/index.ts` | Barrel export (client-safe) |
| `lib/business-entities/adapters/live-vendor-adapter.ts` | LiveVendor -> BusinessEntitySnapshot adapter |

---

## 13. Reglas de Diseno para Futuros Sprints

1. **Toda nueva entidad viva debe implementar BusinessEntity** o poder convertirse a BusinessEntitySnapshot.

2. **Todo motor de dominio debe poder emitir o consumir BusinessEntityTimelineEvent.**

3. **Toda alerta debe usar BusinessEntityAlert** o adaptarse a ese contrato.

4. **Toda recomendacion debe usar BusinessEntityRecommendation** o adaptarse a ese contrato. Con `suggestedOnly: true`.

5. **Todo dashboard o copilot debe consumir snapshots**, no consultar multiples modulos directamente.

6. **Antes de crear logica dentro de un modulo**, validar si pertenece a: Business Entities Core, Business Flow Engine, Business Event Engine, Business Rule Engine, Action Engine, o Executive Intelligence Engine.

7. **No duplicar modelos de alertas, recomendaciones, state, health, metrics o timeline** dentro de modulos individuales. Usar los contratos de Business Entities Core.
