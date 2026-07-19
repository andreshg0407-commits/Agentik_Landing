# PRODUCCION_SAG_READINESS_01.md

**Sprint:** PRODUCCION-SAG-READINESS-01
**Date:** 2026-06-24
**Status:** AUDITORIA COMPLETADA

---

## Fase 1 — Inventario de Fuentes

### Fuentes encontradas

| Fuente | Tipo | Estado | Datos |
|---|---|---|---|
| SAG PYA SOAP | Conector activo | `sag_pya_soap` | customers, receivables, collections, movements, orders |
| Castillitos CRM | Conector activo | `castillitos_crm` | customers, opportunities, activities, quotes |
| ProductEntity | Prisma model | 4,561 productos | SKU, nombre, categoría |
| ProductVariant | Prisma model | 53,331 variantes | SKU compuesto `ref\|talla\|color` |
| ProductInventoryLevel | Prisma model | 156,832 snapshots | quantity, warehouseId |
| CRMQuote | Prisma model | 285 pedidos SAG | cabeceras de pedido |
| CRMQuoteLine | Prisma model | 27,064 lineas | reference, size, color, qty |
| CommercialProductionSignal | Prisma model | **0 registros** | Estructura existe, nunca poblada |

### Fuentes de producción buscadas

| Término | Resultado |
|---|---|
| produccion/production | `query-catalog.ts` tiene entrada PLACEHOLDER para `ORDENES_PRODUCCION` |
| orden_produccion | Placeholder en query-catalog (status: "placeholder") |
| work_order | No encontrado |
| manufacturing | No encontrado |
| taller | No encontrado en datos |
| lote | Campo `MANEJA_LOTE` en artículos SAG (booleano S/N) |
| confeccion | No encontrado |
| ensamble | No encontrado |
| programacion | No encontrado |

---

## Fase 2 — Forense SAG Producción

### Conector SAG PYA SOAP

- **Endpoint:** `http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap`
- **Database:** `INDDIANAA_CASTILLO-ALZATE`
- **Método:** `consultaSagJson` (SELECT SQL arbitrario contra SAG)
- **Módulos sincronizados:** customers, receivables (cobros), collections, movements, orders

### Query Catalog — Production Section

```typescript
// query-catalog.ts line 403
const PRODUCTION: Record<string, QueryEntry> = {
  allOrders: {
    key:     "production.allOrders",
    purpose: "Pull production orders for manufacturing visibility.",
    method:  "consultaSagJson",
    query:   "SELECT * FROM ORDENES_PRODUCCION",
    expectedFields: [
      "NUMERO", "ARTICULO", "CANTIDAD", "FECHA_INICIO", "FECHA_FIN",
      "ESTADO", "BODEGA_ENTRADA",
    ],
    notes:  "PLACEHOLDER — table name and fields completely unknown.",
    status: "placeholder",
  },
};
```

**Estado: PLACEHOLDER.**
- Nombre de tabla no confirmado (`ORDENES_PRODUCCION` es una suposición)
- Campos no confirmados
- Nunca se ha ejecutado contra SAG real
- No se sabe si Castillitos tiene el módulo de producción activado en SAG PYA

### Connector Runs Recientes

| Módulo | Estado | Fecha | Filas |
|---|---|---|---|
| collections | SUCCESS | 2026-05-02 | 27,850 → 20,554 |
| orders | SUCCESS | 2026-04-29 | 9,045 |
| movements | SUCCESS | 2026-04-24 | 125,163 |

**No hay runs de módulo `production`.** Nunca se ha intentado.

### CommercialProductionSignal (Prisma)

Modelo existe con campos:
- reference, description, line, urgency, priority
- totalMissing, suggestedQty, coverageDaysRemaining
- batchInProcess, batchLabel
- pendingOrdersQty, demandPressureScore
- affectedSalesRepIds, affectedSalesRepCount

**Registros: 0.** Nunca poblado. Este modelo es para señales internas de Agentik
(generadas por el motor de cobertura de maletas), NO para datos SAG de producción.

### Campos de Artículos SAG

El catálogo SAG sincronizado (SagArticle → ProductEntity/Variant) incluye:
- `MANEJA_LOTE`: S/N — indica si el artículo maneja lotes
- No hay campos de órdenes de producción en el artículo

### Raw JSON en CRMQuoteLine

Keys relevantes encontradas en `rawCrmJson`:
- `product_id`, `product_qty`, `product_cost_price`, `product_list_price`
- `estado_pedido_c`, `bodega_c`, `bodega_destino_c`
- **No hay campos de producción** (no OP, no taller, no lote de producción)

---

## Fase 3 — Cruce con Comercial

### Matching reference + talla + color

