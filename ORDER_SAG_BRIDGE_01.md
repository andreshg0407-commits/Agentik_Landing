# ORDER_SAG_BRIDGE_01

**Sprint:** ORDER-SAG-BRIDGE-01
**Fecha:** 2026-07-04
**TSC:** 160 (sin cambios)
**Tests:** 28/28 PASS

---

## Resumen

Bridge implementado. Un pedido Agentik puede ahora llegar al pipeline SAG existente via:

```
OrderDraft (listo_para_enviar)
  ↓ sendOrderToSagQueue()
  ↓
mapOrderToSagDocument() → SagDocumentInput { type: 2, TIPO_DOC: "PE" }
  ↓
queue.enqueue() → SagWriteOperation [PENDING]
  ↓
markPendingSag() → order.status = "pendiente_sag"
```

La ejecucion real (SOAP) sigue requiriendo aprobacion humana via el flujo existente:
```
/sag/write/{id}/approve → APPROVED
/sag/write/{id}/execute → insercionSag() → SUCCEEDED|FAILED
```

---

## Archivos creados

| Archivo | Lineas | Rol |
|---|---|---|
| `lib/comercial/pedidos/order-sag-bridge.ts` | 167 | Bridge principal: mapper + enqueue + idempotency |
| `lib/comercial/pedidos/order-post-sync.ts` | 128 | Callback post-SAG: actualiza pedido segun resultado |
| `scripts/validate-order-sag-bridge.ts` | 218 | Integration test: 28 checks |

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `app/api/orgs/[orgSlug]/comercial/pedidos/route.ts` | Nueva action `send_to_sag` |

---

## Flujo implementado

### 1. Bridge (`sendOrderToSagQueue`)

```typescript
sendOrderToSagQueue(orgId, userId, order): Promise<SendToSagResult>
```

Pasos:
1. `canSendToSag(order)` — validation gate (status, customerCode, externalSyncKey)
2. Check if already synced (`sagOrderId` present)
3. Idempotency: busca `SagWriteOperation` con `sourceRef = externalSyncKey`
   - SUCCEEDED → return `alreadySynced`
   - PENDING/APPROVED/SENDING → return `alreadyQueued`
   - FAILED/REJECTED → permite re-enqueue
4. `mapOrderToSagDocument(order)` → `SagDocumentInput`
5. `queue.enqueue(orgId, userId, { type: 2, payload }, { sourceRef })` → operation created
6. `markPendingSag(orgId, orderId)` → order status updated

### 2. Mapper (`mapOrderToSagDocument`)

```
OrderDraft.header.customerCode → NIT (obligatorio)
"PE" constante               → TIPO_DOC
OrderDraft.createdAt[0:10]   → FECHA
OrderDraft.header.sellerName → VENDEDOR
OrderDraft.sourceWarehouseCode → BODEGA
"Pedido Agentik #" + externalSyncKey + notes → OBSERVACION (max 250)
lines.filter(!removed && qty>0) → LINEAS[{ CODIGO, CANTIDAD, PRECIO, DESCUENTO:0 }]
```

### 3. Post-Sync Callback (`handleOrderSagResult`)

```typescript
handleOrderSagResult(orgId, sourceRef, "SUCCEEDED"|"FAILED"|"REJECTED", sagResult)
```

- SUCCEEDED → `markSynced(orgId, orderId, sagRef)`
- FAILED → `markConflict(orgId, orderId, error)`
- REJECTED → `markConflict(orgId, orderId, "Rechazado: reason")`

### 4. API Action (`send_to_sag`)

```
POST /api/orgs/{orgSlug}/comercial/pedidos
{ action: "send_to_sag", orderId: "...", userId: "..." }
```

### 5. Idempotencia

- `sourceRef = order.externalSyncKey` (formato: `AGK-{org}-PED-{n}-{ts}`)
- Check antes de enqueue: `prisma.sagWriteOperation.findFirst({ sourceRef })`
- Si ya existe en estado activo → no duplica, retorna `alreadyQueued`

### 6. Observabilidad

