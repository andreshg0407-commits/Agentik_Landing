# SAG Master Data Gaps — SAG-MASTER-DATA-GAPS-01

**Sprint:** SAG-MASTER-DATA-DISCOVERY-01
**Date:** 2026-07-12
**Classification:** Priority (P1=Critical, P2=Strategic, P3=Future)
**Consolidated:** 2026-07-12 (SAG-MASTER-DATA-DISCOVERY-CONSOLIDATION-01)
**Evidence basis:** Codebase forensics + live sync data (not contract-only)

---

## P1 — Critical Gaps (Block Daily Operations)

### GAP-01: CLIENTES Contract Under-Specified

- **Current state:** 5 fields only (ID_CLIENTE, NIT, RAZON_SOCIAL, SEGMENTO, PLAZO_CREDITO)
- **Expected:** ~40 fields for enterprise-grade Customer 360
- **Missing fields:**
  - Identity: TIPO_DOCUMENTO, DIGITO_VERIFICACION, TIPO_TERCERO
  - Contact: TELEFONO, EMAIL, CONTACTO_PRINCIPAL, TELEFONO_CONTACTO
  - Location: DIRECCION, CIUDAD, DEPARTAMENTO, PAIS, CODIGO_DANE, LATITUD, LONGITUD
  - Commercial: ZONA, ID_VENDEDOR, LISTA_PRECIOS, CONDICION_PAGO, DESCUENTO_COMERCIAL
  - Credit: CUPO_CREDITO, CUPO_DISPONIBLE, ESTADO_CREDITO, FECHA_BLOQUEO
  - Status: ACTIVO, ESTADO_CLIENTE, FECHA_CREACION, FECHA_ACTUALIZACION
  - Segmentation: CANAL, TIPO_CLIENTE, CATEGORIA_COMERCIAL, TAMANO_EMPRESA
  - Tax: REGIMEN_TRIBUTARIO, RESPONSABILIDAD_FISCAL, GRAN_CONTRIBUYENTE
- **Impact:** Blocks CustomerIntelligence, Cliente 360, SalesIntelligence, CommercialCopilot, RulesEvidenceEngine
- **Resolution:** Enterprise hardening sprint for clientes SAG contract
- **Effort:** Medium (fields exist in TERCEROS table, just need mapping)
- **Evidence level:** SAMPLE_CONFIRMED -- TERCEROS table active in sync, 5 fields confirmed operationally (ka_nl_tercero, n_nit, sc_nombre, sc_naturaleza, ka_ni_zona). Identity resolution working via NIT normalization + crmId + billing_account_id workaround (CLIENTES-360-01).

### GAP-02: BANCOS Table Structure Unconfirmed

- **Current state:** Contract defines 28 fields for vw_agentik_bancos, but MOVIMIENTOS_BANCO table not confirmed in live SAG
- **SAG tables not found standalone:** CARTERA, INVENTARIO have views; BANCOS status unknown
- **Impact:** Blocks Reconciliation engine, Treasury module, cash position tracking
- **Resolution:** Confirm with SAG whether MOVIMIENTOS_BANCO exists as table/view/materialized view
- **Effort:** Low (discovery only)
- **Evidence level:** DOCUMENTED_ONLY -- 28 fields in contract, 0 operationally validated. MOVIMIENTOS_BANCO table not confirmed in any sync or query.

### GAP-03: RECAUDOS vs PAGOS Separation Unclear

- **Current state:** pagosnew table confirmed. RECAUDOS_CAJA/RECAUDOS_BANCO tables not confirmed.
- **Open question:** Are recaudos stored separately from pagos, or are they the same table with different filters?
- **Principle:** "Recaudo != Pago — el recaudo confirma el ingreso; el pago es la obligacion"
- **Impact:** Blocks correct modeling of cash collection pipeline
- **Resolution:** Confirm with SAG: (1) separation between pagosnew and RECAUDOS; (2) 1:N relationship between recaudo and facturas
- **Effort:** Low (discovery only)
- **Evidence level:** PARTIALLY_VALIDATED -- pagosnew table confirmed. R1/R2/A1/A2/AN cash sources operationally classified in cash-sources.ts (15 rules). F1/F2 universe separation enforced. RECAUDOS_CAJA table NOT confirmed.

### GAP-04: CARTERA Granularity Unknown

