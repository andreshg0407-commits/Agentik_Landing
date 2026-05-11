# FINANCIAL_SOURCE_INTELLIGENCE_MAP.md
## Agentik Financial Source Intelligence — Official Architecture
## DATE: 2026-05-07
## STATUS: V1 CANONICAL

---

## Purpose

This document is the official semantic source architecture for Agentik.
It defines, for every SAG/PYA source code, its financial domain, operational meaning,
AR/AP/treasury impact, which executive dashboard cards it feeds, and its import priority.

This is NOT a raw integration specification. This is financial domain modeling.
Every decision about what to import, display, or reconcile must be traceable to this map.

---

## Governance Rules (from FUENTES CSV header)

| Rule | Value |
|------|-------|
| Primary classification key | `k_sc_codigo_fuente` (the 2-3 char code: FE, R1, C1...) |
| Technical support key | `ka_ni_fuente` (numeric SAG internal ID) |
| ARKETOPS classification | Control fiscal historico — exclude from Agentik V1 |
| NA classification | Obsoleto / excluido — eliminate from all pipelines |

---

## Priority Framework

| Priority | Meaning |
|----------|---------|
| CORE | Directly powers executive KPIs. Required for AR, Revenue, Collections, AP, Treasury cards. Import and display immediately. |
| IMPORTANT | Modifies CORE sources. Required for correct balances (returns, credit notes, discounts, adjustments). Import alongside CORE. |
| SECONDARY | Operational but not executive-critical. Import when corresponding module (production, logistics, HR) is activated. |
| ACCOUNTING_ONLY | Internal accounting adjustments. Relevant for audit/NIIF compliance. Not displayed in executive dashboard. |
| IGNORE_V1 | Do not import. Includes ARKETOPS legacy, N/A eliminated, historical-only, and production-module sources. |

---

## Financial Domains

| Domain | Symbol | Description |
|--------|--------|-------------|
| REVENUE | AR+ | Creates accounts receivable. Legal billing event. |
| COLLECTION | AR- | Reduces accounts receivable. Cash confirmed received. |
| REVENUE_ADJ | AR~ | Modifies existing AR. Credit notes, returns, payment discounts. |
| ACCOUNTS_PAYABLE | AP+ | Creates supplier or expense obligation. |
| AP_REDUCTION | AP- | Reduces CxP. Purchase returns, expense reversals. |
| EXPENSE | EXP | Operational cash outflow or accrued cost. |
| TREASURY | TSY | Cash movement not tied to specific AR/AP. Bank charges, transfers. |
| PENDING_DEPOSIT | PND | Unidentified cash received — not a confirmed cobro. Awaiting bank reconciliation. |
| COMMERCIAL | COM | Pre-revenue. Orders, pipeline. No AR/AP impact. |
| ADVANCE_CLIENT | ADV+ | Client prepayment. Liability until matched to invoice. |
| ADVANCE_SUPPLIER | ADV- | Supplier prepayment. Asset until matched to purchase. |
| INVENTORY | INV | Internal stock movement. No AR/AP impact. |
| PAYROLL | PAY | Labor cost accrual or provision. |
| ACCOUNTING | ACC | Internal correction. Audit trail only. |
| PRODUCTION | PRD | Manufacturing process movement. Production module only. |
| LEGACY | LEG | Historical only. Read-only for balance queries. Never display as current. |
| IGNORE | IGN | Eliminate from all pipelines. |

---

## Full Source Classification Table

### GROUP 1 — REVENUE (Creates AR, F1 Official)

