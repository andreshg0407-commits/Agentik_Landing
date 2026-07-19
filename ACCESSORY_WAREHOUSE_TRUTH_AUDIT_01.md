# ACCESSORY-WAREHOUSE-TRUTH-AUDIT-01

**Status:** COMPLETE
**Date:** 2026-07-02
**Type:** FORENSICS / READ ONLY
**Prerequisite for:** ACCESSORY-REPLENISHMENT-INTELLIGENCE-01

---

## Veredicto Final

### FUENTE CORRECTA PARA ALERTAS DE ESCASEZ IMPORT: **B36 + B37**

B24 queda **descartada definitivamente**. B33 es un hallazgo importante pero NO debe usarse para escasez.

---

## FASE 1 — Inventario de Bodegas

### Tabla de Bodegas Relevantes

| Bodega | Refs IMPORT | Qty Positiva | Tipo | Observaciones |
|--------|-------------|--------------|------|---------------|
| **B24** | **0** | 0 | Bodega textil (pL=1,2) | CERO refs IMPORT. Solo 64 productos textiles con qty casi nula. **Hipotesis A DESCARTADA** |
| **B36** | 84 | 49,109 | Almacen IMPORT puro | 100% productLine=5. Recibe de B01. Sin transferencias a B33 |
| **B37** | 106 | 33,247 | Almacen IMPORT puro | 100% productLine=5. Sin transferencias registradas |
| **B33** | 651 | 23,247 | Hub de distribucion IMPORT | Principalmente pL=5 (75%). Transfiere a tiendas (B31, B32, B11, B39) y vendor bodegas |
| **B10** | 43 | 395 | Bodega principal | Marginal para IMPORT. Rol textil principalmente |

### Todas las Bodegas del Sistema (PIL)

| Bodega | Productos | Qty Positiva | Qty Raw | Rol Inferido |
|--------|-----------|-------------|---------|-------------|
| B10 | 3,340 | 20,938 | -1,155,949 | Principal (textil) |
| B13 | 3,007 | 1,318,883 | 1,318,883 | Maestro/consolidacion |
| B33 | 865 | 24,247 | -96,977 | Hub distribucion import |
| B36 | 84 | 49,109 | 49,109 | Almacen import puro |
| B37 | 106 | 33,247 | 33,247 | Almacen import puro |
| B24 | 64 | 10 | -530 | Textil residual |
| B41-B60 | variable | 85,537 (import) | variable | Vendor bodegas |

---

## FASE 2 — Relacion entre B24, B36, B37, B33

### B24 vs B36/B37
- **CERO overlap** entre B24 y B36/B37 (ni un solo producto compartido)
- B24 contiene solo productLine 1 y 2 (textil: pijamas, conjuntos, camibuzos)
- B24 transfiere a B00, B29, B02, B23 — circuito textil, no import

### B36 vs B37
- Solo **4 refs** en comun entre B36 y B37
- B36 tiene 80 refs exclusivas, B37 tiene 102 exclusivas
- Son bodegas **independientes y complementarias** — no redundantes

### B33 vs B36/B37
- **CERO transferencias** entre B33 y B36/B37 en ninguna direccion
- Son **completamente independientes**
- B33 tiene 651 import refs, pero cantidades NO correlacionan con B36+B37 (0 exact matches)

### Topologia Descubierta

```
IMPORT SUPPLY CHAIN:

  [Proveedor Internacional]
          |
    +-----------+
    |           |
   B36         B37          <- Almacenes de importacion (stock nuevo)
  (84 refs)   (106 refs)
  49K qty     33K qty
    |
   B01          <- Produccion/transito (minimas transferencias)
    |
   ???

  [Circuito independiente]

   B33                      <- Hub distribucion import (stock en rotacion)
  (651 refs)
  23K qty
    |
    +---> B31 (tienda)
    +---> B32 (tienda)
    +---> B11 (tienda)
    +---> B39 (tienda)
    +---> B52, B46, B48...  (vendor bodegas)
```

---

## FASE 3 — Muestra de 30 Referencias

### Resultado de la Muestra

