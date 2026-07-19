# TIENDAS-TEXTILE-ATTRIBUTES-FIX-01

**Status:** COMPLETE
**TSC:** 160 (baseline preserved)
**Validation:** 26/26 PASS

---

## Causa raiz

El adapter de Tiendas leia talla/color desde `ProductVariantAttribute` (tabla relacional), que tiene 0% cobertura para Line 1 y 2% para Line 2.

Los datos reales viven en `ProductVariant.attributes` (columna JSON), con 100% cobertura.

Pedidos ya usaba la fuente correcta. Tiendas no.

---

## Solucion

### Nuevo resolver: `variant-attribute-resolver.ts`

Funcion `resolveVariantSizeColor(variant)` con cadena de prioridad:

1. **`variant.attributes` (JSON)** — `tallaName`/`colorName` → primary
2. **`variant.name`** — parse `"TALLA / COLOR"` → fallback 1
3. **`variant.sku`** — parse `"REF|TALLA|COLOR_CODE"` → fallback 2
4. **`variant.variantAttributes`** — tabla relacional → fallback 3
5. **`SIN_TALLA` / `SIN_COLOR`** — sentinel → ultimo recurso

Cada resultado incluye `source` para trazabilidad.

### Adapter actualizado: `sag-store-adapter.ts`

3 sitios de construccion de `StoreInventoryVariant` actualizados:
- `getStoreInventoryByWarehouse` (line ~271)
- main warehouse availability (line ~397)
- `loadBatchStoreInventory` (line ~615)

Todos ahora usan `resolveVariantSizeColor(lv.variant)` en vez de buscar directamente en `variantAttributes`.

---

## Cobertura antes / despues

### Line 1 — Castillitos (32,037 variantes)

| Metrica | Antes | Despues |
|---|---|---|
| Talla real | 0 (0%) | 32,035 (100%) |
| Color real | 0 (0%) | 32,035 (100%) |
| Fuente | variantAttributes (vacia) | JSON attributes |

### Line 2 — Latin Kids (17,083 variantes)

| Metrica | Antes | Despues |
|---|---|---|
| Talla real | 287 (2%) | 17,082 (100%) |
| Color real | 287 (2%) | 17,082 (100%) |
| Fuente | variantAttributes (2%) | JSON attributes |

### Distribucion por fuente (post-fix)

| Fuente | Line 1 | Line 2 |
|---|---|---|
| json_attributes | 32,035 (100%) | 17,082 (100%) |
| fallback | 2 (0%) | 1 (0%) |

Los 3 fallbacks son variantes bundle/default (`L-TRIO1||`, `L-TRIO2||`, `CA-1071225B-1||`) sin talla/color real — correcto.

---

## Ejemplos reales

```
[json_attributes] L-1085|10|RS2 → size=10, color=ROSA NEON
[json_attributes] L-1085|12|FC2 → size=12, color=FUCSIA
[json_attributes] C-1000112B|0-3|MO1 → size=0-3, color=MORA LECHE
[json_attributes] C-1000112B|0-3|RS6 → size=0-3, color=CAMELIA
[fallback] L-TRIO2|| → size=SIN_TALLA, color=SIN_COLOR (bundle variant)
```

---

## Archivos

### Nuevos

| Archivo | Proposito |
|---|---|
| `lib/comercial/tiendas/variant-attribute-resolver.ts` | Resolver oficial talla/color con cadena de prioridad |
| `scripts/validate-tiendas-textile-attributes-fix.ts` | 26 structural checks |
| `scripts/audit-tiendas-textile-attributes-postfix.ts` | Audit post-fix con datos reales |

### Modificados

| Archivo | Cambio |
|---|---|
| `lib/comercial/tiendas/sag-store-adapter.ts` | 3 sitios: `resolveVariantSizeColor()` reemplaza lectura directa de `variantAttributes` |

---

## Impacto downstream

Con talla/color reales, las siguientes funciones ahora operan con datos completos:

- `inferProductClass()` — deteccion textil por `size !== SIN_TALLA`
- `inferSizeClass()` — clasificacion de tamano comercial
- `buildRuleCatalog()` — variantes con talla+color para reglas
- `textile-coverage-engine` — cobertura de talla/color por referencia
- `store-suggestions-engine` — sugerencias de surtido con variantes especificas

---

## Riesgos pendientes

1. **Normalización de color**: Los codigos SAG (RS2, AZ7) no se usan — se usan los nombres (ROSA NEON, AZUL AGUA). OK para display, pero si se necesita matching exacto, considerar normalizar.

2. **Variantes bundle** (3 de 49,120): No tienen talla/color real. Sentinel `SIN_TALLA`/`SIN_COLOR` es correcto para estas.

3. **Line 5 (accesorios)**: No auditada en este sprint. Algunos accesorios tienen talla/color en JSON (23% segun audit anterior), pero la logica accesorio usa `sizeClass`, no `talla`.
