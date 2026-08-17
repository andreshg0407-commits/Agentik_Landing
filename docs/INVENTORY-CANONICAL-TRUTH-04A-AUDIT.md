# INVENTORY-CANONICAL-TRUTH-04A — Phase A Audit Results

Date: 2026-08-17
Database: LUDISAM (Castillitos CURRENT)
Period: 202608

## A1: Period Audit

- Global period range: 202005 to 202608 (76 distinct periods)
- View uses single MAX period (202608) across all bodegas
- **29 bodegas have data in period 202608**
- **17 bodegas are STALE** (no data in max period) — mostly closed IMPO containers

### Risk: Mixed periods
The view selects `MAX(k_sc_periodo)` globally. All bodegas that have data in 202608 are included correctly. Stale bodegas (closed containers, inactive stores) naturally drop out because they have no rows in the max period with positive saldo.

**Verdict: LOW RISK** — the global MAX period approach works because all active bodegas post data monthly.

## A2: Grain Audit

- Total view rows: **6,655**
- Distinct products: **2,989**
- Distinct bodegas: **28**
- Grain (CODIGO_PRODUCTO + BODEGA): **CLEAN** — zero duplicates
- 1,290 articles appear in multiple bodegas

**View column names** (confirmed by SELECT TOP 1):
```
CODIGO_PRODUCTO, PRODUCTO, LINEA, CATEGORIA, MARCA, SUCURSAL, BODEGA,
EXISTENCIA, RESERVADO, TRANSITO, DISPONIBLE, COSTO_PROMEDIO, FECHA_ULTIMO_MOVIMIENTO
```

No ARTICULO_ID or BODEGA_ID — only string-based keys.

## A3: Universe & Totals

| Metric | Value |
|--------|-------|
| Total existencia | 726,705 |
| Total reservado | 6,295 |
| Total disponible | 720,410 |
| TRANSITO > 0 rows | 0 (always NULL) |
| Negative existencia | 0 |
| Zero existencia | 20 |
| Negative disponible | 35 |

### saldos_articulos base table (period 202608)
- 7,259 rows, 3,014 articles, 29 bodegas
- View filters: positive > 0 only → loses 624 rows (392 zero + 232 negative)

## A4: Last Movement Audit

- Articles with DIFFERENT FECHA_ULTIMO_MOVIMIENTO across bodegas: **NONE**
- Confirms the view returns the same last movement date for ALL bodegas of an article
- **This is a known view defect**: last movement is per-article globally, not per-article+bodega

## A5: Bodega Classification

### Production/Raw Material (clase=T transit, clase=P permanent)
| ID | Code | Name | Clase | pt | Active |
|----|------|------|-------|----|--------|
| 10 | 01 | BODEGA PRINCIPAL | P | N | S |
| 13 | 04 | PRODUCTO EN PROCESO | T | S | S |
| 14 | 05 | MATERIA PRIMA | P | N | S |
| 15 | 06 | TELAS | P | N | S |
| 16 | 07 | RETAZOS | P | N | S |

### Retail Stores (clase=P or T)
| ID | Code | Name | Active | Exist |
|----|------|------|--------|-------|
| 11 | 02 | BODEGA SANDIEGO | S | 2,972 |
| 31 | 00 | BODEGA CENTRO | S | 3,810 |
| 32 | 23 | GRAN PLAZA | S | 3,566 |
| 39 | 29 | BODEGA CALDAS | S | 4,110 |

### Franchise Stores (clase=T)
F1 Paque Berrio, F3 Bolivar, F6 Bello, F7 Armenia, F9 Pereira (stale), F10 Ibague, F16 Cent May Bogota, F17 Mayorca

### Vendor Suitcases (clase=P)
VEND ORLANDO, CARLOS LEON, LUIS, NESTOR, CARLOS VILLA, FREDY

### Import Containers (mostly inactive)
IMPORTACION (33, active), plus 10+ closed containers

### Special
MUESTRAS (stale), ARREGLOS, SEGUNDAS Y SALDOS, TEMPORAL FLAMINGO, PLAN SEPARE, PAGINA WEB, DEXCATO MC

## A6: Production Audit (vw_agentik_produccion)

| State | Count | Programada | Producida |
|-------|-------|-----------|-----------|
| Cerrada | 3,387 | 1,390,479 | 1,385,589 |
| Abierta | 43 | 11,225 | 0 |

- Active pending production: **11,225 units** (43 open orders)
- No "En Transito" or "Terminada" states found
- BODEGA_DESTINO: 04 (3,373), 01 (51), empty (6)

### Confirmed alias inversion:
- PRODUCTO = code (e.g., "C-2052141B")
- CODIGO_PRODUCTO = description (e.g., "CONJUNTO BERMUDA NINO BABY")