| Cruce | Estado | Evidencia |
|---|---|---|
| CRMQuoteLine ↔ ProductVariant | **99.3% match** | Sprint LINE-INVENTORY-LINK-04 |
| CRMQuoteLine ↔ ProductInventoryLevel | **99.3% con inventario** | Via ProductVariant.id |
| CRMQuoteLine ↔ ProductEntity | **99.5% match** | Via ProductEntity.sku |
| Producción ↔ cualquier cosa | **NO EXISTE** | No hay datos de producción |

### Respuesta

**¿Producción se puede conectar con pedidos e inventario?**

**NO** — No existen datos de producción en ninguna fuente sincronizada.

---

## Fase 4 — Casos de Uso del Informe

### Con datos actuales (sin producción)

| # | Caso de uso | Estado | Fuente |
|---|---|---|---|
| 1 | Agotado y en producción | **NO LISTO** | No hay datos de producción |
| 2 | Agotado sin producción | **NO LISTO** | Sin datos de producción, no se puede afirmar "sin producción" |
| 3 | Stock crítico y en producción | **NO LISTO** | No hay datos de producción |
| 4 | Stock crítico sin producción | **NO LISTO** | Sin datos de producción, no se puede afirmar "sin producción" |
| 5 | Producción insuficiente vs pedidos | **NO LISTO** | No hay datos de producción |
| 6 | Ref con pedidos pero sin stock ni producción | **PARCIAL** | Pedidos + inventario cruzados; producción desconocida |
| 7 | Ref listas para reposición | **PARCIAL** | Se puede detectar stock bajo, pero sin visibilidad de reposición |

### Casos que SÍ se pueden calcular hoy (sin producción)

| # | Caso calculable | Estado | Fuente |
|---|---|---|---|
| A | Ref agotadas (stock = 0) | **LISTO** | ProductInventoryLevel |
| B | Ref con stock crítico (stock <= 10) | **LISTO** | ProductInventoryLevel |
| C | Ref pedidas hoy | **LISTO** | CRMQuoteLine |
| D | Pedidos del día | **LISTO** | CRMQuote |
| E | Fulfillment por pedido (despachable %) | **LISTO** | LINE-INVENTORY-LINK-04 |
| F | Movimientos de maletas | **LISTO** | VendorBagItem, VendorCommercialBag |
| G | Ref con pedidos pero stock insuficiente | **LISTO** | CRMQuoteLine + ProductInventoryLevel |

---

## Fase 5 — Calidad de Datos

| Dimensión | Evaluación |
|---|---|
| Pedidos SAG | Alta — 285 pedidos, 27,064 lineas, datos completos |
| Catálogo comercial | Alta — 4,561 productos, 53,331 variantes |
| Inventario | Alta — 156,832 snapshots, 99.3% cruzable con pedidos |
| Producción | **Inexistente** — 0 datos, 0 tablas confirmadas |
| Freshness | Media — último sync de collections: 2026-05-02 (53 días) |

### Riesgos

1. **BLOQUEANTE:** No hay datos de producción. La tabla `ORDENES_PRODUCCION` en SAG es un placeholder sin confirmar.
2. **RIESGO:** No se sabe si Castillitos tiene el módulo de producción activado en SAG PYA.
3. **RIESGO:** Último sync de inventario/cobros tiene >50 días. Los datos pueden estar desactualizados.
4. **RIESGO:** 10 referencias en pedidos (0.5%) no tienen match en el catálogo.

---

## Fase 6 — Decisión

| Pregunta | Respuesta |
|---|---|
| DATOS DE PRODUCCIÓN DISPONIBLES | **NO** |
| ÓRDENES DE PRODUCCIÓN | **NO** |
| LÍNEAS DE PRODUCCIÓN | **NO** |
| REFERENCIA | **SI** (en catálogo y pedidos, no en producción) |
| TALLA | **SI** (en catálogo y pedidos, no en producción) |
| COLOR | **SI** (en catálogo y pedidos, no en producción) |
| CANTIDAD PROGRAMADA | **NO** |
| CANTIDAD PENDIENTE | **NO** |
| ESTADO | **NO** |
| FECHA | **NO** |
| TALLER | **NO** |
| CRUZABLE CON INVENTARIO | **NO** (producción no existe) |
| CRUZABLE CON PEDIDOS | **NO** (producción no existe) |
| LISTO PARA INFORME DIARIO | **PARCIAL** |

### RECOMENDACIÓN

**El informe diario de producción NO es viable con los datos actuales.** No hay órdenes de producción sincronizadas ni tabla confirmada.

**PERO:** Los 16 códigos documentales de producción (OP, CN, PT, PC, EC, etc.) en `source-semantic-rules.ts` confirman que **Castillitos SÍ tiene módulo de producción en SAG PYA**. La taxonomía existe. Lo que falta es descubrir la tabla/vista y sincronizar.

