# CUSTOMER-GEOGRAPHY-AUDIT-01 -- Audit Report

**Date:** 2026-07-04
**Status:** COMPLETE
**Type:** READ-ONLY AUDIT (no data modified)

---

## FASE 1 -- Inventario de Clientes

| Metrica | Valor | % |
|---------|-------|---|
| Total clientes | 33,229 | 100% |
| Clientes activos | 33,229 | 100% |
| Clientes con campo ciudad | 32,340 | 97.3% |
| Clientes sin ciudad | 889 | 2.7% |
| Ciudad es codigo DANE (5 digitos) | 3,132 | 9.4% |
| Ciudad es numerico no-DANE | 29,208 | 87.9% |
| Ciudad es texto legible | 0 | 0% |
| Clientes con departamento | 46 | 0.1% |
| Clientes con direccion | 0 | 0% |

---

## FASE 2 -- Campos de Origen

### CustomerProfile (Prisma)

| Campo | Tipo | Estado |
|-------|------|--------|
| `city` | `String?` | Poblado en 97.3%. Contiene codigos numericos (SAG FK o DANE). |
| `department` | `String?` | Poblado en 0.1% (46 clientes). Contiene codigos DANE de 2 digitos. |
| `address` | `String?` | Vacio en 100% de clientes. |

### rawCrmJson (CRM SuiteCRM V8)

30,262 clientes tienen `rawCrmJson`. Campos geograficos disponibles:

| Campo CRM | Clientes | Contenido |
|-----------|----------|-----------|
| `billing_address_city` | 30,262 | Codigos DANE DIVIPOLA (5 digitos) |
| `billing_address_state` | 30,262 | Codigos DANE departamento (2 digitos) |
| `billing_address_country` | 30,262 | "CO" o similar |
| `billing_address_street` | 30,262 | Direccion (calidad variable) |
| `billing_address_postalcode` | 30,262 | Codigo postal |
| `shipping_address_city` | 30,262 | Codigos DANE (duplican billing) |
| `shipping_address_state` | 30,262 | Codigos DANE departamento |

### Fuentes de datos geograficos

| Fuente | Campo ciudad | Formato | Calidad |
|--------|-------------|---------|---------|
| **CRM** (SuiteCRM V8) | `billing_address_city` | Codigo DANE 5 digitos | **EXCELENTE** — 29,883 con DANE valido |
| **SAG** (TERCEROS) | `ka_ni_ciudad` | Integer FK interno SAG | **NO RESOLUBLE** — sin tabla lookup |

---

## FASE 3 -- Top Codigos de Ciudad

### Codigos mas frecuentes

| Codigo | Clientes | Tipo | Origen probable |
|--------|----------|------|-----------------|
| `1` | 28,721 | SAG FK | ka_ni_ciudad = 1 (sobreescribe DANE) |
| `(vacio)` | 889 | — | Sin dato |
| `28` | 438 | SAG FK | ka_ni_ciudad = 28 |
| `1994` | 192 | SAG FK* | 4 digitos, no es DANE |
| `1001` | 145 | SAG FK* | 4 digitos, no es DANE |
| `1111` | 132 | SAG FK* | 4 digitos, no es DANE |
| `1142` | 127 | SAG FK* | 4 digitos, no es DANE |
| `1769` | 92 | SAG FK* | 4 digitos, no es DANE |
| `05001` | 33 | DANE | Medellin (Antioquia) |
| `11001` | — | DANE | Bogota DC |
| `76001` | — | DANE | Cali (Valle) |
| `50001` | — | DANE | Villavicencio (Meta) |

*Los codigos de 4 digitos (1001, 1111, 1142, etc.) son FK internos de SAG,
NO son codigos DANE. DANE siempre usa 5 digitos (2 dept + 3 municipio).

485 valores distintos de ciudad en total.

### El codigo "1" domina

**28,721 clientes (86.4%)** tienen `city = "1"`. Este es `ka_ni_ciudad = 1`
de SAG, que probablemente apunta a una ciudad default o a Medellin en la
tabla interna de SAG. No es resoluble sin acceso a la tabla SAG de ciudades.

---

## FASE 4 -- Muestra Real

### Clientes con DANE (resueltos correctamente)

| Cliente | NIT | City | Ciudad | Dept | Fuente |
|---------|-----|------|--------|------|--------|
| ADELAIDA OROZCO | — | 05001 | Medellin | 05 | CRM/DANE |
| MONICA JARAMILLO | 43569569 | 05001 | Medellin | 05 | CRM/DANE |
| ISABELLA BOTERO | 1035850143 | 05001 | Medellin | 05 | CRM/DANE |
| MELISSA JIMENEZ | 1039453783 | 11001 | Bogota DC | 11 | CRM/DANE |
| LEIDY BERNAL | 1122665116 | 50001 | Villavicencio | 50 | CRM/DANE |
| STEPHANIE GALLEGO | 1143837202 | 76001 | Cali | 76 | CRM/DANE |

