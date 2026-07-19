# AGENTIK_ORDER_ARCHITECTURE_VALIDATION_01

**Sprint:** AGENTIK-ORDER-ARCHITECTURE-VALIDATION-01
**Fecha:** 2026-07-04
**Tipo:** Validacion arquitectonica con evidencia de codigo
**TSC:** 160 (sin cambios — sprint de auditoria)

---

## VEREDICTO: MVP READINESS SCORE

# 62% — Fundacion Solida, No MVP Cercano

**Clasificacion:** 50-75% — Fundacion avanzada con gaps criticos de integracion

**Justificacion:** Todas las piezas individuales existen y son reales (no mocks). El gap principal es que el **puente entre OrderDraft y SAG Write Queue NO esta conectado** — existe un stub que siempre retorna `SAG_NOT_CONNECTED`. La infraestructura SAG es real y lista, los pedidos son reales y persisten, pero NO se hablan entre si.

---

## FASE 1 — OrderDraft

### Clasificacion: OPERATIVO

| Criterio | Estado | Evidencia |
|---|---|---|
| Tipo definido | SI | `order-types.ts:84-122` — 22 campos, incluye timeline, versions, linkedDocuments |
| Se persiste | SI | `order-service.ts:196-209` — `AgentExecution.create({ metadataJson })` |
| Se usa actualmente | SI | 13 operaciones CRUD wired en API route |
| Modelo dedicado Prisma | NO | Usa `AgentExecution` con `operation: "COMERCIAL_ORDER_DRAFT"` |

**Funciones implementadas en `order-service.ts`:**
- `createOrderDraft()` — genera consecutivo, externalSyncKey, timeline, persiste
- `getOrder()` / `listOrders()` — query + hydrate desde metadataJson
- `updateOrderDraft()` / `updateOrderLine()` — mutaciones parciales
- `submitOrder()` — transicion borrador → listo_para_enviar
- `markPendingSag()` / `markSynced()` / `markConflict()` — transiciones SAG
- `cancelOrder()` / `returnToDraft()` — lifecycle
- `checkDuplicateOrder()` — dedup via order-dedup-engine
- `getOrderStats()` — conteos por status
- `searchCustomers()` — busqueda de clientes para el wizard

**API route:** `app/api/orgs/[orgSlug]/comercial/pedidos/route.ts` — 14 acciones switcheadas por `action` field en POST body.

---

## FASE 2 — validateOrderDraft()

### Clasificacion: OPERATIVO

**Archivo:** `lib/comercial/pedidos/order-validation.ts`

**Funcion principal:** `validateOrder(draft: OrderDraft): OrderValidationResult`

**18 checks implementados:**

| # | Check | Severidad | Linea |
|---|---|---|---|
| 1 | Customer name required | error | 32-35 |
| 2 | Customer code required (para SAG) | error | 37-42 |
| 3 | Seller name required | error | 44-47 |
| 4 | Al menos 1 linea activa | error | 67-74 |
| 5 | Linea: reference code required | error | 80-85 |
| 6 | Linea: size required | error | 88-94 |
| 7 | Linea: color required | error | 96-102 |
| 8 | Linea: quantity > 0 | error | 104-110 |
| 9 | Linea: quantity <= availableUnits | warning | 114-120 |
| 10 | Inventario no sincronizado | warning | 123-130 |
| 11 | Total value > 0 | error | 142-147 |
| 12 | Total units > 0 | error | 150-156 |

**Caracteristicas:**
- Pure function — corre en client Y server (no imports de Prisma ni server-only)
- NO consulta servicios externos — valida contra campos in-memory del OrderDraft
- Stock validation depende de que `line.availableUnits` este poblado por el caller

**Usado por:** `canSendToSag()` en `sag-order-sync-service.ts:66`

**Lista para produccion:** SI — pero stock check es contra datos pre-cargados, no real-time.

---

## FASE 3 — OperationalReservation

### Clasificacion: OPERATIVO (para CRM orders) / NO CONECTADO A PEDIDOS AGENTIK

**Modelo Prisma:** EXISTE (schema.prisma linea ~5793)

**Servicio completo:** `lib/operational-inventory/order-reservation-bridge.ts`

