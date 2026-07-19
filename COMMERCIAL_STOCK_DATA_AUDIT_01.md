# COMMERCIAL-STOCK-DATA-AUDIT-01 -- Audit Report

**Date:** 2026-07-04
**Status:** COMPLETE
**Type:** READ-ONLY AUDIT (no data modified)

---

## FASE 1 -- Inventario Global

| Metrica | Valor | % |
|---------|-------|---|
| Total referencias comerciales | 4,565 | 100% |
| Referencias con stock > 0 | 1,444 | 31.6% |
| Referencias con stock = 0 | 2,674 | 58.6% |
| **Referencias con stock null (sin datos)** | **447** | **9.8%** |
| Referencias sin variantes | 447 | 9.8% |
| Referencias con 1 sola variante | 321 | 7.0% |
| Referencias con > 1 variante | 3,797 | 83.2% |

**Dato critico:** Las 447 referencias con stock null son exactamente las mismas 447 sin variantes.

Infraestructura:
- Total variantes (org): 53,338
- Total registros de inventario: 157,101

---

## FASE 2 -- Top Referencias Problematicas

Total: 447 referencias con `availableQty = null`.

**Todas comparten estas caracteristicas:**
- 0 variantes (ProductVariant)
- 0 registros de inventario (ProductInventoryLevel)
- Sincronizacion: NUNCA (latestSync = null)
- Status: approved (443/447) o pending (4/447)
- commercialStatus: active (447/447)
- Origen: sag (443/447)

Muestra representativa (20 de 447):

| REF | NOMBRE | LINEA | CATEGORIA | PRECIO | VARS | SYNC |
|-----|--------|-------|-----------|--------|------|------|
| 9165 | COLLAR MEDIANO LED RECARGABLE PERROS | -- | 149 | $73,025 | 0 | NUNCA |
| C-1010132B | PIJAMA COTA LARGA NINA BABY | -- | 58 | $58,739 | 0 | NUNCA |
| C-1053133B | PIJAMA CORTA LARGA NINA BEBE | 2 | 58 | $57,899 | 0 | NUNCA |
| C-1073143B | PIJAMA LARGA LARGA NINA BEBE | 2 | 58 | $60,420 | 0 | NUNCA |
| CF-1003443B | CAMIBUSO NINA BEBE | 2 | 58 | $44,453 | 0 | NUNCA |
| CGJ-1533425 | BLUSA NINA KIDS | 2 | 58 | $57,899 | 0 | NUNCA |
| CGJ-2282225B | CONJ JEAN CAMISETA NINO BEBE | 2 | 58 | $137,731 | 0 | NUNCA |
| CJ-4001435B | CAMISA MANGA LARGA NINO BEBE | 2 | 144 | $73,025 | 0 | NUNCA |
| CT-1001214B1 | CAMISETA | 2 | 145 | $77,226 | 0 | NUNCA |
| LT-1003143 | PIJAMA LARGA LARGA NINA KIDS | 1 | 58 | $62,100 | 0 | NUNCA |
| LT-2022213B1 | CAMISETA | 1 | 139 | $67,142 | 0 | NUNCA |
| LT-2573133 | PIJAMA CORTA LARGA NINO KIDS | 1 | 58 | $67,142 | 0 | NUNCA |
| S-0423 | GORRO ESTAMPADO | -- | 58 | $26,890 | 0 | NUNCA |
| S-0432 | GORRO ESTAMPADO NINO | -- | 58 | $30,252 | 0 | NUNCA |
| C7-668-311 | CAMA NIDO GIMNASIO OSITO | 5 | 148 | $209,244 | 0 | NUNCA |
| C7-C-73 | CHUPA PARA FRUTA | 5 | 148 | $10,000 | 0 | NUNCA |
| C7-H168331-1 | CAMINADOR ANDADERA BEBE MOTO | 5 | 148 | $192,437 | 0 | NUNCA |
| CA-1071225B | CONJ PANTALON NINA BEBE | 2 | 145 | $95,714 | 0 | NUNCA |
| CF-14832131 | CAMISETA | 2 | 143 | $73,025 | 0 | NUNCA |
| CP-1533133 | PIJAMA CORTA LARGA NINA KIDS | 2 | 58 | $62,100 | 0 | NUNCA |

