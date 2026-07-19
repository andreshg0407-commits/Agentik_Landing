# INVENTARIO_DATA_AUDIT.md

COMMERCIAL-DATA-AUDIT-01 -- Fase 5: Auditoria de Datos Inventario

---

## Volumen

| Metrica | Valor |
|---|---|
| CommercialCoverageSnapshot total | 15,309 |
| Snapshot dates distintos | 5 |
| Refs en ultimo snapshot | 3,071 |

### Historial de Snapshots

| Fecha | Refs |
|---|---|
| 2026-06-30 20:06 | 3,071 (ultimo) |
| 2026-06-30 19:38 | ~3,071 |
| 2026-06-30 19:20 | ~3,071 |
| 2026-06-29 02:55 | ~3,071 |
| 2026-06-28 03:29 | ~3,071 |

**Solo 5 snapshots guardados. 3 del mismo dia (Jun 30). Historial de 3 dias.**

---

## Ultimo Snapshot: Clasificacion de Referencias

| Estado | Cantidad | % |
|---|---|---|
| OK (disponible > 20) | 1,614 | 52.6% |
| Criticas (1-20 disponible) | 730 | 23.8% |
| Agotadas (disponible <= 0) | 727 | 23.7% |
| **Total** | **3,071** | 100% |

---

## Distribucion por Linea

| Linea | Cantidad | % |
|---|---|---|
| LT (Linea Textil) | 1,695 | 55.2% |
| CS (Cuero/Sintetico) | 1,376 | 44.8% |

---

## Completitud por Campo

| Campo | Poblado | % | Confianza | Observaciones |
|---|---|---|---|---|
| refCode | 3,071 | 100% | ALTA | Codigo de referencia SAG |
| description | 3,071 | 100% | ALTA | Descripcion del articulo |
| line (LT/CS) | 3,071 | 100% | ALTA | Clasificacion por linea |
| disponible | 3,071 | 100% | ALTA | Dato real de bodega |
| dailyVelocity | **0** | **0%** | **NULA** | Nunca calculado |
| coverageDays | **~0** | **~0%** | **NULA** | Depende de dailyVelocity |
| status | 3,071 | 100% | **BAJA** | Ver nota abajo |
| operationalScore | ~0 | ~0% | NULA | No calculado |
| pendingOrdersQty | 30 | **1.0%** | BAJA | Solo 30 refs tienen PD demand |
| subgrupoSag | 2,080 | **67.7%** | MEDIA | 991 refs sin subgrupo SAG |
| physicalQty | ~0 | ~0% | NULA | No poblado |
| crmReservedQty | ~0 | ~0% | NULA | No poblado |

---

## Problema con Status

Distribucion de status en ultimo snapshot:

| Status | Cantidad | % |
|---|---|---|
| sin_datos_velocidad | 2,343 | 76.3% |
| sin_stock | 719 | 23.4% |
| ruptura_inminente | 9 | 0.3% |
| cobertura_alta | 0 | 0% |
| cobertura_estable | 0 | 0% |
| cobertura_baja | 0 | 0% |

**El 76.3% de las referencias tienen status "sin_datos_velocidad" porque `dailyVelocity` nunca se calcula.** Esto significa que el campo `status` no representa un estado real de cobertura sino la ausencia de datos de velocidad.

Los unicos status significativos son `sin_stock` (disponible <= 0) y `ruptura_inminente` (disponible bajo con alguna velocidad detectada).

---

## Bodegas

**El campo `warehouseCode` NO existe en CommercialCoverageSnapshot.** El modelo no almacena la bodega origen. La derivacion `disponible = bodega - reservas` se hace upstream en el engine pipeline y solo se guarda el resultado neto.

La bodega visible en la UI ("Bodega 01 Textil + B36+B37 Accesorios") es un label fijo en el subtitulo, no un campo de datos.

---

## Umbrales

Los umbrales usados en el codigo son:

| Umbral | Valor | Usado en |
|---|---|---|
| Agotado | disponible <= 0 | control-comercial-loader.ts, inventario-client.tsx |
| Critico | disponible <= 20 | control-comercial-loader.ts |
| Con OP | pendingOrdersQty > 0 | control-comercial-loader.ts |

**Los umbrales son hardcoded. No hay configuracion por tenant.**

---

## Problemas Criticos

### P0 — dailyVelocity nunca calculado

El campo de velocidad diaria de ventas nunca se computa. Esto invalida:
- coverageDays (dias de cobertura restantes)
- status (76% muestra "sin_datos_velocidad")
- operationalScore
- Toda metrica predictiva de inventario

**Solucion requerida:** Calcular velocidad diaria desde SaleRecord o CustomerOrderLine por referencia.

### P1 — Solo 5 snapshots (3 dias de historial)

No hay historial temporal suficiente para detectar tendencias, comparar semanas, o calcular velocidades.

**Solucion requerida:** Cron de snapshot diario + retention policy.

### P1 — subgrupoSag incompleto (67.7%)

991 referencias no tienen subgrupo SAG. Esto afecta la clasificacion y filtros por subgrupo en la UI.

### P2 — pendingOrdersQty casi vacio (1%)

Solo 30 de 3,071 refs tienen demanda PD. El KPI "Refs con OP" en Control Comercial es basicamente 0.

### P2 — physicalQty y crmReservedQty no poblados

Los campos de stock fisico y reservas CRM existen en el schema pero nunca se escriben.

---

## Confianza General

| Aspecto | Confianza |
|---|---|
| disponible (stock neto) | **ALTA** — dato real de SAG |
| Clasificacion agotadas/criticas | **ALTA** — derivado de disponible |
| Clasificacion por linea (LT/CS) | **ALTA** — dato SAG |
| Velocidad de venta | **NULA** — nunca calculado |
| Dias de cobertura | **NULA** — depende de velocidad |
| Demanda PD | **BAJA** — solo 1% poblado |
| subgrupoSag | **MEDIA** — 67.7% poblado |
| Status de cobertura | **BAJA** — 76% muestra ausencia de datos |
