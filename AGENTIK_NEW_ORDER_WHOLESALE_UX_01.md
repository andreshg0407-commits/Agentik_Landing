# AGENTIK-NEW-ORDER-WHOLESALE-UX-01 — Sprint Report

**Date:** 2026-07-04
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)

---

## Why Wholesale Matrix

A wholesale salesperson takes orders for **multiple sizes and colors of the same reference in one pass**. The previous flow forced: reference → color → talla → quantity → add → repeat. That's 5 taps per line. For a 50-line order with 8 colors × 6 sizes = clicking through 48 variants.

The matrix approach: **search reference → see all colors × sizes → type quantities → add all at once**. One action adds 20+ lines. Faster than paper.

---

## Architecture

```
pedidos-client.tsx
  └── WholesaleOrderWizard (new)
        ├── Step 1: Cliente (validated, real sellers dropdown)
        ├── Step 2: Productos (matrix + grouped lines + live sidebar)
        └── Step 3: Resumen (grouped view + confirm)
```

---

## How Lines Are Added

1. User searches a reference (e.g. "CJ-1026")
2. System shows a matrix: rows = colors, columns = sizes
3. Each cell shows available stock as placeholder
4. User types quantities directly into cells (Tab navigates between cells)
5. "Agregar cantidades" button creates one OrderLine per filled cell
6. Matrix resets, search bar refocuses for next reference

Example matrix for "CAMISETA BEBE":

```
              6-9    9-12   12-18   18-24
ARENA           0      0      12       8
CAFE            0      6      10       0
GUAYABA         4      0       0       0
```

Clicking "Agregar cantidades" creates 5 lines:
- ARENA 12-18 x12
- ARENA 18-24 x8
- CAFE 9-12 x6
- CAFE 12-18 x10
- GUAYABA 6-9 x4

---

## Stock Rules

- Each cell shows available units below the input (green/amber/red/dash)
- If quantity > available: cell turns red, shows "(max: N)"
- "Agregar cantidades" button is disabled while any cell exceeds stock
- Cannot advance to Resumen if any line exceeds stock
- Null availability (unsynced) shows "—" — does NOT block

---

## Client Validation

Required fields (cannot advance):
- Nombre / Razon social
- NIT
- Vendedor (real dropdown from seller-directory.ts)

Optional:
- Codigo SAG
- Ciudad
- Canal (dropdown: mayorista, distribuidor, institucional, retail)

Test client toggle:
- Marks order as "CLIENTE PRUEBA / NO SINCRONIZAR SAG"
- Visible warning in resumen step
- Does NOT block order creation

---

## Seller Dropdown

Real data from `buildSellerDirectory()` (lib/comercial/foundation/seller-directory.ts):
- Derived from CRMQuote.sellerName (8 distinct sellers in Castillitos)
- API action: `list_sellers` in pedidos route
- Inactive sellers shown with "(inactivo)" suffix
- Empty state message if no sellers found

---

## Files

| File | Action |
|------|--------|
| `app/(app)/[orgSlug]/comercial/pedidos/wholesale-order-wizard.tsx` | Created |
| `app/(app)/[orgSlug]/comercial/pedidos/pedidos-client.tsx` | Modified (import + wizard swap) |
| `app/api/orgs/[orgSlug]/comercial/pedidos/route.ts` | Modified (list_sellers action) |

---

## Pending for Mobile

- Matrix cells need larger touch targets on small screens
- Consider swipeable rows or a card-based entry for < 768px
- Keyboard shortcuts (Tab navigation) are desktop-only
- Search input should auto-focus on step entry (done for desktop)

---

## Not Touched

- Order-SAG lifecycle (bridge, post-sync, callbacks)
- No SAG sends from this wizard
- order-types.ts unchanged
- order-service.ts unchanged
- order-validation.ts unchanged
