# TIENDAS-VARIANT-DATA-AUDIT-01

**Status:** COMPLETE
**TSC:** 160 (no code changes)
**Type:** READ-ONLY audit

---

## Objetivo

Determinar con evidencia real donde viven la talla y el color para los productos textiles de Castillitos y Latin Kids. Resolver la contradiccion: Pedidos muestra talla/color pero Tiendas reporta 0% cobertura.

---

## Hallazgo principal

### La talla y el color viven en `ProductVariant.attributes` (columna JSON)

```
ProductVariant.attributes  →  Json?  (Prisma schema line 4014)
```

Formato:

```json
{
  "color": "RS2",
  "talla": "10",
  "colorName": "ROSA NEON",
  "tallaName": "10"
}
```

**Cobertura: 49,120 / 49,120 variantes textiles (100%)**

Cada variante tiene 4 campos:

| Campo | Ejemplo | Descripcion |
|---|---|---|
| `talla` | "10", "2", "0-3", "18-24" | Codigo SAG de talla |
| `tallaName` | "10", "2", "0-3" | Nombre display (= codigo para tallas) |
| `color` | "RS2", "AZ7", "MO1" | Codigo SAG de color |
| `colorName` | "ROSA NEON", "AZUL AGUA", "MORA LECHE" | Nombre display de color |

---

## Causa raiz del problema

### Dos fuentes de datos, una vacia

El modelo `ProductVariant` tiene dos formas de almacenar atributos:

1. **`attributes Json?`** — columna JSON con snapshot de atributos. **100% poblada.**
2. **`variantAttributes ProductVariantAttribute[]`** — tabla relacional. **Casi vacia** (287/49,120 = 0.6% para textiles).

| Fuente | Line 1 talla | Line 1 color | Line 2 talla | Line 2 color |
|---|---|---|---|---|
| `attributes` (JSON) | **100%** | **100%** | **100%** | **100%** |
| `variantAttributes` (tabla) | **0%** | **0%** | 2% | 2% |
| `ProductVariant.name` | 100% | 100% | 100% | 100% |
| `ProductVariant.sku` | 100% | 100% | 100% | 100% |

### Pedidos lee JSON → funciona

```typescript
// lib/comercial/pedidos/order-inventory-service.ts:94
const attrs = parseAttrs(variant.attributes);  // ← JSON column
```

`parseAttrs()` extrae `attrs.talla`, `attrs.tallaName`, `attrs.color`, `attrs.colorName` directamente del JSON.

### Tiendas lee tabla relacional → falla

```typescript
// lib/comercial/tiendas/sag-store-adapter.ts:271-273
const attrs = lv.variant?.variantAttributes ?? [];
const rawSize  = attrs.find(a => a.key === "talla")?.value ?? "";
const rawColor = attrs.find(a => a.key === "color")?.value ?? "";
```

El adapter busca en `variantAttributes` (la tabla relacional). Para Line 1, esta tabla tiene **0 registros**. Para Line 2, solo 287/17,083.

Resultado: `rawSize = ""` → `"SIN_TALLA"`, `rawColor = ""` → `"SIN_COLOR"`.

---

## Evidencia real

### Line 1 — Castillitos (32,037 variantes)

```
sku=L-1085|10|RS2  name=10 / ROSA NEON
  attributes: {"color":"RS2","talla":"10","colorName":"ROSA NEON","tallaName":"10"}
  variantAttributes: (vacío)

sku=L-1087|14|LI1  name=14 / LILA
  attributes: {"color":"LI1","talla":"14","colorName":"LILA","tallaName":"14"}
  variantAttributes: (vacío)
```

Patron del name: `"TALLA / COLOR_NAME"` (e.g. `"10 / ROSA NEON"`)
Patron del SKU: `"REF|TALLA|COLOR_CODE"` (e.g. `"L-1085|10|RS2"`)

### Line 2 — Latin Kids (17,083 variantes)

```
sku=C-1000112B|0-3|MO1  name=0-3 / MORA LECHE
  attributes: {"color":"MO1","talla":"0-3","colorName":"MORA LECHE","tallaName":"0-3"}
  variantAttributes: color="MORA LECHE", talla="0-3"  (solo 287 variantes tienen esto)

sku=C-1031330|2|BE1  name=2 / BEIGE
  attributes: {"color":"BE1","talla":"2","colorName":"BEIGE","tallaName":"2"}
  variantAttributes: (vacío)
```

---

## Trazabilidad completa

```
ProductEntity (L-1085, PIJAMA NINA CL 2-8, line=1)
  ↓
ProductVariant (sku=L-1085|10|RS2, name="10 / ROSA NEON")
  ├── attributes (JSON): talla="10", color="RS2", tallaName="10", colorName="ROSA NEON"  ← 100%
  └── variantAttributes (tabla): (vacío)  ← 0%
  ↓
ProductInventoryLevel (qty=24, warehouse=13, variantId=✓)
  ↓
StoreInventoryVariant (via sag-store-adapter.ts)
  ├── Reads: variantAttributes → empty → ""
  └── Result: size="SIN_TALLA", color="SIN_COLOR"  ← PIERDE LOS DATOS
```

