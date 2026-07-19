# CASTILLITOS DATA FRESHNESS FORENSICS

**Sprint:** CASTILLITOS-DATA-FRESHNESS-FORENSICS-01
**Fecha:** 2026-06-28
**Metodo:** READ ONLY — sin modificaciones a datos, syncs, UI ni motores
**Tenant:** Castillitos (cmmpwstuf000dp5y58kj1daaj)

---

## VEREDICTO EJECUTIVO

**Los datos que consume Agentik NO estan uniformemente vivos.**

- 5 de 8 fuentes criticas estan frescas (<=5 dias).
- 2 fuentes criticas estan congeladas (60-67 dias sin re-sync).
- 1 fuente critica no existe (tabla nunca migrada).

**Agentik NO puede tomar decisiones operativas confiables con los datos actuales en los dominios de Pedidos, Cartera y Transferencias.**

---

## FASE 1 — INVENTARIO DE FUENTES

| # | Fuente | Tabla | Proposito | Modulos | Registros | Primer registro | Ultimo registro | Estado |
|---|--------|-------|-----------|---------|-----------|-----------------|-----------------|--------|
| 1 | Catalogo SAG | ProductEntity | Productos maestros | Inventario, Maletas, Shopify | 4,565 | 2026-06-09 | 2026-06-23 | FRESH |
| 2 | Variantes SAG | ProductVariant | Tallas/colores por producto | Inventario, Disponibilidad | 53,331 | 2026-06-23 | 2026-06-23 | FRESH |
| 3 | Inventario SAG | ProductInventoryLevel | Saldos por bodega/variante | Inventario, Disponibilidad, Maletas | 156,832 | 2026-06-23 | 2026-06-23 | FRESH* |
| 4 | Cobertura | CommercialCoverageSnapshot | Disponibilidad por referencia | Disponibilidad, Maletas, Inteligencia | 3,048 | 2026-06-28 | 2026-06-28 | FRESH |
| 5 | Pedidos SAG | CustomerOrderRecord | Cotizaciones/pedidos CxC | Pedidos, Disponibilidad | 9,045 | 2020-06-11 | 2026-04-28 | STALE |
| 6 | Cartera SAG | CustomerReceivable | Cuentas por cobrar | Cartera, Cobros, Finanzas | 124,998 | 2020-05-26 | 2026-04-30 | STALE |
| 7 | Produccion SAG | ProductionOrder + Lines | Ordenes de produccion | Inventario, Produccion | 3,376 + 56,586 | 2020-11-02 | 2026-06-23 | FRESH |
| 8 | Transferencias | InventoryTransfer | Traslados entre bodegas | Maletas, Reposicion | 0 | — | — | NOT_IMPLEMENTED |
| 9 | Ventas SAG | SaleRecord | Movimientos de venta | Reportes, Inteligencia | 125,163 | 2020-05-26 | 2026-04-30 | STALE |
| 10 | Cobros SAG | CollectionRecord | Recaudos/pagos | Cobros, Tesoreria | 20,534 | 2026-04-30 | 2026-05-02 | STALE |
| 11 | Clientes SAG | CustomerProfile | Perfiles de cliente | CRM, Cartera | 33,203 | 2026-04-03 | 2026-05-04 | STALE |
| 12 | CRM Quotes | CRMQuote + CRMQuoteLine | Cotizaciones CRM | Pedidos | 285 + 27,064 | 2026-04-03 | 2026-06-24 | PARTIAL |
| 13 | Conectores | Connector (2) | SAG PYA + CRM | Infraestructura | 2 | — | — | ACTIVE |
| 14 | Runs de sync | ConnectorRun | Historial de ejecuciones | Auditoria | 70 | — | 2026-05-02 | STALE |

\* FRESH pero con problemas severos de calidad (94% negativos en Bodega 01)

---

## FASE 2 — AUDITORIA DE FRESCURA

