# ORDER-DRAFT-DETAIL-ACTIONS-HOTFIX-01 -- Sprint Report

**Date:** 2026-07-04
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)

---

## Problem

Agentik-created draft orders (AGK) appeared in the order list but the detail drawer
had no "Editar borrador" button and the delete flow lacked clear confirmation text.

---

## Root Cause

1. **No edit action existed.** `OrderActions` only showed "Enviar a revision", "Cancelar",
   and "Eliminar borrador" for draft status. There was no way to load a draft back into
   the wizard for editing.

2. **Delete/edit guards were inline.** The `canDelete` logic was embedded inside
   `OrderActions` as a local boolean, making it hard to reuse or test.

3. **Wizard was create-only.** `saveDraft()` always called `action: "create"`.
   There was no path to call `action: "update_draft"` for existing orders.

---

## Fixes

### FASE 2 -- Draft action guard helpers

Two standalone functions extracted before the main component:

```typescript
function canDeleteDraftOrder(order): boolean
  // origin === "agentik" && !sagOrderId && (borrador || cancelado)

function canEditDraftOrder(order): boolean
  // origin === "agentik" && !sagOrderId && borrador
```

Match backend validation in `deleteDraftOrder()` (order-service.ts).

### FASE 3 -- Eliminar borrador (improved)

- Uses `canDeleteDraftOrder()` helper (previously inline `canDelete`)
- Confirmation text updated: "Este borrador sera eliminado. Esta accion no afecta SAG."
- Confirmation row uses `flexWrap: "wrap"` for mobile layout
- On success: closes drawer, refreshes list + stats, shows feedback
- On failure: shows backend error message

### FASE 4 -- Editar borrador (NEW)

- "Editar borrador" button appears in `OrderActions` when `canEditDraftOrder()` is true
- Styled as `ag-action-secondary` (blue, not destructive)
- Button order: Enviar a revision | Editar borrador | Cancelar | Eliminar borrador

**Edit flow:**
1. `handleOrderAction("edit_draft")` fetches full order via `action: "get"`
2. Validates `canEditDraftOrder()` on fetched data
3. Populates wizard: `setWizardHeader(draft.header)`, `setWizardLines(draft.lines)`
4. Opens wizard at "resumen" step (skip client/products since data exists)
5. Sets `editingOrderId` state

**Save flow (editing):**
- `saveDraft()` checks `editingOrderId`
- If set: calls `action: "update_draft"` with orderId, header, lines
- If null: calls `action: "create"` (original behavior)
- Save button in `WholesaleOrderWizard`: "Actualizar borrador" when editing, "Guardar borrador" when creating

**Close/cancel:**
- Closing wizard resets `editingOrderId` to null

### Wizard changes

`WholesaleOrderWizard` (`wholesale-order-wizard.tsx`):
- Added optional `isEditing?: boolean` prop
- Save button label: `isEditing ? "Actualizar borrador" : "Guardar borrador"`

---

## Visibility Rules

| Condition | Editar borrador | Eliminar borrador |
|---|---|---|
| origin=agentik, status=borrador, no SAG | YES | YES |
| origin=agentik, status=cancelado, no SAG | NO | YES |
| origin=agentik, status=borrador, has sagOrderId | NO | NO |
| origin=sag (any status) | NO | NO |
| status=sincronizado | NO | NO |
| status=pendiente_sag | NO | NO |

---

## Files Modified

| File | Change |
|------|--------|
| `pedidos-client.tsx` | `canDeleteDraftOrder()`, `canEditDraftOrder()` helpers; `editingOrderId` state; `handleOrderAction("edit_draft")` loads draft into wizard; `saveDraft()` handles update vs create; `OrderActions` uses helpers + adds "Editar borrador" button; improved delete confirmation text |
| `wholesale-order-wizard.tsx` | Added `isEditing?: boolean` prop; save button label changes based on mode |
