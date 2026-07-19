# ORDER-DRAFT-DEDUP-AND-DELETE-01 — Sprint Report

**Date:** 2026-07-04
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)

---

## Problem 1: Duplicate Orders

### Root Cause

Both `saveDraft()` and `submitDraft()` in pedidos-client called `action: "create"` every time. No idempotency check. If:
- User clicks "Guardar borrador" then "Confirmar pedido" → 2 creates
- Double-click on either button → 2 creates
- React StrictMode dev double-invoke of effects → potential duplicate

### Fix: 3-Layer Protection

**Layer 1: UI submit lock**
- `submitting` state prevents concurrent calls
- Both `saveDraft()` and `submitDraft()` check `if (submitting) return` at top
- State reset in `finally` block
- Buttons implicitly blocked during submission

**Layer 2: Wizard session key**
- `wizardSessionRef` generated on `openWizard()`: `ws-{timestamp}-{random}`
- Passed to API as `wizardSessionKey`
- Each wizard open = unique session = at most one order

**Layer 3: Backend dedup**
- New function `createOrderDraftDeduped()` in order-service.ts
- Checks if an order with `[wizardSessionKey]` in intent field already exists
- If found → returns existing order with `alreadyExists: true`
- If not → creates normally with session tag appended to intent

**Result:** 1 click / 1 wizard session = 1 order, guaranteed.

---

## Problem 2: Delete Draft Orders

### New Function: `deleteDraftOrder()`

Location: `lib/comercial/pedidos/order-service.ts`

Server-side validations:
1. Order exists in this organization
2. Origin = "agentik" (SAG-imported orders blocked)
3. Status = "borrador" or "cancelado" (sent/synced orders blocked)
4. No sagOrderId (synced orders blocked)
5. No active SagWriteOperation (PENDING/APPROVED/SENDING)

If any check fails → returns `{ ok: false, error: "reason" }` (409).

### API Action: `delete_draft`

Route: `POST /api/orgs/[orgSlug]/comercial/pedidos` with `action: "delete_draft"`

### UI: Delete Button with Confirmation

In `OrderActions` component:
- Visible only for Agentik drafts/cancelled without SAG sync
- First click → "Eliminar borrador"
- Shows inline confirmation: "Borrador sera eliminado. No afecta SAG." [Confirmar] [No]
- On confirm → calls `delete_draft` → closes drawer → refreshes list

### Cannot Delete
- SAG-imported orders (origin ≠ "agentik")
- Orders sent to SAG (any status past borrador)
- Orders with sagOrderId
- Orders with active SagWriteOperation

---

## Cleanup Script

`scripts/cleanup-agentik-test-orders.ts`

- Dry-run by default
- Pass `--execute` to actually delete
- Only deletes orders where:
  - origin = agentik
  - status = borrador or cancelado
  - no sagOrderId
  - customerName contains "AGENTIK PRUEBA", "TEST", or "PRUEBA"
  - no active SagWriteOperation

Run: `npx tsx scripts/cleanup-agentik-test-orders.ts [--execute]`

---

## Files Modified

| File | Change |
|------|--------|
| `lib/comercial/pedidos/order-service.ts` | Added `deleteDraftOrder()`, `createOrderDraftDeduped()` |
| `app/api/orgs/[orgSlug]/comercial/pedidos/route.ts` | Added `delete_draft` action, dedup in `create` action |
| `app/(app)/[orgSlug]/comercial/pedidos/pedidos-client.tsx` | Submit lock, wizard session key, delete action handler, OrderActions delete button |
| `scripts/cleanup-agentik-test-orders.ts` | Created — dry-run cleanup script |