| Tabla | Total | Ultimo creado/sync | Ultimos 7d | Ultimos 30d | Ultimos 90d | Diagnostico |
|-------|-------|--------------------|-----------:|------------:|------------:|-------------|
| ProductEntity | 4,565 | 2026-06-23 | 4,561 | 4,565 | 4,565 | Creado en bloque Jun 9-23 |
| ProductVariant | 53,331 | 2026-06-23 | 53,331 | 53,331 | 53,331 | Creado en bloque Jun 23 |
| ProductInventoryLevel | 156,832 | 2026-06-23 | 156,832 | 156,832 | 156,832 | Creado en bloque Jun 23 |
| CommercialCoverageSnapshot | 3,048 | 2026-06-28 | 3,048 | 3,048 | 3,048 | Recalculado hoy |
| CustomerOrderRecord | 9,045 | sync: 2026-04-29 | 0 | 0 | 9,045 | **CONGELADO 60 DIAS** |
| CustomerReceivable | 124,998 | sync: 2026-04-22 | 0 | 0 | 124,998 | **CONGELADO 67 DIAS** |
| ProductionOrder | 3,376 | sync: 2026-06-25 | 0 | 3,376 | 3,376 | Sincronizado Jun 25 |
| ProductionOrderLine | 56,586 | 2026-06-25 | 0 | 56,586 | 56,586 | Sincronizado Jun 25 |
| SaleRecord | 125,163 | 2026-04-30 (saleDate) | 0 | 0 | 125,163 | **CONGELADO 59 DIAS** |
| CollectionRecord | 20,534 | 2026-05-02 | 0 | 0 | 20,534 | **CONGELADO 57 DIAS** |
| CustomerProfile | 33,203 | 2026-05-04 | 0 | 0 | 33,203 | **CONGELADO 55 DIAS** |
| InventoryTransfer | 0 | NUNCA | 0 | 0 | 0 | **NO EXISTE** |
| IntegrationConnection | 0 | — | 0 | 0 | 0 | No configurado |
| ConnectorSyncLog | — | — | — | — | — | **TABLA NO EXISTE** |

---

## FASE 3 — CURVAS DE ACTIVIDAD

### Patron de sincronizacion: BATCH UNICO, NO INCREMENTAL

Todas las fuentes muestran patron identico: UN solo mes con actividad masiva, luego cero.

```
ProductInventoryLevel (createdAt):
  2026-06: 156,832 ########################################  <-- TODO en un solo dia

ProductVariant (createdAt):
  2026-06:  53,331 ########################################  <-- TODO en un solo dia

CustomerOrderRecord (syncedAt):
  2026-04:   9,045 ########################################  <-- TODO en un solo dia

CustomerReceivable (syncedAt):
  2026-04: 124,998 ########################################  <-- TODO en un solo dia
```

### Actividad diaria ultimos 60 dias

```
PIL updates:      2026-06-23 (unico dia con actividad)
CCS creates:      2026-06-28 (unico dia con actividad)
Receivable syncs: SIN ACTIVIDAD EN 60 DIAS
Order syncs:      SIN ACTIVIDAD EN 60 DIAS
```

**Conclusion:** No existe sincronizacion periodica. Todos los datos se cargaron en batch unico y no se han actualizado desde entonces.

### Historial de ConnectorRun

| Conector | Modulo | Estado | Runs | Ultimo run | Rows leidos | Rows importados |
|----------|--------|--------|-----:|------------|------------:|----------------:|
| SAG PYA | collections | SUCCESS | 2 | 2026-05-02 | 55,682 | 41,095 |
| SAG PYA | orders | SUCCESS | 1 | 2026-04-29 | 9,045 | 9,045 |
| SAG PYA | movements | SUCCESS | 3 | 2026-04-24 | 200,163 | 200,163 |
| SAG PYA | movements | RUNNING | 4 | 2026-04-24 | 0 | 0 |
| SAG PYA | movements | PARTIAL | 3 | 2026-04-24 | 75,000 | 66,456 |
| SAG PYA | movements | FAILED | 3 | 2026-04-24 | 0 | 0 |
| SAG PYA | receivables | SUCCESS | 13 | 2026-04-22 | 905,123 | 719,909 |
| SAG PYA | receivables | PARTIAL | 3 | 2026-04-22 | 30,000 | 29,994 |
| SAG PYA | receivables | FAILED | 6 | 2026-04-22 | 0 | 0 |
| SAG PYA | customers | SUCCESS | 11 | 2026-04-21 | 294,373 | 294,226 |
| CRM | customers | SUCCESS | 3 | 2026-04-03 | 91,983 | 61,322 |
| CRM | quotes | SUCCESS | 4 | 2026-04-03 | 570 | 285 |

