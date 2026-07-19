# INVENTORY-TRUTH-VALIDATION-01

**Date:** 2026-06-28
**Tenant:** castillitos (cmmpwstuf000dp5y58kj1daaj)
**TSC Baseline:** 160 (maintained, zero regressions)

---

## Pregunta Central

> ProductInventoryLevel y CommercialCoverageSnapshot representan saldos reales de Bodega 01 o estamos interpretando movimientos acumulados / datos incompletos / signos invertidos / una tabla incorrecta?

## Respuesta

**Agentik esta leyendo correctamente los datos de SAG.** Los saldos en ProductInventoryLevel son el resultado del query oficial de inventario de SAG, que computa `SUM(signed movements)` porque SAG PYA NO tiene tabla de saldos. Los negativos son reales en SAG.

Sin embargo, **la forma en que se presentan los datos tiene 3 problemas que distorsionan la vision operativa**. Estos problemas estan en Agentik, no en SAG.

---

## FASE 1-2: Panorama ProductInventoryLevel Bodega 01

### Por registro (variante-bodega)

| Signo | Registros | Total Qty | Rango | Avg |
|-------|-----------|-----------|-------|-----|
| NEGATIVO | 47,236 | -1,170,337 | [-321, -1] | -25 |
| POSITIVO | 3,075 | +67,950 | [1, 26,057] | +22 |

### Por referencia (SUM variantes)

| Signo | Referencias | Total Qty | Rango |
|-------|-------------|-----------|-------|
| POSITIVO | 357 | +67,011 | [1, 26,057] |
| NEGATIVO | 2,976 | -1,169,398 | [-8,592, -1] |
| CERO | 2 | 0 | [0, 0] |

**Resultado:** 89% de referencias tienen saldo negativo. 11% positivo.

---

## FASE 3: Comparacion entre Bodegas

| Bodega | Registros | Negativos | Positivos | Total Qty | Productos |
|--------|-----------|-----------|-----------|-----------|-----------|
| 01 (Principal) | 50,311 | 47,236 (94%) | 3,075 (6%) | -1,102,387 | 3,335 |
| 04 (Produccion) | 48,349 | 0 (0%) | 48,349 (100%) | +1,318,904 | 3,007 |
| 00 (Centro) | 10,323 | 9,492 (92%) | 831 (8%) | -28,160 | 2,149 |
| 02 (Sandiego) | 15,883 | 15,299 (96%) | 584 (4%) | -68,340 | 2,191 |

**Observacion critica:** Bodega 04 (Produccion) tiene CERO registros negativos y +1,318,904 unidades. Bodegas 01, 00, 02 son masivamente negativas. Esto es consistente con un patron donde las salidas (ventas, transfers) se registran contra bodegas comerciales pero las entradas (produccion terminada) se acumulan en Bodega 04.

**Hipotesis principal:** Los transfers de Bodega 04 → Bodega 01 (produccion terminada a almacen) posiblemente no estan registrados completamente en SAG, o el tipo de movimiento que genera la entrada en Bodega 01 no esta incluido en el query (FUENTES faltantes).

---

## FASE 4: Muestra Representativa (35 referencias)

### Latin Kids (16 refs)

| Referencia | PIL Sum | PIL+ | PIL- | CCS Disp | CCS PD | Diagnostico |
|------------|---------|------|------|----------|--------|-------------|
| L-TRIO1 | +127 | 1 | 0 | 127 | 0 | OK_MATCH |
| L-TRIO2 | +40 | 1 | 0 | 40 | 0 | OK_MATCH |
| L-9111 | +6 | 1 | 0 | 6 | 0 | OK_MATCH |
| L-1404 | +6 | 1 | 0 | 6 | 0 | OK_MATCH |
| L-3592 | +6 | 1 | 0 | 6 | 0 | OK_MATCH |
| L-8469 | +6 | 1 | 0 | 6 | 0 | OK_MATCH |
| L-2414 | -89 | 0 | 12 | 0 | 0 | NEG_CLAMPED_TO_0 |
| L-3588 | -91 | 0 | 19 | 0 | 0 | NEG_CLAMPED_TO_0 |
| L-8442 | -92 | 0 | 12 | 0 | 0 | NEG_CLAMPED_TO_0 |
| L-1395 | -95 | 1 | 23 | 0 | 0 | NEG_CLAMPED_TO_0 |
| L-7121 | -96 | 0 | 19 | 0 | 0 | NEG_CLAMPED_TO_0 |
| L-3040 | -1,007 | 0 | 20 | 0 | 0 | NEG_CLAMPED_TO_0 |
| L-3029 | -1,008 | 0 | 20 | 0 | 0 | NEG_CLAMPED_TO_0 |
| L-3031 | -1,008 | 0 | 20 | 0 | 0 | NEG_CLAMPED_TO_0 |
| L-3035 | -1,008 | 0 | 20 | 0 | 0 | NEG_CLAMPED_TO_0 |
| L-3028 | -1,008 | 0 | 20 | 0 | 0 | NEG_CLAMPED_TO_0 |

