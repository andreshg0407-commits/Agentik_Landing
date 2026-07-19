# ORDER_SAG_BRIDGE_DESIGN_01

**Sprint:** ORDER-SAG-BRIDGE-DESIGN-01
**Fecha:** 2026-07-04
**Tipo:** Blueprint tecnico — sin codigo
**TSC:** 160 (sin cambios)

---

## FASE 1 — Documento SAG Destino

### Respuesta: PE (Pedido)

**Evidencia:** `lib/sag/write/xml-builders/document.ts:30`
```
* Common TIPO_DOC values:
*   PE  = Pedido
```

**Tipo de escritura SAG:** `type: 2` (CREATE_DOCUMENT)

**Riesgo SAG:** HIGH (irreversible sin NC)

**Razon:** PE es el documento comercial correcto. Crear directamente una FV (Factura) seria fiscalmente incorrecto — el flujo SAG es `PE → Despacho → FV`. Agentik solo crea PE; SAG maneja el ciclo posterior.

**XML destino:**
```xml
<DOCUMENTOS>
  <DOCUMENTO>
    <TIPO_DOC>PE</TIPO_DOC>
    <NIT>900123456</NIT>
    <FECHA>2026-07-04</FECHA>
    <VENDEDOR>CARLOS GARCIA</VENDEDOR>
    <BODEGA>B01</BODEGA>
    <OBSERVACION>Pedido Agentik #AGK-clx9ab12-PED-0042-1720108800000</OBSERVACION>
    <DETALLE>
      <ITEM>
        <CODIGO>REF001-T38-NEGRO</CODIGO>
        <CANTIDAD>10</CANTIDAD>
        <PRECIO>45000</PRECIO>
        <DESCUENTO>0</DESCUENTO>
        <BODEGA>B01</BODEGA>
      </ITEM>
    </DETALLE>
  </DOCUMENTO>
</DOCUMENTOS>
```

---

## FASE 2 — Mapeo Completo

### OrderDraft → SagDocumentInput

