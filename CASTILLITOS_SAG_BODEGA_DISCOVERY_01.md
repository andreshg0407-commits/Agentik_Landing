# CASTILLITOS-SAG-BODEGA-DISCOVERY-01

**Sprint:** Descubrimiento del Modelo Logistico SAG
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)
**Date:** 2026-06-27

---

## Fuentes Existentes Reutilizadas (Arqueologia)

| Artifact | Ubicacion |
|---|---|
| Master Bodegas Registry (37) | `lib/sag/master-data/castillitos-overrides.ts` — `CASTILLITOS_BODEGAS` |
| Master Fuentes Registry (127) | `lib/sag/master-data/castillitos-fuentes.ts` |
| Master Lineas (5 lines) | `lib/sag/master-data/castillitos-overrides.ts` — `CASTILLITOS_LINEAS` |
| Master Grupos (29 groups) | `lib/sag/master-data/castillitos-overrides.ts` — `CASTILLITOS_GRUPOS` |
| V2 SOAP Inventory Sync | `lib/connectors/adapters/sag-pya-soap/inventory/` |
| V2 SOAP Master Lookups | `lib/connectors/adapters/sag-pya-soap/catalog/sag-master-lookups-types.ts` |
| Production Sync | `lib/connectors/adapters/sag-pya-soap/production/` |
| Store Adapter | `lib/comercial/tiendas/sag-store-adapter.ts` |
| Seller Warehouses | `lib/commercial-intelligence/maleta-replacement-engine.ts` — `CASTILLITOS_SELLER_WAREHOUSES` |
| Prisma: ProductInventoryLevel | Per-variant per-warehouse stock (V2) |
| Prisma: ProductionOrder + Lines | SAG OP fuente=33 |
| Prisma: CommercialCoverageSnapshot | V1 aggregate inventory (no bodega breakdown) |
| Prisma: SaleRecord | Sales by store |

---

## Phase 1: Catalogo Completo de Bodegas SAG

**Fuente:** `SELECT * FROM BODEGAS WHERE sc_activo='S'` (confirmado 2026-04-08)
**Total:** 37 bodegas activas

| Codigo | Nombre | Variantes en DB | Qty Total | Tiene Stock Positivo |
|--------|--------|-----------------|-----------|---------------------|
| 00 | BODEGA CENTRO | 10,323 | -28,160 | Si (1,275) |
| 01 | BODEGA PRINCIPAL | 50,311 | -1,102,387 | Si (67,950) |
| 02 | BODEGA SANDIEGO | 15,883 | -68,340 | Si (992) |
| 03 | BODEGA MAYORCA | 7,484 | -25,253 | Si (715) |
| 04 | PRODUCTO EN PROCESO | 48,349 | 1,318,904 | Si (1,318,904) |
| 05 | MATERIA PRIMA | 0 | 0 | No |
| 06 | TELAS | 0 | 0 | No |
| 07 | RETAZOS | 0 | 0 | No |
| 08 | F1 - PAQUE BERRIO | 383 | -615 | No |
| 09 | F3 - BOLIVAR | 467 | -761 | No |
| 10 | F6 - BELLO | 434 | -638 | No |
| 11 | F7 - ARMENIA | 328 | -530 | No |
| 12 | F9 - PEREIRA | 319 | -553 | No |
| 13 | F16 - CENT MAY BOGOT | 344 | -547 | No |
| 14 | F17 - MAYORCA | 342 | -533 | No |
| 15 | F10 - IBAGUE | 353 | -530 | No |
| 16 | MUESTRAS | 62 | -6 | No |
| 18 | ARREGLOS | 4 | -11 | No |
| 19 | SEGUNDAS Y SALDOS | 1 | 2 | Si (2) |
| 20 | TEMPORAL FLAMINGO | 691 | -1,793 | No |
| 21 | F19 - MONTERIA | — | — | No data |
| 23 | GRAN PLAZA | 7,999 | -25,057 | Si (932) |
| 24 | IMPORTACION | 2,131 | -95,637 | Si (24,912) |
| 28 | PLAN SEPARE | 354 | -381 | No |
| 29 | BODEGA CALDAS | 5,811 | -19,098 | Si (886) |
| 35 | VEND ORLANDO | 1 | -1 | No |
| 36 | VEND CARLOS LEON | 0 | 0 | No |
| 37 | VEND LUIS | 0 | 0 | No |
| 38 | VEND NESTOR | 0 | 0 | No |
| 39 | VEND CARLOS VILLA | 0 | 0 | No |
| 40 | VEND FREDY | 2 | -2 | No |
| 41 | DEXCATO. MC | 354 | -689 | No |
| 42 | IMPO CONTENEDOR 6 | 5 | 368 | Si (368) |
| 43 | IMPO CONTENEDOR 7 | 34 | 4,424 | Si (4,424) |
| 44 | IMPO CONTENEDOR 7-1 | 103 | 36,069 | Si (36,069) |
| 45 | IMPO CONTENEDOR 7-2 | 130 | 8,620 | Si (8,620) |
| 46 | IMPO CONTENEDOR 7-3 | 145 | 14,901 | Si (14,901) |

