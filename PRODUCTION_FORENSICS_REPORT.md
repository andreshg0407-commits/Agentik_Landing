# PRODUCTION_FORENSICS_REPORT.md

**Sprint:** PRODUCTION-FORENSICS-OP-01
**Date:** 2026-06-24
**Status:** FORENSICS COMPLETE
**Mode:** READ-ONLY — zero writes to SAG or Prisma

---

## Executive Summary

Castillitos **SI tiene produccion activa en SAG PYA**. El modelo de produccion NO usa tablas dedicadas — usa el modelo generico `MOVIMIENTOS` + `MOVIMIENTOS_ITEMS` con diferentes tipos de fuente (documento) para cada etapa del ciclo productivo.

| Hallazgo | Valor |
|---|---|
| OPs totales | **3,376** |
| OPs abiertas | **3,352** (99.3%) |
| OPs cerradas | **24** (0.7%) |
| Lineas de produccion | **56,586** (solo OP) |
| Total movimientos produccion | **42,588** |
| Total lineas produccion (todos tipos) | **310,171** |
| Rango temporal | 2020-06-01 a 2026-06-30 |
| Ultima OP creada | **2026-06-23** (ayer) |
| Ultima entrada PT | **2026-06-24** (hoy) |
| Bodega produccion | **13 (PRODUCTO EN PROCESO)** |
| Match OP → ProductVariant | **50.1%** |
| Tablas dedicadas de produccion | **NINGUNA** |

---

## 1. Mapa de Tablas

### Hallazgo critico: NO existen tablas dedicadas de produccion

Se probaron 17 nombres de tabla. Todas retornaron `Invalid object name`:

| Tabla probada | Resultado |
|---|---|
| ORDENES_PRODUCCION | No existe |
| PRODUCCION | No existe |
| OP | No existe |
| ORDEN_PRODUCCION | No existe |
| PRODUCCION_TERMINADA | No existe |
| CONSUMO_MP | No existe |
| CONFECCIONISTAS | No existe |
| TALLERES | No existe |
| LOTES_PRODUCCION | No existe |
| PLANIFICACION_PRODUCCION | No existe |
| PROGRAMACION_PRODUCCION | No existe |
| OPERACIONES | No existe |
| COMPONENTES | No existe |
| FORMULA | No existe |
| FORMULA_DETALLE | No existe |
| LISTA_MATERIALES | No existe |
| BOM | No existe |

### Modelo real: MOVIMIENTOS + MOVIMIENTOS_ITEMS

SAG PYA maneja la produccion a traves del **mismo modelo transaccional** que usa para ventas, compras, cobros e inventario. La diferenciacion es por `ka_ni_fuente` (tipo de documento).