```
┌─────────────────────────────────┐       ┌────────────────────────────────┐
│         OrderDraft               │       │       SagDocumentInput          │
├─────────────────────────────────┤       ├────────────────────────────────┤
│ header.customerCode       ──────────────→ NIT          (obligatorio)     │
│ [constante "PE"]          ──────────────→ TIPO_DOC     (obligatorio)     │
│ createdAt.slice(0,10)     ──────────────→ FECHA        (obligatorio)     │
│ header.sellerName         ──────────────→ VENDEDOR     (opcional)        │
│ sourceWarehouseCode ?? "B01" ───────────→ BODEGA       (opcional)        │
│ `Pedido Agentik #${externalSyncKey}` ──→ OBSERVACION  (calculado)       │
│ [omitido]                 ──────────────→ NUMERO_DOC   (SAG auto-asigna) │
│                                 │       │                                │
│ lines[] ────────────────────────────────→ LINEAS[]                       │
│   .referenceCode          ──────────────→   .CODIGO    (obligatorio)     │
│   .quantity               ──────────────→   .CANTIDAD  (obligatorio)     │
│   .unitPrice              ──────────────→   .PRECIO    (obligatorio)     │
│   [0 por defecto]         ──────────────→   .DESCUENTO (opcional, 0-100) │
│   sourceWarehouseCode     ──────────────→   .BODEGA    (opcional)        │
│   .removed === true       ──────────────→   [EXCLUIDA del array]         │
└─────────────────────────────────┘       └────────────────────────────────┘
```

### Detalle campo por campo

#### Cliente

| Campo Agentik | Campo SAG | Obligatorio | Notas |
|---|---|---|---|
| `header.customerCode` | `NIT` | SI | NIT sin puntos, sin DV. Formato: 9 digitos |
| `header.customerId` | — | NO va a SAG | ID interno Agentik, solo para trazabilidad |
| `header.customerName` | — | NO va a SAG | Solo para OBSERVACION legibilidad |

**Regla:** `customerCode` DEBE ser el NIT limpio. Si el usuario solo tiene nombre, el pedido NO puede ir a SAG (validation gate).

#### Vendedor

| Campo Agentik | Campo SAG | Obligatorio | Notas |
|---|---|---|---|
| `header.sellerName` | `VENDEDOR` | NO (pero recomendado) | SAG acepta nombre del vendedor |
| `header.sellerId` | — | NO va a SAG | ID interno |

**Nota:** SAG permite VENDEDOR como texto libre. El vendedor SAG se identifica por nombre, no por codigo.

#### Pedido (header)

| Campo Agentik | Campo SAG | Obligatorio | Notas |
|---|---|---|---|
| — | `TIPO_DOC` | SI | Siempre "PE" (constante) |
| — | `NUMERO_DOC` | NO | Omitir — SAG auto-asigna consecutivo |
| `createdAt` | `FECHA` | SI | Formato YYYY-MM-DD (primer 10 chars de ISO) |
| `sourceWarehouseCode` | `BODEGA` | NO | Default: "B01" si null |
| `externalSyncKey` | `OBSERVACION` | CALCULADO | `"Pedido Agentik #" + externalSyncKey` |
| `header.notes` | — | Incluir en OBSERVACION | Concatenar al final si no vacio |

**OBSERVACION final:**
```
Pedido Agentik #AGK-clx9ab12-PED-0042-1720108800000 | Notas: texto libre del vendedor
```

#### Lineas

| Campo Agentik | Campo SAG | Obligatorio | Notas |
|---|---|---|---|
| `referenceCode` | `CODIGO` | SI | Codigo SAG del articulo (uppercase) |
| `quantity` | `CANTIDAD` | SI | Entero > 0 |
| `unitPrice` | `PRECIO` | SI | Precio unitario COP (sin IVA) |
| — | `DESCUENTO` | NO | Default 0. Futuro: si hay descuento por cliente/volumen |
| `sourceWarehouseCode` | `BODEGA` | NO | Hereda de header si no especifico por linea |

**Filtro:** Solo lineas con `removed === false` y `quantity > 0`.

### Tipo final para el mapper

```typescript
interface OrderToSagMapper {
  input:  OrderDraft;
  output: { type: 2; payload: SagDocumentInput };
}
```

---

## FASE 3 — Inventario

### Momento exacto de validacion

```
[1] Wizard — agregar linea        → CHECK disponibilidad (informativo, warning)
[2] Submit borrador → listo       → CHECK hard (validateOrder)
[3] Pre-enqueue (bridge)          → RE-CHECK (puede haber cambiado)
[4] SAG response                  → SAG valida definitivamente
```

### Detalle por momento

| Momento | Tipo | Fuente | Consecuencia si falla |
|---|---|---|---|
| [1] Agregar linea | Soft — warning | `ProductInventoryLevel.quantity` (Prisma) | UI muestra warning amarillo |
| [2] Submit | Hard — block | `line.availableUnits` in-memory | No transiciona a `listo_para_enviar` |
| [3] Pre-enqueue | Hard — block | Query fresca a SAG inventory snapshot | No encola. Retorna a `listo_para_enviar` con razon |
| [4] SAG response | Definitivo | SAG ERP | Si falla → `conflicto` |

### Implementacion del momento [3]

```
bridge.prepareForSag(order):
  1. Para cada linea activa:
     a. Consultar CommercialCoverageSnapshot (ultimo disponible)
     b. Restar reservas activas de otros pedidos (OperationalReservation WHERE status=active)
     c. net = snapshot.disponible - SUM(active reservations for same ref)
     d. Si order.quantity > net → BLOQUEAR con razon especifica
  2. Si todas pasan → continuar al enqueue
```

**No se requiere:** Validar reemplazos, accesorios ni minimos en V1. Solo disponibilidad bruta.

---

## FASE 4 — Reserva

### Lifecycle

```
[Draft]
  ↓ (no reservation — pedido editable)

[Listo para enviar]
  ↓ submitOrder()
  ↓
[Reservation Created] ← MOMENTO DE NACIMIENTO
  ↓ status: "active", TTL: 24h
  ↓ sourceType: "order", sourceId: AgentExecution.id
  ↓
[Enqueued in SAG queue]
  ↓ Reservation permanece activa
  ↓
