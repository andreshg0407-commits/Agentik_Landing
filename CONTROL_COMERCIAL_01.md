# CONTROL-COMERCIAL-01 -- Sprint Report

**Date:** 2026-07-04
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)

---

## Resultado

Executive Commercial Dashboard completamente reescrito. De 4 KPIs basicos a un centro de control comercial con 6 secciones operativas, datos reales de 6 fuentes Prisma, y drill-down a modulos existentes.

---

## Secciones Implementadas

### 1. KPI Strip (8 indicadores)

| KPI | Fuente | Fila |
|-----|--------|------|
| Ventas Mes | SaleRecord (OFICIAL) | 1 |
| Ventas Semana | SaleRecord (OFICIAL) | 1 |
| Ventas Hoy | SaleRecord (OFICIAL) | 1 |
| Pedidos Mes | CRMQuote | 2 |
| Clientes Activos | CustomerProfile (ACTIVE) | 2 |
| Vendedores Activos | SaleRecord + CRMQuote (distinct sellers) | 2 |
| Cartera Vencida | CustomerReceivable (balanceDue > 0, daysOverdue > 0) | 3 |
| Recaudos Mes | CollectionRecord | 3 |

### 2. Alertas Operativas (max 10, prioritized)

| Alerta | Severity | Condicion |
|--------|----------|-----------|
| Refs agotadas | critical | refsAgotadas > 5 |
| Cartera vencida | critical/warning | cartera > 0, critical si > 50 clientes |
| Refs criticas | warning | refsCriticas > 20 |
| Sin ventas hoy | info | ventasHoy === 0 && hora >= 12 |

### 3. Ranking Vendedores (top 15)

- Fuente: SaleRecord (ventas) + CRMQuote (pedidos, clientes)
- Columnas: #, Vendedor, Ventas mes, Pedidos, Clientes
- Top 3 resaltados con medalla y fondo azul
- Click drill-down a `/comercial/vendedores/{slug}`

### 4. Geografia Comercial (top 20 ciudades)

- Fuente: CustomerProfile.city (DANE-resolved, sprint GEOGRAPHY-RECOVERY-01)
- Solo ciudades con nombre resuelto (excluye codigos numericos)
- Columnas: Ciudad, Departamento, Clientes, Cartera vencida
- Cartera enriched desde CustomerReceivable por customerId

### 5. Clientes Destacados (hasta 9 cards)

| Tipo | Fuente | Max |
|------|--------|-----|
| Mayor comprador | CRMQuote groupBy customerId, sum amount | 3 |
| Mayor riesgo cartera | CustomerReceivable sum balanceDue | 3 |
| Mayor recaudo | CollectionRecord sum amount | 3 |

- Click drill-down a `/comercial/clientes/{id}`
- Color-coded: verde (comprador), rojo (riesgo), azul (recaudo)

### 6. Resumen Inventario

- Fuente: CommercialCoverageSnapshot (latest batch)
- 4 mini-KPIs: Refs totales, Criticas, Agotadas, Con OP
- Drill-down a `/comercial/inventario`

---

## Archivos Modificados

| Archivo | Cambio |
|---------|--------|
| `lib/comercial/control/control-comercial-loader.ts` | Reescrito: 6 fuentes de datos (SaleRecord, CRMQuote, CollectionRecord, CustomerReceivable, CustomerProfile, CommercialCoverageSnapshot), vendor ranking, geography, customer highlights, alertas inteligentes |
| `app/(app)/[orgSlug]/comercial/control/control-client.tsx` | Reescrito: 6 secciones, VendorRow, GeoRowItem, CustomerCard, AlertaRow, MiniKpi. Drill-down links. ag-op-table/ag-op-row pattern. T.mono everywhere |

---

## Performance

- Single `loadControlComercial()` call with `Promise.all` where possible
- No N+1 queries: batch selects + in-memory aggregation
- Customer highlights: groupBy + single batch profile fetch
- Geography: single CustomerProfile query + in-memory city grouping
- Target: < 2s (depends on DB latency, all queries are indexed)

---

## Design System Compliance

- All tokens from `lib/ui/tokens.ts` (C, T, S, R, E)
- `T.mono` for all operational data
- `ag-op-table` / `ag-op-row` for tables
- `EmptyOperationalState` for empty sections
- `KpiCard`, `Panel`, `PanelHeader`, `Badge` from primitives
- No raw hex, no Tailwind colors, no generic cards
- `"\u2014"` (em dash) for zero/absent values

---

## Datos Reales Consumidos

| Modelo | Registros (aprox) | Uso |
|--------|-------------------|-----|
| SaleRecord | ~50K+ | Ventas hoy/semana/mes, vendor ranking |
| CRMQuote | ~285 | Pedidos mes, top buyers, vendor orders |
| CollectionRecord | ~5K+ | Recaudos mes, top collectors |
| CustomerReceivable | ~5K+ | Cartera vencida, risk customers |
| CustomerProfile | ~33K | Clientes activos, geografia |
| CommercialCoverageSnapshot | ~2K+ | Inventario refs |
