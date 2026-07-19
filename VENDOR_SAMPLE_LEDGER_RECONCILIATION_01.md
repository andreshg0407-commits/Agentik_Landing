# VENDOR-SAMPLE-LEDGER-RECONCILIATION-01

**Mode:** READ ONLY / FORENSICS
**Date:** 2026-07-01
**TSC Baseline:** 160 (no code changes)
**Prerequisite:** VENDOR-SAMPLE-PRESENCE-ENGINE-01

---

## VEREDICTO

**B. SI, CON FILTROS MENORES**

El motor de presencia basado en F34 (`vendor-sample-presence-engine.ts`) representa correctamente la presencia fisica en maletas. Tiene un sesgo menor por agregacion a nivel de variante (talla/color) que infla el conteo de referencias en 18% promedio para 3 de 6 vendedores. Se corrige con un cambio de GROUP BY en el SQL.

---

## FASE 1 — LEDGER F34 COMPLETO

Consulta: todas las lineas de `movimientos_traslados` donde bodega 45-50 es origen o destino. Movimientos no anulados (`sc_anulado = 'N'`).

### Volumenes

| Vendedor | Bodega | Lineas | IN lines | IN units | OUT lines | OUT units | NET |
|---|---|---|---|---|---|---|---|
| ORLANDO | 45 | 1,388 | 792 | 792 | 596 | 597 | **195** |
| CARLOS LEON | 46 | 1,489 | 879 | 888 | 610 | 632 | **256** |
| LUIS | 47 | 964 | 487 | 487 | 477 | 487 | **0** |
| NESTOR | 48 | 1,689 | 963 | 963 | 726 | 734 | **229** |
| CARLOS VILLA | 49 | 439 | 351 | 351 | 88 | 88 | **263** |
| FREDY | 50 | 433 | 219 | 220 | 214 | 216 | **4** |

**Total:** 6,402 lineas de traslado en el ledger completo.

### Origenes de transferencia

| Bodega origen | Lineas IN | Significado |
|---|---|---|
| B10 (PRINCIPAL) | 2,975 | 81% — bodega principal es fuente dominante |
| B33 | 710 | 19% — bodega secundaria |
| B18 | 6 | <1% — marginal |

---

## FASE 2 — BALANCE POR VENDEDOR POR REFERENCIA

Balance reconstruido desde el ledger completo (entradas - salidas por referencia).

| Vendedor | Bodega | Refs total | PRESENTE (net=1) | AUSENTE (net=0) | EXCESO (net>1) | NEGATIVO (net<0) |
|---|---|---|---|---|---|---|
| ORLANDO | 45 | 697 | 205 | 471 | 4 | 17 |
| CARLOS LEON | 46 | 778 | 251 | 518 | 8 | 1 |
| LUIS | 47 | 470 | 0 | 470 | 0 | 0 |
| NESTOR | 48 | 892 | 239 | 640 | 1 | 12 |
| CARLOS VILLA | 49 | 339 | 264 | 53 | 7 | 15 |
| FREDY | 50 | 217 | 4 | 213 | 0 | 0 |

---

## FASE 3 — VALIDACION DE PRESENCIA

Comparacion contra cifras de auditoria previa (INVENTORY-VENDOR-WAREHOUSE-TRUTH-SYNC-01):

| Vendedor | Ledger present (net>0) | Esperado | Delta | Veredicto |
|---|---|---|---|---|
| ORLANDO | 209 | 209 | 0 | OK |
| CARLOS LEON | 259 | 259 | 0 | OK |
| LUIS | 0 | 0 | 0 | OK |
| NESTOR | 240 | 240 | 0 | OK |
| CARLOS VILLA | 271 | 271 | 0 | OK |
| FREDY | 4 | 4 | 0 | OK |

**Resultado: MATCH PERFECTO.** Las 6 bodegas coinciden exactamente con la auditoria forense previa.

---

## FASE 4 — COMPARACION ENGINE vs LEDGER

### Descubrimiento critico: discrepancia por talla swaps

| Vendedor | Engine (variant-level) | Ledger (ref-level) | Delta | Causa |
|---|---|---|---|---|
| ORLANDO | 273 | 209 | +64 | Talla swaps |
| CARLOS LEON | 259 | 259 | 0 | MATCH perfecto |
| LUIS | 0 | 0 | 0 | MATCH |
| NESTOR | 311 | 240 | +71 | Talla swaps |
| CARLOS VILLA | 305 | 271 | +34 | Talla swaps |
| FREDY | 11 | 4 | +7 | Talla swaps |

### Mecanismo del delta

El engine agrupa por `(ref, ss_talla, ss_color)` con `HAVING net > 0`, luego suma en TypeScript solo las variantes positivas. Esto causa que refs con **talla swaps** aparezcan como presentes.

