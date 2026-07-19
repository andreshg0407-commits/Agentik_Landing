# TIENDAS-CATALOG-AUDIT-01

**Status:** COMPLETE
**TSC:** 160 (no code changes)
**Method:** Read-only Prisma queries against castillitos production data

---

## Hallazgo principal

**El adapter de Tiendas usa datos inventados. Los datos reales existen en Prisma pero no se usan.**

| Dimension | Adapter actual (heuristic) | Dato REAL en Prisma |
|---|---|---|
| **Linea** | `inferProductType(name)` → "PIJAMA", "VESTIDO" | `ProductEntity.productLine` → "1", "2", "5" |
| **Subgrupo** | `inferCategory(name)` → "NIÑA KIDS", "NIÑO BEBE" | `ProductEntity.subgrupoSag` → "PIJAMA CL 2-8", "CONJUNTO CC" |
| **Category** | `inferCategory(name)` → "NIÑA KIDS" | `ProductEntity.category` → "58", "148", "139" (SAG group IDs) |
| **Talla** | Viene de ProductVariantAttribute.key="talla" | OK — pero 58% son "GEN" |
| **Color** | Viene de ProductVariantAttribute.key="color" | OK — pero 16% son "GENERICO" |

**El match entre datos inferidos y datos reales es 0% para linea y 13% para subgrupo.**

---

## FASE 1: Cobertura de campos

### ProductEntity (4,565 productos)

| Campo | Productos | Cobertura | Ejemplo |
|---|---|---|---|
| name | 4,565 | 100% | "PIJAMA NIÑO CC 2-8" |
| sku | 4,565 | 100% | ✓ |
| category | 4,565 | 100% | "58", "148", "139" ← **son IDs SAG, no nombres** |
| **productLine** | 3,909 | **86%** | "1", "2", "5" ← **son IDs SAG, no nombres** |
| segment | 0 | 0% | — |
| **subgrupoSag** | 2,960 | **65%** | "PIJAMA CL 2-8", "CONJUNTO CC" ← **nombre real** |
| subgrupoId | 2,960 | 65% | FK numérica SAG |
| externalSource | 4,561 | 100% | "sag" |

### Hallazgo critico

- `category` contiene IDs SAG (58, 148, 139...), **NO son nombres de subgrupo**
- `productLine` contiene IDs SAG (1, 2, 5), **NO son nombres de linea**
- Solo 7 productos tienen nombres legibles en productLine: "Latin Kids" (3), "Castillitos" (1)
- **`subgrupoSag` SI es un nombre real**: "PIJAMA CL 2-8", "ALIMENTACIÓN", "DORMITORIO"

---

## FASE 2: Jerarquia real

La jerarquia real es: **productLine (ID) → subgrupoSag (nombre)**

### Linea 1 (1,743 productos): Pijamas + Conjuntos propios
```
PIJAMA CC 2-8, PIJAMA CC 10-16, PIJAMA CC 18-22
PIJAMA CL 2-8, PIJAMA CL 10-16, PIJAMA CL 18-22
PIJAMA LL 2-8, PIJAMA LL 10-16
PIJAMA MESES CL, PIJAMA MESES LL
CONJUNTO 1-4, CONJUNTO 2-12, CONJUNTO MESES, CONJUNTO NAUTICO MESES
```

### Linea 2 (1,482 productos): Ropa casual + complementos
```
CAMISETA, CAMIBUSO, POLO, BLUSA, BLUSAS, BUZO, CHAQUETA, VESTIDO
CONJUNTO CC, CONJUNTO CL, CONJUNTO LL, CONJUNTO FALDA
PIJAMA CL, PIJAMA LL
MAMELUCO CORTO, MAMELUCO LARGO, SHORT, JOGGER, BERMUDA, PANTALON
```

### Linea 5 (657 productos): Importacion / accesorios / voluminosos
```
ALIMENTACIÓN, DORMITORIO, JUGUETERÍA, CUIDADO DENTAL
BOLSOS, MALETA, LONCHERA, TERMOS, TETEROS
CAMINADOR, CUNA, COCHES, SILLA, MOTO
PELUCHE, ACCESORIOS, ACCESORIOS NIÑA
```