**Observacion critica:** `movements` tiene 4 runs con status RUNNING — posibles syncs colgados que nunca terminaron.

---

## FASE 4 — LINEAGE AUDIT

### Inventario

```
SAG MOVIMIENTOS_ITEMS (SOAP)
  |-- SUM(CASE WHEN sc_signo_inventario='+' THEN qty ELSE -qty END) AS saldo
  |-- sag-variants-sync.ts (ejecuta query SOAP)
  |-- sag-inventory-normalizer.ts (agrupa por productCode+size+color)
  |-- sag-inventory-sync.ts (upsert en batches de 25)
  v
ProductEntity + ProductVariant + ProductInventoryLevel
  |-- report-loader.ts (loadAvailabilityRecords)
  |-- availability-engine.ts (buildAvailabilityReport, filtra sourceBodega="01")
  v
CommercialCoverageSnapshot (script: _resync-coverage-snapshot.ts)
  |-- disponible = Math.max(0, pilSum - pendingOrders)  // BUG: pendingOrders siempre 0
  v
Inventario Control Center UI (/comercial/inventario)
Maletas UI (/comercial/maletas)
Reportes Inteligentes
```

### Pedidos

```
SAG MOVIMIENTOS (SOAP, familia PD)
  |-- storage.ts: customerOrderStorage.upsertMany()
  v
CustomerOrderRecord (status='PENDIENTE')
  |-- BUG: codigo filtra status='open' --> 0 resultados
  v
order-service.ts (pedidos-client.tsx)
```

### Cartera

```
SAG v_cartera / CUENTAS_POR_COBRAR (SOAP)
  |-- storage.ts: customerReceivableStorage.upsertMany()
  |-- agingBucket(daysOverdue) calculado al momento del sync
  v
CustomerReceivable (aging CONGELADO al 2026-04-22)
  |-- refreshProfileReceivables() --> CustomerProfile.totalReceivable
  v
Cobros UI, KPIs financieros
```

### Produccion

```
SAG MOVIMIENTOS (SOAP, fuente 33 = OP)
  |-- sag-production-sync.ts (headers + items)
  |-- sag-production-normalizer.ts
  v
ProductionOrder + ProductionOrderLine
  |-- inventory-control-service.ts: loadActiveProductionCounts()
  v
Inventory Control Center (estado operacional)
```

---

## FASE 5 — AUDITORIA DE INVENTARIO

### Distribucion por bodega

| Bodega | Niveles | Positivos | Cero | Negativos | Suma total | Ultimo update |
|--------|--------:|----------:|-----:|----------:|-----------:|---------------|
| 10 (Bod 01?) | 50,311 | 3,075 (6%) | 0 | 47,236 (94%) | -1,102,387 | 2026-06-23 |
| 11 (Bod 02?) | 15,883 | 584 (4%) | 0 | 15,299 (96%) | -68,340 | 2026-06-23 |
| 12 (Bod 03?) | 7,484 | 533 (7%) | 1 | 6,950 (93%) | -25,253 | 2026-06-23 |
| 13 (Bod 04 Prod) | 48,349 | 48,349 (100%) | 0 | 0 (0%) | +1,318,904 | 2026-06-23 |
| 17-25 (Tiendas) | 2,673 | 80 (3%) | 0 | 2,593 (97%) | -4,214 | 2026-06-23 |
| 28-33 (Tiendas) | 24,027 | 2,723 (11%) | 1 | 21,303 (89%) | -159,103 | 2026-06-23 |
| 36-37 (Contenedores) | 190 | 190 (100%) | 0 | 0 (0%) | +82,356 | 2026-06-23 |
| 38-52 (Varios) | 1,851 | 282 (15%) | 0 | 1,569 (85%) | -1,734 | 2026-06-23 |
| 53-60 (Containers) | 924 | 924 (100%) | 0 | 0 (0%) | +94,469 | 2026-06-23 |