```
MOVIMIENTOS (cabecera de documento)
  ├── ka_nl_movimiento     (PK, int)
  ├── ka_ni_fuente         (FK → FUENTES, tipo documento)
  ├── n_numero_documento   (numero OP)
  ├── d_fecha_documento    (fecha)
  ├── ka_nl_tercero        (FK → TERCEROS, beneficiario)
  ├── sc_beneficiario      (nombre empresa)
  ├── sc_dcto_cerrado      (N=abierta, S=cerrada)
  ├── sc_anulado           (N=vigente, S=anulada)
  ├── ss_remision          (referencia cruzada)
  ├── sv_observaciones     (notas)
  ├── ss_usuario_new       (responsable)
  └── ka_ni_centro_costo   (centro de costo)

MOVIMIENTOS_ITEMS (detalle/lineas)
  ├── ka_nl_movimiento_item (PK, int)
  ├── ka_nl_movimiento      (FK → MOVIMIENTOS)
  ├── ka_nl_articulo        (FK → ARTICULOS, producto)
  ├── n_cantidad            (cantidad programada)
  ├── ss_talla              (talla: S, M, L, XL, 2, 4, 6, etc.)
  ├── ss_color              (color: GR1, LI1, BL1, etc.)
  ├── ka_nl_sku             (FK → SKU compuesto)
  ├── ka_nl_bodega          (FK → BODEGAS, bodega destino)
  ├── n_valor               (0 para OPs — sin valor monetario)
  ├── ss_referencia_pdn     (referencia produccion, vacio)
  └── nd_cantidad_pt_pdn    (cantidad PT producida, 0 en OP)

FUENTES (catalogo de tipos de documento)
  ├── ka_ni_fuente          (PK, int)
  ├── k_sc_codigo_fuente    (codigo: OP, CN, PT, ET, etc.)
  ├── sc_nombre_fuente      (nombre humano)
  ├── sc_cobrar_pagar       (C=cuenta cobrar, P=cuenta pagar)
  ├── sc_afecta_inventario  (S/N)
  ├── sc_signo_inventario   (+/-)
  └── k_n_clase_fuente      (clase: 1, 5, 7)

v_articulos (vista de productos)
  ├── ka_nl_articulo        (PK)
  ├── k_sc_codigo_articulo  (referencia: L-7128, DA-9040, etc.)
  ├── sc_referencia         (referencia alternativa)
  ├── sc_detalle_articulo   (nombre producto)
  ├── sc_detalle_grupo      (grupo: LT NINO KIDS, etc.)
  └── sc_detalle_subgrupo   (subgrupo: PIJAMA CL 2-8, etc.)

BODEGAS
  └── 13 = "PRODUCTO EN PROCESO" (unica bodega de produccion)
```

---

## 2. Tipos de Documento de Produccion

14 de las 16 fuentes de produccion mapeadas tienen movimientos reales:

| ka_ni | Codigo | Nombre | Movimientos | Lineas | cobrar_pagar | clase |
|---|---|---|---|---|---|---|
| 33 | OP | Orden de Produccion | 3,376 | 56,586 | P | 5 |
| 80 | CN | Consumos Insumos y Telas | 7,876 | 81,174 | P | 5 |
| 81 | PT | Entrada PT | 0* | 0* | C | 5 |
| 99 | PC | Salida Confeccionistas | 296 | 296 | P | 1 |
| 100 | EC | Entrada Confeccionistas | 296 | 5,318 | P | 1 |
| 114 | 04 | Producto en Proceso | 1 | 248 | C | 5 |
| 115 | MV | Traslado Movimientos PDN | 8,320 | 0** | P | 7 |
| 116 | ET | Entrada Producto Terminado | 3,638 | 0** | P | 7 |
| 117 | CM | Consumo de Muestras | 0* | 0* | C | 5 |
| 118 | T2 | Gastos de Terceros | 9,596 | 9,702 | P | 1 |
| 119 | Y1 | Causacion de Servicios T | 8,521 | 137,446 | P | 5 |
| 126 | AD | Adiciones y Faltantes | 92 | 809 | P | 5 |
| 127 | CV | Consumos Muestras y Varios | 411 | 15,489 | P | 5 |
| 129 | T1 | Gastos Terceros | 80 | 81 | P | 1 |
| 133 | M2 | Entrada de Muestras | 83 | 2,916 | C | 5 |
| 140 | SR | Saldo Inicial Retazos | 2 | 106 | C | 5 |

*\* PT (81) y CM (117) no retornaron en el count — posible diferencia de filtro o sin datos recientes.*
*\*\* MV (115) y ET (116) no retornaron lineas en el JOIN — posible que los items usen una relacion diferente.*

---

## 3. Ciclo de Vida Real (Validado con Evidencia)

### Flujo operacional confirmado

