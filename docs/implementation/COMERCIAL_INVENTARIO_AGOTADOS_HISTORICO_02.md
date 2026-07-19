# COMERCIAL-INVENTARIO-AGOTADOS-HISTORICO-02

Sprint: Separacion de inventario operativo y agotados historicos.

## Regla de separacion

| Clasificacion | Condicion | Seccion |
|---|---|---|
| **Activo** | `inventoryVisibility === "ACTIVE"` (disponibleReal > 0) | Linea canonica original |
| **Agotado** | `inventoryVisibility === "OUT_OF_STOCK"` (disponibleReal <= 0, datos certificados) | Agotados |
| **Sin datos** | `inventoryVisibility === "NO_DATA"` (sin registro de disponibilidad) | NO se mezcla con Agotados |

## Reactivacion automatica

Cuando un nuevo snapshot SAG reporta `disponibleReal > 0` para una referencia agotada:

1. `deriveInventoryVisibility()` retorna `"ACTIVE"` automaticamente
2. La referencia desaparece de Agotados
3. Regresa a su linea canonica original (CASTILLITOS, LATIN_KIDS, IMPORTACION, SIN_CLASIFICAR)
4. Conserva toda su metadata (grupoSag, subgrupoSag, variantes, precios, fechas)
5. Vuelve a ser elegible para enriquecimiento de catalogo

No hay acciones manuales. La clasificacion se deriva del ultimo snapshot.

## Exclusion de enriquecimiento

```typescript
isEligibleForCatalogEnrichment(item) // true solo si ACTIVE
```

Las referencias agotadas:
- No entran en colas de generacion de fotografias
- No participan en procesos de enriquecimiento creativo
- No activan tareas de catalogo pendiente
- No consumen recursos de IA para contenido visual
- Conservan fotografias existentes (no se borran)

## Funciones publicas

| Funcion | Archivo | Proposito |
|---|---|---|
| `isEligibleForCatalogEnrichment()` | `lib/inventory/inventory-control-types.ts` | Eligibilidad para fotos/catalogo/marketing |
| `getActiveCanonicalInventory()` | `lib/inventory/inventory-control-types.ts` | Filtrar solo items activos |
| `deriveInventoryVisibility()` | `lib/inventory/inventory-control-types.ts` | Clasificar ACTIVE/OUT_OF_STOCK/NO_DATA |
| `resolveCanonicalLine()` | `lib/inventory/inventory-control-types.ts` | Asignar linea canonica |

## Consumidores futuros

Los siguientes modulos deben usar `getActiveCanonicalInventory()` por defecto:

- Maletas
- Tiendas
- Pedidos
- Produccion
- Oportunidades
- Catalogo
- Fotos

Nunca deben consumir agotados salvo para consulta historica especifica.

## Panel principal — orden de secciones

1. Castillitos (solo activas)
2. Latin Kids (solo activas)
3. Importacion / Accesorios (solo activas)
4. Sin clasificar (solo activas)
5. Agotados (todas las agotadas, agrupadas por linea original)

## KPIs operativos

Los KPIs del panel excluyen agotados:
- Refs activas
- Disponible en bodega
- Total LT / CS / Importacion
- Agotadas historicas (contador secundario)

## Conteos (auditoria pre-implementacion)

| Metrica | Valor |
|---|---|
| Total refs | 4,004 |
| ACTIVE | 2,790 |
| OUT_OF_STOCK | 737 |
| NO_DATA | 477 |
| Duplicados | 0 |
| Total disponible | 245,358 |

### Por linea canonica

| Linea | Total | Activas | Agotadas | No Data |
|---|---|---|---|---|
| CASTILLITOS | 1,384 | 1,380 | 4 | 0 |
| LATIN_KIDS | 1,711 | 982 | 729 | 0 |
| IMPORTACION | 663 | 186 | 0 | 477 |
| SIN_CLASIFICAR | 246 | 242 | 4 | 0 |

## Archivos modificados

- `lib/inventory/inventory-control-types.ts` — nuevas funciones: `isEligibleForCatalogEnrichment()`, `getActiveCanonicalInventory()`
- `app/(app)/[orgSlug]/comercial/inventario/inventario-client.tsx` — separacion de secciones activas/agotados, KPIs actualizados, seccion Agotados con tabla propia
- `scripts/_audit-agotados-historico.ts` — script de auditoria Phase 1
- `docs/implementation/COMERCIAL_INVENTARIO_AGOTADOS_HISTORICO_02.md` — esta documentacion

## Impacto futuro

- Shopify publish: debe verificar `isEligibleForCatalogEnrichment()` antes de sincronizar productos
- Marketing Studio: debe excluir agotados de colas de generacion
- Maletas: debe usar `getActiveCanonicalInventory()` para plan de reposicion
- Produccion: puede consultar agotados para decision de reactivacion
