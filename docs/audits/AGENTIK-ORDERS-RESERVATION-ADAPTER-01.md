# AGENTIK-ORDERS-RESERVATION-ADAPTER-01

**Sprint:** Reservation Adapter — OrderDraft <-> OperationalReservation
**Tenant:** Castillitos
**Fecha:** 2026-07-23

---

## 1. Objetivo

Conectar el ciclo de vida del pedido (OrderDraft) al sistema de reservas operacionales
(OperationalReservation), de modo que guardar un borrador cree reservas reales que
descuenten del inventario disponible, y cancelar/eliminar un pedido las libere.

**Principio central:** Las reservas NO son best-effort. Cada operacion retorna un
resultado tipado (`OrderReservationOperationResult`) que el caller DEBE inspeccionar.
Errores y conflictos se surfacean al usuario, nunca se silencian.

---

## 2. Archivos creados/modificados

| Archivo | Accion | Descripcion |
|---|---|---|
| `lib/comercial/pedidos/order-reservation-adapter-core.ts` | NUEVO | Funciones puras: adapter, tipos, extractConflicts, classifySyncStatus |
| `lib/comercial/pedidos/order-reservation-adapter.ts` | NUEVO | Orquestador server-side: syncReservationsForDraft, releaseReservationsForOrder |
| `lib/comercial/pedidos/order-service.ts` | MODIFICADO | 6 mutaciones retornan OrderMutationResult + enforceReservationPolicy() |
| `lib/operational-inventory/order-reservation-bridge.ts` | MODIFICADO | Advisory locks + transaction + self-reservation fix + cancelled guard |
| `app/api/orgs/[orgSlug]/comercial/pedidos/route.ts` | MODIFICADO | Destructuring { order, reservation } |
| `app/api/cron/reservation-expiry/route.ts` | NUEVO | Cron TTL executor — expira reservas stale cada 30 min |
| `app/(app)/[orgSlug]/comercial/pedidos/pedidos-client.tsx` | MODIFICADO | Reservation alert banner (success/conflict/error) |
| `lib/comercial/pedidos/__tests__/order-reservation-adapter.integration.test.ts` | NUEVO | 30 integration tests CLI contra PostgreSQL real |
| `lib/comercial/pedidos/__tests__/stub-server-only.js` | NUEVO | Stub para server-only en CLI tests |
| `scripts/validate-order-sag-lifecycle.ts` | MODIFICADO | Adaptar a OrderMutationResult |
| `vercel.json` | MODIFICADO | Nuevo cron: reservation-expiry cada 30 min |
| `lib/comercial/pedidos/__tests__/order-reservation-adapter.test.ts` | NUEVO | 87 unit tests / 28 suites |

---

## 3. Arquitectura

```
OrderDraft (wizard)
    | adaptOrderDraftToOperationalOrder()  [adapter-core.ts]
    v
OperationalOrder (operational model)
    | syncOrderReservations()  [order-reservation-bridge.ts]
    |   └── prisma.$transaction() + pg_advisory_xact_lock()
    v
OperationalReservation (Prisma)
    |
    v
operationalAvailableQty (deducted from physical snapshot)
```

### Separacion core / adapter

- `order-reservation-adapter-core.ts` — funciones puras (sin `server-only`, sin Prisma).
- `order-reservation-adapter.ts` — orquestador server-side (con `server-only`).

### Return type contract

```typescript
type OrderMutationResult = {
  order: OrderDraft | null;
  reservation?: OrderReservationOperationResult;
};
```

---

## 4. Advisory Lock Certification (SEGUNDO)

### Funcion PostgreSQL

```sql
SELECT pg_advisory_xact_lock(hashtext($1))
```

### Transaction-level vs session-level

**Transaction-level (`pg_advisory_xact_lock`).** El lock se libera automaticamente
cuando la transaccion hace commit o rollback. No requiere liberacion manual.
No se usa `pg_advisory_lock` (session-level) porque requiere `pg_advisory_unlock`
explicito y corre el riesgo de leak en caso de error.