## A7: Transfer Fuentes

| ID | Code | Name | Docs |
|----|------|------|------|
| 34 | TR | TRASLADO ENTRE BODEGAS | 3,053 |
| 206 | TM | TRASLADO DE MALETAS | 154 |
| 153 | TF | TRASLADOS FLAMINGO | 20 |
| 273 | TE | TRASLADO ENTRE BODEGAS LUDISAM | 19 |
| 272 | TL | TRASLADO DE MALETAS LUDISAM | 6 |

## A8: Inventory by Bodega (Top 10 by existencia)

| Bodega | Refs | Existencia | Reservado | Disponible | Valor |
|--------|------|-----------|-----------|------------|-------|
| 05 MATERIA PRIMA | 343 | 553,255 | 0 | 553,255 | $93.5M |
| 24 IMPORTACION | 370 | 57,760 | 348 | 57,412 | $489.1M |
| 01 BODEGA PRINCIPAL | 756 | 54,617 | 5,947 | 48,670 | $608.1M |
| 06 TELAS | 807 | 32,061 | 0 | 32,061 | $323.0M |
| 04 PRODUCTO EN PROCESO | 43 | 11,524 | 0 | 11,524 | $0 |
| 29 BODEGA CALDAS | 835 | 4,110 | 0 | 4,110 | $103.4M |
| 00 BODEGA CENTRO | 731 | 3,810 | 0 | 3,810 | $95.5M |
| 23 GRAN PLAZA | 693 | 3,566 | 0 | 3,566 | $245.6M |
| 02 BODEGA SANDIEGO | 605 | 2,972 | 0 | 2,972 | $85.1M |
| 07 RETAZOS | 392 | 1,424 | 0 | 1,424 | $13.7M |

## A9: Products Dedup (vw_agentik_productos)

- Total rows: **73,519**
- Distinct products: **8,944**
- Avg rows per product: **8.22** (talla/color/barcode combinations)
- Top product: CD-4903239 has 100 rows

## Critical Findings for Phase B+

1. **No numeric IDs in view** — CODIGO_PRODUCTO and BODEGA are string-only. Cross-referencing requires joining through saldos_articulos base tables.

2. **TRANSITO is always NULL** — the view does not compute transit inventory. Transfer tracking must use MOVIMIENTOS with TR/TM fuentes.

3. **RESERVADO only on BODEGA PRINCIPAL** (5,947) and IMPORTACION (348) — all other bodegas show 0 reserved.

4. **Materia Prima dominates existencia** (553K of 727K total) — must separate finished goods from raw materials for commercial KPIs.

5. **PRODUCTO EN PROCESO has $0 costo_promedio** — cost not tracked for WIP inventory.

6. **FECHA_ULTIMO_MOVIMIENTO is per-article, not per-article+bodega** — cannot determine when a specific bodega last received or shipped an article.

7. **Production alias inversion confirmed** — PRODUCTO=code, CODIGO_PRODUCTO=description in vw_agentik_produccion.

8. **Existing sync pipeline** uses CommercialCoverageSnapshot (Prisma) — the control loader reads from this, not directly from SAG views.

## Phase F: Number Reconciliation

User-reported numbers vs SAG canonical truth (2026-08-17):

| User Reports | SAG All Bodegas | SAG Commercial Only | Source |
|-------------|----------------|-------------------|--------|
| 4,007 refs | 2,989 refs | 1,524 refs | CommercialCoverageSnapshot (stale) |
| 89,302 units | 726,705 units | 70,435 units | Mixes raw materials with finished goods |
| 1,327,589 en proceso | 1,401,704 programada | 1,385,589 producida | vw_agentik_produccion totals |

### Root Cause Analysis

1. **Reference count inflation**: Old pipeline does NOT filter by commercial warehouse scope. Raw materials (343 refs in MATERIA PRIMA, 807 in TELAS) inflate the count.

2. **Unit count includes raw materials**: 586,740 units of raw materials (MATERIA PRIMA + TELAS + RETAZOS) are counted alongside 70,435 commercial finished goods. This is misleading.

3. **"En proceso" is total programada**: The production view's CANTIDAD_PROGRAMADA across ALL orders (including closed) sums to 1.4M. The user's 1,327,589 likely reflects a snapshot at a different point.

### Canonical Fix (this sprint)

New canonical inventory contract separates:
- **COMMERCIAL**: 1,524 refs, 70,435 units (stores + principal + suitcases + franchises)
- **SUPPLY_CHAIN**: 586,740 raw material + 11,524 WIP + 57,760 import staging
- **PRODUCTION**: 43 active orders, 11,225 pending units

The control dashboard should show COMMERCIAL numbers, not ALL-bodegas numbers.
