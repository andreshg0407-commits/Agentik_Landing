# TIENDAS-TEXTILE-SIZE-COLOR-COVERAGE-01

**Status:** COMPLETE
**TSC:** 160 (baseline preserved)
**Validation:** 55/55 PASS

---

## Cambio fundamental

Antes:

> "Pijama larga nino esta cubierto."

Porque tenia inventario activo en el subgrupo.

Despues:

> "Pijama larga nino tiene cobertura incompleta."
> "Faltan talla 2 azul, talla 4 rojo y talla 6 azul."
> "Candidatos disponibles en bodega principal: Ref ABC talla 2 azul (5 uds)."

El cliente final no compra un subgrupo. Compra talla + color.

---

## Definicion de cobertura textil

### Formula

```
overallCoveragePercent = (sizeCoveragePercent + colorCoveragePercent) / 2
```

### Calculo de tallas

1. Resolver tallas esperadas: todas las tallas activas (currentUnits > 0) del subgrupo en TODO el inventario de la organizacion (catalogo)
2. Contar tallas cubiertas: tallas del catalogo presentes con stock activo en la tienda
3. sizeCoveragePercent = coveredSizes / expectedSizes * 100

### Calculo de colores

1. Resolver colores esperados: todos los colores activos del subgrupo en el catalogo
2. Contar colores cubiertos: colores del catalogo presentes con stock activo en la tienda
3. colorCoveragePercent = coveredColors / expectedColors * 100

### Ejemplo

```
Catalogo subgrupo "Pijama larga nino":
  Tallas: 2, 4, 6, 8, 10, 12
  Colores: Azul, Rojo, Verde, Negro

Tienda San Diego:
  Tallas presentes: 8, 10, 12
  Colores presentes: Azul, Negro

Resultado:
  Tallas: 3/6 = 50%
  Colores: 2/4 = 50%
  Global: (50 + 50) / 2 = 50%
  Severidad: critica (< 50%)

Huecos detectados:
  Talla 2 / Azul → 0 uds → candidato Ref ABC en bodega (5 uds)
  Talla 2 / Rojo → 0 uds → sin candidato exacto, Ref DEF misma talla
  Talla 4 / Azul → 0 uds → candidato Ref GHI en bodega (3 uds)
  ...
```

---

## Deteccion de huecos (gaps)

Un gap existe cuando el catalogo tiene una combinacion talla+color pero la tienda tiene 0 unidades activas para esa combinacion.

Para cada gap se buscan candidatos en bodega principal con prioridad:

| Prioridad | Criterio | Badge UI |
|---|---|---|
| 1 | Mismo subgrupo + misma talla + mismo color | Exacto |
| 2 | Mismo subgrupo + misma talla | Misma talla |
| 3 | Mismo subgrupo | Mismo subgrupo |

Maximo 5 candidatos por gap, ordenados por disponibilidad.

---

## Severidad

| Rango | Severidad |
|---|---|
| < 50% | Critica |
| 50% - 70% | Alta |
| 70% - 85% | Media |
| 85% - 95% | Baja |
| >= 95% | Saludable |

---

## Performance (FASE 14)

La cobertura textil NO se calcula en el dashboard de todas las tiendas.
Se calcula unicamente en `getStoreDetail()` — al abrir el drawer de una tienda.
Esto evita N+1 y queries masivas.

---

## Sin reglas (FASE 13)

Si la tienda no tiene reglas:
- `computeTextileCoverage` retorna `[]`
- UI muestra empty state: "Sin reglas de surtido configuradas"
- No se generan gaps, sugerencias ni KPIs operativos

---

## Archivos nuevos

| Archivo | Proposito |
|---|---|
| `lib/comercial/tiendas/textile-coverage-engine.ts` | Motor de cobertura textil: size/color resolution, coverage computation, gap detection, candidate search |
| `scripts/validate-tiendas-textile-size-color-coverage.ts` | 55 checks de validacion |

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `lib/comercial/tiendas/assortment-types.ts` | Nuevos tipos: TextileCoverageAnalysis, TextileCoverageGap, TextileCoverageCandidate, TextileCoverageGapSeverity. AssortmentCandidate ahora tiene size?/color? |
| `lib/comercial/tiendas/store-replenishment-types.ts` | StoreDetailData.textileCoverage? agregado |
| `lib/comercial/tiendas/store-replenishment-service.ts` | getStoreDetail computa textileCoverage |
| `app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx` | Nuevo tab "Cobertura textil", KPI "Talla/color" en drawer, TextileCoverageTab con gaps+candidatos |

---

## UI

### KPI en drawer

Nuevo MiniStat:
- Label: "Talla/color"
- Valor: `overallPercent%`
- Color: verde (>=85%) / ambar (>=70%) / rojo (<70%)

### Tab "Cobertura textil"

1. Strip KPI global: cobertura global %, tallas %, colores %, huecos
2. Tarjeta por subgrupo: badge de severidad, tallas cubiertas/esperadas, colores cubiertos/esperados
3. Tallas faltantes (texto rojo)
4. Colores faltantes (texto rojo)
5. Huecos de surtido: talla X / color Y → 0 uds, con candidatos de bodega principal
6. Cada candidato muestra: referencia, producto, talla/color, badge de match level (Exacto/Misma talla/Mismo subgrupo), unidades disponibles

---

## Limitaciones

- El catalogo se resuelve desde inventario activo de todas las tiendas — no hay catalogo maestro externo
- No diferencia entre tallas por genero (nino/nina) a menos que el subgrupo ya lo separe
- Los huecos se limitan a 10 visibles por subgrupo en UI (con indicador de "N adicionales")
- No genera propuestas automaticas de transferencia desde esta vista (se usa la vista de sugerencias existente)

---

## Validaciones

```
=== Results: 55 PASS / 0 FAIL / 55 TOTAL ===
```

Validaciones previas:
- validate-tiendas-ruleless-mode: 21/21 PASS
- validate-tiendas-assortment-rules-engine: 45/45 PASS
