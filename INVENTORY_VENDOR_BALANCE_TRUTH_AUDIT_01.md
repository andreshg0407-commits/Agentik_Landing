# INVENTORY-VENDOR-BALANCE-TRUTH-AUDIT-01

**Mode:** READ ONLY / FORENSICS
**Date:** 2026-07-01
**TSC Baseline:** 160 (no code changes)

---

## VEREDICTO

**F. MULTIPLES CAUSAS — CRITICO**

1. **Mapping de bodegas incorrecto** (ROOT CAUSE)
2. **PIL almacena ka_nl_bodega (PK interno) como warehouseId**, pero Maletas UI busca ss_codigo (codigo externo)
3. **Las 4 cards con datos muestran bodegas EQUIVOCADAS**
4. **Las bodegas reales de vendedor (ka_nl_bodega 45-50) tienen 0 datos positivos en PIL**
5. **Administracion confirma max 1 unidad por referencia en maleta; PIL muestra hasta 2,000**

---

## PREGUNTA CENTRAL: RESPONDIDA

**NO.** La cantidad mostrada en cada maleta NO es el saldo actual real de la bodega del vendedor. Maletas muestra inventario de bodegas de importacion y operativas, no de vendedores.

---

## FASE 1 — Fuente actual de UI

`vendor-sample-loader.ts` queries:

```sql
SELECT ... FROM "ProductInventoryLevel" pil
WHERE pil."warehouseId" = ANY($2)  -- ["35","36","37","38","39","40"]
  AND pil.quantity > 0
```

`quantityInBag` = `SUM(pil.quantity)` from PIL.

The loader uses warehouseId strings "35"-"40" (ss_codigo = external business codes).
But PIL stores `ka_nl_bodega` (SAG internal PK) as `warehouseId`.

---

## FASE 2 — PIL por bodega

### PIL warehouseId = ka_nl_bodega (NOT ss_codigo)

| PIL warehouseId | ka_nl_bodega | Actual Bodega | Total Rows | Positive | Pos Units | Negative | Neg Units | Net |
|---|---|---|---|---|---|---|---|---|
| 36 | 36 | **IMPORTACION PARTE 2** | 84 | 84 | 49,109 | 0 | 0 | 49,109 |
| 37 | 37 | **IMPORTACION PARTE 1** | 106 | 106 | 33,247 | 0 | 0 | 33,247 |
| 38 | 38 | **PLAN SEPARE** | 354 | 0 | 0 | 354 | -381 | -381 |
| 39 | 39 | **BODEGA CALDAS** | 5,852 | 540 | 884 | 5,312 | -20,139 | -19,255 |

### Real vendor bodegas (ka_nl_bodega 45-50)

| PIL warehouseId | ka_nl_bodega | Real Bodega | Rows | Positive |
|---|---|---|---|---|
| 45 | 45 | VEND ORLANDO | 1 | 0 |
| 46 | 46 | VEND CARLOS LEON | 0 | 0 |
| 47 | 47 | VEND LUIS | 0 | 0 |
| 48 | 48 | VEND NESTOR | 0 | 0 |
| 49 | 49 | VEND CARLOS VILLA | 0 | 0 |
| 50 | 50 | VEND FREDY | 0 | 0 |

**Real vendor bodegas have essentially NO data in PIL.** The SAG inventory sync has not produced meaningful rows for ka_nl_bodega 45-50.

---

## FASE 3 — SAG directo

SAG inventory is computed from `MOVIMIENTOS_ITEMS` signed transactions:

```sql
SUM(CASE WHEN F.sc_signo_inventario = '+' THEN MI.n_cantidad ELSE -MI.n_cantidad END) AS saldo
```

There is NO dedicated balance table. Balance = sum of all historical signed movements.

The SAG query groups by `MI.ka_nl_bodega` (internal PK). The sync normalizer writes `warehouseId = String(row.warehouseId)` where `row.warehouseId = num(row.ka_nl_bodega)`.

**Therefore: PIL warehouseId = ka_nl_bodega string.**

But Maletas UI vendor configs use `warehouseCode: "35"` (ss_codigo).

### Confirmed mapping

| Vendor | ss_codigo (external) | ka_nl_bodega (internal) |
|---|---|---|
| VEND ORLANDO | 35 | **45** |
| VEND CARLOS LEON | 36 | **46** |
| VEND LUIS | 37 | **47** |
| VEND NESTOR | 38 | **48** |
| VEND CARLOS VILLA | 39 | **49** |
| VEND FREDY | 40 | **50** |

### What UI queries vs what it gets

| UI thinks | warehouseId queried | ka_nl_bodega | Actual bodega |
|---|---|---|---|
| Orlando | "35" | 35 | _(no SAG bodega at 35)_ |
| Carlos Leon | "36" | 36 | **IMPORTACION PARTE 2** |
| Luis | "37" | 37 | **IMPORTACION PARTE 1** |
| Nestor | "38" | 38 | **PLAN SEPARE** |
| Carlos Villa | "39" | 39 | **BODEGA CALDAS** |
| Fredy | "40" | 40 | _(no SAG bodega at 40)_ |

