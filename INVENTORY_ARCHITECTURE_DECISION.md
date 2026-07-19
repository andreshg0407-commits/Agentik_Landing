# INVENTORY_ARCHITECTURE_DECISION.md

**Sprint:** SAG-INVENTORY-SYNC-01 — Phase 10
**Date:** 2026-06-23
**Author:** Agentik Engineering
**Status:** APPROVED

---

## 1. Modelo elegido

**Snapshot de inventario por variante**, usando tres modelos Prisma existentes:

```
ProductEntity (ya existente, 4,561 registros SAG)
  └── ProductVariant (53,331 registros creados)
        ├── attributes: { talla, tallaName, color, colorName }
        ├── externalSource: "sag"
        ├── externalId: "{productCode}|{sizeCode}|{colorCode}"
        └── ProductInventoryLevel (156,832 registros creados)
              ├── warehouseId: string (SAG ka_nl_bodega)
              ├── quantity: int (stock actual computado)
              ├── reservedQty: int (reservas Agentik, 0 desde SAG)
              ├── source: "sag"
              ├── externalRef: warehouse code
              └── syncedAt: timestamp del sync
```

**No se creo ningun modelo Prisma nuevo.** La estructura existente era suficiente.

---

## 2. Cardinalidades (datos reales Castillitos)

| Dimension | Cantidad |
|---|---|
| ProductEntity (SAG comerciales) | 4,561 |
| ProductVariant (talla+color combos) | 53,331 |
| ProductInventoryLevel (snapshot rows) | 156,832 |
| Bodegas sincronizadas | 39 |
| Bodegas con stock activo | 30 |
| Productos con stock | 4,118 |
| Productos agotados | 443 |
| Variantes con stock | 53,302 |
| Variantes agotadas | 29 |
| Cobertura comercial | 90.3% |

### Ratios operacionales

| Ratio | Valor |
|---|---|
| Variantes por producto | ~11.7 promedio |
| Niveles por variante | ~2.9 promedio (warehouses) |
| Niveles por producto | ~34.4 promedio |

---

## 3. Estrategia de sincronizacion

### Flujo

```
1. Fetch master lookups (COLORES, BODEGAS, etc.)    → 7 tablas, in-memory maps
2. Fetch variant inventory (SAG_VARIANT_INVENTORY_QUERY)  → 156K rows
3. Normalize (sag-inventory-normalizer.ts)           → 53K variant payloads
4. Pre-load existing records (3 queries)             → products, variants, levels
5. Classify create vs update                         → skip unchanged records
6. Upsert in parallel batches (25 concurrent)        → ProductVariant + ProductInventoryLevel
```

### Optimizaciones implementadas

- **Pre-load all lookups** en 3 queries (vs N+1 por variante)
- **Parallel batches** de 25 operaciones concurrentes
- **Skip unchanged** records (mismo nombre, misma cantidad)
- **Cache created IDs** para re-sync scenarios

### Tiempos observados

| Fase | Duracion |
|---|---|
| SAG SOAP fetch (156K rows) | ~60 seconds |
| Normalization | < 1 second |
| Pre-load lookups | ~5 seconds |
| Upsert 53K variants + 156K levels | ~50 minutes (initial load) |
| **Re-sync (incremental)** | **~5-10 minutes** (mostly skips) |

---

## 4. Frecuencia recomendada

| Escenario | Frecuencia | Justificacion |
|---|---|---|
| **Produccion inicial** | 1x diario (noche) | Baja frecuencia de cambio en Castillitos |
| **Con cron** | Cada 6 horas | Balance entre frescura y carga SOAP |
| **Antes de pedido** | On-demand por producto | `getProductVariantsFromSag()` ya existe |
| **Futuro con webhooks** | Event-driven | Si SAG soporta notificaciones |

La re-sincronizacion es incremental: solo actualiza registros con cantidad diferente. Un re-sync toma 5-10 minutos vs 50 min del initial load.

---