**Los datos existen en la variante. El adapter lee la fuente equivocada.**

---

## Comparacion Pedidos vs Tiendas

| Aspecto | Pedidos | Tiendas |
|---|---|---|
| Fuente talla/color | `variant.attributes` (JSON) | `variant.variantAttributes` (tabla) |
| Cobertura | 100% | 0% (line 1), 2% (line 2) |
| Campo talla | `attrs.talla` + `attrs.tallaName` | `attrs.find(key=talla).value` |
| Campo color | `attrs.color` + `attrs.colorName` | `attrs.find(key=color).value` |
| Calidad | Excelente — codigo + nombre | Nula — siempre SIN_TALLA/SIN_COLOR |

**Pedidos usa la fuente correcta. Tiendas usa la fuente incorrecta.**

---

## Matriz de cobertura

### Talla

| Fuente | Line 1 (32,037) | Line 2 (17,083) | Calidad |
|---|---|---|---|
| `attributes` JSON `.talla` | 32,037 (100%) | 17,083 (100%) | Excelente — codigo SAG |
| `attributes` JSON `.tallaName` | 32,037 (100%) | 17,083 (100%) | Excelente — nombre display |
| `variantAttributes` tabla `key=talla` | 0 (0%) | 287 (2%) | Inutilizable |
| `ProductVariant.name` (parsed) | 32,037 (100%) | 17,083 (100%) | Buena — requiere parsing |
| `ProductVariant.sku` (parsed) | 32,037 (100%) | 17,083 (100%) | Buena — requiere parsing |

### Color

| Fuente | Line 1 (32,037) | Line 2 (17,083) | Calidad |
|---|---|---|---|
| `attributes` JSON `.colorName` | 32,037 (100%) | 17,083 (100%) | Excelente — nombre completo |
| `attributes` JSON `.color` | 32,037 (100%) | 17,083 (100%) | Codigo SAG (RS2, AZ7) |
| `variantAttributes` tabla `key=color` | 0 (0%) | 287 (2%) | Inutilizable |
| `ProductVariant.name` (parsed) | 32,037 (100%) | 17,083 (100%) | Buena — requiere parsing |
| `ProductVariant.sku` (parsed) | 32,037 (100%) | 17,083 (100%) | Solo codigo (RS2, no nombre) |

---

## Recomendacion final

### D) Jerarquia de fuentes

El adapter de Tiendas debe leer talla/color en este orden:

```
1. ProductVariant.attributes (JSON)  →  attrs.tallaName / attrs.colorName  (100% coverage)
2. ProductVariantAttribute (tabla)   →  key=talla/color .value             (fallback futuro)
3. ProductVariant.name               →  parse "TALLA / COLOR"              (fallback de emergencia)
4. "SIN_TALLA" / "SIN_COLOR"         →  sentinel                           (ultimo recurso)
```

**Cambio requerido en `sag-store-adapter.ts`:**

Actualmente (lineas 271-273):
```typescript
const attrs = lv.variant?.variantAttributes ?? [];
const rawSize  = attrs.find(a => a.key === "talla")?.value ?? "";
const rawColor = attrs.find(a => a.key === "color")?.value ?? "";
```

Debe ser:
```typescript
const jsonAttrs = lv.variant?.attributes as any;
const rawSize  = jsonAttrs?.tallaName ?? jsonAttrs?.talla ?? "";
const rawColor = jsonAttrs?.colorName ?? jsonAttrs?.color ?? "";
// Fallback to relational table if JSON is empty
if (!rawSize || !rawColor) {
  const relAttrs = lv.variant?.variantAttributes ?? [];
  rawSize  = rawSize  || relAttrs.find(a => a.key === "talla")?.value ?? "";
  rawColor = rawColor || relAttrs.find(a => a.key === "color")?.value ?? "";
}
```

Este cambio resolveria:
- Line 1: de 0% → 100% cobertura talla/color
- Line 2: de 2% → 100% cobertura talla/color
- Todas las funciones downstream (`inferProductClass`, reglas textiles, cobertura) funcionarian correctamente

---

## Respuestas al criterio de exito

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | Donde vive la talla | `ProductVariant.attributes` (JSON), campo `talla`/`tallaName`. 100% cobertura. |
| 2 | Donde vive el color | `ProductVariant.attributes` (JSON), campo `color`/`colorName`. 100% cobertura. |
| 3 | Por que Pedidos muestra talla/color | Lee `variant.attributes` (JSON column) via `parseAttrs()`. |
| 4 | Por que Tiendas no los usa | Lee `variant.variantAttributes` (tabla relacional, 0-2% poblada). |
| 5 | Fuente oficial para motor textil | `ProductVariant.attributes` (JSON) con fallback a tabla relacional. |

---

## Archivos creados

| Archivo | Proposito |
|---|---|
| `scripts/audit-tiendas-variant-data.ts` | Audit read-only contra Prisma |
| `scripts/validate-tiendas-variant-data-audit.ts` | Validacion estructural |
| `TIENDAS_VARIANT_DATA_AUDIT_01.md` | Este reporte |
