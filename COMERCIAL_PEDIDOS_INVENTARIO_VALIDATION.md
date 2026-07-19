# COMERCIAL_PEDIDOS_INVENTARIO_VALIDATION.md

**Sprint:** COMERCIAL-PEDIDOS-INVENTARIO-01
**Date:** 2026-06-23
**Author:** Agentik Engineering
**Status:** COMPLETADO

---

## 1. Objetivo

Convertir Pedidos en una herramienta comercial que vende exclusivamente sobre disponibilidad real. El vendedor ve inventario actualizado, recibe alertas de stock, y nunca trabaja a ciegas.

---

## 2. Fases implementadas

| Fase | Descripcion | Estado |
|---|---|---|
| 1 | order-inventory-service.ts — lectura de inventario para Pedidos | COMPLETO |
| 2 | Extender order-product-search.ts con datos de inventario real | COMPLETO |
| 3 | Product cards con inventario (referencia, nombre, precio, disponibilidad) | COMPLETO |
| 4 | Selector de variantes con talla x color + disponibilidad por variante | COMPLETO |
| 5 | Sistema visual de disponibilidad (verde >= 20, amarillo 5-19, rojo 1-4, rojo fuerte 0) | COMPLETO |
| 6 | Inventario en lineas de pedido con warnings (excede stock) | COMPLETO |
| 7 | Barra resumen de inventario (refs, variantes, uds, excesos, sin stock) | COMPLETO |
| 8 | Toggle "Solo disponibles" (default ON) | COMPLETO |
| 9 | David inventory signals (deterministas, sin AI) | COMPLETO |
| 10 | Performance targets (<500ms search, <300ms variants) | VERIFICADO |
| 11 | Este documento | COMPLETO |

---

## 3. Archivos creados/modificados

### Archivos nuevos

| Archivo | Proposito |
|---|---|
| `lib/comercial/pedidos/order-inventory-service.ts` | Servicio de inventario para Pedidos (4 funciones) |

### Archivos modificados

| Archivo | Cambios |
|---|---|
| `lib/comercial/pedidos/order-product-types.ts` | Agregados: OrderInventoryStatus, availableQty, variantCount, inStock, inventoryStatus |
| `lib/comercial/pedidos/order-product-search.ts` | Reescrito: consume ProductVariant + ProductInventoryLevel en vez de CommercialCoverageSnapshot |
| `app/(app)/[orgSlug]/comercial/pedidos/pedidos-client.tsx` | Fases 3-9: cards con inventario, selector visual, warnings, resumen, toggle, David signals |

---

## 4. Funciones del servicio de inventario

| Funcion | Parametros | Uso |
|---|---|---|
| `getVariantInventory()` | orgId, variantId | Stock de una variante especifica |
| `getReferenceInventory()` | orgId, productCode | Stock completo de una referencia (todas las variantes) |
| `getAvailableVariants()` | orgId, productCode | Variantes con su disponibilidad (incluye agotadas para UI) |
| `getInventorySummary()` | lines[] | Resumen de inventario para un pedido completo |
| `computeStatus()` | available | Calcula InventoryStatus (high/medium/low/out) |

---

## 5. Fuentes de datos

### Consumidas (exclusivamente local)

| Fuente | Tabla Prisma | Proposito |
|---|---|---|
| Catalogo | ProductEntity | Busqueda por nombre, SKU, categoria |
| Variantes | ProductVariant | Combinaciones talla x color con atributos |
| Inventario | ProductInventoryLevel | Snapshot de stock por variante x bodega |

### NO consumidas (prohibidas en este sprint)

- SAG SOAP (sin consultas en tiempo real)
- CommercialCoverageSnapshot (reemplazado por ProductInventoryLevel)
- Ninguna API externa

---

## 6. Sistema visual de disponibilidad

| Status | Umbral | Color | Label |
|---|---|---|---|
| `high` | >= 20 uds | Verde (C.green) | "Disponible" |
| `medium` | 5-19 uds | Amarillo (C.amber) | "Stock medio" |
| `low` | 1-4 uds | Rojo (C.red) | "Ultimas uds" |
| `out` | 0 uds | Rojo fuerte (C.red) | "Sin stock" |
| `unsynced` | null | Gris (C.inkFaint) | "Pendiente sync" |

Aplicado en: product cards, size chips, color chips, order lines, availability badge.

---

## 7. David signals (deterministas)

### Selector-level (al elegir variante)

| Condicion | Señal |
|---|---|
| availableUnits === null | "Disponibilidad pendiente de sincronizacion." |
| availableUnits <= 0 | "Sin stock disponible. El pedido quedara pendiente de reposicion." |
| qty > availableUnits | "Cantidad solicitada (X) supera disponibilidad (Y uds). Se enviaran Y y el resto quedara pendiente." |
| status === "low" | "Ultimas unidades disponibles (X uds). Confirma con bodega." |
| status === "medium" | "Stock medio (X uds). Disponible para este pedido." |

### Order-level (en resumen)

| Condicion | Señal |
|---|---|
| Lineas con stock = 0 | "N lineas sin stock. Se generara backorder automatico." |
| Lineas donde qty > available | "N lineas exceden el inventario disponible." |
| Lineas sin sync | "N lineas sin datos de inventario sincronizados." |

---

## 8. Performance

| Metrica | Target | Mecanismo |
|---|---|---|
| Busqueda de productos | < 500ms | ProductEntity query con ILIKE, sin SOAP |
| Carga de variantes | < 300ms | Single query ProductVariant + bulk ProductInventoryLevel |
| Sin N+1 | Garantizado | Batch queries: all variants in one query, all levels in one query |

El search reescrito ejecuta maximo 3 queries Prisma (ProductEntity + ProductVariant + ProductInventoryLevel) en vez de queries individuales por variante.

---

## 9. TSC Baseline

**160 errores — preservado.** Cero errores nuevos introducidos.

---

## 10. Reglas cumplidas

| Regla | Estado |
|---|---|
| NO modificar SAG sync/normalizers/scripts | CUMPLIDO |
| NO crear nuevos modelos de inventario | CUMPLIDO |
| NO consultar SOAP en tiempo real | CUMPLIDO |
| NO datos ficticios | CUMPLIDO |
| NO ocultar variantes sin stock (visible pero gris) | CUMPLIDO |
| Preservar TSC 160 | CUMPLIDO |
