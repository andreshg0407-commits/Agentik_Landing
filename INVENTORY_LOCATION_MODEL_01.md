# INVENTORY-LOCATION-MODEL-01

**Sprint:** Modelo Formal de Ubicaciones de Inventario
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)
**Date:** 2026-06-27

---

## Vision

InventoryLocation es una abstraccion empresarial desacoplada de SAG. Puede representar bodega, tienda, maleta, franquicia, produccion, contenedor, o cualquier otra ubicacion donde exista inventario. Todo motor futuro (LiveVendor, Store Intelligence, Replenishment, David, Knowledge Graph) consume ubicaciones a traves de este modelo, nunca directamente codigos SAG.

---

## Arquitectura

```
lib/logistics/
  inventory-location-types.ts     -- Tipos formales (Phase 1-4, 6-7, 10-11)
  movement-document-types.ts      -- Re-exporta InventoryLocation + MovementDocument
  transfer-types.ts               -- TransferSnapshot (sync layer)
  location-resolver.ts            -- Resolver + transfer integration (Phase 8-9)
  catalogs/
    castillitos-locations.ts      -- Catalogo Castillitos con evidencia (Phase 5-7)
```

---

## Phase 1: Domain Model

| Tipo | Archivo | Descripcion |
|------|---------|-------------|
| InventoryLocation | inventory-location-types.ts | Entidad principal: code, name, type, role, capabilities, status, confidence, source, evidence |
| InventoryLocationType | inventory-location-types.ts | 12 tipos genericos |
| InventoryLocationRole | inventory-location-types.ts | 11 roles operativos |
| InventoryLocationCapability | inventory-location-types.ts | 13 capacidades |
| InventoryLocationStatus | inventory-location-types.ts | 4 estados |
| InventoryLocationConfidence | inventory-location-types.ts | Level (HIGH/MEDIUM/LOW/UNKNOWN) + reason |
| InventoryLocationSource | inventory-location-types.ts | system + entity + confirmedAt |
| InventoryLocationEvidence | inventory-location-types.ts | 9 tipos de evidencia |
| InventoryLocationRelationship | inventory-location-types.ts | source, target, type, confidence, evidence |
| InventoryLocationHierarchy | inventory-location-types.ts | Grupos jerarquicos configurables |

---

## Phase 2: Location Types

| Tipo | Descripcion | Ejemplo Castillitos |
|------|-------------|---------------------|
| MAIN_WAREHOUSE | Hub central de distribucion | 01 |
| PRODUCTION | Area de produccion / WIP | 04 |
| PORTFOLIO | Portafolio de vendedor / maleta | 35-40 |
| STORE | Punto de venta propio | 00, 02, 03, 23, 29 |
| FRANCHISE | Franquicia de terceros | 08-15, 21 |
| IMPORT | Contenedor de importacion | 42-46 |
| STAGING | Area de staging / transito | 24 |
| RAW_MATERIAL | Almacen de materia prima | 05, 06, 07 |
| SERVICE | Area de servicio / muestras / reparaciones | 16, 18, 19, 28 |
| EXTERNAL | Ubicacion de socio externo | (futuro) |
| TEMPORARY | Ubicacion temporal / pop-up | 20 |
| UNKNOWN | Sin clasificar | 22, 26, 27, 30-34, 48, 49 |

---

## Phase 3: Location Roles

| Rol | Descripcion |
|-----|-------------|
| DISTRIBUTION_HUB | Nodo central que alimenta otras ubicaciones |
| SELLING_LOCATION | Genera ventas directamente |
| PORTFOLIO_LOCATION | Vendedor lleva producto para ventas en campo |
| PRODUCTION_STAGE | Parte del pipeline de produccion |
| IMPORT_STAGING | Mercancia pendiente de nacionalizacion |
| RAW_MATERIAL_STORAGE | Almacena insumos para produccion |
| RETURN_LOCATION | Recibe devueltos o danados |
| TRANSFER_ORIGIN | Principalmente despacha stock |
| TRANSFER_DESTINATION | Principalmente recibe stock |
| TEMPORARY_HOLD | Tenencia a corto plazo |
| UNKNOWN_ROLE | Rol no determinado |

