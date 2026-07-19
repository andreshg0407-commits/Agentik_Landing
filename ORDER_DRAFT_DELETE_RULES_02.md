# ORDER-DRAFT-DELETE-RULES-02 -- Hotfix Report

**Date:** 2026-07-04
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)

---

## Problem

AGK test orders had `status: "listo_para_enviar"` but no SAG connection (no `sagOrderId`,
no `sagDocumentNumber`, no active `SagWriteOperation`). The previous guards blocked
deletion for any status other than `borrador` or `cancelado`, making it impossible
to clean up test orders that were accidentally advanced.

---

## New Business Rule

**An Agentik order is deletable if it has NEVER touched SAG.**

| Condition | Required |
|-----------|----------|
| `origin` = agentik/AGK | YES |
| `sagOrderId` = null | YES |
| `status` != sincronizado | YES |
| No active SagWriteOperation | YES (backend check) |
| Status = borrador/listo_para_enviar/cancelado/etc. | **NOT required** |

**An Agentik order is editable if:**

| Condition | Required |
|-----------|----------|
| `origin` = agentik/AGK | YES |
| `sagOrderId` = null | YES |
| `status` = borrador OR listo_para_enviar | YES |

---

## Fixes

### FASE 1 — UI guards (`pedidos-client.tsx`)

**`canDeleteDraftOrder`** — removed status dependency:
```typescript
function canDeleteDraftOrder(order) {
  return isAgentikOrder(order.origin)
    && !order.sagOrderId
    && order.status !== "sincronizado";
}
```

**`isEditableStatus`** — new helper for edit guard:
```typescript
function isEditableStatus(status) {
  return isDraftStatus(status) || status === "listo_para_enviar";
}
```

**`canEditDraftOrder`** — now allows `listo_para_enviar`:
```typescript
function canEditDraftOrder(order) {
  return isAgentikOrder(order.origin)
    && !order.sagOrderId
    && isEditableStatus(order.status);
}
```

### FASE 2 — Backend (`order-service.ts`)

**`deleteDraftOrder`** — removed status whitelist:
- Before: blocked unless `status in ["borrador", "cancelado"]`
- After: blocks only if `status === "sincronizado"` or has `sagOrderId` or has active SagWriteOperation
- Origin check now case-insensitive (`"agentik"` or `"agk"`)

**`updateOrderDraft`** — expanded editable statuses:
- Before: only `status === "borrador"`
- After: `status === "borrador" || status === "listo_para_enviar"`

### FASE 3 — Cleanup

- Removed `DEBUG DRAWER REAL` block from drawer header
- Removed `[ORDER_ACTIONS_DEBUG]` console.log from OrderActions
- Draft action buttons remain in both header and footer of drawer

### Footer `OrderActions` switch

`listo_para_enviar` case now includes `{editBtn}` and `{deleteBtn}` alongside
"Preparar para SAG" and "Volver a borrador".

---

## Files Modified

| File | Change |
|------|--------|
| `pedidos-client.tsx` | `canDeleteDraftOrder` status-independent; `isEditableStatus` helper; `canEditDraftOrder` allows listo_para_enviar; footer switch updated; debug removed |
| `lib/comercial/pedidos/order-service.ts` | `deleteDraftOrder` allows any non-sincronizado status; case-insensitive origin; `updateOrderDraft` allows listo_para_enviar |