### Clientes con SAG FK (no resolubles)

| Cliente | NIT | City | Ciudad | Dept | Fuente |
|---------|-----|------|--------|------|--------|
| PAOLA GONZALEZ | 15930 | 1 | (codigo SAG) | — | SAG |
| PAULA RIVERA | 15932 | 1 | (codigo SAG) | — | SAG |
| JERALDIN MONTOYA | 15935 | 1 | (codigo SAG) | — | SAG |
| HUMBERTO ZAPATA | 14503 | 1 | (codigo SAG) | — | SAG |
| DIANA POSADA | 4981 | 1 | (codigo SAG) | — | SAG |

### Clientes sin ciudad

| Cliente | NIT | City | Dept |
|---------|-----|------|------|
| SANDRA MENECES | — | (vacio) | — |
| ESTIVEN MARULANDA | 15956 | (vacio) | — |
| ERIKA MORALES | 27549 | (vacio) | — |

---

## FASE 5 -- Trazabilidad: HALLAZGO CRITICO

### El CRM tiene codigos DANE. SAG los sobreescribe.

Verificacion directa de `rawCrmJson.raw.billing_address_city` vs `city` almacenada:

| Cliente | billing_address_city (CRM) | city (almacenada) |
|---------|---------------------------|-------------------|
| PAOLA GONZALEZ | **05001** | **1** |
| PAULA RIVERA | **05001** | **1** |
| JERALDIN MONTOYA | **05001** | **1** |
| YASMIN GUSMAN | **05001** | **1** |
| HUMBERTO ZAPATA | **05001** | **1** |
| SHARLOT MORA | **05001** | **1** |
| DIANA POSADA | **05001** | **1** |
| JOHANA MESA | **05001** | **1** |
| LAURA OQUENDO | **05001** | **1** |
| ANDREA TORRES | **05001** | **1** |
| ADELAIDA OROZCO | **05001** | **05001** |

**20 de 20 muestras confirman:** CRM almacena `billing_address_city = "05001"` (Medellin).
Pero el campo `city` del perfil muestra `"1"` (SAG FK).

**Solo los clientes que no pasaron por SAG sync conservan el codigo DANE.**

### Causa raiz identificada

Pipeline de sincronizacion:

```
1. CRM sync (castillitos-crm/storage.ts):
   city: record.address?.city → "05001" (DANE)   ← CORRECTO

2. SAG sync (sag-pya-soap/mappers.ts):
   city: ka_ni_ciudad → "1" (SAG internal FK)    ← SOBREESCRIBE DANE
```

El SAG mapper en `lib/connectors/adapters/sag-pya-soap/mappers.ts` linea 158-181
pasa `ka_ni_ciudad` (integer FK de la tabla SAG CIUDADES) como `city`.
El storage lo escribe directamente al perfil, sobreescribiendo el DANE del CRM.

### Estadisticas de billing_address_city en CRM raw

| Tipo | Clientes | % |
|------|----------|---|
| Codigo DANE valido | 29,883 | 98.7% de CRM |
| Numerico no-DANE | 0 | 0% |
| Texto | 0 | 0% |
| CRM sin rawCrmJson | 2,967 | — |

### Codigos SAG internos (no-DANE)

| Codigo SAG | Clientes |
|------------|----------|
| 1 | 28,721 |
| 28 | 438 |
| 996 | 13 |
| 989 | 8 |
| 9 | 6 |
| 991 | 6 |
| 986 | 6 |
| 999 | 3 |
| 992 | 2 |

Estos son valores de `ka_ni_ciudad` de SAG. Sin acceso a la tabla
`CIUDADES` de SAG, no pueden resolverse a nombres.

### Departamento

Solo 46 clientes (0.1%) tienen departamento poblado. Todos son codigos DANE
de 2 digitos (05, 11, 50, 76, etc.) que provienen de CRM y no fueron
sobreescritos porque SAG usa un campo diferente (`ka_nl_departamento`).

---

## FASE 6 -- Estimacion de Normalizacion

### Clasificacion de clientes

| Categoria | Clientes | % | Accion |
|-----------|----------|---|--------|
| A) Con DANE en rawCrmJson | 29,883 | 89.9% | **Automatica:** re-leer `billing_address_city` + `billing_address_state` del CRM raw |
| B) Con DANE ya en city | 3,132 | 9.4% | **Automatica:** ya resolubles via dane-municipios.ts |
| C) Solo SAG FK (sin CRM raw) | 1,325 | 4.0% | **Requiere mapping SAG** o captura manual |
| D) Sin ciudad | 889 | 2.7% | **Captura manual** |

**Nota:** Las categorias A y B se superponen. Contando sin duplicar:

| Estado | Clientes | % |
|--------|----------|---|
| Recuperables automaticamente (DANE en raw o en city) | ~30,262 | ~91.1% |
| Requiere mapping SAG o captura | ~2,967 | ~8.9% |

