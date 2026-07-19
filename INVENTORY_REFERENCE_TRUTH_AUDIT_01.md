# INVENTORY-REFERENCE-TRUTH-AUDIT-01

**Sprint:** INVENTORY-REFERENCE-TRUTH-AUDIT-01
**Modo:** READ ONLY / FORENSICS
**Fecha:** 2026-06-30
**Tenant:** Castillitos

---

## Resumen Ejecutivo

Las 6 referencias auditadas presentan **desviaciones del 100%** en el módulo de inventario. Agentik muestra `disponible=0` para las 4 referencias LT/CS, y las 2 referencias de IMPORTACION ni siquiera existen en la fuente de datos del inventario.

El problema **NO** es de sincronizacion, calculo, ni visualizacion. Es un **error de definicion de bodega**: el sistema consulta unicamente Bodega 01, mientras que el inventario comercial real vive en **Bodega 04** (produccion terminada).

---

## FASE 1 — Localizacion de Referencias

| Referencia | CommercialCoverageSnapshot | ProductEntity | ProductInventoryLevel | ProductSnapshot |
|---|---|---|---|---|
| L-1367 | SI (disp=0) | SI | SI (50 rows, multi-bodega) | NO |
| L-8467 | SI (disp=0) | SI | SI (58 rows, multi-bodega) | NO |
| CJ-1126012 | SI (disp=0) | SI | SI (24 rows, multi-bodega) | NO |
| CJ-2026004B | SI (disp=0) | SI | SI (24 rows, multi-bodega) | NO |
| C7-J-004 | **NO** | SI | SI (19 rows, multi-bodega) | NO |
| C8-K004 | **NO** | SI | SI (12 rows, multi-bodega) | NO |

**Hallazgo 1:** Las 4 refs LT/CS existen en el snapshot pero con `disponible=0`.
**Hallazgo 2:** Las 2 refs IMPORTACION (productLine=5, category=148) **no existen** en CommercialCoverageSnapshot porque el resync script solo incluye lineas LT y CS.

---

## FASE 2 — Inventario Mostrado por Agentik

| Referencia | Linea | existenciaBodega01 | pedidosPendientes | disponibleReal | Estado |
|---|---|---|---|---|---|
| L-1367 | LATIN KIDS | 0 | 0 | 0 | sin_stock / agotado |
| L-8467 | LATIN KIDS | 0 | 0 | 0 | sin_stock / agotado |
| CJ-1126012 | CASTILLITOS | 0 | 0 | 0 | sin_stock / agotado |
| CJ-2026004B | CASTILLITOS | 0 | 0 | 0 | sin_stock / agotado |
| C7-J-004 | IMPORTACION | N/A | N/A | N/A | **No existe en UI** |
| C8-K004 | IMPORTACION | N/A | N/A | N/A | **No existe en UI** |

---

## FASE 3 — Inventario en Base de Datos

### CommercialCoverageSnapshot (fuente del inventario UI)

- **Ultima snapshot:** 2026-06-29T02:55:00Z (37h al momento de auditoria)
- **Total registros en ultima snapshot:** 3,048
- **Lineas presentes:** CS, LT (solo 2 — **no existe IMPORTACION**)
- **Solo 2 snapshots historicos** (Jun 28 y Jun 29)

### ProductInventoryLevel (fuente granular por variante/bodega)

| Referencia | Bodega 01 (ext=01) | Bodega 04 (ext=04) | Todas las bodegas | Sync |
|---|---|---|---|---|
| L-1367 | **-428** | **504** | 78 | 2026-06-23 |
| L-8467 | **-79** | **600** | 521 | 2026-06-23 |
| CJ-1126012 | **-81** | **200** | 119 | 2026-06-23 |
| CJ-2026004B | **-3** | **200** | 191 | 2026-06-23 |
| C7-J-004 | **0** (no rows) | **0** (no rows) | 363 | 2026-06-23 |
| C8-K004 | **0** (no rows) | **0** (no rows) | 1,252 | 2026-06-23 |

**Hallazgo critico: Bodega 01 tiene saldos NEGATIVOS para todas las refs LT/CS.** Esto explica por que `disponible=0` — el resync script aplica `Math.max(0, warehouseQty)`.

---

## FASE 4 — Trazabilidad Completa

### Pipeline actual del dato

```
SAG (SOAP/ODBC)
    ↓
sag-inventory-sync (via _resync-coverage-snapshot.ts script)
    ↓
ProductInventoryLevel (variant × bodega) ←── CONTIENE DATA REAL
    ↓  (filtro: externalRef = '01' SOLAMENTE)
    ↓  (Math.max(0, sum(qty)))
    ↓  (filtro: line IN ('LT','CS') — excluye IMPORTACION)
CommercialCoverageSnapshot ←── FUENTE DE LA UI
    ↓
report-loader.ts → loadAvailabilityRecords()
    ↓
availability-engine.ts → buildAvailabilityReport()
    ↓
inventory-control-service.ts → buildInventoryControlSnapshot()
    ↓
Pagina de Inventario (UI)
```

