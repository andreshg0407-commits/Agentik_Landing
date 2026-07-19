# Castillitos Import Semantic Mapping — Reference

## Tenant: castillitos | ERP: SAG | Version: IMPORT_SEMANTIC_V1

Sprint: IMPORT-SEMANTIC-MAPPING-01
Based on: SAG-IMPORT-RESEARCH-01

---

## Document Mappings (20 total)

### Import-Specific Fuentes

| ID | Code | Name | Semantic Type | Movement | Confidence | Import Receipt | Status |
|---|---|---|---|---|---|---|---|
| 182 | FI | FACTURA DE IMPORTACION NACIONAL | IMPORT_INVOICE | IMPORT | 0.95 | YES | PROBABLE |
| 184 | PX | PROVISION IMPORTACION 2 | IMPORT_PROVISION | PROVISION | 0.85 | NO | PROBABLE |
| 189 | FT | FACTURA COMPRA CHINA DIF MER2 | IMPORT_INVOICE | IMPORT | 0.80 | YES | PROBABLE |
| 157 | DS | DESGLOSE DE MERCANCIA | GOODS_BREAKDOWN | ADJUSTMENT | 0.80 | NO | PROBABLE |
| 201 | PI | PROVISION IMPORTACION | IMPORT_PROVISION | PROVISION | 0.75 | NO | UNKNOWN |
| 183 | GI | GASTOS DE IMPORTACION | IMPORT_EXPENSE | COST_ALLOCATION | 0.75 | NO | UNKNOWN |
| 185 | GX | GASTO IMP 2 | IMPORT_EXPENSE | COST_ALLOCATION | 0.70 | NO | UNKNOWN |
| 205 | LI | LIQUIDACION IMPORTACION | IMPORT_LIQUIDATION | COST_ALLOCATION | 0.70 | NO | UNKNOWN |
| 186 | LX | LIQUIDACION IMPORTACION 2 | IMPORT_LIQUIDATION | COST_ALLOCATION | 0.70 | NO | UNKNOWN |
| 187 | DI | DEVOLUCION IMPORTACION | IMPORT_RETURN | RETURN | 0.75 | NO | UNKNOWN |
| 204 | AX | DEVOLUCION IMPORTACION 2 | IMPORT_RETURN | RETURN | 0.70 | NO | UNKNOWN |

### Domestic Purchase Fuentes

| ID | Code | Name | Semantic Type | Movement | Confidence | Status |
|---|---|---|---|---|---|---|
| 1 | C1 | FACTURA DE COMPRA | DOMESTIC_PURCHASE_INVOICE | PURCHASE | 0.90 | PROBABLE |
| 95 | C2 | FACTURA DE COMPRAS 2 | DOMESTIC_PURCHASE_INVOICE | PURCHASE | 0.85 | PROBABLE |
| 163 | T3 | DOC SOPORTE ELECTRONICO | PURCHASE_SUPPORT_DOCUMENT | PURCHASE | 0.70 | UNKNOWN |
| 134 | SC | DOCUMENTO SOPORTE COMPRAS | PURCHASE_SUPPORT_DOCUMENT | PURCHASE | 0.50 | UNKNOWN (disabled) |
| 159 | ED | DOC SOPORTE ELECTRONICO COMPRA | PURCHASE_SUPPORT_DOCUMENT | PURCHASE | 0.50 | UNKNOWN (disabled) |

### Inventory/Operational Fuentes

| ID | Code | Name | Semantic Type | Movement | Confidence | Status |
|---|---|---|---|---|---|---|
| 76 | AI | AJUSTE DE INVENTARIO | INVENTORY_ADJUSTMENT | ADJUSTMENT | 0.90 | PROBABLE |
| 65 | IF | INV. FISICO | PHYSICAL_INVENTORY | INVENTORY_COUNT | 0.90 | PROBABLE |
| 34 | TR | TRASLADO ENTRE BODEGAS | TRANSFER_IN | TRANSFER | 0.85 | PROBABLE |
| 206 | TM | TRASLADO DE MALETAS | TRANSFER_OUT | TRANSFER | 0.80 | PROBABLE |