| SKU | B24 | B36 | B37 | B36+37 | Descripcion |
|-----|-----|-----|-----|--------|-------------|
| PP-10 | 0 | 0 | 2,000 | 2,000 | SET DE CUCHARA DE BEBE |
| 34731-1 | 0 | 0 | 1,500 | 1,500 | PORTA LECHE PARA BEBE |
| 9102 | 0 | 1,440 | 0 | 1,440 | TETERO DE BEBE |
| TQ-10 | 0 | 1,440 | 0 | 1,440 | CEPILLO DE DIENTE BEBE |
| 34731-2 | 0 | 0 | 1,440 | 1,440 | CHUPO PARA FRUTAS |
| 9101 | 0 | 1,440 | 0 | 1,440 | TETERO DE BEBE |
| 9103 | 0 | 1,440 | 0 | 1,440 | TETERO DE BEBE |
| 34731-4 | 0 | 0 | 1,360 | 1,360 | SET DE CORTA UNAS BEBE |
| HC0213037 | 0 | 1,000 | 0 | 1,000 | RASCA ENCIAS |
| HC0233068 | 0 | 1,000 | 0 | 1,000 | RASCA ENCIAS |
| SG406 | 0 | 0 | 15 | 15 | SILLA ELECTRICO BEBE |
| BB008 | 0 | 0 | 15 | 15 | SILLA DE BEBE |
| 6212 | 0 | 4 | 10 | 14 | VACENILLA PORTATIL |
| 908 | 0 | 12 | 0 | 12 | CAMINADOR ELECTRICO |
| 6788 | 0 | 0 | 10 | 10 | ESCALERA DE BEBE |
| AS107 | 0 | 10 | 0 | 10 | SET DE COCHE |
| D01 | 0 | 10 | 0 | 10 | MESADOR DE BEBE |
| BC-102TC | 0 | 0 | 9 | 9 | CUNA DE BEBE |
| AS601 | 0 | 5 | 0 | 5 | SET DE COCHE |
| 6014 | 0 | 0 | 5 | 5 | BANERA |
| 1223-16 | 0 | 0 | 0 | 0 | COCINA MONTESSORI |
| 24-14 | 0 | 0 | 0 | 0 | TERMOMETRO DIGITAL |
| ... | 0 | 0 | 0 | 0 | (10 refs mas con qty=0) |

**Totales de la muestra:** B24=0, B36=7,801, B37=6,364, B36+37=14,165

**Conclusion:** B24 tiene CERO unidades para TODAS las referencias IMPORT. B36+B37 es la unica fuente con inventario real.

---

## FASE 4 — Comparacion con Disponible Comercial

| Fuente | Contiene refs IMPORT? | Rol |
|--------|----------------------|-----|
| CommercialCoverageSnapshot | **NO** (0 refs) | Solo LT y CS |
| ProductInventoryLevel B36+B37 | **SI** (190 refs con stock) | Fuente de escasez IMPORT |
| ProductInventoryLevel B24 | **NO** (0 refs IMPORT) | Irrelevante para IMPORT |
| ProductInventoryLevel B33 | SI (651 refs) | Hub distribucion, no fuente primaria |

### Que alimenta el drawer de Maletas?

- `loadImportAvailability()` en `vendor-sample-loader.ts` consulta PIL con `warehouseId IN ('36', '37')`
- `loadImportRefSet()` identifica refs con `productLine = '5'`
- Alerta de escasez: `disponible_B36_B37 <= 10`

### CommercialCoverageSnapshot

Solo contiene lineas `CS` y `LT`. Nunca ha contenido IMPORT. Las alertas de escasez para IMPORT operan exclusivamente sobre PIL.

---

## FASE 5 — Trazabilidad de Movimientos

### B36 — Almacen de Importacion

| Flujo | Transferencias | Detalle |
|-------|---------------|---------|
| B01 -> B36 | 15 | Unico proveedor. Ingreso de mercancia importada |
| B10 -> B36 | 1 | Movimiento aislado |
| B36 -> B01 | 1 | Devolucion minima (51 unidades totales) |
| B36 -> B33 | **0** | Sin conexion con hub de distribucion |
| B36 -> B41-B60 | **0** | Sin conexion directa con vendors |