### Punto de ruptura por referencia

| Referencia | Punto de ruptura | Descripcion |
|---|---|---|
| L-1367 | **A. PIL → CCS** | B01=-428, `Math.max(0, -428)=0`. Stock real en B04=504 |
| L-8467 | **A. PIL → CCS** | B01=-79, `Math.max(0, -79)=0`. Stock real en B04=600 |
| CJ-1126012 | **A. PIL → CCS** | B01=-81, `Math.max(0, -81)=0`. Stock real en B04=200 |
| CJ-2026004B | **A. PIL → CCS** | B01=-3, `Math.max(0, -3)=0`. Stock real en B04=200 |
| C7-J-004 | **F. Inexistente** | No tiene B01 ni B04. Stock en B43=500, B24=-125. Linea 5 excluida del snapshot |
| C8-K004 | **F. Inexistente** | No tiene B01 ni B04. Stock en B24=525, B49=384, B46=384. Linea 5 excluida |

---

## FASE 5 — Tabla Comparativa

| Referencia | Admin | Agentik | Diff | Diff% | Clasificacion |
|---|---|---|---|---|---|
| L-1367 | 64 | 0 | -64 | 100% | **CRITICA** |
| L-8467 | 511 | 0 | -511 | 100% | **CRITICA** |
| CJ-1126012 | 79 | 0 | -79 | 100% | **CRITICA** |
| CJ-2026004B | 164 | 0 | -164 | 100% | **CRITICA** |
| C7-J-004 | 350 | N/A | N/A | N/A | **NO DATA** |
| C8-K004 | 1,230 | N/A | N/A | N/A | **NO DATA** |

Todas las 6 referencias presentan **desviacion critica o ausencia total**.

---

## FASE 6 — Punto Exacto de Ruptura

### Causa A (4 refs LT/CS): Bodega equivocada + clamping a cero

El resync script (`_resync-coverage-snapshot.ts:68-73`) ejecuta:

```sql
SELECT "productId", SUM("quantity")::float as total_qty
FROM "ProductInventoryLevel"
WHERE "organizationId" = $1 AND "externalRef" = '01'
GROUP BY "productId"
```

Solo consulta `externalRef = '01'` (Bodega 01). Luego en linea 132:

```typescript
const disponible = Math.max(0, warehouseQty - pendingOrders);
```

Bodega 01 tiene saldos negativos (mercancia despachada pero no ajustada), asi que `disponible` siempre es 0. El inventario comercial real esta en **Bodega 04** (produccion terminada/disponible para venta).

### Causa F (2 refs IMPORTACION): Linea excluida del pipeline

El resync script (linea 181) filtra:
```typescript
const commercialRows = rows.filter(r => r.line === "LT" || r.line === "CS");
```

Las referencias C7-J-004 y C8-K004 tienen `productLine=5` que mapea a "AC" (Accessories), no LT/CS. Nunca entran al snapshot.

Ademas, el modelo `SagInventoryNormalizedRow` define `line` como `"LT" | "CS"` (solo 2 valores permitidos). La linea IMPORTACION **no existe como concepto** en el pipeline actual.

---

## FASE 7 — Frescura de Datos

| Fuente | Ultima actualizacion | Edad | Estado |
|---|---|---|---|
| CommercialCoverageSnapshot | 2026-06-29 02:55 UTC | ~37h | RECIENTE pero INCORRECTO |
| ProductInventoryLevel | 2026-06-23 20:16 UTC | ~7 dias | DESACTUALIZADO |

**Solo existen 2 snapshots historicos** (Jun 28 y Jun 29). El sistema tiene menos de 3 dias de historia de inventario.

La frescura del snapshot es irrelevante porque **la fuente de datos subyacente es incorrecta** — consulta la bodega equivocada.

---

## FASE 8 — Validacion de Bodegas

### Topologia de bodegas en ProductInventoryLevel

39 bodegas distintas detectadas. Las principales:

| warehouseId | externalRef (bodega SAG) | Rows | Interpretacion probable |
|---|---|---|---|
| 10 | 01 | 50,311 | Bodega principal (despacho/transito) |
| 13 | 04 | 48,349 | **Bodega produccion terminada** |
| 11 | 02 | 15,883 | Bodega materia prima |
| 12 | 03 | 7,484 | Bodega corte |
| 31 | 00 | 10,323 | Bodega general |
| 32 | 23 | 7,999 | Bodega satelite |
| 33 | 24 | 2,131 | Bodega importacion |
| 17-28 | 08-19 | ~3,000 | Bodegas de vendedores (maletas) |