[SAG SUCCEEDED] → consumeReservation() → status: "consumed"
[SAG FAILED]    → releaseReservation() → status: "released"
[TTL expires]   → expireReservation()  → status: "expired"
[User cancels]  → cancelReservation()  → status: "cancelled"
```

### Reglas

| Evento | Accion sobre reserva |
|---|---|
| `submitOrder()` | CREATE reservation por cada linea activa |
| `cancelOrder()` | CANCEL todas las reservas del pedido |
| `returnToDraft()` | RELEASE todas (el vendedor quiere editar) |
| SAG SUCCEEDED | CONSUME todas |
| SAG FAILED | RELEASE todas |
| 24h sin actividad | EXPIRE via cron |
| Qty cambia antes de enqueue | UPDATE reservation (qtyReserved = new qty) |

### Adapter necesario

El bridge `order-reservation-bridge.ts` ya existe pero trabaja con `OperationalOrder`. Se necesita un adapter minimo:

```typescript
function orderDraftToOperationalOrder(draft: OrderDraft): OperationalOrder {
  return {
    id:          draft.id,
    sourceId:    draft.id,
    reference:   `PED-${draft.consecutivo}`,
    status:      mapOrderStatusToOperational(draft.status),
    salesRepId:  draft.header.sellerId,
    customerId:  draft.header.customerId,
    lines:       draft.lines.filter(l => !l.removed).map(l => ({
      reference:    l.referenceCode.toUpperCase(),
      qtyOrdered:   l.quantity,
      qtyCancelled: 0,
    })),
  };
}

function mapOrderStatusToOperational(s: OrderStatus): OperationalOrder["status"] {
  switch (s) {
    case "borrador":          return "draft";
    case "listo_para_enviar": return "confirmed";
    case "pendiente_sag":     return "sent_to_erp";
    case "sincronizado":      return "fulfilled";
    case "conflicto":         return "confirmed"; // still holds
    case "cancelado":         return "cancelled";
  }
}
```

### Cuando nace: Al llamar `submitOrder()` (borrador → listo_para_enviar)
### Cuando expira: 24h desde creacion (configurable por tenant)
### Cuando se libera: Cancel, returnToDraft, SAG FAILED, expiry

---

## FASE 5 — Aprobaciones

### Decision: Usar aprobacion de SAG Write Queue (no Approval Engine generico)

**Razon:** El SAG Write Queue YA tiene approval lifecycle (PENDING → APPROVED → execute). Usar un segundo sistema de aprobacion seria redundante y confuso.

### Reglas de aprobacion

| Condicion | Requiere aprobacion manual | Auto-approve |
|---|---|---|
| Descuento > 15% | SI — MANAGER+ | — |
| Valor total > $10,000,000 COP | SI — MANAGER+ | — |
| Cliente con cartera > 90 dias | SI — MANAGER+ | — |
| Cliente bloqueado en SAG | SI — ORG_ADMIN | — |
| Pedido normal (sin flags) | — | SI (V2) |

### Flujo V1 (conservative)

```
OrderDraft (listo_para_enviar)
  ↓
bridge.enqueueForSag()
  ↓
SagWriteOperation → status: PENDING (siempre)
  ↓
UI SAG Queue → Revisor ve pedido pendiente
  ↓
[Approve] → APPROVED → puede ejecutarse
[Reject]  → REJECTED → order → conflicto, reservation released
```

### Flujo V2 (auto-approve para pedidos normales)

```
bridge.enqueueForSag()
  ↓
evaluateAutoApproval(order):
  - discount <= 15%
  - total <= 10M
  - customer not blocked
  - cartera < 90d
  ↓ all pass?
    YES → queue.enqueue() + queue.approve() atomico
    NO  → queue.enqueue() solamente (queda PENDING)