| Code | Name | ka_ni | Domain | AR Impact | AP Impact | Treasury | Feeds Cards | Priority | Notes |
|------|------|-------|--------|-----------|-----------|----------|-------------|----------|-------|
| FE | Factura Electrónica Empresa | 101 | REVENUE | +AR (F1) | — | — | B1 Facturación, B2 Cartera, B4 Revenue | CORE | Principal facturación oficial empresa. Legal DIAN document. |
| FD | Facturación Electrónica San Diego | 175 | REVENUE | +AR (F1) | — | — | B1, B2, B4 | CORE | Factura oficial almacén San Diego. |
| FC | Factura Electrónica Centro | 176 | REVENUE | +AR (F1) | — | — | B1, B2, B4 | CORE | Factura oficial almacén Centro. |
| FG | Facturación Electrónica Gran Plaza | 177 | REVENUE | +AR (F1) | — | — | B1, B2, B4 | CORE | Factura oficial almacén Gran Plaza. |
| FA | Factura Electrónica Caldas | 194 | REVENUE | +AR (F1) | — | — | B1, B2, B4 | CORE | Factura oficial almacén Caldas. |
| FW | Factura Electrónica Web | 207 | REVENUE | +AR (F1) | — | — | B1, B2, B4 | CORE | Factura oficial canal e-commerce. |
| F2 | Remisión (F2) | 2 | REVENUE | +AR (F2) | — | — | B4 F2 track | IMPORTANT | Facturación empresa Fuente 2 (no oficial). Separate cartera track. |
| E1 | Egresos (OFICIAL) | 3 | REVENUE | +AR? | — | — | Pending review | SECONDARY | IMPACTA VENTAS=SI(+) but named "Egresos". Likely legacy billing entry or manual revenue. Flag for accounting review before display. |

### GROUP 2 — COLLECTIONS (Reduces AR)

| Code | Name | ka_ni | Domain | AR Impact | Cash Impact | Reconciliation | Feeds Cards | Priority | Notes |
|------|------|-------|--------|-----------|-------------|----------------|-------------|----------|-------|
| R1 | Recibo de Caja F1 Empresa | 4 | COLLECTION | -AR (F1) | +Cash | Links to FE invoices | B1 Cobros hoy, B4 Cobros identificados | CORE | Pago recibido sobre facturación oficial F1. Primary collection source. |
| RS | Recibo de Caja San Diego | 108 | COLLECTION | -AR (F1) | +Cash | Links to FD invoices | B1, B4 | CORE | POS cobro almacén San Diego. |
| RC | Recibo de Caja Centro | 174 | COLLECTION | -AR (F1) | +Cash | Conciliar con Sistecredit fin de mes | B1, B4 | CORE | Abonos Sistecredit en tienda Centro. Informativo — conciliar mensualmente. |
| RG | Recibo de Caja Gran Plaza | 178 | COLLECTION | -AR (F1) | +Cash | Conciliar con Sistecredit fin de mes | B1, B4 | CORE | Abonos Sistecredit en tienda Gran Plaza. Informativo — conciliar mensualmente. |
| RA | Recibo de Caja Caldas | 198 | COLLECTION | -AR (F1) | +Cash | Conciliar con Sistecredit fin de mes | B1, B4 | CORE | Abonos Sistecredit en tienda Caldas. Informativo — conciliar mensualmente. |
| AN | Anticipos Sistecredit | 12 | ADVANCE_CLIENT | +Liability | +Cash | Conciliar con Sistecredit fin de mes | B1, B4 | CORE | Efectivo tiendas en el momento del recaudo. Conciliar mensualmente con Sistecredit. |
| A1 | Anticipo Cliente Empresa | 122 | ADVANCE_CLIENT | +Liability | +Cash | Match to future FE invoice | B1, B4 | CORE | Anticipos oficiales clientes empresa. |
| R2 | Recibo de Caja F2 | 94 | COLLECTION | -AR (F2) | +Cash | Links to F2 remisiones | B4 F2 track | IMPORTANT | Pago sobre remisión no oficial F2. Separate from R1 cartera. |
| A2 | Anticipo Cliente F2 | 128 | ADVANCE_CLIENT | +Liability (F2) | +Cash | Match to future F2 invoice | B4 | IMPORTANT | Anticipo F2 — impacta tesorería. |

### GROUP 3 — REVENUE ADJUSTMENTS (Modifies AR)

