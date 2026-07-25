# AGENTIK-STORES-DATA-AND-INTELLIGENCE-AUDIT-01

**Sprint:** Tiendas — Auditoria Pre-Implementacion Centro de Inteligencia de Surtido
**Tenant:** Castillitos
**Fecha:** 2026-07-24
**orgId:** cmmpwstuf000dp5y58kj1daaj

---

## PRIMERO: Tiendas activas certificadas

### Bodegas retail certificadas en SAG

| Tienda | ka_nl_bodega | ss_codigo | PIL Records | Refs con stock>0 | Unidades (neto) | Estado |
|---|---|---|---|---|---|---|
| San Diego | 11 | 02 | 15,975 | 582 | -69,016* | ACTIVA |
| Mayorca | 12 | 03 | 7,484 | 533 | -16,858* | ACTIVA |
| Centro (viejo) | 30 | 00 | 2,583 | 515 | -8,403* | REVISAR |
| Centro | 31 | 00 | 10,403 | 836 | -28,601* | ACTIVA |
| Gran Plaza | 32 | 23 | 8,077 | 608 | -25,399* | ACTIVA |
| Caldas | 39 | 29 | 5,928 | 537 | -19,655* | ACTIVA |
| **Principal (B10)** | **10** | **01** | **50,695** | **3,089** | **-1,163,031*** | **MAIN** |

> *Unidades netas negativas: PIL incluye registros historicos con cantidades negativas (salidas). El stock actual real es el subconjunto de PIL con `quantity > 0`.

### Clasificacion de bodegas (sag-warehouse-lookup.ts)

El modulo clasifica bodegas via funciones de pattern matching:

- `isRetailWarehouse()` — detecta F-stores, SANDIEGO, MAYORCA, GRAN PLAZA, CENTRO, CALDAS, PAGINA WEB, PLAN SEPARE, DEXCATO
- `isMainWarehouse()` — detecta BODEGA PRINCIPAL
- `isNonRetailWarehouse()` — excluye MATERIA PRIMA, PRODUCTO EN PROCESO, TELAS, RETAZOS, MUESTRAS, IMPORTACION, etc.

### Configuracion administrativa

- Archivo: `store-warehouse-config-service.ts`
- Persistencia: AgentExecution con operation `COMERCIAL_STORE_WAREHOUSE_MAPPING_CONFIG`
- Campos: storeName, sagWarehouseCode, city, responsibleName, storeType, isMainWarehouse, active, source
- **Estado actual:** 0 executions encontradas en DB — la configuracion se resuelve dinamicamente desde SAG BODEGAS cache

### Hallazgo critico: Bodega 30 vs 31

Ambas bodegas 30 y 31 comparten ss_codigo="00". La bodega 30 tiene 2,583 PIL records (515 con stock) y la 31 tiene 10,403 (836 con stock). WH 30 parece ser la version anterior del Centro. **Decision requerida:** confirmar si WH 30 esta activa o debe excluirse.

---

## SEGUNDO: Inventario por tienda (PIL)

### Stock actual por tienda (refs con quantity > 0)

| Tienda | WH | Refs con stock | Total PIL records |
|---|---|---|---|
| San Diego | 11 | 582 | 15,975 |
| Mayorca | 12 | 533 | 7,484 |
| Centro (viejo) | 30 | 515 | 2,583 |
| Centro | 31 | 836 | 10,403 |
| Gran Plaza | 32 | 608 | 8,077 |
| Caldas | 39 | 537 | 5,928 |
| Principal (B10) | 10 | 3,089 | 50,695 |

### Total PIL en sistema

- **158,174** registros PIL en total para Castillitos
- **40 bodegas** distintas con PIL records
- Las 6 tiendas + Principal representan ~66% de todos los PIL records

### Fuente de datos de inventario

```
ProductInventoryLevel (PIL)
  ├── warehouseId: string  (ka_nl_bodega — SAG internal PK)
  ├── quantity: number     (puede ser negativo — historico)
  ├── reservedQty: number  (siempre 0 en Castillitos)
  └── productId: string    (FK a ProductEntity)
```

**Contrato existente:** `sag-store-adapter.ts` ya realiza las queries PIL por bodega. El Centro de Inteligencia NO debe crear queries PIL propias.

### Resolucion de variantes

