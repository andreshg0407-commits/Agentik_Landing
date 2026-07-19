# COMMERCIAL_KNOWLEDGE_GAP_DISCOVERY_01

**Sprint:** SAG-COMMERCIAL-KNOWLEDGE-GAP-DISCOVERY-01
**Date:** 2026-07-11
**Tenant:** Castillitos
**Status:** COMPLETE — Architecture & Knowledge Modeling

---

## 1. Commercial Knowledge Map

### Dominios del Conocimiento Comercial

```
┌─────────────────────────────────────────────────────────────────────┐
│                    AGENTIK COMMERCIAL KNOWLEDGE                      │
├──────────────┬──────────────┬──────────────┬───────────────────────│
│  PRODUCTOS   │   CLIENTES   │    VENTAS    │    INVENTARIO          │
│  · Catálogo  │   · 360°     │  · Factura   │    · Snapshot          │
│  · Variantes │   · Cartera  │  · Remisión  │    · Bodegas           │
│  · Precios   │   · NIT/ID   │  · Pedidos   │    · Reservas          │
│  · Atributos │   · Ciudad   │  · Conversión│    · Tránsito          │
├──────────────┼──────────────┼──────────────┼───────────────────────│
│   COMPRAS    │IMPORTACIONES │ PRODUCCIÓN   │     TIENDAS            │
│  · Demanda   │  · Lotes     │  · OP        │    · Cobertura         │
│  · Recompra  │  · Costos    │  · CN        │    · Reglas            │
│  · Proveedor │  · Tránsito  │  · ET        │    · Transferencias    │
│  · Histórico │  · Edad      │  · Etapas    │    · Capacidad         │
├──────────────┼──────────────┼──────────────┼───────────────────────│
│  VENDEDORES  │   PEDIDOS    │   PRECIOS    │    MALETAS             │
│  · Cartera   │  · PD/CRM    │  · PV3/PV4   │    · Composición       │
│  · Conversión│  · Líneas    │  · Descuentos│    · Rotación          │
│  · Cuotas    │  · Estado    │  · Histórico │    · Decisiones        │
│  · Zonas     │  · Despacho  │  · Márgenes  │    · Presión           │
└──────────────┴──────────────┴──────────────┴───────────────────────┘
```

---

## 2. Estado del Conocimiento por Dominio

### PRODUCTOS

| Conocimiento | Estado | Fuente | Motor consumidor |
|---|---|---|---|
| Código referencia (SKU) | EXISTE | SAG v_articulos, ProductEntity, SaleRecord | Todos |
| Descripción producto | EXISTE | SAG v_articulos, ProductEntity | UI, Maletas, Pedidos |
| Línea comercial (Castillitos/Latin Kids/Acc-Imp) | EXISTE | SaleRecord.productLine, inferido | Tiendas, Maletas, Coverage |
| Subgrupo (pijama ll, bolso, etc.) | PARCIAL | Inferido de descripción | Coverage Engine, Tiendas |
| Clase producto (textile/accessory) | EXISTE | StorePolicyRule, Coverage Input | Coverage Engine |
| Talla | EXISTE | ss_talla en SAG, ProductVariant | Inventario, Pedidos, Maletas |
| Color | EXISTE | ss_color en SAG, ProductVariant | Inventario, Pedidos, Maletas |
| Categoría (niña/niño/bebé) | PARCIAL | Inferido heurísticamente | Maletas, Inteligencia |
| Precio venta (PV3/PV4) | PARCIAL | CRMQuoteLine, NO en ProductEntity | **GAP** — Precios, Márgenes |
| Costo unitario | PARCIAL | ProductionOrderLine.unitCost, CN.lineMetadata.cost | Márgenes, Recompra |
| Fecha creación referencia | NO EXISTE | — | Edad producto, Ciclo de vida |
| Estado comercial (activo/descontinuado) | PARCIAL | ProductEntity.commercialStatus | Catálogo, Recompra |

### CLIENTES

| Conocimiento | Estado | Fuente | Motor consumidor |
|---|---|---|---|
| Identidad (NIT, nombre, slug) | EXISTE | CustomerProfile | CRM, Cartera, Ventas |
| Ciudad | PARCIAL (90%) | CRM rawCrmJson→billing_address_city | Inteligencia geográfica |
| Segmento (A/B/C) | ESTRUCTURA EXISTE, DATOS NO | CustomerProfile.segment | Estrategia comercial |
| Vendedor asignado | PARCIAL (60% confidence) | CRM quote history | Comisiones, Rutas |
| Histórico compras | EXISTE | CustomerOrderRecord, SaleRecord | 360°, Recompra |
| Cartera vencida | EXISTE | CustomerReceivable | Cobros, Riesgo |
| Canal (mayoreo/punto venta/marketplace) | PARCIAL | SaleRecord.channel | Inteligencia canal |
| Frecuencia de compra | NO EXISTE | — | **GAP** — Recompra, Churn |
| Valor vida cliente (CLV) | NO EXISTE | — | **GAP** — Segmentación |
| Última fecha compra | DERIVABLE | Max(SaleRecord.saleDate) | Churn, Reactivación |

### VENTAS