## 5. Riesgos

### 5.1 Performance del initial load

53K variants con upserts individuales toma ~50 minutos. Mitigaciones:
- Parallel batches de 25
- Pre-loaded lookups eliminan N+1
- Re-syncs son significativamente mas rapidos (solo cambios)
- Futuro: raw SQL bulk insert para loads iniciales

### 5.2 Consistencia temporal

El query SAG computa saldos desde TODAS las transacciones historicas. Si un movimiento se anula despues del sync, el snapshot queda desactualizado hasta el proximo sync. Mitigacion: frecuencia de sync configurable.

### 5.3 Bodegas con stock negativo

Algunas bodegas muestran stock negativo (ej: bodega 02 con -3). Esto indica discrepancias en SAG (mas salidas que entradas registradas). El sync los importa fielmente — la regla de negocio de como tratar negativos es del consumidor (Pedidos, Tiendas).

### 5.4 Productos sin variante pero con kardex

443 productos estan en ProductEntity pero sin stock en MOVIMIENTOS_ITEMS. Son productos comerciales pero sin movimientos de inventario (nuevos, descontinuados, o solo en listas de precios). Aparecen correctamente como "agotados" en cobertura.

### 5.5 warehouseId como string

ProductInventoryLevel usa `warehouseId: String` (no FK a una tabla Warehouse). Esto es correcto para el estado actual — no hay modelo Warehouse en Prisma. Si se agrega, se puede migrar con `externalRef` como puente.

---

## 6. Evolucion futura

### Sprint siguiente: SAG-INVENTORY-PEDIDOS-01

Conectar inventario a Pedidos:
- `searchAvailableVariants()` ya esta listo para consumir
- Pedidos selecciona talla+color, valida stock por bodega
- `reservedQty` se incrementa al confirmar pedido

### Sprint futuro: SAG-INVENTORY-TIENDAS-01

Conectar inventario a Tiendas:
- Stock por bodega = stock por tienda (49 bodegas = 49 tiendas)
- `getInventoryByWarehouse()` ya esta listo

### Sprint futuro: SAG-INVENTORY-CRON-01

Automatizar sync:
- Cron job cada 6 horas
- ConnectorRun audit por ejecucion
- Alertas si cobertura cae debajo del 80%

### Sprint futuro: SAG-INVENTORY-RESERVATIONS-01

Implementar reservas:
- Al crear linea de pedido: `reservedQty += qty`
- Al confirmar pedido en SAG: `quantity -= qty, reservedQty -= qty`
- Disponible real = `quantity - reservedQty`

---

## 7. Archivos del sprint

| Archivo | Proposito |
|---|---|
| `lib/comercial/inventory/inventory-types.ts` | Contratos de dominio |
| `lib/comercial/inventory/inventory-read-service.ts` | Servicios de lectura (4 funciones) |
| `lib/comercial/inventory/inventory-coverage.ts` | Indicadores de cobertura comercial |
| `lib/connectors/adapters/sag-pya-soap/inventory/sag-inventory-normalizer.ts` | Normalizador SAG → Prisma payloads |
| `lib/connectors/adapters/sag-pya-soap/inventory/sag-inventory-sync.ts` | Servicio de sync optimizado |
| `scripts/_sag-inventory-sync.ts` | Script de carga (dryrun/sync/validate) |
| `INVENTORY_ARCHITECTURE_DECISION.md` | Este documento |

### Servicios de lectura (Phase 8)

| Funcion | Parametros | Uso |
|---|---|---|
| `getInventoryByProduct()` | orgId, productId | Vista completa de un producto |
| `getInventoryByProductCode()` | orgId, productCode | Busqueda por codigo SAG |
| `getInventoryByVariant()` | orgId, variantId | Stock de una variante especifica |
| `getInventoryByWarehouse()` | orgId, warehouseId | Todo el stock de una bodega |
| `searchAvailableVariants()` | InventorySearchParams | Busqueda con filtros multiples |