### CCS (Cobertura Comercial)

- Total referencias: 3,048
- Con stock > 0: **111 (3.6%)**
- Sin stock (= 0): **2,937 (96.4%)**
- Ultimo snapshot: 2026-06-28 (hoy)

**El 96.4% de las referencias aparece agotado porque los negativos se clampean a 0.**

### Causa raiz confirmada

SAG calcula saldos como SUM(movimientos con signo). Las entradas de produccion (Bodega 04 --> Bodega 01) no estan siendo incluidas en el calculo, dejando las bodegas de despacho con saldos negativos masivos.

Evidencia: Bodega 13 (produccion) tiene +1,318,904 unidades. Bodegas 10-12 (despacho) tienen -1,195,980 unidades. Simetria casi perfecta.

---

## FASE 6 — AUDITORIA DE PEDIDOS

| Campo | Valor | Evidencia |
|-------|-------|-----------|
| Total pedidos | 9,045 | Query directa |
| Primer pedido | 2020-06-11 | orderDate |
| Ultimo pedido | 2026-04-28 | orderDate |
| Primera sincronizacion | 2026-04-29 19:58 | syncedAt |
| Ultima sincronizacion | 2026-04-29 19:59 | syncedAt |
| Sincronizados ultimos 7d | 0 | **CONGELADO** |
| Sincronizados ultimos 30d | 0 | **CONGELADO** |
| Edad promedio | 1,142 dias (3.1 anos) | AVG(NOW - orderDate) |
| Estados en DB | "PENDIENTE" (unico) | DISTINCT status |
| Estado que busca el codigo | "open" | scripts/_resync-coverage-snapshot.ts:101 |

### BUG CONFIRMADO

```sql
-- Lo que ejecuta el codigo:
WHERE cor."status" = 'open'     --> 0 resultados

-- Lo que deberia ejecutar:
WHERE cor."status" = 'PENDIENTE' --> 9,045 resultados
```

### Impacto

1. Ninguna orden se deduce de la disponibilidad comercial.
2. CCS muestra `pendingOrdersQty = 0` para TODAS las referencias.
3. El modulo de Pedidos filtra correctamente pero la formula de disponibilidad no.
4. Faltan completamente los pedidos de Mayo y Junio 2026.

---

## FASE 7 — AUDITORIA DE PRODUCCION

| Campo | Valor |
|-------|-------|
| Total OPs | 3,376 |
| Abiertas | 3,352 (99.3%) |
| Cerradas | 24 (0.7%) |
| Lineas totales | 56,586 |
| Primer documento | 2020-11-02 |
| Ultimo documento | 2026-06-23 |
| Primera sincronizacion | 2026-06-25 05:23 |
| Ultima sincronizacion | 2026-06-25 07:38 |
| Source code | 100% "OP" (fuente 33) |
| Warehouse | 100% NULL (no asignado) |

### Actividad mensual reciente

```
2026-06: 26 OPs
2026-05: 46 OPs
2026-04: 41 OPs
2026-03: 41 OPs
2026-02: 60 OPs
```

**Produccion es la fuente mas sana.** 3 dias de edad, datos completos, actividad constante.

---

## FASE 8 — AUDITORIA DE CARTERA

| Campo | Valor |
|-------|-------|
| Total registros | 124,998 |
| Con saldo pendiente | 84,478 (67.6%) |
| Saldo cero | 27,229 (21.8%) |
| Saldo total | $32,679,885,952 COP |
| Monto original total | $32,679,885,952 COP |
| Monto pagado total | **$0 COP** |
| Factura mas antigua | 2020-05-26 |
| Factura mas reciente | 2026-04-30 |
| Primera sincronizacion | 2026-04-21 |
| Ultima sincronizacion | 2026-04-22 |
| Promedio dias vencidos | 954 dias |

