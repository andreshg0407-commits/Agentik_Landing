# Maletas Comerciales — Requerimientos de Fuente SAG/PYA

**Sprint:** AGENTIK-COMERCIAL-MALETAS-SAG-SOURCE-DISCOVERY-01
**Auditor:** Agentik Claude (2026-05-23)
**Estado:** Diagnóstico completo — pendiente confirmación con equipo SAG/PYA
**Tenant:** castillitos (`cmmpwstuf000dp5y58kj1daaj`)

---

## Resumen ejecutivo

El módulo de Maletas Comerciales requiere tres fuentes de datos desde SAG para operar en modo Prisma (V2):

| # | Fuente | Estado actual | Bloqueante |
|---|--------|--------------|------------|
| 1 | **Inventario operativo por referencia** (`INVENTARIO`) | Pendiente homologación | SI — sin esto no hay disponible |
| 2 | **Pedidos clientes PD** (fuente `PD`, ka=40) | Parcial — adapter existe pero no puebla CommercialCoverageSnapshot | SI — sin esto no hay presión de demanda |
| 3 | **Ajustes de pedidos AP** (fuente `AP`, ka=41) | No implementado | NO — puede operar sin AP en V2a |

**Situación actual en DB (2026-05-23):**
- `CommercialCoverageSnapshot`: 0 filas (tabla creada, sin datos)
- `CommercialCaseItem`: 0 filas (tabla creada, sin datos)
- `SaleRecord`: 125,163 filas — TODAS con `productCode=null` (solo cabeceras financieras, sin artículos)

**Consecuencia:** El runtime cae siempre a la ruta `empty` → la UI muestra cero referencias.

---

## Fuente 1 — Inventario operativo por referencia

### Propósito
Proveer el saldo disponible por referencia de producto (línea LT/CS) para calcular:
- `disponible` = stock disponible para maletas
- `bodegaInicial` = inventario total en bodega
- `coveragePct` = % cobertura respecto al mínimo requerido
- `opState` = estado operacional (agotado / bajo_mínimo / estable / etc.)

### Tabla SAG objetivo
```sql
SELECT * FROM INVENTARIO
-- alternativas si INVENTARIO no existe: SALDOS, EXISTENCIAS, SALDOS_INVENTARIO
```

**IMPORTANTE:** El nombre de tabla `INVENTARIO` NO está confirmado para Castillitos.
`CASTILLITOS_STRUCT.inventoryTable = null` (ver `lib/sag/master-data/castillitos-overrides.ts:469`).
Se debe confirmar el nombre real con el DBA o ejecutando el query de homologación.

### Campos requeridos

| Campo SAG (estimado) | Tipo | Descripción | Mapea a |
|---------------------|------|-------------|---------|
| `CODIGO` | string | Código / referencia del artículo | `CommercialCoverageSnapshot.refCode` |
| `DESCRIPCION` | string | Nombre del artículo | `CommercialCoverageSnapshot.description` |
| `BODEGA` | string/int | Código de bodega | filtro: solo bodega principal |
| `SALDO` | number | Stock disponible en bodega | `CommercialCoverageSnapshot.disponible` |
| `LINEA` | string | Línea del artículo (LT / CS) | `CommercialCoverageSnapshot.line` |
| `SUBLINEA` | string | Sublínea (para categorías del engine) | derivación de `category` |
| `GRUPO` | string | Grupo del artículo | derivación de `productType` |
| `ACTIVO` | bool/char | Si la referencia está activa | filtro: solo activos |
| `FECHA_MODIFICACION` | datetime | Última modificación | `CommercialCoverageSnapshot.snapshotAt` |

**Campos opcionales pero útiles:**

| Campo SAG | Descripción | Usado en |
|-----------|-------------|---------|
| `COSTO_PROMEDIO` | Costo promedio — para valorización de inventario | futuro: valor en riesgo |
| `TALLA` | Talla del artículo (si `sc_maneja_tallas = 'S'`) | `ReferenceOperationalState.size` |
| `COLOR` | Color del artículo | `ReferenceOperationalState.color` |

### Fuentes SAG que modifican este saldo (ver Sección 5)
`IF` (Inv. Físico) · `AI` (Ajuste Inventario) · `PT` (Entrada PT) · `ET` (Entrada Prod. Terminado) · `EC` (Entrada Confeccionistas) · `TR` (Traslado Bodegas) · `F2` (Remisión / despacho)