### Estrategia de normalizacion

```
PASO 1: Para clientes con rawCrmJson:
  city       ← resolveDaneCode(raw.billing_address_city)
  department ← resolveDaneCode(raw.billing_address_state) [departamento]

PASO 2: Para clientes con DANE ya en city:
  Ya resolubles con dane-municipios.ts existente

PASO 3: Para clientes con SAG FK (sin CRM raw):
  Opcion A: Obtener tabla CIUDADES de SAG (JOIN)
  Opcion B: Marcar como "pendiente revision"

PASO 4: Prevenir re-sobreescritura:
  SAG sync NO debe escribir ka_ni_ciudad en city
  Solo CRM debe escribir city (tiene DANE)
```

---

## FASE 7 -- Impacto Comercial

### Lo que habilita la normalizacion geografica

| Capacidad | Estado actual | Con geografia normalizada |
|-----------|---------------|---------------------------|
| Ventas por ciudad | Imposible (city = "1") | Reportes por municipio DANE |
| Cartera por ciudad | Imposible | Deuda agrupada por region |
| Clientes por ciudad | Solo 3,132 (9.4%) | 30,262+ (91%+) |
| Cobertura vendedores | Sin dimension geografica | Mapa de cobertura por zona |
| Inteligencia geografica | No disponible | Heatmaps de demanda, rutas optimas |
| Segmentacion | Solo por vendedor/segmento | Ciudad + departamento + region |
| Dashboard ejecutivo | Sin KPI geografico | "Top 10 ciudades por venta" |
| David (Copilot) | No puede responder "que ciudad compra mas?" | Respuestas con evidencia real |

### Preguntas comerciales que se desbloquean

- "Que ciudad compra mas?"
- "Donde esta cayendo la cartera?"
- "Que cobertura tiene cada vendedor por zona?"
- "Donde no tenemos presencia?"
- "Que departamento tiene mas morosidad?"
- "Cuantos clientes nuevos ganamos en Bogota este mes?"

---

## FASE 8 -- Recomendacion

### D) Combinacion: datos parciales CRM + correccion de integracion

**El CRM ya tiene la geografia correcta.** 29,883 clientes tienen codigos DANE
validos en `rawCrmJson.raw.billing_address_city`. El problema es que SAG los
sobreescribe con FK internos no resolubles.

### Plan de accion recomendado

**Sprint 1: CUSTOMER-GEOGRAPHY-RECOVERY-01** (estimado: 1 sprint)

1. **Backfill desde rawCrmJson:** Para los ~30,262 clientes con CRM raw,
   re-leer `billing_address_city` y `billing_address_state`, resolver via
   dane-municipios.ts, y actualizar `city` + `department`.

2. **Corregir SAG sync:** En `sag-pya-soap/mappers.ts`, NO emitir
   `ka_ni_ciudad` como `city`. SAG city FK solo es util con la tabla
   lookup de SAG (que no tenemos). CRM es la fuente autoritativa para
   geografia.

3. **Prioridad CRM en storage:** En `castillitos-crm/storage.ts`, la
   regla debe ser: "CRM city (DANE) tiene prioridad sobre SAG city (FK).
   SAG sync no debe sobrescribir city si ya tiene un valor DANE valido."

4. **Extender dane-municipios.ts:** El catalogo actual tiene los
   municipios mas comunes. Necesita extenderse para cubrir los ~485
   codigos DANE distintos encontrados en los datos.

**Sprint 2: CUSTOMER-GEOGRAPHY-SAG-LOOKUP-01** (opcional, despues de Sprint 1)

Para los ~2,967 clientes sin CRM raw (solo SAG):
- Solicitar tabla CIUDADES de SAG para mapear `ka_ni_ciudad` → nombre
- O marcar como "revision manual" y capturar en proximo contacto comercial

---

## Archivos Analizados (read-only)

| Archivo | Hallazgo |
|---------|----------|
| `prisma/schema.prisma` (CustomerProfile) | city/department/address — city poblado 97%, department 0.1%, address 0% |
| `lib/connectors/adapters/castillitos-crm/mappers.ts` | CRM mapper usa `billing_address_city` (DANE) correctamente |
| `lib/connectors/adapters/castillitos-crm/storage.ts` | Escribe `record.address?.city` (DANE) en CustomerProfile.city |
| `lib/connectors/adapters/sag-pya-soap/mappers.ts` | SAG mapper emite `ka_ni_ciudad` (FK interno) como city -- **SOBREESCRIBE DANE** |
| `lib/comercial/clientes/city-resolver.ts` | `resolveCity()` ya maneja DANE + supresion de numericos |
| `lib/comercial/foundation/dane-municipios.ts` | Catalogo DANE parcial (municipios comunes). Necesita extension. |
| `scripts/_audit-customer-geography.ts` | Script de auditoria ejecutado contra BD Neon (read-only) |
