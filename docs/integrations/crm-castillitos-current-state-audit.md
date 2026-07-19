# CRM Castillitos — Auditoría de Estado Actual

**Sprint:** AGENTIK-CRM-INTEGRATION-AUDIT-AND-OPERATIONAL-UPGRADE-01
**Fecha:** 2026-05-25
**Tenant:** castillitos
**CRM:** JR Consultores SuiteCRM V8 (JSON:API)

---

## 1. Resumen ejecutivo

La integración CRM de Castillitos existe y está funcional a nivel de **connector layer** (transporte → Prisma). El problema es que **ningún módulo del sistema lee de Prisma CRM y produce entidades operacionales**. No hay `CrmCommercialProvider`. Los agentes, el copilot y los módulos comerciales no consumen datos CRM a través de la capa operacional — lo hacen directamente contra Prisma o no los consumen en absoluto.

Este documento audita el estado actual y define el upgrade necesario.

---

## 2. Stack de integración actual

```
SuiteCRM V8 API
     │
     ▼
lib/connectors/adapters/castillitos-crm/
  ├── client.ts         ← OAuth2 + rate limiter + retry + JSON:API
  ├── mappers.ts        ← V8 raw → UnifiedCustomer/Quote/Opportunity/Activity
  ├── index.ts          ← CastillitosCrmAdapter (pulls 4 modules)
  └── storage.ts        ← Prisma upsert handlers
     │
     ▼ (via sync engine)
Prisma DB
  ├── CRMOpportunity    ← AOS_Opportunities synced
  ├── CRMActivity       ← Calls synced
  ├── CRMQuote          ← AOS_Quotes synced
  └── CustomerProfile   ← Accounts synced (CRM fields: crmId, crmSyncedAt, rawCrmJson)
     │
     ▼ ← NOTHING AQUÍ — el gap crítico
Operational Data Layer
  ├── OperationalOrder
  ├── OperationalCustomer
  ├── OperationalOpportunity
  └── OperationalSalesActivity
```

---

## 3. Módulos CRM consumidos

| Módulo SuiteCRM       | Se consume | Dónde se almacena         | Estado         |
|----------------------|------------|---------------------------|----------------|
| `AOS_Quotes`          | ✅ Sí       | `CRMQuote`                | Activo         |
| `AOS_Opportunities`   | ✅ Sí       | `CRMOpportunity`          | Activo         |
| `Accounts`            | ✅ Sí       | `CustomerProfile`         | Activo         |
| `Calls` / Activities  | ✅ Sí       | `CRMActivity`             | Activo         |
| `AOS_Products_Quotes` | ❌ No       | —                         | **Pendiente**  |
| `ADM_SaldosBodega`    | ❌ No       | —                         | **No iniciado** |

### AOS_Products_Quotes (líneas de cotización)

**Estado:** NO consumido. La tabla `CRMQuote` almacena solo el header. Las líneas de producto de una cotización viven en el módulo relacionado `AOS_Products_Quotes` del CRM.

**Impacto:** `OperationalOrder.lines` para pedidos CRM siempre devuelve `[]`. Para el motor de demanda (`computeCommercialDemandSignals`), las oportunidades y cotizaciones con referenceLines vacíos no contribuyen a señales de inventario.

**Workaround V1:** `rawCrmJson` en `CRMQuote` puede contener product lines si el V8 las embede en el registro padre. Explorar en Phase 2.

**Plan Phase 2:** Añadir `pullQuoteLines()` en `CastillitosCrmAdapter` y modelo `CRMQuoteLine` en Prisma.

### ADM_SaldosBodega

**Estado:** NO consumido. Módulo custom de JR Consultores para saldos de bodega del CRM.

**Posición:** Este módulo es un espejo CRM del inventario físico. Dado que Castillitos usa SAG como fuente primaria de inventario, `ADM_SaldosBodega` es redundante para Agentik. La fuente canónica es `CommercialCoverageSnapshot` (SAG layer).

**Decisión:** No consumir `ADM_SaldosBodega` en este sprint. Documentar como `NOT_NEEDED` para Castillitos.

---