| Operacion | Implementada | Persiste en DB | Evidencia |
|---|---|---|---|
| CREAR | SI | SI (Prisma upsert) | bridge.ts:363-403 |
| ACTUALIZAR (qty changed) | SI | SI (Prisma update) | bridge.ts:350-362 |
| EXPIRAR | SI | SI (engine + cron concept) | reservation-engine.ts |
| LIBERAR | SI | SI (Prisma update) | bridge.ts:421-436 |
| CONSUMIR | SI | SI (Prisma update) | bridge.ts:439-454 |

**Ciclo completo:** SI — El bridge tiene `syncOrderReservations()` con modos `dry_run` y `commit`. Soporta create/update/release/consume con Prisma persistence.

**PERO:** Trabaja con `OperationalOrder` (de `operational-data/operational-entities.ts`), NO directamente con `OrderDraft` del modulo pedidos. Hay un **type mismatch** que requiere un adapter.

**Cron de expiracion:** NO implementado como cron job. La funcion `expireReservations()` existe en el engine pero no hay trigger automatico.

---

## FASE 4 — Approval Engine

### Clasificacion: OPERATIVO — EN PRODUCCION

**Modelo Prisma:** EXISTE (linea ~6295)

**Servicio:** `lib/approvals/approval-service.ts`

| Capacidad | Estado | Consumidores actuales |
|---|---|---|
| Crear aprobacion | OPERATIVO | Copilot, Autonomous Ops, Finance |
| Aprobar | OPERATIVO | UI + API |
| Rechazar | OPERATIVO | UI + API (requiere comentario para HIGH/CRITICAL) |
| Cancelar | OPERATIVO | UI + API |
| Expirar | OPERATIVO | TTL-based |
| Idempotencia | OPERATIVO | `createApprovalIdempotent()` con unique constraint |
| Categorias | 8 dominios | FINANCIAL, COLLECTIONS, COMMERCIAL, INVENTORY, MARKETING, OPERATIONS, COMPLIANCE, CUSTOM |

**Conectado a pedidos:** NO DIRECTAMENTE. El approval engine es generico y PUEDE aprobar pedidos via `category: "COMMERCIAL"`, pero no hay wiring actual desde `order-service.ts` → `approval-service.ts`.

**Nota:** El SAG Write pipeline tiene su PROPIO sistema de aprobacion separado (`queue.approve()`) que NO usa el Approval Engine generico.

---

## FASE 5 — Execution Engine (AgentExecution)

### Clasificacion: OPERATIVO — EN PRODUCCION

**Modelo Prisma:** EXISTE (linea ~9187)

**Servicio:** `lib/agents/runtime/server/agent-execution-service.ts`

| Capacidad | Estado |
|---|---|
| Ejecuta acciones reales | SI — via `autonomousOperationService.executeOperationPlan()` |
| Registra eventos | SI — audit trail completo |
| Consumidores activos | SI — Copilot agents (Diego, David, Luca), Pedidos |
| Modos | PREVIEW, PLAN_ONLY, APPROVAL_REQUIRED, SAFE_AUTOMATION, ASSISTED_EXECUTION |

**Uso en Pedidos:** `order-service.ts` usa `AgentExecution` como **store** (metadataJson), NO como **executor**. Los pedidos no pasan por el execution engine para ser procesados — simplemente almacenan estado ahi.

**Conclusion:** AgentExecution es un modelo de persistencia para pedidos, no un motor de ejecucion para ellos.

---

## FASE 6 — Pipeline SAG

### Clasificacion: OPERATIVO — LISTO PARA PRODUCCION (approval-gated)

**Componentes verificados:**

| Archivo | Funcion | Real/Stub |
|---|---|---|
| `lib/sag/write/client.ts:103-155` | `insercionSag()` SOAP POST | **REAL** — fetch() a endpoint SAG |
| `lib/sag/write/queue.ts` | enqueue/approve/reject/retry/markSending/markResult | **REAL** — Prisma persistence |
| `lib/sag/write/executor.ts:64-123` | `executeOperation()` | **REAL** — calls insercionSag() |
| `lib/sag/write/xml-builders/document.ts` | `buildDocumentXml()` | **REAL** — genera XML valido |
| `lib/sag/write/validators/index.ts` | `validateDocument()` | **REAL** — 12+ checks |
| `app/api/orgs/[orgSlug]/sag/write/route.ts` | POST enqueue | **REAL** — API route activo |
| `app/api/orgs/[orgSlug]/sag/write/[id]/approve/route.ts` | Approve (MANAGER+) | **REAL** |
| `app/api/orgs/[orgSlug]/sag/write/[id]/execute/route.ts` | Execute SOAP call | **REAL** |