### Bodegas Descubiertas NO en Registro (en ProductInventoryLevel)

| externalRef | Variantes | Qty Total | Hipotesis |
|-------------|-----------|-----------|-----------|
| 22 | 2,583 | -8,403 | Bodega inactiva o renombrada (gap en BODEGAS entre 21-23) |
| 26 | 84 | 49,109 | Alta cantidad, pocas variantes = contenedor bulk o bodega especial |
| 27 | 106 | 33,247 | Similar patron a 26 = contenedor o staging |
| 30 | 71 | 6,143 | Post-CALDAS(29), pre-contenedores = zona de despacho o staging |
| 31 | 5 | 368 | Muy pocas variantes = contenedor especifico |
| 32 | 34 | 4,424 | Contenedor o area temporal |
| 33 | 54 | 7,275 | Contenedor o area temporal |
| 34 | 49 | 7,998 | Contenedor o area temporal |
| 48 | 143 | 9,175 | Contenedor de importacion adicional |
| 49 | 292 | 13,506 | Contenedor de importacion adicional (mayor variedad) |

**Nota:** Todas estas bodegas tienen stock POSITIVO — son ubicaciones activas.
**Accion requerida:** Confirmar con Castillitos la identidad de estas 10 bodegas. Probablemente son contenedores de importacion adicionales (47-49) o bodegas creadas despues de la homologacion 2026-04-08.

---

## Phase 2: Clasificacion de Bodegas

### Clasificacion por Evidencia

| Tipo | Codigos | Evidencia |
|------|---------|-----------|
| **MAIN_WAREHOUSE** | 01 | `CASTILLITOS_CONFIG.defaultWarehouse = "01"`. 50,311 variantes. Fuente para disponible real. |
| **STORE** | 00, 02, 03, 23, 29 | Nombres de ubicacion fisica. Presencia en SaleRecord como storeSlug. Stock positivo en tiendas activas. |
| **FRANCHISE** | 08, 09, 10, 11, 12, 13, 14, 15, 21 | Prefijo "F" + numero + ciudad. Solo qty negativa = historico de salidas. |
| **PRODUCTION** | 04 | "PRODUCTO EN PROCESO". 1.3M unidades positivas. 48,349 variantes. Bodega con mas stock en el sistema. |
| **RAW_MATERIAL** | 05, 06, 07 | "MATERIA PRIMA", "TELAS", "RETAZOS". Sin data en ProductInventoryLevel = no sincronizados o sin movimiento reciente. |
| **SELLER_PORTFOLIO** | 35, 36, 37, 38, 39, 40 | Prefijo "VEND". Mapped en `CASTILLITOS_SELLER_WAREHOUSES`. Practicamente sin stock en V2 sync (datos via V1 context bridge). |
| **IMPORT_CONTAINER** | 42, 43, 44, 45, 46 | Prefijo "IMPO CONTENEDOR". Stock positivo alto = mercancia en transito o por nacionalizar. |
| **SAMPLES** | 16 | "MUESTRAS". 62 variantes, qty minimal. |
| **SERVICE** | 18 | "ARREGLOS". 4 variantes. |
| **CLEARANCE** | 19 | "SEGUNDAS Y SALDOS". 1 variante. |
| **TEMPORARY** | 20 | "TEMPORAL FLAMINGO". 691 variantes, qty negativa. |
| **IMPORT_STAGING** | 24 | "IMPORTACION". 24,912 unidades positivas. Staging para mercancia importada. |
| **LAYAWAY** | 28 | "PLAN SEPARE". 354 variantes. Apartados. |
| **OUTLET** | 41 | "DEXCATO. MC". 354 variantes. Probable punto de descuento/outlet. |
| **UNKNOWN** | 22, 26, 27, 30, 31, 32, 33, 34, 48, 49 | No en CASTILLITOS_BODEGAS registry. Requieren confirmacion. |