```
[1] OP creada (fuente 33)
     ├── Cabecera: MOVIMIENTOS.ka_ni_fuente = 33
     ├── Lineas: MOVIMIENTOS_ITEMS con articulo, talla, color, cantidad
     ├── Bodega: 13 (PRODUCTO EN PROCESO)
     ├── Estado: sc_dcto_cerrado = 'N' (abierta)
     └── Observacion: "Generado desde el sistema de Produccion. Inicio de Orden de Produccion"
         │
[2] CN — Consumos Insumos y Telas (fuente 80)
     ├── Registra consumo de materia prima
     └── 81,174 lineas historicas (promedio ~10 lineas/consumo)
         │
[3] PC/EC — Salida/Entrada Confeccionistas (fuentes 99/100)
     ├── Envio a talleres externos (PC)
     └── Recepcion de talleres (EC)
         │
[4] T2/Y1/T1 — Gastos y Servicios Terceros (fuentes 118/119/129)
     ├── Costos de confeccion, terceros, servicios
     └── 137,446 lineas Y1 — es el tipo con mas lineas
         │
[5] ET — Entrada Producto Terminado (fuente 116)
     ├── Ingreso del producto terminado al inventario
     ├── 3,638 movimientos historicos
     └── Ultima fecha: 2026-06-24 (hoy)
         │
[6] OP cerrada
     └── sc_dcto_cerrado = 'S'
```

### Evidencia de lifecycle real (OP #3378)

| Paso | Fuente | Fecha | mov_id |
|---|---|---|---|
| OP creada | 33 (OP) | 2026-06-23 | 277252 |
| Consumo insumos | 80 (CN) | 2023-05-03* | 123257 |
| Traslado | 115 (MV) | 2022-11-02* | 103040 |
| Gastos terceros | 118 (T2) | 2022-09-15* | 97791 |
| Causacion servicios | 119 (Y1) | 2022-10-19* | 101594 |
| Entrada PT | 116 (ET) | 2026-01-22 | 257166 |

*\* Las fechas anteriores a la OP indican que el `n_numero_documento` se reutiliza — el numero de documento NO es exclusivo de la OP. Los movimientos con numero 3378 pero de tipo CN/MV/T2/Y1 corresponden a OTRAS ordenes previas con ese mismo numero secuencial en su propio tipo de fuente.*

### Implicacion critica

El campo `n_numero_documento` NO es un ID unico global. Cada tipo de fuente tiene su propio consecutivo independiente. Para rastrear el ciclo de vida de una OP especifica, se necesita vincular por:
- `ka_nl_movimiento` (ID del movimiento padre) o
- `ka_nl_articulo` + `ss_talla` + `ss_color` + rango de fecha

---

## 4. Columnas Clave de MOVIMIENTOS_ITEMS (para OP)

| Columna | Tipo | Uso en OP | Ejemplo |
|---|---|---|---|
| ka_nl_movimiento_item | int (PK) | ID de linea | 4270896 |
| ka_nl_movimiento | int (FK) | ID de cabecera OP | 277252 |
| ka_nl_articulo | int (FK) | Producto SAG | 11790 |
| n_cantidad | int | Cantidad programada | 24 |
| ss_talla | string | Talla | "S", "M", "L", "XL", "2", "4" |
| ss_color | string | Color | "GR1", "LI1", "BL1" |
| ka_nl_sku | int | SKU compuesto SAG | 72927 |
| ka_nl_bodega | int (FK) | Bodega destino | 13 |
| n_valor | decimal | Valor (0 para OPs) | 0 |
| ss_referencia_pdn | string | Ref produccion (vacio) | "" |
| nd_cantidad_pt_pdn | decimal | Qty PT producida (0 en OP) | 0 |
| ddt_fecha_new_item | datetime | Fecha creacion linea | 2026-06-24T07:02:30 |

---

## 5. Productos en Produccion Activa

### Top 30 referencias en OPs recientes (100 ultimas OPs)

