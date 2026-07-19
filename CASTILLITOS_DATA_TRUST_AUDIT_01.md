# CASTILLITOS-DATA-TRUST-AUDIT-01

**Date:** 2026-06-28
**Tenant:** castillitos (cmmpwstuf000dp5y58kj1daaj)
**TSC Baseline:** 160 (maintained, zero regressions)

---

## Trust Score Global: 63%

5 de 8 fuentes con alta confianza. 3 fuentes sin datos o con datos obsoletos.

---

## Resumen por Fuente

| # | Fuente | Registros | Ultima actualizacion | Frescura | Confianza |
|---|--------|-----------|---------------------|----------|-----------|
| 1 | Catalogo de Articulos (ProductEntity) | 4,565 | 2026-06-23 | 5 dias | HIGH |
| 2 | Inventario (ProductInventoryLevel) | 156,832 | 2026-06-23 | 5 dias | HIGH |
| 3 | Cobertura Comercial (CommercialCoverageSnapshot) | 3,048 | 2026-06-28 | HOY | HIGH |
| 4 | Variantes de Producto (ProductVariant) | 53,331 | 2026-06-23 | 5 dias | HIGH |
| 5 | Produccion (ProductionOrder) | 3,376 | 2026-06-25 (sync) | 3 dias | HIGH |
| 6 | Pedidos (CustomerOrderRecord) | 9,045 | 2026-04-29 (sync) | 60 dias | STALE |
| 7 | Cartera (CustomerReceivable) | 124,998 | 2026-04-22 (sync) | 67 dias | STALE |
| 8 | Transferencias (InventoryTransfer) | 0 | NUNCA | N/A | NONE |

---

## FASE 2: Inventario (ProductInventoryLevel)

### Diagnostico

- **156,832 registros** en 39 bodegas
- Toda la data fue cargada en una sola fecha: **2026-06-23** (sync unico, no incremental)
- **99,437 registros negativos** (63% del total)
- Bodega 01 (principal): 50,311 registros, de los cuales **47,236 son negativos** (94%)
- Bodega 01 total qty: **-1,102,387** unidades (balance neto negativo)

### Hallazgo Critico: Inventario Negativo Masivo

| Bodega | Registros | Negativos | % Negativo | Qty Total |
|--------|-----------|-----------|------------|-----------|
| 01 | 50,311 | 47,236 | 94% | -1,102,387 |
| 02 | 15,883 | 15,299 | 96% | -68,340 |
| 00 | 10,323 | 9,492 | 92% | -28,160 |
| 04 | 48,349 | 0 | 0% | +1,318,904 |

**Interpretacion:** Las bodegas 01, 02, 00, 23, 03, 29, 22 tienen inventario neto negativo. Esto puede significar:
1. **Movimientos pendientes de registrar** (TMs de entrada no aplicados)
2. **Salidas acumuladas sin reposicion** (despachos exceden entradas)
3. **Error de sync** (se importaron movimientos sin saldos base, o se acumularon salidas historicas)

**Riesgo:** La seccion de Disponibilidad del dashboard usa Bodega 01 como bodega principal. Con 94% de registros negativos, las cifras de "disponible" pueden ser incoherentes.

**Unica bodega sana:** Bodega 04 (WIP/Produccion) — 48,349 registros, 0 negativos, +1,318,904 unidades.

### Confianza: HIGH (datos recientes) pero con **sesgo de calidad severo**

---

## FASE 3: Pedidos (CustomerOrderRecord)

### Diagnostico

- **9,045 registros** todos con status `PENDIENTE`
- Rango de fechas de pedido: 2020-06-11 a 2026-04-28
- **Sync unico: 2026-04-29** (hace 60 dias, nunca re-sincronizado)
- Fuente: PD (Pedidos) desde SAG
- 9,036 con monto positivo, total: $23,050 M COP
- Solo **131 pedidos en los ultimos 90 dias** (respecto a la fecha de sync, no a hoy)

### Hallazgo Critico: Status Mapping Roto

El dashboard filtra por `status = 'open'` pero los datos tienen `status = 'PENDIENTE'`. **Resultado: 0 pedidos abiertos visibles.**

La query `WHERE status = 'open'` nunca encuentra nada porque el enum guarda `PENDIENTE`.

### Hallazgo: Data Congelada

El sync se hizo el 29 de abril y no se ha repetido. Todos los pedidos creados en mayo-junio 2026 no existen en el sistema.

### Confianza: STALE

**Accion requerida:**
1. Corregir query de disponibleReal: usar `status = 'PENDIENTE'` en lugar de `status = 'open'`
2. Re-sincronizar pedidos desde SAG
3. Establecer sync periodico (diario o cada 6 horas)

---

## FASE 4: Produccion (ProductionOrder)

### Diagnostico