### Query de homologación
```sql
-- Confirmar nombre de tabla y campos
SELECT TOP 5 * FROM INVENTARIO
-- Si falla, probar: SALDOS, EXISTENCIAS, SALDOS_INVENTARIO, KARDEX_SALDO
```

---

## Fuente 2 — Pedidos clientes PD (demanda comercial)

### Propósito
Capturar el volumen de pedidos pendientes por referencia para calcular:
- `pendingPDQty` = unidades en PD (reservas comerciales activas)
- `netAfterPD` = disponible − PD pending
- `pdPressureRatio` = PD / bodega inicial
- `opState` riesgo_pd cuando disponible >= mínimo pero netAfterPD < mínimo

### Fuente SAG
- Fuente: `PD` — PEDIDOS CLIENTES (ka=40, category=OFICIAL, visibleInTorre=true)
- Tabla: `MOVIMIENTOS` (cabecera) + `MOVIMIENTOS_ITEMS` (líneas por artículo)
- Clase SAG: `k_n_clase_fuente = 4`

### Adapter existente
`lib/connectors/adapters/sag-pya-soap/index.ts` → `pullOrders()` ya extrae PD desde MOVIMIENTOS.
El mapper `mapOrderRow()` en `mappers.ts:665` filtra código `PD` correctamente.

**Gap actual:** `pullOrders()` extrae cabeceras de pedidos pero el ingestion pipeline
(`maletas-ingestion.ts`) no agrega PD por referencia y no escribe en `CommercialCoverageSnapshot`.

### Campos requeridos

| Campo SAG | Tabla | Descripción | Mapea a |
|-----------|-------|-------------|---------|
| `k_sc_codigo_fuente` | MOVIMIENTOS | Debe ser `PD` | filtro fuente |
| `k_n_clase_fuente` | MOVIMIENTOS | Debe ser `4` | filtro clase |
| `sc_estado` | MOVIMIENTOS | Estado del pedido (activo / anulado) | filtro: solo activos |
| `sc_referencia` | MOVIMIENTOS_ITEMS | Código de referencia del artículo | agrupación por ref |
| `n_cantidad` | MOVIMIENTOS_ITEMS | Unidades pedidas | suma → `pendingOrdersQty` |
| `n_cantidad_pendiente` | MOVIMIENTOS_ITEMS | Unidades aún no despachadas | suma → `pendingOrdersQty` |
| `ka_ni_bodega` | MOVIMIENTOS | Bodega del pedido | filtro: bodega principal |
| `ddt_fecha_documento` | MOVIMIENTOS | Fecha del pedido | filtro: solo pedidos vigentes |

**Campos opcionales:**

| Campo SAG | Descripción |
|-----------|-------------|
| `sc_beneficiario` | Cliente (tercero) — para análisis de concentración |
| `ka_ni_vendedor` | Vendedor que tomó el pedido |
| `n_valor_total` | Valor total del pedido |

### Lógica de agregación
```
pendingOrdersQty(ref) = SUM(n_cantidad_pendiente)
  WHERE k_sc_codigo_fuente = 'PD'
    AND sc_estado IN ('ACTIVO', 'VIGENTE', 'PENDIENTE')
    AND sc_referencia = ref
    AND ka_ni_bodega = bodega_principal
```

---

## Fuente 3 — Ajuste de pedidos AP (limpieza de reservas)

### Propósito
AP es la fuente de "limpieza de pedidos" — anula o reduce reservas PD que no generaron venta.
Según administración de Castillitos: **AP está excluido del cálculo operativo** porque se aplica
upstream en SAG. Los saldos disponibles en `INVENTARIO` ya consideran AP.

### Fuente SAG
- Fuente: `AP` — AJUSTE PEDIDOS (ka=41, category=OFICIAL, visibleInTorre=true)

### Estado en el engine
`apCleanupQty = 0` en todos los snapshots actuales — excluido intencionalmente.
Ver comentario en `sag-prisma-reader.ts:19`: *"AP excluded upstream — not stored"*.

### Recomendación
Confirmar con Castillitos: ¿el `SALDO` del INVENTARIO ya descuenta AP?
Si sí → no necesitamos importar AP. Si no → requiere campo adicional.

---

