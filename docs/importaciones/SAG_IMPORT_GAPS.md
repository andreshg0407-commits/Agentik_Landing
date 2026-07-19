# SAG Import Gaps Analysis

Sprint: SAG-IMPORT-RESEARCH-01
Generated: 2026-07-10
Tenant: Castillitos (SAG ERP)

---

## Summary

| Category | Count |
|---|---|
| FOUND (available in SAG) | 8 |
| MISSING (not in SAG, not derivable) | 2 |
| INFERRED (derivable from existing data) | 6 |
| BUG (current code uses wrong field/logic) | 3 |

---

## 1. FOUND — Data available in SAG

### F1. Fecha de ingreso (Entry date)
- **Source**: MOVIMIENTOS.d_fecha_documento WHERE ka_ni_fuente IN (182, 189)
- **Status**: FOUND
- **Evidence**: All 12 sample references have FI(182) dates. Example: ref 9103 first import 2024-03-23.
- **Notes**: Use FI and FT fuentes only. PX dates are provision dates, not physical receipt dates.

### F2. Cantidad importada (Total imported quantity)
- **Source**: SUM(MOVIMIENTOS_ITEMS.n_cantidad) WHERE ka_ni_fuente IN (182, 189) AND n_cantidad > 0
- **Status**: FOUND
- **Evidence**: ref 9103 = 1,440 units (FI), ref C2-AL-1 = 200 (FI) + 1,800 (FT) = 2,000 units.
- **Double-counting warning**: FI and FT can document the SAME shipment. Use document-number deduplication.

### F3. Proveedor (Provider)
- **Source**: MOVIMIENTOS.ka_nl_tercero → TERCEROS, or MOVIMIENTOS.sc_beneficiario
- **Status**: FOUND
- **Evidence**: All import documents have provider: "CONMAN SOLUTION IMPORT S.A.S", "INDUSTRIAS DIANA ALZATE SAS", etc.

### F4. Precios PV3/PV4
- **Source**: v_articulos.nd_precio3 (PV3 detal), v_articulos.nd_precio4 (PV4 mayorista)
- **Status**: FOUND
- **Evidence**: ref 9103: PV3=12,900, PV4=5,670. Confirmed against Excel mapping.
- **Current bug**: Code queries n_valor_venta_promocion and nd_valor_venta4 which DO NOT EXIST.

### F5. Bodega/warehouse of import
- **Source**: MOVIMIENTOS.ka_nl_bodega WHERE ka_ni_fuente IN (182, 184, 189)
- **Status**: FOUND
- **Evidence**: Import warehouses are ka_nl_bodega = 33, 36, 37, 41. Mapping to ss_codigo = 24, 26, 27, 30.
- **Current bug**: IMPORT_WAREHOUSE_CODES uses ss_codigo [24, 42-46] but misses 26, 27, 30.

### F6. Tipo de documento importacion
- **Source**: FUENTES table — 10 import-specific fuente types identified
- **Status**: FOUND
- **Evidence**: FI(182), PX(184), FT(189), GI(183), LX(186), DI(187), PI(201), LI(205), AX(204), GX(185)

### F7. Fecha de cancelacion/anulacion
- **Source**: MOVIMIENTOS.sc_anulado = 'S'
- **Status**: FOUND
- **Evidence**: In 12-reference sample, 4 PD documents and 5 IF documents marked cancelled.

### F8. Articulo con talla/color (variants)
- **Source**: v_articulos.sc_maneja_tc = 'S' + MOVIMIENTOS_ITEMS.ss_talla, ss_color
- **Status**: FOUND
- **Evidence**: All 12 import references have sc_maneja_tc = 'S'. Talla/color in movement items.

---

## 2. MISSING — Not available in SAG

### M1. Contenedor / Shipment ID
- **What we need**: A unique identifier linking all documents (FI + PX + FT + GI + LX) for one physical shipment.
- **Status**: MISSING
- **Evidence**: No field in MOVIMIENTOS or v_articulos maps to a container/shipment number. Documents share n_numero_documento only sometimes (e.g., FI and FT doc 37119 for C2-AL-1).
- **Workaround**: Group by (d_fecha_documento, ka_nl_tercero, ka_nl_bodega) as a heuristic shipment cluster.