| Code | Name | ka_ni | Domain | AR Impact | Revenue Impact | Feeds Cards | Priority | Notes |
|------|------|-------|--------|-----------|----------------|-------------|----------|-------|
| NC | Nota Crédito Electrónica Empresa | 139 | REVENUE_ADJ | -AR (F1) | -Revenue (F1) | B2 Cartera neta | IMPORTANT | Reduce facturación F1. No representa ingreso nuevo. IMPACTA VENTAS=SI(-). |
| NE | Nota Crédito Electrónica | 102 | REVENUE_ADJ | -AR (F1) | -Revenue (F1) | B2 | IMPORTANT | Nota crédito oficial empresa. IMPACTA VENTAS=SI(+) — verify direction. |
| ND | Nota Crédito — Descuentos Financieros | 170 | REVENUE_ADJ | -AR | -Revenue | B4 Cobros | IMPORTANT | Descuentos financieros aplicados al pago de facturas. Reduce AR but is not a cash collection. |
| NF | Nota Crédito — Devoluciones Clientes | 171 | REVENUE_ADJ | -AR (F1) | -Revenue (F1) | B2 Cartera | IMPORTANT | Devoluciones de clientes. Afecta inventario en positivo. |
| NA | Nota Crédito Electrónica Caldas | 196 | REVENUE_ADJ | -AR (F1) | -Revenue | B2 | IMPORTANT | Notas crédito almacén Caldas — devoluciones clientes. |
| NG | Nota Crédito Electrónica Gran Plaza | 197 | REVENUE_ADJ | -AR (F1) | -Revenue | B2 | IMPORTANT | Notas crédito almacén Gran Plaza — devoluciones clientes. |
| NS | Nota Crédito Electrónica San Diego | 200 | REVENUE_ADJ | -AR (F1) | -Revenue | B2 | IMPORTANT | Notas crédito almacén San Diego — devoluciones clientes. |
| NT | Nota Crédito Electrónica Centro | 202 | REVENUE_ADJ | -AR (F1) | -Revenue | B2 | IMPORTANT | Notas crédito almacén Centro — devoluciones clientes. |
| NW | Nota Crédito Electrónica Web | 208 | REVENUE_ADJ | -AR (F1) | -Revenue | B2 | IMPORTANT | Notas crédito canal web. |
| D2 | Devolución Ventas F2 | 98 | REVENUE_ADJ | -AR (F2) | -Revenue (F2) | B4 | IMPORTANT | Devoluciones F2. Afecta inventario en positivo y cartera en negativo. |
| D1 | Devolución Ventas F1 | 25 | REVENUE_ADJ | -AR (F1) | -Revenue (F1) | — | IGNORE_V1 | ACTIVO=NO, HISTORIAL=SI. Replaced by NF. Read-only for historical balance. |

### GROUP 4 — ACCOUNTS PAYABLE (Creates/Modifies Obligations)

| Code | Name | ka_ni | Domain | AP Impact | Cash Impact | Feeds Cards | Priority | Notes |
|------|------|-------|--------|-----------|-------------|-------------|----------|-------|
| C1 | Factura de Compra F1 | 1 | ACCOUNTS_PAYABLE | +CxP (F1) | — | B3 Cuentas por pagar | CORE | Compra oficial que genera obligación con proveedor. |
| G1 | Gastos Causados | 10 | ACCOUNTS_PAYABLE | +CxP | — | B3 Cuentas por pagar | CORE | Obligación ya reconocida contablemente. Afecta utilidad y CxP aunque no haya pago inmediato. |
| C2 | Factura de Compras F2 | 95 | ACCOUNTS_PAYABLE | +CxP (F2) | — | B3 CxP (F2 track) | IMPORTANT | Compra Fuente 2 que genera CxP. |
| DC | Devolución Compras | 27 | AP_REDUCTION | -CxP | — | B3 | IMPORTANT | Devoluciones de compras oficiales afectan CxP en negativo. |
| DG | Devolución Gastos | 130 | AP_REDUCTION | -CxP | — | B3 | IMPORTANT | Devoluciones de gastos causados afectan CxP en positivo (reduces obligation). |
| NO | Provisión Nómina | 105 | PAYROLL | +CxP (payroll) | — | B3 (future payroll) | SECONDARY | Provisión mensual de nómina. 1 vez por fin de mes. Accrual de obligación laboral. |

### GROUP 5 — TREASURY (Cash Without AR/AP)