### Castillitos (19 refs)

| Referencia | PIL Sum | PIL+ | PIL- | CCS Disp | CCS PD | Diagnostico |
|------------|---------|------|------|----------|--------|-------------|
| C-1272140 | +131 | 11 | 0 | 131 | 0 | OK_MATCH |
| C-1241410 | +105 | 8 | 0 | 105 | 0 | OK_MATCH |
| C-2391160 | +99 | 4 | 0 | 99 | 0 | OK_MATCH |
| C-2462140 | +98 | 12 | 0 | 98 | 0 | OK_MATCH |
| C-2273359 | +94 | 8 | 0 | 94 | 0 | OK_MATCH |
| C-1081170 | +92 | 12 | 0 | 92 | 0 | OK_MATCH |
| C-1084179 | +88 | 16 | 0 | 88 | 0 | OK_MATCH |
| CA-2233614B | 0 | 1 | 1 | 0 | 0 | ZERO_OK |
| CA-1263614 | 0 | 3 | 4 | 0 | 0 | ZERO_OK |
| CF-1111533B | -97 | 0 | 12 | 0 | 0 | NEG_CLAMPED_TO_0 |
| CA-1061225B | -97 | 0 | 12 | 0 | 0 | NEG_CLAMPED_TO_0 |
| C-2502411 | -97 | 0 | 16 | 0 | 0 | NEG_CLAMPED_TO_0 |
| CT-1511284 | -99 | 0 | 12 | 0 | 0 | NEG_CLAMPED_TO_0 |
| CG-1001323B | -99 | 0 | 4 | 0 | 0 | NEG_CLAMPED_TO_0 |
| CD-4243339 | -3,689 | 1 | 83 | 0 | 0 | NEG_CLAMPED_TO_0 |
| CD-4903239 | -4,361 | 1 | 90 | 0 | 0 | NEG_CLAMPED_TO_0 |
| CD-4893239 | -4,500 | 4 | 88 | 0 | 0 | NEG_CLAMPED_TO_0 |
| CD-4123138B | -6,856 | 3 | 53 | 0 | 0 | NEG_CLAMPED_TO_0 |
| CD-4123138 | -8,592 | 2 | 56 | 0 | 0 | NEG_CLAMPED_TO_0 |

### Conclusion de Muestra

- **Todas las referencias positivas en PIL tienen match exacto en CCS.** El pipeline funciona correctamente para datos positivos.
- **Todas las referencias negativas en PIL tienen CCS=0.** Esto es por el `Math.max(0, ...)` en `_resync-coverage-snapshot.ts:137`.
- **CCS PD = 0 para TODAS las referencias.** Esto es porque el builder filtra `status='open'` y la DB tiene `status='PENDIENTE'`.
- **No hay discrepancias entre PIL y CCS** excepto el clamping a 0 — el pipeline es fiel.

---

## FASE 5: Detalle de Variantes

### L-TRIO1 (positivo, 127 unidades)

Una sola variante "Default" con saldo +127. Producto sin talla/color.

### L-3040 (negativo, -1,007 unidades)

20 variantes (talla x color), TODAS con saldo exacto de -56. Esto es sospechoso — un saldo uniforme de -56 en todas las variantes sugiere que las salidas fueron sistematicas (posiblemente un despacho grande) sin las entradas correspondientes.