## 4. Credenciales y configuración

Las credenciales CRM se almacenan en `Connector.config` (columna JSON en Prisma, cifrada a nivel de secretos del tenedor). El cliente las resuelve en `lib/connectors/adapters/castillitos-crm/client.ts` a través de `CrmClientConfig`.

```json
{
  "baseUrl":              "https://crm-castillitos.jrconsultores.com.co/pruebas",
  "tokenEndpoint":        "https://crm-castillitos.jrconsultores.com.co/pruebas/Api/access_token",
  "clientId":             "<stored in Connector.config>",
  "clientSecret":         "<stored in Connector.config>",
  "quotesModule":         "AOS_Quotes",
  "opportunitiesModule":  "AOS_Opportunities",
  "activitiesModule":     "Calls",
  "customersModule":      "Accounts",
  "rateLimit":            60
}
```

**No hay tokens/secrets en código.** El acceso se hace vía OAuth2 `client_credentials` con caché de token en memoria (module-level).

---

## 5. Endpoints de sincronización

| Ruta API                                   | Método | Qué hace                                   |
|---------------------------------------------|--------|--------------------------------------------|
| `/api/orgs/[orgSlug]/connectors/[id]/sync`  | POST   | Trigger manual sync (incluye CRM)          |
| `/api/orgs/[orgSlug]/connectors/[id]/dry-run` | POST | Pull sin escribir a DB                    |
| `/api/orgs/[orgSlug]/validate`              | GET    | Diagnóstico de integridad CRM              |

La sincronización CRM es **demand-pull** (no webhook push). El scheduler externo o trigger manual inicia una corrida que llama `CastillitosCrmAdapter.pullQuotes()`, etc.

---

## 6. Jobs / Sync activos

El registro del conector en `lib/connectors/adapters/index.ts`:

```typescript
registry.register("castillitos_crm", CastillitosCrmAdapter);
registerStorageHandler("opportunities", crmOpportunityStorage);
registerStorageHandler("activities",    crmActivityStorage);
registerStorageHandler("quotes",        crmQuoteStorage);
// customers: source-aware mux (CRM + SAG → CustomerProfile)
```

**Estrategia de cursor:** fecha ISO8601 → `filter[date_entered][gte]` en V8. Auto-avanza al `date_modified` máximo de la página.

---

## 7. Modelos Prisma relacionados

| Modelo            | Campos clave                                              | Relaciones                     |
|-------------------|-----------------------------------------------------------|--------------------------------|
| `CustomerProfile` | `crmId`, `crmSyncedAt`, `rawCrmJson`, `nit`, `slug`      | `crmOpportunities`, `quotes`   |
| `CRMOpportunity`  | `crmId`, `stage`, `amount`, `probability`, `rawCrmJson`   | `customer`, `activities`, `quotes` |
| `CRMActivity`     | `crmId`, `type` (enum), `outcome`, `occurredAt`           | `customer`, `opportunity`      |
| `CRMQuote`        | `crmId`, `quoteNumber`, `status` (enum), `amount`         | `customer`, `opportunity`      |

**Enums Prisma:** `QuoteStatus` (DRAFT/SENT/ACCEPTED/REJECTED/EXPIRED), `ActivityType` (CALL/EMAIL/VISIT/NOTE/MEETING/QUOTE_SENT/DEMO/PROPOSAL/OTHER), `OpportunityStatus` (OPEN/WON/LOST/ABANDONED).

**Nota:** `CRMQuote.amount` y `CRMOpportunity.amount` son `Decimal(@db.Decimal(18,2))`. El provider debe llamar `.toNumber()` antes de pasar a mappers.

---

## 8. Lógica duplicada con operational-data

### Estado previo al upgrade (PRE-sprint)

Los mappers en `lib/operational-data/mappers/crm/` existían desde AGENTIK-OPERATIONAL-DATA-LAYER-01 pero usaban shapes **abstractas** (`CrmRawCustomer`, `CrmRawOrder`) que no correspondían a ningún dato real del sistema. Eran "promesas" de mappers sin conexión al transporte real.

### Estado POST-upgrade (este sprint)

