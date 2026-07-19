# TIENDAS-ASSORTMENT-RULES-ENGINE-01

**Status:** COMPLETE
**TSC:** 160 (baseline preserved)
**Validation:** 45/45 PASS

---

## Cambio fundamental

Antes: Tiendas evaluaba por referencia individual.
> "Falta referencia 312A. Programar produccion."

Ahora: Tiendas evalua por subgrupo (textil) y por tamano comercial (accesorios).
> "San Diego necesita mejorar cobertura de Pijama corta. Hay 5 candidatos disponibles en bodega principal."
> "San Diego necesita accesorios grandes. Hay 3 candidatos disponibles en bodega principal."

---

## Logica textil (por subgrupo)

**Regla:** `TextileSubgroupRule`

| Campo | Descripcion |
|---|---|
| subgroup | Subgrupo SAG (ej: PIJAMA CORTA) |
| line | Linea (opcional, ej: LATIN BABY) |
| minActiveReferences | Minimo de referencias activas (ej: 2) |
| idealActiveReferences | Ideal de referencias activas (ej: 4) |

**Evaluacion:**
1. Contar referencias distintas con `currentUnits > 0` en el subgrupo
2. Comparar con umbrales del regla
3. Si `actual < minimo` → status = `out` o `low`
4. Buscar candidatos en bodega principal del mismo subgrupo

**Ejemplo:**
```
Regla: Pijama corta, min=2, ideal=4
Inventario: 1 referencia activa
Resultado: status=low, faltan=3 referencias
Candidatos: CJ-123 (5 uds), CJ-456 (3 uds), CJ-789 (2 uds)
```

---

## Logica accesorios/importacion (por tamano)

**Regla:** `AccessorySizeRule`

| Campo | Descripcion |
|---|---|
| productClass | textile/bulky/accessory/other |
| sizeClass | small/medium/large/oversized |
| minUnits | Minimo de unidades |
| idealUnits | Ideal de unidades |

**Evaluacion:**
1. Contar unidades totales del sizeClass en la tienda
2. Comparar con umbrales
3. Buscar candidatos del mismo sizeClass en bodega principal

**Inferencia de sizeClass:**
- Cunas, coches → large
- Muebles, exhibidores → oversized
- Sillas, corrales → large
- Bolsos, biberones → small
- Maletas → medium
- Default → medium

---

## Produccion eliminada

| Antes | Ahora |
|---|---|
| "Programar produccion de X uds" | "Sin disponibilidad en bodega principal. Escalar a planeacion." |
| "Enviar X y producir Y uds" | "Enviar X uds. Y uds sin disponibilidad en bodega principal." |
| David: "sugerir traslados y produccion" | David: "sugerir traslados desde bodega principal" |

---

## Seleccion de candidatos

Para cada necesidad se buscan hasta 5 candidatos de bodega principal:

**Textil:**
- Mismo subgrupo (y linea si la regla la especifica)
- Referencia NO ya presente en la tienda
- Stock neto (available - reserved) > 0
- Ordenados por mayor disponibilidad

**Accesorios:**
- Mismo sizeClass y productClass
- Stock neto > 0
- Ordenados por mayor disponibilidad

---

## Reglas por defecto

Cuando una tienda NO tiene reglas explícitas configuradas, el motor genera reglas por defecto a partir del inventario observado:

| Tipo | Default |
|---|---|
| textile_subgroup | min=2, ideal=4 refs activas por subgrupo observado |
| accessory_size (small) | min=1, ideal=2 uds |
| accessory_size (bulky) | min=1, ideal=1 uds |

---

## UI

### Faltantes tab
- Si hay `assortmentNeeds`: muestra tarjetas por necesidad (subgrupo/tamano), no por referencia
- Cada tarjeta: status badge, actual/minimo/faltan, mensaje contextual
- Fallback: tabla legacy por referencia

### Sugerencias tab
- Si hay `assortmentNeeds`: muestra tarjetas por necesidad con candidatos de bodega principal
- Cada candidato: referenceCode, productName, unidades disponibles
- Sin candidatos: "Sin disponibilidad en bodega principal. Escalar a planeacion."
- Fallback: sugerencias legacy

---

## Archivos nuevos

| Archivo | Proposito |
|---|---|
| `lib/comercial/tiendas/assortment-types.ts` | Tipos: AssortmentRule, TextileSubgroupRule, AccessorySizeRule, StoreAssortmentNeed, AssortmentCandidate |
| `lib/comercial/tiendas/assortment-engine.ts` | Motor: evaluateStoreAssortment, evaluateTextileSubgroup, evaluateAccessorySize, inferSizeClass, generateDefaultAssortmentRules |
| `scripts/validate-tiendas-assortment-rules-engine.ts` | 45 checks de validacion |

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `lib/comercial/tiendas/store-replenishment-engine.ts` | Mensajes de produccion reemplazados por "sin disponibilidad / escalar a planeacion" |
| `lib/comercial/tiendas/store-replenishment-types.ts` | StoreDetailData.assortmentNeeds? agregado |
| `lib/comercial/tiendas/store-replenishment-service.ts` | getStoreDetail computa assortmentNeeds via evaluateStoreAssortment |
| `app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx` | ShortagesTab + SuggestionsTab: vista assortment-based con candidatos. David signal sin produccion. |

---

## Pendientes

- [ ] Persistir AssortmentRules en DB (hoy se generan defaults desde inventario)
- [ ] UI para crear/editar reglas de surtido por subgrupo y tamano
- [ ] Recompra: escalar necesidades no cubiertas a modulo de compras
- [ ] Conectar con propuestas de transferencia existentes

---

## Validaciones

```
=== Results: 45 PASS / 0 FAIL / 45 TOTAL ===
```
