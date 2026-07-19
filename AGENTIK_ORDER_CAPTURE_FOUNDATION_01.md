# AGENTIK_ORDER_CAPTURE_FOUNDATION_01

**Sprint:** AGENTIK-ORDER-CAPTURE-FOUNDATION-01
**Fecha:** 2026-07-04
**Tipo:** Documento de arquitectura (sin cambios de codigo)
**TSC:** 160 (sin cambios)

---

## Resumen ejecutivo

Este documento describe como un pedido nace en Agentik, se valida contra inventario, reserva stock, se sincroniza con SAG, y previene duplicados. La infraestructura existente cubre ~85% del flujo. El gap principal es un **bridge service** que conecte el OrderDraft finalizado con el pipeline SAG write.

---

## 1. Como nace un pedido en Agentik

### Flujo actual

```
Vendedor (POS UI) → OrderWizard → OrderDraft (in-memory)
                                        ↓
                              AgentExecution.metadataJson (persist)
                                        ↓
                              CustomerOrderRecord (post-SAG)
```

### Componentes existentes

| Capa | Archivo | Rol |
|---|---|---|
| Tipos | `lib/comercial/pedidos/order-types.ts` | `OrderDraft`, `OrderStatus`, `OrderLine` |
| Validacion | `lib/comercial/pedidos/order-validation.ts` | `validateOrderDraft()`, `computeOrderSummary()` |
| Busqueda producto | `lib/comercial/pedidos/order-product-search.ts` | Busca inventario SAG por texto/codigo |
| Tipos producto | `lib/comercial/pedidos/order-product-types.ts` | `ProductSearchResult`, `ProductVariant` |
| Servicio | `lib/comercial/pedidos/order-service.ts` | `getOrder()`, `crmQuoteToOrderDraft()` |
| API | `app/api/orgs/[orgSlug]/comercial/pedidos/route.ts` | CRUD de pedidos |
| API productos | `app/api/orgs/[orgSlug]/comercial/pedidos/products/route.ts` | Busqueda de productos |
| UI | `app/(app)/[orgSlug]/comercial/pedidos/pedidos-client.tsx` | Wizard POS-style |

### Estados del pedido

```
borrador → listo_para_enviar → pendiente_sag → sincronizado
                                      ↓              ↓
                                  conflicto      cancelado
```

- **borrador**: Vendedor esta editando. Puede agregar/quitar lineas.
- **listo_para_enviar**: Validacion pasada. Esperando aprobacion si aplica.
- **pendiente_sag**: Encolado en SAG write queue. Reserva activa.
- **sincronizado**: SAG respondio OK. `CustomerOrderRecord` creado.
- **conflicto**: SAG rechazo (stock insuficiente, NIT invalido, etc).
- **cancelado**: Usuario cancelo antes de sync.

### Persistencia actual

Los pedidos se almacenan como `AgentExecution` con:
- `actionType = "order_capture"`
- `metadataJson` = serialized `OrderDraft`
- `status` = maps to `OrderStatus`

**Nota:** No existe un modelo Prisma dedicado `Order`. El sprint futuro ORDER-MODEL-01 puede migrar a modelo propio si el volumen justifica queries directas.

---

## 2. Validacion de inventario

### Fuente de verdad

Inventario vive en SAG (ERP). Se consulta via:

```typescript
// lib/integrations/sag/catalog/articles — SAG inventory query
// Retorna: SagInventoryItem { ref, description, qty, bodega, talla, color }
```

### Reglas de validacion

```typescript
// lib/comercial/pedidos/order-validation.ts
validateOrderDraft(draft: OrderDraft): ValidationResult

// Checks:
// 1. Al menos 1 linea con cantidad > 0
// 2. Cliente asignado (NIT valido)
// 3. Vendedor asignado
// 4. Bodega definida
// 5. Cada linea: ref existe, qty <= disponible (si stock check habilitado)
```

### Validacion en tiempo real vs diferida

| Momento | Tipo | Que valida |
|---|---|---|
| Agregar linea (POS) | Tiempo real | Producto existe, stock > 0 |
| Submit borrador | Sincrona | Todas las reglas |
| Pre-SAG enqueue | Diferida | Re-check stock (puede haber cambiado) |

---

## 3. Reserva de inventario

### Modelo existente: `OperationalReservation`