- `variant-attribute-resolver.ts` — resuelve talla y color desde ProductEntity.name
- `store-business-lines.ts` — clasifica productLine en business lines:
  - Line 1 → castillitos (textile)
  - Line 2 → latin_kids (textile)
  - Line 3 → castillitos (textile, pijamas dama)
  - Line 4 → accesorios_importacion (accessory)
  - Line 5 → accesorios_importacion (jugueteria, dormitorio)

---

## TERCERO: Ventas por tienda

### Hallazgo critico: SaleRecord NO identifica tiendas fisicas

| Campo | Valor | Usable para tiendas? |
|---|---|---|
| SaleRecord.storeCode | NULL en 100% (129,045 records) | NO |
| SaleRecord.productCode | NULL en 100% | NO |
| SaleRecord.storeName | Canales de facturacion, no bodegas fisicas | NO |

### Distribucion de SaleRecord.storeName (canales de facturacion)

| Canal | Records |
|---|---|
| SAG | 44,915 |
| Empresa | 35,861 |
| Empresa F2 | 15,210 |
| Almacen D | 9,059 |
| Almacen G | 6,492 |
| Almacen A | 6,436 |
| Almacen C | 4,524 |
| Addi/Sistecredit | 2,328 |
| POS | 1,917 |
| Tienda Web | 1,709 |
| Almacen | 384 |
| Empresa F1 | 210 |

> Estos NO son bodegas fisicas. Son canales de facturacion derivados de FUENTES (codigos de comprobante SAG). "Almacen A/C/D/G" son listas de precios, no tiendas.

### La llave real: CustomerOrderLine.warehouseId

**CustomerOrderLine.warehouseId (Int)** es el campo que vincula ventas/ordenes a bodegas fisicas (ka_nl_bodega).

| WH | Lines (all time) | Lines (6M) | Rango de fechas |
|---|---|---|---|
| 10 (Principal) | 1,124,581 | 75,208 | 2020-06-11 → 2026-07-15 |
| 33 (Importacion) | 20,776 | — | — |
| 31 (Centro) | 330 | 0 | 2023-03-24 → 2025-09-01 |
| 11 (San Diego) | 262 | 1 | 2022-09-16 → 2026-06-23 |
| 30 (Centro viejo) | 210 | 0 | — |
| 32 (Gran Plaza) | 118 | 0 | 2024-05-31 → 2024-05-31 |
| 39 (Caldas) | 28 | 0 | 2025-02-14 → 2025-02-14 |
| 12 (Mayorca) | 1 | 0 | 2024-10-10 → 2024-10-10 |

### Diagnostico de ventas por tienda

**BLOQUEADOR PARCIAL:** Las tiendas tienen muy pocas lineas de orden con warehouseId asignado a sus bodegas. El 97% de las ventas van a WH 10 (Principal). Esto puede significar:

1. **Los pedidos se facturan desde bodega principal** — la tienda vende pero la factura sale de B10
2. **El campo warehouseId no se llena correctamente** para ventas retail
3. **Las ventas retail realmente se despachan desde B10** y las tiendas solo exhiben

**Implicacion:** No es posible calcular "ventas por tienda" de forma confiable usando CustomerOrderLine.warehouseId. Solo B10 y B33 (importacion) tienen volumen significativo.

**Alternativa potencial:** SaleRecord.storeName con valores como "Almacen A/C/D/G" podria mapear a tiendas, pero esto requiere una tabla de mapeo que no existe hoy y la calidad seria ESTIMATED.

---

## CUARTO: Fecha de ingreso por tienda (para descuentos)

### Fuentes disponibles

| Fuente | Campo | Estado | Calidad |
|---|---|---|---|
| ProductEntity.createdAt | Fecha de creacion en Prisma | Disponible | Fecha de sync, no de ingreso fisico |
| ProductEntity.lastPurchaseSag | d_ultima_compra de SAG | Disponible (nullable) | Fecha de ultima compra global, no por tienda |
| ProductInventoryLevel | Solo quantity/reservedQty | Sin timestamp de ingreso | NO USABLE |
| InventoryTransfer | transferDate, destinationWarehouseCode | Disponible | Fecha de traslado a tienda |

### Estrategia viable para fecha de ingreso por tienda

**InventoryTransfer** es la unica fuente que puede dar "cuando llego el producto a ESTA tienda":