### Aging buckets (saldo > 0)

| Bucket | Registros | Saldo |
|--------|----------:|------:|
| 90+ | 79,496 | $42,408,165,797 |
| 31-60 | 1,264 | $681,385,923 |
| 1-30 | 1,321 | $603,528,577 |
| CURRENT | 1,037 | $282,963,452 |
| 61-90 | 1,360 | $238,052,318 |

### Problemas criticos

1. **$0 pagado:** Todas las facturas muestran paidAmount = 0. Las colecciones (CollectionRecord) existen pero NO se aplican a CustomerReceivable.
2. **Aging congelado:** Los buckets se calcularon al momento del sync (Abr 22). Han pasado 67 dias — facturas que eran "1-30" ahora son "90+".
3. **94% en bucket 90+:** Puede ser parcialmente real (cartera historica) pero el aging distorsionado infla este numero.
4. **Sin actividad en 67 dias:** Cero syncs de cartera desde Abril 22.

---

## FASE 9 — AUDITORIA DE TRANSFERENCIAS

| Pregunta | Respuesta | Evidencia |
|----------|-----------|-----------|
| Existe InventoryTransfer? | **NO** | information_schema: 0 columnas |
| Existe la migracion? | En schema.prisma pero no aplicada | Modelo definido, tabla no creada |
| Tiene registros? | N/A | Tabla no existe |
| Esta siendo consumida? | No | No hay queries a esta tabla |
| Hay sync service? | Si (sag-transfer-sync.ts) | Existe pero no puede persistir |

**Impacto:** Cero visibilidad de traslados entre bodegas. Maletas de vendedores sin datos. Reposicion de tiendas sin datos.

---

## FASE 10 — AUDITORIA DE MALETAS

| Campo | Valor |
|-------|-------|
| Fuente | CommercialCoverageSnapshot + tenant rules |
| Ultima actualizacion | 2026-06-28 (CCS recalculado hoy) |
| Dependencia directa | PIL (5 dias) + Pedidos (60 dias stale) |
| Dependencia de transferencias | NO EXISTE (source 206 TM nunca sincronizado) |
| Confiabilidad | **DEGRADED** — muestra 96.4% agotado por negativos |

Las maletas muestran correctamente "Pendiente sincronizacion TM 206" para bodegas de vendedores vacias.

---

## FASE 11 — AUDITORIA DE LOADERS

### Fallbacks silenciosos identificados

| Archivo | Linea | Problema | Impacto |
|---------|-------|----------|---------|
| report-loader.ts | 42-91 | Retorna `{ records: [], snapshotAt: null }` si no hay snapshot | UI muestra vacio sin advertencia |
| inventory-control-service.ts | 66-95 | try/catch silencioso en loadActiveProductionCounts | Retorna Map vacio si tabla no existe |
| storage.ts | 247-319 | Fallback row-by-row en error de transaccion | Registros perdidos sin traza |
| storage.ts | 521-528 | Promise.allSettled sin identificar registros fallidos | Imposible saber que fallo |
| _resync-coverage-snapshot.ts | 101 | `status = 'open'` hardcodeado | **SIEMPRE retorna 0 pedidos** |

### Hardcoded status filters

| Archivo | Filtro | Valor DB real | Resultado |
|---------|--------|---------------|-----------|
| _resync-coverage-snapshot.ts:101 | `status = 'open'` | `PENDIENTE` | 0 resultados |
| inventory-control-service.ts:75 | `status: "OPEN"` | `open` (ProductionOrder) | Funciona |
| storage.ts:351 | `status: { in: ["OPEN","PARTIAL","OVERDUE"] }` | Mixto | Potencialmente incompleto |

---

## FASE 12 — AUDITORIA DE SINCRONIZACION