```prisma
model OperationalReservation {
  id             String   @id @default(cuid())
  organizationId String
  sourceType     String   // "order_capture"
  sourceId       String   // OrderDraft.id (AgentExecution.id)
  reference      String   // product ref (e.g. "SAG-REF-001-T38-NEGRO")
  qtyReserved    Int
  qtyReleased    Int      @default(0)
  qtyConsumed    Int      @default(0)
  status         String   // active | released | consumed | expired | cancelled
  expiresAt      DateTime
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([organizationId, sourceType, sourceId, reference])
}
```

### Lifecycle de la reserva

```
Order submitted → createReservation(status: "active", expiresAt: +24h)
                        ↓
        SAG sync OK → consumeReservation(status: "consumed")
        SAG reject  → releaseReservation(status: "released")
        Timeout     → expireReservation(status: "expired") [cron]
        User cancel → cancelReservation(status: "cancelled")
```

### Reglas

- **TTL:** 24 horas por defecto. Configurable por tenant.
- **Soft reserve:** No bloquea en SAG. Solo reserva logica en Agentik.
- **Conflict:** Si SAG rechaza por stock, la reserva se libera y el pedido pasa a `conflicto`.
- **No over-reserve:** `SUM(qtyReserved - qtyReleased - qtyConsumed) WHERE status=active` no puede exceder stock disponible para la misma ref.

---

## 4. Sincronizacion con SAG

### Infraestructura existente

```
lib/sag/write/
├── client.ts          → insercionSag() SOAP call
├── queue.ts           → enqueue/approve/reject/retry/markSending/markResult
├── executor.ts        → processNextPending() dequeue + execute
├── types.ts           → SagDocumentInput, SagWriteOperation
└── xml-builders/
    └── document.ts    → buildDocumentXml() for PE/FV/CO/NC/ND/RE
```

### Shape del documento SAG para Pedido (PE)

```typescript
const sagInput: SagDocumentInput = {
  TIPO_DOC: "PE",           // Pedido
  NIT: "900123456",         // Cliente NIT
  FECHA: "2026-07-04",     // Fecha del pedido
  VENDEDOR: "V001",        // Codigo vendedor SAG
  BODEGA: "B01",           // Bodega principal
  OBSERVACION: "Pedido Agentik #AGK-abc12345-PED-0001",
  LINEAS: [
    { CODIGO: "REF001", CANTIDAD: 10, PRECIO: 45000, DESCUENTO: 0 },
    { CODIGO: "REF002", CANTIDAD: 5,  PRECIO: 32000, DESCUENTO: 10 },
  ],
};
```

### Pipeline de envio

```
OrderDraft (listo_para_enviar)
    ↓
[Bridge Service] — PENDIENTE DE IMPLEMENTAR
    ↓
SagWriteOperation (status: "pending_approval")
    ↓
Aprobacion (manual o automatica segun politica)
    ↓
SagWriteOperation (status: "approved")
    ↓
executor.processNextPending()
    ↓
insercionSag(xml, type=2) → SOAP → SAG ERP
    ↓
Response: { success, documentId, errors }
    ↓
SagWriteOperation (status: "completed" | "failed")
    ↓
Callback → Update OrderDraft status + consume/release reservation
    ↓
CustomerOrderRecord.create() (if success)
```

### Bridge Service (GAP PRINCIPAL)

**No existe.** Este es el componente que debe crearse:

```typescript
// lib/comercial/pedidos/order-sag-bridge.ts (PROPUESTO)

export async function enqueueOrderForSag(
  orgSlug: string,
  orderId: string,       // AgentExecution.id
  draft: OrderDraft,
): Promise<{ operationId: string }> {
  // 1. Map OrderDraft → SagDocumentInput
  const sagInput = mapOrderToSagDocument(draft);

  // 2. Enqueue in SAG write queue
  const op = await enqueue({
    organizationId: draft.organizationId,
    documentType: "PE",
    payload: sagInput,
    sourceRef: draft.externalSyncKey, // idempotency
    sourceType: "order_capture",
    sourceId: orderId,
  });

  // 3. Update order status
  // draft.status → "pendiente_sag"

  return { operationId: op.id };
}
```

### Callback post-SAG

