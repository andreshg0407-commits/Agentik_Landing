# CONTROL-COMERCIAL-02 -- Sprint Report

**Date:** 2026-07-04
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)

---

## Problema Resuelto

Control Comercial mostraba KPIs vacios ("--") porque todas las queries filtraban por mes actual (Julio 2026) pero los datos mas recientes son de Junio 2026 (SAG sync no ha corrido para Julio).

**Root cause:** El dato mas reciente de cada fuente es:
- SaleRecord: 2026-06-30
- CRMQuote: 2026-06-01
- CollectionRecord: 2026-06-27
- CustomerReceivable: datos acumulados (siempre disponibles)

**Solucion:** Smart period fallback — si el mes actual tiene 0 registros, el loader busca el ultimo mes con datos y lo etiqueta "(ultimo disponible)".

---

## KPIs Corregidos (FASE 1-2)

| KPI | Fuente | Calculo | Antes | Despues |
|-----|--------|---------|-------|---------|
| Ventas mes | SaleRecord | sum(amount) periodo | -- | $X (Junio 2026) |
| Ventas semana | SaleRecord | sum where saleDate >= weekStart | -- | $X |
| Ventas hoy | SaleRecord | sum where saleDate >= today | -- | $0 (correcto) |
| Pedidos mes | CRMQuote | count periodo | -- | N pedidos |
| Pedidos total | CRMQuote | count all | N/A | N total |
| Ticket promedio | CRMQuote | sum(amount)/count | N/A | $X |
| Clientes activos | CustomerProfile | count status=ACTIVE | 33,229 | 33,229 |
| Clientes nuevos | CustomerProfile | count createdAt >= monthStart | N/A | N |
| Vendedores operativos | CRMQuote | distinct sellerSlug | 0 | 9 |
| Cartera total | CustomerReceivable | sum balanceDue>0 | N/A | $45.2B |
| Cartera vencida | CustomerReceivable | sum balanceDue>0 AND daysOverdue>0 | $44.5B | $44.5B |
| % vencida | derivado | vencida/total*100 | N/A | 98% |
| Clientes con mora | CustomerReceivable | distinct customerId | N/A | N |
| Recaudos mes | CollectionRecord | sum(amount) periodo | -- | $X (Junio) |

**Regla:** KPIs siempre muestran $0 o 0, nunca "--". El periodo se indica con etiqueta.

---

## Cartera Comercial (FASE 3)

Bloque dedicado con:
- Cartera total, cartera vencida, % vencida
- Clientes con mora
- Top moroso (nombre + monto)
- Recaudos del periodo
- Aviso: "Cartera sujeta a conciliacion SAG"

---

## Grafico Ventas por Ciudad (FASE 4)

Barras horizontales: Top 10 ciudades por valor de pedidos CRM.
- Cada barra muestra: ciudad, departamento, valor, clientes, pedidos
- Fuente: CRMQuote join CustomerProfile.city (DANE-resolved)
- Etiqueta: "Pedidos CRM por ciudad" (proxy, no ventas oficiales)

---

## Tabla Geografia Comercial (FASE 5)

Top 20 ciudades con columnas:
- Ciudad (texto legible, DANE-resolved)
- Departamento
- Clientes
- Pedidos (CRMQuote count por ciudad)
- Valor CRM (CRMQuote sum por ciudad)
- Cartera vencida (CustomerReceivable sum por ciudad)

---

## Ranking Vendedores (FASE 6)

Corregido: antes usaba SaleRecord (1 seller "Sin Vendedor") + CRMQuote del mes actual (0).
Ahora: usa **todos los CRMQuote** (all-time), ranked by valor total.

| Columna | Fuente |
|---------|--------|
| Vendedor | CRMQuote.sellerName |
| Clientes | distinct customerId per seller |
| Pedidos | count CRMQuote per seller |
| Valor CRM | sum amount per seller |
| Cartera asociada | CustomerReceivable via seller's customers |
| Ultimo pedido | max issuedAt |

Click: drill-down a `/comercial/vendedores/{slug}`.

---

## Clientes Destacados (FASE 7)