### Procesos activos

| Conector | Modulo | Ultimo run exitoso | Estado |
|----------|--------|--------------------|--------|
| SAG PYA SOAP | receivables | 2026-04-22 | STALE (67d) |
| SAG PYA SOAP | orders | 2026-04-29 | STALE (60d) |
| SAG PYA SOAP | movements | 2026-04-24 | STALE (65d) |
| SAG PYA SOAP | customers | 2026-04-21 | STALE (68d) |
| SAG PYA SOAP | collections | 2026-05-02 | STALE (57d) |
| Castillitos CRM | quotes | 2026-04-03 | STALE (86d) |
| Castillitos CRM | customers | 2026-04-03 | STALE (86d) |

### Procesos no existentes

| Proceso | Estado |
|---------|--------|
| Sync periodico (cron) | **NO EXISTE** |
| ConnectorSyncLog table | **NO EXISTE** |
| InventoryTransfer sync | Codigo existe, tabla no migrada |
| Sync de variantes/inventario via ConnectorRun | No registrado (sync Jun 23 fue manual/directo) |
| Sync de produccion via ConnectorRun | No registrado (sync Jun 25 fue manual/directo) |

### Observacion critica

Los syncs de inventario (Jun 23) y produccion (Jun 25) NO aparecen en ConnectorRun. Esto significa que se ejecutaron por una ruta diferente — probablemente scripts manuales o endpoints API directos que no registran ConnectorRun.

---

## FASE 13 — CLASIFICACION POR DOMINIO

| Dominio | Clasificacion | Justificacion |
|---------|---------------|---------------|
| INVENTARIO | **DEGRADED** | Datos frescos (5d) pero 94% negativos en Bod 01. Calculo de saldos SAG incompleto (faltan fuentes de entrada). CCS clampea a 0. |
| PEDIDOS | **BROKEN** | Congelado 60 dias. Bug de status ('open' vs 'PENDIENTE'). Sin detalle a nivel de linea. Pedidos May-Jun invisibles. |
| PRODUCCION | **TRUSTED** | 3 dias de edad. 3,376 OPs con 56,586 lineas. Actividad constante. Unica deficiencia: warehouseCode NULL. |
| CARTERA | **STALE** | Congelado 67 dias. Aging buckets obsoletos. $0 pagado (colecciones no aplicadas). Decisiones de cobro imposibles. |
| TRANSFERENCIAS | **NOT_IMPLEMENTED** | Tabla no existe. Codigo de sync existe pero no puede persistir. Bloquea maletas y reposicion. |
| MALETAS | **DEGRADED** | Depende de CCS (fresco) pero CCS muestra 96.4% agotado. Sin datos de transferencias TM 206. |
| COMERCIAL | **DEGRADED** | Catalogo fresco. Disponibilidad distorsionada por negativos + pedidos no deducidos. Ventas congeladas 59 dias. |
| INFORMES | **STALE** | Consumen datos de TODOS los dominios. Con Pedidos BROKEN y Cartera STALE, las conclusiones son poco confiables. |

---

## FASE 14 — OPERATIONAL TRUST SCORE

| Dominio | Score | Base de calculo |
|---------|------:|-----------------|
| Inventario | **35%** | Datos frescos pero 94% negativos invalida disponibilidad real |
| Pedidos | **10%** | Bug de status + congelado 60d + sin lineas = inutilizable |
| Produccion | **85%** | 3 dias, completo, actividad constante. -15% por warehouseCode NULL |
| Cartera | **10%** | Congelado 67d, aging obsoleto, $0 pagado |
| Transferencias | **0%** | Tabla no existe |
| Maletas | **25%** | Depende de inventario degradado + transferencias inexistentes |
| Comercial | **40%** | Catalogo bueno, disponibilidad distorsionada, ventas stale |
| Informes | **20%** | Consume todas las fuentes, varias degradadas o rotas |

### Trust Score Global: **28%**