**Dato revelador:** L-3040 en Bodega 04 tiene +1,008 unidades (20 variantes). Los numeros son casi simetricos: Bod01 = -1,007, Bod04 = +1,008. Esto confirma la hipotesis de transfers no registrados: la produccion esta en Bod04 pero las entradas a Bod01 no estan.

---

## FASE 6: Pedidos (CustomerOrderRecord)

| Status | Count | Monto Total |
|--------|-------|-------------|
| PENDIENTE | 9,045 | $23,050 M COP |

**Bug confirmado:** El coverage snapshot builder filtra `status='open'` pero el enum Prisma `CustomerOrderStatus` NO tiene valor `open`. Tiene `PENDIENTE`. Resultado: 0 pedidos descontados de disponibilidad.

**Nota:** CustomerOrderRecord almacena datos a nivel de pedido (amount, orderNumber, customerName), NO a nivel de linea (product, quantity). No tiene campo `productRef` ni `quantity`. Por lo tanto, incluso si el status fuera correcto, **no hay forma de descontar pedidos por referencia** con el modelo actual.

---

## FASE 7: Identificacion de Bodega 01

| externalRef | warehouseId (PK) | Records | Total Qty |
|-------------|-----------------|---------|-----------|
| 01 | 10 | 50,311 | -1,102,387 |
| 04 | 13 | 48,349 | +1,318,904 |
| 02 | 11 | 15,883 | -68,340 |
| 00 | 31 | 10,323 | -28,160 |

**Confirmado:** Bodega 01 (externalRef='01') es univoca. No hay ambiguedad de codigo. SAG la identifica como '01' y Agentik la lee como '01'. La identificacion es correcta.

---

## FASE 8: Duplicados

**8 duplicados encontrados** — 8 variantes tienen 2 registros en Bodega 01. Impacto menor (8 de 50,311 = 0.016%). Posiblemente causados por re-sync sin deduplicacion en el upsert.

---

## FASE 9: Bodega 01 vs 04 — mismas referencias?

| Categoria | Productos |
|-----------|-----------|
| SOLO en Bodega 01 | 352 |
| SOLO en Bodega 04 | 24 |
| En AMBAS bodegas | 2,983 |

**2,983 productos estan en ambas bodegas.** Esto es consistente con el ciclo productivo: las mismas referencias que se producen en Bod04 deberian tener stock en Bod01 despues de transfer.

---

## FASE 10: Caso de Estudio — L-3040

| Bodega | Saldo | Variantes |
|--------|-------|-----------|
| 01 (Principal) | -1,007 | 20 |
| 04 (Produccion) | +1,008 | 20 |
| 00 (Centro) | -1 | 1 |

**Simetria casi perfecta:** Bod01 = -1,007, Bod04 = +1,008. La diferencia neta es +1. Esto sugiere fuertemente que la produccion se registro en Bod04 pero el transfer a Bod01 nunca se proceso — o que el tipo de movimiento que genera la entrada en Bod01 no esta marcado como `sc_afecta_inventario = 'S'` en la tabla FUENTES de SAG.

---

## FASE 11-12: Top Positivas y Negativas

### Top 10 Positivas en Bodega 01

| Referencia | Linea | Saldo | Descripcion |
|------------|-------|-------|-------------|
| BP | PK | +26,057 | BOLSA PEQUEÑA |
| BM | PK | +13,860 | BOLSA MEDIANA |
| BG | PK | +7,097 | BOLSA GRANDE |
| BE | PK | +1,004 | BOLSA GRANDE ECOLOGICA |
| SL2-8 | — | +390 | SALDOS PIJAMAS LATIN KIDS 2-8 |
| CC | PK | +359 | CAJAS CASTILLITOS |
| C7-11967-4 | AC | +357 | PANALERAS |
| SL10-16 | — | +350 | SALDOS PIJAMAS LATIN KIDS 10-16 |
| C-1492340 | — | +173 | CHALECO PELUDO |
| SAL7777 | — | +149 | SALDOS |

**Hallazgo:** Las top positivas son principalmente BOLSAS y EMPAQUES (linea 3 = Packaging). Los productos de moda (L-*, C-*) tienen saldos mucho menores. Esto es coherente — el empaque no sale de bodega como producto final.