### M2. Direct stock/saldo query
- **What we need**: Current inventory balance per article per warehouse from SAG.
- **Status**: MISSING (via SOAP)
- **Evidence**: SAG has no "saldos" view exposed via the SOAP interface. ProductInventoryLevel in Prisma is the only source.
- **Workaround**: Use ProductInventoryLevel (already synced). Or derive from SUM(all MOVIMIENTOS_ITEMS.n_cantidad).

---

## 3. INFERRED — Derivable from existing data

### I1. Cantidad restante (Remaining stock)
- **Method**: ProductInventoryLevel.quantity WHERE warehouseId IN import warehouses
- **Status**: INFERRED
- **Notes**: Currently works but misses warehouses ss_codigo 26, 27, 30.

### I2. Ventas acumuladas (Accumulated sales)
- **Method**: SUM(CustomerOrderLine.quantity) WHERE order.status = 'FACTURADO' AND quantity > 0
- **Status**: INFERRED
- **Notes**: Already implemented in import-service.ts.

### I3. Ventas ultimos 6 meses
- **Method**: Same as I2 with date filter >= 6 months ago
- **Status**: INFERRED
- **Notes**: Already implemented.

### I4. Clasificacion ventas (detal/mayorista)
- **Method**: Compare CustomerOrderLine.unitValue against PV3/PV4 thresholds
- **Status**: INFERRED
- **Depends on**: F4 (PV3/PV4 must be correct — currently buggy)

### I5. Tiempo de venta (Days since last entry)
- **Method**: DATEDIFF(today, MAX(d_fecha_documento)) WHERE ka_ni_fuente IN (182, 189)
- **Status**: INFERRED
- **Notes**: Currently uses SAG receipt dates from C1/C2 (wrong fuentes).

### I6. Exito de importacion (% sold)
- **Method**: (soldNet / totalImported) * 100
- **Status**: INFERRED
- **Depends on**: F2 (total imported) and I2 (accumulated sales) both being correct.

---

## 4. BUGS — Current code using wrong fields/logic

### B1. Price field names (CRITICAL)
- **File**: `lib/comercial/data-sources/sag-direct-commercial-product-data-source.ts`
- **Bug**: Queries `n_valor_venta_promocion` and `nd_valor_venta4` — these columns DO NOT EXIST in SAG v_articulos
- **Fix**: Use `nd_precio3` (PV3) and `nd_precio4` (PV4)
- **Impact**: All PV3/PV4 values return null → channel classification falls back to "sin_datos"

### B2. Receipt fuente codes (CRITICAL)
- **File**: `lib/comercial/data-sources/sag-direct-commercial-product-data-source.ts`
- **Bug**: `PURCHASE_FUENTE_IDS = [1, 95]` (C1/C2 = domestic purchase). Import products NEVER appear in C1/C2 documents.
- **Fix**: Use ka_ni_fuente IN (182, 189) for import receipts. Keep C1/C2 for domestic products.
- **Impact**: totalImported, entryDate, lastEntryDate, batchCount all return null/0 for ALL import products
- **Evidence**: 12/12 sample references show "First purchase date: NONE", "Total purchased: 0" — because C1/C2 returns zero rows.

### B3. Import warehouse codes (MEDIUM)
- **File**: `lib/comercial/importaciones/import-service.ts`
- **Bug**: `IMPORT_WAREHOUSE_CODES = ["24", "42", "43", "44", "45", "46"]` — misses ss_codigo 26, 27, 30
- **Fix**: Add "26", "27", "30" to the set (plus "31", "32", "33", "34" for newer containers)
- **Impact**: Import stock from IMPORTACION PARTE 1/2 and IMPO CONTENEDOR 2 not counted in "remaining"
- **Evidence**: References 9103 (WH 36=ss26), 34831-6 (WH 37=ss27), C2-AL-1 (WH 41=ss30) all have import entries in missing warehouses

