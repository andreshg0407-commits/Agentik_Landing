# IMPORTACIONES_MVP_SPEC_01 — Especificacion MVP del modulo Importaciones

**Sprint:** COMPRAS-IMPORTACIONES-DATA-DISCOVERY-01
**Fecha:** 2026-07-09

---

## 1. Objetivo del modulo

Permitir al gerente de Castillitos tomar decisiones de recompra de productos importados basadas en datos reales de ventas, inventario y rotacion — sin depender de un Excel manual.

El modulo NO reemplaza Maletas. Maletas responde "como esta el mostrario". Importaciones responde "que debo volver a comprar, cuanto y cuando".

---

## 2. Preguntas que responde

1. **Que productos importados tengo?** → Catalogo filtrado por grupo IMPORTACION
2. **Cuando ingresaron?** → Fecha de primera entrada SAG (pendiente sync)
3. **Cuanto compre de cada uno?** → Total entradas por referencia (pendiente sync)
4. **Cuanto se ha vendido?** → SaleRecord acumulado por productCode
5. **Cuanto queda?** → ProductInventoryLevel (inventario real)
6. **Que tan rapido rota?** → Ventas ultimos 6 meses / stock actual
7. **Como se vende — detal vs mayorista?** → SaleRecord.channel
8. **A que precio se vende?** → PV3 (detal) y PV4 (mayorista) desde SAG
9. **Que debo recomprar?** → Logica de recomendacion basada en reglas
10. **Que NO debo recomprar?** → Stock alto + baja rotacion = no recomprar

---

## 3. Datos minimos requeridos (MVP puede arrancar con estos)

| Dato | Fuente actual | Estado |
|---|---|---|
| Referencia + descripcion | ProductEntity (line=IMPORT) | LISTO |
| Existencia actual | ProductInventoryLevel | LISTO |
| Ventas totales | SaleRecord | LISTO |
| Ventas ultimos 6 meses | SaleRecord (query temporal) | LISTO |
| Ventas por canal | SaleRecord.channel | LISTO (verificar mapeo) |
| Precio detal PV3 | v_articulos.n_valor_venta_promocion | REQUIERE sync de precios |
| Precio mayorista PV4 | v_articulos.nd_valor_venta4 | REQUIERE sync de precios |

---

## 4. Datos deseables (mejoran calidad, no bloquean MVP)

| Dato | Fuente | Estado |
|---|---|---|
| Fecha de importacion | MOVIMIENTOS entradas | PENDIENTE investigacion SAG |
| Total comprado (historico) | MOVIMIENTOS_ITEMS entradas | PENDIENTE investigacion SAG |
| Proveedor | MOVIMIENTOS.ka_nl_tercero | PENDIENTE investigacion SAG |
| Contenedor / embarque | Posiblemente no en SAG | NO DISPONIBLE |
| Costo unitario | v_articulos o MOVIMIENTOS | PENDIENTE investigacion |

---

## 5. Modelo canonico

Ver: `lib/comercial/importaciones/import-reference-model.ts`

Tipos principales:

- **ImportReference** — referencia importada con todos sus datos operativos
- **ImportBatch** — un ingreso/compra especifico (fecha, cantidad, documento)
- **ImportSalesChannelSummary** — ventas por canal y periodo
- **ImportPurchaseDecision** — recomendacion de recompra con nivel y razon
- **ImportReferenceAnalytics** — metricas derivadas (rotacion, cobertura, tendencia)

---

## 6. Fuentes actuales (disponibles hoy)

| Modelo Prisma | Uso para Importaciones |
|---|---|
| ProductEntity | Catalogo de productos line=IMPORT |
| ProductInventoryLevel | Stock actual por bodega |
| SaleRecord | Ventas historicas por referencia, canal, fecha |
| (v_articulos via Hoja3) | Precios PV3/PV4 — requiere sync |

---

## 7. Fuentes pendientes

| Dato | Tabla SAG probable | Accion requerida |
|---|---|---|
| Entradas de mercancia | MOVIMIENTOS (k_n_clase_fuente=compra) | Investigar tipos de documento de entrada |
| Items de entrada | MOVIMIENTOS_ITEMS | Confirmar estructura para entradas |
| Proveedor | TERCEROS via MOVIMIENTOS | Confirmar campo ka_nl_tercero |
| Precios PV3/PV4 | v_articulos | Sincronizar campos de precio en ProductEntity |

---

## 8. Primera version MVP recomendada

### Fase 1 — Tabla inteligente (SIN datos pendientes SAG)

Con datos ya disponibles (ProductEntity + ProductInventoryLevel + SaleRecord):

- Lista de referencias importadas
- Stock actual real
- Ventas totales y ultimos 6 meses
- Ventas por canal (tiendas/web/mayorista)
- % vendido estimado (ventas / (ventas + stock))
- Recomendacion basica de recompra

**No incluir:** fecha de importacion, total comprado original, contenedor, proveedor.
Mostrar "Pendiente SAG" en campos que requieren sync adicional.

### Fase 2 — Precios SAG

Sincronizar PV3/PV4 desde v_articulos:
- Agregar campos `pricePV3` y `pricePV4` a ProductEntity o tabla auxiliar
- Mostrar columnas de precio en la tabla

### Fase 3 — Historial de compras

Sincronizar entradas de mercancia:
- Crear modelo ImportBatch
- Fecha de importacion, cantidad, documento
- Total comprado historico real (no estimado)
- % vendido exacto

---

## 9. Riesgos

| Riesgo | Impacto | Mitigacion |
|---|---|---|
| PV3/PV4 no sincronizados aun | Precios vacios en tabla | Mostrar "—" con badge "Pendiente sync SAG" |
| Total comprado no disponible | % vendido solo estimable | Usar formula: vendido / (vendido + stock) como proxy |
| Fecha importacion no disponible | No se puede calcular "dias en bodega" | Usar createdAt de ProductEntity como proxy |
| Canal de venta no clasificado | No se puede separar detal vs mayorista | Mostrar "Canal pendiente de clasificacion" |
| MOVIMIENTOS de entrada no mapeados | No hay historial de compras | MVP arranca sin historial — Fase 3 lo agrega |

---

## 10. Que NO construir todavia

1. **Motor de recompra con IA** — usar reglas simples primero
2. **Prediccion de demanda** — no hay suficiente historia
3. **Gestion de proveedores** — no es el scope del MVP
4. **Ordenes de compra automaticas** — solo recomendar
5. **Replica del Excel** — Agentik calcula desde datos fuente
6. **Dashboard de importaciones** — tabla operativa primero
7. **Integracion con agentes de aduana** — fuera de scope
8. **Contenedor tracking** — SAG no tiene este dato
9. **Costo landed** — requiere datos de flete/aduana no disponibles
10. **Recompra con lead times** — requiere datos de proveedor no disponibles