---

## Phase 3: Analisis de Movimientos

### Documentos que Generan Movimientos (FUENTES)

| Fuente | Codigo | Nombre | Categoria | Afecta Inventario |
|--------|--------|--------|-----------|-------------------|
| 33 | OP | Orden de Produccion | PRODUCCION | Si |
| 34 | TR | Traslado entre Bodegas | PRODUCCION | Si |
| 80 | CN | Consumos Insumos y Telas | PRODUCCION | Si |
| 81 | PT | Entrada PT | PRODUCCION | Si |
| 99 | PC | Salida a Confeccionistas | PRODUCCION | Si |
| 100 | EC | Entrada de Confeccionistas | PRODUCCION | Si |
| 114 | 4 | Producto en Proceso | PRODUCCION | Si |
| 115 | MV | Traslado de Movimientos PDN | PRODUCCION | Si |
| 116 | ET | Entrada Producto Terminado | PRODUCCION | Si |
| 118 | T2 | Servicio T2 | PRODUCCION | Si |
| 119 | Y1 | Servicio Y1 | PRODUCCION | Si |
| 129 | T1 | Servicio T1 | PRODUCCION | Si |
| 65 | IF | Inv. Fisico | INVENTARIO | Si |
| 76 | AI | Ajuste de Inventario | INVENTARIO | Si |

### Inventario = SUM(MOVIMIENTOS_ITEMS)

**Hallazgo critico:** Castillitos SAG NO tiene tabla INVENTARIO ni EXISTENCIAS. El inventario se calcula como:

```sql
SELECT SUM(signed_quantity)
FROM MOVIMIENTOS_ITEMS mi
JOIN FUENTES f ON mi.ka_ni_fuente = f.ka_ni_fuente
WHERE f.sc_afecta_inventario = 'S'
```

Donde `signed_quantity = quantity * FUENTES.sc_signo_inventario` ('+' o '-').

Esto ya esta modelado en `lib/connectors/adapters/sag-pya-soap/catalog/sag-variants-types.ts`.

### Flujo Principal de Movimientos

```
┌─────────────────────────────────────────────────────┐
│  MATERIA PRIMA (05, 06, 07)                         │
│     ↓ CN (fuente 80)                                │
│  PRODUCTO EN PROCESO (04)                           │
│     ↓ PC/EC (fuentes 99, 100)                       │
│  CONFECCION EXTERNA                                 │
│     ↓ T1/T2/Y1 (fuentes 129, 118, 119)             │
│  SERVICIOS                                          │
│     ↓ ET (fuente 116)                               │
│  BODEGA PRINCIPAL (01)                              │
│     ↓ TR (fuente 34)                                │
│  ┌──────────────────────────────────────────┐       │
│  │ TIENDAS: 00, 02, 03, 23, 29             │       │
│  │ FRANQUICIAS: 08-15, 21                   │       │
│  │ MALETAS: 35-40                           │       │
│  │ IMPORTACION: 24, 42-46                   │       │
│  └──────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────┘
```

---

## Phase 4: Analisis de Traslados

### Tipo de Traslado: Fuente 34 (TR)

No se tiene data de traslados en Prisma actualmente. ProductionOrder solo almacena `sourceCode = "OP"` (3,376 ordenes).

**Patron inferido de la estructura de bodegas:**

| Ruta | Proposito |
|------|-----------|
| 01 → 00, 02, 03, 23, 29 | Reposicion de tiendas desde principal |
| 01 → 35-40 | Surtido de maletas de vendedores |
| 24 → 01 | Nacionalizacion de importaciones |
| 42-46 → 24 → 01 | Contenedores → importacion → principal |
| 04 → 01 | Producto terminado (via ET fuente 116) |
| 05/06 → 04 | Materia prima a produccion (via CN fuente 80) |

**Accion requerida:** Sincronizar fuente 34 (TR) desde SAG para tener datos reales de traslados.

---

## Phase 5: Maletas de Vendedores

### Estado Actual en ProductInventoryLevel (V2)