- **Current state:** Contract assumes one row per invoice (SALDO_PENDIENTE per document)
- **Open question:** Does SAG track balance at invoice level or only customer-aggregate level?
- **Impact:** Blocks invoice-level aging, individual invoice collection tracking
- **Resolution:** Confirm granularity: per-invoice vs per-customer
- **Effort:** Low (discovery only)
- **Evidence level:** DOCUMENTED_ONLY -- Contract defines 39 fields. Cartera is derived from MOVIMIENTOS saldos. No standalone CARTERA table confirmed.

### GAP-05: CONCILIADO Field Availability

- **Current state:** Referenced in bancos, recaudos, and pagos contracts but not confirmed in SAG
- **Open question:** Does SAG maintain a reconciliation flag, or must Agentik derive it?
- **Impact:** Blocks intelligent reconciliation engine
- **Resolution:** If SAG doesn't have it, Agentik derives CONCILIADO from cross-domain matching rules
- **Effort:** Medium (if derived, need rule engine)
- **Evidence level:** DOCUMENTED_ONLY -- CONCILIADO flag referenced in contracts but not found in any confirmed SAG field list. Reconciliation engine currently derives match status from cross-domain rules (source-contract.ts).

### GAP-06: Inventory Adapter Not in Data Layer

- **Current state:** v_saldos_inventariotallanew confirmed as SAG view. Inventory data flows through Tiendas module (store-replenishment-service.ts) but no CommercialAdapter exists.
- **Impact:** CoverageEngine, TransferEngine, RotationEngine, MarkdownEngine, ProductionSignalEngine all need INVENTORY domain
- **Resolution:** INVENTORY-DOMAIN-01 sprint — create inventory entities, normalizer, quality rules, adapter
- **Effort:** High (full domain implementation)
- **Evidence level:** OPERATIONALLY_VALIDATED -- v_saldos_inventariotallanew confirmed live. SagInventoryItem model active with 5 availability fields (disponible, warehouseQty, reservedQty/pendingPDQty, apCleanupQty, physicalQty). Warehouse topology known: B14/15->B04->B01. READY_WITH_GAPS for INVENTORY-DOMAIN-01.
- **Remaining gaps:** Bodega count conflict (37 vs 49), incremental sync unconfirmed, movement history requires MOVIMIENTOS_ITEMS query.

---

## P2 — Strategic Gaps (Block Intelligence Layers)

### GAP-07: PRODUCCION Contract Under-Specified

- **Current state:** 4 fields only (ID_OP, PRODUCTO_TERM, CANTIDAD_PROD, COSTO_OP)
- **Expected:** ~30 fields for manufacturing intelligence
- **Missing concepts:**
  - OP lifecycle: STATUS, FECHA_INICIO, FECHA_FIN, FECHA_COMPROMISO
  - Bill of materials: raw materials consumed (CN source, 81,367 lines available)
  - Finished product entry: ET source (3,640 events synced)
  - Confeccionista flow: PC (salida) / EC (entrada) tracking
  - Warehouse movements: TR (traslados) for material flow
  - Quality: PORCENTAJE_DESPERDICIO, UNIDADES_RECHAZADAS
  - Production timeline: cumulative OP → CN → ET → TR sequence
- **Impact:** Cannot model full manufacturing lifecycle or production cost intelligence
- **Resolution:** Enterprise hardening sprint + leverage existing ProductionEvent sync (OP/ET/CN)
- **Effort:** High (complex domain, multiple source types)
- **Evidence level:** OPERATIONALLY_VALIDATED -- ProductionEvent model active. 15 SAG FUENTES mapped to universal event types (production-event-mapping.ts). OP: 3,376 orders synced (confirmed). CN: 7,890 headers + 81,367 lines synced (confirmed). ET: 3,640 events synced (header-only, confirmed). Bill of materials data available in CN lines. Contract fields (4) are under-specified vs actual synced data which is much richer.

### GAP-08: Product-Variant Separation Unknown

- **Current state:** ARTICULOS table confirmed with 182 fields. Unclear if one row = one product reference or one row = one talla x color combination
- **SAG fields:** ss_maneja_talla_color flag exists — suggests some products have variants, others don't
- **Impact:** Product normalizer may need different logic for variant vs non-variant products
- **Resolution:** Query ARTICULOS count vs MOVIMIENTOS_ITEMS distinct reference count to determine 1:1 vs 1:N
- **Effort:** Low (single query)

### GAP-09: COMPRAS SAG Tables Not Located