```

**V1 es suficiente para MVP.** Auto-approve es mejora posterior.

---

## FASE 6 — Pipeline de Ejecucion

### Flujo exacto

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. TRIGGER                                                              │
│    UI: Vendedor presiona "Enviar a SAG"                                 │
│    API: POST /api/orgs/{orgSlug}/comercial/pedidos  action: "send_to_sag" │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ 2. PRE-FLIGHT VALIDATION (bridge)                                        │
│    a. canSendToSag(order) — status, fields, externalSyncKey              │
│    b. checkDuplicateOrder(order) — dedup engine 4 strategies             │
│    c. inventoryReCheck(order) — fresh snapshot vs reserved               │
│    d. Si FALLA → return { ok: false, reason } — NO encola               │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ 3. MAP + ENQUEUE                                                         │
│    a. mapOrderToSagInput(order) → SagWriteInput { type: 2, payload: PE } │
│    b. queue.enqueue(orgId, userId, input, {                              │
│         description: `Pedido #${order.consecutivo} — ${customerName}`,   │
│         sourceRef: order.externalSyncKey,                                │
│       })                                                                 │
│    c. Si enqueue.ok → guardar operationId en order                       │
│    d. order.status → "pendiente_sag"                                     │
│    e. timeline.push({ event: "enqueued_for_sag", sagOperationId })       │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ 4. APPROVAL GATE (SAG Queue UI)                                          │
│    Revisor ve operacion PENDING en /sag/write                            │
│    Puede inspeccionar XML generado                                       │
│    [Aprobar] → status: APPROVED                                          │
│    [Rechazar] → status: REJECTED → callback                             │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ 5. EXECUTION                                                             │
│    POST /api/orgs/{orgSlug}/sag/write/{operationId}/execute              │
│    executor.executeOperation():                                          │
│      a. Load connector config (sag_pya_soap)                             │
│      b. markSending() — APPROVED → SENDING                               │
│      c. insercionSag(config, type=2, xml) — SOAP POST real               │
│      d. Parse response → SagWriteResponse { raw, ok, message, sagRef }   │
│      e. markResult() — SENDING → SUCCEEDED | FAILED                      │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ 6. POST-SYNC CALLBACK                                                    │
│    (ver FASE 9)                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Estados del pedido durante el pipeline

```
listo_para_enviar → [bridge validates] → pendiente_sag → [SAG responds]
                                                              ↓
                                                    sincronizado | conflicto
```

### Logs y eventos

| Paso | Evento timeline | Log structured |
|---|---|---|
| Pre-flight OK | `validation_passed` | `{ checks: [...], passed: true }` |
| Enqueued | `enqueued_for_sag` | `{ sagOperationId, xml_size }` |
| Approved | `sag_approved` | `{ approvedBy, approvedAt }` |
| Rejected | `sag_rejected` | `{ rejectedBy, reason }` |
| Sending | `sag_sending` | `{ sentAt }` |
| Succeeded | `sag_succeeded` | `{ sagRef, raw }` |
| Failed | `sag_failed` | `{ error, retryCount }` |

---

## FASE 7 — Respuesta SAG

### Patrones de respuesta observados

SAG retorna un string plano en `insercionSagResult`:

| Patron | ok | sagRef | Significado |
|---|---|---|---|
| `"OK"` | true | — | Documento creado (sin numero echo) |
| `"OK: 12345"` | true | `"12345"` | Documento creado, numero asignado |
| `"ERROR: NIT invalido"` | false | — | Error de datos |
| `"ERROR: Articulo no existe"` | false | — | Referencia invalida |
| `"FALLIDO: ..."` | false | — | Error de procesamiento |
| [timeout/network error] | throw | — | Executor catches → FAILED |

### Manejo por escenario

#### Caso A — Documento creado (OK)

```
SAG: "OK: 54321"
→ order.sagOrderId = "54321"
→ order.status = "sincronizado"
→ order.syncState = "sincronizado"
→ order.lastSyncAt = now
→ reservation.status = "consumed"
→ timeline.push({ event: "sag_succeeded", sagOrderId: "54321" })
→ Crear CustomerOrderRecord (enlace permanente)
```

#### Caso B — Cliente invalido

```
SAG: "ERROR: NIT invalido" | "ERROR: NIT no existe"
→ order.status = "conflicto"
→ order.sagError = "NIT invalido — verificar codigo cliente en SAG"
→ reservation.status = "released" (liberar stock)
→ timeline.push({ event: "sag_failed", error: "NIT invalido" })
→ David signal: "Pedido #42 rechazado — cliente no existe en SAG"
```

#### Caso C — Referencia invalida