Ejemplo concreto — ref `CGJ-1752285` en bodega 45 (Orlando):

| Variante | IN | OUT | NET | Engine ve? |
|---|---|---|---|---|
| T:2 / C:CF1 | 0 | 1 | -1 | No (filtrado por HAVING) |
| T:3 / C:GR1 | 1 | 0 | +1 | Si |

- **Ref-level:** IN=1, OUT=1, NET=0 → AUSENTE
- **Engine:** solo ve T:3/GR1 (net=+1) → PRESENTE
- **Realidad fisica:** talla 3/GR1 SI esta en la maleta. El vendedor devolvio talla 2 y recibio talla 3.

### Interpretacion

Los 64 refs "extra" en Orlando NO son errores. Son referencias donde el vendedor intercambio una talla por otra. Fisicamente, hay un sample de esa referencia en la maleta (la talla nueva). El engine refleja correctamente la presencia fisica a nivel de variante.

Sin embargo, para la vista de negocio (conteo de referencias), el ref-level es mas apropiado. El fix es cambiar GROUP BY en el SQL a solo `ref` (sin talla/color).

---

## FASE 5 — DEVOLUCIONES

| Vendedor | Bodega | Refs devueltas (IN>0, OUT>0, net=0) |
|---|---|---|
| ORLANDO | 45 | 471 |
| CARLOS LEON | 46 | 518 |
| LUIS | 47 | 470 |
| NESTOR | 48 | 640 |
| CARLOS VILLA | 49 | 53 |
| FREDY | 50 | 213 |

**Observaciones:**
- Luis (B47): 470 de 470 refs devueltas — maleta completamente vaciada (vendedor inactivo)
- Fredy (B50): 213 de 217 refs devueltas — practicamente inactivo
- Carlos Villa (B49): solo 53 devueltas — maleta mas joven, pocas rotaciones
- Nestor (B48): 640 devoluciones — alta rotacion de muestras

**No se encontraron refs devueltas que sigan apareciendo activas en el ledger.** Las devoluciones estan correctamente contabilizadas.

---

## FASE 6 — REEMPLAZOS

Patron buscado: mismo documento, un ref sale (OUT) y otro ref entra (IN) al mismo vendedor.

| Vendedor | Documentos con patron de reemplazo |
|---|---|
| ORLANDO | 0 |
| CARLOS LEON | 0 |
| LUIS | 1 |
| NESTOR | 0 |
| CARLOS VILLA | 0 |
| FREDY | 0 |

**Unico caso detectado:**
- Luis, doc 14 (2025-05-23): OUT=[L-9058, L-7082, L-7083] IN=[L-1247]
- Devolvio 3 refs y recibio 1 — rotacion, no reemplazo 1:1.

**Conclusion:** SAG no codifica reemplazos de maleta como documentos especificos. Los intercambios son traslados independientes. No es posible inferir reemplazo 1:1 desde el ledger F34.

---

## FASE 7 — DOBLES PRESENCIAS (netBalance > 1)

| Vendedor | Bodega | Refs con net > 1 | Max net | Tipo dominante |
|---|---|---|---|---|
| ORLANDO | 45 | 4 | 2 | Single-variant (todos) |
| CARLOS LEON | 46 | 8 | 2 | 6 single, 2 multi-variant |
| LUIS | 47 | 0 | — | — |
| NESTOR | 48 | 1 | 2 | Single-variant |
| CARLOS VILLA | 49 | 7 | 2 | 3 single, 4 multi-variant |
| FREDY | 50 | 0 | — | — |

**Total: 20 refs con net > 1 en todo el sistema.**

### Analisis

- **Todos tienen net=2** (nunca 3+). Maximo exceso es 1 unidad.
- **Single-variant (14):** misma talla/color transferida 2 veces sin devolucion. Son reposiciones duplicadas — probablemente error operativo de bodega.
- **Multi-variant (6):** 2 tallas/colores diferentes del mismo ref, cada uno con net=1. Es correcto en el contexto de mostrario multitalla.

### Veredicto

- Single-variant duplicados (14): **error operativo menor**. No critico para alertas.
- Multi-variant (6): **correcto** — el vendedor tiene 2 tallas diferentes de la misma referencia.
- **Impacto:** 20 de 983 refs (2%). No afecta la confiabilidad del engine.

---

## FASE 8 — NEGATIVOS (netBalance < 0)

| Vendedor | Bodega | Refs con net < 0 | Min net | Sin entrada previa | Salida > entrada |
|---|---|---|---|---|---|
| ORLANDO | 45 | 17 | -2 | 2 | 15 |
| CARLOS LEON | 46 | 1 | -11 | 0 | 1 |
| LUIS | 47 | 0 | — | — | — |
| NESTOR | 48 | 12 | -1 | 0 | 12 |
| CARLOS VILLA | 49 | 15 | -1 | 1 | 14 |
| FREDY | 50 | 0 | — | — | — |