- **Current state:** 47-field contract defined with 12 blocks, but actual SAG tables for purchase orders not confirmed
- **Expected tables:** ORDENES_COMPRA, DETALLE_OC, RECEPCIONES
- **Impact:** Cannot implement purchasing adapter without confirmed table structure
- **Resolution:** Locate purchase order tables in SAG (may be in MOVIMIENTOS with specific FUENTES codes like OC ka=53)
- **Note:** OC (ka=53) is marked OBSOLETA in FUENTES — may indicate POs are not tracked as MOVIMIENTOS but in separate tables
- **Effort:** Medium (discovery + possible separate integration)

### GAP-10: Price List Full Structure Unknown

- **Current state:** ARTICULOS has confirmed price fields: n_valor_venta_normal, n_valor_venta_especial, n_valor_venta_promocion, nd_valor_venta4, nd_precio4..nd_precio8
- **Open questions:**
  - What do nd_precio4 through nd_precio8 represent? (Channel-specific? Customer-tier?)
  - Are there separate price list tables (LISTAS_PRECIO)?
  - Can prices vary by customer or only by product?
- **Impact:** Incomplete pricing model limits MarkdownEngine and margin analysis
- **Resolution:** Confirm price field semantics with Castillitos operations team
- **Effort:** Low (discovery only)

### GAP-11: Marketing Fields — SAG vs Agentik Ownership

- **Current state:** productos contract includes DESCRIPCION_MARKETING, TAGS_MARKETING, PALABRAS_CLAVE, SEO_TITLE, SEO_DESCRIPTION
- **Open question:** Do these fields exist in SAG, or are they Agentik-managed enrichments?
- **Impact:** If Agentik-managed, Product normalizer should NOT expect them from SAG
- **Resolution:** Confirm which fields are SAG-native vs Agentik enrichment
- **Note:** Most likely Agentik-managed (Marketing Studio creates this content)
- **Effort:** Low (clarification only)

### GAP-12: Customer-Vendor Domain Separation

- **Current state:** CUSTOMER domain descriptor includes both CustomerProfile AND VendorProfile entity types
- **SAG reality:** TERCEROS table contains customers, vendors, employees — all with TIPO_TERCERO
- **Open question:** Should vendors (proveedores, confeccionistas) be a separate domain or stay in CUSTOMER?
- **Impact:** Affects adapter design — single adapter for all terceros or separate adapters?
- **Resolution:** Keep in CUSTOMER domain but implement type-based filtering in normalizer
- **Effort:** Low (design decision, no code)

---

## P3 — Future Gaps (No Immediate Blocker)

### GAP-13: LOGISTICS Domain Data Absent

- **Current state:** LOGISTICS domain registered but inactive (v0.0.1, no entity types)
- **SAG data:** FECHA_DESPACHO, FECHA_ENTREGA available in ventas contract but no dedicated logistics tables
- **Impact:** Cannot track shipping, delivery SLA, transport costs
- **Resolution:** Future sprint when logistics tracking becomes priority
- **Effort:** High (new domain, new data sources)

### GAP-14: WORKFORCE Territory Data Limited

- **Current state:** WORKFORCE domain registered but inactive. VENDEDORES table confirmed but territory assignment not modeled.
- **SAG data:** ZONAS (39 values confirmed), VENDEDORES table exists
- **Impact:** Cannot optimize territory assignments or measure seller territory performance
- **Resolution:** Future sprint — extract vendor territory model from CUSTOMER domain
- **Effort:** Medium

### GAP-15: Multi-Company Structure Unclear

- **Current state:** EMPRESA field appears in pagos, ventas, compras, bancos contracts
- **Open question:** Does Castillitos operate as single company or multi-company group?
- **Impact:** Multi-company isolation, consolidated reporting, inter-company transactions
- **Resolution:** Confirm with Castillitos if EMPRESA is always the same value or varies
- **Effort:** Low (discovery)

### GAP-16: Derived Fields — SAG vs Agentik Calculation

- **Current state:** Several fields in contracts are marked as "derived":
  - COSTO_TOTAL_EXISTENCIA = COSTO_PROMEDIO * EXISTENCIA
  - DIAS_COBERTURA = calculated from sales velocity
  - PORCENTAJE_CUMPLIMIENTO = CANTIDAD_RECIBIDA / CANTIDAD_ORDENADA
  - OC_VENCIDA, DIAS_RETRASO = calculated from dates
  - STOCK_PROYECTADO_POST_RECEPCION = stock + pending receipts
  - COMPRA_SUGERIDA_POR_AGENTIK = AI recommendation
  - SCORE_RIESGO_NUMERICO = may be derived
