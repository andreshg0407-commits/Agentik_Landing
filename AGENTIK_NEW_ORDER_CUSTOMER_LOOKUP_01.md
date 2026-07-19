# AGENTIK-NEW-ORDER-CUSTOMER-LOOKUP-01 — Sprint Report

**Date:** 2026-07-04
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)

---

## Problem

The order wizard started with a blank "create new customer" form. That's wrong — most orders are for existing customers already in CustomerProfile (synced from SAG/CRM). The salesperson shouldn't re-enter data that already exists.

---

## Solution: Search-First Flow

### Flow 1: Existing Customer (primary)

```
[Buscar cliente]
  ↓
"Almacenes El Sol"
  ↓
┌─────────────────────────────────────┐
│ 4B MODA S.A.S                       │
│ NIT 39433 · Barrancabermeja · Villa  │
│ SAG: CLI-001  2 pedidos · $1.2M     │
│                         [Seleccionar]│
└─────────────────────────────────────┘
  ↓
Header auto-filled:
  - customerName ← profile.name
  - customerId ← profile.nit
  - customerCode ← profile.sagCode
  - sellerName ← profile.lastSellerName
  - city ← profile.city
  ↓
Confirm vendedor (select dropdown) → Continuar
```

### Flow 2: New Customer (secondary)

```
"No encuentras el cliente?"
[+ Crear cliente nuevo]
  ↓
Manual form with required fields:
  - Nombre *
  - NIT *
  - Vendedor * (select)
  - Ciudad *
  - Canal *
  - Codigo SAG (optional)
```

### Flow 3: Test Customer

```
[✓] CLIENTE PRUEBA / NO SINCRONIZAR SAG
  ↓
Allows manual entry without SAG sync.
Warning shown in resumen step.
```

---

## SAG Code Blocking

When a customer has no SAG code (neither from CustomerProfile nor manually entered):

> "Cliente sin codigo SAG. Podras crear el pedido en Agentik, pero no enviarlo a SAG hasta completar el codigo."

This warning appears in:
- Step 1 (selected customer mode)
- Step 1 (manual mode)
- Step 3 (resumen)

The order CAN be created as a draft. It CANNOT be sent to SAG without a code.

---

## Data Flow

**Server:** `searchCustomers()` in `lib/comercial/pedidos/order-service.ts`
- Source 1: CustomerProfile (real SAG/CRM data) — includes `city`, `sagCode` (erpId)
- Source 2: Order history (AgentExecution) — fallback for customers not yet in profile

**API:** `POST /api/orgs/[orgSlug]/comercial/pedidos` with `action: "search_customers"`

**New fields added to CustomerProfile interface:**
- `city: string` — from CustomerProfile.city
- `sagCode: string` — from CustomerProfile.erpId

---

## Validation Rules

**Existing customer (selected):**
- customerName (auto)
- NIT or SAG code (at least one)
- vendedor assigned (select)

**New customer (manual):**
- nombre *
- NIT *
- vendedor * (select)
- ciudad *
- canal *

**Neither mode advances without vendedor selected from dropdown.**

---

## Files Modified

| File | Change |
|------|--------|
| `app/(app)/[orgSlug]/comercial/pedidos/wholesale-order-wizard.tsx` | Rewrote Step 1: 3 modes (search/selected/manual) |
| `lib/comercial/pedidos/order-service.ts` | Added `city`, `sagCode` to CustomerProfile interface and mapper |
| `app/(app)/[orgSlug]/comercial/pedidos/pedidos-client.tsx` | Added `city`, `sagCode` to local CustomerProfile interface |
