# CONTROL_COMERCIAL_AUDIT.md

COMMERCIAL-DATA-AUDIT-01 -- Fase 7: Auditoria de KPIs Control Comercial

---

## Arquitectura

`loadControlComercial()` en `lib/comercial/control/control-comercial-loader.ts` es un agregador puro. No tiene datasource propio — consume datos de los 4 modulos subyacentes.

---

## KPI Strip Row 1

### Pedidos Totales

| Aspecto | Valor |
|---|---|
| Fuente | CRMQuote.count() |
| Formula | count WHERE organizationId |
| Valor actual | 285 |
| Confiabilidad | **BAJA** |
| Problema | Solo mide quotes CRM (285 DRAFT). Ignora 9,522 CustomerOrderRecord SAG. No refleja pedidos operativos reales |

### Pedidos Pendientes

| Aspecto | Valor |
|---|---|
| Fuente | CRMQuote.count(status: DRAFT) |
| Formula | count WHERE status = "DRAFT" |
| Valor actual | 285 (= 100% de total) |
| Confiabilidad | **NULA** |
| Problema | Todos los quotes son DRAFT. El KPI muestra 285 "pendientes" permanentemente. El label dice "pendientes de sincronizacion SAG" pero en realidad es que el CRM nunca cambia el estado |

### Refs Criticas

| Aspecto | Valor |
|---|---|
| Fuente | CommercialCoverageSnapshot (latest batch) |
| Formula | count WHERE disponible > 0 AND disponible <= 20 |
| Valor actual | 730 |
| Confiabilidad | **ALTA** |
| Dependencia | disponible es dato real de SAG |

### Refs Agotadas

| Aspecto | Valor |
|---|---|
| Fuente | CommercialCoverageSnapshot (latest batch) |
| Formula | count WHERE disponible <= 0 |
| Valor actual | 727 |
| Confiabilidad | **ALTA** |
| Dependencia | disponible es dato real de SAG |

---

## KPI Strip Row 2

### Vendedores Activos

| Aspecto | Valor |
|---|---|
| Fuente | CommercialCase (latest batch) |
| Formula | COUNT(DISTINCT salesRepId) |
| Valor actual | **0** (CommercialCase vacia) |
| Confiabilidad | **NULA** |
| Problema | CommercialCase nunca persistido. Siempre muestra "--" |

### Maletas en Riesgo

| Aspecto | Valor |
|---|---|
| Fuente | CommercialCase (latest batch) |
| Formula | count WHERE riesgoComercial IN ("alto", "critico") |
| Valor actual | **0** (CommercialCase vacia) |
| Confiabilidad | **NULA** |
| Problema | CommercialCase nunca persistido. Siempre muestra "--" |

### Clientes Activos

| Aspecto | Valor |
|---|---|
| Fuente | CustomerProfile.count(status: ACTIVE) |
| Formula | count WHERE status = "ACTIVE" |
| Valor actual | 33,203 |
| Confiabilidad | **MEDIA** |
| Problema | TODOS los clientes son ACTIVE. No hay segmentacion. El numero es correcto pero no es discriminante |

### Clientes con Cartera

| Aspecto | Valor |
|---|---|
| Fuente | CustomerReceivable (distinct customerId) |
| Formula | count DISTINCT customerId WHERE balanceDue > 0 AND daysOverdue > 0 |
| Valor actual | ~28,801 |
| Confiabilidad | **BAJA** |
| Problema | 98.3% de receivables estan overdue. Posible error en calculo de daysOverdue o falta de actualizacion de pagos |

---

## Alertas Operativas

| Alerta | Condicion | Se activa? | Confiabilidad |
|---|---|---|---|
| Inventario agotadas | refsAgotadas > 5 | **SI** (727 > 5) | ALTA |
| Pedidos pendientes | pedidosPendientes > 0 | **SI** (285 > 0) | **NULA** (falso positivo permanente) |
| Clientes con cartera | clientesConCartera > 0 | **SI** (~28,801 > 0) | BAJA |
| Maletas en riesgo | maletasEnRiesgo > 0 | **NO** (siempre 0) | NULA |

**La alerta de "pedidos pendientes" es un falso positivo permanente.** Siempre muestra 285 porque todos los CRMQuotes son DRAFT. Esto genera ruido operativo que desensibiliza al usuario.

---

## Resumen por Modulo (Cards)

### Card Pedidos

| KPI | Fuente | Valor | Confiabilidad |
|---|---|---|---|
| Totales | CRMQuote.count() | 285 | BAJA |
| Pendientes | CRMQuote.count(DRAFT) | 285 | NULA |
| Sincronizados | CRMQuote.count(SENT) | 0 | NULA |
| Cancelados | CRMQuote.count(REJECTED) | 0 | NULA |

### Card Inventario

| KPI | Fuente | Valor | Confiabilidad |
|---|---|---|---|
| Refs totales | Coverage latest count | 3,071 | ALTA |
| Criticas | Coverage disponible 1-20 | 730 | ALTA |
| Agotadas | Coverage disponible <= 0 | 727 | ALTA |
| Con OP | Coverage pendingOrdersQty > 0 | 30 | BAJA |

### Card Maletas

| KPI | Fuente | Valor | Confiabilidad |
|---|---|---|---|
| Vendedores activos | CommercialCase | 0 | NULA |
| En riesgo | CommercialCase | 0 | NULA |
| Refs para reemplazar | CommercialCase | 0 | NULA |

---

## Problemas Criticos

### P0 — 4 de 8 KPIs en Row 1 tienen confiabilidad BAJA o NULA

Solo Refs Criticas y Refs Agotadas son confiables.

### P0 — Card Maletas completamente vacia

Los 3 KPIs de maletas siempre son "--" por CommercialCase vacia.

### P0 — Alerta de pedidos pendientes es falso positivo permanente

Genera fatiga de alerta. El usuario ve "285 pedidos pendientes" siempre.

### P1 — Card Pedidos solo muestra CRM, ignora SAG

Los 9,522 pedidos SAG reales no aparecen en el dashboard ejecutivo.

### P1 — Clientes con cartera posiblemente inflado

28,801 clientes "con cartera" de 33,203 total (87%) es anormalmente alto. Requiere revision del calculo de daysOverdue.

---

## Confianza General

| Seccion | Confianza |
|---|---|
| KPIs Inventario | **ALTA** (2 de 4 KPIs solidos) |
| KPIs Pedidos | **NULA** (todos basados en CRM stale) |
| KPIs Maletas | **NULA** (tablas vacias) |
| KPIs Clientes | **BAJA** (inflado, sin segmentacion) |
| Alertas | **BAJA** (1 de 4 alertas es real) |
| Dashboard ejecutivo global | **BAJA** |