| Mapper                         | Antes                       | Después                                  |
|--------------------------------|-----------------------------|------------------------------------------|
| `crm-customer-mapper.ts`       | Solo `CrmRawCustomer`       | + `PrismaCustomerProfileShape` + mapper  |
| `crm-order-mapper.ts`          | Solo `CrmRawOrder`          | + `PrismaCrmQuoteShape` + mapper         |
| `crm-opportunity-mapper.ts`    | Solo `CrmRawOpportunity`    | + `PrismaCrmOpportunityShape` + mapper   |
| `crm-sales-activity-mapper.ts` | Solo `CrmRawActivity`       | Solo abstract — Prisma mapper ADD        |

### Regla de no duplicación

```
lib/connectors/adapters/castillitos-crm/mappers.ts
  → produce UnifiedCustomer / UnifiedQuote / etc.
  → SOLO usados por el sync engine → Prisma

lib/operational-data/mappers/crm/*
  → produce OperationalCustomer / OperationalOrder / etc.
  → usados por CrmCommercialProvider → agentes / copilot / engines
```

Las dos capas son **paralelas y complementarias**, no duplicadas. El connector layer sincroniza; el operational layer interpreta.

---

## 9. Conexión con módulos comerciales

### Estado actual (PRE-sprint)

| Módulo                            | Consume CRM directo | Consume Operational Layer |
|-----------------------------------|---------------------|--------------------------|
| `lib/copilot/`                    | Vía Prisma directo  | ❌ No                    |
| `lib/comercial/maletas/`          | ❌ No               | ❌ No                    |
| `lib/comercial/sales-portfolio/`  | ❌ No               | ❌ No                    |
| `lib/customer360/`                | Vía Prisma directo  | ❌ No                    |
| `lib/sales/crm-alert-engine.ts`   | Vía Prisma directo  | ❌ No                    |

### Estado objetivo (POST-sprint)

```
CrmCommercialProvider
  └─ getOrders()         → OperationalOrder[]     (de CRMQuote)
  └─ getCustomers()      → OperationalCustomer[]  (de CustomerProfile)
  └─ getOpportunities()  → OperationalOpportunity[] (de CRMOpportunity)
  └─ getSalesActivities()→ OperationalSalesActivity[] (de CRMActivity)
       │
       ▼
CommercialOperationalContext
  └─ consumido por: agentes, copilot, Sales Portfolio, reservas
```

**Regla crítica establecida:**
> Ningún módulo debe leer CRM raw directo.
> Todo debe pasar por `CrmCommercialProvider` → `CommercialOperationalContext`.

Los módulos que hoy leen Prisma CRM directo (`lib/customer360/`, `lib/sales/crm-alert-engine.ts`) mantienen su implementación actual. La migración es progresiva.

---

## 10. Plan de migración progresiva

| Fase | Qué                                               | Sprint             |
|------|---------------------------------------------------|--------------------|
| ✅ 1  | Connector layer (cliente, adapter, storage)       | Previo             |
| ✅ 2  | Prisma models (CRMOpportunity, CRMActivity, etc.) | Previo             |
| ✅ 3  | Abstract operational mappers                      | AGENTIK-ODL-01     |
| **4** | **Prisma-backed mappers + CrmCommercialProvider** | **Este sprint**    |
| 5    | Wiring copilot/agents a `CrmCommercialProvider`   | Próximo sprint     |
| 6    | Sales Portfolio consume pedidos CRM vía provider  | AGENTIK-SP-PERSIST |
| 7    | AOS_Products_Quotes (líneas de cotización)        | Phase 2            |
| 8    | `lib/customer360/` migra a OperationalLayer       | Future             |

---

## 11. Archivos del upgrade (este sprint)

### Phase 1 — AGENTIK-CRM-INTEGRATION-AUDIT-AND-OPERATIONAL-UPGRADE-01

