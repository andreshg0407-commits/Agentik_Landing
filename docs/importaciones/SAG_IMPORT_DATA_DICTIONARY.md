# SAG Import Data Dictionary

Sprint: SAG-IMPORT-RESEARCH-01
Generated: 2026-07-10
Tenant: Castillitos (SAG ERP)

---

## 1. v_articulos (Product Master)

The product catalog view. One row per article (reference).

| SAG Field | Type | Example | Semantic Meaning | Used By |
|---|---|---|---|---|
| ka_nl_articulo | int | 4316 | Internal article PK (auto-increment) | JOIN key for MOVIMIENTOS_ITEMS |
| k_sc_codigo_articulo | string | "9103" | Product reference code (human-visible) | Primary identifier in Importaciones |
| sc_detalle_articulo | string | "SET PLATOS x6" | Product description | Display name |
| sc_detalle_grupo | string | "IMPORTACION" | Product group/line | Filter: sc_detalle_grupo = 'IMPORTACION' |
| sc_detalle_linea | string | "IMPORTACION" | Product line | Same as group for imports |
| sc_detalle_marca | string | "4316" | Brand code (internal) | Not displayed |
| sc_detalle_subgrupo | string | "ALIMENTACION" | Sub-group | Category classification |
| n_iva | decimal | 19.00 | VAT percentage | Tax calculations |
| sc_unidad | string | "1" | Unit code | Unit of measure |
| sc_maneja_tc | string | "S" | Manages size/color (S/N) | Variant detection |
| sc_es_kardex | string | "S" | Has kardex (S/N) | Inventory tracking |
| nd_precio1 | decimal | 10840 | Price level 1 — PV1 (base/wholesale) | Reference price |
| nd_precio2 | decimal | 4765 | Price level 2 — PV2 (cost/special) | May represent cost |
| nd_precio3 | decimal | 12900 | Price level 3 — PV3 (retail/detal) | **Detal price** — confirmed by Excel cross-reference |
| nd_precio4 | decimal | 5670 | Price level 4 — PV4 (maleta/mayorista) | **Mayorista price** — confirmed by Excel cross-reference |
| nd_precio5 | decimal | 0 | Price level 5 — unused | Always 0 in sample |
| nd_precio6 | decimal | 0 | Price level 6 — unused | Always 0 in sample |
| nd_precio7 | decimal | 6.55 | Price level 7 — unknown semantic | Possibly markup factor |
| nd_precio8 | decimal | 0 | Price level 8 — unused | Always 0 in sample |
| nd_costo_std | decimal | 0 | Standard cost | Always 0 in Castillitos — NOT populated |

### Price field evidence (from 12-reference sample)

| Reference | precio1 | precio2 | precio3 (PV3) | precio4 (PV4) | precio7 |
|---|---|---|---|---|---|
| 9103 | 10,840 | 4,765 | 12,900 | 5,670 | 6.55 |
| C2-AL-1 | 8,319 | 2,773 | 9,900 | 3,300 | 0 |
| 9102 | 7,479 | 3,555 | 8,900 | 4,230 | 4.75 |
| 34831-6 | (see research) | | | | |

### CRITICAL: Non-existent fields

The current code (`sag-direct-commercial-product-data-source.ts`) queries:
- `n_valor_venta_promocion` — **DOES NOT EXIST** in SAG v_articulos
- `nd_valor_venta4` — **DOES NOT EXIST** in SAG v_articulos

Correct fields: `nd_precio3` (PV3 detal) and `nd_precio4` (PV4 mayorista).

---

## 2. MOVIMIENTOS (Document Headers)

Transaction header table. One row per document.

| SAG Field | Type | Example | Semantic Meaning | Used By |
|---|---|---|---|---|
| ka_nl_movimiento | int | 12345 | Movement PK (auto-increment) | JOIN key for MOVIMIENTOS_ITEMS |
| ka_ni_fuente | int | 182 | Document type FK → FUENTES.ka_ni_fuente | Semantic classification |
| n_numero_documento | int | 37119 | Document number (per fuente) | Display, deduplication |
| d_fecha_documento | datetime | 2024-03-23T00:00:00 | Document date | Entry date, timeline |
| ka_nl_tercero | int | 5432 | Third party FK → TERCEROS | Provider identification |
| sc_beneficiario | string | "CONMAN SOLUTION..." | Beneficiary name (denormalized) | Display |
| ka_nl_bodega | int | 36 | Warehouse FK → BODEGAS.ka_nl_bodega | Warehouse identification |
| sc_anulado | char | "N" | Cancelled flag (S/N) | Filter: sc_anulado = 'N' |

### Important: ka_nl_bodega vs ss_codigo

MOVIMIENTOS uses `ka_nl_bodega` (internal PK), NOT `ss_codigo` (display code).
ProductInventoryLevel uses `warehouseId` which maps to `ss_codigo`.

Mapping table:

| ka_nl_bodega | ss_codigo | ss_nombre | Import? |
|---|---|---|---|
| 33 | 24 | IMPORTACION | YES — staging |
| 36 | 26 | IMPORTACION PARTE 2 | YES — staging |
| 37 | 27 | IMPORTACION PARTE 1 | YES — staging |
| 41 | 30 | IMPO CONTENEDOR 2 | YES — container |
| 42 | 31 | IMPO CONTENEDOR 2-1 | YES — container |
| 43 | 32 | IMPO CONTENEDOR 3 | YES — container |
| 44 | 33 | IMPO CONTENEDOR 4 | YES — container |
| 51 | 34 | IMPO CONTENEDOR 5 | YES — container |
| 53 | 42 | IMPO CONTENEDOR 6 | YES — container |
| 54 | 43 | IMPO CONTENEDOR 7 | YES — container |
| 55 | 44 | IMPO CONTENEDOR 7-1 | YES — container |
| 56 | 45 | IMPO CONTENEDOR 7-2 | YES — container |
| 57 | 46 | IMPO CONETNEDOR 7-3 | YES — container |
| 59 | 48 | IMPO CONTENEDOR 9-1 | YES — container |
| 60 | 49 | IMPO CONTENEDOR 10-1 | YES — container |

---

## 3. MOVIMIENTOS_ITEMS (Document Lines)

Transaction line items. Multiple rows per MOVIMIENTOS header.

| SAG Field | Type | Example | Semantic Meaning | Used By |
|---|---|---|---|---|
| ka_nl_movimiento | int | 12345 | FK → MOVIMIENTOS | JOIN key |
| ka_nl_articulo | int | 4316 | FK → v_articulos | Article identification |
| n_cantidad | decimal | 1440 | Quantity (positive = in, negative = out) | Import quantity, sales volume |
| ss_talla | string | "U" | Size code | Variant (optional) |
| ss_color | string | "BLANCO" | Color code | Variant (optional) |

---

## 4. FUENTES (Document Types)

253 document type definitions. Key import-related fuentes:

| ka_ni_fuente | Code | Name | Semantic Type | Count as Receipt? |
|---|---|---|---|---|
| 182 | FI | FACTURA DE IMPORTACION NACIONAL | IMPORT_INVOICE | YES |
| 189 | FT | FACTURA COMPRA CHINA DIF MER2 | IMPORT_INVOICE | YES |
| 184 | PX | PROVISION IMPORTACION 2 | IMPORT_PROVISION | NO — cost allocation only |
| 201 | PI | PROVISION IMPORTACION | IMPORT_PROVISION | NO |
| 183 | GI | GASTOS DE IMPORTACION | IMPORT_EXPENSE | NO |
| 185 | GX | GASTO IMP 2 | IMPORT_EXPENSE | NO |
| 186 | LX | LIQUIDACION IMPORTACION 2 | IMPORT_LIQUIDATION | NO |
| 205 | LI | LIQUIDACION IMPORTACION | IMPORT_LIQUIDATION | NO |
| 187 | DI | DEVOLUCION IMPORTACION | IMPORT_RETURN | NO |
| 204 | AX | DEVOLUCION IMPORTACION 2 | IMPORT_RETURN | NO |

### CRITICAL: C1/C2 are NOT import fuentes

| ka_ni_fuente | Code | Name | Reality |
|---|---|---|---|
| 1 | C1 | FACTURA DE COMPRA | Domestic purchase — ZERO rows for import products |
| 95 | C2 | FACTURA DE COMPRAS 2 | Domestic purchase — ZERO rows for import products |

Current code uses `PURCHASE_FUENTE_IDS = [1, 95]` — this returns ZERO import receipts.

---

## 5. BODEGAS (Warehouses)

49+ warehouse definitions. Key fields:

| SAG Field | Type | Example | Semantic Meaning |
|---|---|---|---|
| ka_nl_bodega | int | 33 | Warehouse PK (used in MOVIMIENTOS) |
| ss_codigo | string | "24" | Display code (used in ProductInventoryLevel) |
| ss_nombre | string | "IMPORTACION" | Warehouse name |
| sc_clase | char | "T" | Class (P=permanent, T=transit) |
| sc_aplica_inv | char | "S" | Applies inventory (S/N) |
| sc_maneja_cmv | char | "S" | Manages CMV (S/N) |
| sc_bodega_mp | char | "N" | Raw materials warehouse (N for imports) |

---

## 6. TERCEROS (Third Parties / Providers)

| SAG Field | Type | Example | Semantic Meaning |
|---|---|---|---|
| ka_nl_tercero | int | 5432 | Third party PK |
| n_nit | string | "900123456" | NIT (tax ID) |
| ss_nombre | string | "CONMAN SOLUTION..." | Provider name |

---

## 7. Sales Channel Classification

SAG does NOT have a native "channel" field. Channel classification is inferred:

| Method | How | Confidence |
|---|---|---|
| Unit price vs PV3/PV4 | If unitValue >= PV3*0.7 → DETAL, if <= PV4*1.3 → MAYORISTA | HIGH |
| Document type (fuente) | FE/FD/FC/FG/FA/FW = retail invoices, F2 = remision (wholesale) | MEDIUM |
| Warehouse origin | Store warehouses (11,31,32,39) = retail, bodega principal (33) = wholesale | LOW |

---

## 8. Stock / Inventory

SAG has NO direct "current stock" or "saldo" table exposed via SOAP.

Current stock is obtained from:
- **ProductInventoryLevel** (Prisma) — synced from SAG inventory
- **Derived**: SUM(MOVIMIENTOS_ITEMS.n_cantidad) by article and warehouse — possible but expensive

---

## 9. Query Access Pattern

All SAG queries go through SOAP transport:
```
consultaSagJson(config: PyaApiConfig, query: string): Promise<any[]>
```

Rate limits: 10 req/min, 340 req/day.
Connection: PYA_SOAP_ENDPOINT + PYA_SOAP_TOKEN environment variables.