```
SAG: "ERROR: Articulo no existe"
→ order.status = "conflicto"
→ order.sagError = "Articulo no encontrado en SAG — verificar codigos de referencia"
→ reservation.status = "released"
→ timeline.push({ event: "sag_failed", error: "Articulo no existe" })
→ order puede volver a "borrador" para corregir refs
```

#### Caso D — Inventario insuficiente (SAG-side)

```
SAG: "ERROR: Cantidad insuficiente" | "ERROR: Stock agotado"
→ order.status = "conflicto"
→ order.sagError = "Stock insuficiente en SAG (diferencia vs snapshot local)"
→ reservation.status = "released"
→ timeline.push({ event: "sag_failed", error: "Stock insuficiente" })
→ Invalida snapshot local (marca como stale)
```

#### Caso E — Timeout

```
fetch() throws: AbortError / ETIMEDOUT
→ executor catches → markFailed(operationId, "Timeout de conexion con SAG")
→ order.status PERMANECE "pendiente_sag" (NO va a conflicto)
→ reservation.status PERMANECE "active" (NO se libera)
→ SagWriteOperation.status = "FAILED", retryCount += 1
→ Puede reintentarse hasta MAX_RETRIES (3)
→ Si 3 reintentos fallan → order → "conflicto", reservation → "released"
```

#### Caso F — SOAP fault (XML malformado, auth error)

```
SAG response is SOAP fault or 500:
→ executor catches → markFailed(operationId, error.message)
→ Mismo tratamiento que timeout
→ Diferencia: si es auth error, no tiene sentido reintentar automaticamente
→ Log: { error: "SOAP fault", detail: raw_response }
```

### Tabla resumen de acciones

| Escenario | Order status | Reservation | Retry? |
|---|---|---|---|
| OK | sincronizado | consumed | — |
| NIT invalido | conflicto | released | NO (data error) |
| Articulo invalido | conflicto | released | NO (data error) |
| Stock insuficiente | conflicto | released | NO (state changed) |
| Timeout | pendiente_sag | active (kept) | SI (hasta 3x) |
| SOAP fault | pendiente_sag | active (kept) | SI (hasta 3x) |
| 3 retries failed | conflicto | released | NO (terminal) |

---

## FASE 8 — Idempotencia

### Estrategia de 4 capas

```
Capa 1: UI (doble click)
  ↓ Button disabled after first click
  ↓ Optimistic state → pendiente_sag

Capa 2: API (retry del mismo request)
  ↓ checkDuplicateOrder() — 4 strategies
  ↓ Si externalSyncKey ya existe en queue → return existing operationId

Capa 3: SAG Queue (double enqueue)
  ↓ sourceRef = externalSyncKey
  ↓ UNIQUE constraint: (organizationId, sourceRef) WHERE sourceRef IS NOT NULL
  ↓ Si viola constraint → return existing operation

Capa 4: SAG ERP (double execution)
  ↓ OBSERVACION contiene externalSyncKey
  ↓ Si SAG ya proceso → deberia rechazar como duplicado
  ↓ Si SAG no dedup nativo → depender de capas 1-3
```

### Relacion entre keys

```
externalSyncKey (Agentik)     = AGK-clx9ab12-PED-0042-1720108800000
  ↕ (stored as)
sourceRef (SagWriteOperation) = AGK-clx9ab12-PED-0042-1720108800000
  ↕ (included in)
OBSERVACION (SAG XML)         = "Pedido Agentik #AGK-clx9ab12-PED-0042-1720108800000"
  ↕ (SAG returns)
sagRef (from response)        = "54321" (SAG's own consecutive number)
  ↕ (stored as)
sagOrderId (OrderDraft)       = "54321"
```

### Constraint DB requerido

```sql
-- Migration: add_source_ref_unique_to_sag_write_operation
CREATE UNIQUE INDEX "SagWriteOperation_orgId_sourceRef_key"
  ON "SagWriteOperation" ("organizationId", "sourceRef")
  WHERE "sourceRef" IS NOT NULL;
```

**Partial unique index:** Solo aplica cuando sourceRef NO es null (las operaciones de customer/product upsert no usan sourceRef).

### Pre-enqueue dedup check