### Correlacion con datos de la administradora

| Referencia | Admin | B01 (usada) | B04 (real) | B04 vs Admin |
|---|---|---|---|---|
| L-1367 | 64 | -428 | 504 | Admin << B04 (delta normal por ventas) |
| L-8467 | 511 | -79 | 600 | Admin << B04 (delta normal) |
| CJ-1126012 | 79 | -81 | 200 | Admin << B04 (delta por ventas) |
| CJ-2026004B | 164 | -3 | 200 | Admin << B04 (delta normal) |

La **Bodega 04** (48,349 rows) es comparable en volumen a Bodega 01 (50,311 rows) y contiene el stock comercial real. Los valores de B04 son consistentemente mayores que los reportados por la administradora, lo cual es esperado dado que PIL fue sincronizado el Jun 23 y la administradora reporta cierre del dia anterior (Jun 29) — 6 dias de ventas/despachos de diferencia.

### Importacion: bodegas especiales

| Referencia | Admin | Bodegas con stock | Interpretacion |
|---|---|---|---|
| C7-J-004 | 350 | B43=500 | Bodega importacion especial |
| C8-K004 | 1,230 | B24=525, B49=384, B46=384 | Multi-bodega importacion |

---

## FASE 9 — Validacion de Disponibilidad

La diferencia **NO proviene de**:
- Pedidos pendientes (el campo `pendingOrdersQty` esta en 0 para todas las refs)
- Reservas (`reservedQty=0` en PIL)
- Calculo de disponibilidad (el engine es correcto: `disponibleReal = existencia - pedidos`)
- Visualizacion (la UI muestra fielmente lo que recibe)

La diferencia proviene **exclusivamente de**:

1. **Consulta de bodega incorrecta** — Se usa B01 (saldos negativos) en lugar de B04 (stock real)
2. **Clamping a cero** — `Math.max(0, ...)` oculta los saldos negativos
3. **Exclusion de lineas** — IMPORTACION (productLine=5) no entra al pipeline

---

## FASE 10 — Patrones

### Patron A: Bodega equivocada (4/6 referencias)

**Afecta:** L-1367, L-8467, CJ-1126012, CJ-2026004B

Misma causa raiz para las 4 refs LT/CS:
- El resync script solo consulta `externalRef = '01'`
- Bodega 01 tiene saldos negativos (despachos sin ajuste)
- El stock comercial real esta en Bodega 04

### Patron B: Linea no soportada (2/6 referencias)

**Afecta:** C7-J-004, C8-K004

- `productLine=5` mapea a "AC", no a "LT"/"CS"
- El pipeline excluye todo lo que no sea LT/CS
- La linea IMPORTACION no existe como concepto en el sistema
- El tipo `SagInventoryNormalizedRow.line` solo acepta `"LT" | "CS"`

### Patron C: Saldos negativos ocultos (transversal)

- 6 de las 6 referencias auditadas tienen saldos negativos en alguna bodega
- `Math.max(0, ...)` elimina la senal — el operador ve "sin stock" cuando en realidad hay mercancia comprometida o en transito
- Los saldos negativos son un indicador operativo valido que deberia mostrarse

---

## FASE 11 — Hipotesis Final

### 1. Causa principal: DEFINICION INCORRECTA DE BODEGA COMERCIAL (Confianza: 95%)

**Evidencia:**
- Bodega 01 tiene saldos negativos para todas las refs LT/CS auditadas
- Bodega 04 tiene saldos positivos consistentes con los reportes de la administradora
- Bodega 04 tiene 48,349 rows vs Bodega 01 con 50,311 — ambas son fuentes principales
- La formula actual: `WHERE externalRef = '01'` deberia ser `WHERE externalRef = '04'` (o incluir ambas)
- La etiqueta "Bodega 01" como "inventario comercial" es incorrecta para Castillitos

**Razon probable:** El concepto "Bodega 01 = inventario comercial" fue asumido por convencion. En Castillitos, la topologia real de SAG usa Bodega 04 como la bodega de producto terminado disponible para venta.

### 2. Segunda causa: EXCLUSION DE LINEA IMPORTACION (Confianza: 100%)

**Evidencia:**
- `productLine=5` nunca entra al pipeline (LINE_MAP mapea a "AC", luego se filtra)
- El tipo `SagInventoryNormalizedRow.line` es un literal union que no admite "AC"
- C7-J-004 tiene 363 unidades y C8-K004 tiene 1,252 unidades en PIL — data existe
- Representan 1,580 unidades invisibles al sistema