### Derivacion de la llave

```typescript
const lockKey = `${organizationId}:reservation:${reference}`;
// hashtext() convierte string → int4 (32 bits con signo)
// pg_advisory_xact_lock acepta int4 o bigint
```

**Formato:** `"org-id:reservation:REF-001"` → `hashtext()` → int4

### Riesgo de colision

`hashtext()` produce int4 (2^32 valores posibles). En caso de colision de hash,
dos referencias distintas serian serializadas juntas — esto no causa error,
solo serializacion innecesaria (mas lento, nunca incorrecto).

### Ejecucion Prisma

Se usa `$executeRaw` (no `$queryRaw`) porque `pg_advisory_xact_lock` retorna
`void` y Prisma no puede deserializar `void` con `$queryRaw`.

### Orden de adquisicion

Las referencias se ordenan alfabeticamente (`allRefs.sort()`) antes de adquirir locks.
Esto previene deadlocks: si Order A y Order B necesitan locks para REF-001 y REF-002,
ambos los adquieren en el mismo orden (REF-001 primero, REF-002 despues).

### Dos pedidos con mismas referencias en distinto orden

No es un problema. Las referencias se recolectan del order + reservas existentes,
se deduplicancon Set, y se ordenan con `.sort()`. El orden de las lineas del pedido
es irrelevante — la adquisicion de locks siempre sigue el orden canonico.

### Timeout

`prisma.$transaction(..., { timeout: 15000 })` — 15 segundos. Si el lock no se
obtiene en ese tiempo, la transaccion falla con timeout error. El caller recibe
`PERSISTENCE_ERROR` con `retryable: true`.

### Rollback

En caso de rollback (error en la transaccion), todos los advisory locks adquiridos
se liberan automaticamente por PostgreSQL. Las filas de reserva no se persisten.
El sistema vuelve al estado anterior sin locks huerfanos.

### Unidad de lock

`organizationId + reference`. NO se bloquea globalmente todo el tenant.
Cada referencia es un lock independiente. Dos pedidos para referencias distintas
pueden ejecutarse en paralelo sin contention.

No se usa warehouse/policy scope adicional porque el stock operacional es per-reference
sin desglose por bodega en el layer de reservas.

---

## 5. Mapeo de estados

| OrderStatus | -> OperationalOrder.status | Bridge action |
|---|---|---|
| `borrador` | `reserved` | create_or_update |
| `listo_para_enviar` | `confirmed` | create_or_update (revalidate, NOT consume) |
| `pendiente_sag` | `processing` | create_or_update |
| `sincronizado` | `sent_to_erp` | consume (ONLY on real SAG success) |
| `cancelado` | `cancelled` | release |
| `conflicto` | `reserved` | create_or_update |

---

## 6. FULL/PARTIAL Enforcement (D5)

### Funcion canonica

```typescript
export function enforceReservationPolicy(
  reservation: OrderReservationOperationResult | undefined,
  scope: "full" | "partial",
): { allowed: true } | { allowed: false; reason: string; conflicts?: ReservationConflict[] }
```

Ubicacion: `order-service.ts`. Invocada por `submitOrder()` y disponible para
cualquier endpoint futuro que confirme pedidos. **No confiar en UI.**

### Reglas FULL

- CONFLICT: bloqueado. Todas las referencias deben estar disponibles.
- PERSISTENCE_ERROR: bloqueado. No confirmar sin verificacion.
- EXPIRED: bloqueado. Guardar nuevamente para renovar.
- NO_INVENTORY_DATA: bloqueado. Verificar sincronizacion.
- undefined (sin data): bloqueado (fail-closed).

### Reglas PARTIAL