| Conocimiento | Estado | Fuente | Motor consumidor |
|---|---|---|---|
| Factura (Fuente 1) | EXISTE | SaleRecord (OFICIAL) | Revenue, KPIs, Forecast |
| Remisión (Fuente 2) | EXISTE | SaleRecord (REMISION) | Pipeline operativo |
| Pedido SAG (PD) | EXISTE | CustomerOrderRecord | Demanda, Conversión |
| Conversión PD→FV | EXISTE | OrderInvoiceConversion engine | KPI conversión |
| Venta por vendedor | EXISTE | SaleRecord.sellerSlug | Performance |
| Venta por tienda | EXISTE | SaleRecord.storeSlug | Performance tiendas |
| Venta por línea | EXISTE | SaleRecord.productLine | Mix comercial |
| Venta por producto (referencia) | PARCIAL | SaleRecord.productCode | Rotación |
| Unidades vendidas por variante | NO EXISTE | — | **GAP** — Rotación real |
| Devoluciones | NO EXISTE | — | **GAP** — Rotación neta |
| Descuentos aplicados | NO EXISTE | — | **GAP** — Margen real |

### INVENTARIO

| Conocimiento | Estado | Fuente | Motor consumidor |
|---|---|---|---|
| Disponible por bodega | EXISTE | ProductInventoryLevel, SagInventoryItem | Cobertura, Maletas |
| Reservado | EXISTE | ProductInventoryLevel.reservedQty | Disponible neto |
| Pedidos pendientes (PD) | EXISTE | SagInventoryItem.pendingPDQty | Presión producción |
| Inventario por variante (talla+color) | EXISTE | ProductVariant→InventoryLevel | Tiendas, Pedidos |
| Fecha último movimiento | NO EXISTE | — | **GAP** — Antigüedad |
| Fecha ingreso al inventario | NO EXISTE | — | **GAP** — Edad inventario |
| Inventario en tránsito | NO EXISTE | — | **GAP** — Disponibilidad real |
| Inventario en tiendas (por tienda) | PARCIAL | Solo si hay bodega por tienda en SAG | **GAP** — Cobertura real |

### COMPRAS / IMPORTACIONES

| Conocimiento | Estado | Fuente | Motor consumidor |
|---|---|---|---|
| Órdenes de producción (OP) | EXISTE | ProductionOrder (3,376 orders) | Timeline, Costos |
| Consumos materia prima (CN) | EXISTE | ProductionEvent CN (7,890) | Costos, Eficiencia |
| Entradas producto terminado (ET) | EXISTE | ProductionEvent ET (3,640) | Inventario, Ciclo |
| Timeline producción | EXISTE | ProductionTimeline (3,387) | Ciclo, Alertas |
| Ciclo productivo (44 días avg) | EXISTE | ProductionTimeline metrics | Planeación |
| Costo materia prima | EXISTE | CN lineMetadata.cost | Márgenes |
| Fecha ingreso importación | NO EXISTE | — | **GAP** — Edad lote |
| Proveedor por referencia | NO EXISTE | — | **GAP** — Dependencia |
| Histórico de compras (recompra) | NO EXISTE | — | **GAP** — Frecuencia, precio |
| Lotes de importación | NO EXISTE | — | **GAP** — Trazabilidad |

### TIENDAS

| Conocimiento | Estado | Fuente | Motor consumidor |
|---|---|---|---|
| Reglas de cobertura | EXISTE | StorePolicyRule | Coverage Engine |
| Evaluación de cobertura | EXISTE | Coverage Engine (evaluateCoverage) | Tiendas, Alertas |
| Sugerencias de surtido | EXISTE | CommercialCoverageSuggestion | Transferencias |
| Propuestas de transferencia | EXISTE | StoreReplenishmentProposal | SAG Write Queue |
| Capacidad tienda | ESTRUCTURA EXISTE | StoreCapacityProfile | Planeación |
| Ventas por tienda | EXISTE | SaleRecord.storeSlug | Performance |
| Bodega asignada por tienda | PARCIAL | store-warehouse-config-service | Inventario tienda |
| Histórico cobertura (temporal) | NO EXISTE | — | **GAP** — Tendencia |
| Demanda por tienda (PD) | NO EXISTE | — | **GAP** — Planeación |

### VENDEDORES

| Conocimiento | Estado | Fuente | Motor consumidor |
|---|---|---|---|
| Ventas por vendedor | EXISTE | SaleRecord.sellerSlug | Performance |
| Clientes por vendedor | PARCIAL | CRM quote linkage | Cartera asignada |
| Conversión F2→F1 por vendedor | EXISTE | SourceKpiRow.conversionRate | KPI |
| Cuotas/metas | NO EXISTE | — | **GAP** — Cumplimiento |
| Comisiones | NO EXISTE | — | **GAP** — Liquidación |
| Zonas geográficas | PARCIAL | SaleRecord.zone | Cobertura territorial |

### PRECIOS

| Conocimiento | Estado | Fuente | Motor consumidor |
|---|---|---|---|
| Precio CRM (cotización) | EXISTE | CRMQuoteLine.unitPrice, listPrice | Cotización |
| Descuento CRM | EXISTE | CRMQuoteLine.discount | Margen cotizado |
| Precio SAG (lista) | NO EXISTE | — | **GAP** — Precio real |
| Precio mayorista real | NO EXISTE | — | **GAP** — Margen real |
| Histórico de precios | NO EXISTE | — | **GAP** — Tendencia |
| Costo unitario real | PARCIAL | ProductionOrderLine, CN | Margen |