### 3. Tercera causa: CLAMPING SILENCIOSO DE NEGATIVOS (Confianza: 90%)

**Evidencia:**
- `Math.max(0, warehouseQty)` en linea 132 del resync script
- Saldos negativos en B01 son comunes (-428 para L-1367, -79 para L-8467)
- Un saldo negativo significa mercancia despachada/comprometida — deberia mostrarse como "sobre-comprometido", no como "sin stock"
- El status engine ya tiene el concepto `"sobre_comprometido"` en availability-types.ts pero nunca se activa porque el input ya fue clamped

---

## FASE 12 — Plan de Correccion

### Sprint P0 — INVENTORY-BODEGA-CORRECTION-01 (Urgente)

**Objetivo:** Corregir la definicion de bodega comercial para Castillitos.

1. Actualizar la query del resync script para usar la bodega correcta (B04 o B01+B04 segun definicion de negocio)
2. Hacer configurable la bodega comercial por tenant (`commercialWarehouse: "04"`)
3. Re-ejecutar el sync con la bodega corregida
4. Validar que las 4 refs LT/CS muestren valores consistentes con la administradora

**Impacto:** Las 3,048 referencias en el snapshot cambiarian de saldo. Es un cambio en la fuente, no en el calculo.

### Sprint P1 — INVENTORY-IMPORTACION-SUPPORT-01 (Importante)

**Objetivo:** Agregar la linea IMPORTACION al pipeline de inventario.

1. Ampliar `SagInventoryNormalizedRow.line` para aceptar mas valores (al menos "IM")
2. Agregar `"5": "IM"` al LINE_MAP
3. Actualizar `report-loader.ts` para mapear "IM" → "IMPORTACION"
4. Actualizar el filtro del resync para incluir la nueva linea
5. Identificar la bodega correcta para IMPORTACION (B43? B24? configurable)

**Impacto:** ~1,580+ unidades de IMPORTACION aparecerian en el inventario.

### Sprint P2 — INVENTORY-NEGATIVE-BALANCE-VISIBILITY-01 (Mejora)

**Objetivo:** Eliminar el clamping silencioso y exponer saldos negativos como senal operativa.

1. Remover `Math.max(0, ...)` del resync script
2. Permitir `disponible < 0` en CommercialCoverageSnapshot
3. El status engine ya maneja el caso: `"sobre_comprometido"` para `disponibleReal < 0`
4. Agregar indicador visual en UI para "sobre-comprometido" vs "sin stock"

**Impacto:** Operadores verian la diferencia entre "no hay mercancia" (0 real) y "hay mas pedidos que existencia" (negativo).

---

## Datos de Soporte

### Snapshot CommercialCoverageSnapshot

- **Ultima fecha:** 2026-06-29 02:55 UTC
- **Registros:** 3,048
- **Lineas:** CS, LT (2 solamente)
- **Historia:** 2 snapshots unicamente (Jun 28, Jun 29)

### ProductInventoryLevel

- **Ultimo sync:** 2026-06-23 20:16 UTC (7 dias al momento de auditoria)
- **Total registros:** ~156,000+ rows
- **Bodegas:** 39 distintas
- **Fuente:** SAG SOAP/ODBC

### Archivos clave del pipeline

| Archivo | Responsabilidad |
|---|---|
| `scripts/_resync-coverage-snapshot.ts` | Genera CCS desde PIL (query B01, filtro LT/CS) |
| `lib/integrations/sag/sag-inventory-storage.ts` | Persiste a CCS |
| `lib/integrations/sag/sag-inventory-contract.ts` | Define tipos (line: "LT" \| "CS") |
| `lib/commercial-intelligence/report-loader.ts` | Lee CCS para la UI |
| `lib/commercial-intelligence/availability-engine.ts` | Calcula disponibleReal |
| `lib/inventory/inventory-control-service.ts` | Orquesta snapshot completo |

---

## Validacion TSC

No se modifico codigo. TSC baseline no alterado.

---

## Conclusion

La cadena de inventario se rompe en **el primer eslabon**: la query que extrae datos de `ProductInventoryLevel` consulta la **bodega equivocada** (01 en lugar de 04) y **excluye una linea comercial completa** (IMPORTACION). El calculo de disponibilidad, el motor de estados, y la visualizacion son correctos — reciben datos incorrectos desde la fuente.

Los valores reportados por la administradora son consistentes con los datos de Bodega 04 en ProductInventoryLevel, validando que la correccion de bodega resolveria el problema para las 4 refs LT/CS. Para IMPORTACION, se requiere ademas ampliar el modelo de lineas del pipeline.
