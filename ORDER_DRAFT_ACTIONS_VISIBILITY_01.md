# ORDER-DRAFT-ACTIONS-VISIBILITY-01 -- Hotfix Report

**Date:** 2026-07-04
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)

---

## Problem

After ORDER-DRAFT-DETAIL-ACTIONS-HOTFIX-01, "Editar borrador" and "Eliminar borrador"
buttons still did not appear for AGK draft orders. The UI showed "Origen: AGK" and
"Estado: Borrador Agentik" but the action buttons were not visible.

## Root Causes

### 1. Actions hidden in footer
The `OrderActions` component rendered only in the **drawer footer**, which sits below
the scrollable tab content area. If the order has many lines or the viewport is short,
the footer actions are not visible without scrolling past all content.

### 2. Strict origin matching
Guards used `origin === "agentik"` — correct for the data model (`OrderOrigin` type),
but fragile. No normalization for case variations or display labels like "AGK".

### 3. Strict status matching
Guards used `status === "borrador"` — correct for `OrderStatus` type, but no
normalization for potential variations like "borrador_agentik" or "draft".

---

## Fixes

### FASE 1 — Debug log
Added one-time console log in `OrderActions` showing:
`orderId, origin, status, sagOrderId, canEdit, canDelete`

Behind `typeof window !== "undefined"` guard. Marked with `// DEBUG — remove after confirming visibility`.

### FASE 2 — Origin normalizer

```typescript
function isAgentikOrder(origin: string): boolean {
  const n = origin.toLowerCase().trim();
  return n === "agentik" || n === "agk";
}
```

### FASE 3 — Status normalizer

```typescript
function isDraftStatus(status: string): boolean {
  const n = status.toLowerCase().trim();
  return n === "borrador" || n === "borrador_agentik" || n === "draft";
}
```

### FASE 4 — Updated guards

```typescript
function canDeleteDraftOrder(order): boolean {
  return isAgentikOrder(order.origin)
    && !order.sagOrderId
    && (isDraftStatus(order.status) || order.status === "cancelado");
}

function canEditDraftOrder(order): boolean {
  return isAgentikOrder(order.origin)
    && !order.sagOrderId
    && isDraftStatus(order.status);
}
```

### FASE 5 — Header placement (KEY FIX)

Draft actions now render **in the drawer header**, directly below the document
actions row (PDF / WhatsApp / Correo). This area is always visible regardless
of scroll position.

New component `DraftDeleteInline` handles the delete confirmation flow inline
in the header (separate from the footer `OrderActions`).

**Before (footer only):**
```
┌─ Header ──────────────────────────┐
│  Pedido #N                        │
│  PDF | WhatsApp | Correo          │
├─ Tabs ────────────────────────────┤
│  (scrollable content)             │
├─ Footer ──────────────────────────┤
│  [Enviar] [Editar] [Cancelar]     │  ← hidden below scroll
└───────────────────────────────────┘
```

**After (header + footer):**
```
┌─ Header ──────────────────────────┐
│  Pedido #N                        │
│  PDF | WhatsApp | Correo          │
│  [Editar borrador] [Eliminar]     │  ← ALWAYS VISIBLE
├─ Tabs ────────────────────────────┤
│  (scrollable content)             │
├─ Footer ──────────────────────────┤
│  [Enviar] [Editar] [Cancelar]     │  ← also available
└───────────────────────────────────┘
```

---

## Files Modified

| File | Change |
|------|--------|
| `pedidos-client.tsx` | `isAgentikOrder()` + `isDraftStatus()` normalizers; updated `canDeleteDraftOrder()` + `canEditDraftOrder()` guards; new `DraftDeleteInline` component; draft actions rendered in drawer header; debug log in `OrderActions` |