**Documento PE (Pedido):** Explicitamente soportado. `TIPO_DOC: "PE"` listado en comments (document.ts:29). Builder es type-agnostic — acepta cualquier TIPO_DOC.

**Tests que validan la pipeline:**
- `scripts/sag-test-enqueue.ts` — enqueue funcional, XML byte-exact
- `scripts/sag-test-approval.ts` — PENDING → APPROVED transition validada

**Ha escrito a SAG en produccion:** NO CONFIRMADO. El sistema esta diseñado para requerir aprobacion humana explicita. No hay auto-trigger.

---

## FASE 7 — Deduplicacion

### Clasificacion: OPERATIVO

**Archivo:** `lib/comercial/pedidos/order-dedup-engine.ts`

**4 estrategias implementadas:**

| # | Estrategia | Confianza | Score |
|---|---|---|---|
| 1 | `externalSyncKey` exact match | exact | 100 |
| 2 | `sagOrderId` exact match | exact | 100 |
| 3 | `crossReferenceId` match | high | 95 |
| 4 | Heuristic (customer+seller+date+lines) | medium | threshold >= 70 |

**externalSyncKey generado:** SI — `order-service.ts:163`
```typescript
const externalSyncKey = `AGK-${orgId.slice(0, 8)}-PED-${consecutivo}-${Date.now()}`;
```

**Unique constraint en DB:** NO — `AgentExecution` no tiene constraint unico para externalSyncKey. Dedup es logico via `checkDuplicateOrder()`.

**Unique constraint en SAG queue:** NO — `SagWriteOperation.sourceRef` es nullable y no tiene UNIQUE constraint.

---

## FASE 8 — Cola Completa (End-to-End)

```
Pedido Agentik (OrderWizard UI)
     ↓
  [EXISTE] — pedidos-client.tsx (47k tokens, POS wizard funcional)
     ↓
Validacion (validateOrder)
     ↓
  [EXISTE] — order-validation.ts, 18 checks, pure function
     ↓
Persistencia (AgentExecution)
     ↓
  [EXISTE] — order-service.ts:196-209, COMERCIAL_ORDER_DRAFT
     ↓
Reserva (OperationalReservation)
     ↓
  [PARCIAL] — Engine + bridge existen pero NO conectados a OrderDraft
              Trabajan con OperationalOrder (tipo diferente)
     ↓
Aprobacion (Approval Engine)
     ↓
  [NO CONECTADO] — Engine generico existe en produccion
                   Pero pedidos NO lo invocan
     ↓
Bridge → SAG Queue
     ↓
  [STUB] — sag-order-sync-service.ts EXISTE pero sendOrderToSag()
            SIEMPRE retorna { success: false, errorCode: "SAG_NOT_CONNECTED" }
            NO USA lib/sag/write/ (usa concepto REST diferente)
     ↓
SAG Write Queue (enqueue → approve → execute)
     ↓
  [EXISTE] — queue.ts + executor.ts + client.ts REALES
             Pero DESCONECTADOS del modulo pedidos
     ↓
SOAP insercionSag (type 2 = CREATE_DOCUMENT)
     ↓
  [EXISTE] — client.ts:103-155, real fetch() a SAG endpoint
     ↓
Callback → Update order status
     ↓
  [NO EXISTE] — No hay handler que al completar SagWriteOperation
                actualice el OrderDraft a "sincronizado"
     ↓
CustomerOrderRecord creation
     ↓
  [NO EXISTE] — No hay logica que cree CustomerOrderRecord post-sync
```

### Resumen pipeline:

| Paso | Estado |
|---|---|
| 1. UI Wizard | EXISTE |
| 2. Validacion | EXISTE |
| 3. Persistencia draft | EXISTE |
| 4. Reserva | PARCIAL (engine existe, no wired) |
| 5. Aprobacion | NO CONECTADO (engine existe, no wired) |
| 6. Bridge → SAG queue | **STUB** (siempre retorna SAG_NOT_CONNECTED) |
| 7. SAG Write Queue | EXISTE (independiente) |
| 8. SOAP execution | EXISTE (independiente) |
| 9. Callback post-sync | NO EXISTE |
| 10. CustomerOrderRecord | NO EXISTE |

---

## FASE 9 — Gap Real

### Gaps criticos (bloquean el flujo end-to-end)

| # | Gap | Que falta exactamente | Complejidad | Riesgo |
|---|---|---|---|---|
| 1 | **Bridge SAG real** | Reescribir `sendOrderToSag()` para usar `lib/sag/write/queue.enqueue()` en vez del stub REST | Media | Alto — es el gap principal |
| 2 | **Mapper OrderDraft → SagDocumentInput** | `buildSagOrderPayload()` existe pero genera `SagOrderPayload` (tipo propio), no `SagDocumentInput` (tipo que usa la queue). Necesita mapper: OrderDraft → `{ type: 2, payload: { TIPO_DOC: "PE", NIT, FECHA, LINEAS } }` | Baja | Bajo |
| 3 | **Callback post-sync** | Handler que al completar `SagWriteOperation` (SUCCEEDED/FAILED) actualice OrderDraft status (sincronizado/conflicto) y consuma/libere reservation | Media | Medio |
| 4 | **CustomerOrderRecord creation** | Crear registro permanente post-sync exitoso con sagDocumentId | Baja | Bajo |
| 5 | **sourceRef UNIQUE constraint** | Agregar `@@unique([organizationId, sourceRef])` a SagWriteOperation para prevenir double-enqueue | Baja (migration) | Bajo |

### Gaps medios (mejoran robustez)

| # | Gap | Que falta | Complejidad | Riesgo |
|---|---|---|---|---|
| 6 | **Reservation wiring** | Adapter `OrderDraft` → `OperationalOrder` para que el bridge funcione con pedidos Agentik | Media | Medio |
| 7 | **Reservation expiry cron** | Job que marca reservas expiradas (funcion existe, trigger no) | Baja | Bajo |
| 8 | **Approval wiring** | Decidir: usar Approval Engine generico O approval de SAG queue. No ambos. | Baja (decision) | Bajo |
| 9 | **Stock re-check pre-enqueue** | Consultar inventario SAG fresco antes de encolar (puede haber cambiado) | Media | Medio |
| 10 | **Error recovery** | Que pasa si SOAP timeout? Retry policy en executor existe (max 3) pero no hay UX de retry | Baja | Bajo |

### Gaps menores (UX/calidad)

| # | Gap | Complejidad |
|---|---|---|
| 11 | David signal on conflicto (notificar vendedor) | Baja |
| 12 | Real-time status updates en UI (polling/SSE) | Media |
| 13 | PDF generation para PE pre-envio | Baja (order-pdf-service.ts ya existe) |

---

## FASE 10 — MVP Readiness Score

### Desglose por componente

| Componente | Peso | Score | Weighted |
|---|---|---|---|
| OrderDraft (tipos + persistencia + CRUD) | 20% | 95% | 19.0 |
| Validacion | 10% | 90% | 9.0 |
| UI Wizard | 10% | 85% | 8.5 |
| Product Search | 5% | 90% | 4.5 |
| Dedup Engine | 5% | 80% | 4.0 |
| Reservation Engine | 10% | 40% | 4.0 |
| Bridge → SAG Queue | 20% | 10% | 2.0 |
| SAG Write Pipeline | 10% | 95% | 9.5 |
| Post-sync Callback | 5% | 0% | 0.0 |
| Approval Integration | 5% | 30% | 1.5 |
| **TOTAL** | **100%** | | **62%** |

### Score: 62% — Fundacion Solida

**Significado:** Los bloques estan construidos pero NO conectados entre si. La analogia es tener motor, transmision y ruedas — pero sin eje que los una.

---

## FASE 11 — Validacion de Escritura Real

### Existe hoy alguna ruta que escriba documentos reales en SAG?

## SI — pero no para pedidos.

