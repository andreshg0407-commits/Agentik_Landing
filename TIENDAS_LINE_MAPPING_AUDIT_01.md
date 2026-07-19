# TIENDAS-LINE-MAPPING-AUDIT-01

**Status:** COMPLETE
**TSC:** 160 (no code changes)
**Type:** READ-ONLY audit

---

## Objetivo

Validar con evidencia real que el mapping SAG productLine implementado en TIENDAS-LINE-BUSINESS-MODEL-01 corresponde al negocio real de Castillitos.

## Datos auditados

- Tenant: castillitos
- Total ProductEntity: 4,565
- Total ProductVariant: ~85,338
- Total ProductInventoryLevel: ~157,101

---

## Distribucion por productLine

| productLine | productos | variantes | PIL | subgrupos | % talla | % color |
|---|---|---|---|---|---|---|
| 1 | 1,743 | 32,037 | 67,007 | 15 | 0% | 0% |
| 2 | 1,482 | 17,083 | 75,363 | 26 | 2% | 2% |
| 3 | 20 | 97 | 172 | 1 | 0% | 0% |
| 4 | 3 | 108 | 240 | 0 | 0% | 0% |
| 5 | 657 | 1,683 | 8,123 | 52 | 23% | 23% |
| "Castillitos" | 1 | 0 | 0 | 0 | — | — |
| "Latin Kids" | 3 | 0 | 0 | 0 | — | — |
| NULL | 656 | 2,330 | 6,196 | 9 | 9% | 9% |

---

## productLine = 1

**Mapping actual:** castillitos
**Conclusion:** SI

### Evidencia

- Subgrupos: PIJAMA CL 2-8 (189), PIJAMA CC 2-8 (141), PIJAMA CL 10-16 (140), PIJAMA CC 10-16 (121), PIJAMA LL 2-8 (114), PIJAMA MESES CL (99), PIJAMA MESES LL (95), PIJAMA LL 10-16 (94), CONJUNTO 2-12 (66), CONJUNTO NAUTICO MESES (55)
- Nombres: "PIJAMA NINO CL 2-8" (129), "PIJAMA NINA CL 2-8" (108), "CONJ. NAUTICO BEBE" (48)
- Prefijos: L- = 99.8% (1,740/1,743)
- 100% textile: pijamas y conjuntos nauticos para ninos
- Talla/color: 0% (atributos no poblados para esta linea)

**Confianza: 99%**

---

## productLine = 2

**Mapping actual:** latin_kids
**Conclusion:** SI

### Evidencia

- Subgrupos: CONJUNTO CL (155), CONJUNTO CC (150), PIJAMA CL (147), PIJAMA LL (126), VESTIDO (67), CAMISETA (61), CAMIBUSO (38), BUZO (36), TRIO (22), POLO (18), BLUSAS (18)
- Nombres: "PIJAMA CORTA LARGA NINA KIDS" (41), "VESTIDO NINA KIDS" (33), "CAMISETA NINO KIDS" (23)
- Prefijos: C- (637), CGJ- (124), CF- (112), CV- (106), CG- (100) — familia C
- 100% textile: ropa infantil variada (no solo pijamas)
- Talla/color: 2% (minimo)

**Confianza: 97%**

---

## productLine = 3

**Mapping actual:** castillitos
**Conclusion:** PARCIAL (aceptable)

### Evidencia

- Solo 20 productos (0.4% del total)
- Subgrupos: PIJAMAS DAMA (7 productos)
- Contenido mixto: 7 pijamas dama + 8 tapabocas + 4 bolsas + 1 caja
- Prefijos: TAP- (8), DA- (7), BP/BM/BG/BE (4), CC (1)
- Es linea "otros Castillitos" — no puramente textile pero pertenece a la marca

**Confianza: 75%**

---

## productLine = 4

**Mapping actual:** accesorios_importacion
**Conclusion:** INCORRECTO (impacto negligible)

### Evidencia

- Solo 3 productos (0.07% del total)
- Subgrupos: 0 (todos null)
- Nombres: "PIJAMA NINO 2-8 POWER" (2), "PIJAMAS NINO 2-8 POWER" (1)
- Prefijo: P-
- Estos son pijamas textiles, NO accesorios
- Deberia ser `castillitos` pero solo son 3 productos con 108 variantes

**Confianza: 60% (dato insuficiente)**

---

## productLine = 5

**Mapping actual:** accesorios_importacion
**Conclusion:** SI

### Evidencia

- Subgrupos (52 distintos): ALIMENTACION (70), DORMITORIO (67), JUGUETERIA (58), CUIDADO DENTAL (42), TRANSPORTE (37), ACCESORIOS NINA (34), BOLSOS (33), ASEO (31), COSAS VARIAS BEBE (31), PELUCHE (21), MOTO (15), CAMINADOR (14), CUNA (14), TERMOS (14)
- Nombres: "MONO DE BEBE" (21), "RASCA ENCIAS" (17), "TETERO" (16), "MORRAL INFANTIL" (15), "MOTO INFANTIL" (8)
- Prefijos: C (413, sin guion = codigos de importacion), HC (8), CAS- (7), K (7)
- 100% accesorios/importacion: articulos de bebe, juguetes, mobiliario, higiene
- Talla/color: 23% (algunos items con variantes de color)