---

## FASE 3 -- Analisis de Patrones

### Por linea

| Linea | Refs problematicas | % del total |
|-------|-------------------|-------------|
| (sin linea) | 287 | 64.2% |
| 2 | 105 | 23.5% |
| 1 | 48 | 10.7% |
| 5 | 3 | 0.7% |
| Latin Kids | 3 | 0.7% |
| Castillitos | 1 | 0.2% |

### Por categoria

| Categoria | Refs |
|-----------|------|
| 58 (PRODUCTO TERMINADO) | 369 (82.5%) |
| 143 | 16 |
| 144 | 13 |
| 138 | 12 |
| 142 | 11 |
| 145 | 9 |
| 139 | 6 |
| 148 | 3 |
| Otras (6 categorias) | 8 |

### Por cantidad de variantes

**100% de las 447 referencias problematicas tienen CERO variantes.**

No existe una sola referencia con variantes pero sin inventario.

### Por origen

| Origen | Refs |
|--------|------|
| sag | 443 (99.1%) |
| (sin origen) | 4 (0.9%) |

### Edad

| Metrica | Valor |
|---------|-------|
| Mas antigua | 26 dias (juhh77) |
| Mas reciente | 11 dias (9165) |
| Promedio | 11 dias |

**Conclusion:** No son referencias legacy/antiguas. Son importaciones recientes (ultimas 4 semanas).

---

## FASE 4 -- Trazabilidad SAG

Muestra de 20 referencias problematicas:

| REF | Producto | Precio | Variantes | Inv Levels | Inventario | Sync | Source | Status |
|-----|----------|--------|-----------|------------|------------|------|--------|--------|
| 9165 | OK | OK | 0 | 0 | NULL | NUNCA | sag | approved |
| C-1010132B | OK | OK | 0 | 0 | NULL | NUNCA | sag | approved |
| C-1023461B | OK | OK | 0 | 0 | NULL | NUNCA | sag | approved |
| C-1053133B | OK | OK | 0 | 0 | NULL | NUNCA | sag | approved |
| C-1073143B | OK | OK | 0 | 0 | NULL | NUNCA | sag | approved |
| C-1083133B | OK | OK | 0 | 0 | NULL | NUNCA | sag | approved |
| C-1083441B | OK | OK | 0 | 0 | NULL | NUNCA | sag | approved |
| C-1102222B | OK | OK | 0 | 0 | NULL | NUNCA | sag | approved |
| C-1202282B | OK | OK | 0 | 0 | NULL | NUNCA | sag | approved |
| C-1221442B | OK | OK | 0 | 0 | NULL | NUNCA | sag | approved |
| C-1232532B | OK | OK | 0 | 0 | NULL | NUNCA | sag | approved |
| C-1252232B | OK | OK | 0 | 0 | NULL | NUNCA | sag | approved |
| C-1262112B | OK | OK | 0 | 0 | NULL | NUNCA | sag | approved |
| C-1393141 | OK | OK | 0 | 0 | NULL | NUNCA | sag | approved |
| C-1483262 | OK | OK | 0 | 0 | NULL | NUNCA | sag | approved |
| C-1503132 | OK | OK | 0 | 0 | NULL | NUNCA | sag | approved |
| C-1532131 | OK | OK | 0 | 0 | NULL | NUNCA | sag | approved |
| C-1583311 | OK | OK | 0 | 0 | NULL | NUNCA | sag | approved |
| C-1632142 | OK | OK | 0 | 0 | NULL | NUNCA | sag | approved |
| C-1642222 | OK | OK | 0 | 0 | NULL | NUNCA | sag | approved |