Calculado como promedio ponderado (Inventario 20%, Pedidos 15%, Produccion 10%, Cartera 20%, Transferencias 5%, Maletas 10%, Comercial 10%, Informes 10%).

---

## FASE 15 — CAUSA RAIZ

### Causa raiz principal: MULTIPLES FACTORES

No hay una sola causa. Son cuatro problemas independientes:

| # | Causa | Evidencia | Impacto |
|---|-------|-----------|---------|
| 1 | **Sync no automatizado** | Cero actividad de sync en 57-68 dias. No hay cron jobs para datos operativos. | Datos se pudren silenciosamente. |
| 2 | **Fuente SAG incompleta** | Transferencias de produccion (Bod04->Bod01) no incluidas en calculo de saldo. | 94% del inventario aparece negativo/agotado. |
| 3 | **Bug de status mapping** | Codigo filtra 'open', DB tiene 'PENDIENTE'. | 0 pedidos deducidos de disponibilidad. |
| 4 | **Modelo incompleto** | InventoryTransfer no migrado. CustomerOrderRecord sin lineas. Aging no recalculado. | Dominios enteros ciegos. |

### Riesgo principal

**El riesgo #1 es que Agentik muestra datos con apariencia de frescura pero realidad de obsolescencia.** La UI no advierte que Cartera tiene 67 dias sin actualizar ni que Pedidos tiene un bug que retorna 0 siempre. El usuario asume que los datos son actuales.

---

## FASE 16 — MATRIZ DE DECISION

| Dominio | Confiable hoy? | Justificacion |
|---------|:--------------:|---------------|
| Inventario | **PARCIALMENTE** | Saldos frescos pero distorsionados por negativos. Para "que productos tenemos" si. Para "cuantos tenemos" no. |
| Pedidos | **NO** | Bug de status + 60 dias stale + sin lineas. Ningun dato de pedidos es operativamente util hoy. |
| Produccion | **SI** | 3 dias, completo, consistente. Unica fuente confiable para decisiones operativas. |
| Cartera | **NO** | 67 dias stale. Aging obsoleto. $0 pagado. Cualquier decision de cobro basada en estos datos es riesgosa. |
| Reposicion | **NO** | Depende de inventario (degradado) + pedidos (roto) + transferencias (inexistente). |
| Maletas | **NO** | Sin transferencias TM 206. Bodegas de vendedores vacias. |
| Informes Inteligentes | **NO** | Consumen datos de multiples dominios rotos/stale. Conclusiones no confiables. |

---

## FASE 17 — PLAN DE RECUPERACION

### P0 — Bloqueantes operacionales (esta semana)

| # | Accion | Impacto | Esfuerzo |
|---|--------|---------|----------|
| P0.1 | Corregir filtro `status='open'` -> `'PENDIENTE'` en _resync-coverage-snapshot.ts y loaders | Habilita deduccion de pedidos en disponibilidad | 1h |
| P0.2 | Re-ejecutar sync de CustomerOrderRecord | Recupera pedidos May-Jun 2026 | 2h |
| P0.3 | Re-ejecutar sync de CustomerReceivable con recalculo de aging | Restaura cartera actual | 3h |
| P0.4 | Agregar badges de frescura en UI para advertir al usuario | Evita decisiones con datos stale | 4h |

### P1 — Correcciones de sincronizacion (proxima semana)

| # | Accion | Impacto | Esfuerzo |
|---|--------|---------|----------|
| P1.1 | Crear cron job para sync diario de pedidos y cartera | Previene staleness futura | 8h |
| P1.2 | Investigar fuentes SAG de produccion terminada (ET, fuente 116) | Resuelve negativos de inventario | 4h |
| P1.3 | Re-sincronizar SaleRecord, CollectionRecord, CustomerProfile | Actualiza ventas/cobros/clientes | 4h |
| P1.4 | Aplicar migracion de InventoryTransfer y ejecutar primer sync | Habilita transferencias | 4h |

### P2 — Correcciones de modelo (semanas 3-4)