```
InventoryTransfer
  ├── originWarehouseCode: string
  ├── destinationWarehouseCode: string
  ├── transferDate: Date
  ├── transferType: string (TR/TM)
  └── status: string (closed/open)
```

Para calcular "dias en tienda" de una referencia:
1. Buscar el ultimo InventoryTransfer con destinationWarehouseCode = WH de la tienda
2. Que contenga la referencia (requiere datos a nivel de linea — ver seccion QUINTO)

**BLOQUEADOR:** InventoryTransfer solo tiene datos de encabezado (ver seccion QUINTO).

### Configuracion de descuentos automaticos

Ya implementada en `store-policy-pack-config.ts`:

```typescript
CASTILLITOS_AUTOMATIC_MARKDOWN = {
  applicableStoreIds: ["centro", "caldas"],
  tiers: [
    { monthsThreshold: 3,  discountPct: 10 },
    { monthsThreshold: 6,  discountPct: 30 },
    { monthsThreshold: 9,  discountPct: 50 },
    { monthsThreshold: 12, discountPct: 70 },
  ],
};
```

**Solo aplica a Centro y Caldas.** Los umbrales ya estan configurados pero la fuente de "fecha de ingreso a tienda" es el bloqueador.

---

## QUINTO: Traslados (InventoryTransfer)

### Volumetria

- **3,122 traslados** en total
- **2,974** tipo TR (traslado regular), **148** tipo TM
- **1,891** cerrados, **1,231** abiertos

### Top pares de traslado

| Origen → Destino | Count | Interpretacion |
|---|---|---|
| 10 → 11 | 302 | Principal → San Diego |
| 10 → 31 | 279 | Principal → Centro |
| 33 → 31 | 203 | Importacion → Centro |
| 33 → 11 | 194 | Importacion → San Diego |
| 33 → 32 | 188 | Importacion → Gran Plaza |
| 10 → 32 | 142 | Principal → Gran Plaza |
| 33 → 39 | 107 | Importacion → Caldas |
| 30 → 10 | 99 | Centro viejo → Principal (retorno?) |
| 10 → 12 | 94 | Principal → Mayorca |
| 10 → 39 | 90 | Principal → Caldas |
| 31 → 33 | 85 | Centro → Importacion (retorno?) |
| 31 → 10 | 66 | Centro → Principal (retorno) |
| 24 → 00 | 66 | B24 (Importacion) → B00 (ss_codigo Centro?) |
| 11 → 10 | 61 | San Diego → Principal (retorno) |
| 24 → 29 | 49 | B24 → B29 (ss_codigo Caldas) |
| 24 → 02 | 38 | B24 → B02 (ss_codigo San Diego) |
| 24 → 23 | 36 | B24 → B23 (ss_codigo Gran Plaza) |

### Hallazgo: Formato de codigos de bodega en traslados

Los traslados usan **AMBOS** formatos de codigo:
- Algunos usan ka_nl_bodega (10, 11, 31, 33...)
- Otros usan ss_codigo (24=importacion via ss_codigo, 02=San Diego via ss_codigo, etc.)

**Implicacion:** Para consultar traslados hacia una tienda, hay que buscar por AMBOS codigos (ka_nl_bodega Y ss_codigo).

### BLOQUEADOR: Sin datos a nivel de linea

- InventoryTransfer tiene datos de encabezado (origen, destino, fecha, tipo)
- **No existe modelo InventoryTransferLine** en Prisma
- rawJson solo contiene datos de header
- **Sin lineas, no es posible saber QUE productos se trasladaron**
- Esto bloquea: "fecha de ingreso de la referencia X a la tienda Y"

### Contrato existente

`store-transfer-service.ts` ya maneja la creacion de propuestas de traslado (StoreReplenishmentProposal) — pero estas son propuestas generadas por Agentik, no traslados historicos de SAG.

---

## SEXTO: Costos y rentabilidad

### Cobertura de costo por linea de producto

| Linea | Con costo | Total | Cobertura |
|---|---|---|---|
| Line 1 (Castillitos) | 1,266 | 1,759 | 72% |
| Line 2 (Latin Kids) | 1,489 | 1,490 | **100%** |
| Line 5 (Importacion) | 5 | 663 | **1%** |
| Line null | 505 | 656 | 77% |
| Line 3 (Pijamas dama) | 8 | 13 | 62% |
| Line 6 | 7 | 7 | 100% |
| Line Latin Kids | 0 | 3 | 0% |
| Line 4 (Accesorios) | 0 | 3 | 0% |