- **3,376 ordenes** (3,352 abiertas, 24 cerradas)
- **56,586 lineas** de produccion
- Rango de documentos: 2020-11-02 a 2026-06-23
- **Sync: 2026-06-25** (hace 3 dias)
- Fuente: OP (Ordenes de Produccion) desde SAG

### Estado: Saludable

- Datos recientes (3 dias)
- Cobertura amplia (6 anos de historia)
- Lineas completas por orden
- Motor de produccion (production-flow-engine.ts) funciona sobre estos datos

### Confianza: HIGH

---

## FASE 5: Cartera (CustomerReceivable)

### Diagnostico

- **124,998 registros** — la fuente mas grande
- Todos con status `OPEN`
- Balance total pendiente: **$32,680 M COP**
- **Sync: 2026-04-21 a 2026-04-22** (hace 67 dias, nunca re-sincronizado)
- Rango de vencimiento: 2020-05-26 a 2026-05-22

### Hallazgo Critico: Aging Bucket Congelado

| Bucket | Registros | Balance |
|--------|-----------|---------|
| 90+ | 118,103 | $31,484 M |
| 61-90 | 2,075 | -$30.5 M |
| 31-60 | 1,906 | $464 M |
| 1-30 | 1,872 | $480 M |
| CURRENT | 1,042 | $282 M |

El 94% de la cartera esta en bucket 90+. Esto puede ser:
1. **Real:** Cartera historica acumulada (facturas viejas nunca pagadas)
2. **Stale:** Los buckets se calcularon al momento del sync (abril) y nunca se actualizaron, asi que facturas que en abril eran "31-60" ahora serian "90+"
3. **Mixto:** Combinacion de ambos

**Riesgo:** Si el CEO ve "94% de cartera en 90+" sin contexto de que los datos tienen 67 dias de retraso, podria tomar decisiones erroneas.

### Hallazgo: Bucket 61-90 con Balance Negativo

Balance de -$30.5 M en bucket 61-90 sugiere **notas credito o abonos** clasificados incorrectamente.

### Confianza: STALE

**Accion requerida:**
1. Re-sincronizar cartera completa
2. Recalcular aging buckets con fecha actual
3. Establecer sync periodico

---

## FASE 6: Transferencias (InventoryTransfer)

### Diagnostico

- **Tabla NO existe** en la base de datos
- Modelos `InventoryTransfer` e `InventoryTransferLine` estan definidos en `schema.prisma`
- **Migracion nunca fue aplicada**
- El servicio `sag-transfer-sync.ts` existe pero no puede escribir

### Impacto

Sin transferencias:
- No hay visibilidad de mercancia en transito
- No se puede calcular "disponible real" descontando salidas pendientes
- La seccion "Maletas" del dashboard muestra estado honesto ("Pendiente sincronizacion TM 206")
- Los reemplazos y surtidos de tiendas no tienen datos de envio

### Confianza: NONE

**Accion requerida:**
1. Aplicar migracion Prisma para InventoryTransfer + InventoryTransferLine
2. Ejecutar sync inicial desde SAG (TMs tipo 206, 210, etc.)
3. Establecer sync periodico

---

## FASE 7: Health Score por Fuente

### Criterios de Evaluacion

| Nivel | Definicion | Dias desde ultimo sync |
|-------|-----------|----------------------|
| HIGH | Datos frescos, confiables para decisiones | <= 7 dias |
| MEDIUM | Datos usables con precaucion | <= 30 dias |
| LOW | Datos con riesgo de obsolescencia | <= 90 dias |
| STALE | Datos no confiables para decisiones actuales | > 90 dias |
| NONE | Sin datos | N/A |

### Evaluacion Detallada

| Fuente | Frescura | Cobertura | Calidad | Score | Notas |
|--------|----------|-----------|---------|-------|-------|
| Catalogo | 5d | 4,565 articulos | Buena | HIGH | Lineas asignadas, sync completo |
| Inventario | 5d | 156,832 registros | **Mala** | HIGH* | 63% negativo, Bod01 94% negativo |
| CCS | HOY | 3,048 refs | Derivada | HIGH | Calculada de PIL, hereda problemas de calidad |
| Variantes | 5d | 53,331 | Buena | HIGH | Talla/color completos |
| Produccion | 3d | 3,376 OPs | Buena | HIGH | Lineas completas, sync reciente |
| Pedidos | 60d | 9,045 | **Rota** | STALE | Status mapping roto, sin re-sync |
| Cartera | 67d | 124,998 | **Congelada** | STALE | Aging desactualizado, buckets obsoletos |
| Transferencias | NUNCA | 0 | N/A | NONE | Tabla no existe |

*Inventario marcado HIGH por frescura pero con flag de calidad severo.

---

## FASE 8: Conclusiones Ejecutivas

### Pregunta 1: Puede el CEO confiar en los reportes actuales?

