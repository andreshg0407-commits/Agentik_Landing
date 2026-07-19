# MALETAS-PANEL-ESTADOS-OPERATIVOS-SIMPLIFICADOS-01

Sprint: Simplificar estados operativos de las tarjetas de maleta a solo Agotado y Stock bajo.

## 1. Archivos modificados

### `lib/comercial/maletas/vendor-sample-loader.ts`
- **Linea 206-212**: Corregido `hasCentralAvailability` para importacion.
  - Antes: `coverage != null` (siempre false para accesorios → INSUFFICIENT_DATA)
  - Ahora: `isAccessory ? importAvailability !== undefined : coverage != null`
  - Accesorios con dato real en importAvailMap ahora clasifican correctamente en OUT_OF_STOCK/LOW_STOCK/HEALTHY.
  - Accesorios SIN dato en importAvailMap (undefined) → INSUFFICIENT_DATA (no se interpretan como cero).

### `app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx`
- Removidos chips **Riesgo** y **Escasez** del VendorCard (lineas 2613-2614)
- Removido badge **Score** (DEBIL/BUENA/EXCELENTE/CRITICA) del VendorCard
- Removida barra de acento de score (gradient bar superior)
- Removidas constantes SCORE_COLOR, SCORE_LABEL, SCORE_BG, import MaletaScoreGrade
- Removidos filtros `riesgo_agotamiento` y `accesorios_escasez` del DrawerFilter
- Removido conteo riesgoAgotamiento de stateCounts
- Removido riesgoAgotamientoRefs de refsAtRisk
- Removida rama riesgoAgotamiento del color de disponibilidad
- Removida badge Escasez del ref detail row
- Removidas ramas Escasez y Riesgo del StateBadge
- Simplificado StateBadge: solo acepta `state: SampleState`
- AccessoryScarcityPanel: ahora usa `commercialHealth` en vez de `accessoryScarcityState`
- OperationalImpactCard: atRisk usa `commercialHealth === LOW_STOCK || OUT_OF_STOCK` en vez de `riesgoAgotamiento`
- Linea resumen inline: muestra agotado/stock bajo en vez de riesgo/bajo minimo
- hasIssues: solo evalua outOfStockCommercialRefs + lowStockCommercialRefs

## 2. Logica anterior y nueva

### Agotado (sin cambio en definicion, corregido para importacion)
- **Antes:** `commercialHealth === "OUT_OF_STOCK"` pero accesorios siempre INSUFFICIENT_DATA
- **Ahora:** `commercialHealth === "OUT_OF_STOCK"` con hasCentralAvailability corregido
- Condicion: `centralAvailable <= 0 AND hasCentralAvailability === true`

### Stock bajo (sin cambio en definicion, corregido para importacion)
- **Antes:** `commercialHealth === "LOW_STOCK"` pero accesorios siempre INSUFFICIENT_DATA
- **Ahora:** `commercialHealth === "LOW_STOCK"` con hasCentralAvailability corregido
- Condicion: `0 < centralAvailable <= minimum AND hasCentralAvailability === true`
- Limites: LT=30, CS=20, IMPORT=10

### Riesgo (ELIMINADO)
- **Antes:** `state === "saludable" && centralAvailable <= minimum + RIESGO_BUFFER(10)`
- **Ahora:** No se renderiza. Propiedad `riesgoAgotamiento` sigue existiendo en dominio pero sin uso operativo.

### Escasez (ELIMINADO)
- **Antes:** `isAccessory && centralImportAvailable <= IMPORT_SCARCITY_MINIMUM(10)`
- **Ahora:** No se renderiza. Propiedad `accessoryScarcityState` sigue existiendo en dominio pero sin uso operativo.

### Score DEBIL (ELIMINADO)
- **Antes:** `computeScore()` en `maletas-commercial-intelligence.ts` → grade (excelente/buena/debil/critica) → badge en VendorCard
- **Ahora:** No se renderiza. Funcion `computeScore()` sigue existiendo pero sin consumo en UI.