| Codigo | Vendedor | Variantes | Qty | Estado |
|--------|----------|-----------|-----|--------|
| 35 | Orlando | 1 | -1 | Practicamente vacia |
| 36 | Carlos Leon | 0 | 0 | Sin data |
| 37 | Luis | 0 | 0 | Sin data |
| 38 | Nestor | 0 | 0 | Sin data |
| 39 | Carlos Villa | 0 | 0 | Sin data |
| 40 | Fredy | 2 | -2 | Practicamente vacia |

**Hallazgo:** Las bodegas de vendedores estan casi vacias en V2 sync. Esto puede significar:

1. Los vendedores devolvieron mercancia (las cantidades negativas acumuladas = mas salidas que entradas historicas).
2. Los movimientos de maletas no se sincronizaron completamente.
3. Los vendedores manejan muestras, no inventario largo.

**Nota:** El modulo de Maletas (V1) usa datos de `CommercialCoverageSnapshot` + context bridge, NO de `ProductInventoryLevel`. Esa es la razon del gap.

**Vendedor descubierto:** Bodega 40 = "VEND FREDY" — NO incluido en `CASTILLITOS_SELLER_WAREHOUSES` (solo tiene 35-39).

**Accion requerida:**
1. Agregar Fredy (bodega 40) a `CASTILLITOS_SELLER_WAREHOUSES`.
2. Sincronizar bodegas 35-40 especificamente para obtener inventario actual de maletas.
3. Preparar infraestructura LiveVendor con bodegas reales.

---

## Phase 6: Tiendas

### Tiendas Identificadas

**Fuente 1: Bodegas SAG con nombre de ubicacion fisica**

| Codigo | Nombre | Variantes | Stock Positivo | Clasificacion |
|--------|--------|-----------|----------------|---------------|
| 00 | BODEGA CENTRO | 10,323 | 1,275 | Tienda/Almacen fisico |
| 02 | BODEGA SANDIEGO | 15,883 | 992 | Tienda/Almacen fisico |
| 03 | BODEGA MAYORCA | 7,484 | 715 | Tienda/C.C. Mayorca |
| 23 | GRAN PLAZA | 7,999 | 932 | Tienda/C.C. Gran Plaza |
| 29 | BODEGA CALDAS | 5,811 | 886 | Bodega secundaria Caldas |

**Fuente 2: SaleRecord storeSlug**

| Slug | Nombre | Ventas | Periodo |
|------|--------|--------|---------|
| sag | SAG | 44,567 | 2020-05 → 2026-04 |
| empresa | Empresa | 34,846 | 2020-06 → 2026-04 |
| empresa-f2 | Empresa F2 | 14,905 | 2020-06 → 2026-04 |
| almacen-d | Almacen D | 8,431 | 2023-05 → 2026-04 |
| almacen-g | Almacen G | 6,101 | 2023-08 → 2026-04 |
| almacen-a | Almacen A | 5,911 | 2024-06 → 2026-04 |
| almacen-c | Almacen C | 4,219 | 2023-06 → 2026-04 |
| addisistecredit | Addi/Sistecredit | 2,282 | 2020-07 → 2026-04 |
| pos | POS | 1,872 | 2020-07 → 2026-04 |
| tienda-web | Tienda Web | 1,462 | 2025-11 → 2026-04 |

**Hallazgo critico:** `SaleRecord.storeCode` es SIEMPRE NULL. Los stores se derivan de patrones de documento, no de bodega SAG. No hay mapping directo store → bodega en los datos actuales.

**Franquicias (bodegas con prefijo F):**

| Codigo | Nombre | Estado en DB |
|--------|--------|-------------|
| 08 | F1 - Paque Berrio | Solo qty negativas (historico) |
| 09 | F3 - Bolivar | Solo qty negativas |
| 10 | F6 - Bello | Solo qty negativas |
| 11 | F7 - Armenia | Solo qty negativas |
| 12 | F9 - Pereira | Solo qty negativas |
| 13 | F16 - Cent May Bogota | Solo qty negativas |
| 14 | F17 - Mayorca | Solo qty negativas |
| 15 | F10 - Ibague | Solo qty negativas |
| 21 | F19 - Monteria | Sin data en DB |

**Nota:** Todas las franquicias tienen solo cantidades negativas acumuladas = salidas netas historicas. Posiblemente franquicias cerradas o con modelo consignacion.

---

## Phase 7: Produccion

### Datos en Prisma