- CONFLICT: permitido. El pedido avanza con las cantidades reservadas.
- PERSISTENCE_ERROR: bloqueado (igual que FULL).
- EXPIRED: bloqueado (igual que FULL).
- NO_INVENTORY_DATA: bloqueado (igual que FULL).

### Donde se aplica

| Punto | Enforcement |
|---|---|
| `submitOrder()` | `enforceReservationPolicy(reservation, scope)` |
| `createOrderDraft()` | Reserva surfaceada, no bloqueada (borrador puede tener conflictos) |
| `updateOrderDraft()` | Reserva surfaceada, no bloqueada |
| Futuros endpoints (app vendedores) | Deben llamar `enforceReservationPolicy()` |

### Tests

- Suite 26: 7 tests cubren todos los branches (FULL block, PARTIAL allow, errors, undefined)
- Integration T24-T26: ejercitan la funcion con tipos reales

---

## 7. Option B Semantics (Transaccional)

### Decision

Order y reservation tienen transacciones independientes.

### Que ocurre si se guarda el pedido y falla la reserva

1. **El pedido permanece como borrador.**
2. **`sagError` documenta la falla:** `"Reserva bloqueada: [razon]"`
3. **No puede confirmarse:** `enforceReservationPolicy()` lo bloquea.
4. **Puede reintentarse:** `reservation.retryable: true` para errores de persistencia.
5. **La UI informa:** Banner amarillo o rojo con detalle del error.
6. **`reservationStatus` NO se persiste en el pedido** — solo se retorna en el API response.
7. **Al reabrir:** El service consulta `OperationalReservation` activas para el orderId.
   Si no hay reservas activas, el borrador aparece sin proteccion.

### Por que no Option A

Option A (atomica) requeriria pasar `tx` por toda la cadena order-service → adapter → bridge.
El refactor seria masivo y el riesgo de regresion alto. Los safeguards de Option B
(submit revert, enforcement, UI feedback) cubren los escenarios de fallo.

---

## 8. TTL Cron — Seguridad (QUINTO)

### Archivo: `app/api/cron/reservation-expiry/route.ts`

| Requisito | Estado |
|---|---|
| Auth via CRON_SECRET | SI — header, query param, y Bearer token |
| Rechaza no autorizados | SI — 401 |
| No acepta orgId del cliente | SI — procesa todos los tenants internamente |
| Global por lotes seguros | SI — batch de 100 |
| No revela datos de reservas | SI — solo conteos por org |
| Limita tiempo | SI — `maxDuration: 60` |
| Idempotente | SI — WHERE `status: "active"` skip ya expirados |
| consumed/released no cambian | SI — WHERE `status: "active"` excluye otros estados |
| Secreto no en vercel.json | SI — solo el schedule, secreto en env vars |

### vercel.json

```json
{ "path": "/api/cron/reservation-expiry", "schedule": "0,30 * * * *" }
```

30 minutos corresponde al TTL de 24 horas: worst case una reserva vive 24h 29m.

### Ejecuciones concurrentes

El batch usa `findMany + update individual`. Si dos ejecuciones corren en paralelo:
- La primera actualiza `status: "expired"`
- La segunda no encuentra nada (`WHERE status: "active"`) — noop
- No hay duplicacion ni error

---

## 9. Variant Identity — Case A Per-Reference (SEXTO)

### Decision aceptada provisionalmente

- SAG/CCS manejan disponibilidad agregada por referencia
- OperationalReservation protege total de referencia
- Talla/color en metadata para auditoria
- No se garantiza bloqueo independiente por talla/color

### UI language verificado

La UI dice:
- `"REF-001"` — referencia, no variante
- `"Solicitado: X"` / `"Disponible: X"` / `"Faltante: X"` — totales por referencia
- **NO dice:** "Talla M reservada" / "Color azul bloqueado"

### Metadata preservada

```typescript
OperationalOrderLine.metadata = {
  size: "38",
  color: "NEGRO",
  lineId: "line-uuid",
}
```