**SÍ es viable un informe diario COMERCIAL-INVENTARIO** con los datos existentes:
- Pedidos del día
- Fulfillment por pedido (% despachable)
- Referencias agotadas
- Referencias con stock crítico
- Referencias pedidas sin stock suficiente
- Movimientos de maletas

**Para habilitar producción se necesita:**

1. **Descubrir la tabla real** — ejecutar `SELECT * FROM ORDENES_PRODUCCION LIMIT 1` via el endpoint SOAP (o probar nombres alternativos: OP, PRODUCCION, vw_produccion)
2. **Mapear campos** — confirmar nombres de columnas reales vs los 7 esperados (NUMERO, ARTICULO, CANTIDAD, FECHA_INICIO, FECHA_FIN, ESTADO, BODEGA_ENTRADA)
3. **Agregar "production" al SyncModule enum** en `lib/connectors/core/types.ts`
4. **Implementar `pullProduction()`** en el conector sag_pya_soap
5. **Crear modelo Prisma** — `ProductionOrder` + `ProductionOrderLine`
6. **Conectar** — cruzar con ProductVariant via referencia + talla + color (99.3% match ya validado)

**Estimación:** 1 sprint si la tabla existe. El motor de alertas, tipos, y agent tools ya están construidos.

---

## Hallazgos Adicionales (Infraestructura Existente)

### SAG Domain Contract (sag-domain-contracts.ts)

El dominio `produccion` está **declarado** en el data contract:
- Domain ID: `produccion`
- Suggested View: `vw_agentik_produccion` (NO existe en SAG)
- Primary Tables: `ORDENES_PRODUCCION`, `CONSUMO_MP`, `PRODUCCION_TERMINADA`
- Fields definidos (4, todos UNCONFIRMED): `ID_OP`, `PRODUCTO_TERM`, `CANTIDAD_PROD`, `COSTO_OP`
- Status: **DRAFT** — nunca activado

### 16 Tipos de Documento de Producción (source-semantic-rules.ts)

SAG tiene **16 códigos documentales de producción** ya mapeados:

| Código | Sigla | Nombre |
|---|---|---|
| 33 | OP | Orden de Producción |
| 80 | CN | Consumos Insumos y Telas |
| 81 | PT | Entrada Producto Terminado |
| 99 | PC | Salida Confeccionistas |
| 100 | EC | Entrada Confeccionistas |
| 114 | 4 | Producto en Proceso |
| 115 | MV | Traslado de Movimientos PDN |
| 116 | ET | Entrada Producto Terminado |
| 117 | CM | Consumo de Muestras |
| 118 | T2 | Gastos de Terceros |
| 119 | Y1 | Causación de Servicios T |
| 126 | AD | Adiciones y Faltantes |
| 127 | CV | Consumos de Muestras y Varios |
| 129 | T1 | Gastos Terceros |
| 133 | M2 | Entrada de Muestras |
| 140 | SR | Saldo Inicial Retazos |

**Estos son códigos reales de SAG**, no placeholders. Esto confirma que **Castillitos SÍ tiene módulo de producción en SAG PYA** — la taxonomía de documentos existe. Lo que falta es la tabla/vista de órdenes.

### Motor de Alertas de Producción (maletas-production.ts)

Existe un motor completo de alertas de producción en Comercial/Maletas:
- `buildProductionSignals()` — genera señales de producción
- `computeProductionPressure()` — score 0-100 de presión
- Urgencia: critica / urgente / alta / importante / normal
- Integrado con PD (Pedidos SAG): `pendingOrdersQty`, `demandPressureScore`
- **0 registros** en CommercialProductionSignal — nunca ejecutado

### Agent Tool: create-production-request-draft.ts

David puede crear borradores de solicitud de producción:
- NO escribe en SAG
- NO crea órdenes reales
- Solo draft en memoria → `nextStep: "review_by_operations"`

### SyncModule: "production" NO está en el enum

`lib/connectors/core/types.ts` — SyncModule enum NO incluye "production".
El conector SAG PYA SOAP NO tiene método `pullProduction()`.

---

## Archivos Consultados

| Archivo | Hallazgo |
|---|---|
| `lib/connectors/adapters/sag-pya-soap/query-catalog.ts` | PRODUCTION section — placeholder, nunca ejecutado |
| `prisma/schema.prisma` | CommercialProductionSignal — modelo vacío, sin datos |
| `lib/comercial/maletas/order-ingest-service.ts` | Referencia a CommercialProductionSignal — señal interna, no SAG |
| `docs/architecture/agentik-operational-source-map.md` | Documenta producción como fuente futura |
| `lib/connectors/adapters/sag-pya-soap/catalog/sag-articles-types.ts` | MANEJA_LOTE en artículos — booleano, no OP |
| `lib/comercial/pedidos/inventory-link-service.ts` | Matching 99.3% ref+talla+color — base para cruce futuro |
