# SAG/PYA Integration — Meeting Preparation

**Sprint:** AGENTIK-SAG-OPERATIONAL-CONTRACT-01
**Document type:** Technical meeting prep
**Last updated:** 2026-05-25

---

## Context Shift

Previous framing: "How does Agentik use SAG?"
**New framing: "How does Agentik consume ERP data to build operational intelligence?"**

Agentik is NOT a SAG replacement. It is an Operational Intelligence System built on top of SAG.
SAG remains the fiscal/legal source of truth. Agentik builds the reasoning layer above it.

---

## What Agentik Needs from SAG

### 1. Inventory Views

**Required:**
- Physical inventory per reference: `v_saldos_inventariotallanew` or equivalent
- Fields needed: `reference`, `description`, `line`, `category`, `physical_qty`, `warehouse_id`

**Optional but valuable:**
- Inventory by size/talla (if product has size dimension)
- Inventory by location/bodega
- Transit inventory (en camino entre bodegas)

**NOT needed from SAG:**
- SAG's computed "disponible" (Agentik computes its own)
- SAG reservation state (Agentik maintains its own reservation layer)

---

### 2. Inventory Movements (Kardex)

**Required for velocity computation:**
- Movement date
- Reference
- Movement type: entrada / salida / ajuste / transferencia / devolución
- Qty
- Document reference (PD/F1/F2/NC)

**Purpose:** Agentik computes sold velocity to prioritize production signals and transfer recommendations.

**Minimum window needed:** Last 90 days of movements per reference.

---

### 3. Pending Orders (PD — Pedidos)

**Critical question for SAG team:**
> "Does your SAG configuration deduct PD (pending orders) from the disponible field?"

If yes: we need PD separately to avoid double-counting.
If no: we need PD to add to our demand picture.

**Fields needed:**
- PD reference number
- Reference (SKU)
- Qty ordered
- Qty pending (not yet dispatched)
- Vendor/customer identifier
- Authorization status
- Request date

---

### 4. Produced / Completed Lots

**For production signal resolution:**
- Production order reference
- Reference (SKU)
- Qty produced
- Completion date
- Whether it has been moved to warehouse inventory

---

### 5. Document Status

**For order lifecycle tracking:**
- F1/F2 status (issued, cancelled, reversed)
- NC (Nota Crédito) issued against which F1/F2
- Remisión status
- PD status (autorizado, parcial, cumplido, cancelado)

---

## Technical Questions for SAG Team

### Performance and Access

1. **Read-only ODBC access** — Can Agentik connect via ODBC in read-only mode to a replica or reporting schema?

2. **Query frequency** — What is the safe polling frequency for inventory views without causing locks or performance degradation?
   - Suggestion: every 15–30 min for inventory, every 5 min for PD/documents

3. **SQL read-only views** — Are there dedicated reporting views (not production tables)?
   - Specifically: `v_saldos_inventariotallanew` — is it safe for external queries?

4. **Replication** — Is there a read replica or reporting database Agentik should connect to instead of the production SAG instance?

5. **Row limits** — What is the typical row count for inventory per company? (Performance planning)

6. **Locks** — Do SAG inventory queries during business hours cause table locks? What is the safest query window?

7. **Triggers** — Can SAG fire triggers or webhooks when specific events occur (invoice created, PD authorized)?
   If so: what events and what payload format?

---

### Data Model Questions

8. **Company codes** — How is multi-company isolation implemented in SAG? Is it a `company_code` column or separate schemas?

9. **Reference format** — Is the product reference always uppercase? Is it padded? Case-sensitive?

10. **Warehouse IDs** — How are warehouses identified? Are there multiple warehouses per company that affect disponible?

11. **PD and disponible** — Confirmed from prior exchange: some companies deduct PD from disponible, others don't. Which parameter controls this? Can Agentik detect it programmatically?

12. **Size dimension** — For footwear (Castillitos): how is size encoded in the reference? Is it part of the SKU or a separate field?

---

### Operational Questions

13. **Reservation model** — Does SAG have a native reservation concept (holding units for a customer before PD is created)?

14. **Authorization levels** — At what point does a PD affect warehouse disponible? At creation? Authorization? Dispatch?

15. **Production model** — How is a production order created in SAG? What triggers it? What closes it?

16. **Return process** — When a NC is issued, how and when are units returned to inventory in SAG?

17. **Multi-warehouse transfers** — If units are transferred between warehouses, does SAG reflect this as a movement? What delay between physical transfer and SAG update?

---

## What Agentik Will NOT Ask SAG to Do

- No direct writes to SAG production tables
- No schema modifications
- No new stored procedures
- No fiscal document generation
- No DIAN integration
- No modification of SAG's "disponible" parametrization

Agentik's approach: read-only consumption of SAG data, bidirectional only for confirmed operational documents (PD/OP) via defined integration points.

---

## Proposed Integration Phases

### Phase 1 — Read-Only Snapshot (current V1)
- SAG admin exports inventory as Excel/CSV
- Agentik imports via file
- Frequency: daily or manual
- Already working for Castillitos

### Phase 2 — ODBC Read (V2)
- Read-only ODBC connection to SAG reporting schema
- Query inventory, movements, PD status
- Polling every 15–30 minutes
- Requires: ODBC DSN, read-only credentials, safe query windows

### Phase 3 — Event Polling (V2.5)
- Agentik polls for document status changes
- PD created → Agentik notified
- F1/F2 issued → Agentik marks order fulfilled
- Requires: document history view with timestamps

### Phase 4 — Bidirectional (V3)
- Agentik confirmed orders → SAG PD via API or direct insert
- SAG document events → Agentik webhook
- Requires: SAG API endpoint or database trigger + Agentik receiver
- Production signals from Agentik → SAG OP creation

---

## Meeting Agenda Suggestion

1. (10 min) Confirm SAG's data model for inventory + PD
2. (10 min) Technical access options: ODBC vs API vs exports
3. (10 min) Performance and lock safety discussion
4. (5 min) Document event availability (triggers/polling)
5. (10 min) Integration phase agreement
6. (5 min) Security and access provisioning process