---

## FASE 4 — Casos sospechosos

### Case 1: "Carlos Leon" showing 49,109 units in 84 refs

- PIL warehouseId=36 = ka_nl_bodega=36 = **IMPORTACION PARTE 2**
- All 84 refs are productLine=5 (imports): teteros (1,440), rasca encias (1,000), baberos (960)
- These are **wholesale import inventory quantities**, not sample bags
- **Verdict: 100% wrong. Not Carlos Leon's maleta.**

### Case 2: "Carlos Villa" showing 253 refs / 884 units

- PIL warehouseId=39 = ka_nl_bodega=39 = **BODEGA CALDAS**
- Top items: RASCA ENCIAS qty=25, MOÑOS qty=15
- 5,312 negative rows with -20,139 units (deficit balance)
- **Verdict: This is Bodega Caldas operational inventory, not Carlos Villa's sample bag.**

### Case 3: RASCA ENCIAS HC0213035, "maleta" qty=25

- PIL: 5 variant rows in warehouseId=39, each qty 4-7, total 25
- warehouseId=39 = BODEGA CALDAS
- Admin confirms max 1 unit per ref in a maleta
- **Verdict: Not a maleta quantity. Operational inventory of Caldas warehouse.**

### Case 4: Orlando and Fredy showing empty

- PIL warehouseId=35 and 40 have no rows at all
- ka_nl_bodega 35 and 40 don't correspond to any SAG bodega
- Real vendor bodegas are ka_nl_bodega 45 (Orlando) and 50 (Fredy)
- ka_nl_bodega 45 has 1 row (negative), 50 has 2 rows (negative)
- **Verdict: Correct — no data. But for the wrong reason (wrong warehouseId).**

### Case 5: Nestor showing empty

- PIL warehouseId=38 = PLAN SEPARE (354 rows, all negative)
- Real Nestor bodega = ka_nl_bodega 48 = 0 PIL rows
- **Verdict: Both wrong bodega AND correct bodega have no positive data.**

---

## FASE 5 — Importacion

All data currently shown in Maletas is actually from import bodegas:

- B36 (ka_nl=36 = IMPORTACION PARTE 2): 84 refs, 49K units — all productLine=5
- B37 (ka_nl=37 = IMPORTACION PARTE 1): 106 refs, 33K units — all productLine=5
- B39 (ka_nl=39 = BODEGA CALDAS): mixed, but top items are imports

The "PRODUCCION" state on import items (e.g., RASCA ENCIAS, central=0) is doubly wrong:
1. The item is not in a vendor maleta — it's in an import warehouse
2. Import items should never show production suggestions

---

## FASE 6 — Historico vs saldo actual

PIL data comes from SAG's signed movement sum:

```sql
SUM(CASE WHEN F.sc_signo_inventario = '+' THEN n_cantidad ELSE -n_cantidad END)
```

This IS the current net balance (not just entries). The negative balances in B38 and B39 confirm this — they represent more outgoing than incoming movements.

**The balance calculation is correct. The bodega identity is wrong.**

Last sync dates:
- B36/B37: Jun 23, 2026 (8 days ago)
- B38: Jun 23, 2026
- B39: Jun 23–Jun 30, 2026

---

## FASE 7 — Bodega ID mapping

### The bug chain

```
SAG query → ka_nl_bodega (internal PK)
    ↓
sag-variants-normalizer.ts: warehouseId = num(row.ka_nl_bodega)
    ↓
sag-inventory-normalizer.ts: warehouseId = String(row.warehouseId)
    ↓
sag-inventory-sync.ts: warehouseId: level.warehouseId, externalRef: level.warehouseCode
    ↓
PIL: warehouseId = "36" (ka_nl_bodega), externalRef = "26" (ss_codigo from lookup)
    ↓
vendor-sample-loader.ts: WHERE warehouseId IN ('35','36','37','38','39','40')
    ↓
WRONG: matches ka_nl_bodega, not ss_codigo
```

**externalRef** in PIL actually stores the correct `ss_codigo` (warehouseCode from lookup maps). But the loader queries `warehouseId`, not `externalRef`.

---

## FASE 8 — Top diferencias