| Metrica | Valor |
|---------|-------|
| ProductionOrder total | 3,376 |
| ProductionOrder abiertas | 3,352 (99.3%) |
| ProductionOrderLine total | 56,586 |
| Referencias distintas | 3,167 |
| Qty total ordenada | 1,386,210 |
| Rango de fechas | 2020-11-02 → 2026-06-23 |
| sourceCode | 100% "OP" |
| warehouseCode | 100% NULL |

**Hallazgo:** `warehouseCode` es NULL en TODOS los ProductionOrder. Esto es porque la sincronizacion actual (`sag-production-sync.ts`) solo importa fuente 33 (OP) y el campo `ka_nl_bodega` no se mapeo consistentemente.

### Bodegas de Produccion

| Codigo | Nombre | Rol en Produccion | Stock |
|--------|--------|-------------------|-------|
| 04 | PRODUCTO EN PROCESO | WIP warehouse | 1,318,904 (mayor stock en el sistema) |
| 05 | MATERIA PRIMA | Insumos | Sin data en DB |
| 06 | TELAS | Telas | Sin data en DB |
| 07 | RETAZOS | Sobrantes | Sin data en DB |

### Fuentes de Produccion

| Fuente | Codigo | Flujo |
|--------|--------|-------|
| 33 (OP) | Orden de Produccion | Crea WIP en bodega 04 |
| 80 (CN) | Consumo de Insumos | 05/06 → 04 |
| 99 (PC) | Salida a Confeccionistas | 04 → externo |
| 100 (EC) | Entrada de Confeccionistas | Externo → 04 |
| 129 (T1) | Servicio T1 | Servicio externo |
| 118 (T2) | Servicio T2 | Servicio externo |
| 119 (Y1) | Servicio Y1 | Servicio externo |
| 116 (ET) | Entrada Producto Terminado | 04 → 01 |
| 114 (4) | Producto en Proceso | Ajuste interno en 04 |
| 115 (MV) | Traslado de Movimientos PDN | Traslado produccion |

**Impacto en Production Stage Inference:** El motor actual (`production-stage-inference.ts`) ya modela las etapas correctas pero recibe `warehouseCode = null` porque ProductionOrder no lo tiene. La inferencia funciona por evidencia documental (docType), no por bodega, asi que el impacto es bajo.

---

## Phase 8: Modelo Empresarial Agentik (Propuesta)

### Entidades Candidatas