Al reabrir, la distribucion se reconstruye desde `OrderLine`, pero el motor
controla el total agregado por referencia.

---

## 10. Self-reservation fix

```typescript
const allActiveExcludingSelf = allActive.filter(
  r => !(r.sourceType === "order" && r.sourceId === order.sourceId),
);
```

Al editar un pedido existente, sus propias reservas no se restan de la disponibilidad.

---

## 11. Cancelled order guard fix

```typescript
const globalAction = getReservationActionForOrderStatus(order.status);
if (order.lines.length === 0 && globalAction !== "release") {
  return result; // Only skip if NOT releasing
}
```

Pedidos cancelados tienen `lines: []` — el guard ahora permite la liberacion.

---

## 12. Cobertura de tests

### Unit tests: 87 tests / 28 suites / 0 failures

| # | Suite | Tests |
|---|---|---|
| 1 | Adapter basic mapping | 7 |
| 2 | Line aggregation | 3 |
| 3 | Excluded lines | 5 |
| 4 | Idempotency key | 3 |
| 5 | Tenant isolation | 1 |
| 6 | Variant identity | 2 |
| 7 | Per-talla isolation | 2 |
| 8 | FULL vs PARTIAL | 2 |
| 9 | Conflict extraction | 3 |
| 10 | SIMULATION no consume | 2 |
| 11 | Empty order | 2 |
| 12 | Self-reservation identity | 2 |
| 13 | Seller optionality | 2 |
| 14 | OrderReservationOperationResult | 5 |
| 15 | Submit semantics | 2 |
| 16 | Variant identity detailed | 4 |
| 17 | FULL/PARTIAL enforcement | 2 |
| 18 | Error handling | 3 |
| 19 | Concurrency wrapper intents | 4 |
| 20 | TTL expiration engine | 6 |
| 21 | Cancelled order releases | 2 |
| 22 | Wizard feedback | 4 |
| 23 | FULL scope | 2 |
| 24 | PARTIAL scope | 2 |
| 25 | Case A certified | 3 |
| 26 | enforceReservationPolicy (D5) | 7 |
| 27 | Option B semantics | 3 |
| 28 | UI language contract | 2 |

### Integration tests: 30 tests / PostgreSQL real

| # | Test | Tipo |
|---|---|---|
| T01-T03 | Creacion real | Persistencia |
| T04-T05 | Idempotencia real | Persistencia |
| T06-T07 | Actualizacion real | Persistencia |
| T08-T10 | Self-reservation | Logica |
| T11-T13 | Concurrencia real (advisory locks) | Concurrencia |
| T14-T16 | Liberacion + idempotencia | Persistencia |
| T17-T19 | Expiracion TTL | Lifecycle |
| T20-T21 | Consumo (mock SAG) | Lifecycle |
| T22-T23 | Aislamiento multi-tenant | Seguridad |
| T24-T26 | FULL/PARTIAL enforcement | Logica |
| T27-T28 | Cron auth + fail-closed | Seguridad |
| T29 | Option B semantics | Contrato |
| T30 | Cleanup verificado | Limpieza |

Ejecutar:

```bash
export DATABASE_URL=... && npx tsx --require ./lib/comercial/pedidos/__tests__/stub-server-only.js \
  --test lib/comercial/pedidos/__tests__/order-reservation-adapter.integration.test.ts
```

Guards:
- `NODE_ENV !== "production"` — aborta inmediatamente
- `DATABASE_URL` requerido — aborta si no existe
- Orgs de test: `__test_reservation_org_a`, `__test_reservation_org_b`
- Setup: crea Organization rows temporales
- Cleanup: `after()` elimina todas las reservas y orgs de test

### Evidencia de ejecucion real (2026-07-23)