```typescript
// Antes de queue.enqueue():
const existing = await prisma.sagWriteOperation.findFirst({
  where: { organizationId, sourceRef: order.externalSyncKey },
});

if (existing) {
  if (existing.status === "SUCCEEDED") {
    // Ya fue procesado exitosamente — marcar order como sincronizado
    return { alreadyProcessed: true, operationId: existing.id };
  }
  if (existing.status === "PENDING" || existing.status === "APPROVED" || existing.status === "SENDING") {
    // En vuelo — no encolar de nuevo
    return { inFlight: true, operationId: existing.id };
  }
  // FAILED o REJECTED — permitir re-enqueue (nuevo intento)
}
```

---

## FASE 9 — Post-Sync

### Flujo completo post-SAG

```
SagWriteOperation.status → SUCCEEDED
  ↓
[1] Actualizar pedido
    order.status = "sincronizado"
    order.syncState = "sincronizado"
    order.sagOrderId = sagResponse.sagRef
    order.lastSyncAt = new Date().toISOString()
    order.sagError = null

  ↓
[2] Guardar documento SAG
    order.linkedDocuments.push({
      documentType: "PE",
      sagDocumentId: sagResponse.sagRef,
      sagStatus: "active",
      createdAt: now,
    })

  ↓
[3] Cerrar reserva
    Para cada linea del pedido:
      reservation.status = "consumed"
      reservation.qtyConsumed = reservation.qtyReserved

  ↓
[4] Timeline
    order.timeline.push({
      event: "sag_sync_completed",
      timestamp: now,
      detail: { sagOrderId, sagResponse: raw },
    })

  ↓
[5] Version
    order.versions.push({
      version: versions.length + 1,
      changedAt: now,
      changedBy: "system:sag_sync",
      changes: ["status: pendiente_sag → sincronizado"],
    })

  ↓
[6] CustomerOrderRecord (enlace permanente)
    CustomerOrderRecord.create({
      organizationId,
      customerNit: order.header.customerCode,
      documentType: "PE",
      documentNumber: sagResponse.sagRef,
      date: order.createdAt,
      total: order.summary.totalValue,
      sellerCode: order.header.sellerId,
      agentikOrderId: order.id,
      externalSyncKey: order.externalSyncKey,
      status: "active",
    })

  ↓
[7] Notificacion (David signal)
    buildDavidSignal({
      type: "order_synced",
      title: `Pedido #${order.consecutivo} sincronizado`,
      detail: `SAG asigno numero ${sagResponse.sagRef}`,
      severity: "info",
      vendedorId: order.header.sellerId,
    })
```

### Flujo post-SAG FAILED

```
SagWriteOperation.status → FAILED (terminal, 3 retries agotados)
  ↓
[1] order.status = "conflicto"
    order.sagError = lastError
  ↓
[2] reservation.status = "released" (todas las lineas)
  ↓
[3] timeline.push({ event: "sag_sync_failed", error: lastError })
  ↓
[4] David signal: severity "warning"
```

### Flujo post-SAG REJECTED (aprobador rechaza)

```
SagWriteOperation.status → REJECTED
  ↓
[1] order.status = "conflicto"
    order.sagError = `Rechazado: ${rejectionReason}`
  ↓
[2] reservation.status = "released"
  ↓
[3] timeline.push({ event: "sag_rejected", reason })
  ↓
[4] David signal: "Pedido rechazado por revisor"
```

---

## FASE 10 — Observabilidad

### Por pedido (OrderDraft view)

| Metrica | Fuente | Calculo |
|---|---|---|
| Estado actual | `order.status` | Directo |
| Intentos SAG | `SagWriteOperation.retryCount` WHERE sourceRef = externalSyncKey | Query |
| Ultimo error | `order.sagError` | Directo |
| Fecha sync | `order.lastSyncAt` | Directo |
| Documento SAG | `order.sagOrderId` | Directo |
| Tiempo en cola | `SagWriteOp.initiatedAt` vs `executedAt` | Delta |
| Operation ID | Guardado en timeline event | Directo |

### Panel operativo (aggregated)

```typescript
interface OrderSyncHealthMetrics {
  // Conteos
  pendingOrders:      number;  // status = pendiente_sag
  conflictOrders:     number;  // status = conflicto
  syncedToday:        number;  // lastSyncAt > today 00:00