```typescript
// Execution callback (already supported by executor.ts pattern)
async function onSagResult(operation: SagWriteOperation) {
  if (operation.status === "completed") {
    // 1. Update order → "sincronizado"
    // 2. Consume reservation
    // 3. Create CustomerOrderRecord with SAG documentId
  } else if (operation.status === "failed") {
    // 1. Update order → "conflicto"
    // 2. Release reservation
    // 3. Build David signal for commercial team
  }
}
```

---

## 5. Prevencion de duplicados

### Mecanismo: `externalSyncKey`

```
Format: AGK-{orgId[0:8]}-PED-{consecutivo}-{timestamp}
Example: AGK-clx9ab12-PED-0042-1720108800000
```

### Puntos de dedup

| Punto | Mecanismo | Que previene |
|---|---|---|
| UI submit | Disable button + optimistic lock | Double-click |
| API route | Check `AgentExecution` by `externalSyncKey` | Retry del mismo request |
| SAG queue | `sourceRef` uniqueness en `SagWriteOperation` | Re-enqueue del mismo pedido |
| SAG ERP | OBSERVACION contiene key, SAG dedup interno | Doble insercion en ERP |

### Gap: `sourceRef` uniqueness

Actualmente `SagWriteOperation` no tiene constraint UNIQUE en `sourceRef`. Se requiere:

```prisma
// Propuesto — agregar a SagWriteOperation
@@unique([organizationId, sourceRef])
```

Esto garantiza que un mismo `externalSyncKey` no pueda generar dos operaciones SAG.

### Idempotency en retry

Si `insercionSag()` falla por timeout (no por rechazo), el executor puede reintentar porque:
1. Mismo XML con mismo `externalSyncKey` en OBSERVACION
2. SAG puede dedup por NIT + FECHA + OBSERVACION (depende de config ERP)
3. El `SagWriteOperation.retryCount` trackea intentos

---

## 6. Diagrama de flujo completo

```
┌─────────────────────────────────────────────────────────────────┐
│                        VENDEDOR (POS UI)                         │
└────────────────────────────────┬────────────────────────────────┘
                                 │ Crea pedido
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  OrderWizard (pedidos-client.tsx)                                │
│  - Busca productos (order-product-search.ts)                    │
│  - Agrega lineas                                                │
│  - Selecciona cliente, bodega                                   │
└────────────────────────────────┬────────────────────────────────┘
                                 │ Submit
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  validateOrderDraft() — order-validation.ts                     │
│  - Lineas > 0, cliente, vendedor, bodega                        │
│  - Stock check (opcional)                                       │
└────────────────────────────────┬────────────────────────────────┘
                                 │ Valid
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  Persist: AgentExecution.metadataJson = OrderDraft               │
│  Status: "listo_para_enviar"                                    │
│  externalSyncKey: AGK-{org}-PED-{n}-{ts}                        │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  createReservation() — OperationalReservation                   │
│  - 1 row per linea (ref + qty)                                  │
│  - TTL 24h                                                      │
│  - Status: "active"                                             │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  enqueueOrderForSag() — order-sag-bridge.ts [PENDIENTE]         │
│  - Map OrderDraft → SagDocumentInput (PE)                       │
│  - sourceRef = externalSyncKey (dedup)                          │
│  - Status pedido → "pendiente_sag"                              │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  SAG Write Queue (lib/sag/write/queue.ts)                       │
│  - pending_approval → approved (auto or manual)                 │
│  - executor.processNextPending()                                │
│  - insercionSag(xml, type=2)                                    │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                        ┌────────┴────────┐
                        ▼                 ▼
                   SUCCESS             FAILURE
                        │                 │
                        ▼                 ▼
              ┌──────────────┐   ┌──────────────┐
              │ sincronizado │   │  conflicto   │
              │ + consume    │   │  + release   │
              │   reserve    │   │    reserve   │
              │ + create     │   │  + David     │
              │   CustOrder  │   │    signal    │
              └──────────────┘   └──────────────┘
```

---

## 7. Que queda pendiente

### Prioridad ALTA (bloquean el flujo)