## Fuente 4 (opcional) — Maletas de vendedores / Case assignments

### Propósito
Saber qué referencias lleva cada vendedor en su maleta activa, con qué cantidades.
Actualmente viene del Excel `MALETAS.xlsx` (hojas LT. y CS) y mapea a `CommercialCaseItem`.

### Campos requeridos (si se migra de Excel a SAG)

| Campo | Descripción | Mapea a |
|-------|-------------|---------|
| `sc_referencia` | Referencia del artículo | `CommercialCaseItem.reference` |
| `ka_ni_vendedor` | ID interno del vendedor | `CommercialCaseItem.assignedSalesRepIds` |
| `n_cantidad_actual` | Unidades actuales en la maleta | `currentQty` del assignment |
| `sc_linea` | LT / CS | `CommercialCaseItem.line` |
| `sc_lote` | Lote de producción | `CommercialCaseItem.productionBatchLabel` |

**Nota:** Actualmente NO existe una tabla SAG que represente "maletas de vendedores".
Las asignaciones se mantienen manualmente en Excel. Este dato requiere un proceso de digitalización
separado o un modelo propio en Prisma alimentado por el módulo de maletas.

---

## Tabla de impacto por fuente SAG sobre inventario operacional

Esta tabla documenta TODAS las fuentes SAG de Castillitos que modifican el saldo de inventario,
y su impacto en el engine de Maletas.

### INVENTARIO category (category=INVENTARIO en castillitos-fuentes.ts)

| Código | ka | Nombre | Efecto | Impacto en disponible | ¿Necesario importar? |
|--------|----|--------|--------|----------------------|---------------------|
| `IF` | 65 | INV. FISICO | Reemplazo (conteo físico) | REEMPLAZA saldo real | Solo si se construye kardex |
| `AI` | 76 | AJUSTE DE INVENTARIO | Ajuste (+/-) | MODIFICA saldo | Solo si se construye kardex |

**Nota:** Estos documentos SE REFLEJAN automáticamente en el saldo de `INVENTARIO` en SAG.
Si leemos `INVENTARIO.SALDO` directamente, ya incorporan IF y AI. No es necesario importarlos por separado.

### PRODUCCION category — fuentes que generan stock de producto terminado

| Código | ka | Nombre | Efecto sobre inventario | ¿Aumenta stock LT/CS? | ¿Necesario importar? |
|--------|----|--------|------------------------|----------------------|---------------------|
| `PT` | 81 | ENTRADA PT | Ingresa producto terminado a bodega | SI — aumenta disponible | Solo si kardex |
| `ET` | 116 | ENTRADA PRODUCTO TERMINADO | Ingresa PT (variante) | SI — aumenta disponible | Solo si kardex |
| `EC` | 100 | ENTRADA CONFECCIONISTAS | Recibe de confeccionista | SI — aumenta stock | Solo si kardex |
| `PC` | 99 | SALIDA CONFECCIONISTAS | Sale a confeccionista | NO — reduce temporalmente | Solo si kardex |
| `OP` | 33 | ORDEN DE PRODUCCIÓN | Abre orden de producción | NO directo (es compromiso) | NO |
| `CN` | 80 | CONSUMOS INSUMOS Y TELAS | Sale insumo de bodega | Reduce insumos, no LT/CS | NO |
| `TR` | 34 | TRASLADO ENTRE BODEGAS | Mueve entre bodegas | Cambia bodega, no saldo total | Solo si multi-bodega |
| `AD` | 126 | ADICIONES Y FALTANTES | Ajuste de lote (+/-) | MODIFICA saldo PT | Solo si kardex |
| `CM` | 117 | CONSUMO DE MUESTRAS | Sale muestra de bodega | Reduce disponible | NO (muestras != maletas) |
| `CV` | 127 | CONSUMOS DE MUESTRAS Y VARIOS | Idem + varios | Reduce disponible | NO |
| `MV` | 115 | TRASLADO DE MOVIMIENTOS PDN | Traslado interno prod | Interno | NO |

### OFICIAL category — fuentes comerciales que consumen stock

