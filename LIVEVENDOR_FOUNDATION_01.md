# LIVEVENDOR-FOUNDATION-01

**Sprint:** Fundacion LiveVendor Logistico
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)
**Date:** 2026-06-27

---

## Vision

LiveVendor es una entidad viva que conecta vendedor, ubicacion logistica, inventario de maleta, transferencias TM, disponibilidad comercial e inteligencia de reemplazo. No es un CRUD. Es un modelo operativo que permite a Agentik entender en tiempo real que tiene cada vendedor, que le falta, y que deberia reponerse.

---

## Arquitectura

```
lib/comercial/vendors/
  vendor-types.ts             -- LiveVendor existente (identidad, KPIs, alertas)
  live-vendor-types.ts        -- NUEVO: tipos logisticos (portfolio, transfers, coverage)
  live-vendor-engine.ts       -- NUEVO: motor de ensamblaje (binding, portfolio, replacement)
  live-vendor-loader.ts       -- NUEVO: loader server-side (Prisma queries)

Dependencias consumidas (no modificadas):
  lib/logistics/inventory-location-types.ts
  lib/logistics/catalogs/castillitos-locations.ts
  lib/logistics/location-resolver.ts
  lib/commercial-intelligence/availability-engine.ts
  lib/commercial-intelligence/availability-types.ts
  lib/commercial-intelligence/maleta-replacement-engine.ts
  lib/commercial-intelligence/report-loader.ts
```

---

## Phase 1: Domain Model (live-vendor-types.ts)

| Tipo | Descripcion |
|------|-------------|
| LiveVendorProfile | Entidad principal: vendorId, location, portfolio, transferHistory, coverage, freshness, operationalState |
| VendorLocationBinding | Vinculo vendor → InventoryLocation con confirmacion y evidencia |
| VendorPortfolioSnapshot | Snapshot de maleta: items, totalReferences, totalUnits, lastTransfer |
| VendorInventoryItem | Referencia individual: qty en maleta, qty en Bodega 01, status, replacementRequired |
| VendorTransferHistory | Historial TM: inbound/outbound counts, units, recent records |
| VendorTransferRecord | Transfer individual: direction, type, origin/dest, date, qty |
| VendorReplacementAnalysis | Resultado de analisis de reemplazo por vendedor |
| VendorReplacementCandidate | Referencia que necesita reemplazo con candidatos del mismo SubGrupo |
| VendorCoverageSummary | Resumen de salud: critical, outOfStock, daysSinceReplenishment, health |
| VendorBusinessEntitySnapshot | Adapter para Business Entities (Phase 7) |
| VendorKnowledgeRelation | Relaciones para Knowledge Graph (Phase 8) |
| VendorBusinessSignalType | 6 tipos de signal preparados (Phase 9) |

---

## Phase 2: Vendor Location Binding

Mapping confirmado por evidencia (CASTILLITOS_LOCATIONS + CASTILLITOS_SELLER_WAREHOUSES):

| Vendor | LocationCode | Nombre | Confirmado |
|--------|-------------|--------|------------|
| ORLANDO | 35 | VEND ORLANDO | Si |
| CARLOS_LEON | 36 | VEND CARLOS LEON | Si |
| LUIS | 37 | VEND LUIS | Si |
| NESTOR | 38 | VEND NESTOR | Si |
| CARLOS_VILLA | 39 | VEND CARLOS VILLA | Si |
| FREDY | 40 | VEND FREDY | Si (nuevo — descubierto en TRANSFER-DISCOVERY-01) |

`bindVendorToLocation()` usa el LocationResolver para validar que el sellerId del catalogo coincide.

---

## Phase 3: Portfolio Snapshot

`buildPortfolioSnapshot()` ensambla:

1. Lee ProductInventoryLevel para la bodega del vendedor (qty > 0)
2. Cruza con AvailabilityRows de Bodega 01
3. Aplica reglas CEO (LATIN KIDS <= 30, CASTILLITOS <= 20) para determinar `replacementRequired`
4. Calcula `commercialAvailabilityStatus`: available | low_stock | out_of_stock | unknown

---

## Phase 4: TM Transfer History

`buildTransferHistory()` procesa InventoryTransfer records:

- Filtra por `originWarehouseCode` o `destinationWarehouseCode` = locationCode
- Clasifica como `inbound` o `outbound` relativo al vendedor
- Soporta TM (206) y TR (34) — no asume una sola direccion
- Mantiene los ultimos 20 transfers
- Calcula `lastInboundAt` y `lastOutboundAt`

---

## Phase 5: Portfolio Replacement Intelligence

`analyzeVendorReplacements()` aplica:

1. Filtra items con `replacementRequired = true`
2. Calcula urgencia: critical (0 stock) | high (<30% threshold) | medium (<70%) | low
3. `findReplacementCandidatesSameSubGrupo()` busca alternativas:
   - Mismo SubGrupo
   - Misma SubLinea
   - Existencia > threshold
   - Ordenadas por mayor existencia
   - Maximo 5 candidatos