---

## 3. Capacidades Empresariales

### CAP-01: Edad del Inventario

**Pregunta:** ¿Cuánto tiempo lleva un producto desde su ingreso al inventario?

| Dato requerido | Estado | Fuente SAG |
|---|---|---|
| Fecha ingreso (primer movimiento de entrada) | NO EXISTE | MOVIMIENTOS (fuente ET=116, tipo entrada) |
| Fecha actual | EXISTE | System |
| Cantidad actual | EXISTE | ProductInventoryLevel |

**Consumidores:** Importaciones, Recompras, Alertas, Markdown, IA Comercial
**Prioridad:** ALTA
**Clasificación gap:** DERIVABLE — calculable desde MOVIMIENTOS tipo entrada
**Impacto:** Muy alto — sin esto no se puede identificar producto muerto

---

### CAP-02: Rotación por Referencia

**Pregunta:** ¿Qué porcentaje del lote ya fue vendido en un período dado?

| Dato requerido | Estado | Fuente SAG |
|---|---|---|
| Cantidad ingresada (lote) | NO EXISTE | MOVIMIENTOS entradas |
| Cantidad vendida (período) | PARCIAL | SaleRecord (montos, no unidades) |
| Unidades vendidas | NO EXISTE | MOVIMIENTOS salidas (FV/NV) |
| Cantidad disponible actual | EXISTE | ProductInventoryLevel |

**Consumidores:** Recompra, Inteligencia Comercial, Compras, Maletas, Markdown
**Prioridad:** ALTA
**Clasificación gap:** REQUIERE COMPOSICIÓN — necesita entradas + salidas por referencia
**Impacto:** Muy alto — sin esto no se puede decidir qué recomprar

---

### CAP-03: Cobertura de Tiendas

**Pregunta:** ¿La tienda cumple su nivel ideal de inventario?

| Dato requerido | Estado | Fuente SAG |
|---|---|---|
| Inventario actual por tienda | PARCIAL | SAG por bodega (si bodega=tienda) |
| Regla de cobertura | EXISTE | StorePolicyRule |
| Disponible en origen | EXISTE | SagInventoryItem |

**Consumidores:** Coverage Engine, Tiendas, Transferencias
**Prioridad:** MEDIA (ya funciona con datos parciales)
**Clasificación gap:** DISPONIBLE DIRECTAMENTE — SAG tiene inventario por bodega
**Impacto:** Alto — el motor existe, solo necesita datos confirmados

---

### CAP-04: Antigüedad Comercial (Sin Movimiento)

**Pregunta:** ¿Cuánto tiempo lleva una referencia sin ningún movimiento (ni venta ni entrada)?

| Dato requerido | Estado | Fuente SAG |
|---|---|---|
| Último movimiento de venta | PARCIAL | SaleRecord.saleDate (pero sin variante) |
| Último movimiento de entrada | NO EXISTE | MOVIMIENTOS |
| Fecha actual | EXISTE | System |

**Consumidores:** Descuentos, Transferencias, Markdown Engine, IA
**Prioridad:** ALTA
**Clasificación gap:** DERIVABLE — Max fecha MOVIMIENTOS por referencia
**Impacto:** Alto — producto sin rotación es candidato a promoción o liquidación

---

### CAP-05: Decisión de Recompra

**Pregunta:** ¿Qué referencias deberían recomprarse este mes?

| Dato requerido | Estado | Fuente SAG |
|---|---|---|
| Rotación (últimos 3/6/12 meses) | NO EXISTE | Requiere CAP-02 |
| Stock actual | EXISTE | ProductInventoryLevel |
| Demanda pendiente (PD) | EXISTE | CustomerOrderRecord |
| Lead time producción | EXISTE (44d avg) | ProductionTimeline |
| Última compra/producción | PARCIAL | ProductionOrder.documentDate |
| Histórico de precios de compra | NO EXISTE | — |

**Consumidores:** Compras, Producción, Planeación, IA Comercial
**Prioridad:** MUY ALTA
**Clasificación gap:** REQUIERE COMPOSICIÓN — rotación + stock + demanda + lead time
**Impacto:** Máximo — decisión operativa diaria del negocio

---

### CAP-06: Margen por Producto

**Pregunta:** ¿Cuál es el margen real de cada referencia?

| Dato requerido | Estado | Fuente SAG |
|---|---|---|
| Precio de venta real | PARCIAL | CRMQuoteLine, NO en factura detallada |
| Costo unitario producción | PARCIAL | ProductionOrderLine.unitCost |
| Costo materia prima | EXISTE | CN.lineMetadata |
| Descuentos aplicados | NO EXISTE | — |

**Consumidores:** Pricing Engine, Inteligencia, IA, Planeación
**Prioridad:** ALTA
**Clasificación gap:** REQUIERE COMPOSICIÓN — precio venta + costo total
**Impacto:** Alto — sin margen real no se puede optimizar precio

---

### CAP-07: Performance por Vendedor

**Pregunta:** ¿Qué vendedor vende mejor cada categoría/línea?