| Code | Name | ka_ni | Domain | Treasury Impact | Reconciliation | Feeds Cards | Priority | Notes |
|------|------|-------|--------|-----------------|----------------|-------------|----------|-------|
| DB | Notas Débito Bancarias | 21 | TREASURY | -Cash (bank charge) | Bank statement matching | B3 Tesorería inmediata | IMPORTANT | Débito bancario: comisión, ajuste, cargo automático. Reduces caja — no AR/AP. |
| E2 | Egresos F2 | 97 | EXPENSE | -Cash | — | B3 cash outflows | SECONDARY | Salida de dinero F2. No afecta ventas — solo flujo de caja en egresos de tesorería. |
| G2 | Gastos F2 | 96 | EXPENSE | — | — | — | SECONDARY | Gasto operativo no oficial. No relacionado con ingreso. |
| 1V | Anticipo Proveedores F1 | 68 | ADVANCE_SUPPLIER | -Cash (+Asset) | Match to C1 when invoice arrives | B3 | IMPORTANT | Salida adelantada a proveedor. Activo hasta cruzarse con factura de compra. |
| 2V | Anticipo Proveedores F2 | 141 | ADVANCE_SUPPLIER | -Cash (+Asset) | Match to C2 | B3 | IMPORTANT | Anticipo proveedor F2. Mismo flujo que 1V pero en track F2. |

### GROUP 6 — PENDING DEPOSITS (Unidentified Cash — Critical for Reconciliation)

| Code | Name | ka_ni | Domain | Cash State | Reconciliation Role | Feeds Cards | Priority | Notes |
|------|------|-------|--------|------------|---------------------|-------------|----------|-------|
| B1 | Consignación Pendiente Bancolombia CRT 0711 | 148 | PENDING_DEPOSIT | Cash received, unidentified | Match to R1/RS/etc. at month-end | B3 Tesorería (pending) | IMPORTANT | Dinero recibido sin identificar. NO cuenta como cobro final. Conciliar fin de mes. |
| B2 | Consignación Pendiente Banco Bogotá CRT 9945 | 149 | PENDING_DEPOSIT | Cash received, unidentified | Match to R1/RS/etc. at month-end | B3 Tesorería (pending) | IMPORTANT | Mismo flujo que B1, cuenta Banco Bogotá. |
| H1 | Consignación Pendiente Bancolombia Ahorros 0313 | 150 | PENDING_DEPOSIT | Cash received, unidentified | Match to R1/RS/etc. at month-end | B3 Tesorería (pending) | IMPORTANT | Bancolombia cuenta ahorros. |
| H2 | Consignación Pendiente Bancolombia Ahorros 6827 | 151 | PENDING_DEPOSIT | Cash received, unidentified | Match to R1/RS/etc. at month-end | B3 Tesorería (pending) | IMPORTANT | Bancolombia cuenta ahorros segunda. |
| CP | Consignaciones Pendientes (genérico) | 152 | PENDING_DEPOSIT | Cash received, unidentified | Fallback pending bucket | B3 Tesorería (pending) | IMPORTANT | Bucket genérico cuando no se identifica banco específico. |

**CRITICAL RULE**: B1, B2, H1, H2, CP must NEVER be counted as confirmed cobros.
They are unidentified treasury receipts pending bank-to-client reconciliation at month end.
Display as: "X consignaciones por identificar — COP Y" with amber/warning state.

### GROUP 7 — COMMERCIAL (Pre-Revenue)

| Code | Name | ka_ni | Domain | Financial Impact | Feeds Cards | Priority | Notes |
|------|------|-------|--------|-----------------|-------------|----------|-------|
| PD | Pedidos Clientes | 40 | COMMERCIAL | None (future AR) | B1 Pedidos del día, B4 Pipeline | CORE | Orden formal de venta PREVIA a facturación. "PEDIDOS DEL DIA SALE DE ESTA FUENTE." Proyección comercial y control operativo. |
| AP | Ajuste Pedidos | 41 | COMMERCIAL | None | B4 trazabilidad | SECONDARY | Informe de trazabilidad de despachos por pedido. |

### GROUP 8 — INVENTORY MOVEMENTS (No Financial Impact)