### Diagnostico

- **Textil (Lines 1+2+3):** 2,763/3,262 con costo = **85%** — suficiente para KPIs de capital
- **Importacion (Line 5):** 5/663 = **1%** — practicamente sin cobertura de costo
- **Total general:** ~60% con costo > 0

### Implicacion para Centro de Inteligencia

| KPI | Viabilidad | Razon |
|---|---|---|
| Capital invertido en tienda | PARCIAL | Solo textil (85% cobertura). Importacion sin costo |
| Margen por tienda | BLOQUEADO | Sin ventas por tienda confiables |
| Valor de inventario lento | PARCIAL | Depende de "dias en tienda" (bloqueado) |
| Rotacion por costo | BLOQUEADO | Sin ventas por tienda |

---

## SEPTIMO: Rendimiento del drawer

### Arquitectura del drawer

El drawer usa un patron de **carga lazy por tab con cache en memoria**:

```typescript
type TabCacheData = {
  storeId: string;
  shortages?: { shortages: StoreShortage[]; assortmentNeeds: StoreAssortmentNeed[] };
  suggestions?: { suggestions: ReplenishmentSuggestion[]; assortmentNeeds: StoreAssortmentNeed[] };
  coverage?: { textileCoverage: TextileCoverageAnalysis[] };
  warehouse?: { mainStock: MainWarehouseAvailability[] };
};
```

- **Primer click en tienda:** Solo abre drawer, no carga datos de tabs
- **Click en tab:** Fetch API → cache en `tabCacheRef` → render
- **Cambio de tab:** Si cache existe para ese storeId, usa cache (instantaneo)
- **Cambio de tienda:** Cache se invalida (nuevo storeId)
- TTL en server: datos 2min, policies 1min, catalogo de reglas 5min

### Tabs del drawer (6)

| Tab | Key | Carga | API endpoint |
|---|---|---|---|
| Inventario | `inventario` | Lazy | `/api/orgs/{slug}/comercial/tiendas` action=store_detail |
| Faltantes | `faltantes` | Lazy + cache | `/api/orgs/{slug}/comercial/tiendas/needs` |
| Sugerencias | `sugerencias` | Lazy + cache | `/api/orgs/{slug}/comercial/tiendas/suggestions` |
| Cobertura Textil | `cobertura_textil` | Lazy + cache | Inline compute via `computeTextileCoverageKpi()` |
| Reglas | `reglas` | Lazy | `/api/orgs/{slug}/comercial/tiendas/policies` |
| Bodega | `bodega` | Lazy + cache | `/api/orgs/{slug}/comercial/tiendas` action=main_warehouse |

### Evaluacion de rendimiento

| Aspecto | Estado | Nota |
|---|---|---|
| Lazy loading por tab | OK | Solo carga datos cuando se accede al tab |
| Cache client-side | OK | tabCacheRef persiste entre cambios de tab |
| TTL server-side | OK | 1-5 min TTL en cache de servidor |
| useMemo en componentes | PARCIAL | Algunos componentes no memoizan filtros/sorts |
| Bundle size | ALERTA | 4,676 lineas en un solo archivo client |

### Recomendacion

El archivo `tiendas-client.tsx` con 4,676 lineas es excesivamente grande. Contiene 30+ funciones/componentes internos. Deberia dividirse en archivos separados, pero esto es una mejora de mantenibilidad, no un bloqueador funcional.

---

## OCTAVO: Pestanas y vistas — clasificacion

### Vistas de nivel superior (WorkspaceView)

| Vista | Key | Estado | Veredicto | Razon |
|---|---|---|---|---|
| Tiendas | `tiendas` | Cards de tienda con metricas | CONSERVAR | Puerta de entrada al modulo |
| Necesidades | `necesidades` | Motor de necesidades de surtido | CONSERVAR | Vista transversal de faltantes |
| Sugerencias | `sugerencias` | Motor de sugerencias | CONSERVAR | Recomendaciones automaticas |
| Guias | `guias` | Guias de surtido (PDF) | CONSERVAR | Entregable operativo |
| Propuestas | `propuestas` | Propuestas de traslado | CONSERVAR | Workflow de aprobacion |

### Tabs del drawer por tienda (6)