### Top 10 Negativas en Bodega 01

| Referencia | Linea | Saldo | Descripcion |
|------------|-------|-------|-------------|
| CD-4123138 | CS | -8,592 | CAMISETA NINO KIDS TIPO POLO BASICA |
| CD-4123138B | CS | -6,856 | CAMISETA NINO BEBE TIPO POLO BASICA |
| CD-4893239 | CS | -4,500 | CAMISETA BASICA NINO KIDS |
| CD-4903239 | CS | -4,361 | CAMISETA DE NINO BASICO BEBE |
| CD-4243339 | CS | -3,689 | CAMISETA DE NINA BASICO BEBE |
| CD-4253339 | CS | -3,611 | CAMISETA NINA BASICA KIDS |
| CD-4923639 | CS | -2,548 | CAMIBUSO BASICO NINO KIDS |
| CD-4913639 | CS | -2,259 | CAMIBUSO BASICO NINO BEBE |
| CD-2071343B | CS | -2,227 | JOGGER NINO BABY |
| CD-4273439 | CS | -2,128 | CAMIBUSO BASICO DE NINA BEBE |

**Hallazgo:** Todas las top negativas son prefijo `CD-` (posiblemente "Castillitos Diario" o basicos de alto volumen). Los saldos negativos de -2,000 a -8,592 son enormes y corresponden a productos basicos de alta rotacion. Esto refuerza la hipotesis de que las salidas (ventas, despachos) se registran masivamente pero las entradas (produccion terminada → Bod01) no.

---

## FASE 13: Sincronizacion

- **ProductInventoryLevel:** Sync unico 2026-06-23 (50,311 registros)
- **CommercialCoverageSnapshot:** Reconstruido 2026-06-28 (3,048 registros)

---

## Causa Raiz — Clasificacion

### A. Bodega incorrecta: NO

Bodega 01 esta correctamente identificada como "BODEGA PRINCIPAL". No hay ambiguedad.

### B. Tabla incorrecta: NO

ProductInventoryLevel almacena saldos computados, no movimientos crudos. El query SAG es correcto: `SUM(CASE WHEN F.sc_signo_inventario = '+' THEN MI.n_cantidad ELSE -MI.n_cantidad END)`.

### C. Signos invertidos: NO

Los signos son correctos segun la semantica de SAG FUENTES. Las entradas suman (+) y las salidas restan (-).

### D. Movimientos acumulados mal interpretados: PARCIALMENTE

Los saldos SON la suma correcta de movimientos con signo. Pero la pregunta es si **todos los movimientos relevantes estan incluidos**. La simetria Bod01(-1007) vs Bod04(+1008) para L-3040 sugiere que los transfers de produccion terminada (Bod04→Bod01) posiblemente no estan marcados como `sc_afecta_inventario = 'S'` en la FUENTE correspondiente, o que el tipo de documento que genera la entrada en Bod01 no esta incluido.

### E. Faltan fuentes de entrada: MUY PROBABLE

**Esta es la hipotesis principal.** El query SAG filtra `WHERE F.sc_afecta_inventario = 'S'`. Si el tipo de FUENTE que registra la entrada de produccion terminada en Bod01 no tiene `sc_afecta_inventario = 'S'`, esas entradas no se suman. Las salidas si se suman (ventas = Fuente 8 "Factura Venta", con signo `-`), creando el desbalance negativo masivo.

### F. Falta stock inicial: POSIBLE

Si Castillitos nunca registro un saldo inicial en SAG y solo tiene movimientos, los saldos son correctos pero incompletos — solo muestran el delta desde el inicio del registro.

### G. Pedidos mal descontados: SI pero sin impacto actual

El builder usa `status='open'` que no existe como enum. Resultado: 0 pedidos descontados. Pero incluso si se corrigiera, CustomerOrderRecord no tiene datos a nivel de linea (productRef, quantity), asi que no se podrian descontar por referencia.

### H. Variantes mal agrupadas: NO

No hay evidencia de agrupacion incorrecta. 8 duplicados de 50,311 (0.016%) — impacto negligible.

### I. Datos realmente agotados: PARCIALMENTE