**Parcialmente.** 5 de 8 fuentes son frescas (<=5 dias), pero:

1. **Inventario tiene un problema de calidad grave** — 63% de registros negativos. Las cifras de disponibilidad pueden ser incoherentes.
2. **Pedidos no impactan disponibilidad** — el filtro de status esta roto (`open` vs `PENDIENTE`)
3. **Cartera es obsoleta** — datos de hace 67 dias, los cobros de hoy no son confiables
4. **Transferencias no existen** — sin visibilidad de mercancia en transito

### Pregunta 2: Que puede usarse HOY?

| Seccion Dashboard | Usable? | Limitacion |
|-------------------|---------|------------|
| Resumen Ejecutivo | SI, con cautela | KPIs derivados de fuentes mixtas |
| Disponibilidad Comercial | SI, con cautela | Inventario negativo distorsiona cifras |
| Produccion | SI | Datos frescos y completos |
| Maletas | NO | Sin datos de transferencias |
| Reposicion | SI, con cautela | Basada en inventario con problemas |
| Vendedores | NO | Sin datos de maletas/transferencias |
| Cobros/Cartera | NO | Datos de hace 67 dias |

### Pregunta 3: Que debe arreglarse PRIMERO?

**Prioridad 1 — Impacto inmediato (esta semana):**

1. **Fix status mapping de Pedidos** — Cambiar query de `status='open'` a `status='PENDIENTE'` o ajustar el sync para usar el enum correcto. Esto desbloquea el calculo de `disponibleReal`.

2. **Investigar inventario negativo** — Determinar si los negativos son movimientos acumulados, errores de sync, o datos validos de SAG. Consultar con el equipo de SAG que significa qty negativa en Bodega 01.

**Prioridad 2 — Recuperacion de datos (proxima semana):**

3. **Re-sync Cartera** — Ejecutar sync completo de CustomerReceivable con recalculo de aging buckets. Esto rehabilita la seccion de cobros del dashboard.

4. **Re-sync Pedidos** — Actualizar CustomerOrderRecord con datos de mayo-junio 2026.

**Prioridad 3 — Infraestructura (proximas 2 semanas):**

5. **Aplicar migracion InventoryTransfer** — Crear tabla en DB, ejecutar sync inicial de TMs desde SAG.

6. **Establecer sync periodico** — Cron jobs o webhooks para mantener cada fuente actualizada automaticamente.

### Pregunta 4: Camino mas corto a datos confiables?

```
Semana 1: Fix status mapping (1h) + investigar negativos (2h)
          → Disponibilidad comercial confiable

Semana 2: Re-sync cartera (4h) + re-sync pedidos (2h)
          → Cobros y pedidos actualizados

Semana 3: Migracion transferencias (2h) + sync TMs (4h)
          → Maletas y transito visibles

Semana 4: Cron jobs de sync automatico (8h)
          → Todo actualizado automaticamente
```

---

## Tablas que NO existen en DB

| Modelo Prisma | Estado | Bloqueador |
|---------------|--------|-----------|
| InventoryTransfer | En schema.prisma, sin migracion | `prisma migrate deploy` |
| InventoryTransferLine | En schema.prisma, sin migracion | Depende de InventoryTransfer |
| Receivable | **No encontrada** — existe `CustomerReceivable` | Verificar mapping en codigo |

---

## Anomalias Detectadas

### 1. Inventario Negativo Masivo
- 99,437 de 156,832 registros (63%) tienen cantidad negativa
- Bodega 01: 94% negativo, total -1,102,387 unidades
- **Requiere consulta con equipo SAG** para entender semantica

### 2. CommercialCoverageSnapshot derivada
- CCS se calcula desde ProductInventoryLevel (Bodega 01)
- Si Bodega 01 tiene inventario negativo, CCS hereda esas distorsiones
- La cifra "264 disponibles en LT" puede incluir conteos negativos

### 3. Sync de un solo dia
- ProductEntity: toda la data con updatedAt = 2026-06-23
- ProductInventoryLevel: toda la data con updatedAt = 2026-06-23
- Esto sugiere un **sync completo tipo full-replace**, no incremental
- Si el sync falla una vez, toda la data queda congelada

### 4. ConnectorSyncRun no existe
- No hay registro formal de ejecuciones de sync
- Imposible auditar cuando fue la ultima sincronizacion exitosa por fuente
- Los syncs se ejecutan como scripts manuales sin tracking

---

## Archivos de Auditoria

| Archivo | Proposito |
|---------|-----------|
| `scripts/_data-trust-audit.ts` | Script de auditoria automatizada |
| `CASTILLITOS_DATA_TRUST_AUDIT_01.md` | Este documento |

---

## Como Re-ejecutar

```bash
npx dotenv-cli -e .env -- npx tsx scripts/_data-trust-audit.ts
```

Ejecutar periodicamente para monitorear mejoras en trust score.