**Patron identico en 20/20:** Producto y precio importados correctamente. Variantes e inventario completamente ausentes.

---

## FASE 5 -- Comparacion con Referencias Sanas

Muestra de 20 referencias con mayor stock:

| REF | Producto | Precio | Variantes | Inv Levels | Disponible | Sync | Source |
|-----|----------|--------|-----------|------------|------------|------|--------|
| BG | OK | OK | 1 | 8 | 2,475 | Jun 30 | sag |
| C8-K004 | OK | OK | 2 | 13 | 1,248 | Jun 30 | sag |
| C8-K0033 | OK | OK | 1 | 7 | 1,146 | Jun 30 | sag |
| PP-10 | OK | OK | 5 | 25 | 1,084 | Jun 30 | sag |
| C8-729 | OK | OK | 3 | 12 | 1,028 | Jun 23 | sag |
| BT-04 | OK | OK | 9 | 32 | 909 | Jun 30 | sag |
| HC0213049 | OK | OK | 10 | 29 | 844 | Jun 30 | sag |
| CD-4273439 | OK | OK | 86 | 376 | 681 | Jun 30 | sag |
| CD-4243339 | OK | OK | 84 | 369 | 651 | Jun 30 | sag |
| CX-2026 | OK | OK | 2 | 10 | 643 | Jun 30 | sag |

### Diferencia estructural

| Aspecto | Sanas | Problematicas |
|---------|-------|---------------|
| ProductEntity | OK | OK |
| Precio | OK | OK |
| ProductVariant | 1-86 registros | **0 registros** |
| ProductInventoryLevel | 3-376 registros | **0 registros** |
| Ultima sincronizacion | Jun 23-30 | **NUNCA** |
| CRM quote lines | Presentes (parcial) | **0 matches** |

### Descripcion SAG

**Problematicas:** `"Grupo: PRODUCTO TERMINADO | Marca: 3198 | Unidad: 1 | IVA: 19% | Costo: $13508 | Talla/Color: Si"`

**Sanas:** `"Linea: IMPORTACION | Grupo: IMPORTACION | Marca: 5852 | SubGrupo: ALIMENTACION | Unidad: 1 | IVA: 19%"`

**Observacion clave:** Las problematicas SI dicen `Talla/Color: Si` -- SAG sabe que tienen tallas y colores.
Pero el adaptador Agentik nunca importo los registros de variante correspondientes.

---

## FASE 6 -- Hipotesis

### 1. Son productos de prueba Agentik?

**NO.** Son 443/447 de origen "sag" con status "approved". Tienen precios reales ($10,000 - $209,244 COP), nombres de productos comerciales reales (pijamas, camisetas, conjuntos, vestidos), y referencias con codigos internos consistentes (C-, CF-, CGJ-, CJ-, LT-, CT-, etc.). Las 4 sin origen son edge cases pero tambien tienen nombres reales.

### 2. Son referencias SAG reales?

**SI.** Son productos reales importados desde SAG. Tienen `externalSource: "sag"`, nombres comerciales reales, precios de mercado, descripciones con metadatos SAG (Grupo, Marca, SubGrupo, Unidad, IVA, Costo, Talla/Color).

### 3. Son referencias legacy/descontinuadas?

**NO.** Fueron importadas hace 11-26 dias (semanas recientes). Su `commercialStatus` es "active" en 100% de los casos. No hay marca de descontinuacion.

### 4. Falta sincronizacion?

**SI -- esta es la causa raiz.** El pipeline de importacion SAG tiene dos fases:
1. **Fase producto (ProductEntity):** Ejecutada correctamente -- 447 productos importados con nombre, precio, descripcion.
2. **Fase variante (ProductVariant + ProductInventoryLevel):** **NUNCA ejecutada** para estas 447 referencias.

La evidencia es concluyente: 0 variantes, 0 niveles de inventario, 0 sincronizaciones.

### 5. Falta mapeo de inventario?