**Flujo que escribe a SAG:**

```
POST /api/orgs/{orgSlug}/sag/write
  → queue.enqueue() [PENDING]

POST /api/orgs/{orgSlug}/sag/write/{id}/approve
  → queue.approve() [APPROVED] — requiere MANAGER+

POST /api/orgs/{orgSlug}/sag/write/{id}/execute
  → executor.executeOperation() [SENDING → SUCCEEDED/FAILED]
  → insercionSag() — SOAP POST real a SAG
```

**Evidencia:**
- API routes existen y son funcionales
- Tests validan enqueue → approve transitions
- Executor hace `fetch()` real al endpoint SAG con SOAP envelope
- UI de queue management existe (`/sag/write/page.tsx`)

**Para pedidos especificamente:** NO. El modulo pedidos tiene `sendOrderToSag()` que es un **STUB** que retorna `SAG_NOT_CONNECTED`. No invoca `lib/sag/write/queue.enqueue()`.

### Que falta para que pedidos escriban a SAG:

```typescript
// En vez de:
export async function sendOrderToSag(orgId, order) {
  return { success: false, errorCode: "SAG_NOT_CONNECTED" };  // STUB
}

// Necesita ser:
export async function sendOrderToSag(orgId, order) {
  const payload: SagWriteInput = {
    type: 2,  // CREATE_DOCUMENT
    payload: {
      TIPO_DOC: "PE",
      NIT: order.header.customerCode,
      FECHA: order.createdAt.slice(0, 10),
      VENDEDOR: order.header.sellerId,
      BODEGA: order.sourceWarehouseCode ?? "B01",
      OBSERVACION: `Pedido Agentik #${order.externalSyncKey}`,
      LINEAS: order.lines.map(l => ({
        CODIGO: l.referenceCode,
        CANTIDAD: l.quantity,
        PRECIO: l.unitPrice,
        DESCUENTO: 0,
      })),
    },
  };

  const result = await enqueue(orgId, userId, payload, {
    description: `Pedido #${order.consecutivo} — ${order.header.customerName}`,
    sourceRef: order.externalSyncKey,
  });

  return result;
}
```

**Estimacion:** ~50 lineas de codigo para el mapper + wiring. Pero requiere:
1. Decidir flujo de aprobacion (auto-approve o manual)
2. Implementar callback post-execution
3. Agregar sourceRef UNIQUE constraint

---

## FASE 12 — Respuestas Finales

### 1. Que existe realmente

| Componente | Archivos | LOC aprox |
|---|---|---|
| Order types + service | 29 archivos en `lib/comercial/pedidos/` | ~3,500 |
| SAG Write Pipeline | 8 archivos en `lib/sag/write/` | ~1,200 |
| Reservation Engine | 5 archivos en `lib/operational-inventory/` | ~800 |
| Approval Engine | 4 archivos en `lib/approvals/` | ~600 |
| Idempotency Layer | 3 archivos en `lib/idempotency/` | ~400 |
| Order API routes | 2 archivos | ~200 |
| SAG Write API routes | 4 archivos | ~300 |

### 2. Que es parcial

- **Reservation → Pedidos:** Engine completo pero tipo incompatible (OperationalOrder vs OrderDraft)
- **Approval → Pedidos:** Engine en produccion pero sin wiring desde pedidos
- **Stock check:** Valida contra `availableUnits` in-memory, no consulta SAG en tiempo real

### 3. Que es teorico (stubs/comments)

- **`sendOrderToSag()`** — STUB, siempre retorna SAG_NOT_CONNECTED
- **`getSagOrderStatus()`** — STUB, siempre retorna unknown
- **Post-sync callback** — no existe (ni como stub)
- **CustomerOrderRecord auto-creation** — no existe post-sync

### 4. Que falta

5 gaps criticos + 5 gaps medios + 3 gaps menores (ver Fase 9)

### 5. Riesgos

| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| SAG credentials no configuradas | Alta | Bloqueante | Validar config en connector antes de sprint |
| Mapper produce XML invalido para PE | Media | Alto | Usar `validateDocument()` antes de enqueue |
| Double-enqueue sin UNIQUE constraint | Media | Alto | Agregar migration antes de go-live |
| Inventario desactualizado al reservar | Alta | Medio | Stock re-check pre-enqueue |
| Timeout SOAP sin recovery | Baja | Medio | Executor ya tiene retryCount (max 3) |

### 6. MVP Readiness: 62%

### 7. Camino minimo para Pedidos Agentik → SAG

| Sprint | Entregable | Esfuerzo |
|---|---|---|
| **Sprint 1** | Mapper OrderDraft → SagDocumentInput + rewrite sendOrderToSag() para usar queue.enqueue() + sourceRef UNIQUE migration | 2-3 dias |
| **Sprint 2** | Post-sync callback (SUCCEEDED → sincronizado + consume reservation, FAILED → conflicto + release) | 1-2 dias |
| **Sprint 3** | Wiring reservation (adapter OrderDraft → OperationalOrder) + expiry cron | 2 dias |
| **Sprint 4** | Integration test end-to-end con SAG sandbox + credential validation | 1-2 dias |

**Total estimado: 2 sprints (6-9 dias de desarrollo)**

---

## Respuesta a la pregunta central

> Estamos a 1 sprint? A 3 sprints? A 10 sprints?

**Estamos a 2 sprints** de que un vendedor pueda:

1. Crear pedido en Agentik — **YA FUNCIONA**
2. Sincronizar automaticamente a SAG — **Falta bridge (1 sprint)**
3. Tener trazabilidad completa — **Falta callback + reservation (1 sprint)**
4. Eliminar el proceso manual actual — **Requiere validacion de credentials + test E2E**

**Condiciones:**
- SAG credentials (`sag_pya_soap` connector) deben estar configuradas y validadas
- SAG sandbox disponible para testing
- Documento PE aceptado por SAG sin campos adicionales custom

**El documento AGENTIK_ORDER_CAPTURE_FOUNDATION_01.md sobreestima ligeramente** al decir "solo falta order-sag-bridge.ts". En realidad faltan:
1. Bridge rewrite (no solo crear — hay que REEMPLAZAR el stub)
2. Mapper de tipos (SagOrderPayload ≠ SagDocumentInput)
3. Post-sync callback (no mencionado como gap en el doc original)
4. Reservation adapter (tipo incompatible no documentado)
5. sourceRef UNIQUE constraint (mencionado pero no enfatizado como bloqueante)

---

## Archivos clave auditados

| Archivo | Estado | Rol real |
|---|---|---|
| `lib/comercial/pedidos/order-types.ts` | OPERATIVO | 22-field OrderDraft + enums |
| `lib/comercial/pedidos/order-service.ts` | OPERATIVO | 13 CRUD ops via AgentExecution |
| `lib/comercial/pedidos/order-validation.ts` | OPERATIVO | 18 validation checks |
| `lib/comercial/pedidos/order-dedup-engine.ts` | OPERATIVO | 4 dedup strategies |
| `lib/comercial/pedidos/sag-order-sync-service.ts` | **STUB** | sendOrderToSag() siempre falla |
| `lib/comercial/pedidos/order-product-search.ts` | OPERATIVO | 3-source product search |
| `lib/sag/write/client.ts` | OPERATIVO | Real SOAP fetch() |
| `lib/sag/write/queue.ts` | OPERATIVO | Full lifecycle queue |
| `lib/sag/write/executor.ts` | OPERATIVO | Calls insercionSag() |
| `lib/sag/write/xml-builders/document.ts` | OPERATIVO | PE supported |
| `lib/operational-inventory/order-reservation-bridge.ts` | OPERATIVO | Full sync cycle |
| `lib/operational-inventory/operational-reservation-engine.ts` | OPERATIVO | Pure domain engine |
| `lib/approvals/approval-service.ts` | OPERATIVO | Production approval engine |
| `lib/idempotency/idempotency-key.ts` | OPERATIVO | Key builders |
| `app/api/orgs/[orgSlug]/comercial/pedidos/route.ts` | OPERATIVO | 14 API actions |
| `app/api/orgs/[orgSlug]/sag/write/route.ts` | OPERATIVO | SAG enqueue endpoint |
| `app/api/orgs/[orgSlug]/sag/write/[id]/execute/route.ts` | OPERATIVO | Real SOAP trigger |