| Código | ka | Nombre | Efecto sobre inventario | ¿Necesario importar? |
|--------|----|--------|------------------------|---------------------|
| `F2` | 2 | REMISION | Despacho sin factura | Reduce disponible | YA está en SaleRecord |
| `FE`/`FD`/`FC`/`FG`/`FA` | varios | Facturas electrónicas | Venta = reduce stock | YA en SaleRecord |
| `D1`/`D2` | 25/98 | Devoluciones ventas | Reversa de venta | Devuelve a bodega | NO (ya en NC SaleRecord) |
| `DC` | 27 | Devolución compras | Reversa compra | Devuelve a proveedor | NO |
| `PD` | 40 | PEDIDOS CLIENTES | Reserva comercial | Reduce disponible operativo | SI — Fuente 2 arriba |
| `AP` | 41 | AJUSTE PEDIDOS | Anula/reduce PD | Libera reserva | Ver Fuente 3 arriba |

### HISTORICA category — fuentes inactivas pero con saldos previos

| Código | Nombre | Relevancia |
|--------|--------|------------|
| `IF` → `I1` (ka=146) | INV FISICO (obsoleta) | Saldos históricos pre-migración |
| `EA` (ka=77) | ENTRADA A ALMACEN | Histórica — saldos anteriores |
| `SA` (ka=145) | SALIDA DE ALMACEN | Histórica — saldos anteriores |

**Conclusión:** Para el motor de Maletas basta con leer `INVENTARIO.SALDO` directamente.
Este campo ya consolida todos los movimientos (IF, AI, PT, ET, TR, etc.).
No es necesario construir un kardex propio.

---

## Estado del pipeline de ingesta (diagnóstico)

```
[SAG SOAP]
    │
    ├── consultaSagJson("SELECT * FROM INVENTARIO")
    │       └── STATUS: PENDING — tabla no homologada, query no ejecutada
    │
    └── pullOrders() → MOVIMIENTOS donde fuente=PD
            └── STATUS: PARTIAL — extrae cabeceras pero no agrega por referencia
                        y no escribe en CommercialCoverageSnapshot

[Agentik Prisma DB]
    │
    ├── CommercialCoverageSnapshot: 0 filas ← BLOQUEO PRINCIPAL
    ├── CommercialCaseItem:          0 filas ← sin asignaciones vendedor-referencia
    └── SaleRecord: 125,163 filas
            └── productCode=null en TODOS → no usable para inventario
```

**Flujo que falta implementar:**
```
SAG INVENTARIO → normalize → CommercialCoverageSnapshot (upsert por refCode)
SAG PD orders  → aggregate by refCode → CommercialCoverageSnapshot.pendingOrdersQty
Excel maletas  → (o SAG) → CommercialCaseItem (qué refs lleva cada vendedor)
```

---

## Consultas de homologación requeridas (para el equipo SAG/PYA)

### Q1 — Nombre y estructura de la tabla de inventario
```sql
-- ¿Cuál de estas tablas contiene el saldo actual por referencia?
SELECT TOP 1 * FROM INVENTARIO          -- candidato principal
SELECT TOP 1 * FROM SALDOS              -- candidato alternativo
SELECT TOP 1 * FROM EXISTENCIAS         -- candidato alternativo
SELECT TOP 1 * FROM SALDOS_INVENTARIO   -- candidato alternativo
```
**Necesitamos confirmar:**
- Nombre real de la tabla
- Nombre del campo de saldo: `SALDO`, `EXISTENCIA`, `CANTIDAD`, `CANTIDAD_DISPONIBLE`
- Si hay campo `BODEGA` para filtrar por bodega
- Si el saldo ya descuenta PD (reservas) o es saldo bruto

### Q2 — ¿El SALDO en INVENTARIO descuenta pedidos PD?
```sql
-- Comparar saldo de INVENTARIO vs saldo calculado manualmente
SELECT
  i.CODIGO,
  i.SALDO                              AS saldo_sistema,
  SUM(mi.n_cantidad_pendiente)         AS pd_pendientes,
  i.SALDO - SUM(mi.n_cantidad_pendiente) AS disponible_calculado
FROM INVENTARIO i
LEFT JOIN MOVIMIENTOS_ITEMS mi
  ON mi.sc_referencia = i.CODIGO
LEFT JOIN MOVIMIENTOS m
  ON m.ka_nl_movimiento = mi.ka_nl_movimiento
  AND m.k_sc_codigo_fuente = 'PD'
  AND m.sc_estado NOT IN ('ANULADO', 'CERRADO')
WHERE i.CODIGO = '[REF DE PRUEBA]'
GROUP BY i.CODIGO, i.SALDO
```
**Resultado esperado:** Confirmar si `SALDO` = disponible neto (después de PD) o bruto (sin descontar PD).
Castillitos admin dijo: `disponible = inventario − pedidos`. Por tanto SALDO probablemente es bodega bruta.