| Tab | Key | Veredicto | Razon |
|---|---|---|---|
| Inventario | `inventario` | CONSERVAR | Vista base de stock actual |
| Faltantes | `faltantes` | ADAPTAR | Necesita integracion con datos de ventas (cuando disponibles) |
| Sugerencias | `sugerencias` | ADAPTAR | Necesita enriquecer con rotacion/aging |
| Cobertura Textil | `cobertura_textil` | CONSERVAR | Motor textil bien implementado |
| Reglas | `reglas` | ADAPTAR | Migrar a policy pack unificado |
| Bodega | `bodega` | CONSERVAR | Vista de disponibilidad central |

### Componentes auxiliares

| Componente | Linea | Veredicto |
|---|---|---|
| StoreCardView | 953 | CONSERVAR — card de resumen por tienda |
| ProposalsListView | 1082 | CONSERVAR — lista de propuestas |
| StoreDetailDrawer | 1166 | CONSERVAR — drawer principal |
| ShortagesTab | 1348 | ADAPTAR |
| SuggestionsTab | 1516 | ADAPTAR |
| StockLookupPanel | 1723 | CONSERVAR — busqueda en bodega |
| InventarioTab | 1818 | CONSERVAR |
| RulesTab | 2063 | ELIMINAR — reemplazado por PolicyTab |
| TextileCoverageTab | 2167 | CONSERVAR |
| PolicyTab | 2449 | CONSERVAR |
| AddPolicyRuleForm | 2611 | CONSERVAR |
| NeedsView | 2924 | CONSERVAR |
| SuggestionsMotorView | 3165 | CONSERVAR |
| GuidesView | 3454 | CONSERVAR |
| GuideDetailDrawer | 3584 | CONSERVAR |
| MainWarehouseTab | 3765 | CONSERVAR |
| ProposalDetailDrawer | 3877 | CONSERVAR |
| WarehouseConfigDrawer | 4373 | CONSERVAR |
| WarehouseConfigForm | 4528 | CONSERVAR |

---

## NOVENO: Mapa de requerimientos Castillitos

### Las 7 reglas del negocio

| # | Regla | Datos necesarios | Estado datos | Implementacion |
|---|---|---|---|---|
| 1 | Textil: 8-12 unidades por ref por tienda | PIL por bodega + business line | DISPONIBLE | `CASTILLITOS_TEXTILE_COVERAGE` (min=8, ideal=10, max=12) + `textile-coverage-engine.ts` |
| 2 | Descuentos por envejecimiento (10/30/50/70%) | Fecha de ingreso a tienda + PIL | BLOQUEADO (sin lineas de traslado) | `CASTILLITOS_AUTOMATIC_MARKDOWN` configurado, motor pendiente de fuente de fecha |
| 3 | Regla 36: si total global <= 36 uds, solo Centro y Caldas mantienen | PIL total global + config | DISPONIBLE | `CASTILLITOS_GLOBAL_LOW_STOCK` (threshold=36, allowed=centro,caldas) |
| 4 | Accesorios por talla: small=6, medium=4, large=1, oversized=1 | PIL + sizeClass del producto | DISPONIBLE | `CASTILLITOS_ACCESSORY_COVERAGE` configurado |
| 5 | Productos especiales (banera, cuna, corral): 3 uds en San Diego y Caldas | PIL + referencePatterns | DISPONIBLE | `CASTILLITOS_SPECIAL_PRODUCTS` configurado |
| 6 | Rotacion lenta > 90 dias | Fecha de ingreso a tienda | BLOQUEADO (sin lineas de traslado) | `CASTILLITOS_SLOW_ROTATION` (minimumDaysThreshold=90) |
| 7 | Propuestas de surtido con aprobacion | Motor de sugerencias + workflow | DISPONIBLE | `store-transfer-service.ts` + ProposalDetailDrawer |

### Resumen de viabilidad

- **5 de 7 reglas** tienen datos disponibles y motores configurados
- **2 reglas** (descuentos por envejecimiento y rotacion lenta) estan **bloqueadas** por la ausencia de datos a nivel de linea en InventoryTransfer

---

## DECIMO: Parametros configurables

### Archivo unico: store-policy-pack-config.ts

Todos los umbrales viven en un solo archivo con interfaces tipadas:

```typescript
StorePolicyPackConfig {
  tenantId: string;
  version: string;
  textileCoverage:     TextileCoverageConfig;     // min/ideal/max units
  globalLowStock:      GlobalLowStockConfig;      // threshold + allowedStoreIds
  accessoryCoverage:   AccessoryCoverageConfig;    // idealBySize
  specialProducts:     SpecialProductConfig;       // referencePatterns + idealByStore
  automaticMarkdown:   AutomaticMarkdownConfig;    // tiers by months
  slowRotation:        SlowRotationConfig;         // minimumDaysThreshold
}
```

**Patron correcto:** Cambiar un umbral = editar un numero en este archivo. No se necesita cambiar motores ni UI.

**Futuro:** Estos valores migraran a Prisma (configuracion per-tenant).

---

## UNDECIMO: Arquitectura canonica del modulo

### Archivos lib/ (39 archivos)

| Capa | Archivos | Funcion |
|---|---|---|
| **Tipos** (5) | store-replenishment-types.ts, store-transfer-types.ts, store-policy-types.ts, store-needs-types.ts, store-suggestions-types.ts, assortment-types.ts, store-decision-types.ts, store-guide-types.ts, store-replacement-types.ts | Tipos puros, sin runtime |
| **Adaptador SAG** (2) | sag-store-adapter.ts, sag-warehouse-lookup.ts | Lectura de PIL + cache de BODEGAS |
| **Config** (3) | store-warehouse-config-service.ts, store-business-lines.ts, store-policy-pack-config.ts | Configuracion administrativa |
| **Motores puros** (7) | store-replenishment-engine.ts, store-needs-engine.ts, store-suggestions-engine.ts, textile-coverage-engine.ts, assortment-engine.ts, store-decision-engine.ts, store-replacement-engine.ts | Logica pura sin side effects |
| **Servicios** (5) | store-replenishment-service.ts, store-needs-service.ts, store-suggestions-service.ts, store-guide-service.ts, store-policy-service.ts | Orquestacion con cache TTL |
| **Soporte** (4) | store-transfer-service.ts, store-guide-generator.ts, store-guide-pdf-renderer.tsx, store-rule-catalog.ts | Transferencias, PDF, catalogo |
| **Providers** (3) | providers/sag-current-provider.ts, providers/sag-data-warehouse-provider.ts, providers/demo-provider.ts | Abstraccion de fuente de datos |
| **Otros** (3) | variant-attribute-resolver.ts, active-inventory.ts, coverage-strategy.ts, store-policy-pack.ts, store-policy-engine.ts, store-business-decisions.ts | Utilidades |

### API Routes (7)

| Ruta | Acciones |
|---|---|
| `/comercial/tiendas` | workspace, store_detail, main_warehouse, sync_sag |
| `/comercial/tiendas/needs` | list_needs, need_summary |
| `/comercial/tiendas/suggestions` | list_suggestions, suggestion_summary |
| `/comercial/tiendas/guides` | list, create, get, update_status |
| `/comercial/tiendas/proposals` | list, create, get, approve, reject, duplicate_check |
| `/comercial/tiendas/policies` | list, create, update, delete |
| `/comercial/tiendas/warehouse-config` | list, save, toggle |

### Flujo de datos

```
page.tsx (Server)
  └── getStoresWorkspaceWithSignals(orgId)
        └── SagCurrentProvider.resolve()
              ├── listWarehouseConfigs(orgId)      → bodegas configuradas
              ├── loadWarehouseLookup(orgId)        → cache SAG BODEGAS
              ├── PIL.findMany(warehouseId in [...]) → stock por bodega
              └── Mapeo → StoreLocation[] + StoreCard[]

tiendas-client.tsx (Client)
  └── Lazy fetch per drawer tab:
        ├── /tiendas (store_detail) → inventory variants
        ├── /needs → shortages + assortment needs
        ├── /suggestions → replenishment suggestions
        └── /policies → policy rules
```

---

## DUODECIMO: Datos de cliente

### CustomerOrderLine por tienda (historico de pedidos)

Los datos de pedidos vinculados a bodegas de tienda son **extremadamente escasos**:

- WH 11 (San Diego): 262 lineas all-time, 1 en ultimos 6M
- WH 31 (Centro): 330 lineas, 0 en 6M
- WH 32 (Gran Plaza): 118 lineas, 0 en 6M
- WH 39 (Caldas): 28 lineas, 0 en 6M
- WH 12 (Mayorca): 1 linea, 0 en 6M

### CustomerProfile

