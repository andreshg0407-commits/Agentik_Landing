# COMMERCIAL_DATA_SOURCES_01 — Capa de datos compartida para Comercial

**Sprint:** COMMERCIAL-DATA-SOURCES-RENAME-01
**Fecha:** 2026-07-09

---

## Principio

Los data sources no pertenecen a un modulo funcional.
Pertenecen a la capa Comercial.
Cada modulo es un consumidor, no un dueno.

---

## Mapa de arquitectura

```
COMERCIAL
     |
     +-- Maletas
     +-- Compras
     +-- Importaciones
     +-- Produccion
     +-- Inventario
              |
              v
      Commercial Data Sources
              |
              v
             SAG
```

---

## Que son los Commercial Data Sources

Una capa de abstraccion que provee datos de producto enriquecidos
(precios, fechas de ingreso, historial de compras, proveedores)
a todos los modulos comerciales.

Hoy la implementacion consulta SAG SOAP directamente.
En el futuro (~20 dias) puede leer de la bodega de datos sin
cambiar los consumidores.

---

## Interface principal

```typescript
interface CommercialProductDataSource {
  readonly name: string;
  fetchPrices(productCodes: string[]): Promise<Map<string, SagPricePair>>;
  fetchReceipts(productCodes: string[]): Promise<Map<string, ImportReceipt[]>>;
  fetchEnrichment(productCodes: string[]): Promise<Map<string, ProductEnrichment>>;
}
```

---

## Implementaciones

| Clase | Estado | Descripcion |
|---|---|---|
| `SagDirectCommercialProductDataSource` | Activa | Consulta SAG SOAP directamente (v_articulos + MOVIMIENTOS) |
| `SagWarehouseCommercialProductDataSource` | Stub | Lectura desde bodega de datos (futuro) |

---

## Datos disponibles

| Dato | Campo SAG | Metodo |
|---|---|---|
| PV3 (precio detal) | `v_articulos.n_valor_venta_promocion` | `fetchPrices()` |
| PV4 (precio mayorista) | `v_articulos.nd_valor_venta4` | `fetchPrices()` |
| Fecha de ingreso | `MOVIMIENTOS.d_fecha_documento` (C1/C2) | `fetchReceipts()` |
| Cantidad comprada | `MOVIMIENTOS_ITEMS.n_cantidad` | `fetchReceipts()` |
| Proveedor NIT | `TERCEROS.n_nit` | `fetchReceipts()` |
| Proveedor nombre | `MOVIMIENTOS.sc_beneficiario` | `fetchReceipts()` |
| Batch count | Distinct document numbers | `fetchEnrichment()` |

---

## Consumidores actuales

| Modulo | Archivo | Usa |
|---|---|---|
| Importaciones | `lib/comercial/importaciones/import-service.ts` | `fetchEnrichment()` |

---

## Como agregar un nuevo consumidor

1. Importar `CommercialProductDataSource` desde `@/lib/comercial/data-sources/commercial-product-data-source`
2. Importar `createSagDirectDataSource` desde `@/lib/comercial/data-sources/sag-direct-commercial-product-data-source`
3. Llamar `fetchPrices()`, `fetchReceipts()`, o `fetchEnrichment()` segun necesidad
4. No crear un data source nuevo por modulo — reutilizar este

---

## Archivos

| Archivo | Proposito |
|---|---|
| `lib/comercial/data-sources/commercial-product-data-source.ts` | Interface + tipos |
| `lib/comercial/data-sources/sag-direct-commercial-product-data-source.ts` | Impl SAG directa |
| `lib/comercial/data-sources/sag-warehouse-commercial-product-data-source.ts` | Stub warehouse |
| `lib/connectors/adapters/sag-pya-soap/query-catalog.ts` | Queries en `QUERY_CATALOG.commercialProducts` |

---

## Regla para futuros sprints

> Si un modulo comercial necesita datos de SAG que no estan en Prisma,
> NO crear un adapter dentro del modulo.
> Agregar el metodo a `CommercialProductDataSource` y consumir desde ahi.
