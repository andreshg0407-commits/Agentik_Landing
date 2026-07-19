# CATALOG_FILTER_DECISION.md

## SAG-CATALOG-COMERCIAL-FILTER-02 — Decisión de Filtro Comercial

**Fecha:** 2026-06-23
**Tenant:** Castillitos (cmmpwstuf000dp5y58kj1daaj)
**Fuente:** SAG PYA → ARTICULOS (SELECT * FROM ARTICULOS)
**Análisis:** scripts/_sag-catalog-commercial-analysis.ts

---

## 1. Hallazgos

### 1.1 Volumen Total

| Métrica | Valor |
|---------|-------|
| Filas ARTICULOS totales | 10,440 |
| Filas válidas (con CODIGO) | 10,439 |
| CODIGOs duplicados | 0 |
| Tiempo SOAP | ~40s |

### 1.2 Clase de Artículo (k_sc_clase_articulo)

| Clase | Cantidad | % |
|-------|----------|---|
| **A** (Artículo) | 10,159 | 97.3% |
| **G** (Grupo/Configuración) | 275 | 2.6% |
| **O** (Otro) | 5 | 0.0% |

**Hallazgo:** El 97.3% del catálogo es clase "A". Las clases G y O tienen 0 artículos con precio > 0. La clase NO es un discriminante útil porque casi todo es "A".

### 1.3 Estado Activo/Bloqueado

| Estado | Cantidad | % |
|--------|----------|---|
| Activos (sc_activo=S) | 10,421 | 99.8% |
| Inactivos (sc_activo=N) | 18 | 0.2% |
| Bloqueados (sc_bloqueado=S) | 16 | 0.2% |

**Hallazgo:** Solo 34 artículos están inactivos o bloqueados. No es un filtro significativo por sí solo.

### 1.4 Kardex (sc_maneja_kardex)

| Kardex | Cantidad | % |
|--------|----------|---|
| Sí (S) | 8,739 | 83.7% |
| No (N) | 1,700 | 16.3% |

**Hallazgo crítico:** El 100% de los artículos con precio > 0 también tienen kardex=S. Es decir, `precio > 0` implica `kardex = S` en este catálogo. La condición kardex es redundante pero segura como doble validación.

### 1.5 Distribución de Precios

| Rango | Cantidad | % |
|-------|----------|---|
| = 0 | 5,878 | 56.3% |
| 1 – 999 | 6 | 0.1% |
| 1k – 10k | 88 | 0.8% |
| 10k – 50k | 3,040 | 29.1% |
| 50k – 100k | 1,078 | 10.3% |
| > 100k | 349 | 3.3% |

**Estadísticas de artículos con precio:**
- Mínimo: $0.01 (GPS, bolsas)
- Máximo: $1,680,672 (Set de coche bebé)
- Mediana: $31,126
- Promedio: $51,729

**Hallazgo:** El precio es el discriminante principal. El 56.3% del catálogo tiene precio=0 — son conceptos contables, nómina, servicios, impuestos, CIF, etc.

---

## 2. Ranking de Grupos

| Grupo | Cantidad | % | Con Precio | Con Talla | Descripción inferida |
|-------|----------|---|-----------|-----------|---------------------|
| **134** | 4,254 | 40.8% | 0 | 0 | Insumos/materias primas (apliques, telas) |
| **58** | 2,075 | 19.9% | 1,570 | 2,021 | Confección bebé/niño (pijamas, conjuntos) |
| **135** | 683 | 6.5% | 0 | 0 | Apliques y sublimación |
| **148** | 663 | 6.4% | 658 | 659 | Artículos bebé (coches, cunas, almohadas) |
| **139** | 502 | 4.8% | 484 | 502 | Pijamas niño |
| **138** | 437 | 4.2% | 424 | 437 | Pijamas/conjuntos niña |
| **124** | 281 | 2.7% | 0 | 0 | Conceptos contables (PUC) |
| **145** | 263 | 2.5% | 257 | 262 | Ropa baby niña |
| **144** | 256 | 2.5% | 250 | 256 | Ropa baby niño |
| **143** | 238 | 2.3% | 233 | 238 | Ropa kids niña |
| **142** | 208 | 2.0% | 206 | 208 | Ropa kids niño |
| **141** | 174 | 1.7% | 166 | 174 | Conjuntos bebé niño |
| **140** | 171 | 1.6% | 148 | 171 | Conjuntos bebé niña |
| **149** | 150 | 1.4% | 147 | 150 | Mascotas (juguetes, accesorios) |
| Otros | ~94 | ~0.9% | ~20 | ~22 | Bolsas, servicios, nómina, etc. |