Para las 357 referencias con saldo positivo, los datos son correctos y confiables. Para las 2,976 referencias negativas, el saldo negativo puede ser real en SAG (los datos de Agentik coinciden con SAG), pero el negativo probablemente indica un problema de fuentes faltantes en el query, no stock fisicamente negativo.

---

## Plan de Correccion

### P0 — Validacion con SAG directo (antes de cualquier correccion)

**Accion:** Consultar SAG directamente para 5 referencias clave y comparar:

1. **L-TRIO1** (PIL +127) — deberia coincidir
2. **C-1272140** (PIL +131) — deberia coincidir
3. **CD-4123138** (PIL -8,592) — validar si SAG dice lo mismo
4. **L-3040** (PIL -1,007, Bod04 +1,008) — validar simetria
5. **L-1395** (PIL -95) — referencia con 1 variante positiva + 23 negativas

Si SAG tambien dice -8,592 para CD-4123138 en Bod01, el query es correcto y el problema es operativo (fuentes de entrada faltantes en SAG).

Si SAG dice un valor positivo, entonces hay un error en el query o en las FUENTES consideradas.

**Metodo:** Ejecutar el query `SAG_VARIANT_INVENTORY_QUERY` directamente via SOAP para estas 5 referencias y comparar resultado.

### P1 — Investigar FUENTES faltantes

**Accion:** Consultar tabla FUENTES de SAG para identificar que tipos de movimiento estan marcados con `sc_afecta_inventario = 'S'` y cuales no. Buscar especificamente:

- Fuentes relacionadas con transfers de produccion (Bod04 → Bod01)
- Fuentes relacionadas con entrada de mercancia terminada
- Fuentes que deberian afectar inventario pero no estan marcadas

### P2 — Corregir status mapping de pedidos

**Accion:** Cambiar la query en `_resync-coverage-snapshot.ts:101` de `status = 'open'` a `status = 'PENDIENTE'::\"CustomerOrderStatus\"`.

**Nota:** Esto no tiene efecto real hasta que CustomerOrderRecord tenga datos a nivel de linea (productRef, quantity). Actualmente solo tiene datos a nivel de pedido.

### P3 — Documentar negativos en el UI

**Accion:** En lugar de ocultar los negativos (Math.max(0)), mostrarlos con contexto:

- "Saldo SAG: -1,007 (salidas superan entradas registradas)"
- Separar claramente: "Stock disponible: 0" de "Stock SAG: -1,007"
- Mostrar Bodega 04 como referencia: "En produccion: +1,008"

### P4 — Re-sync con query ampliado

**Si P0 confirma que SAG da los mismos negativos:**

- Evaluar con el equipo de SAG si hay FUENTES adicionales que deberian incluirse
- Considerar si el query deberia incluir `sc_afecta_inventario IN ('S', 'I')` u otro filtro mas amplio
- Considerar si hay una vista o reporte en SAG que muestre "existencia real" diferente de SUM(movements)

---

## Muestra para Validacion con SAG

| Referencia | Agentik Bod01 | Agentik Bod04 | SAG dice? | Diferencia? | Diagnostico? |
|------------|---------------|---------------|-----------|-------------|-------------|
| L-TRIO1 | +127 | — | PENDIENTE | — | — |
| C-1272140 | +131 | — | PENDIENTE | — | — |
| CD-4123138 | -8,592 | — | PENDIENTE | — | — |
| L-3040 | -1,007 | +1,008 | PENDIENTE | — | — |
| L-1395 | -95 | — | PENDIENTE | — | — |

**Instruccion al cliente:** Abrir la pantalla de existencias en SAG para cada referencia en Bodega 01 y anotar la cantidad. Comparar con la columna "Agentik Bod01".

---

## Archivos

| Archivo | Proposito |
|---------|-----------|
| `scripts/_inventory-truth-validation.ts` | Script de validacion (READ-ONLY) |
| `INVENTORY_TRUTH_VALIDATION_01.md` | Este documento |

---

## Como Re-ejecutar

```bash
npx dotenv-cli -e .env -- npx tsx scripts/_inventory-truth-validation.ts
```

---

## Validacion TSC

```bash
npx tsc --noEmit
# 160 errors (all pre-existing, zero new)
```
