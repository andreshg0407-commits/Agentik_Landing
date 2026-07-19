# Agentik ↔ SAG/PYA — Operational Contract

**Sprint:** AGENTIK-SAG-OPERATIONAL-CONTRACT-01
**Status:** Active — architectural boundary defined
**Last updated:** 2026-05-25
**Authority:** Confirmed by SAG technical team response

---

## 1. What SAG Is Within Agentik

SAG (Sistema de Administración y Gestión) / PYA is the **transactional/legal ERP** of the tenant.
It is the system of record for fiscal and physical operations.

SAG is NOT Agentik's operational brain. It is Agentik's legal ledger.

```
SAG = source of truth for:
  ├── Physical inventory (kardex, warehouse)
  ├── Invoicing (F1, F2)
  ├── Legal documents (NC, remissions, DIAN)
  ├── Contabilidad legal
  ├── Production executed
  ├── ERP movements
  └── Official cartera contable
```

**Key finding confirmed by SAG team:**
> "El disponible SAG NO es universal — depende de parametrización y fuentes configuradas por empresa.
>  Algunas empresas descuentan PD autorizados. Otras no.
>  No existe una vista operacional consolidada única."

This means: **Agentik cannot trust `available_sag` as operational truth.**

---

## 2. What Agentik Does NOT Do (Yet)

- Does NOT replace SAG as ERP
- Does NOT duplicate fiscal/accounting documents
- Does NOT issue F1/F2/NC independently
- Does NOT read SAG's "disponible" as operational ground truth
- Does NOT integrate DIAN
- Does NOT own the physical inventory ledger
- Does NOT bypass SAG for production execution

---

## 3. What Agentik Controls Operationally

```
Agentik = Operational Intelligence Layer:
  ├── Operational orders (pedidos vivos)
  ├── Sales Portfolios (portafolios comerciales)
  ├── Commercial coverage tracking
  ├── Operational pressure computation
  ├── Operational reservations (not yet in SAG)
  ├── Sales rep assignments
  ├── Transfer suggestions (internal stock reallocation)
  ├── Production demand signals
  ├── Multi-agent reasoning
  ├── Commercial alerts and workflows
  └── Operational coordination across roles
```

The fundamental principle:
```
Agentik thinks.
SAG legalizes.
```

---

## 4. Events That Originate in Agentik

These are created exclusively within Agentik — SAG does not generate them:

| Event | Owner | Description |
|---|---|---|
| `order.created` | Agentik | Pedido born in operational layer |
| `order.reserved` | Agentik | Units reserved operationally |
| `portfolio.item.pressure` | Agentik | Item below minimum in active portfolio |
| `portfolio.item.depleted` | Agentik | Item at zero in active portfolio |
| `transfer.suggested` | Agentik | Internal reallocation recommendation |
| `production.signal` | Agentik | Multi-vendor demand signal |
| `coverage.drop` | Agentik | Coverage fell below threshold |
| `alert.fired` | Agentik | Any commercial operational alert |

---

## 5. What Synchronizes Toward SAG

After Agentik creates an operational event, it synchronizes downstream:

| Agentik event | SAG equivalent | Direction |
|---|---|---|
| `order.confirmed` | PD (Pedido) | Agentik → SAG |
| `order.fulfilled` | F1/F2 (Factura) | SAG generates after PD |
| `production.approved` | Production order | Agentik signal → SAG execution |
| `reservation.created` | Optional SAG hold | Agentik → SAG (if supported) |

```
Agentik order lifecycle:
  draft → reserved → confirmed → sent_to_sag → processing → fulfilled
                                     ↓
                              SAG receives PD
                              SAG generates F1/F2
                              SAG notifies Agentik
```

---

## 6. What Returns from SAG

SAG events flow back into Agentik to update operational state:

| SAG event | Agentik reaction |
|---|---|
| `invoice.created` (F1/F2) | Mark order as fulfilled, release reservation |
| `credit_note.issued` (NC) | Return units to operational availability |
| `inventory.movement` | Update physical inventory snapshot |
| `production.completed` | Update production signal as resolved |
| `payment.received` | Update collection state |
| `document.cancelled` | Revert operational state |

```
SAG event → SagSyncEvent → Agentik recalculates operational state
```

---

## 7. Decoupling Operational Intelligence from ERP

```
┌─────────────────────────────────────────────────────────────────┐
│                       AGENTIK                                   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              OPERATIONAL INTELLIGENCE LAYER             │  │
│  │                                                          │  │
│  │  Sales Portfolios ──┐                                   │  │
│  │  Commercial Orders ─┤── Pressure Engine ── Agents       │  │
│  │  Reservations ──────┘      │                            │  │
│  │                            │                            │  │
│  │                    Operational Inventory                │  │
│  │                    Boundary (read-only)                 │  │
│  └───────────────────────────┬──────────────────────────────┘  │
│                              │                                  │
│  ┌───────────────────────────▼──────────────────────────────┐  │
│  │              SYNC / INTEGRATION GATEWAY                  │  │
│  │                                                          │  │
│  │   SAG Sync Layer ──── SagSyncEvent processor             │  │
│  └───────────────────────────┬──────────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────────┘
                               │
            ┌──────────────────▼────────────────────┐
            │           SAG / PYA ERP               │
            │                                       │
            │  v_saldos_inventariotallanew           │
            │  Physical inventory / kardex          │
            │  F1/F2/PD/NC                          │
            │  Cartera / DIAN                       │
            └───────────────────────────────────────┘
```

**Rule:** No commercial module reads SAG directly.
Everything passes through `OperationalInventoryBoundary` (read) or `SagSyncGateway` (write).

---

## 8. Operational Inventory Formula

SAG's "disponible" is parametric and unreliable as universal truth.
Agentik computes its own operational availability:

```
operationalAvailableQty =
    physicalQty               ← from SAG physical snapshot
  - reservedQty               ← Agentik reservations
  - salesAssignedQty          ← units in active Sales Portfolios
  - pendingTransfersQty       ← units in transit between portfolios
```

This formula is owned by Agentik's Operational Inventory layer, not SAG.

---

## 9. Migration Path

| Phase | What changes |
|---|---|
| V1 (current) | SAG adapter reads Excel/ODBC snapshot. Agentik computes pressure. |
| V2 | Real-time SAG reads via ODBC/SQL read-only view. Event polling. |
| V3 | Full event-driven: SAG triggers → Agentik webhooks. Reservations synced to SAG. |
| V4 | Bidirectional: Agentik orders → SAG PD. SAG invoices → Agentik fulfillment. |