```
DB: postgresql://***@ep-wild-sun-ai3sopsj-pooler.c-4.us-east-1.aws.neon.tech/neondb
tests 30, suites 14, pass 30, fail 0, duration 28743ms

T01: reservation created OK
T02: reference=REF-T001 qty=3 status=active expiresAt=2026-07-24T18:04:48.716Z
T04: count after re-sync = 1
T05: row ID preserved = res_1784829888716_lkck26r
T06: qtyReserved updated to 7
T09: order-t01 holds full stock = 10/10
T10: order-t02 requested=3, got=0, warnings=1
T10: total active reserved for REF-T001 = 10 (stock=10)

T11 CONCURRENCY METRICS:
  stock=10, A requested=7, B requested=6
  A reserved=7, B reserved=0
  sum=7 (must be <= 10)
  duration=1295ms
  deadlocks=0

T14: released — status=released
T16: re-release = noop
T17: expired — status=expired qtyReleased=5
T18: re-run found 0 active expired — idempotent
T20: consumed — status=consumed
T21: re-consume = noop
T22: org B created reservation independently
T23: org B unaffected — qtyReserved=8
T24: FULL blocks — reason="...En modo COMPLETO, todas las referencias deben estar disponibles."
T25: PARTIAL allows — conflict tolerated
T26: PERSISTENCE_ERROR blocks both FULL and PARTIAL
T28: fail-closed — undefined reservation blocked
T29: EXPIRED blocks submission
T30: org A=0, org B=0 — clean
```

---

## 13. Verificacion final

| Check | Resultado |
|---|---|
| TSC (`npx tsc --noEmit`) | 194 errores (todos pre-existentes, 0 nuevos) |
| Unit tests (CLI) | 87/87 PASS (28 suites), 121ms |
| Integration tests (CLI, PostgreSQL real) | 30/30 PASS (14 suites), 28743ms |
| Total tests ejecutados | 117/117 PASS |
| Sprint files TSC | 0 errores |

---

## 14. Deudas tecnicas — TODAS CERRADAS

| Deuda | Estado anterior | Estado actual |
|---|---|---|
| D1: TTL sin executor | Sin cron | CERRADA: cron route + vercel.json |
| D2: Concurrencia sin transaccion | Upserts individuales | CERRADA: advisory locks + prisma.$transaction |
| D3: Wizard sin estado de reserva | API retornaba pero UI ignoraba | CERRADA: reservation alert banner |
| D4: Integration tests con DB real | Solo unit tests | CERRADA: 30 integration tests PostgreSQL |
| D5: FULL/PARTIAL enforcement | Solo en wizard UI | CERRADA: enforceReservationPolicy() en service |

---

## 15. Contratos consumidos (no modificados)

| Contrato | Archivo | Funcion |
|---|---|---|
| Bridge | `order-reservation-bridge.ts` | `syncOrderReservations()` |
| Engine | `operational-reservation-engine.ts` | `expireReservations()`, pure functions |
| Types | `operational-reservation-types.ts` | `OperationalReservation`, `ReservationImpact` |
| Entities | `operational-entities.ts` | `OperationalOrder`, `OperationalOrderLine` |
| Order types | `order-types.ts` | `OrderDraft`, `OrderLine`, `OrderStatus` |

---

## 16. Contratos modificados

| Contrato | Cambio | Impacto |
|---|---|---|
| `order-reservation-bridge.ts` | Advisory locks + transaction + self-reservation + cancel guard | Concurrency-safe |
| `order-service.ts` | OrderMutationResult + enforceReservationPolicy() | Canonical enforcement |
| API route response | `{ order, reservation }` | Wizard consume |
| `pedidos-client.tsx` | Reservation alert banner | Conflictos visibles |
| `vercel.json` | Nuevo cron entry | reservation-expiry cada 30 min |

---

## 17. Dependencias NO tocadas

- Prisma schema (no migrations)
- SAG adapter (no SOAP calls)
- Reservation engine (pure functions, consumed as-is)
- Warehouse master (no inventory changes)