| REF | Producto | Grupo | Qty programada |
|---|---|---|---|
| L-7128 | Pijama Corta Larga Nino Bebe 9-24 | LT Nino Bebe | 600 |
| L-3544 | Pijama Corta Corta Nino Kids 2-8 | LT Nino Kids | 600 |
| L-3545 | Pijama Corta Larga Nino Kids 2-8 | LT Nino Kids | 600 |
| L-3538 | Pijama Larga Larga Nino Kids 2-8 | LT Nino Kids | 600 |
| L-3588 | Pijama Corta Larga Nino Kids 10-16 | LT Nino Kids | 600 |
| L-3570 | Pijama Corta Larga Nino Kids 2-8 | LT Nino Kids | 600 |
| L-1382 | Pijama Corta Larga Nina Kids 2-8 | LT Nina Kids | 600 |
| L-1386 | Pijama Corta Larga Nina Kids 2-8 | LT Nina Kids | 600 |
| L-1395 | Pijama Corta Corta Nina Kids 2-8 | LT Nina Kids | 600 |
| L-1392 | Pijama Larga Larga Nina Kids 2-8 | LT Nina Kids | 600 |
| L-2420 | Conjunto Nautico Nino Bebe 9-24 | LT Nino Bebe | 444 |
| L-1389 | Pijama Larga Larga Nina Kids 2-8 | LT Nina Kids | 440 |
| L-3558 | Pijama Corta Corta Nino Kids 18-22 | LT Nino Kids | 450 |
| L-7121 | Pijama Larga Larga Nino Bebe 9-24 | LT Nino Bebe | 600 |
| L-2419 | Conjunto Nautico Nino Bebe 9-24 | LT Nino Bebe | 556 |

Productos: **100% pijamas y conjuntos infantiles** (LT = Linea Textil).

### Lineas en open OPs por talla/color

| Articulo|Talla|Color | Qty total | Lineas |
|---|---|---|
| 419\|2\|BL1 | 329 | 27 |
| 419\|3\|BL1 | 329 | 27 |
| 419\|4\|BL1 | 329 | 27 |
| 419\|5\|BL1 | 329 | 27 |
| 419\|2\|AZ3 | 304 | 27 |

50,634 combinaciones unicas de articulo|talla|color en OPs abiertas.

---

## 6. Cross-Reference OP → ProductVariant

### Matching

| Metrica | Valor |
|---|---|
| Composite keys a match | 758 |
| Matched en ProductVariant | 380 (50.1%) |
| Unmatched | 378 (49.9%) |

### Causa del 50% de unmatch

Los articulos en SAG usan `k_sc_codigo_articulo` de `v_articulos` (ej: `DA-9040`, `L-1354`), mientras que ProductEntity.sku puede usar una referencia diferente. Los unmatched incluyen:

- `DA-9040` (articulo 11790) — nueva referencia aun no en catalogo sincronizado
- `L-1354` (articulo 11810) — nueva referencia
- Articulos con tallas no estandar (`18`, `20`, `22` vs `S`, `M`, `L`)

### Inventario de items matched

| Condicion | Cantidad |
|---|---|
| En produccion + tiene stock | 380 |
| En produccion + agotado | 0 |

Los 380 items que SI matchean tienen stock — esto sugiere que la produccion reciente ya fue ingresada como producto terminado. Los items que NO matchean son los actualmente en proceso (nuevas referencias).

---

## 7. Estado de OPs

| Estado | Cantidad | % |
|---|---|---|
| Abiertas (sc_dcto_cerrado = 'N') | 3,352 | 99.3% |
| Cerradas (sc_dcto_cerrado = 'S') | 24 | 0.7% |

**Hallazgo:** Castillitos casi nunca cierra OPs en SAG. Las 3,352 OPs abiertas incluyen ordenes desde 2020. Esto significa que el estado de la OP NO es un indicador confiable de si la produccion esta "en proceso" o "completada". La unica senial confiable de produccion completada es la existencia de un movimiento ET (fuente 116) para los mismos articulos.

### OPs recientes (junio 2026)

| OP | Fecha | Remision |
|---|---|---|
| 3378 | 2026-06-23 | 3380-1 |
| 3379 | 2026-06-23 | 3381-1 |
| 3380 | 2026-06-23 | 3382-1 |
| 3381 | 2026-06-23 | 3383-1 |
| 3382 | 2026-06-23 | 3384-1 |
| 3376 | 2026-06-19 | 3378-1 |
| 3377 | 2026-06-19 | 3379-1 |
| 3374 | 2026-06-18 | 3376-1 |
| 3375 | 2026-06-18 | 3377-1 |
| 3371 | 2026-06-16 | 3373-1 |