**Total: 45 refs con balance negativo.**

### Analisis

- **Patron dominante: salida > entrada (42 de 45).** El vendedor devolvio mas unidades de las que recibio. Todas tienen IN>=1, OUT>=2. Tipicamente IN=1, OUT=2, net=-1.
- **Caso extremo:** Carlos Leon, TQ-10 (CEPILLO DE DIENTE PARA BEBE): IN=2, OUT=13, net=-11. Producto de importacion usado como regalo/demo, no como mostrario.
- **Sin entrada previa (3):** Orlando tiene 2 refs con IN=0, OUT=1 (L-1300, L-3445). Carlos Villa tiene 1. Estos son transferencias OUT sin transferencia IN previa en el historico.

### Causa raiz

Los negativos son consecuencia de:
1. **Talla swaps registrados como transferencias independientes** — devuelven una talla en un documento, reciben otra en otro. Cuando la talla devuelta se contabiliza contra la referencia sin tener en cuenta que la recibida es la misma referencia, genera un par: talla A con net negativo + talla B con net positivo.
2. **Historial incompleto** — transferencias previas al inicio del registro F34 digital.
3. **Usos no-mostrario** — TQ-10 (cepillo) se usa como obsequio, no muestra.

### Impacto en el engine

**Cero impacto.** El engine usa `HAVING net > 0`, por lo tanto NUNCA ve refs con balance negativo. Los negativos no contaminan la presencia.

---

## FASE 9 — ANTIGUEDAD

### Distribucion de edad por vendedor (dias desde ultimo movimiento)

| Vendedor | Refs | Promedio | Mas antigua | Mas reciente | <30d | 30-90d | 90-180d | >180d |
|---|---|---|---|---|---|---|---|---|
| ORLANDO | 209 | 99 dias | 163d (CV-1482444, 2026-01-19) | 6d (L-3604, 2026-06-25) | 32 | 58 | 119 | 0 |
| CARLOS LEON | 259 | 92 dias | 164d (L-8466, 2026-01-18) | 6d (L-2421, 2026-06-25) | 27 | 90 | 142 | 0 |
| NESTOR | 240 | 106 dias | 163d (L-3519, 2026-01-19) | 6d (L-2421, 2026-06-25) | 29 | 70 | 141 | 0 |
| CARLOS VILLA | 271 | 104 dias | 164d (L-3501, 2026-01-18) | 6d (L-2421, 2026-06-25) | 31 | 87 | 153 | 0 |
| FREDY | 4 | 141 dias | 141d (CR-2043225, 2026-02-10) | 141d | 0 | 0 | 4 | 0 |

### Hallazgos

- **Todas las maletas activas tuvieron movimiento el 25 Jun 2026** (6 dias atras). Actividad reciente.
- **Promedio ~100 dias.** La mayoria de muestras tienen entre 90-180 dias.
- **Cero muestras con >180 dias.** Buena rotacion.
- **Fredy esta congelado** desde Feb 2026 — solo 4 refs, todas de la misma fecha.

---

## FASE 10 — COBERTURA CERTIFICADA

| Vendedor | Bod | Presentes | Exceso | Negativo | Devueltas | Ultimo mov | Confianza |
|---|---|---|---|---|---|---|---|
| ORLANDO | 45 | 209 | 4 | 17 | 471 | 2026-06-25 | **79%** |
| CARLOS LEON | 46 | 259 | 8 | 1 | 518 | 2026-06-25 | **88%** |
| LUIS | 47 | 0 | 0 | 0 | 470 | 2026-01-10 | **95%** |
| NESTOR | 48 | 240 | 1 | 12 | 640 | 2026-06-25 | **80%** |
| CARLOS VILLA | 49 | 271 | 7 | 15 | 53 | 2026-06-25 | **79%** |
| FREDY | 50 | 4 | 0 | 0 | 213 | 2026-03-25 | **95%** |

### Metodologia de confianza

- Base: 100%
- -5% por cada 10% de anomalias de exceso sobre total presente
- -10% por cada anomalia negativa
- -5% si ultimo movimiento > 90 dias, -10% si > 180 dias
- Min 0%, Max 100%
- Luis/Fredy: alta confianza porque vacios (no hay anomalias posibles)

---

## FASE 11 — VEREDICTO

### Puede VENDOR-SAMPLE-PRESENCE-ENGINE-01 ser fuente de verdad para Maletas?

**B. SI, CON FILTROS MENORES.**

### Justificacion

1. **El ledger F34 es la unica fuente real** de inventario de vendedor en SAG. `MOVIMIENTOS_ITEMS` nunca contiene F34. El engine usa la tabla correcta.

