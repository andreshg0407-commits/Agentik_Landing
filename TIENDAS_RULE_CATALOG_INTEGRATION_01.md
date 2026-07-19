# TIENDAS-RULE-CATALOG-INTEGRATION-01

**Status:** COMPLETE
**TSC:** 160 (baseline preserved)
**Validation:** 44/44 PASS

---

## Problema

El formulario de reglas de surtido permitia escribir linea y subgrupo como texto libre. Esto generaba reglas que no coincidian con datos reales del producto, produciendo cero matches en el motor de faltantes/sugerencias.

---

## Solucion

### 1. Catalog service

Nuevo archivo: `lib/comercial/tiendas/store-rule-catalog.ts`

Funciones:
- `buildRuleCatalog(allInventory)` — extrae lineas, subgrupos por linea, clases de producto y tamanos comerciales reales desde inventario sincronizado
- `normalizeValue(raw)` — normaliza a valor estable (`"Latin Kids"` → `"latin_kids"`)
- `validateRuleAgainstCatalog(catalog, rule)` — valida que linea existe, subgrupo pertenece a linea, clase y tamano existen

Tipos:
- `CatalogEntry` — `{ value: string; label: string }`
- `StoreRuleCatalog` — `{ lines, subgroupsByLine, productClasses, sizeClasses }`
- `CatalogValidationResult` — `{ valid: boolean; errors: string[] }`

### 2. Service integration

`getStoreRuleCatalog(orgId)` en `store-replenishment-service.ts`:
- Reutiliza `resolveData()` (inventario ya cacheado)
- Cache propio TTL 5 minutos (`TTL_CATALOG`)
- No agrega queries adicionales

### 3. API

Action `rule_catalog` en `/api/orgs/[orgSlug]/comercial/tiendas/policies`:

```json
{
  "lines": [{ "value": "latin_kids", "label": "Latin Kids" }],
  "subgroupsByLine": {
    "latin_kids": [{ "value": "camisetas", "label": "Camisetas" }]
  },
  "productClasses": [{ "value": "textile", "label": "Textil" }],
  "sizeClasses": [{ "value": "small", "label": "Pequeno" }]
}
```

Action `add_rule` ahora valida contra catalogo antes de guardar. Si la validacion falla, retorna error 400.

### 4. UI

| Antes | Despues |
|---|---|
| `<input>` texto libre para linea | `<select>` con lineas del catalogo |
| `<input>` texto libre para subgrupo | `<select>` dependiente de linea seleccionada |
| Sin validacion visual | Select deshabilitado si no hay linea |
| Sin estado vacio | "No se encontraron lineas/subgrupos sincronizados desde SAG" |

Comportamiento:
- Al cambiar linea, subgrupo se resetea
- Subgrupo `disabled` hasta seleccionar linea (scope `line_subgroup`)
- Clase de producto desde catalogo (muestra solo clases con inventario activo)
- Loading: "Cargando catalogo de productos..."
- Catalogo se carga solo al abrir form (lazy)

### 5. Normalizacion

Cada `CatalogEntry` tiene:
- `label` — nombre visible tal como viene de SAG
- `value` — normalizado: minusculas, sin acentos, espacios → underscore

El formulario guarda el `label` en la regla (para display), y el motor de matching usa el valor tal cual.

---

## Archivos nuevos

| Archivo | Proposito |
|---|---|
| `lib/comercial/tiendas/store-rule-catalog.ts` | Catalog builder, normalizer, validator |
| `scripts/validate-tiendas-rule-catalog-integration.ts` | 44 structural checks |

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `lib/comercial/tiendas/store-replenishment-service.ts` | `getStoreRuleCatalog()`, `TTL_CATALOG` |
| `app/api/orgs/[orgSlug]/comercial/tiendas/policies/route.ts` | `rule_catalog` action, catalog validation on `add_rule` |
| `app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx` | `RuleCatalog` type, `PolicyTab` loads catalog, `AddPolicyRuleForm` uses selects, empty/loading states |

---

## Validaciones

```
=== Results: 44 PASS / 0 FAIL / 44 TOTAL ===
```

Validaciones previas:
- validate-tiendas-performance-load: 52/52 PASS
- validate-tiendas-textile-size-color-coverage: 55/55 PASS