| # | Item | Esfuerzo | Dependencia |
|---|---|---|---|
| 1 | `order-sag-bridge.ts` — Bridge service | 1 sprint | Ninguna |
| 2 | `sourceRef` UNIQUE constraint en `SagWriteOperation` | Migration | DBA review |
| 3 | Callback handler post-SAG para pedidos | 1 dia | Bridge service |
| 4 | Reservation creation al submit (wire into API route) | 1 dia | Ninguna |
| 5 | Reservation expiry cron (cleanup expired) | 1 dia | Ninguna |

### Prioridad MEDIA (mejoran confiabilidad)

| # | Item | Esfuerzo | Dependencia |
|---|---|---|---|
| 6 | Stock re-check pre-enqueue (may have changed since wizard) | 2 dias | SAG inventory API |
| 7 | Approval policy engine (auto-approve < X monto) | 2 dias | Business rules |
| 8 | David signal on conflicto (notify vendedor) | 1 dia | Copilot wiring |
| 9 | Retry policy (max 3, exponential backoff) | Existe en executor | Config |

### Prioridad BAJA (mejoran UX)

| # | Item | Esfuerzo | Dependencia |
|---|---|---|---|
| 10 | Dedicated `Order` Prisma model (replace AgentExecution) | 1 sprint | Volume justification |
| 11 | Real-time status push (WebSocket/SSE) | 2 dias | Infra |
| 12 | PDF generation for PE | 1 dia | Template |
| 13 | Bulk order import (Excel → multiple OrderDrafts) | 1 sprint | Validation rules |

---

## 8. Decisiones de arquitectura

| Decision | Rationale |
|---|---|
| Usar `AgentExecution` como store (no modelo nuevo) | Ya funciona, tiene audit trail, evita migration risk |
| Soft reserve (no SAG lock) | SAG no soporta reservas. Lock logico en Agentik suficiente para volumen actual |
| 24h TTL en reservas | Balance entre dar tiempo al flujo de aprobacion y no bloquear stock indefinidamente |
| `externalSyncKey` como idempotency | Formato deterministico, no depende de respuesta SAG |
| PE como tipo documento SAG | Pedido es el documento comercial correcto. FV (Factura) se genera despues en SAG |
| Auto-approve para montos < umbral | Reduce friccion para pedidos rutinarios. Umbral configurable por tenant |
| Bridge como servicio separado | Desacopla logica de pedidos de logica SAG. Testeable independientemente |

---

## 9. Seguridad y tenant isolation

- Toda operacion verifica `organizationId` match
- `OperationalReservation` scoped por `organizationId`
- `SagWriteOperation` scoped por `organizationId`
- SAG credentials resueltas por tenant via connector config
- `externalSyncKey` incluye `orgId[0:8]` para evitar colisiones cross-tenant
- Approval chain respeta RBAC del tenant

---

## 10. Metricas de salud operativa

Post-implementacion, el modulo debe exponer:

```typescript
interface OrderCaptureHealth {
  pendingOrders: number;        // status = pendiente_sag
  avgSyncTimeMs: number;        // time from submit to sincronizado
  conflictRate: number;         // conflictos / total last 30d
  reservationUtilization: number; // consumed / (consumed + expired + released)
  queueDepth: number;           // SagWriteOperations pending
}
```

Consumible por: Dashboard Ejecutivo, Diego (finance copilot), David (commercial copilot).

---

## Archivos referenciados

| Archivo | Existe | Rol |
|---|---|---|
| `lib/comercial/pedidos/order-types.ts` | SI | Domain types |
| `lib/comercial/pedidos/order-validation.ts` | SI | Validation rules |
| `lib/comercial/pedidos/order-service.ts` | SI | Order operations |
| `lib/comercial/pedidos/order-product-search.ts` | SI | Product search |
| `lib/comercial/pedidos/order-product-types.ts` | SI | Product types |
| `lib/sag/write/client.ts` | SI | SOAP client |
| `lib/sag/write/queue.ts` | SI | Queue operations |
| `lib/sag/write/executor.ts` | SI | Dequeue + execute |
| `lib/sag/write/types.ts` | SI | SAG types |
| `lib/sag/write/xml-builders/document.ts` | SI | XML builder |
| `lib/comercial/pedidos/order-sag-bridge.ts` | NO | **PENDIENTE** — Bridge service |
| `app/api/orgs/[orgSlug]/comercial/pedidos/route.ts` | SI | API CRUD |
| `app/api/orgs/[orgSlug]/comercial/pedidos/products/route.ts` | SI | Product search API |