| Vendedor | Bodega real | PIL wh (correcto) | Refs PIL | UI muestra | UI wh (incorrecto) | Bodega que muestra | Refs mostradas | Diagnostico |
|---|---|---|---|---|---|---|---|---|
| Orlando | ka_nl=45 | 45 | 0 pos | vacio | 35 | _(no existe)_ | 0 | Correcto (vacio) pero por razon equivocada |
| Carlos Leon | ka_nl=46 | 46 | 0 | 84 refs, 49K | 36 | IMPORTACION PARTE 2 | 84 | **INCORRECTO: muestra bodega de importacion** |
| Luis | ka_nl=47 | 47 | 0 | 106 refs, 33K | 37 | IMPORTACION PARTE 1 | 106 | **INCORRECTO: muestra bodega de importacion** |
| Nestor | ka_nl=48 | 48 | 0 | vacio | 38 | PLAN SEPARE | 0 | Correcto (vacio) pero identidad equivocada |
| Carlos Villa | ka_nl=49 | 49 | 0 | 253 refs, 884 | 39 | BODEGA CALDAS | 253 | **INCORRECTO: muestra Bodega Caldas** |
| Fredy | ka_nl=50 | 50 | 0 neg | vacio | 40 | _(no existe)_ | 0 | Correcto (vacio) pero por razon equivocada |

---

## FASE 9 — Hallazgo adicional: max 1 unidad por referencia

Administracion confirma: maletas contienen max 1 unidad por referencia (son muestras).

PIL data contradice esto totalmente:

| Bodega mostrada | Max qty per variant | Max qty per SKU | Interpretacion |
|---|---|---|---|
| B36 "Carlos Leon" | 1,440 | 1,440 | Inventario mayorista import |
| B37 "Luis" | 2,000 | 2,000 | Inventario mayorista import |
| B39 "Carlos Villa" | 12 | 25 | Inventario operativo Caldas |

**Incluso si corregimos el mapping, PIL no registra "presencia en maleta" sino "saldo de bodega".**

Para maletas con max 1 unidad/referencia, se necesita una fuente diferente o transformacion a presencia binaria.

---

## FASE 10 — Recomendaciones

### P0: CRITICO — Correccion del mapping de bodegas (INMEDIATO)

En `vendor-sample-loader.ts`, los warehouseCodes deben ser los `ka_nl_bodega` internos, no los `ss_codigo` externos:

```
ORLANDO:      warehouseCode "45" (no "35")
CARLOS_LEON:  warehouseCode "46" (no "36")
LUIS:          warehouseCode "47" (no "37")
NESTOR:       warehouseCode "48" (no "38")
CARLOS_VILLA: warehouseCode "49" (no "39")
FREDY:         warehouseCode "50" (no "40")
```

**ADVERTENCIA:** Corregir el mapping revelara que las bodegas reales de vendedor tienen 0 datos positivos en PIL. La UI mostrara todos los vendedores vacios.

Esto significa que P0 requiere **tambien** un re-sync de inventario SAG enfocado en bodegas 45-50, o confirmar que SAG realmente tiene 0 saldo en esas bodegas.

### P0.5: Validar saldo SAG real para bodegas de vendedor

Antes de corregir el mapping, ejecutar query SAG directa:

```sql
SELECT ka_nl_bodega, k_sc_codigo_articulo, SUM(...) AS saldo
FROM MOVIMIENTOS_ITEMS MI ...
WHERE MI.ka_nl_bodega IN (45,46,47,48,49,50)
GROUP BY ...
HAVING saldo <> 0
```

Esto determinara si los vendedores realmente tienen saldo en SAG o si la administradora se refiere a otro concepto de "maleta".

### P1: Estados separados para IMPORT

- IMPORT nunca genera PRODUCCION
- IMPORT con central agotado → estado RECOMPRA o IMPORT_AGOTADO
- Crear SampleState adicional o separar la logica por linea

### P2: Modelo de presencia de maleta

Si admin confirma max 1 unidad:
- quantityInBag no es "unidades fisicas en maleta"
- Es "saldo neto de bodega de vendedor"
- Para la UI, transformar a presencia binaria: `isInBag = quantity > 0`
- Mostrar "En maleta" / "No en maleta" en lugar de cantidades

### P3: Ledger historico de muestras

- Trackear cuando una referencia se agrego/retiro de cada maleta
- Calcular dias desde asignacion
- Detectar muestras estancadas

---

## Archivos auditados (sin modificaciones)

| Archivo | Rol |
|---|---|
| `lib/comercial/maletas/vendor-sample-loader.ts` | Loader que query PIL con warehouseId incorrecto |
| `lib/connectors/adapters/sag-pya-soap/catalog/sag-variants-normalizer.ts` | Normaliza ka_nl_bodega como warehouseId |
| `lib/connectors/adapters/sag-pya-soap/inventory/sag-inventory-normalizer.ts` | Pasa warehouseId = String(ka_nl_bodega) |
| `lib/connectors/adapters/sag-pya-soap/inventory/sag-inventory-sync.ts` | Escribe PIL con warehouseId = ka_nl_bodega |
| `lib/logistics/catalogs/castillitos-bodega-mapping.ts` | Mapping confirmado: vendor bodegas son ka_nl=45-50 |
| `lib/connectors/adapters/sag-pya-soap/catalog/sag-variants-types.ts` | Query SAG que calcula saldo desde MOVIMIENTOS_ITEMS |