---

## Phase 4: Capabilities

13 capacidades que determinan que puede hacer una ubicacion:

- HOLDS_SELLABLE_STOCK, HOLDS_PRODUCTION_STOCK, HOLDS_SAMPLES, HOLDS_RAW_MATERIAL
- CAN_RECEIVE_TRANSFERS, CAN_DISPATCH_TRANSFERS
- CAN_SELL, CAN_PRODUCE, CAN_REPLENISH, CAN_BE_REPLENISHED
- CAN_TRIGGER_PRODUCTION, CAN_TRIGGER_PORTFOLIO_REPLACEMENT, CAN_TRIGGER_STORE_REPLENISHMENT

---

## Phase 5: Catalogo Castillitos

**Total:** 47 ubicaciones clasificadas (37 registradas + 10 descubiertas)

| Grupo | Codigos | Tipo | Confianza | Estado |
|-------|---------|------|-----------|--------|
| Hub Principal | 01 | MAIN_WAREHOUSE | HIGH | ACTIVE |
| Produccion | 04 | PRODUCTION | HIGH | ACTIVE |
| Materia Prima | 05, 06, 07 | RAW_MATERIAL | HIGH | INACTIVE |
| Tiendas | 00, 02, 03, 23, 29, 41 | STORE | HIGH | ACTIVE |
| Maletas | 35, 36, 37, 38, 39, 40 | PORTFOLIO | HIGH | ACTIVE |
| Franquicias | 08-15, 21 | FRANCHISE | HIGH | MIXED |
| Importacion | 42-46 | IMPORT | HIGH | ACTIVE |
| Staging | 24 | STAGING | HIGH | ACTIVE |
| Soporte | 16, 18, 19, 20, 28 | SERVICE/TEMPORARY | HIGH | MIXED |
| Desconocidas | 22, 26, 27, 30-34, 48, 49 | UNKNOWN | LOW | UNVERIFIED |

### Nota: Fredy (bodega 40)

Descubierto en TRANSFER-DISCOVERY-01 como ausente de CASTILLITOS_SELLER_WAREHOUSES. Incluido en el catalogo con sellerId="FREDY". Pendiente agregar a maleta-replacement-engine.ts.

---

## Phase 6: Relationships

31 relaciones definidas con evidencia:

| Flujo | Tipo | Evidencia |
|-------|------|-----------|
| 04 -> 01 | FEEDS | 2,983 productos compartidos. ET fuente 116 |
| 05/06 -> 04 | FEEDS | CN fuente 80 (consumo insumos) |
| 01 -> tiendas | REPLENISHES | 57-99% overlap. TR fuente 34 |
| 01 -> maletas | SUPPLIES | TM fuente 206 |
| 01 -> franquicias | SUPPLIES | TR fuente 34 (historico) |
| contenedores -> 24 | FEEDS | Import staging flow |
| 24 -> 01 | FEEDS | Nacionalizacion |

---

## Phase 7: Hierarchy

| Grupo | Tipo | Ubicaciones | Padre |
|-------|------|-------------|-------|
| HUB PRINCIPAL | HUB | 01 | -- |
| PRODUCCION | PRODUCTION | 04, 05, 06, 07 | -- |
| TIENDAS PROPIAS | SALES | 00, 02, 03, 23, 29, 41 | HUB PRINCIPAL |
| MALETAS VENDEDORES | PORTFOLIOS | 35-40 | HUB PRINCIPAL |
| FRANQUICIAS | SALES | 08-15, 21 | HUB PRINCIPAL |
| IMPORTACIONES | IMPORTS | 24, 42-46 | -- |
| SOPORTE | SUPPORT | 16, 18, 19, 20, 28 | -- |

---

## Phase 8: Resolver

`buildLocationResolver(catalog)` retorna un objeto con:

- `resolveLocationByCode(code)` -- InventoryLocation | undefined
- `resolveLocationType(code)` -- InventoryLocationType
- `resolveLocationRole(code)` -- InventoryLocationRole
- `resolveLocationCapabilities(code)` -- InventoryLocationCapability[]
- `isPortfolioLocation(code)`, `isStoreLocation(code)`, `isProductionLocation(code)`, `isMainWarehouse(code)`
- `canTriggerProduction(code)`, `canTriggerPortfolioReplacement(code)`, `canTriggerStoreReplenishment(code)`
- `getLocationsByType(type)`, `getActiveLocations()`, `getAllCodes()`