```
CREATED:
  lib/integrations/crm-castillitos/index.ts
  lib/operational-data/providers/crm-commercial-provider.ts
  lib/operational-data/mappers/crm/index.ts

UPDATED:
  lib/operational-data/mappers/crm/crm-customer-mapper.ts    + PrismaCustomerProfileShape
  lib/operational-data/mappers/crm/crm-order-mapper.ts       + PrismaCrmQuoteShape
  lib/operational-data/mappers/crm/crm-opportunity-mapper.ts + PrismaCrmOpportunityShape
  lib/operational-data/mappers/crm/crm-sales-activity-mapper.ts + PrismaCrmActivityShape
  lib/operational-data/index.ts                              + provider exports

NOT TOUCHED:
  lib/connectors/adapters/castillitos-crm/*   (connector layer intacto)
  lib/customer360/*                           (sigue con Prisma directo por ahora)
  lib/sales/crm-alert-engine.ts               (sigue con Prisma directo por ahora)
  prisma/schema.prisma                        (sin cambios en Phase 1)
  SAG / Shopify / facturación                 (no tocar)
```

---

## 12. Phase 2 — AGENTIK-CRM-QUOTE-LINES-INGESTION-01

**Problema resuelto:** `OperationalOrder.lines = []` — Agentik veía encabezados de pedido pero cero líneas de producto. Sin líneas: no hay señales reales de demanda, no hay reservas por referencia, no hay sugerencias de producción, David y Copilot no pueden razonar sobre demanda real.

**Root cause:** El módulo `AOS_Products_Quotes` de SuiteCRM no estaba siendo consumido. El connector existente solo traía `AOS_Quotes` (encabezados).

### Qué se construyó

| Componente | Descripción |
|---|---|
| `lib/integrations/crm-castillitos/crm-quote-line-types.ts` | Tipos para `AOS_Products_Quotes`: `CrmQuoteLineRaw`, `CrmQuoteLineAttributes`, `crmNumToFloat()` |
| `lib/connectors/adapters/castillitos-crm/index.ts` | Añadidos `pullQuoteLines(quoteId)` y `pullQuoteLinesBatch(quoteIds[])` |
| `prisma/schema.prisma` | Nuevo modelo `CRMQuoteLine` con 20+ campos incluyendo talla, color, bodega, IVA, estado |
| `lib/connectors/adapters/castillitos-crm/storage.ts` | `upsertQuoteLines()` — sincronización no destructiva a Prisma |
| `lib/operational-data/mappers/crm/crm-order-mapper.ts` | `PrismaCrmQuoteLineShape` + `mapPrismaCrmQuoteLineToOperationalLine()` |
| `lib/operational-data/providers/crm-commercial-provider.ts` | `getOrders()` reescrito con join de líneas en 4 pasos |
| `lib/operational-data/operational-entities.ts` | `OperationalOrderLine.metadata?` + 4 nuevos `signalType` en `OperationalDemandSignal` |
| `lib/operational-data/engines/commercial-demand-signals.ts` | Phase 2: 4 nuevos signal builders + `computeCrmOrderLineSignals()` standalone |

### Nuevas señales de demanda (Phase 2)

| Signal type | Condición de disparo | Urgencia |
|---|---|---|
| `demand_from_crm_order` | Referencia con qty > 0 en órdenes activas | baja→alta por #órdenes |
| `hot_reference` | Referencia en ≥ 2 órdenes distintas | baja→alta por #órdenes |
| `multi_vendor_demand` | Misma referencia pedida por ≥ 2 vendedores | baja→alta por #vendedores |
| `warehouse_pressure_candidate` | ≥ 70% de la demanda de una referencia concentrada en una bodega | media/alta |

### Metadata preservada en OperationalOrderLine

Las líneas CRM llevan en `metadata`: `crmLineId`, `productCrmId`, `talla`, `color`, `bodega`, `warehouseId`, `vat`, `estadoPedido`, `totalPrice`, `discount`, `vatAmount`. Los engines NO leen de metadata — solo los consumidores downstream que necesitan estos campos (warehouse routing, sizing de producción).

### TSC validation

```
npx prisma generate → ✓ Prisma Client regenerado con CRMQuoteLine
npx tsc --noEmit    → 160 errores (baseline, sin errores nuevos)
```

---

## 13. Phase 3 — AGENTIK-CRM-ORDER-RESERVATION-BRIDGE-01