**Confianza: 98%**

---

## productLine = "Castillitos" / "Latin Kids" (texto)

- 4 productos en total con productLine como texto en vez de numero
- 0 variantes, 0 PIL
- Entradas manuales, sin impacto operacional

---

## productLine = NULL

**Mapping actual:** accesorios_importacion (default)
**Conclusion:** PARCIAL

### Evidencia

- 656 productos (14.4% del total), 2,330 variantes, 6,196 PIL
- **Dos poblaciones distintas:**

**Poblacion 1: Pet products (147 productos con subgrupoSag)**
- JUGUETES PERROS Y GATOS (33), PASEO PERROS (33), ALIMENTACION PERROS Y GATOS (22), PASEO (22), DESCANSO PERROS Y GATOS (13), HIGIENE GATOS (9), HIGIENE PERROS Y GATOS (8), TRANSPORTE PERROS Y GATOS (6)
- Estos SI son accesorios/importacion — mapping correcto

**Poblacion 2: Textile spillover (509 productos sin subgrupoSag)**
- Nombres: "PIJAMA NINO CL 2-8" (22), "PIJAMA NINA CL 2-8" (21) — mismo patron que linea 1
- Prefijos: L- (275 = Castillitos), C- (220 = Latin Kids o importacion)
- Estos NO son accesorios — son productos textiles sin productLine asignado en SAG

**Impacto:** ~275 productos Castillitos y ~220 Latin Kids estan siendo clasificados como accesorios

---

## Prefijos de referencia por linea

| Prefijo | Linea | Correlacion |
|---|---|---|
| L- | 1 | 99.8% (1,740/1,743) |
| C- familia | 2 | 100% (1,482/1,482) |
| TAP- / DA- | 3 | Tapabocas / Dama |
| P- | 4 | Power pijamas |
| C (sin guion) | 5 | Codigos importacion |
| L- | NULL | 275 = spillover Castillitos |
| C- | NULL | 220 = spillover Latin Kids |

---

## Logica textile vs accesorio

| Linea | Talla? | Color? | SubgrupoSag? | Logica |
|---|---|---|---|---|
| 1 | 0% | 0% | 70% | Textile (sin talla/color) |
| 2 | 2% | 2% | 63% | Textile (sin talla/color) |
| 3 | 0% | 0% | 35% | Textile (parcial) |
| 4 | 0% | 0% | 0% | Textile (por nombre) |
| 5 | 23% | 23% | 99.8% | Accesorio |
| NULL | 9% | 9% | 22% | Mixto |

**Hallazgo critico:** Los atributos talla/color NO estan poblados para lineas 1/2/3/4. Las reglas de surtido textil deben funcionar con subgrupoSag, NO con talla+color.

---

## Matriz final

| productLine | Nombre sugerido | Clase | Confianza | Mapping actual | Correcto? |
|---|---|---|---|---|---|
| 1 | Castillitos | textile | 99% | castillitos | SI |
| 2 | Latin Kids | textile | 97% | latin_kids | SI |
| 3 | Castillitos Otros | textile | 75% | castillitos | ACEPTABLE |
| 4 | (Pijamas Power) | textile | 60% | accesorios_importacion | INCORRECTO (3 prods) |
| 5 | Accesorios / Importacion | accessory | 98% | accesorios_importacion | SI |
| NULL | Mixto | mixed | 40% | accesorios_importacion | PARCIAL |

---

## Riesgos

1. **NULL line (656 productos, 14.4%):** ~275 pijamas Castillitos clasificados como accesorios. Afecta reglas de surtido: estos productos recibiran logica de accesorios en vez de textil.

2. **Talla/color NO poblados (lineas 1-4):** Las funciones `inferProductClass` que usan talla+color como indicador de textil (`if (v.size && v.size !== "SIN_TALLA"...`) nunca se activan para estas lineas. Solo funciona el fallback por subgrupoSag o business line.

3. **Line 4 (3 pijamas como accesorios):** Impacto negligible pero conceptualmente incorrecto.

---

## Recomendacion final

### B) Parcialmente correcto

El mapping es **correcto para el 85% de los productos** (lineas 1, 2, 5) que representan el 96% del inventario (PIL).

### Correcciones sugeridas (sprint futuro)

1. **Inmediata (bajo riesgo):**
   - Line 4 → `castillitos` (3 productos)
   - Agregar `"Castillitos"` y `"Latin Kids"` (texto) al SAG_LINE_MAP

2. **Media prioridad:**
   - NULL con prefijo L- → `castillitos` (275 productos)
   - NULL con subgrupos pet → `accesorios_importacion` (147 productos)

3. **Requiere decision de negocio:**
   - NULL con prefijo C- → podria ser Latin Kids o importacion (220 productos)
   - Considerar crear linea "mascotas" separada

### No se requieren cambios inmediatos para continuar construyendo reglas sobre lineas 1/2/5.

---

## Archivos creados

| Archivo | Proposito |
|---|---|
| `scripts/audit-tiendas-line-mapping.ts` | Audit read-only contra Prisma |
| `scripts/validate-tiendas-line-mapping-audit.ts` | Validacion estructural |
| `TIENDAS_LINE_MAPPING_AUDIT_01.md` | Este reporte |