  // Performance
  avgSyncTimeMs:      number;  // initiatedAt → executedAt avg (last 30d)
  p95SyncTimeMs:      number;  // percentile 95

  // Quality
  successRate:        number;  // SUCCEEDED / (SUCCEEDED + FAILED) last 30d
  retryRate:          number;  // operations with retryCount > 0
  rejectionRate:      number;  // REJECTED / total last 30d

  // Reservations
  activeReservations: number;  // status = active, sourceType = order
  expiredToday:       number;  // expired last 24h (leak indicator)

  // Queue
  queueDepth:         number;  // PENDING + APPROVED SagWriteOperations
  oldestPending:      string;  // initiatedAt of oldest PENDING
}
```

### Alertas operativas

| Condicion | Severidad | Accion |
|---|---|---|
| Pending > 24h sin aprobar | warning | Notificar MANAGER |
| 3+ conflictos consecutivos | critical | Revisar connector config |
| Reservation expired (TTL) | warning | Pedido abandonado — notificar vendedor |
| Queue depth > 10 | warning | Backlog de aprobaciones |
| Success rate < 80% (7d) | critical | Revisar datos maestros SAG |

---

## FASE 11 — MVP Plan

### Sprint 1: Bridge + Mapper (3 dias)

**Objetivo:** Pedido puede ir de `listo_para_enviar` → cola SAG

| Tarea | Complejidad | Riesgo |
|---|---|---|
| Migration: sourceRef partial UNIQUE index | Baja | Bajo |
| Rewrite `sag-order-sync-service.ts:sendOrderToSag()` | Media | Medio |
| Implement `mapOrderToSagInput()` (OrderDraft → SagDocumentInput) | Baja | Bajo |
| Pre-enqueue dedup check (buscar sourceRef existente) | Baja | Bajo |
| Wire en API route: nueva action `send_to_sag` | Baja | Bajo |
| Update `markPendingSag()` para guardar sagOperationId | Baja | Bajo |
| Test: enqueue produces valid XML for PE | Baja | Bajo |

**Dependencias:** Migration debe deployear antes del codigo.

**Riesgo principal:** SAG connector credentials (`sag_pya_soap`) deben existir y estar activas.

### Sprint 2: Post-Sync + Callback (2 dias)

**Objetivo:** Respuesta SAG actualiza pedido automaticamente

| Tarea | Complejidad | Riesgo |
|---|---|---|
| Post-sync callback service (SUCCEEDED → sincronizado) | Media | Bajo |
| Post-sync callback service (FAILED terminal → conflicto) | Baja | Bajo |
| Post-sync callback service (REJECTED → conflicto) | Baja | Bajo |
| Wire callback en execute route (after markResult) | Baja | Bajo |
| Create CustomerOrderRecord post-sync | Baja | Bajo |
| David signal for vendedor notification | Baja | Bajo |
| Test: full cycle mock SUCCEEDED | Media | Bajo |

**Dependencias:** Sprint 1 completado.

**Decision:** El callback se ejecuta sincrono dentro del execute route (no event-driven). Esto simplifica V1.

### Sprint 3: Reservations + Integration Test (3 dias)

**Objetivo:** Stock reservado durante pipeline, E2E validado

| Tarea | Complejidad | Riesgo |
|---|---|---|
| Adapter OrderDraft → OperationalOrder | Baja | Bajo |
| Wire: submitOrder() → syncOrderReservations(mode: "commit") | Media | Medio |
| Wire: post-sync callback → consume/release reservations | Baja | Bajo |
| Cron: expire reservations > 24h | Baja | Bajo |
| Integration test: enqueue → approve → execute (SAG sandbox) | Alta | Alto |
| Validate SAG credentials work for type 2 | Media | Alto |

**Dependencias:** Sprint 2 completado. SAG sandbox access.

**Riesgo principal:** Primera escritura real a SAG. Requiere coordinacion con equipo SAG.

### Timeline total

```
Sprint 1 (dias 1-3)  → Bridge funcional, pedido llega a cola
Sprint 2 (dias 4-5)  → Respuesta SAG actualiza todo automaticamente
Sprint 3 (dias 6-8)  → Reservas + test real contra SAG