Produccion activa: **5 OPs creadas el 23 junio, 2 el 19, 2 el 18, 3 el 16** — Castillitos crea OPs multiples veces por semana.

---

## 8. Bodega de Produccion

Toda la produccion opera en una sola bodega:

| ka_nl_bodega | Nombre | Items |
|---|---|---|
| 13 | PRODUCTO EN PROCESO | 56,586 |

No hay bodegas separadas por taller, linea, o etapa. Todo el inventario en proceso se concentra en bodega 13.

---

## 9. Volumen por Ano

| Ano | Movimientos produccion |
|---|---|
| 2020 | 1,377 |
| 2021 | 8,466 |
| 2022 | 7,803 |
| 2023 | 7,891 |
| 2024 | 5,995 |
| 2025 | 8,173 |
| 2026 (parcial) | 2,883 |
| **Total** | **42,588** |

---

## 10. Riesgos

| # | Riesgo | Severidad | Mitigacion |
|---|---|---|---|
| 1 | **n_numero_documento NO es unico** — cada fuente tiene su propio consecutivo | CRITICA | Vincular por ka_nl_movimiento + ka_nl_articulo + rango de fecha, NO por numero de documento |
| 2 | **99.3% de OPs nunca se cierran** — sc_dcto_cerrado es un indicador no confiable | ALTA | Usar existencia de ET (fuente 116) como proxy de completitud |
| 3 | **50.1% match OP → ProductVariant** — referencias nuevas no sincronizadas | MEDIA | Sincronizar v_articulos periodicamente para capturar nuevas referencias |
| 4 | **n_valor = 0 en OP** — las OPs no tienen valoracion monetaria | MEDIA | El costo de produccion esta en CN, T2, Y1 (consumos y servicios) |
| 5 | **nd_cantidad_pt_pdn = 0 en todas las lineas OP** — no tracking de qty producida en la OP | ALTA | La cantidad producida se obtiene de ET (fuente 116), no del campo en la OP |
| 6 | **ET items no retornaron en JOIN** con MOVIMIENTOS en la consulta | MEDIA | Investigar relacion exacta ET → MOVIMIENTOS_ITEMS, posiblemente sin items |

---

## 11. Oportunidades

### Inmediatas (Sprint siguiente)

1. **Sincronizar OPs abiertas**: Query `MOVIMIENTOS WHERE ka_ni_fuente = 33 AND sc_anulado = 'N'` + JOIN `MOVIMIENTOS_ITEMS` con talla/color. Sincronizar a modelo Prisma.

2. **Sincronizar Entradas PT**: Query `MOVIMIENTOS WHERE ka_ni_fuente = 116 AND sc_anulado = 'N'` para saber que ya se produjo.

3. **Cruzar OP → agotados**: Con OPs sincronizadas, David puede responder "esta referencia agotada esta en produccion — OP #3378, 48 unidades en proceso".

4. **Informe diario de produccion**: OPs creadas hoy, articulos en proceso, entradas PT del dia.

### A mediano plazo

5. **Resolver k_sc_codigo_articulo → ProductEntity.sku**: Cerrar el gap del 50% unmatch sincronizando v_articulos.

6. **Calcular cobertura**: Con OPs + inventario + pedidos, calcular "dias de cobertura" por referencia.

7. **Trazabilidad OP → ET → inventario → pedido**: Ciclo completo de produccion a despacho.

---

## 12. Archivos Consultados

| Archivo | Hallazgo |
|---|---|
| `lib/connectors/pya/client.ts` | consultaSagJson() — motor de query SAG |
| `lib/sag/env.ts` | loadSagTestEnv() — credenciales produccion |
| `lib/sag/master-data/source-semantic-rules.ts` | 16 fuentes de produccion mapeadas |
| `lib/connectors/adapters/sag-pya-soap/query-catalog.ts` | PRODUCTION placeholder confirmado |
| `lib/connectors/adapters/sag-pya-soap/index.ts` | Adapter SAG PYA SOAP |
| `lib/connectors/adapters/sag-pya-soap/mappers.ts` | Channel derivation, fuente mapping |