| Dato requerido | Estado | Fuente SAG |
|---|---|---|
| Venta por vendedor | EXISTE | SaleRecord.sellerSlug |
| Venta por línea/vendedor | EXISTE | SaleRecord (productLine + sellerSlug) |
| Conversión PD→FV por vendedor | EXISTE | Conversion engine |
| Cuota mensual por vendedor | NO EXISTE | — |
| Clientes atendidos por vendedor | PARCIAL | CRM quote linkage |

**Consumidores:** Vendor Engine, Comisiones, Copilot, Performance
**Prioridad:** MEDIA
**Clasificación gap:** PARCIAL — ventas existen, cuotas/metas no
**Impacto:** Medio — el análisis básico funciona, metas mejorarían contexto

---

### CAP-08: Inteligencia Geográfica

**Pregunta:** ¿Qué ciudades consumen más determinada línea?

| Dato requerido | Estado | Fuente SAG |
|---|---|---|
| Ciudad del cliente | PARCIAL (90%) | CRM billing_address_city |
| Venta por cliente | EXISTE | SaleRecord + CustomerProfile join |
| Línea de producto por venta | EXISTE | SaleRecord.productLine |

**Consumidores:** CRM, Cobertura Comercial, Inteligencia, IA, Rutas
**Prioridad:** MEDIA
**Clasificación gap:** DISPONIBLE DIRECTAMENTE — datos existen, falta cruce
**Impacto:** Medio — permite focalizar esfuerzo comercial

---

### CAP-09: Presión Productiva

**Pregunta:** ¿Qué referencias tienen demanda insatisfecha que requiere producción?

| Dato requerido | Estado | Fuente SAG |
|---|---|---|
| Pedidos pendientes por referencia | EXISTE | CustomerOrderRecord (PD) |
| Disponible actual | EXISTE | ProductInventoryLevel |
| Producción en proceso | EXISTE | ProductionOrder (OP abiertos) |
| Cobertura objetivo | EXISTE | StorePolicyRule |

**Consumidores:** Producción, Coverage Engine, Maletas, Compras
**Prioridad:** ALTA
**Clasificación gap:** YA IMPLEMENTADO — DemandPressureSignal + ProductionPressureSignal
**Impacto:** Funcional hoy

---

### CAP-10: Sobreinventario por Tienda

**Pregunta:** ¿Qué tiendas están sobreinventariadas?

| Dato requerido | Estado | Fuente SAG |
|---|---|---|
| Inventario actual por tienda | PARCIAL | Requiere mapeo bodega→tienda confirmado |
| Max cobertura configurado | EXISTE | StorePolicyRule.maxQty |
| Evaluación de cobertura | EXISTE | Coverage Engine (state: ABOVE_MAX) |

**Consumidores:** Tiendas, Transferencias, Alertas, Markdown
**Prioridad:** MEDIA
**Clasificación gap:** DISPONIBLE DIRECTAMENTE — motor existe, datos parciales
**Impacto:** Alto — permite redistribuir stock y evitar obsolescencia

---

### CAP-11: Frecuencia de Compra por Cliente

**Pregunta:** ¿Con qué frecuencia compra cada cliente?

| Dato requerido | Estado | Fuente SAG |
|---|---|---|
| Fechas de todas las facturas por cliente | EXISTE | SaleRecord (customerNit join) |
| Intervalo entre compras | DERIVABLE | Diff entre fechas consecutivas |

**Consumidores:** CRM, Reactivación, Segmentación, IA
**Prioridad:** MEDIA
**Clasificación gap:** DERIVABLE — cálculo sobre SaleRecord existente
**Impacto:** Medio — permite detectar clientes en riesgo de churn

---

### CAP-12: Valor Vida Cliente (CLV)

**Pregunta:** ¿Cuánto ha comprado un cliente en su vida? ¿Cuál es su tendencia?

| Dato requerido | Estado | Fuente SAG |
|---|---|---|
| Total ventas históricas por cliente | EXISTE | Sum(SaleRecord.amount) por NIT |
| Período de relación | DERIVABLE | Min/Max(SaleRecord.saleDate) |
| Frecuencia | DERIVABLE (CAP-11) | — |

**Consumidores:** Segmentación, CRM, Copilot, Estrategia
**Prioridad:** BAJA (derivable sin nuevos datos)
**Clasificación gap:** DERIVABLE — cálculo puro
**Impacto:** Medio

---

### CAP-13: Lotes e Importaciones

**Pregunta:** ¿Qué productos vinieron en cada importación? ¿Cuánto costó cada lote?

| Dato requerido | Estado | Fuente SAG |
|---|---|---|
| Documentos de entrada por importación | PARCIAL | ProductionEvent ET |
| Agrupación por lote/importación | NO EXISTE | — |
| Costo FOB + nacionalización | NO EXISTE | — |
| Fecha arribo | NO EXISTE | — |
| Proveedor origen | NO EXISTE | — |

**Consumidores:** Importaciones, Costos, Márgenes, Planeación
**Prioridad:** ALTA
**Clasificación gap:** NO DISPONIBLE — SAG no modela importaciones como entidad
**Impacto:** Alto — fundamental para control de costos y trazabilidad

---

### CAP-14: Devoluciones y Notas Crédito