| Code | Name | ka_ni | Domain | Financial Impact | Feeds Cards | Priority | Notes |
|------|------|-------|--------|-----------------|-------------|----------|-------|
| TR | Traslado entre Bodegas | 34 | INVENTORY | None | — | SECONDARY | Movimiento interno entre bodegas/puntos de venta. No genera ingreso ni recaudo. |
| TM | Traslado de Maletas | 206 | INVENTORY | None | — | SECONDARY | Igual que TR. Movimiento interno no oficial. |
| AI | Ajuste de Inventario | 76 | INVENTORY | None | — | SECONDARY | Afecta directamente el inventario. Sin impacto AR/AP. |
| IF | Inventario Físico | 65 | INVENTORY | None | — | SECONDARY | Digitalización inventario físico mes a mes. |
| DS | Desglose de Mercancía | 157 | INVENTORY | None | — | SECONDARY | Movimiento interno de inventario. |

### GROUP 9 — ACCOUNTING ADJUSTMENTS (Internal)

| Code | Name | ka_ni | Domain | Financial Impact | Feeds Cards | Priority | Notes |
|------|------|-------|--------|-----------------|-------------|----------|-------|
| J1 | Ajustes Contables | 17 | ACCOUNTING | Varies | Audit trail only | ACCOUNTING_ONLY | Corrección contable interna. Revisar naturaleza antes de clasificar impacto. |
| J2 | Ajuste Contable F2 | 113 | ACCOUNTING | Varies | — | ACCOUNTING_ONLY | Auditoría contabilidad F2. |
| AJ | Ajustes Medios de Pago | 125 | ACCOUNTING | None current | — | IGNORE_V1 | HISTORIAL=SI, ACTIVO=NO. No usar. |
| BN | Bonos Regalo | 156 | ACCOUNTING | +Liability (deferred revenue) | — | SECONDARY | Cuando venden bonos regalo. Crea pasivo hasta redención. |
| DE | Doc Soporte Electrónico Gasto | 158 | ACCOUNTING | +CxP (expense) | B3 | SECONDARY | Causar gastos oficiales sin soporte físico. Equivale a G1 para gastos sin factura. |
| T3 | Doc Soporte Electrónico | 163 | ACCOUNTING | +CxP (expense) | B3 | SECONDARY | Mismo propósito que DE. |

### GROUP 10 — PRODUCTION MODULE (Scope: future production feature)

All sources with CLASIFICACION = PRODUCCION are **IGNORE_V1** — scoped to the production module, not operational finance.

| Codes | IGNORE_V1 |
|-------|-----------|
| OP, CN, PT, PC, EC, 4, MV, ET, CM, T2, Y1, AD (produccion), CV, T1, M2, SR | FUENTE QUE SOLO USA PRODUCCION |

### GROUP 11 — ARKETOPS LEGACY (Accounting/NIIF system imports)

All sources with CLASIFICACION = ARKETOPS are **IGNORE_V1** — these are external NIIF accounting system entries, not operational SAG data.

| Codes | IGNORE_V1 |
|-------|-----------|
| S1, S2, S3, S4, DE (dep), CI, CB, AC, S5, DF, K1, K, K2, IC, FI, GI, PX, GX, LX, DI, FT, PI, AX, LI | Saldos iniciales, depreciaciones, ajustes NIIF — EXCLUIR |
| AD (activos fijos), DN | Activos fijos NIIF — EXCLUIR |
| J1 | Shared with ACCOUNTING_ONLY — treat as audit-only |

### GROUP 12 — N/A ELIMINATED (Remove from all pipelines)

These sources are marked ACTIVO=NO, VISIBLE=NO, NO SE USA. **IGNORE_V1** — do not import, query, or display.

| Codes |
|-------|
| N2, NP, CT, OC, VV, AK, OT, T+, T-, CA, XX (Sistecredit duplicate), ES, EM, TC, I1, TB, FL, PS, FS, AS, VA, SI (Sistecredit duplicate code) |

### GROUP 13 — HISTORICAL ONLY (Balance preservation, no current ops)

These sources were used previously (SE USO HACE TIEMPO). HISTORIAL=SI, ACTIVO=NO. **IGNORE_V1** for display — import only if back-populating historical balances.

| Codes |
|-------|
| VC, AA, EA, V1, F1 (old), V2, V3, 2D, 3D, RM, NX, SC, SG, PP, AG, FX, SA, TF, FF, ED, CE, GE, F3, R3, D3, A3, P1, P2, 4D, V4, V5, 5D, DT, DX, V6, 6D, DL |