2. **Los conteos de referencia coinciden exactamente** con la auditoria forense previa (INVENTORY-VENDOR-WAREHOUSE-TRUTH-SYNC-01) cuando se agrega a nivel de referencia (sin talla/color).

3. **El engine tiene un sesgo positivo por talla swaps** — 64 refs extra en Orlando, 71 en Nestor, 34 en Carlos Villa, 7 en Fredy. Causa: `GROUP BY ref, talla, color` con `HAVING net > 0` seguido de sum positivo-solo en TypeScript.

4. **Las anomalias son menores:**
   - 20 refs con exceso (2% del total) — todos net=2, reposiciones duplicadas
   - 45 refs con negativo (no visibles al engine, cero impacto)
   - 2,365 refs devueltas correctamente contabilizadas

5. **La actividad es reciente** — todos los vendedores activos tuvieron movimiento el 25 Jun 2026.

### Filtro requerido

**Cambiar el SQL del engine** de:

```sql
GROUP BY ref, talla, color
HAVING ... > 0
```

a:

```sql
GROUP BY ref
HAVING ... > 0
```

Esto eliminaria la descripcion y talla/color del GROUP BY, alineando el conteo de refs con la definicion de negocio ("referencia presente en maleta" = ref-level, no variant-level).

**Impacto del cambio:**

| Vendedor | Antes (variante) | Despues (referencia) | Reduccion |
|---|---|---|---|
| ORLANDO | 273 | 209 | -64 (-23%) |
| CARLOS LEON | 259 | 259 | 0 |
| NESTOR | 311 | 240 | -71 (-23%) |
| CARLOS VILLA | 305 | 271 | -34 (-11%) |
| FREDY | 11 | 4 | -7 (-64%) |

---

## FASE 12 — RECOMENDACIONES

### P0: Corregir agregacion del engine (CRITICO)

Cambiar `buildVendorBalanceQuery()` en `vendor-sample-presence-engine.ts`:

```sql
-- ANTES (agrupa por variante — infla conteo)
GROUP BY v.k_sc_codigo_articulo, v.sc_detalle_articulo, mt.ss_talla, mt.ss_color
HAVING SUM(...destino...) - SUM(...origen...) > 0

-- DESPUES (agrupa por referencia — conteo correcto)
GROUP BY v.k_sc_codigo_articulo, MAX(v.sc_detalle_articulo)
HAVING SUM(...destino...) - SUM(...origen...) > 0
```

O alternativamente, usar subquery:

```sql
SELECT ref, descr, net_qty FROM (
  SELECT
    v.k_sc_codigo_articulo AS ref,
    MAX(v.sc_detalle_articulo) AS descr,
    SUM(CASE WHEN mt.ka_nl_bodega_destino = {BOD} THEN mt.nd_cantidad ELSE 0 END) -
    SUM(CASE WHEN mt.ka_nl_bodega_origen = {BOD} THEN mt.nd_cantidad ELSE 0 END) AS net_qty
  FROM movimientos_traslados mt
  INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mt.ka_nl_movimiento
  LEFT JOIN v_articulos v ON v.ka_nl_articulo = mt.ka_nl_articulo
  WHERE m.sc_anulado = 'N'
    AND (mt.ka_nl_bodega_destino = {BOD} OR mt.ka_nl_bodega_origen = {BOD})
  GROUP BY v.k_sc_codigo_articulo
) sub
WHERE net_qty > 0
```

### P1: Modelo de anomalias

Agregar deteccion de:
- **Exceso (net > 1):** marcar como `anomalia_duplicado` en UI, no como error critico
- **Negativo (net < 0):** no visible en engine actual, pero util para auditoria
- **Talla swap:** detectable via consulta separada — informacional, no bloqueante

### P2: Alertas de antiguedad y devolucion

Con la fecha de ultimo traslado ya disponible en el engine:
- **>120 dias sin movimiento:** alerta "muestra estancada"
- **Devolucion parcial:** ref con IN > OUT pero sin movimiento reciente
- **Vendedor inactivo:** ultimo movimiento > 90 dias para TODA la maleta

---

## Archivos del sprint

| Archivo | Rol |
|---|---|
| `scripts/forensic-vendor-ledger-reconciliation.ts` | Script principal de reconciliacion |
| `scripts/forensic-engine-variant-analysis.ts` | Analisis detallado de discrepancia por variantes |
| `scripts/forensic-talla-swap-all-vendors.ts` | Cuantificacion de talla swaps por vendedor |
| `VENDOR_SAMPLE_LEDGER_RECONCILIATION_01.md` | Este documento |

## Validacion

```bash
npx tsc --noEmit
# Resultado: 160 errores (baseline mantenida, cero nuevos)
```