**B36 es un almacen de recepcion de importaciones.** Recibe de B01 (produccion/entrada) y practicamente no despacha. Su inventario (49K) refleja stock nuevo sin distribuir.

### B37 — Almacen de Importacion Secundario

| Flujo | Transferencias |
|-------|---------------|
| Cualquier direccion | **0** |

**B37 tiene CERO transferencias registradas.** Su inventario (33K) puede representar stock ingresado directamente sin traslado SAG, o stock historico. Completamente estanco.

### B33 — Hub de Distribucion

| Flujo | Transferencias | Destino |
|-------|---------------|---------|
| B33 -> B31 | 203 | Tienda |
| B33 -> B11 | 194 | Tienda |
| B33 -> B32 | 188 | Tienda |
| B33 -> B39 | 107 | Tienda |
| B33 -> B52 | 6 | Vendor bodega |
| B33 -> B46 | 2 | Vendor bodega |
| B31/B32/B11/B39 -> B33 | 158 | Devoluciones de tiendas |

**B33 es el hub de distribucion a tiendas y algunos vendors.** Recibe devoluciones y redistribuye. Su stock (23K) es inventario en circulacion comercial.

### B24 — Bodega Textil

| Flujo | Transferencias | Destino |
|-------|---------------|---------|
| B24 -> B00 | 66 | Despacho |
| B24 -> B29 | 49 | Tienda |
| B24 -> B02 | 38 | Tienda |
| B24 -> B23 | 36 | Tienda |

**B24 opera exclusivamente en circuito textil.** Cero relacion con IMPORT.

---

## FASE 6 — Validacion de Regla de Negocio

### Pregunta: Cual debe usarse para alertas de escasez?

**Respuesta: B) B36 + B37**

### Justificacion con Evidencia

1. **B24 no es opcion.** Tiene CERO refs IMPORT (productLine=5). 100% de sus 64 productos son textiles (pL=1, pL=2). Usar B24 clasificaria el 100% de IMPORT como escasez — inutil.

2. **B33 no debe usarse para escasez.** Aunque tiene 651 import refs, B33 es un **hub de distribucion activo** — su stock esta en transito/rotacion hacia tiendas. Usar B33 mediria inventario en circulacion, no inventario disponible para nuevas asignaciones. Ademas, B33 tiene cero conexion con B36/B37 (ni una transferencia), asi que representan realidades separadas.

3. **B36+B37 son los almacenes de importacion puros.**
   - 100% de sus productos son productLine=5
   - B36 recibe de B01 (ingreso de mercancia importada)
   - B37 es completamente estanco (sin transferencias)
   - Representan stock nuevo/disponible, no stock en circulacion
   - Total: 82,356 unidades de inventario import fresco

4. **B36+B37+B33 combinado seria incorrecto** porque mezcla inventario disponible (B36+B37) con inventario en transito/circulacion (B33), creando una vision inflada.

---

## FASE 7 — Impacto en Maletas

### Comparacion de Escenarios (umbral = 10)

| Escenario | Escasez | Saludable | % Escasez |
|-----------|---------|-----------|-----------|
| **A) B24** | **657** | **0** | **100%** |
| **B) B36+B37** (actual) | **478** | **179** | **73%** |
| C) B33 | 490 | 167 | 75% |
| D) B36+B37+B33 | 374 | 283 | 57% |

### Analisis de Diferencias

- **A vs B:** B24 da 100% escasez (inutil). B36+B37 detecta 179 refs saludables reales.
- **B vs D:** Agregar B33 reduciria escasez de 478 a 374 (104 refs menos). Pero B33 es stock en circulacion — no confiable como "disponible".
- **Refs exclusivamente saludables en B33:** 104 refs tienen stock solo en B33. Estas refs tienen inventario circulante pero no stock de importacion nuevo.
- **Refs exclusivamente saludables en B36+37:** 76 refs tienen stock solo en B36+B37.

### Distribucion de Stock Import