**Hallazgos:**
1. Grupo 134 (40.8% del catálogo) son insumos/apliques — 0 con precio → NO comerciales
2. Grupo 135 (6.5%) son apliques/sublimación — 0 con precio → NO comerciales
3. Grupo 124 (2.7%) son conceptos PUC contables → NO comerciales
4. Los grupos comerciales son: 58, 138-149 (ropa, bebé, mascotas)

---

## 3. Ranking de Líneas

| Línea | Cantidad | % | Con Precio | Con Talla | Descripción inferida |
|-------|----------|---|-----------|-----------|---------------------|
| **(sin línea)** | 6,272 | 60.1% | 656 | 966 | Mixto: contables + insumos + algunos comerciales |
| **1** | 1,874 | 18.0% | 1,743 | 1,872 | Ropa niño |
| **2** | 1,595 | 15.3% | 1,482 | 1,584 | Ropa niña |
| **5** | 659 | 6.3% | 657 | 656 | Artículos bebé (coches, cunas) |
| **3** | 26 | 0.2% | 20 | 11 | Bolsas/empaques |
| **4** | 13 | 0.1% | 3 | 13 | Pijamas Power (descontinuado?) |

**Hallazgo:** Las líneas son FKs numéricos. Líneas 1, 2 y 5 concentran el 93% de los comerciales. La línea vacía (60%) mezcla contables e insumos — no es segura como filtro.

---

## 4. Análisis de Variantes (sobre vendibles)

| Métrica | Cantidad | % de vendibles |
|---------|----------|---------------|
| Vendibles totales | 4,561 | 100% |
| Con talla/color | 4,536 | 99.5% |
| Simples (sin variantes) | 25 | 0.5% |

**Hallazgo crítico:** El 99.5% de los productos comerciales de Castillitos manejan variantes talla/color. Los 25 simples son bolsas, GPS, saldos y accesorios menores.

**Impacto sobre módulos:**
- **Pedidos:** Debe soportar selección de talla/color
- **Tiendas:** Inventario debe ser a nivel variante
- **Inventario:** SAG INVENTARIO probablemente es por talla/color
- **Producción:** Órdenes de producción a nivel referencia, no variante

---

## 5. Criterios de Exclusión

Los siguientes artículos NO son comerciales:

1. **Precio = 0** (5,878 artículos) — conceptos contables, insumos, materias primas, nómina, impuestos
2. **Inactivos** (18 artículos) — descontinuados
3. **Bloqueados** (16 artículos) — impedidos operativamente
4. **Grupo 134** — insumos/apliques (4,254 artículos, todos precio=0)
5. **Grupo 135** — apliques sublimación (683 artículos, todos precio=0)
6. **Grupo 124** — conceptos PUC contables (281 artículos, todos precio=0)

---

## 6. Criterios de Inclusión

Un artículo es comercial si cumple TODAS estas condiciones:

```
sc_activo = 'S'
sc_bloqueado = 'N'
n_valor_venta_normal > 0
sc_maneja_kardex = 'S'
```

---

## 7. Regla Propuesta: `isCommercialArticle()`

```typescript
function isCommercialArticle(row: SagArticleRawRow): boolean {
  return (
    bool(row.sc_activo) &&
    !bool(row.sc_bloqueado) &&
    num(row.n_valor_venta_normal) > 0 &&
    bool(row.sc_maneja_kardex)
  );
}
```

**Resultado:** 4,561 artículos comerciales (43.7% del catálogo).

**Validación:** En Castillitos, `precio > 0` implica `kardex = S` (correlación 100%). La condición kardex es redundante pero se incluye como guardia defensiva para otros tenants futuros donde podría no cumplirse esta correlación.