```typescript
// ── InventoryLocation ──────────────────────────────────────────────────────
// Abstraccion de cualquier ubicacion donde puede existir inventario.
// Mapeable a: SAG BODEGAS, Shopify Locations, WMS Zones, etc.
interface InventoryLocation {
  id: string;
  organizationId: string;
  /** Codigo externo (SAG ss_codigo, Shopify location_id, etc.) */
  externalCode: string;
  /** Nombre display */
  name: string;
  /** Tipo funcional */
  type: LocationType;
  /** Subtipo para UI */
  subType?: LocationSubType;
  /** Jerarquia padre (e.g. bodega dentro de planta) */
  parentLocationId?: string;
  /** Metadata ERP-especifica */
  metadata?: Record<string, unknown>;
  /** Estado administrativo */
  adminStatus: "active" | "disabled" | "archived";
  /** Estado operativo (sync) */
  syncStatus: "never_synced" | "synced" | "sync_error";
  lastSyncAt?: Date;
}

type LocationType =
  | "MAIN_WAREHOUSE"      // Bodega principal
  | "STORE"               // Tienda/punto de venta
  | "FRANCHISE"           // Franquicia
  | "PRODUCTION"          // WIP / produccion
  | "RAW_MATERIAL"        // Materia prima
  | "SELLER_PORTFOLIO"    // Maleta de vendedor
  | "IMPORT_CONTAINER"    // Contenedor de importacion
  | "IMPORT_STAGING"      // Staging de importacion
  | "SAMPLES"             // Muestras
  | "SERVICE"             // Arreglos/servicios
  | "CLEARANCE"           // Segundas y saldos
  | "OUTLET"              // Outlet/descuento
  | "TEMPORARY"           // Temporal
  | "LAYAWAY"             // Plan separe
  | "EXTERNAL"            // Proveedor/confeccionista
  | "UNKNOWN";            // Sin clasificar

type LocationSubType =
  | "PHYSICAL_STORE"      // Tienda propia
  | "MALL_STORE"          // Tienda en centro comercial
  | "WAREHOUSE"           // Bodega operativa
  | "VENDOR_CASE"         // Maleta de vendedor
  | "CONTAINER"           // Contenedor de importacion
  | "WORKSHOP"            // Taller externo
  | "VIRTUAL";            // Canal digital

// ── InventoryBalance ───────────────────────────────────────────────────────
// Stock actual en una ubicacion para un producto/variante.
interface InventoryBalance {
  id: string;
  organizationId: string;
  locationId: string;
  productId: string;
  variantId?: string;
  /** Cantidad actual */
  quantity: number;
  /** Disponible (quantity - reserved) */
  available: number;
  /** Reservado por pedidos */
  reserved: number;
  /** Timestamp de ultimo calculo */
  computedAt: Date;
}

// ── InventoryMovement ──────────────────────────────────────────────────────
// Movimiento individual que afecta inventario.
interface InventoryMovement {
  id: string;
  organizationId: string;
  locationId: string;
  productId: string;
  variantId?: string;
  /** Tipo de movimiento */
  movementType: MovementType;
  /** Cantidad (positiva = entrada, negativa = salida) */
  quantity: number;
  /** Documento fuente */
  sourceDocument: string;
  sourceDocumentType: string;
  /** Fecha del movimiento */
  movementDate: Date;
}

type MovementType =
  | "RECEIPT"             // Entrada
  | "SHIPMENT"            // Salida
  | "TRANSFER_IN"         // Traslado entrada
  | "TRANSFER_OUT"        // Traslado salida
  | "PRODUCTION_IN"       // Entrada de produccion
  | "PRODUCTION_OUT"      // Consumo produccion
  | "ADJUSTMENT"          // Ajuste
  | "RETURN"              // Devolucion
  | "PHYSICAL_COUNT";     // Inventario fisico

// ── InventoryTransfer ──────────────────────────────────────────────────────
// Traslado entre ubicaciones (par de movimientos).
interface InventoryTransfer {
  id: string;
  organizationId: string;
  sourceLocationId: string;
  destinationLocationId: string;
  /** Lineas del traslado */
  lines: InventoryTransferLine[];
  /** Documento fuente */
  sourceDocument: string;
  transferDate: Date;
  status: "pending" | "in_transit" | "completed" | "cancelled";
}

interface InventoryTransferLine {
  productId: string;
  variantId?: string;
  quantity: number;
}

// ── LocationHierarchy ──────────────────────────────────────────────────────
// Relacion padre-hijo entre ubicaciones.
interface LocationRelationship {
  parentId: string;
  childId: string;
  relationshipType: "contains" | "supplies" | "receives_from";
}
```

### Mapeo SAG → Modelo Agentik

| SAG | Agentik |
|-----|---------|
| BODEGAS.ss_codigo | InventoryLocation.externalCode |
| BODEGAS.ss_nombre | InventoryLocation.name |
| MOVIMIENTOS_ITEMS qty | InventoryMovement.quantity |
| FUENTES.sc_signo_inventario | InventoryMovement signo |
| FUENTES fuente 34 (TR) | InventoryTransfer |
| SUM(signed MOVIMIENTOS_ITEMS) | InventoryBalance.quantity |
| ProductInventoryLevel | InventoryBalance (V2) |

---

## Phase 9: Knowledge Graph — Relaciones

```
Product ──[stocked_at]──→ InventoryLocation
InventoryLocation ──[transfers_to]──→ InventoryLocation
Vendor ──[assigned_portfolio]──→ InventoryLocation (type=SELLER_PORTFOLIO)
Store ──[has_inventory_at]──→ InventoryLocation (type=STORE)
ProductionOrder ──[produces_at]──→ InventoryLocation (type=PRODUCTION)
ProductionOrder ──[delivers_to]──→ InventoryLocation (type=MAIN_WAREHOUSE)
ImportContainer ──[stages_at]──→ InventoryLocation (type=IMPORT_STAGING)
ImportContainer ──[delivers_to]──→ InventoryLocation (type=MAIN_WAREHOUSE)
Customer ──[buys_from]──→ InventoryLocation (type=STORE|FRANCHISE)
```

### Relaciones para Memory Graph