**SI, pero como consecuencia.** El problema no es un mapeo faltante -- es que la fase de importacion de variantes nunca corrio para estos productos. Sin variantes, no hay a donde asignar inventario.

La descripcion SAG dice `Talla/Color: Si` -- el sistema fuente tiene las variantes. El adaptador Agentik no las importo.

### 6. Deben ocultarse del buscador?

**TEMPORALMENTE SI.** Mientras no tengan variantes, no son vendibles. Mostrarlos en busqueda con "Stock no sincronizado" confunde al vendedor. El filtro implementado en COMMERCIAL-PRODUCT-STOCK-SCARCITY-01 ya los marca con `inventoryStatus: "no_variants"`, pero aun aparecen en resultados de busqueda.

### 7. Deben corregirse en integracion?

**SI -- es la solucion definitiva.** La integracion SAG debe completar la fase de importacion de variantes para estas 447 referencias. Los datos existen en SAG (`Talla/Color: Si`). El adaptador debe importar:
- ProductVariant (talla x color)
- ProductInventoryLevel (stock por variante por bodega)

---

## Diagnostico Final

```
PIPELINE SAG → AGENTIK

FASE 1: Producto (ProductEntity)     ✓ 4,565 productos importados
FASE 2: Variantes (ProductVariant)   ✗ 447 productos SIN variantes (9.8%)
FASE 3: Inventario (InventoryLevel)  ✗ Depende de FASE 2

Productos con variantes + inventario:    4,118
Productos con variantes SIN inventario:  0
Productos SIN variantes:                 447  ← BRECHA
```

La brecha es binaria: o un producto tiene variantes + inventario (4,118), o no tiene ninguno de los dos (447). No existe un estado intermedio. Esto confirma que el problema es una **omision en la fase de importacion de variantes**, no un error parcial.

---

## Recomendacion

### C) AMBAS -- Corregir integracion + Filtrar referencias

**Accion 1 -- INMEDIATA: Filtrar en buscador comercial**

Productos con `variantCount === 0` y `inventoryStatus === "no_variants"` deben:
- **No aparecer en resultados de busqueda** (ya no son vendibles sin variantes)
- Mantener visibilidad en reportes/auditorias administrativas
- Mostrar badge "Sin variantes importadas" si se acceden directamente

Esto es un cambio en `order-product-search.ts` linea 251-264 (el fallback de 0 variantes).

**Accion 2 -- CORRECTIVA: Re-ejecutar importacion de variantes SAG**

Para las 447 referencias afectadas:
1. Verificar en SAG que tienen registros de talla/color (la descripcion dice `Talla/Color: Si`)
2. Ejecutar la fase de importacion de variantes del adaptador SAG
3. Ejecutar la fase de inventario (ProductInventoryLevel) una vez que las variantes existan
4. Validar que las 447 pasan a tener variantes + inventario

**Accion 3 -- PREVENTIVA: Agregar validacion post-sync**

Despues de cada sincronizacion SAG, verificar:
- Productos nuevos importados sin variantes cuando `Talla/Color: Si`
- Alertar si > 5% de productos importados quedan sin variantes
- Dashboard de salud de sincronizacion en modulo Agentik

---

## Archivos Analizados (read-only)

| Archivo | Proposito |
|---------|-----------|
| `lib/comercial/pedidos/order-product-search.ts` | Pipeline de busqueda: 3 fuentes (ProductEntity, ProductVariant+Levels, CRMQuoteLine) |
| `lib/comercial/pedidos/order-inventory-service.ts` | Servicio de inventario (lee de ProductVariant + ProductInventoryLevel) |
| `lib/comercial/pedidos/order-product-types.ts` | Tipos de dominio + `getCommercialStockState()` |
| `prisma/schema.prisma` | Modelos: ProductEntity, ProductVariant, ProductInventoryLevel |
| `scripts/_audit-stock-data.ts` | Script de auditoria ejecutado contra BD Neon (read-only) |
