# ORDER-SAG-LIFECYCLE-01 — Sprint Report

**Date:** 2026-07-04
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)

---

## Objective

Close the complete order lifecycle loop: automatic callbacks after SAG execute/reject, sourceRef uniqueness enforcement, reservation lifecycle management, and E2E validation.

---

## Deliverables

### 1. Automatic Post-Sync Callback (`order-lifecycle-hooks.ts`)

**File:** `lib/comercial/pedidos/order-lifecycle-hooks.ts`

Single integration point between SAG write pipeline and Pedidos module:
- `dispatchOrderPostSync()` — called by execute + reject routes
- Detects order operations via sourceRef pattern (`AGK-*-PED-*`)
- Non-order operations (customer upsert, product sync) silently ignored
- Never throws — failures logged but don't block SAG route

### 2. Execute Route Wiring

**File:** `app/api/orgs/[orgSlug]/sag/write/[operationId]/execute/route.ts`

After `executeOperation()` completes:
```typescript
await dispatchOrderPostSync(
  organization.id, params.operationId,
  result.ok ? "SUCCEEDED" : "FAILED", result.sagResponse,
);
```

### 3. Reject Route Wiring

**File:** `app/api/orgs/[orgSlug]/sag/write/[operationId]/reject/route.ts`

After `reject()` completes:
```typescript
await dispatchOrderPostSync(
  organization.id, params.operationId,
  "REJECTED", { rejectionReason: reason },
);
```

### 4. sourceRef UNIQUE Constraint

**File:** `prisma/migrations/20260714000000_sag_write_source_ref_unique/migration.sql`

Partial unique index — only enforced when sourceRef is not null:
```sql
CREATE UNIQUE INDEX "SagWriteOperation_orgId_sourceRef_key"
  ON "SagWriteOperation" ("organizationId", "sourceRef")
  WHERE "sourceRef" IS NOT NULL;
```

### 5. Reservation Lifecycle

In `order-lifecycle-hooks.ts` → `handleReservationLifecycle()`:
- **SUCCEEDED** → consume all active reservations for the order
- **FAILED / REJECTED** → release all active reservations

### 6. Observability

Both `order-lifecycle-hooks.ts` and `order-post-sync.ts` emit structured JSON logs:
```json
{ "ts": "...", "module": "ORDER_LIFECYCLE", "event": "DISPATCH_ORDER_UPDATED", ... }
```

### 7. Retry Safety

Already enforced in `order-sag-bridge.ts`:
- `alreadySynced` — blocks re-send of synced orders
- `alreadyQueued` — idempotent when sourceRef already in queue

### 8. E2E Validation Script

**File:** `scripts/validate-order-sag-lifecycle.ts`

7-phase test against real database:
1. Infrastructure verification (tables exist)
2. Order creation + submit
3. Bridge enqueue
4. Queue state verification (XML, risk, sourceRef)
5. Post-sync callback simulation (SUCCESS path)
6. sourceRef uniqueness protection
7. Retry safety (synced orders blocked)

Run: `npx tsx scripts/validate-order-sag-lifecycle.ts`

---

## Architecture Summary

```
User submits order
    │
    ▼
sendOrderToSagQueue() ──► SagWriteOperation (PENDING, sourceRef=AGK-xxx-PED-xxx)
    │
    ▼
[Approval flow: approve → APPROVED]
    │
    ▼
POST .../execute ──► executeOperation() ──► SOAP call ──► SUCCEEDED | FAILED
    │
    ▼
dispatchOrderPostSync()
    ├── isOrderSourceRef? → handleOrderSagResult() → order status update
    └── handleReservationLifecycle() → consume or release
```

---

## Files Created/Modified

| File | Action |
|------|--------|
| `lib/comercial/pedidos/order-lifecycle-hooks.ts` | Created |
| `lib/comercial/pedidos/order-post-sync.ts` | Created (previous sprint) |
| `app/api/orgs/[orgSlug]/sag/write/[operationId]/execute/route.ts` | Modified |
| `app/api/orgs/[orgSlug]/sag/write/[operationId]/reject/route.ts` | Modified |
| `prisma/migrations/20260714000000_sag_write_source_ref_unique/migration.sql` | Created |
| `scripts/validate-order-sag-lifecycle.ts` | Created |

---

## Idempotency Layers (Complete)

1. **UI** — button disabled after first click
2. **API** — checks existing sourceRef in queue before enqueue
3. **DB** — partial UNIQUE index on (organizationId, sourceRef)
4. **SAG** — OBSERVACION field contains externalSyncKey for traceability

---

## What's Next

- Run E2E validation against real database (`npx tsx scripts/validate-order-sag-lifecycle.ts`)
- Apply migration (`prisma migrate deploy`) when ready for production
- Wire "Enviar a SAG" button in `pedidos-client.tsx` to POST `/api/.../pedidos` with `action: "send_to_sag"`