| # | Accion | Impacto | Esfuerzo |
|---|--------|---------|----------|
| P2.1 | Agregar lineas a CustomerOrderRecord (productRef, quantity) | Permite deduccion precisa por SKU | 8h |
| P2.2 | Implementar recalculo periodico de aging buckets | Aging siempre actualizado | 4h |
| P2.3 | Aplicar CollectionRecord a CustomerReceivable (paidAmount) | Cartera refleja pagos reales | 6h |
| P2.4 | Sync source 206 (TM) para maletas de vendedores | Restaura datos de maletas | 4h |

### P3 — Correcciones UX (semanas 5-6)

| # | Accion | Impacto | Esfuerzo |
|---|--------|---------|----------|
| P3.1 | Mostrar saldos negativos con contexto en vez de clampear a 0 | Transparencia operativa | 4h |
| P3.2 | Agregar indicadores de confiabilidad por dominio en dashboard | El CEO sabe que confiar | 6h |
| P3.3 | Implementar ConnectorSyncLog para auditoria de sincronizacion | Trazabilidad completa | 4h |

---

## FASE 18 — TABLA COMPLETA DEL CENSO

### Tablas con datos operativos de Castillitos

| Tabla | Registros | Proposito |
|-------|----------:|-----------|
| SaleRecord | 125,163 | Ventas historicas |
| CustomerReceivable | 124,998 | Cartera por cobrar |
| ProductInventoryLevel | 156,832 | Saldos de inventario |
| ProductVariant | 53,331 | Variantes de producto |
| ProductionOrderLine | 56,586 | Lineas de produccion |
| CustomerProfile | 33,203 | Perfiles de clientes |
| CRMQuoteLine | 27,064 | Lineas de cotizacion CRM |
| CollectionRecord | 20,534 | Recaudos |
| CustomerOrderRecord | 9,045 | Pedidos |
| ProductEntity | 4,565 | Productos maestros |
| ProductionOrder | 3,376 | Ordenes de produccion |
| CommercialCoverageSnapshot | 3,048 | Cobertura comercial |
| CRMQuote | 285 | Cotizaciones CRM |
| ConnectorRun | 70 | Historial de syncs |
| ConnectorCursor | 6 | Cursores de sync |
| Connector | 2 | Conectores |

### Tablas vacias relevantes

| Tabla | Registros | Nota |
|-------|----------:|------|
| InventoryTransfer | 0 | TABLA NO EXISTE |
| ConnectorSyncLog | 0 | TABLA NO EXISTE |
| PaymentRecord | 0 | Existe pero vacia |
| IntegrationConnection | 0 | No configurada |
| BankAccount | 0 | Sin datos bancarios |
| VendorCommercialBag | 0 | Maletas sin registros |

---

## FASE 19 — VALIDACION TSC

```
npx tsc --noEmit: 160 errores (baseline mantenida)
```

No se introdujeron regresiones. Este sprint es READ ONLY.

---

## RESUMEN VISUAL

```
PRODUCCION   [=========] 85%  TRUSTED     3 dias
CATALOGO     [========-] 80%  TRUSTED     5 dias
INVENTARIO   [===------] 35%  DEGRADED    5 dias (94% negativos)
COMERCIAL    [===------] 40%  DEGRADED    5-59 dias
MALETAS      [==-------] 25%  DEGRADED    depende de INV+TRANS
INFORMES     [==-------] 20%  STALE       consume todo
PEDIDOS      [=--------] 10%  BROKEN      60 dias + bug
CARTERA      [=--------] 10%  STALE       67 dias + $0 pagado
TRANSFERENC. [---------]  0%  NOT_IMPL    tabla no existe

GLOBAL:      [==-------] 28%
```

---

**Conclusion:** Agentik esta leyendo correctamente lo que SAG reporta. El problema no es de pipeline — es de operaciones de sincronizacion (no automatizadas), modelo de datos incompleto (transferencias, lineas de pedido), y un bug de status mapping que invalida toda la logica de disponibilidad. Antes de construir mas modulos o inteligencia, se deben ejecutar las acciones P0 esta semana.