No auditado en este sprint. El modulo Tiendas actualmente NO consume datos de CustomerProfile. Las tiendas son B2C (venta directa) — no hay concepto de "cliente" por tienda.

---

## DECIMOTERCERO: Validacion con datos reales

### Tienda San Diego (WH 11)

| Metrica | Valor |
|---|---|
| PIL records | 15,975 |
| Refs con stock > 0 | 582 |
| Lineas de pedido (all-time) | 262 |
| Lineas de pedido (6M) | 1 |
| Traslados como destino | 302 (desde B10) + 194 (desde B33) |
| Traslados como origen | 61 (hacia B10 — retornos) |

### Tienda Centro (WH 31)

| Metrica | Valor |
|---|---|
| PIL records | 10,403 |
| Refs con stock > 0 | 836 |
| Lineas de pedido (all-time) | 330 |
| Lineas de pedido (6M) | 0 |
| Traslados como destino | 279 (desde B10) + 203 (desde B33) |
| Rango de fechas COL | 2023-03-24 → 2025-09-01 |

### Tienda Gran Plaza (WH 32)

| Metrica | Valor |
|---|---|
| PIL records | 8,077 |
| Refs con stock > 0 | 608 |
| Lineas de pedido (all-time) | 118 |
| Lineas de pedido (6M) | 0 |
| Traslados como destino | 142 (desde B10) + 188 (desde B33) |

### Tienda Caldas (WH 39)

| Metrica | Valor |
|---|---|
| PIL records | 5,928 |
| Refs con stock > 0 | 537 |
| Lineas de pedido (all-time) | 28 |
| Lineas de pedido (6M) | 0 |
| Traslados como destino | 90 (desde B10) + 107 (desde B33) |

### Observacion critica

Las 4 tiendas activas tienen inventario real (500-836 refs con stock) pero **practicamente cero ventas atribuidas a sus bodegas**. Esto confirma que las ventas se facturan desde B10 (Principal), no desde las bodegas de tienda.

---

## DECIMOCUARTO: Motores canonicos a reutilizar

### Motores existentes que el Centro de Inteligencia DEBE consumir

| Motor | Archivo | Funcion | Pure? |
|---|---|---|---|
| Replenishment engine | store-replenishment-engine.ts | calculateStoreShortages, calculateExactReplenishment, calculateStoreHealth, buildStoreSuggestions | SI |
| Needs engine | store-needs-engine.ts | Calcula necesidades de surtido por tienda | SI |
| Suggestions engine | store-suggestions-engine.ts | Genera sugerencias de reposicion | SI |
| Textile coverage | textile-coverage-engine.ts | computeTextileCoverage, computeTextileCoverageKpi | SI |
| Assortment engine | assortment-engine.ts | evaluateStoreAssortment | SI |
| Decision engine | store-decision-engine.ts | Evaluaciones de decision de surtido | SI |
| Replacement engine | store-replacement-engine.ts | Sustitutos/reemplazos | SI |
| Policy pack | store-policy-pack-config.ts | Umbrales configurables | Config |
| Business lines | store-business-lines.ts | SAG productLine → business line | SI |
| Variant resolver | variant-attribute-resolver.ts | Extrae talla/color de nombre | SI |

### Contratos que NO se deben duplicar

| Necesidad | Contrato autorizado | Prohibido |
|---|---|---|
| Stock por bodega | sag-store-adapter.ts | Query directo a PIL |
| Nombres de bodega | sag-warehouse-lookup.ts | Hardcoded names |
| Config de bodegas | store-warehouse-config-service.ts | Nuevas tablas/modelos |
| Lineas de negocio | store-business-lines.ts | Mapeo inline |
| Umbrales de policy | store-policy-pack-config.ts | Numeros hardcoded |

---

## DECIMOQUINTO: Lo que NO se debe hacer

1. **NO crear queries directas a ProductInventoryLevel** — usar sag-store-adapter.ts
2. **NO duplicar la resolucion de bodegas** — usar sag-warehouse-lookup.ts + store-warehouse-config-service.ts
3. **NO hardcodear nombres de tiendas, ciudades o responsables** — todo viene de configuracion
4. **NO mezclar ventas SaleRecord con inventario PIL** — SaleRecord NO identifica tiendas fisicas
5. **NO crear un modelo Prisma nuevo** para esta fase
6. **NO modificar el SAG adapter** ni el warehouse-master
7. **NO cambiar store-policy-pack-config.ts** sin aprobacion — los umbrales son decisiones de negocio
8. **NO asumir que CustomerOrderLine.warehouseId mapea tiendas** — solo B10 tiene volumen real
9. **NO fusionar bodega 30 y 31 sin confirmar** — pueden ser entidades distintas
10. **NO crear motores de "rotacion por tienda"** sin fuente de ventas por tienda confiable
11. **NO hacer commit automaticamente** — detenerse para revision