**Pregunta:** ¿Cuántas unidades se devolvieron? ¿Cuál es la tasa de devolución?

| Dato requerido | Estado | Fuente SAG |
|---|---|---|
| Notas crédito (NC) por referencia | PARCIAL | SaleRecord puede tener comprobanteCode NC |
| Unidades devueltas | NO EXISTE | MOVIMIENTOS_ITEMS para NC |
| Motivo devolución | NO EXISTE | — |

**Consumidores:** Calidad, Rotación neta, Margen real, IA
**Prioridad:** MEDIA
**Clasificación gap:** REQUIERE COMPOSICIÓN — SAG tiene NC, falta sync detallado
**Impacto:** Medio — necesario para rotación neta y calidad

---

### CAP-15: Histórico de Precios

**Pregunta:** ¿Cómo han variado los precios de cada referencia en el tiempo?

| Dato requerido | Estado | Fuente SAG |
|---|---|---|
| Precio de venta en cada factura | NO EXISTE | MOVIMIENTOS_ITEMS.n_valor para FV |
| Lista de precios SAG | NO EXISTE | v_articulos puede tener PV3/PV4 |
| Fecha de cambio de precio | NO EXISTE | — |

**Consumidores:** Pricing Engine, Markdown, Inteligencia, Copilot
**Prioridad:** ALTA
**Clasificación gap:** DISPONIBLE DIRECTAMENTE — SAG tiene precio en línea de factura
**Impacto:** Alto — sin esto el margen es opaco

---

## 4. Matriz de Conocimiento

| # | Capacidad | Datos requeridos | Ya existe | Falta | Fuente SAG | Motor consumidor | Prioridad | Impacto |
|---|---|---|---|---|---|---|---|---|
| 1 | Edad inventario | Fecha ingreso | Parcial (ET) | Fecha exacta por ref | MOVIMIENTOS tipo entrada | Importaciones, Recompra, Alertas | ALTA | MUY ALTO |
| 2 | Rotación | Unidades vendidas/ingresadas | No | Unidades por variante | MOVIMIENTOS_ITEMS FV/NV | Recompra, Inteligencia, Compras | ALTA | MUY ALTO |
| 3 | Cobertura tiendas | Inventario tienda | Parcial | Mapeo bodega→tienda | Inventario por bodega | Coverage Engine, Tiendas | MEDIA | ALTO |
| 4 | Antigüedad comercial | Último movimiento | Parcial | Fecha último mov | MOVIMIENTOS MAX(fecha) | Descuentos, Transfers, IA | ALTA | ALTO |
| 5 | Decisión recompra | Rotación+Stock+Demanda | No | CAP-02 + lead time | Composición | Compras, Producción, Planeación | MUY ALTA | MÁXIMO |
| 6 | Margen producto | Precio venta + costo | Parcial | Precio factura | MOVIMIENTOS_ITEMS.n_valor | Pricing, Inteligencia, IA | ALTA | ALTO |
| 7 | Performance vendedor | Ventas+Cuotas | Parcial | Cuotas/metas | Manual/Config | Vendor Engine, Comisiones | MEDIA | MEDIO |
| 8 | Intel geográfica | Ciudad+Venta+Línea | Parcial | Cruce datos | Existente | CRM, Inteligencia, IA | MEDIA | MEDIO |
| 9 | Presión productiva | PD+Disponible+OP | Existe | — | Existente | Producción, Coverage | ALTA | FUNCIONAL |
| 10 | Sobreinventario | Inv tienda + Max | Parcial | Inv tienda real | SAG bodega | Tiendas, Transfers, Alertas | MEDIA | ALTO |
| 11 | Frecuencia compra | Fechas factura | Derivable | Cálculo | SaleRecord | CRM, Segmentación, IA | MEDIA | MEDIO |
| 12 | CLV | Total + Período | Derivable | Cálculo | SaleRecord | Segmentación, CRM | BAJA | MEDIO |
| 13 | Lotes importación | Entrada + Costo + Proveedor | No | Todo | NO DISPONIBLE en SAG | Importaciones, Costos | ALTA | ALTO |
| 14 | Devoluciones | NC + unidades | Parcial | Líneas NC | MOVIMIENTOS NC | Calidad, Rotación neta | MEDIA | MEDIO |
| 15 | Histórico precios | Precio por factura | No | Todo | MOVIMIENTOS_ITEMS FV | Pricing, Markdown, Intel | ALTA | ALTO |

---

## 5. Gap Discovery — Datos Faltantes en SAG

> **Regla:** Solo se documentan aquí los datos que FALTAN. Los ya investigados (referencia, descripción, línea, subgrupo, disponible, PV3, PV4, talla, color) NO se repiten.

### GAP-01: Unidades vendidas por variante (talla+color)

**Tabla SAG:** `MOVIMIENTOS_ITEMS` (documentos FV, NV)
**Campos clave:** `ka_nl_articulo`, `ss_talla`, `ss_color`, `n_cantidad`, `n_valor`
**Filtro:** Header `k_n_clase_fuente` IN (facturas — fuente 1 y 2)
**Clasificación:** DISPONIBLE DIRECTAMENTE
**Impacto:** Rotación real, recompra, margen

---

### GAP-02: Fecha primer ingreso por referencia