Total: 8 dias de desarrollo
```

---

## Blueprint Tecnico Definitivo

### Archivos a crear/modificar

| Archivo | Accion | Sprint |
|---|---|---|
| `prisma/migrations/XXXXXXXX_source_ref_unique/` | CREAR — partial unique index | 1 |
| `lib/comercial/pedidos/sag-order-sync-service.ts` | REWRITE — reemplazar stub | 1 |
| `lib/comercial/pedidos/sag-order-mapper.ts` | CREAR — OrderDraft → SagDocumentInput | 1 |
| `app/api/orgs/[orgSlug]/comercial/pedidos/route.ts` | EDITAR — nueva action `send_to_sag` | 1 |
| `lib/comercial/pedidos/order-service.ts` | EDITAR — guardar sagOperationId | 1 |
| `lib/comercial/pedidos/sag-order-callback.ts` | CREAR — post-sync handler | 2 |
| `app/api/orgs/[orgSlug]/sag/write/[id]/execute/route.ts` | EDITAR — invoke callback | 2 |
| `lib/comercial/pedidos/order-reservation-adapter.ts` | CREAR — OrderDraft → OperationalOrder | 3 |
| `app/api/cron/expire-reservations/route.ts` | CREAR — cron handler | 3 |

### Interfaz del Bridge (contrato final)

```typescript
// lib/comercial/pedidos/sag-order-sync-service.ts (rewritten)

export interface SendToSagResult {
  ok:              boolean;
  sagOperationId?: string;
  alreadyQueued?:  boolean;
  alreadySynced?:  boolean;
  error?:          string;
  reason?:         string;
}

export async function sendOrderToSag(
  orgId:  string,
  userId: string,
  order:  OrderDraft,
): Promise<SendToSagResult>;
```

### Interfaz del Mapper

```typescript
// lib/comercial/pedidos/sag-order-mapper.ts

import type { SagWriteInput, SagDocumentInput } from "@/lib/sag/write/types";
import type { OrderDraft } from "./order-types";

export function mapOrderToSagInput(order: OrderDraft): SagWriteInput;
// Returns: { type: 2, payload: SagDocumentInput }
```

### Interfaz del Callback

```typescript
// lib/comercial/pedidos/sag-order-callback.ts

export async function handleOrderSagResult(
  organizationId: string,
  sourceRef:      string,    // externalSyncKey
  result:         "SUCCEEDED" | "FAILED" | "REJECTED",
  sagResponse?:   { sagRef?: string; raw?: string; error?: string },
): Promise<void>;
```

---

## Condiciones previas (antes de Sprint 1)

1. **SAG connector activo:** `Connector WHERE source = "sag_pya_soap" AND organizationId = castillitos` debe existir con token valido
2. **Bodega default conocida:** Confirmar codigo bodega principal (probablemente "B01" o "001")
3. **Vendedor format:** Confirmar si SAG espera nombre completo o codigo en campo VENDEDOR
4. **NIT format:** Confirmar: 9 digitos sin DV, sin puntos (ej: "900123456")
5. **Precio:** Confirmar: unitario sin IVA, en COP, sin decimales

---

## Resumen de decisiones cerradas

| # | Decision | Alternativa descartada | Razon |
|---|---|---|---|
| 1 | Documento = PE | FV (factura), CO (cotizacion) | PE es pre-fiscal, FV requiere despacho previo |
| 2 | NUMERO_DOC omitido | Asignar consecutivo Agentik | SAG debe manejar su propio consecutivo |
| 3 | Approval via SAG Queue | Approval Engine generico | Evitar doble aprobacion, SAG queue ya tiene UI |
| 4 | V1 siempre PENDING | Auto-approve condicional | Conservative para primer release |
| 5 | Callback sincrono | Event-driven / webhook | Simplicidad V1, no hay infra de eventos |
| 6 | Reservation al submit | Reservation al enqueue | Submit es el compromiso del vendedor |
| 7 | Timeout = mantener active | Timeout = release | Permite retry sin re-reservar |
| 8 | sourceRef partial UNIQUE | Full UNIQUE | Otros write types no usan sourceRef |