### Reglas candidatas evaluadas

| Regla | Resultado | Nota |
|-------|-----------|------|
| R1: activo + !bloq + precio>0 | 4,561 | **Equivalente a R2 en Castillitos** |
| R2: R1 + kardex | 4,561 | **RECOMENDADA — más defensiva** |
| R3: R1 + clase=O | 0 | Clase O tiene 0 comerciales |
| R5: R1 + tiene línea | 3,905 | Excluye 656 comerciales legítimos sin línea |
| R6: R1 + kardex + línea | 3,905 | Demasiado restrictivo |

---

## 8. Riesgos Identificados

### Riesgo 1: Artículos baratos limítrofes
Los 6 artículos con precio entre $0.01 y $0.10 (GPS, bolsas) son artículos auxiliares, no productos vendibles reales. Sin embargo, su impacto es despreciable (0.1% del catálogo comercial).

**Mitigación:** Aceptable para V1. Si se requiere exclusión, agregar `precio >= 1000` (pierde bolsas pero mantiene todos los productos reales).

### Riesgo 2: Grupos y líneas son FKs numéricos
Los valores de `ka_ni_grupo` y `ka_nl_linea` son IDs numéricos (29, 58, 134...), no nombres legibles. Para mostrar "Pijamas Niño" en la UI se necesitan las tablas maestras GRUPOS_ARTICULOS y LINEAS_ARTICULOS.

**Mitigación:** Sprint futuro SAG-MASTER-LOOKUPS-01 para resolver FKs a nombres.

### Riesgo 3: 99.5% con variantes talla/color
Casi todos los productos comerciales manejan variantes. Si Pedidos/Tiendas no soportan variantes, mostrarán datos incompletos.

**Mitigación:** Priorizar sprint de variantes antes de activar búsqueda de productos en POS.

### Riesgo 4: ss_detalle_artic2 contiene colores
El campo secundario `ss_detalle_artic2` contiene descripciones de color ("AZUL AGUA", "FUCSIA", etc.) pero está vacío en el 100% mostrado (solo lleno en ~0.4% de filas). No es fuente confiable de color.

### Riesgo 5: 656 artículos comerciales sin línea
Hay 656 artículos con precio > 0 que no tienen línea asignada. Son legítimos (grupo 148 = artículos bebé). Si se filtra por "tiene línea", se pierden.

**Mitigación:** NO usar línea como criterio obligatorio.

---

## 9. Recomendaciones

1. **Aprobar regla R2** como definición oficial de producto comercial para Castillitos
2. **NO ejecutar Full Sync todavía** — primero limpiar los 100 productos piloto (contables) insertados en la fase anterior
3. **Ejecutar sync filtrado** con `isCommercialArticle()` para importar solo los 4,561 productos reales
4. **Sprint SAG-MASTER-LOOKUPS-01** para resolver grupo/línea a nombres legibles
5. **Sprint SAG-VARIANTS-01** para importar variantes talla/color desde la tabla correspondiente
6. **Sprint SAG-INVENTORY-SYNC-01** solo después de tener el catálogo comercial limpio

---

## 10. Entregable Final

```
CATÁLOGO TOTAL:              10,439
CATÁLOGO COMERCIAL:          4,561
CATÁLOGO NO COMERCIAL:       5,878
REFERENCIAS CON TALLA/COLOR: 4,536

REGLA PROPUESTA:
  sc_activo = 'S'
  sc_bloqueado = 'N'
  n_valor_venta_normal > 0
  sc_maneja_kardex = 'S'

RIESGOS IDENTIFICADOS:
  1. 6 artículos limítrofes (precio < $1) — despreciable
  2. Grupos/líneas son FKs numéricos — necesitan lookup
  3. 99.5% con variantes — módulos deben soportarlas
  4. 656 comerciales sin línea — no usar línea como filtro
  5. Productos piloto contables en DB — limpiar antes de sync

FULL SYNC RECOMENDADO: NO
SYNC FILTRADO RECOMENDADO: SÍ (después de aprobar esta regla)
```