**Tabla SAG:** `MOVIMIENTOS` (entradas al inventario — ET fuente 116, entradas directas)
**Campos clave:** `d_fecha_documento`, `ka_nl_articulo` (vía MOVIMIENTOS_ITEMS)
**Cálculo:** MIN(d_fecha_documento) WHERE tipo = entrada por artículo
**Clasificación:** DERIVABLE
**Impacto:** Edad inventario, obsolescencia

---

### GAP-03: Fecha último movimiento por referencia

**Tabla SAG:** `MOVIMIENTOS` (cualquier tipo)
**Campos clave:** `d_fecha_documento`, `ka_nl_articulo` (vía MOVIMIENTOS_ITEMS)
**Cálculo:** MAX(d_fecha_documento) por artículo
**Clasificación:** DERIVABLE
**Impacto:** Antigüedad comercial, producto muerto

---

### GAP-04: Precio unitario en factura

**Tabla SAG:** `MOVIMIENTOS_ITEMS` para documentos FV/NV
**Campos clave:** `n_valor_unitario` o `n_valor / n_cantidad`
**Clasificación:** DISPONIBLE DIRECTAMENTE
**Impacto:** Precio real de venta, margen, descuentos

---

### GAP-05: Notas crédito detalladas (devoluciones)

**Tabla SAG:** `MOVIMIENTOS` + `MOVIMIENTOS_ITEMS` para fuente NC
**Campos clave:** Los mismos que factura pero con fuente NC
**Clasificación:** DISPONIBLE DIRECTAMENTE
**Impacto:** Rotación neta, calidad, devoluciones

---

### GAP-06: Inventario por bodega-tienda (mapeo CONFIRMADO)

**Tabla SAG:** Vista de inventario por bodega (ya accedida para bodega 01)
**Mapeo ya descubierto (julio 2026):**
- ka_nl_bodega 11 (ss_codigo 02) = BODEGA SANDIEGO (tienda)
- ka_nl_bodega 31 (ss_codigo 00) = BODEGA CENTRO (tienda)
- ka_nl_bodega 32 (ss_codigo 23) = GRAN PLAZA (tienda)
- ka_nl_bodega 39 (ss_codigo 29) = BODEGA CALDAS (tienda)
- ka_nl_bodega 10 (ss_codigo 01) = BODEGA PRINCIPAL (origen)
- ka_nl_bodega 45-50 (ss_codigo 34-40) = VENDEDORES (maletas)

**NOTA CRITICA:** `MOVIMIENTOS.ka_nl_bodega` es el PK interno (10, 11, 31...), NO el ss_codigo display (01, 02, 00...). Código anterior tenía este bug.
**Clasificación:** DISPONIBLE DIRECTAMENTE — mapeo confirmado, falta configurar en Agentik
**Impacto:** Cobertura real de tiendas

---

### GAP-07: Cuotas/metas por vendedor

**Tabla SAG:** NO EXISTE en SAG
**Clasificación:** NO DISPONIBLE
**Alternativa:** Configuración manual en Agentik (módulo Vendedores)
**Impacto:** Performance vs objetivo

---

### GAP-08: Información de importación (proveedor, costo FOB, fecha arribo)

**Tabla SAG:** NO EXISTE como entidad
**Clasificación:** NO DISPONIBLE
**Alternativa:** Módulo propio de Agentik (Importaciones) con ingesta manual o Excel
**Impacto:** Trazabilidad de lote, costos reales

---

### GAP-09: Histórico de cambios de precio (lista de precios)

**Tabla SAG:** v_articulos tiene PV3/PV4 actuales, NO históricos
**Clasificación:** NO DISPONIBLE (versión actual only)
**Alternativa:** Snapshot periódico de precios actuales → construir histórico
**Impacto:** Análisis de pricing, elasticidad

---

### GAP-10: Cantidad de entrada por lote/referencia (stock ingresado)

**Tabla SAG:** `MOVIMIENTOS_ITEMS` para documentos de entrada (ET, compras directas)
**Campos clave:** `n_cantidad`, `ka_nl_articulo`, `ss_talla`, `ss_color`
**Clasificación:** DISPONIBLE DIRECTAMENTE
**Impacto:** Rotación = vendido / ingresado

---

## 6. Clasificación de Gaps

### Disponible Directamente (solo falta consumirlo)

| Gap | Dato | Tabla SAG | Acción |
|---|---|---|---|
| GAP-01 | Unidades vendidas por variante | MOVIMIENTOS_ITEMS (FV/NV) | Sync líneas de factura |
| GAP-04 | Precio unitario en factura | MOVIMIENTOS_ITEMS.n_valor_unitario | Sync con FV |
| GAP-05 | Notas crédito detalladas | MOVIMIENTOS + ITEMS (NC) | Nuevo sync fuente NC |
| GAP-06 | Inventario por bodega-tienda | Inventario por bodega | Confirmar mapeo |
| GAP-10 | Cantidad entrada por referencia | MOVIMIENTOS_ITEMS (ET, entradas) | Sync entradas |

### Derivable (calculable a partir de datos existentes o sincronizables)