---

## Resumen ejecutivo: Que se puede construir vs que esta bloqueado

### SE PUEDE CONSTRUIR HOY (datos disponibles)

| Funcionalidad | Datos | Motor existente |
|---|---|---|
| Dashboard de inventario por tienda (stock actual) | PIL por bodega | sag-store-adapter.ts |
| Cobertura textil (8-12 uds) | PIL + business lines | textile-coverage-engine.ts |
| Regla 36 (stock global bajo) | PIL total + config | store-policy-pack-config.ts |
| Accesorios por talla | PIL + sizeClass | store-policy-pack-config.ts |
| Productos especiales | PIL + referencePatterns | store-policy-pack-config.ts |
| Necesidades de surtido | PIL + reglas | store-needs-engine.ts |
| Sugerencias de reposicion | PIL + bodega principal | store-suggestions-engine.ts |
| Propuestas de traslado | Motor existente | store-transfer-service.ts |
| Guias de surtido (PDF) | Motor existente | store-guide-generator.ts |
| KPI: refs con stock por tienda | PIL | Calculo directo |
| KPI: capital textil por tienda | PIL + ProductEntity.costo (85%) | Calculo nuevo |
| KPI: cobertura textil % | textile-coverage-engine | Existente |

### BLOQUEADO (requiere datos adicionales)

| Funcionalidad | Bloqueador | Solucion propuesta |
|---|---|---|
| Ventas por tienda | COL no tiene warehouseId confiable para tiendas | Mapeo SaleRecord.storeName → bodega (requiere validacion manual) |
| Rotacion por tienda | Sin ventas por tienda | Depende de resolver ventas |
| Dias en tienda por referencia | InventoryTransfer sin lineas | Sync de lineas de traslado desde SAG |
| Descuentos por envejecimiento | Sin fecha de ingreso por ref por tienda | Depende de dias en tienda |
| Rotacion lenta por tienda | Sin ventas + sin dias en tienda | Depende de ambos bloqueadores |
| Margen por tienda | Sin ventas + cobertura de costo parcial | Multiple dependencias |

### DECISIONES PENDIENTES

| # | Decision | Opciones |
|---|---|---|
| D1 | Bodega 30 vs 31 (ambas ss_codigo=00) | A) Ambas activas B) Solo 31 C) 30 = legacy |
| D2 | Como atribuir ventas a tiendas | A) Mapeo SaleRecord.storeName B) No implementar ventas por tienda C) Nuevo campo en sync |
| D3 | Prioridad de lineas de traslado | A) Sprint separado para sync B) Estimar fecha por ultimo traslado header C) No implementar aging |
| D4 | Mayorca: activa o inactiva? | Solo 1 COL, 94 traslados desde B10 |

---

## Roadmap propuesto (3 fases)

### Fase 1: Intelligence service sobre datos disponibles
1. Crear `store-intelligence-service.ts` en lib/comercial/tiendas/
2. Tipo `StoreIntelligenceItem` unificado con clasificaciones
3. KPIs ejecutivos: stock, cobertura textil, capital textil, cumplimiento de reglas
4. Consumir motores existentes (needs, suggestions, textile-coverage)
5. No crear queries nuevas a Prisma

### Fase 2: UI del Centro de Inteligencia
1. Nuevo tab o vista en tiendas-client (o componente separado)
2. Dashboard ejecutivo con KPIs por tienda
3. Vista de cumplimiento de reglas (5 de 7 reglas disponibles)
4. Insignia de salud por tienda
5. Usar primitivas Agentik existentes

### Fase 3: Desbloqueo de datos (sprint separado)
1. Investigar mapeo SaleRecord.storeName → bodega fisica
2. Sync de lineas de traslado desde SAG (InventoryTransferLine)
3. Calcular dias en tienda y habilitar reglas de envejecimiento
4. Habilitar rotacion y margen por tienda
