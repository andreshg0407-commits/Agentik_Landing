# MALETAS-ACTIONS-AND-GUIDES-01 — Sprint Report

## Objetivo

Corregir y activar las dos tablas inferiores del panel principal de Maletas:
- Sugerencias de produccion
- Oportunidades de cobertura

Ambas tablas ahora generan acciones operativas reales.

## Cambios

### FASE 1 — Correccion UI de tablas

**Problema:** Botones "Ver detalle" y "Agregar a maleta" se salian del borde lateral (128px fixed width).

**Solucion:**
- Grid columns reducidos: `PROD_GRID` de 9 columnas a anchos compactos (40/80/minmax)
- Grid columns reducidos: `GAP_GRID` a anchos compactos con minmax
- `overflowX: "auto"` en ambos contenedores de tabla
- Botones compactos: "Detalle" (24px height, padding 0 8px) y "+ Maleta" (24px height)
- Eliminado `width: 128, maxWidth: 128` fijo que causaba overflow
- Eliminado `paddingRight: 24` extra en gap table

### FASE 2-3 — Detalle de sugerencia de produccion

**Drawer:** `ProductionDetailDrawer` abre al click en "Detalle".

Muestra:
- Referencia, descripcion, linea
- KPIs: disponible actual, minimo requerido, faltante, cantidad sugerida, urgencia
- Seccion explicativa: "Por que se sugiere producir esta referencia"
  - Cuantas maletas afectadas
  - Inventario central agotado o insuficiente
  - Gap operativo cuantificado
- Maletas afectadas (vendor names como chips)
- Contexto de reemplazo: "Se produce para reemplazar" — explica deficit no cubrible desde bodega

### FASE 4-5 — Oportunidades de cobertura: agregar a maleta

**Drawer:** `GapActionDrawer` abre al click en "+ Maleta".

Flujo de 4 pasos:
1. **Elegir maleta/vendedor** — Lista de candidates con: vendorName, warehouseCode, cobertura %, refs en riesgo, refs reemplazables
2. **Elegir referencia que sale** — Lista de refs del vendedor elegido que estan agotadas/marcadas para reemplazo, o "Ninguna (agregar sin retirar)"
3. **Confirmar** — Resume: ref entrante, ref saliente, maleta destino, cantidad editable
4. **Done** — Muestra documento creado con numero GS-YYYYMMDD-NNN y boton "Imprimir guia"

### FASE 6 — Reserva operativa

`MaletaReservation` con campos:
- id, guideId, vendorId, vendorName, warehouseCode
- refIn, refInDescription, refInQty
- refOut, refOutDescription, refOutQty
- reason, status, createdAt

Reservas se almacenan in-memory en la sesion. Servicio preparado para persistencia futura.

### FASE 7-8 — Documento de surtido / Print view

`MaletaSurtidoGuide` agrupa reservas en un documento:
- documentNumber (GS-YYYYMMDD-NNN)
- date, vendorId, vendorName, warehouseCode, warehouseName, city
- reservations[], observations, status

**Print view:** `PrintGuideOverlay` — overlay full-screen con:
- Titulo "Guia de Surtido de Maleta"
- Datos del vendedor
- Tabla "Referencias a enviar" (ref, desc, qty)
- Tabla "Referencias a retirar" (ref, desc, qty)
- Motivo del cambio
- Firmas: entrega / recibe
- Boton "Imprimir" abre nueva ventana con CSS de impresion

### FASE 9 — Estados

5 estados minimos:
- pendiente_bodega
- preparado
- enviado
- recibido
- cancelado

`RESERVATION_STATUS_LABEL` para display.

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `maletas-client.tsx` | Grid compacto, overflow fix, ProductionDetailDrawer, GapActionDrawer, PrintGuideOverlay, estado para drawers/guides |
| `maleta-surtido-types.ts` | **NUEVO** — MaletaReservation, MaletaSurtidoGuide, ProductionDetail, MaletaCandidate, MaletaReservationStatus, helpers |
| `validate-maletas-actions-and-guides.ts` | **NUEVO** — 62 checks, 62 PASS |

## TSC baseline

160 (sin cambios).

## Pendientes

- Persistencia de reservas/guias en DB (modelo Prisma)
- Integracion con SAG para generar despacho real
- Estado "preparado" desde bodega (requiere UI de bodega)
- Subgrupo SAG en ProductionSuggestion (el tipo no lo tiene, se infiere de la linea)
- Multiples reservas por guia (actualmente 1:1)
- Busqueda de subgrupo en explicacion de produccion (requiere join con ProductEntity)