| Gap | Dato | Cálculo | Dependencia |
|---|---|---|---|
| GAP-02 | Fecha primer ingreso | MIN(fecha) de MOVIMIENTOS entrada | GAP-10 sync |
| GAP-03 | Fecha último movimiento | MAX(fecha) de cualquier MOVIMIENTOS | GAP-01 + GAP-10 |
| CAP-11 | Frecuencia compra | Diff entre SaleRecord.saleDate | Ya disponible |
| CAP-12 | CLV | Sum + período de SaleRecord | Ya disponible |

### Requiere Composición (múltiples fuentes)

| Gap | Dato | Composición | Dependencias |
|---|---|---|---|
| CAP-02 | Rotación completa | Ingresado + vendido + disponible | GAP-01 + GAP-10 |
| CAP-05 | Decisión recompra | Rotación + Stock + Demanda + Lead time | CAP-02 + CAP-04 |
| CAP-06 | Margen real | Precio venta - costo producción | GAP-04 + CN costs |
| CAP-14 | Devoluciones netas | Vendido - devuelto | GAP-01 + GAP-05 |

### No Disponible (SAG no lo ofrece)

| Gap | Dato | Alternativa Agentik |
|---|---|---|
| GAP-07 | Cuotas/metas vendedor | Configuración manual en módulo Vendedores |
| GAP-08 | Importaciones (proveedor, FOB, arribo) | Módulo Importaciones con ingesta Excel/manual |
| GAP-09 | Histórico precios | Snapshot periódico automatizado |

---

## 7. Consumidores por Dato

### Fecha ingreso (GAP-02)
```
→ Importaciones (edad del lote)
→ Recompras (tiempo de reposición)
→ Rotación (ventana temporal)
→ IA Comercial (análisis temporal)
→ Alertas (producto estancado)
→ Markdown Engine (tiempo sin movimiento)
```

### Unidades vendidas por variante (GAP-01)
```
→ Rotación Engine (vendido/ingresado)
→ Recompra Engine (velocidad de salida)
→ Cobertura Engine (demanda real)
→ Maletas (composición óptima)
→ Inteligencia Comercial (mix producto)
→ Pricing Engine (elasticidad)
→ IA Comercial (predicción)
```

### Precio unitario factura (GAP-04)
```
→ Inventario (valorización)
→ Product Drawer (precio real)
→ Maletas (valor de maleta)
→ Compras (comparativo)
→ Intelligence Engine (margen)
→ Markdown Engine (descuento vs lista)
→ Pricing Engine (price point real)
```

### Fecha último movimiento (GAP-03)
```
→ Antigüedad (días sin movimiento)
→ Markdown Engine (candidato a promoción)
→ Transferencias (redistribuir stock muerto)
→ Alertas (obsolescencia)
→ IA Comercial (predicción de churn de producto)
```

### Inventario por tienda/bodega (GAP-06)
```
→ Coverage Engine (evaluación real)
→ Tiendas (dashboard por tienda)
→ Transferencias (origen→destino)
→ Alertas (sobrei/subinventario)
→ Maletas (disponible para armar)
```

### Ciudad cliente
```
→ CRM (segmentación geográfica)
→ Cobertura Comercial (penetración)
→ Inteligencia Comercial (demanda por región)
→ IA (patrones geográficos)
→ Rutas vendedor (optimización)
```

---

## 8. Commercial Knowledge Graph

```
PRODUCTOS ─────────────────────────────────────────────────────────────
│
├── Inventario ─── disponible, reservado, bodega
│   └── [GAP: fecha ingreso, cantidad entrada por lote]
│
├── Variantes ─── talla, color, SKU
│   └── [GAP: unidades vendidas por variante]
│
├── Producción ─── OP→CN→ET (lifecycle 44d avg)
│   └── costo materia prima (CN), costo unitario (OP)
│
├── Ventas ─── FV (oficial), NV (remisión), PD (pedido)
│   └── [GAP: precio unitario factura, devoluciones NC]
│
├── Precios ─── CRMQuoteLine (cotización), SAG PV3/PV4 (actual)
│   └── [GAP: histórico precios, precio factura real]
│
└── Importaciones
    └── [GAP: proveedor, FOB, fecha arribo, lote]

CLIENTES ──────────────────────────────────────────────────────────────
│
├── Pedidos ─── CustomerOrderRecord (PD SAG) + CRMQuote
│
├── Cartera ─── CustomerReceivable (facturas pendientes)
│   └── daysOverdue, agingBucket, balanceDue
│
├── Ciudad ─── CRM billing_address_city (90%)
│
├── Canal ─── SaleRecord.channel (mayoreo/pos/marketplace)
│
├── Vendedor ─── CRM quote history (60% confidence)
│   └── [GAP: asignación definitiva, cuotas]
│
└── Comportamiento
    └── [GAP: frecuencia compra (derivable), CLV (derivable)]

MOTORES ───────────────────────────────────────────────────────────────
│
├── Coverage Engine ─── evalúa inventario vs reglas (FUNCIONAL)
│   └── consume: inventario tienda, reglas, disponible origen
│
├── Repurchase Engine ─── decide qué recomprar (PLANIFICADO)
│   └── necesita: [CAP-02 rotación], [CAP-01 edad], stock, demanda
│
├── Production Pressure ─── prioriza producción (FUNCIONAL)
│   └── consume: PD pendientes, disponible, OP abiertos
│
├── Markdown Engine ─── identifica candidatos a promoción (PLANIFICADO)
│   └── necesita: [CAP-04 antigüedad], [CAP-02 rotación], margen
│
├── Transfer Engine ─── redistribuye stock entre bodegas (PARCIAL)
│   └── consume: cobertura por tienda, disponible origen
│
├── Intelligence Engine ─── responde preguntas complejas (PLANIFICADO)
│   └── necesita: TODOS los datos anteriores + Knowledge Graph
│
└── Vendor Engine ─── evalúa performance vendedores (PARCIAL)
    └── consume: ventas, conversión, clientes
    └── necesita: [GAP-07 cuotas]
```