**Problema resuelto:** CRM orders con líneas reales no generaban reservas operacionales. Agentik sabía qué pedían los clientes pero no "reservaba" las unidades — cualquier cálculo de disponibilidad operacional ignoraba la demanda CRM viva.

### Qué se construyó

| Componente | Descripción |
|---|---|
| `lib/operational-inventory/order-reservation-bridge.ts` | Bridge central: mapeo de estado CRM → acción de reserva, idempotencia, persistencia vía Prisma |
| `lib/operational-inventory/crm-order-reservation-sync.ts` | Batch sync de todos los órdenes CRM activos + helper de diagnóstico |
| `app/api/orgs/[orgSlug]/operational-inventory/reservations/sync-order/route.ts` | POST endpoint: single order o batch, con modo dry_run |
| `prisma/schema.prisma` | `@@unique([organizationId, sourceType, sourceId, reference])` en `OperationalReservation` |

### Reglas de ciclo de vida

| Estado CRM | Estado operacional | Acción de reserva |
|---|---|---|
| DRAFT | draft | noop |
| SENT | reserved | create / update |
| ACCEPTED | confirmed | create / update |
| REJECTED/EXPIRED | cancelled | release |
| — | sent_to_erp | consume |
| — | fulfilled | consume |

### Idempotencia

Clave única: `organizationId + sourceType="order" + sourceId + reference`

Ejecutar sync múltiples veces es seguro:
- Misma qty → noop
- Qty cambiada → update
- Pedido cancelado → release
- Pedido fulfillado → consume

### TSC validation

```
npx prisma generate → ✓ Nuevo @@unique generado para OperationalReservation
npx tsc --noEmit    → 160 errores (baseline, sin errores nuevos)
```

### Arquitectura doc

`docs/architecture/crm-order-reservation-bridge.md`

---

## 14. Phase 4 — AGENTIK-OPERATIONAL-INVENTORY-RECONCILIATION-01

**Problema resuelto:** Agentik mueve inventario operacional (reservas, consumos, liberaciones) pero no tenía forma de verificar si su estado interno era consistente. Reservas huérfanas, pedidos cancelados con reservas activas, disponibilidad negativa o sobre-reservas podían contaminar las señales de presión, los portafolios comerciales y las sugerencias de producción.

### Qué se construyó

| Componente | Descripción |
|---|---|
| `lib/operational-inventory/operational-reconciliation-types.ts` | Tipos completos: Issue, Report, RepairPlan, FixSuggestion |
| `lib/operational-inventory/operational-reconciliation-engine.ts` | Engine puro: 11 checks, health score, resumen |
| `lib/operational-inventory/operational-reconciliation-repair-planner.ts` | Planner puro: issues → plan de reparación |
| `lib/operational-inventory/operational-reconciliation-service.ts` | Service: carga datos de Prisma/CRM, ejecuta engine + planner |
| `app/api/orgs/[orgSlug]/operational-inventory/reconciliation/route.ts` | GET — resumen + issues + overview del plan |
| `app/api/orgs/[orgSlug]/operational-inventory/reconciliation/plan/route.ts` | POST — reporte completo + plan completo |

### Checks implementados

| Tipo de issue | Severidad |
|---|---|
| inventory_formula_mismatch | warning |
| negative_operational_available | critical |
| over_reserved_reference | critical |
| missing_inventory_reference | warning |
| cancelled_order_still_reserved | critical |
| confirmed_order_without_reservation | warning |
| order_line_qty_mismatch | warning |
| duplicate_reservation | critical |
| stale_reservation | info |
| sales_assignment_exceeds_inventory | critical |
| stale_inventory_snapshot | warning |

### Regla V1

**No auto-repair.** Todos los issues críticos requieren aprobación humana. El planner genera un `proposedPayload` por acción. La ejecución es un sprint futuro (AGENTIK-RECONCILIATION-RUNTIME-01).

### TSC validation

```
npx tsc --noEmit → 160 errores (baseline, sin errores nuevos)
```

### Arquitectura doc

`docs/architecture/operational-inventory-reconciliation.md`
