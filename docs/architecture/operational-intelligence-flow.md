# Operational Intelligence Flow — Multi-Agent Architecture

**Sprint:** AGENTIK-SAG-OPERATIONAL-CONTRACT-01
**Status:** Active
**Last updated:** 2026-05-25

---

## Overview

Agentik's intelligence layer is multi-agent. Each agent is specialized for a domain.
All agents consume **operational events** — not SAG documents directly.

```
SAG data
  ↓ (via Operational Inventory Boundary)
Operational Events
  ↓
Agent reasoning
  ↓
Actionable intelligence → UI + workflows + alerts
```

No agent reads SAG directly. All intelligence originates from Agentik's operational layer.

---

## Agent Domains

### David — Agente Comercial

**Domain:** Commercial coverage, vendor operations, portfolio pressure

**Consumes:**
- Sales Portfolio state (active portfolios, item levels)
- Operational inventory availability (via boundary)
- Pressure events (item below minimum, item depleted)
- Transfer suggestions from the portfolio pressure engine
- Production signals triggered by multi-vendor depletion

**Generates:**
- Coverage alerts per vendor
- Transfer recommendations (idle stock → depleted vendor)
- Production demand signals when 2+ vendors are low
- Escalations to Diego when production is the only path
- Vendor performance insights (velocity, rotation)

**Does NOT:**
- Read SAG directly
- Issue purchase orders
- Execute production
- Generate fiscal documents

**Key signals David processes:**
```
portfolio_item.bajo_minimo   → suggest transfer or monitor
portfolio_item.agotado       → urgent transfer or production
multi_vendor.all_depleted    → production suggestion to Diego
velocity.high + stock.low    → escalate urgency
stock_idle.vendor_A + low.vendor_B → internal transfer
```

---

### Diego — Agente de Producción

**Domain:** Production demand, urgency, capacity

**Consumes:**
- Production signals from David's pressure engine
- Historical velocity from SAG movements (when available)
- Current production orders from SAG (when synced)
- Demand aggregation across all active portfolios

**Generates:**
- Production priority queue
- Production quantity recommendations per reference
- Lead time warnings
- Capacity alerts

**Does NOT:**
- Execute production in SAG
- Approve production orders
- Read SAG directly

**Key signals Diego processes:**
```
commercial_production_signal (source: bag_pressure)  → compute quantity + urgency
multi_ref.all_critical                               → escalate to coordinator
production.lead_time_risk                            → warning for planeación
```

---

### Finanzas — Agente Financiero

**Domain:** Rotation, working capital, frozen inventory pressure

**Consumes:**
- Sales Portfolio data (assigned vs sold per vendor)
- Inventory movement trends (when SAG data available)
- Order fulfillment rates
- Collection records

**Generates:**
- Dead stock warnings (high assignment, low sold)
- Working capital pressure signals
- Cash flow risk from unsold portfolio units
- Rotation KPIs per line and vendor

**Does NOT:**
- Compute fiscal P&L
- Generate accounting entries
- Replace SAG's cartera module

**Key signals Finanzas processes:**
```
portfolio.high_assigned + low_soldQty   → dead stock risk
collection.overdue + high_portfolio     → cash pressure
inventory.fast_moving + low_stock       → revenue opportunity
```

---

### Copilot — Coordinación Transversal

**Domain:** Cross-module coordination, priority arbitration, escalations

**Consumes:**
- All agent signals
- Module health state
- Pending action items
- User context (current module, role)

**Generates:**
- Cross-domain recommendations
- Priority-ranked action list
- Escalation paths (e.g. "David says produce, Diego says capacity full")
- Briefings for coordinators and managers

**Does NOT:**
- Replace individual agent reasoning
- Execute actions autonomously without approval

---

## Event Flow Diagram

```
                    SAG / PYA ERP
                        │
         ┌──────────────▼──────────────┐
         │  Operational Inventory      │
         │  Boundary (read-only)       │
         │  lib/operational-inventory/ │
         └──────────────┬──────────────┘
                        │ physicalQty snapshot
                        │
         ┌──────────────▼──────────────────────────────┐
         │         AGENTIK OPERATIONAL LAYER           │
         │                                             │
         │  Sales Portfolios                           │
         │  ├── assignedQty                            │
         │  ├── soldQty (from order ingest)            │
         │  ├── availableToSellQty                     │
         │  └── operationalAvailableQty (formula)      │
         │                                             │
         │  Order Lifecycle                            │
         │  draft → reserved → confirmed → sent_to_sag │
         │                                             │
         │  Pressure Engine                            │
         │  ├── item pressure (below min)              │
         │  ├── multi-vendor pressure                  │
         │  └── production signals                     │
         └──────────────┬──────────────────────────────┘
                        │ operational events
              ┌─────────┼──────────┬────────────┐
              ▼         ▼          ▼            ▼
           David       Diego    Finanzas    Copilot
         (comercial) (producción) (finanzas)  (coord)
              │         │          │            │
              └─────────┴──────────┴────────────┘
                                │
                     Actionable Intelligence
                     UI + Alerts + Workflows
                                │
              ┌─────────────────▼─────────────────┐
              │    SAG Sync Gateway (outbound)     │
              │    order.confirmed → SAG PD        │
              │    production.approved → SAG OP    │
              └────────────────────────────────────┘
```

---

## Operational Event Taxonomy

All agents subscribe to operational events. No agent polls SAG.

| Event | Source | Consumers |
|---|---|---|
| `portfolio.item.bajo_minimo` | Pressure engine | David, Copilot |
| `portfolio.item.agotado` | Pressure engine | David, Diego, Copilot |
| `production.signal.fired` | David engine | Diego, Copilot |
| `order.reserved` | Order lifecycle | Finanzas, Copilot |
| `order.fulfilled` | SAG sync (inbound) | David, Finanzas, Copilot |
| `inventory.snapshot_updated` | SAG boundary | David, Diego, Finanzas |
| `transfer.suggested` | David engine | Copilot, Coordinator UI |
| `coverage.drop` | Portfolio engine | David, Copilot |

---

## Intelligence Layers

```
Layer 0: Raw SAG data (physical/fiscal — trusted read-only)
Layer 1: Operational Inventory (Agentik formula — physicalQty - reservations - assigned)
Layer 2: Operational Events (pressure, orders, coverage signals)
Layer 3: Agent Reasoning (David/Diego/Finanzas — domain-specific interpretation)
Layer 4: Copilot Coordination (cross-domain synthesis)
Layer 5: User Actions (UI, approvals, escalations)
Layer 6: SAG Sync Outbound (confirmed actions sent to ERP)
```

Each layer consumes from below, never from SAG directly (except Layer 1 via boundary).