| Tipo | Fuente | Criterio |
|------|--------|----------|
| Top compradores (3) | CRMQuote | sum amount, all-time |
| Mayor cartera vencida (3) | CustomerReceivable | sum balanceDue, overdue>0 |
| Mayor recaudo (3) | CollectionRecord | sum amount, periodo |
| Sin compra reciente (2) | CRMQuote + CustomerReceivable | >90 dias sin pedido + tiene cartera |

Click: drill-down a `/comercial/clientes/{id}`.

---

## Canales Comerciales (FASE 8)

Fuente: SaleRecord.channel (ALMACEN, EMPRESA, ONLINE, OTRO).

| Columna | Fuente |
|---------|--------|
| Canal | SaleRecord.channel |
| Registros | count per channel |
| Valor | sum amount per channel |
| Puntos | distinct storeSlug per channel |
| Estado | activo / sin_datos / pendiente_integracion |

No se inventan tiendas. Se muestran canales reales de SaleRecord.

---

## Lecturas Comerciales (FASE 9)

Reglas deterministicas (no IA):

1. Concentracion geografica: "Medellin concentra X% de los clientes"
2. Concentracion vendedores: "Top 3 vendedores concentran X% del valor CRM"
3. Concentracion cartera: "5 clientes concentran X% de la cartera vencida"
4. Inventario: "X referencias agotadas"
5. Cartera por ciudad: "X ciudad tiene la mayor cartera vencida: $Y"

---

## Accionabilidad (FASE 10)

Alertas ahora incluyen `action: { label, href }`:
- "Ver inventario" -> `/comercial/inventario`
- "Ver clientes" -> `/comercial/clientes`
- "Ver vendedores" -> `/comercial/vendedores`

Botones de accion renderizados en cada alerta.

---

## Performance (FASE 11)

- Smart period fallback: solo 1 extra query (count) por fuente
- No N+1: batch selects + in-memory aggregation
- No rawCrmJson loaded
- Customer highlights: batch profile fetch per category
- Geography: single CustomerProfile query + in-memory city grouping
- Vendor ranking: single allQuotes fetch, in-memory aggregation

---

## Qué es real vs proxy

| Metrica | Tipo | Nota |
|---------|------|------|
| Ventas | REAL | SaleRecord desde SAG (OFICIAL + REMISION) |
| Pedidos | REAL | CRMQuote desde SuiteCRM V8 |
| Cartera | REAL | CustomerReceivable desde SAG |
| Recaudos | REAL | CollectionRecord desde SAG |
| Clientes | REAL | CustomerProfile (CRM + SAG) |
| Geografia | REAL | DANE-resolved city (sprint GEOGRAPHY-RECOVERY-01) |
| Valor por ciudad | PROXY | CRMQuote amount por customer→city join |
| Ranking vendedores | PROXY | CRMQuote (SAG SaleRecord solo tiene "Sin Vendedor") |
| Canales | REAL | SaleRecord.channel |
| Insights | DERIVADO | Reglas deterministicas sobre datos reales |

---

## Archivos Modificados

| Archivo | Cambio |
|---------|--------|
| `lib/comercial/control/control-comercial-loader.ts` | Reescrito completo: smart period fallback, 12 secciones de datos, CarteraBloque, ChannelRow, InsightEjecutivo, VendorRankRow con cartera asociada, GeoRow con pedidos/valor |
| `app/(app)/[orgSlug]/comercial/control/control-client.tsx` | Reescrito completo: 10 secciones UI, GeoBarChart, ChannelRowItem, InsightRow, SectionLabel, TableHeaderRow, Cell, alertas con action buttons |

---

## Pendientes

- Ventas por vendedor: SaleRecord solo tiene "Sin Vendedor" — SAG no atribuye vendedor en ventas, solo en pedidos CRM.
- Ventas por ciudad: no hay join directo SaleRecord→CustomerProfile. Se usa CRMQuote como proxy.
- Meta de ventas por vendedor: no configurada (salesGoal = null).
- SAG sync Julio: cuando lleguen datos de Julio, el dashboard automaticamente mostrará el mes actual.