| Ubicacion | Qty Total | % | Interpretacion |
|-----------|-----------|---|---------------|
| B36+B37 | 82,356 | 43% | Stock importado disponible |
| B41-B60 (vendors) | 85,537 | 45% | Stock ya distribuido a vendedores |
| B33 | 23,247 | 12% | Stock en hub de distribucion |
| B10 | 395 | <1% | Marginal |

---

## FASE 8 — Recomendacion Final

### FUENTE CORRECTA PARA IMPORT: **B36 + B37**

La implementacion actual en VENDOR-SAMPLE-IMPORT-SCARCITY-ENGINE-01 es **correcta**.

| Aspecto | Decision | Razon |
|---------|----------|-------|
| Fuente de escasez | B36+B37 | Stock importado nuevo, no en circulacion |
| Identificacion | productLine=5 | 657 refs, 100% precision |
| Umbral | 10 unidades | Regla de negocio vigente |
| B24 | DESCARTADA | Cero refs IMPORT |
| B33 | NO incluir | Hub de distribucion, stock en transito |

### Advertencia: 73% en Escasez

El 73% de refs IMPORT estan en escasez. Esto puede indicar:
1. Stock import se consume y no se repone (necesidad de recompra)
2. Muchas refs agotadas historicamente que ya no se comercializan
3. El umbral de 10 puede necesitar revision con el equipo comercial

### Hallazgo No Solicitado: B33

B33 emerge como un actor importante:
- 651 import refs (mas que B36+B37 combinadas: 190 con stock)
- 23K unidades en circulacion activa
- Alimenta tiendas y algunos vendors
- **No esta conectado a B36/B37** — es un circuito separado

Futuro trabajo podria considerar B33 como indicador complementario de "demanda comercial", pero NO como fuente de escasez.

---

## Consultas Ejecutadas

Todas las consultas se ejecutaron contra ProductInventoryLevel + ProductEntity (Prisma/PostgreSQL) e InventoryTransfer/InventoryTransferLine. Organizacion: castillitos. Fecha: 2026-07-02.

### Consultas clave:

```sql
-- IMPORT refs por bodega
SELECT pil."warehouseId", COUNT(DISTINCT pe.sku), SUM(GREATEST(pil.quantity, 0))
FROM "ProductInventoryLevel" pil
JOIN "ProductEntity" pe ON pe.id = pil."productId"
WHERE pe."productLine" = '5'
GROUP BY pil."warehouseId"

-- B24 IMPORT check (resultado: 0)
SELECT COUNT(DISTINCT pe.sku) FROM "ProductInventoryLevel" pil
JOIN "ProductEntity" pe ON pe.id = pil."productId"
WHERE pil."warehouseId" = '24' AND pe."productLine" = '5'

-- Transfers B36/B37 ↔ B33 (resultado: 0)
SELECT * FROM "InventoryTransfer" it
WHERE (it."originWarehouseCode" IN ('36','37') AND it."destinationWarehouseCode" = '33')
   OR (it."originWarehouseCode" = '33' AND it."destinationWarehouseCode" IN ('36','37'))

-- Escenario comparison
SELECT pe.sku,
  SUM(CASE WHEN pil."warehouseId" IN ('36','37') THEN GREATEST(pil.quantity,0) ELSE 0 END) AS b36_37,
  SUM(CASE WHEN pil."warehouseId" = '33' THEN GREATEST(pil.quantity,0) ELSE 0 END) AS b33,
  SUM(CASE WHEN pil."warehouseId" = '24' THEN GREATEST(pil.quantity,0) ELSE 0 END) AS b24
FROM "ProductEntity" pe
LEFT JOIN "ProductInventoryLevel" pil ON pe.id = pil."productId"
WHERE pe."productLine" = '5'
GROUP BY pe.sku
```

---

## Conclusion

**B36+B37 es la fuente correcta y la unica viable para alertas de escasez IMPORT.**

- B24 nunca fue la bodega de importacion — es textil
- B33 es un actor relevante pero su rol es distribucion, no almacenamiento de importaciones
- La implementacion actual en Maletas es correcta
- No se requieren cambios de codigo