- **Impact:** If SAG calculates these, we consume them; if not, Agentik must calculate
- **Resolution:** For each derived field, confirm SAG availability or document Agentik calculation formula
- **Effort:** Medium (per-field confirmation)

### GAP-17: Historical Data Cutoff

- **Current state:** historicalCutoff defined as "2020-01-01" in products contract
- **Open question:** What is the historical cutoff for each domain? How far back does pagosnew go?
- **Impact:** Trend analysis, customer lifetime value, seasonal patterns
- **Resolution:** Confirm per-domain data availability depth
- **Effort:** Low (queries)

### GAP-18: CRM Data Quality

- **Current state:** 285 CRM quotes with customerId NULL on all (join via billing_account_id instead)
- **Impact:** Customer 360 relies on imperfect CRM→SAG join (via crmId)
- **Resolution:** Fix CRM quote-to-customer mapping or accept billing_account_id workaround
- **Effort:** Medium

---

## Evidence-Based Gap Priority Update

Based on consolidation findings, gap priorities have been re-evaluated:

| Gap | Original Priority | Updated Priority | Reason |
|---|---|---|---|
| GAP-01 | P1 | P1 (confirmed) | TERCEROS active but only 5 fields |
| GAP-02 | P1 | P1 (confirmed) | 0 operationally validated fields |
| GAP-03 | P1 | P1 (partially mitigated) | Cash sources classified, RECAUDOS_CAJA still unconfirmed |
| GAP-04 | P1 | P1 (confirmed) | Granularity still unknown |
| GAP-05 | P1 | P1 (confirmed) | CONCILIADO still unconfirmed in SAG |
| GAP-06 | P1 | P1 (READY_WITH_GAPS) | Infrastructure ready, domain sprint can begin |
| GAP-07 | P2 | P2 (partially mitigated) | Rich data synced, contract lags behind implementation |
| GAP-08 | P2 | P2 (partially mitigated) | ss_maneja_talla_color flag found in ARTICULOS |
| GAP-09 | P2 | P2 (confirmed) | OC marked OBSOLETA in FUENTES |

---

## Gap Summary by Domain

| Domain | Total Gaps | P1 | P2 | P3 | Status |
|---|---|---|---|---|---|
| CUSTOMER (clientes) | 4 | GAP-01 | GAP-12, GAP-18 | GAP-14 | **Most urgent** |
| Finance (bancos) | 3 | GAP-02, GAP-05 | — | GAP-15 | Discovery needed |
| Finance (recaudos) | 1 | GAP-03 | — | — | Discovery needed |
| Finance (cartera) | 1 | GAP-04 | — | — | Discovery needed |
| INVENTORY | 1 | GAP-06 | — | — | Implementation needed |
| PRODUCTION | 1 | — | GAP-07 | — | Hardening needed |
| PRODUCT | 2 | — | GAP-08, GAP-11 | GAP-16 | Clarification needed |
| PURCHASING | 1 | — | GAP-09 | — | Discovery needed |
| PRICING | 1 | — | GAP-10 | — | Clarification needed |
| LOGISTICS | 1 | — | — | GAP-13 | Future |
| HISTORICAL | 1 | — | — | GAP-17 | Future |

---

## Recommended Resolution Order

1. **Discovery batch** (all low-effort, can be done in one meeting with SAG):
   - GAP-02: Confirm MOVIMIENTOS_BANCO
   - GAP-03: Confirm recaudos vs pagos separation
   - GAP-04: Confirm cartera granularity
   - GAP-05: Confirm CONCILIADO availability
   - GAP-08: Confirm product-variant separation
   - GAP-10: Confirm price field semantics
   - GAP-11: Confirm marketing field ownership
   - GAP-15: Confirm multi-company structure

2. **Hardening sprints** (high-value, medium-effort):
   - GAP-01: CLIENTES enterprise hardening (5 → ~40 fields)
   - GAP-07: PRODUCCION enterprise hardening (4 → ~30 fields)

3. **Implementation sprints** (high-effort, high ROI):
   - GAP-06: INVENTORY-DOMAIN-01
   - GAP-09: PURCHASING discovery + PURCHASING-DOMAIN-01

4. **Future** (no current blocker):
   - GAP-13, GAP-14, GAP-16, GAP-17, GAP-18