| Node Type | Existe | Conecta con |
|-----------|--------|-------------|
| Product | Si (ProductEntity) | InventoryLocation via stock |
| InventoryLocation | NO — candidato nuevo | Product, Vendor, Store, ProductionOrder |
| Vendor/Seller | Parcial (SaleRecord.sellerSlug) | InventoryLocation (portfolio) |
| Store | Parcial (SaleRecord.storeSlug) | InventoryLocation |
| ProductionOrder | Si (Prisma model) | InventoryLocation (bodega 04) |

---

## Phase 10: Capability Impact Analysis

### Impacto por Modulo

| Modulo | Impacto | Accion |
|--------|---------|--------|
| **Commercial Availability Intelligence** | MEDIO | Actualmente usa CommercialCoverageSnapshot (V1, sin bodega). V2 deberia usar ProductInventoryLevel WHERE externalRef='01'. |
| **Portfolio Replacement Intelligence** | ALTO | Seller warehouses 35-40 tienen data minima. Necesita sync especifico de bodegas 35-40. Fredy (40) falta en registry. |
| **Production Intelligence** | BAJO | Production Stage Inference funciona por docType, no por bodega. warehouseCode=NULL no es bloqueante. |
| **LiveVendor (futuro)** | CRITICO | Requiere inventario real por bodega de vendedor. Sin datos actuales. |
| **Tiendas** | ALTO | 5 tiendas identificadas con stock (00, 02, 03, 23, 29). Store→bodega mapping no existe aun. |
| **Decision Engine** | MEDIO | Podra usar location-aware rules cuando exista InventoryLocation model. |
| **Action Engine** | MEDIO | Podra generar acciones de traslado entre ubicaciones. |
| **David (Copilot)** | MEDIO | Podra responder "que inventario hay en Mayorca" con datos de bodega 03. |
| **Executive Dashboard** | BAJO | Ya funciona con availability engine. Mejorado cuando V2 data este disponible. |
| **Importaciones** | ALTO | 5 contenedores activos (42-46) + 5+ desconocidos con 100K+ unidades. Modulo de importaciones necesitara esto. |

### Reutilizacion Futura

```
lib/sag/master-data/castillitos-overrides.ts  →  CASTILLITOS_BODEGAS (37 codigos, fuente de verdad)
lib/commercial-intelligence/                   →  buildAvailabilityReport() para cualquier bodega
lib/production-intelligence/                   →  buildProductionReport() con bodega de produccion
lib/comercial/tiendas/sag-store-adapter.ts     →  discoverSagStores(), getStoreWarehouses()
lib/connectors/adapters/sag-pya-soap/          →  V2 SOAP sync per-warehouse
Prisma: ProductInventoryLevel                  →  Stock por variante por bodega (39 bodegas con data)
```

---

## Validacion

- `npx tsc --noEmit`: 160 errores (baseline mantenido)
- 0 errores nuevos introducidos
- Todos los scripts son READ ONLY
- No se modificaron datos
- No se escribieron nuevas entidades Prisma

---

## Scripts Forenses Creados

| Script | Proposito |
|--------|-----------|
| `scripts/_bodega-discovery-forensics.ts` | Phase 1: catalogo completo, distribucion por tabla |
| `scripts/_bodega-discovery-forensics-p2.ts` | Phase 2: deep analysis, unknown warehouses, seller detail |

---

## Hallazgos Clave (Resumen Ejecutivo)

1. **37 bodegas registradas, 39 con data activa, 10 desconocidas** — necesitan confirmacion con Castillitos.
2. **Bodega 04 es el mayor deposito** (1.3M unidades en produccion) — mas que Principal (01).
3. **Maletas de vendedores (35-40) estan vacias en V2** — data viene por otro canal (V1).
4. **Fredy (bodega 40) NO esta en CASTILLITOS_SELLER_WAREHOUSES** — debe agregarse.
5. **5 contenedores de importacion activos** (42-46) con 74K+ unidades — hay 5+ mas sin registro.
6. **Franquicias (08-15, 21) solo tienen salidas historicas** — posiblemente cerradas o modelo consignacion.
7. **Store→bodega mapping NO existe** — SaleRecord.storeCode es siempre NULL.
8. **Traslados (fuente 34) NO estan sincronizados** — no hay data de transfers en Prisma.
9. **ProductionOrder.warehouseCode es NULL** en el 100% de los registros.
10. **No existe tabla INVENTARIO** — stock = SUM(signed MOVIMIENTOS_ITEMS).