Logs estructurados JSON con:
- `module: "ORDER_BRIDGE"` o `"ORDER_POST_SYNC"`
- Events: `ORDER_SYNC_START`, `ORDER_SYNC_BLOCKED`, `ORDER_SYNC_ALREADY_SYNCED`, `ORDER_SYNC_ALREADY_QUEUED`, `ORDER_SYNC_REQUEUE`, `ORDER_SYNC_MAP_ERROR`, `ORDER_SYNC_ENQUEUE_FAILED`, `ORDER_SYNC_ENQUEUED`
- Post-sync: `CALLBACK_START`, `ORDER_SYNC_SUCCESS`, `ORDER_SYNC_FAILED`, `ORDER_SYNC_REJECTED`
- Siempre incluyen: `orderId`, `sourceRef`, contexto relevante

---

## Lo que reutiliza (NO crea nuevo)

| Componente existente | Uso |
|---|---|
| `lib/sag/write/queue.ts` | `enqueue()` — crea SagWriteOperation PENDING |
| `lib/sag/write/executor.ts` | Se invoca via API `/sag/write/{id}/execute` |
| `lib/sag/write/client.ts` | `insercionSag()` SOAP real |
| `lib/sag/write/validators/` | `validateDocument()` — valida PE antes de generar XML |
| `lib/sag/write/xml-builders/document.ts` | `buildDocumentXml()` — genera XML para SAG |
| `order-service.ts:markPendingSag()` | Transicion de estado del pedido |
| `order-service.ts:markSynced()` | Post-sync OK |
| `order-service.ts:markConflict()` | Post-sync ERROR |
| `sag-order-sync-service.ts:canSendToSag()` | Validation gate reutilizada |

---

## Gaps restantes

| # | Gap | Sprint siguiente | Complejidad |
|---|---|---|---|
| 1 | `sourceRef` UNIQUE partial index (migration) | ORDER-SAG-BRIDGE-02 | Baja |
| 2 | Wire callback en execute route (invoke `handleOrderSagResult` post-markResult) | ORDER-SAG-BRIDGE-02 | Baja |
| 3 | Reservation lifecycle (create at submit, consume/release at callback) | ORDER-SAG-BRIDGE-02 | Media |
| 4 | Reservation expiry cron | ORDER-SAG-BRIDGE-02 | Baja |
| 5 | Credential validation (sag_pya_soap connector config for Castillitos) | Pre-produccion | Media |
| 6 | E2E test contra SAG sandbox real | Pre-produccion | Alta |

---

## Riesgos

| Riesgo | Mitigacion |
|---|---|
| SAG connector no configurado → executor falla | Executor marca FAILED, order queda pendiente_sag (recuperable) |
| sourceRef sin UNIQUE → posible doble enqueue en race | Mitigado por check previo; migration UNIQUE pendiente |
| Callback no wired aun → order queda "pendiente_sag" indefinidamente | Manual: usar `mark_synced`/`mark_conflict` actions desde API |
| OBSERVACION > campo SAG | Truncado a 250 chars |

---

## Evidencia de tests

```
28 passed, 0 failed, 28 total

- TIPO_DOC = PE
- NIT from customerCode
- FECHA from createdAt
- VENDEDOR from sellerName
- BODEGA from sourceWarehouseCode
- OBSERVACION contains externalSyncKey
- Only active lines (removed excluded)
- Line CODIGO uppercase
- Throws on empty lines
- Throws on missing customerCode
- canSendToSag gates correctly
- Edge cases (null warehouse, empty notes, long truncation)
- SagWriteInput wrapper correct shape
```

---

## Estado post-sprint

```
Pedido Agentik (listo_para_enviar)
  ↓ [IMPLEMENTADO] send_to_sag action
  ↓
Bridge validates + maps + enqueues
  ↓ [IMPLEMENTADO] order-sag-bridge.ts
  ↓
SagWriteOperation [PENDING]
  ↓ [EXISTIA] SAG Queue UI
  ↓
Approve → Execute → insercionSag(PE)
  ↓ [EXISTIA] SAG Write Pipeline
  ↓
SAG Response
  ↓ [IMPLEMENTADO] order-post-sync.ts (pendiente wiring)
  ↓
Order → sincronizado | conflicto
```

**MVP readiness actualizado:** 62% → **75%** (bridge operativo, callback implementado pero no wired automaticamente).