**Reglas CEO aplicadas:**
- LATIN KIDS: umbral 30
- CASTILLITOS: umbral 20

---

## Phase 6: Coverage Summary

`computeVendorCoverage()` produce:

| Campo | Descripcion |
|-------|-------------|
| totalReferences | Total refs en maleta |
| criticalReferences | Refs con low_stock |
| outOfStockReferences | Refs con zero stock en Bodega 01 |
| replacementRequiredReferences | Refs que requieren reemplazo per CEO |
| unknownReferences | Refs sin datos de disponibilidad |
| lastReplenishmentAt | Ultimo TM inbound |
| daysSinceLastReplenishment | Dias calculados |
| health | healthy / attention_needed / critical / unknown |

**Health derivation:**
- critical: >30% problem refs OR >14 dias sin reposicion
- attention_needed: >10% problem refs OR >7 dias
- healthy: resto

---

## Phase 7: Business Entity Snapshot

`liveVendorToBusinessEntitySnapshot()` genera alertas automaticas:

| Signal | Condicion | Severidad |
|--------|-----------|-----------|
| VENDOR_REFERENCE_OUT_OF_STOCK | outOfStock > 0 | critical si >3 refs |
| VENDOR_REPLACEMENT_REQUIRED | replacementRequired > 0 | medium |
| VENDOR_PORTFOLIO_STALE | >14 dias sin reposicion | high/critical |

---

## Phase 8: Knowledge Graph Relations

6 tipos de relacion preparados:
- assigned_to_location (Vendor → Location)
- carries_product (Vendor → Product)
- received_transfer / returned_transfer (Vendor → Transfer)
- location_of_vendor (Location → Vendor)
- carried_by_vendor (Product → Vendor)

---

## Phase 9: Business Signals

6 signal types preparados (no activados):
- VENDOR_PORTFOLIO_STALE
- VENDOR_REFERENCE_OUT_OF_STOCK
- VENDOR_REPLACEMENT_REQUIRED
- VENDOR_REPLENISHMENT_NEEDED
- VENDOR_TRANSFER_RECEIVED
- VENDOR_TRANSFER_RETURNED

---

## Phase 10: Data Quality

Detectado y documentado:

| Hallazgo | Estado |
|----------|--------|
| Fredy (bodega 40) faltaba en CASTILLITOS_SELLER_WAREHOUSES | Incluido en catalogo y VENDOR_LOCATION_MAP |
| Bodegas 35-40 casi vacias en ProductInventoryLevel V2 | Datos reales via TM transfers (aun no sincronizados) |
| TM (fuente 206) no sincronizada | InventoryTransfer model listo, sync pipeline construido |
| V1 context bridge vs V2 ProductInventoryLevel | V1 datos via CommercialCoverageSnapshot, V2 per-variant |
| Loader usa try/catch para tablas que no existen aun | Graceful fallback a arrays vacios |

---

## Phase 11: Server-Side Loader

| Funcion | Descripcion |
|---------|-------------|
| `loadLiveVendors(orgId)` | Carga todos los perfiles LiveVendor |
| `loadLiveVendorById(orgId, vendorId)` | Carga un solo vendedor |
| `loadVendorPortfolioSnapshots(orgId)` | Alias para loadLiveVendors (futura optimizacion) |
| `loadVendorReplacementAnalysis(orgId, vendorId)` | Analisis de reemplazo para un vendedor |

---

## Limitaciones Actuales

1. TM transfers aun no sincronizados desde SAG — transferHistory estara vacio hasta que se ejecute el sync
2. ProductInventoryLevel para bodegas 35-40 tiene datos V2 limitados (pocos registros con qty > 0)
3. No hay UI — solo modelo y loaders
4. Replacement candidates son sugerencias basicas (mismo SubGrupo, mayor stock)
5. No hay alertas activas — solo preparacion de signal types

---

## Roadmap

| Sprint | Objetivo |
|--------|----------|
| TM Sync Execution | Ejecutar syncInventoryTransfers() con fuente 206 para poblar InventoryTransfer |
| LiveVendor UI | Workspace visual con perfil de vendedor, maleta, transfers, salud |
| David Integration | David consume LiveVendorProfile para contextualizar preguntas de maletas |
| Alert Activation | Activar signals VENDOR_* cuando TM sync este activo |
| Replenishment Actions | Convertir VendorReplacementCandidate en propuestas de accion |

---

## Archivos Creados

| Archivo | Lineas | Descripcion |
|---------|--------|-------------|
| `lib/comercial/vendors/live-vendor-types.ts` | ~280 | Tipos completos: 19 interfaces, 8 type aliases |
| `lib/comercial/vendors/live-vendor-engine.ts` | ~310 | Motor: binding, portfolio, transfers, replacement, coverage, entity adapter |
| `lib/comercial/vendors/live-vendor-loader.ts` | ~270 | Loader server-side: Prisma queries + assembly |