### Linea 3 (20 productos): Pijamas dama
### Linea 4 (3 productos): Datos parciales

---

## FASE 3: category NO es subgrupo

**category contiene IDs numericos SAG (ka_ni_grupo), no nombres.**

| category | Productos | Significado probable |
|---|---|---|
| 58 | 1,570 | Grupo SAG genérico (ropa) |
| 148 | 658 | Importacion |
| 139 | 484 | ? |
| 138 | 424 | ? |
| 145 | 257 | ? |

**Match category vs subgrupoSag: 0/30 (0%)**

Conclusion: **category NO puede usarse como subgrupo. Es un ID SAG sin resolver.**

---

## FASE 4: productLine NO es marca/linea comercial

**productLine contiene IDs numericos SAG, no nombres humanos.**

| productLine | Productos | Significado |
|---|---|---|
| "1" | 1,743 | Linea pijamas + conjuntos |
| "2" | 1,482 | Linea ropa casual |
| "5" | 657 | Linea importacion |
| "3" | 20 | Linea pijamas dama |
| "Latin Kids" | 3 | Nombre real (CRM manual) |
| "Castillitos" | 1 | Nombre real (CRM manual) |

**Los IDs SAG (1, 2, 3, 5) necesitan resolverse a nombres comerciales** mediante la tabla SAG de lineas.

---

## FASE 5: Talla y color

### Talla (887 atributos)

| Valor | Count | Tipo |
|---|---|---|
| **GEN** | **515 (58%)** | **Generico — sin talla real** |
| 18-24 | 56 | Rango meses |
| 12-18 | 56 | Rango meses |
| 9-12 | 52 | Rango meses |
| 6-9 | 52 | Rango meses |
| S/M/L/XL | 66 | Tallas estandar |
| 2/3/4/5 | 84 | Tallas numericas |

**58% de las tallas son "GEN"** — significan "generico / una sola talla". Estos productos NO tienen variacion de talla (ej: almohadas, juguetes, accesorios).

### Color (887 atributos)

| Valor | Count | Tipo |
|---|---|---|
| **GENERICO** | **138 (16%)** | Sin color real |
| ROSADO | 100 | OK |
| VERDE | 65 | OK |
| BEIGE | 58 | OK |
| GRIS | 53 | OK |

Los colores estan limpios. Solo 16% son "GENERICO".

**Solo 887 de 53,338 variantes tienen atributos tipados** (1.7%). El resto tiene atributos en el campo JSON `ProductVariant.attributes`.

---

## FASE 6: Tamano comercial

**NO existe campo SAG para tamano comercial.**

No se encontro ningun atributo con clave: sizeClass, size_class, commercialSize, tamano, volumen, tipo_tamano, peso, weight.

La clasificacion small/medium/large/oversized se infiere actualmente por heuristica sobre el nombre del producto. Esto es aceptable temporalmente.

---

## FASE 7: Clase de producto

**NO existe campo SAG explicito para clase de producto.**

La inferencia actual por nombre funciona para los subgrupos con `subgrupoSag`:

| Clase | Subgrupos SAG reales | Funciona? |
|---|---|---|
| textile | PIJAMA CL 2-8, CAMISETA, CONJUNTO CC, etc. (20+) | SI — patron claro en nombre |
| bulky | CUNA, CAMINADOR, COCHES, SILLA | SI — pero 0 detectados en muestra (solo 2,960/4,565 tienen subgrupoSag) |
| accessory | BOLSOS, MALETA, LONCHERA | SI — idem |
| other | todo lo demas | OK |

La linea SAG tambien ayuda: linea 5 = importacion (bulky + accessory), lineas 1-2 = textile.

---

## FASE 8: Match Inventario → Producto

### ProductInventoryLevel (157,101 registros)