---

## Phase 9: Transfer Integration

| Helper | Descripcion |
|--------|-------------|
| `transferToLocationFlow(origin, dest, resolver)` | Resuelve ambas ubicaciones y clasifica la ruta |
| `getTransferOriginLocation(code, resolver)` | Resuelve ubicacion origen |
| `getTransferDestinationLocation(code, resolver)` | Resuelve ubicacion destino |
| `classifyTransferRoute(origin, dest, resolver)` | Clasifica ruta automaticamente por tipos |
| `resolveLocationRelationships(code, rels)` | Filtra relaciones por ubicacion |
| `getOutboundRelationships(code, rels, type?)` | Relaciones salientes |
| `getInboundRelationships(code, rels, type?)` | Relaciones entrantes |

---

## Phase 10: Business Entity Mapping (preparacion)

| Entidad | Relacion con Location |
|---------|----------------------|
| Product | holds_stock_for -- un producto existe en multiples ubicaciones |
| Vendor | assigned_to -- vendedor tiene bodega portfolio asignada |
| Store | holds_stock_for -- tienda tiene ubicacion de inventario |
| ProductionOrder | produces_at -- OP se ejecuta en bodega de produccion |
| Transfer | transfers_from / transfers_to -- traslado conecta dos ubicaciones |

Tipos definidos en `InventoryLocationEntityMapping`. Implementacion completa pendiente para cuando Business Entities esten activas.

---

## Phase 11: Signals (preparacion)

8 tipos de signal definidos en `InventoryLocationSignalType`:

- LOCATION_STOCK_LOW
- LOCATION_OUT_OF_STOCK
- PORTFOLIO_LOCATION_NEEDS_REPLACEMENT
- STORE_LOCATION_NEEDS_REPLENISHMENT
- PRODUCTION_LOCATION_OVERLOADED
- IMPORT_LOCATION_READY_FOR_DISTRIBUTION
- TRANSFER_ROUTE_ACTIVE
- TRANSFER_ROUTE_INACTIVE

Implementacion pendiente para sprint de Business Signals.

---

## Impacto Futuro

### LiveVendor
El resolver identifica `PORTFOLIO` locations con `sellerId`. LiveVendor consumira `getLocationsByType("PORTFOLIO")` + `resolveLocationRelationships()` para construir estado de maleta en vivo.

### Store Intelligence
El resolver identifica `STORE` locations con `storeSlug`. Store Intelligence consumira `getLocationsByType("STORE")` + `canTriggerStoreReplenishment()` para sugerencias de reabastecimiento.

### Production Intelligence
El resolver identifica la relacion `04 FEEDS 01`. Production Intelligence consumira `classifyTransferRoute()` para trackear flujo de producto terminado.

### Replenishment Intelligence
`canTriggerStoreReplenishment()` y `canTriggerPortfolioReplacement()` son los hooks directos. Replenishment consumira `getOutboundRelationships("01", rels, "REPLENISHES")` para saber a quien reabastecer.

### David (Copilot)
David consumira `resolveLocationByCode()` para enriquecer contexto cuando el usuario pregunte por una bodega. Puede usar `confidence.level` para indicar incertidumbre.

### Knowledge Graph
Cada `InventoryLocation` mapea a un `KnowledgeNode` tipo LOCATION. Cada `InventoryLocationRelationship` mapea a un `KnowledgeEdge`.

---

## Archivos Creados/Modificados

| Archivo | Accion |
|---------|--------|
| `lib/logistics/inventory-location-types.ts` | CREATED -- Modelo formal completo |
| `lib/logistics/catalogs/castillitos-locations.ts` | CREATED -- Catalogo + relaciones + jerarquia |
| `lib/logistics/location-resolver.ts` | CREATED -- Resolver + transfer integration |
| `lib/logistics/movement-document-types.ts` | MODIFIED -- Re-exporta desde inventory-location-types.ts |