## 3. Barra de estado (Phase 6)
- **Formula anterior:** green=healthyCommercialRefs, amber=lowStockCommercialRefs, red=outOfStockCommercialRefs. No usaba Riesgo ni Escasez.
- **Formula nueva:** Sin cambio. Ya era correcta.

## 4. Acciones pendientes (Phase 7)
- **Formula:** Basada en `ref.supplyAction` (PRODUCCION_SUGERIDA, RECOMPRA_SUGERIDA, REEMPLAZAR_BODEGA, COMPLETAR_DESDE_OP)
- No usaba Riesgo, Escasez ni Score. Sin cambio necesario.

## 5. Regresion (Phase 8) — Metricas NO modificadas

| Metrica | Estado |
|---|---|
| En maleta | Sin cambio (activeReferenceCount) |
| Salud comercial | Sin cambio (effectiveIdealTotal = 124) |
| Presencia catalogo | Sin cambio (routeCoveragePct = 83%) |
| Maletas activas (exec) | Sin cambio (isActive && totalRefs > 0) |
| Cobertura comercial (exec) | Sin cambio (derrotero-based) |
| Derroteros | Sin cambio |
| Ideales editables | Sin cambio |
| Produccion | Sin cambio |
| Recompra | Sin cambio |
| Oportunidades | Sin cambio |

## 6. Dependencias retiradas

| Concepto | Antes | Ahora |
|---|---|---|
| riesgoAgotamientoRefs | VendorCard chip, stateCounts, refsAtRisk, drawer filter, line stats | Sin uso en UI |
| accessoryScarcityRefs | VendorCard chip, hasIssues, drawer filter, line stats | Sin uso en UI |
| score.grade | VendorCard badge, accent bar, scoreColor/scoreBg | Sin uso en UI |
| SCORE_COLOR/LABEL/BG | VendorCard rendering | Eliminados |
| MaletaScoreGrade import | maletas-client.tsx | Eliminado |

Propiedades de dominio conservadas (no eliminadas del tipo):
- `riesgoAgotamiento` en VendorSampleRef
- `riesgoAgotamientoRefs` en VendorSampleSnapshot
- `accessoryScarcityState` en VendorSampleRef
- `accessoryScarcityRefs` en VendorSampleSnapshot
- `computeScore()` en maletas-commercial-intelligence.ts

Razon: otros modulos o funciones de dominio pueden compilar con estas propiedades. Se marcan como legacy — sin efecto operativo ni visual.

## 7. Validacion visual esperada (Phase 9)

### Nestor / B48
- En maleta: **376** (sin cambio)
- Salud comercial: **124** (sin cambio)
- Presencia catalogo: **83%** (sin cambio)
- Agotado: **valor nuevo** (ahora incluye accesorios con dato conocido y avail=0)
- Stock bajo: **valor nuevo** (ahora incluye accesorios con dato conocido y 0 < avail <= 10)
- Riesgo: **NO debe aparecer**
- Escasez: **NO debe aparecer**
- Score badge: **NO debe aparecer**
- Barra de acento (gradient top): **NO debe aparecer**

### Orlando / B45
- Misma logica aplicada
- Riesgo: **NO debe aparecer**
- Escasez: **NO debe aparecer**
- Score badge: **NO debe aparecer**

### Verificacion de layout
- La tarjeta no debe tener huecos donde estaba el badge de score
- La fila de chips solo muestra [Agotado] y/o [Stock bajo] cuando aplica
- Sin huecos donde estaban [Riesgo] y [Escasez]

## 8. Causa raiz de Escasez 63

**663 refs** identificadas como importacion (productLine=5).
De esas, **186 tienen dato de disponibilidad** en B36+B37.
Las restantes **477 tienen `importAvailMap.get(ref) = undefined`**, pero el loader usaba `?? 0`, tratandolas como `avail=0` → todas clasificaban como escasez.

De las 376 refs de Nestor en B48, ~63 eran accesorios clasificados asi.

Con la correccion:
- Las 477 sin dato real → `importAvailability = undefined` → `hasCentralAvailability = false` → `INSUFFICIENT_DATA` (no aparecen en ningun chip)
- Las 186 con dato → clasifican correctamente por `commercialHealth`