| Dimension | Resolucion | Cobertura |
|---|---|---|
| productId | 157,101 | 100% |
| variantId | 157,101 | 100% |
| productLine | ~41% (muestra 200) | Parcial — productLine es ID numerico |
| **subgrupoSag** | **~100% (muestra 200)** | **Excelente** |
| talla | ~100% (muestra 200) | Via variantAttributes |
| color | ~100% (muestra 200) | Via variantAttributes |

### Bodegas (warehouseId)

| Bodega | Registros | Stock total |
|---|---|---|
| 10 | 50,430 | -1,155,949 (movimientos) |
| 13 | 48,349 | 1,318,883 (bodega principal) |
| 11 | 15,910 | -68,630 |
| 31 | 10,351 | -28,283 |
| 32 | 8,015 | -25,117 |

---

## FASE 9: Comparacion inferido vs real

### inferCategory(name) vs productLine (REAL)

**Match: 0/30 (0%)**

- `inferCategory("PIJAMA NIÑO CC 2-8")` → "NIÑO" (demographics)
- Real `productLine` → "1" (SAG line ID)
- Son dimensiones **completamente diferentes**: inferCategory detecta genero/edad, productLine es linea de negocio

### inferProductType(name) vs subgrupoSag (REAL)

**Match: 4/30 (13%)**

- `inferProductType("CAMISETA BASICA NIÑO KIDS")` → "CAMISETA" ✓
- `inferProductType("PIJAMA CORTA LARGA NIÑA KIDS")` → "PIJAMA" pero real = "PIJAMA CL" ✗
- `inferProductType("CAMIBUSO BASICO DE NIÑA BEBE")` → "BUZO/CAMIBUSO" pero real = "CAMIBUSO" ✗
- `inferProductType("CONJUNTO NIÑO BEBE REY LEON")` → "CONJUNTO" pero real = "CONJUNTO 1-4" ✗

La inferencia pierde la granularidad SAG (CL/CC/LL, rangos de talla, meses).

---

## Riesgos

1. **Las reglas de surtido creadas con el catalogo actual NO matchearan con datos reales** porque usan `inferCategory` (genero/edad) como "subgrupo" en lugar de `subgrupoSag` (SAG real)

2. **35% de productos NO tienen subgrupoSag** — las reglas no aplicaran a esos 1,605 productos

3. **productLine son IDs SAG (1, 2, 5)** — necesitan tabla SAG de lineas para resolver nombres comerciales

4. **58% de tallas son "GEN"** — productos sin variacion de talla. El motor de cobertura textil debe excluir estos

5. **Solo 1.7% de variantes tienen atributos tipados** — la mayoria tiene atributos en campo JSON

---

## Recomendacion

### **Opcion E: Se puede resolver por ProductEntity pero no por inventario directo**

El `sag-store-adapter.ts` debe cambiar su fuente:

| Dimension | Fuente actual (MAL) | Fuente correcta |
|---|---|---|
| `StoreInventoryVariant.line` | `inferProductType(name)` | `ProductEntity.productLine` → resolver nombre via tabla SAG lineas |
| `StoreInventoryVariant.category` | `inferCategory(name)` | `ProductEntity.subgrupoSag` |
| size | variantAttributes OK | OK (filtrar "GEN") |
| color | variantAttributes OK | OK (filtrar "GENERICO") |

### Proximos sprints requeridos

1. **TIENDAS-SAG-LINE-RESOLVER-01**: Crear mapper productLine ID → nombre comercial (ej: "1" → "Pijamas y Conjuntos Castillitos")
2. **TIENDAS-ADAPTER-REAL-DATA-01**: Cambiar `sag-store-adapter.ts` para usar `ProductEntity.subgrupoSag` en lugar de `inferCategory`/`inferProductType`
3. **TIENDAS-CATALOG-COVERAGE-01**: Resolver el 35% de productos sin `subgrupoSag` (posible backfill desde SAG)
4. **TIENDAS-GEN-TALLA-EXCLUSION-01**: Excluir talla="GEN" y color="GENERICO" de cobertura textil

---

## Archivos

| Archivo | Proposito |
|---|---|
| `scripts/audit-tiendas-catalog.ts` | Audit script read-only |

No se modifico ningun archivo de codigo. TSC baseline: 160.