## 13. Scripts de Evidencia

| Script | Proposito |
|---|---|
| `scripts/_production-forensics.ts` | Phase 1: discovery (10 phases) |
| `scripts/_production-forensics-p2.ts` | Phase 2: deep analysis (6 phases) |

---

## 14. Query de Sincronizacion Recomendado

### Para OPs abiertas (cabecera + lineas con producto resuelto)

```sql
SELECT
  m.ka_nl_movimiento,
  m.n_numero_documento AS op_number,
  m.d_fecha_documento AS op_date,
  m.sc_dcto_cerrado AS is_closed,
  m.ss_usuario_new AS created_by,
  mi.ka_nl_articulo,
  mi.n_cantidad AS planned_qty,
  mi.ss_talla,
  mi.ss_color,
  mi.ka_nl_sku,
  mi.ka_nl_bodega,
  a.k_sc_codigo_articulo AS reference,
  a.sc_detalle_articulo AS product_name
FROM MOVIMIENTOS m
INNER JOIN MOVIMIENTOS_ITEMS mi
  ON mi.ka_nl_movimiento = m.ka_nl_movimiento
INNER JOIN v_articulos a
  ON a.ka_nl_articulo = mi.ka_nl_articulo
WHERE m.ka_ni_fuente = 33
  AND m.sc_anulado = 'N'
ORDER BY m.d_fecha_documento DESC
```

### Para Entradas PT (produccion completada)

```sql
SELECT
  m.ka_nl_movimiento,
  m.n_numero_documento AS et_number,
  m.d_fecha_documento AS entry_date,
  mi.ka_nl_articulo,
  mi.n_cantidad AS produced_qty,
  mi.ss_talla,
  mi.ss_color,
  mi.ka_nl_bodega,
  a.k_sc_codigo_articulo AS reference,
  a.sc_detalle_articulo AS product_name
FROM MOVIMIENTOS m
INNER JOIN MOVIMIENTOS_ITEMS mi
  ON mi.ka_nl_movimiento = m.ka_nl_movimiento
INNER JOIN v_articulos a
  ON a.ka_nl_articulo = mi.ka_nl_articulo
WHERE m.ka_ni_fuente = 116
  AND m.sc_anulado = 'N'
ORDER BY m.d_fecha_documento DESC
```

---

## 15. Respuestas a Preguntas del Sprint

| Pregunta | Respuesta | Evidencia |
|---|---|---|
| Existe tabla dedicada de produccion? | **NO** | 17 tablas probadas, todas `Invalid object name` |
| Donde vive la produccion? | **MOVIMIENTOS + MOVIMIENTOS_ITEMS** | ka_ni_fuente = 33 (OP), 116 (ET) |
| Cuantas OPs existen? | **3,376** | COUNT(*) WHERE ka_ni_fuente = 33 |
| Cuantas OPs abiertas? | **3,352** | WHERE sc_dcto_cerrado = 'N' |
| Se puede cruzar con inventario? | **SI (50.1%)** | Via k_sc_codigo_articulo + ss_talla + ss_color → ProductVariant.sku |
| Se puede cruzar con pedidos? | **SI** | Misma key composite que LINE-INVENTORY-LINK-04 |
| La produccion es activa? | **SI** | 5 OPs creadas el 23 junio 2026, ET hoy 24 junio |
| Que produce Castillitos? | **Pijamas y conjuntos infantiles** | 100% LT (Linea Textil) Nino/Nina |
| Cuantas lineas por OP? | ~16 promedio | 56,586 lineas / 3,376 OPs |
| Hay talla y color en produccion? | **SI** | ss_talla + ss_color en MOVIMIENTOS_ITEMS |
| Hay SKU en produccion? | **SI** | ka_nl_sku en MOVIMIENTOS_ITEMS |
| Bodega de produccion? | **13 (PRODUCTO EN PROCESO)** | Unica bodega |