Note: F1 (ka_ni=93, old Factura de Venta) is superseded by FE (ka_ni=101). Historical cartera prior to FE activation lives under old V1-V6 and F1 codes.

---

## OFFICIAL V1 FINANCIAL SOURCES

The minimum safe source set to power Torre de Control executive dashboard.
All CORE and IMPORTANT sources in Groups 1–7.

### Revenue (AR Creation)
| Code | Use For |
|------|---------|
| FE | Cartera empresa, daily billing KPI |
| FD | Cartera San Diego |
| FC | Cartera Centro |
| FG | Cartera Gran Plaza |
| FA | Cartera Caldas |
| FW | Cartera Web |

### Collections (AR Reduction)
| Code | Use For |
|------|---------|
| R1 | Cobros identificados empresa (primary) |
| RS | Cobros San Diego |
| RC | Cobros Centro (Sistecredit) |
| RG | Cobros Gran Plaza (Sistecredit) |
| RA | Cobros Caldas (Sistecredit) |
| AN | Anticipos Sistecredit (reconciliar mensualmente) |
| A1 | Anticipos clientes empresa |

### Revenue Adjustments (AR Modification)
| Code | Use For |
|------|---------|
| NC | Notas crédito empresa (reduce cartera) |
| NE | Notas crédito empresa (adjust) |
| ND | Descuentos financieros en pagos |
| NF | Devoluciones clientes empresa |
| NA, NG, NS, NT, NW | Notas crédito por almacén |

### Accounts Payable
| Code | Use For |
|------|---------|
| C1 | Facturas compra F1 (creates CxP) |
| G1 | Gastos causados (accrued CxP) |
| DC | Devoluciones compras (reduces CxP) |
| DG | Devoluciones gastos (reduces CxP) |

### Treasury & Pending
| Code | Use For |
|------|---------|
| DB | Cargos bancarios (reduces caja) |
| 1V, 2V | Anticipos proveedores (cash outflow) |
| B1, B2, H1, H2, CP | Consignaciones pendientes — display as "por identificar", never as cobro |

### Commercial Pipeline
| Code | Use For |
|------|---------|
| PD | Pedidos del día — sales pipeline, commercial projection |

### F2 Track (Parallel, Non-Official)
| Code | Use For |
|------|---------|
| F2 | Remisiones (F2 revenue — separate cartera) |
| R2 | Cobros F2 |
| C2, G2 | Compras/gastos F2 |
| D2 | Devoluciones F2 |

---

## Source Count Summary

| Group | Count | Priority |
|-------|-------|----------|
| Revenue F1 | 7 (FE,FD,FC,FG,FA,FW,E1) | CORE (6) + SECONDARY (1) |
| Collections | 9 (R1,RS,RC,RG,RA,AN,A1,R2,A2) | CORE (7) + IMPORTANT (2) |
| Revenue Adjustments | 11 (NC,NE,ND,NF,NA,NG,NS,NT,NW,D1,D2) | IMPORTANT (10) + IGNORE (1) |
| Accounts Payable | 6 (C1,G1,C2,DC,DG,NO) | CORE (2) + IMPORTANT (3) + SECONDARY (1) |
| Treasury | 5 (DB,E2,G2,1V,2V) | IMPORTANT (3) + SECONDARY (2) |
| Pending Deposits | 5 (B1,B2,H1,H2,CP) | IMPORTANT (5) |
| Commercial | 2 (PD,AP) | CORE (1) + SECONDARY (1) |
| Inventory | 5 (TR,TM,AI,IF,DS) | SECONDARY (5) |
| Accounting | 6 (J1,J2,AJ,BN,DE,T3) | ACCOUNTING_ONLY/SECONDARY |
| Production | 14 | IGNORE_V1 |
| ARKETOPS | 26 | IGNORE_V1 |
| N/A Eliminated | 21 | IGNORE_V1 |
| Historical | 37 | IGNORE_V1 |
| **TOTAL** | **164** | — |

**Active V1 Sources (CORE + IMPORTANT)**: 38 sources
**Operational sources (+ SECONDARY)**: 52 sources
**Ignore entirely**: 112 sources (ARKETOPS + N/A + Historical + Production)
