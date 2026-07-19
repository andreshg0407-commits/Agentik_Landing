# COMERCIAL-MALETAS-CANONICAL-INVENTORY-INTEGRATION-01

Conecta Maletas al inventario canonico. Maletas consume directamente InventoryItem
sin duplicar clasificacion, disponibilidad, variantes ni logica de stock.

## Fuentes anteriores (Maletas pre-sprint)

| Concepto | Fuente directa | Duplicaba inventario |
|---|---|---|
| Disponibilidad textil | CommercialCoverageSnapshot | Si |
| Disponibilidad accesorios | ProductInventoryLevel | Si |
| Clasificacion (linea/grupo/subgrupo) | ProductEntity (consulta propia) | Si |
| Variantes (tallas/colores) | No disponible en lista | Si (solo en drawer) |
| Estado operativo | SampleState / SampleCommercialHealth | Si (modelo diferente) |
| Precios | SAG SOAP (en drawer) | Parcial |
| Presencia vendedor | SAG SOAP F34 | No (dato propio de Maletas) |

## Fuente canonica nueva

Todo dato de producto ahora viene de `InventoryItem` (lib/inventory/inventory-control-types.ts).

### Campos agregados a InventoryItem

| Campo | Tipo | Fuente |
|---|---|---|
| productId | string / null | ProductEntity.id |
| grupoId | number / null | ProductEntity.grupoId |
| subgrupoId | number / null | ProductEntity.subgrupoId |
| sizes | string[] | ProductVariant.attributes (talla/tallaName) |
| colors | string[] | ProductVariant.attributes (color/colorName) |
| variantCount | number | COUNT(ProductVariant) |
| cost | number / null | ProductEntity.costo |

### Carga de variantes

Una sola query batch en `loadVariantSummaries()` (inventory-control-service.ts):
- Recopila todos los productIds del snapshot
- ProductVariant.findMany con IN clause
- Agrupa tallas/colores por SKU
- Se ejecuta despues de construir items, antes de summaries

## Funciones publicas

### isEligibleForSalesPortfolio(item)

```typescript
// lib/inventory/inventory-control-types.ts
export function isEligibleForSalesPortfolio(item: {
  inventoryVisibility: InventoryVisibility;
  disponibleReal: number;
  canonicalLine: CanonicalLine;
}): boolean
```

Retorna true si:
- inventoryVisibility === "ACTIVE"
- disponibleReal > 0
- canonicalLine !== "SIN_CLASIFICAR"

Fotos NO son condicion. NO_DATA, OUT_OF_STOCK y SIN_CLASIFICAR quedan excluidos.

### getActiveInventoryForSalesPortfolio(organizationId, orgSlug)

```typescript
// lib/inventory/inventory-portfolio-loader.ts
export async function getActiveInventoryForSalesPortfolio(
  organizationId: string,
  orgSlug: string,
): Promise<SalesPortfolioInventory>
```

Llama buildInventoryControlSnapshot() y filtra con isEligibleForSalesPortfolio().
No llama SAG SOAP.

## Estructura de seleccion

Navegacion jerarquica:

- CASTILLITOS -> Grupo -> Subgrupo -> Referencias -> Variantes
- LATIN KIDS -> Grupo -> Subgrupo -> Referencias -> Variantes
- IMPORTACION -> Tamano -> Subgrupo -> Referencias -> Variantes

No se muestran como lineas principales: CS, LT, IM, OT, PD, PW, PK.

## Contrato de seleccion (MaletaSelectionItem)

```typescript
// lib/comercial/maletas/vendor-bag-types.ts
// Normalizado: COMERCIAL-MALETAS-DOMAIN-NORMALIZATION-01
interface MaletaSelectionItem {
  inventoryItemId: string;     // FK a InventoryItem (= InventoryItem.reference)
  variantId?: string | null;   // FK a ProductVariant (opcional)
  assignedQty: number;         // Cantidad asignada
  snapshotAt: string;          // Cuando se agrego a la seleccion
}
```

Minimo por diseno: solo FK al objeto maestro + datos operacionales de asignacion.
NO almacena: referencia, descripcion, linea, grupo, subgrupo, tallas, colores,
precios, fotos, inventario ni metadata comercial.
Todo eso pertenece exclusivamente a InventoryItem.
Se resuelve siempre en render time desde InventoryItem.

## Contrato para Pedidos (MaletaSelection)

```typescript
interface MaletaSelection {
  salesRepId: string;
  season: string;
  startDate: string | null;
  endDate: string | null;
  status: MaletaSelectionStatus; // draft | active | expired | deactivated
  items: MaletaSelectionItem[];
  createdAt: string;
}
```

Pedidos consumira exactamente este contrato + InventoryItem.
No creara un nuevo modelo de producto.
Agregara solo su propio estado operacional (estado pedido, factura, despacho)
sobre el mismo InventoryItem.

## Validacion de stock

- available > 0 requerido para agregar
- assignedQty <= disponibleReal (clamped)
- Reservado visible como informacion
- No se recalcula disponibilidad en frontend
- Revalidacion antes de activar (snapshot refresh)

## Cobertura

Calculada con taxonomia canonica:
- Castillitos/Latin Kids: grupos, subgrupos, referencias, tallas, colores cubiertos
- Importacion: tamanos, subgrupos, referencias, colores cubiertos
- No usa inferencias por nombre o descripcion

## API

GET /api/orgs/[orgSlug]/comercial/maletas/portfolio
- Retorna InventoryItem[] filtrado por elegibilidad
- No llama SAG SOAP
- Incluye dataQuality del snapshot

## Vista operativa vs builder

| Aspecto | Vista operativa | Builder |
|---|---|---|
| Proposito | Que tiene el vendedor | Que asignarle desde inventario |
| Fuente | vendor-sample-loader.ts | getActiveInventoryForSalesPortfolio() |
| SAG SOAP | Si (F34 presencia) | No |
| Duplica inventario | Si (historico) | No |
| Coexisten | Si | Si |

## Archivos modificados

| Archivo | Accion |
|---|---|
| lib/inventory/inventory-control-types.ts | Campos nuevos en InventoryItem + isEligibleForSalesPortfolio() |
| lib/inventory/inventory-control-service.ts | loadProductMetadata + loadVariantSummaries + AccessoryRef extendido |
| lib/inventory/inventory-portfolio-loader.ts | NUEVO: getActiveInventoryForSalesPortfolio() |
| lib/comercial/maletas/vendor-bag-types.ts | MaletaSelectionItem + MaletaSelection + MaletaSelectionStatus |
| app/api/orgs/[orgSlug]/comercial/maletas/portfolio/route.ts | NUEVO: GET portfolio endpoint |
| components/comercial/maletas/maleta-portfolio-builder.tsx | NUEVO: builder UI component |
| app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx | Builder drawer integration |

## Limitaciones pendientes

- Precios PV3/PV4 no estan en InventoryItem (requieren SAG SOAP, disponibles en drawer)
- Fotos (primaryAsset) no implementadas (corresponde a Biblioteca Creativa)
- Seleccion de variante individual no implementada (builder selecciona por referencia)
- Persistencia de MaletaSelection no implementada (usa VendorCommercialBag existente para guardar)
- Revalidacion pre-activacion UI pendiente