### Q3 — Estructura de pedidos PD por artículo
```sql
-- Pedidos activos con líneas por referencia
SELECT
  m.ka_nl_movimiento,
  m.ddt_fecha_documento,
  m.sc_beneficiario,
  m.ka_ni_vendedor,
  mi.sc_referencia,
  mi.n_cantidad,
  mi.n_cantidad_pendiente,
  m.sc_estado
FROM MOVIMIENTOS m
JOIN MOVIMIENTOS_ITEMS mi ON mi.ka_nl_movimiento = m.ka_nl_movimiento
WHERE m.k_sc_codigo_fuente = 'PD'
  AND m.sc_estado NOT IN ('ANULADO', 'CERRADO', 'DESPACHADO')
ORDER BY mi.sc_referencia
```
**Necesitamos confirmar:**
- Nombre del campo de cantidad pendiente (`n_cantidad_pendiente`, `n_cant_pend`, `n_pendiente`)
- Valores válidos de `sc_estado` para pedidos activos (que generan presión de demanda)

### Q4 — Línea del artículo (LT vs CS)
```sql
-- ¿Cómo distinguir artículos LT de CS en SAG?
SELECT
  a.sc_referencia,
  a.sc_detalle_articulo,
  l.sc_descripcion AS linea,
  sg.sc_descripcion AS subgrupo,
  g.sc_descripcion AS grupo
FROM ARTICULOS a
LEFT JOIN LINEAS l ON l.ka_nl_linea = a.ka_nl_linea
LEFT JOIN SUBGRUPOS sg ON sg.ka_ni_subgrupo = a.ka_ni_subgrupo
LEFT JOIN GRUPOS g ON g.ka_ni_grupo = a.ka_ni_grupo
WHERE a.sc_referencia LIKE 'LT%' OR a.sc_referencia LIKE 'CS%'
  OR l.sc_descripcion IN ('LT', 'CS')
LIMIT 20
```
**Necesitamos confirmar:**
- ¿La línea LT/CS viene del código de referencia (`sc_referencia` empieza con LT/CS)?
- ¿O viene de la tabla `LINEAS` (`l.sc_descripcion`)?
- ¿O de `SUBGRUPOS` / `GRUPOS`?

### Q5 — Filtro por bodega principal
```sql
-- ¿Cuál es la bodega principal que corresponde a las maletas comerciales?
SELECT CODIGO, DESCRIPCION, ACTIVO FROM BODEGAS ORDER BY CODIGO
-- alternativo: SELECT * FROM ALMACENES
```
**Necesitamos:** El código de bodega de "MALETAS" o "EMPRESA" para filtrar el inventario.
CASTILLITOS_BODEGAS ya tiene algunos valores (ver `castillitos-overrides.ts:380-413`) pero la lista
no está confirmada para operaciones de inventario.

---

## Preguntas para el equipo SAG/PYA

### Preguntas estructurales (responder antes de implementar)

1. **¿Cuál es el nombre real de la tabla de inventario en SAG para Castillitos?**
   Candidatos: `INVENTARIO`, `SALDOS`, `EXISTENCIAS`, `SALDOS_INVENTARIO`

2. **¿El saldo en esa tabla descuenta automáticamente los pedidos PD vigentes?**
   Es decir: ¿`SALDO` = bodega bruta, o `SALDO` = disponible ya neto de reservas?

3. **¿Cómo se identifica la línea LT / CS de un artículo en SAG?**
   ¿Por prefijo del código, por LINEAS.sc_descripcion, o por GRUPOS/SUBGRUPOS?

4. **¿Cuál es el código de bodega de las maletas comerciales?**
   Necesitamos filtrar el inventario solo por esa bodega.

5. **¿Cuál es el nombre del campo de "cantidad pendiente" en MOVIMIENTOS_ITEMS?**
   Para PD: necesitamos las unidades pedidas pero aún no despachadas.