---

## 9. Roadmap — Orden Recomendado para el Commercial Data Layer

### Fase 1: Unidades (2-3 sprints)

**Objetivo:** Pasar de montos a unidades reales.

| Sprint | Entidad | Sync | Motores beneficiados |
|---|---|---|---|
| 1.1 | SaleLineRecord (líneas FV/NV) | MOVIMIENTOS_ITEMS para facturas | Rotación, Pricing, Margen |
| 1.2 | InventoryMovement (entradas) | MOVIMIENTOS_ITEMS para ET/entradas | Edad, Rotación, Recompra |
| 1.3 | ReturnLineRecord (líneas NC) | MOVIMIENTOS_ITEMS para NC | Rotación neta, Calidad |

**Prioridad:** MÁXIMA — desbloquea CAP-01, CAP-02, CAP-04, CAP-05, CAP-06, CAP-14, CAP-15.

### Fase 2: Temporalidad (1 sprint)

**Objetivo:** Construir dimensión temporal del inventario.

| Sprint | Capacidad | Dependencia |
|---|---|---|
| 2.1 | Edad inventario engine | Fase 1.2 (entradas) |
| 2.2 | Rotación engine | Fase 1.1 (ventas) + 1.2 (entradas) |
| 2.3 | Antigüedad engine | Fase 1.1 + 1.2 |

**Motores habilitados:** Recompra, Markdown, Alertas de obsolescencia.

### Fase 3: Decisiones (1-2 sprints)

**Objetivo:** Motores que toman decisiones complejas.

| Sprint | Motor | Dependencia |
|---|---|---|
| 3.1 | Repurchase Engine | Fase 2.2 (rotación) |
| 3.2 | Markdown Engine | Fase 2.3 (antigüedad) + margen |
| 3.3 | Intelligence queries (Copilot) | Fases 1+2 |

### Fase 4: Enriquecimiento (paralelo)

**Objetivo:** Datos que no vienen de SAG.

| Sprint | Dato | Método |
|---|---|---|
| 4.1 | Mapeo bodega→tienda | Configuración manual confirmada |
| 4.2 | Cuotas vendedores | UI de configuración |
| 4.3 | Snapshot periódico precios | Cron job v_articulos PV3/PV4 |
| 4.4 | Importaciones | Módulo propio (Excel import) |

---

## 10. Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| MOVIMIENTOS_ITEMS no tiene n_valor_unitario | Media | Alto | Derivar de n_valor/n_cantidad |
| Bodega→Tienda mapeo no confirmado | Alta | Medio | Reunión con Castillitos, document |
| SAG PYA no expone todas las fuentes | Baja | Alto | Ya confirmados FV, NV, PD, CN, ET, OP |
| Volumen de líneas FV/NV puede ser masivo | Media | Medio | Sync incremental por fecha |
| Histórico precios no existe en SAG | Confirmado | Medio | Snapshot periódico (cron) |

---

## 11. Recomendaciones

1. **Sprint inmediato siguiente:** Sync de MOVIMIENTOS_ITEMS para FV/NV (líneas de factura) — desbloquea 6 capacidades de un solo golpe.

2. **No construir el Repurchase Engine sin datos de unidades** — sería especulativo y no confiable.

3. **El Intelligence Engine (Copilot comercial) debe navegar el Knowledge Graph** — no hacer consultas ad-hoc. Cada capacidad implementada agrega un nodo al grafo navegable.

4. **Confirmar mapeo bodega→tienda con Castillitos** antes de implementar cobertura real. Sin esto, el Coverage Engine opera con suposiciones.

5. **Los datos derivables (frecuencia, CLV, antigüedad) pueden implementarse sin sync adicional** — son cálculos sobre SaleRecord existente. Buenos quick wins para el Copilot.

6. **El módulo de Importaciones será necesariamente manual o Excel** porque SAG no modela importaciones como entidad. Diseñar para ingesta humana desde el inicio.

---

## Nota de Arquitectura

El Commercial Knowledge Graph descrito aquí NO es un componente técnico implementado (aún). Es el **modelo conceptual** que guía toda la evolución del Commercial Data Layer.

Cada sprint futuro agrega:
- Un nodo (entidad con datos reales)
- Relaciones (cruces entre entidades)
- Capacidades (preguntas que se pueden responder)

El día que el Copilot empresarial navegue este grafo, no necesitará ser "entrenado" — simplemente resolverá las preguntas siguiendo las relaciones entre nodos. Las pantallas seguirán siendo la interfaz operativa, pero el verdadero activo será el conocimiento estructurado detrás de ellas.