---

## Warehouse Mappings (24 total)

> CRITICAL: `ka_nl_bodega` (PK in SAG) != `ss_codigo` (business code). Previous code used `ss_codigo` values (24, 42-46) assuming they were `ka_nl_bodega` — this was incorrect.

### Import Warehouses

| ka_nl_bodega | ss_codigo | Name | Semantic Type | Status |
|---|---|---|---|---|
| 33 | 24 | IMPORTACION | IMPORT_STAGING | PROBABLE |
| 36 | 26 | IMPORTACION PARTE 2 | IMPORT_STAGING | PROBABLE |
| 37 | 27 | IMPORTACION PARTE 1 | IMPORT_STAGING | PROBABLE |
| 41 | 30 | IMPO CONTENEDOR 2 | IMPORT_CONTAINER | PROBABLE |
| 42 | 31 | IMPO CONTENEDOR 2-1 | IMPORT_CONTAINER | UNKNOWN |
| 43 | 32 | IMPO CONTENEDOR 3 | IMPORT_CONTAINER | UNKNOWN |
| 44 | 33 | IMPO CONTENEDOR 4 | IMPORT_CONTAINER | UNKNOWN |

### Store/Main Warehouses

| ka_nl_bodega | ss_codigo | Name | Semantic Type |
|---|---|---|---|
| 10 | 01 | BODEGA PRINCIPAL | MAIN_WAREHOUSE |
| 11 | 02 | BODEGA SANDIEGO | STORE |
| 31 | 00 | BODEGA CENTRO | STORE |
| 32 | 23 | GRAN PLAZA | STORE |
| 39 | 29 | BODEGA CALDAS | STORE |
| 30 | 22 | PAGINA WEB | WEB |

### Production

| ka_nl_bodega | ss_codigo | Name | Semantic Type |
|---|---|---|---|
| 13 | 04 | PRODUCTO EN PROCESO | PRODUCTION |
| 14 | 05 | MATERIA PRIMA | RAW_MATERIAL |
| 15 | 06 | TELAS | RAW_MATERIAL |

### Seller Bags

| ka_nl_bodega | ss_codigo | Name | Semantic Type |
|---|---|---|---|
| 45-50 | 35-40 | VEND * | SELLER_BAG |

---

## Price Mappings (9 total)

All UNKNOWN except `nd_costo_std` (COST, PROBABLE).

| Field | Semantic Type | Status | Research Value (ref 9103) |
|---|---|---|---|
| nd_precio1 | UNKNOWN | UNKNOWN | 10,840 |
| nd_precio2 | UNKNOWN | UNKNOWN | 4,765 |
| nd_precio3 | UNKNOWN | UNKNOWN | 12,900 |
| nd_precio4 | UNKNOWN | UNKNOWN | 5,670 |
| nd_precio5 | UNKNOWN | UNKNOWN | 0 |
| nd_precio6 | UNKNOWN | UNKNOWN | 0 |
| nd_precio7 | UNKNOWN | UNKNOWN | 6.55 |
| nd_precio8 | UNKNOWN | UNKNOWN | 0 |
| nd_costo_std | COST | PROBABLE | — |

---

## Name Patterns (13)

Fallback patterns used when no ID/code match is found.

These patterns are applied in sequence when a `fuente` value cannot be matched against a known ID or code. Pattern matching operates on the normalized uppercase name and serves as a last-resort classification layer. Pattern coverage is intentionally conservative — unmatched entries remain UNKNOWN rather than being force-classified.

---

## Audit Results

- 28 document types from research classified
- 6 matched to known mappings (FI, PX, FT, DS, AI, IF)
- 22 correctly classified as UNKNOWN (sales, POS, credit notes)
- Import receipt fuentes: FI (182), FT (189)
- Total units counting as imported: 14,368