---

## 5. Document Flow Diagram

```
Proveedor China ──→ FT (189) ──→ IMPO CONTENEDOR (WH 41/42/43...)
                                        │
                                        ▼
                                  PX (184) [provision — cost allocation]
                                        │
                                        ▼
                                  FI (182) [import invoice — national]
                                        │
                                        ▼
                                  GI (183) [import expenses]
                                  LX (186) [import liquidation]
                                        │
                                        ▼
                               IMPORTACION staging (WH 33/36/37)
                                        │
                                  ┌──────┼──────┐
                                  ▼      ▼      ▼
                             BODEGA   TIENDA  MALETA
                            PRINCIPAL  (stores) (vendors)
                             (WH 10)   (WH 11,  (WH 45-50)
                                       31,32,39)
                                  │      │      │
                                  ▼      ▼      ▼
                               VENTAS (FE, FD, FC, FG, FA, FW, PD, F2)
                                        │
                                        ▼
                              ┌─────────┼─────────┐
                              ▼         ▼         ▼
                          DETAL     MAYORISTA    WEB
                        (FD,FC,    (PD,F2,FE)   (FW)
                         FG,FA,V*)
                                        │
                                        ▼
                               Agotado? → Recompra (DI/AX si devolucion)
```

### Document lifecycle for a single import shipment

1. **FT** (189): China purchase invoice — records international purchase, enters container warehouse
2. **PX** (184): Import provision — allocates import costs to products (NOT a physical receipt)
3. **FI** (182): National import invoice — confirms physical entry into national territory
4. **GI** (183): Import expenses — freight, customs, taxes
5. **LX** (186): Import liquidation — final cost settlement
6. Products move from container → staging → store/bodega via IF (inventory count) or AI (inventory adjustment)
7. Sales via retail invoices (FD, FC, FG, FA, FW) or wholesale (PD → F2 → FE)
8. Returns via D2 (devoluciones ventas) or DI/AX (devoluciones importacion)

### Key observation

FI and FT can appear on the SAME DATE with the SAME document number for the SAME products.
Example: C2-AL-1 on 2024-10-03 has both FI doc 37119 (200 units) and FT doc 37119 (1,800 units).
This suggests FI = national portion, FT = international portion of the same shipment.
**Use FI as the authoritative import receipt to avoid double-counting.**

---

## 6. Indicator Map — 12 Required Indicators

| # | Indicator | SAG Source | Status | Current Implementation |
|---|---|---|---|---|
| 1 | Fecha de ingreso | MOVIMIENTOS.d_fecha_documento (FI/FT) | FOUND | BUGGY — uses C1/C2, returns null |
| 2 | Cantidad importada | MOVIMIENTOS_ITEMS.n_cantidad (FI/FT) | FOUND | BUGGY — uses C1/C2, returns 0 |
| 3 | Cantidad restante | ProductInventoryLevel + import warehouses | INFERRED | PARTIAL — missing 3 warehouse codes |
| 4 | Ventas acumuladas | CustomerOrderLine (FACTURADO, qty > 0) | INFERRED | WORKING |
| 5 | Ventas 6 meses | Same with date filter | INFERRED | WORKING |
| 6 | Precios PV3/PV4 | v_articulos.nd_precio3 / nd_precio4 | FOUND | BUGGY — queries wrong column names |
| 7 | Clasificacion ventas | unitValue vs PV3/PV4 thresholds | INFERRED | BROKEN — depends on B1 |
| 8 | Tiempo de venta | DATEDIFF(today, last FI/FT date) | INFERRED | BUGGY — depends on B2 |
| 9 | Recompra status | Rules on %sold, stock, rotation | INFERRED | UNRELIABLE — depends on B1+B2 |
| 10 | Top historico | ORDER BY soldNet DESC | INFERRED | WORKING (but soldNet may be wrong) |
| 11 | Top 6 meses | ORDER BY sales6mNet DESC | INFERRED | WORKING |
| 12 | Exito de importacion | soldNet / totalImported * 100 | INFERRED | BROKEN — totalImported always 0 |