6. **¿Los pedidos AP ya están aplicados en el saldo de INVENTARIO?**
   ¿O AP es una fuente de ajuste separada que debemos considerar al calcular disponible?

7. **¿La tabla INVENTARIO es consultable vía `consultaSagJson`?**
   La query `SELECT * FROM INVENTARIO` fue marcada como `status: "pending"` — ¿funciona en el entorno de Castillitos?

### Preguntas operacionales

8. **¿Con qué frecuencia se actualiza el saldo de INVENTARIO en SAG?**
   ¿En tiempo real al despachar, o batch diario? — determina la frecuencia del sync.

9. **¿Hay un límite de filas por query en `consultaSagJson`?**
   El catálogo de artículos puede ser grande — ¿necesitamos paginar por bodega o lote?

10. **¿El módulo de maletas en SAG tiene una vista específica?**
    ¿Existe una tabla o vista tipo `V_MALETAS`, `SALDOS_MALETAS`, o `DISPONIBLE_MALETAS`?
    El Excel "DISPONIBLE PARA MALETAS.xlsx" fue exportado manualmente — ¿hay una query que genere ese reporte?

---

## Plan de acción para activar la fuente V2

Una vez confirmadas las respuestas:

### Paso 1 — Confirmar tabla INVENTARIO
Ejecutar `consultaSagJson("SELECT TOP 5 * FROM INVENTARIO")` y confirmar campos.
Actualizar `CASTILLITOS_STRUCT.inventoryTable` y `inventoryFields` en `castillitos-overrides.ts`.

### Paso 2 — Implementar query de inventario
Añadir `inventory.forMaletas` al query catalog (`query-catalog.ts`):
```sql
SELECT CODIGO, DESCRIPCION, LINEA, BODEGA, SALDO, FECHA_MODIFICACION
FROM INVENTARIO
WHERE BODEGA = '{bodegaMaletas}'
  AND ACTIVO = 'S'
ORDER BY CODIGO
```

### Paso 3 — Implementar sync de inventario → CommercialCoverageSnapshot
Crear `lib/comercial/maletas/maletas-sag-sync.ts` que:
1. Llama `consultaSagJson(inventory.forMaletas.query)`
2. Para cada artículo LT/CS, agrega PD pendiente desde MOVIMIENTOS_ITEMS
3. Calcula `disponible = SALDO - pendingPD` (o `disponible = SALDO` si SAG ya lo neta)
4. Upsert en `CommercialCoverageSnapshot` por `(organizationId, refCode)`

### Paso 4 — Implementar sync de case items → CommercialCaseItem
Migrar datos del Excel MALETAS.xlsx a `CommercialCaseItem` via endpoint de ingesta.
Ver `maletas-ingestion.ts` — ya tiene `syncMaletasData()` pero necesita alimentar el modelo Prisma.

### Paso 5 — Trigger de sync
Conectar el sync al webhook de SAG (cuando hay movimientos IF/PD/PT) o via cron diario.
El runtime ya consulta Prisma primero — en cuanto haya datos, el engine funcionará sin cambios.

---

## Referencias en el codebase

| Archivo | Relevancia |
|---------|-----------|
| `lib/comercial/maletas/maletas-runtime.ts` | Punto de entrada del runtime — prioriza Prisma > SaleRecord > Excel |
| `lib/comercial/maletas/sag-prisma-reader.ts` | Lee CommercialCoverageSnapshot — donde deben llegar los datos |
| `lib/comercial/maletas/maletas-ingestion.ts` | Endpoint de ingesta desde Excel — base para sync SAG |
| `lib/connectors/adapters/sag-pya-soap/query-catalog.ts` | Queries SAG — añadir `inventory.forMaletas` aquí |
| `lib/connectors/adapters/sag-pya-soap/index.ts` | Adapter SAG — `pullOrders()` ya extrae PD |
| `lib/connectors/adapters/sag-pya-soap/mappers.ts:665` | Mapper PD orders — `mapOrderRow()` |
| `lib/sag/master-data/castillitos-overrides.ts:469` | `inventoryTable: null` — confirmar y actualizar |
| `lib/sag/master-data/castillitos-fuentes.ts` | Registro completo de 127 fuentes — categorías INVENTARIO y PRODUCCION |
| `prisma/schema.prisma` | `CommercialCoverageSnapshot` y `CommercialCaseItem` — modelos ya creados |
