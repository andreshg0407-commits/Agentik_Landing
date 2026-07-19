# CASTILLITOS-OPERATIONAL-DOMAIN-ALIGNMENT-01

**Date:** 2026-06-28
**Status:** COMPLETE
**TSC Baseline:** 160 (no code modified)
**Purpose:** Referencia arquitectonica obligatoria para todos los sprints futuros

---

## Regla de Elaboracion

Este documento se construyo exclusivamente con evidencia existente:

| Fuente | Tipo |
|--------|------|
| CASTILLITOS_SAG_BODEGA_DISCOVERY_01 | Sprint de descubrimiento |
| CASTILLITOS_SAG_TRANSFER_DISCOVERY_01 | Sprint de descubrimiento |
| CASTILLITOS_DATA_TRUST_AUDIT_01 | Auditoria de datos |
| lib/logistics/catalogs/castillitos-locations.ts | Catalogo de ubicaciones |
| lib/tenant-rules/tenant-rule-registry.ts | Reglas de negocio CEO |
| lib/sag/master-data/castillitos-overrides.ts | Master data SAG |
| lib/sag/master-data/castillitos-fuentes.ts | 127 fuentes SAG |
| ProductInventoryLevel (DB) | Datos reales de inventario |
| ProductionOrder (DB) | Datos reales de produccion |

No se asumio, infirió ni inventó ninguna regla.

---

## FASE 1: Dominios Operacionales

### Dominio 1: INVENTARIO

| Atributo | Valor |
|----------|-------|
| **Responsabilidad** | Gestionar existencias de producto terminado disponible para operacion comercial |
| **Fuente principal** | ProductInventoryLevel (Bodega 01) via SAG MOVIMIENTOS_ITEMS |
| **Consumidores** | Disponibilidad Comercial, Pedidos, Maletas, Tiendas, Transferencias, Reposicion, Executive Reports |
| **Propietario logico** | Gerencia Operativa |

### Dominio 2: PRODUCCION

| Atributo | Valor |
|----------|-------|
| **Responsabilidad** | Gestionar ordenes de produccion, trabajo en proceso, y flujo de producto terminado hacia Bodega 01 |
| **Fuente principal** | ProductionOrder + ProductionOrderLine (fuente 33 = OP) via SAG |
| **Consumidores** | Executive Reports, Disponibilidad Comercial (como "capacidad futura"), Reposicion |
| **Propietario logico** | Gerencia de Produccion |

### Dominio 3: MALETAS

| Atributo | Valor |
|----------|-------|
| **Responsabilidad** | Gestionar muestras comerciales asignadas a vendedores ambulantes. Evaluar reemplazo cuando referencias alcanzan umbral critico |
| **Fuente principal** | ProductInventoryLevel (Bodegas 35-40) + fuente 206 (TM = Traslado de Maletas) |
| **Consumidores** | Executive Reports, Reposicion, LiveVendor |
| **Propietario logico** | Gerencia Comercial |

### Dominio 4: TIENDAS

| Atributo | Valor |
|----------|-------|
| **Responsabilidad** | Gestionar inventario en puntos de venta fisicos. Recibir reposicion desde Bodega 01 |
| **Fuente principal** | ProductInventoryLevel (Bodegas 00, 02, 03, 23, 29) + SaleRecord |
| **Consumidores** | Executive Reports, Reposicion, Sugerencias de surtido |
| **Propietario logico** | Gerencia Comercial |

### Dominio 5: TRANSFERENCIAS

| Atributo | Valor |
|----------|-------|
| **Responsabilidad** | Registrar movimiento de mercancia entre ubicaciones. No crea ni destruye inventario, lo mueve |
| **Fuente principal** | SAG fuente 34 (TR = Traslado entre Bodegas) + fuente 206 (TM = Traslado de Maletas) |
| **Consumidores** | Inventario, Maletas, Tiendas, Executive Reports |
| **Propietario logico** | Logistica |

### Dominio 6: PEDIDOS

| Atributo | Valor |
|----------|-------|
| **Responsabilidad** | Registrar compromisos de venta que afectan disponibilidad comercial |
| **Fuente principal** | CustomerOrderRecord (fuente PD) via SAG |
| **Consumidores** | Disponibilidad Comercial (reduce disponibleReal), Reposicion, Executive Reports |
| **Propietario logico** | Gerencia Comercial |

### Dominio 7: COMERCIAL

| Atributo | Valor |
|----------|-------|
| **Responsabilidad** | Consolidar la vision comercial: disponibilidad, cobertura, alertas, reposicion |
| **Fuente principal** | CommercialCoverageSnapshot (derivada de Inventario + Pedidos) |
| **Consumidores** | Executive Reports, Maletas, Tiendas, Decision Engine |
| **Propietario logico** | Gerencia General |

### Dominio 8: GERENCIA

| Atributo | Valor |
|----------|-------|
| **Responsabilidad** | Consumir reportes ejecutivos. Definir reglas de negocio. Tomar decisiones |
| **Fuente principal** | Executive Intelligence (castillitos-executive-loader.ts) — consume todos los demas dominios |
| **Consumidores** | CEO, Gerentes de area |
| **Propietario logico** | CEO |

---

## FASE 2: Modelo de Inventario

### Definicion Oficial

**Inventario Comercial = Bodega 01 (BODEGA PRINCIPAL)**

Bodega 01 representa producto terminado disponible para operacion comercial.

### Evidencia

| Evidencia | Fuente |
|-----------|--------|
| `CASTILLITOS_CONFIG.defaultWarehouse = "01"` | castillitos-overrides.ts |
| 50,311 variantes en DB | BODEGA-DISCOVERY-01 |
| Hub central: conecta con produccion, tiendas, vendedores, franquicias | TRANSFER-DISCOVERY-01 |
| Reglas de umbral apuntan a `existenciaBodega01` | tenant-rule-registry.ts |
| `CommercialCoverageSnapshot` se calcula desde Bodega 01 | _resync-coverage-snapshot.ts |

### Bodega 01 es la fuente principal para:

1. **Ventas** — producto disponible para vender
2. **Pedidos** — stock contra el cual se comprometen pedidos
3. **Maletas** — origen de muestras para vendedores (via TM fuente 206)
4. **Tiendas** — origen de reposicion para puntos de venta (via TR fuente 34)
5. **Transferencias** — origen de traslados a cualquier destino
6. **Disponibilidad Comercial** — base de calculo de `CommercialCoverageSnapshot`
7. **Reposicion** — base para evaluar necesidades de reabastecimiento
8. **Executive Reports** — KPIs de disponibilidad comercial

### Declaracion

> Bodega 01 es la referencia principal de disponibilidad comercial para Castillitos.

---

## FASE 3: Reglas de Inventario

### Calculo de Disponibilidad Comercial

```
Disponible Comercial = Inventario Bodega 01 - Pedidos Pendientes
```

### Regla: Qué SÍ entra en el cálculo

| Componente | Fuente | Operacion |
|------------|--------|-----------|
| Existencia Bodega 01 | ProductInventoryLevel WHERE externalRef='01' AND qty > 0 | BASE |
| Pedidos pendientes | CustomerOrderRecord WHERE status='PENDIENTE' | RESTA |

### Regla: Qué NO entra en el cálculo

| Componente | Razon |
|------------|-------|
| Produccion (Bodega 04) | Es trabajo en proceso, no producto terminado |
| Maletas (Bodegas 35-40) | Son muestras, no inventario comercial |
| Tiendas (Bodegas 00, 02, 03, 23, 29) | Inventario ya asignado a punto de venta |
| Importaciones (Bodegas 24, 42-49) | Mercancia en transito o pendiente nacionalizacion |
| Franquicias (Bodegas 08-15, 21) | Stock de terceros o historico |

### Declaracion

> PROHIBIDO inflar disponibilidad sumando Produccion, Maletas, Tiendas o Importaciones a Bodega 01.

### Reglas de Umbral (CEO-Validadas)

| Linea | Umbral | Accion | Fuente |
|-------|--------|--------|--------|
| LATIN KIDS | existenciaBodega01 <= 30 | Alerta + revisar produccion + revisar maletas + sugerir reemplazo | CEO Castillitos, reunion gerencia |
| CASTILLITOS | existenciaBodega01 <= 20 | Alerta + revisar produccion + revisar maletas + sugerir reemplazo | CEO Castillitos, reunion gerencia |
| IMPORTACION | Pendiente definicion | — | CEO aun no ha validado umbral |

---

## FASE 4: Modelo de Produccion

### Definicion Oficial

**Produccion = Bodega 04 (PRODUCTO EN PROCESO) + bodegas de materia prima (05, 06, 07)**

### Lo que Produccion SÍ es

| Concepto | Descripcion |
|----------|-------------|
| Trabajo en proceso | 1,318,904 unidades en Bodega 04 (mayor stock del sistema) |
| OP activas | 3,352 ordenes de produccion abiertas |
| Recuperacion futura | Producto que eventualmente llegara a Bodega 01 |
| Capacidad futura | Indicador de cuanto producto se esta fabricando |

### Lo que Produccion NO es

| Concepto | Razon |
|----------|-------|
| Inventario comercial | No es producto terminado disponible para venta |
| Stock vendible | No puede comprometerse contra pedidos |
| Disponibilidad | No debe sumarse a Bodega 01 |

### Declaracion

> Produccion NO es inventario comercial. Produccion NO debe sumarse a Bodega 01. Produccion representa trabajo en proceso y capacidad futura, no existencia disponible para venta.

---

## FASE 5: Mapa de Produccion

### Bodegas Productivas

| Codigo | Nombre | Funcion | Dominio | Estado |
|--------|--------|---------|---------|--------|
| 04 | PRODUCTO EN PROCESO | WIP — almacena producto en fabricacion | PRODUCCION | ACTIVA (1.3M unidades) |
| 05 | MATERIA PRIMA | Insumos base para produccion | PRODUCCION | INACTIVA (sin data en DB) |
| 06 | TELAS | Telas para confeccion | PRODUCCION | INACTIVA (sin data en DB) |
| 07 | RETAZOS | Sobrantes/recortes de produccion | PRODUCCION | INACTIVA (sin data en DB) |

### Fuentes de Movimiento Productivo

| Fuente | Codigo | Nombre | Flujo | Estado Sync |
|--------|--------|--------|-------|-------------|
| 33 | OP | Orden de Produccion | Crea WIP en 04 | SINCRONIZADO |
| 80 | CN | Consumos Insumos y Telas | 05/06 → 04 | NO SINCRONIZADO |
| 81 | PT | Entrada PT | Producto terminado variante | NO SINCRONIZADO |
| 99 | PC | Salida a Confeccionistas | 04 → externo | NO SINCRONIZADO |
| 100 | EC | Entrada de Confeccionistas | Externo → 04 | NO SINCRONIZADO |
| 116 | ET | Entrada Producto Terminado | 04 → 01 | NO SINCRONIZADO |
| 114 | 4 | Producto en Proceso | Ajuste interno en 04 | NO SINCRONIZADO |
| 115 | MV | Traslado Movimientos PDN | Traslado produccion | NO SINCRONIZADO |
| 129 | T1 | Gastos Terceros | Servicio externo | NO SINCRONIZADO |
| 118 | T2 | Gastos de Terceros | Servicio externo | NO SINCRONIZADO |
| 119 | Y1 | Causacion de Servicios T | Servicio externo | NO SINCRONIZADO |

### Nota sobre etapas productivas

El motor actual (`production-stage-inference.ts`) infiere etapas por tipo de documento (OP, CN, PC/EC, T1/T2/Y1, ET), NO por bodega. Esto es correcto: `warehouseCode` es NULL en 100% de los ProductionOrder, y la inferencia funciona sin el.

Etapas productivas conocidas (no confirmadas como bodegas separadas en SAG):
- Corte
- Confeccion (incluye confeccion externa via PC/EC)
- Estampacion
- Bordado
- Terminacion
- Empaque

Estas etapas se modelan como fases documentales dentro de un OP, no como bodegas fisicas separadas.

---

## FASE 6: Flujo Productivo Oficial

```
MATERIA PRIMA (05, 06, 07)
  | CN (fuente 80) — consumo de insumos
  v
PRODUCTO EN PROCESO (04) — 1.3M unidades, 3,007 productos
  | PC (fuente 99) — salida a confeccionista externo
  v
CONFECCIONISTA EXTERNO
  | EC (fuente 100) — entrada de confeccionista
  v
PRODUCTO EN PROCESO (04)
  | T1/T2/Y1 (fuentes 129, 118, 119) — servicios externos
  v
SERVICIOS EXTERNOS
  | retorno a 04
  v
PRODUCTO EN PROCESO (04)
  | ET (fuente 116) — entrada producto terminado
  v
BODEGA PRINCIPAL (01) — producto terminado disponible
  |
  v
DISPONIBLE COMERCIAL
```

### Evidencia

- 2,983 productos existen en AMBAS bodegas 04 y 01 (99.2% de 04 llega a 01)
- Solo 24 productos estan exclusivamente en 04 = WIP actual sin producto terminado

### Declaracion

> Este flujo es el flujo oficial de produccion de Castillitos. El producto NO esta disponible para venta hasta que llega a Bodega 01 via fuente 116 (ET).

---

## FASE 7: Modelo de Maletas

### Definicion Oficial

Cada vendedor ambulante posee una bodega propia en SAG que representa su maleta comercial.

### Registro de Vendedores

| Codigo | Nombre Bodega | Vendedor | En SELLER_WAREHOUSES | Estado PIL |
|--------|--------------|----------|---------------------|------------|
| 35 | VEND ORLANDO | Orlando | Si | 1 variante, qty -1 |
| 36 | VEND CARLOS LEON | Carlos Leon | Si | 0 variantes |
| 37 | VEND LUIS | Luis | Si | 0 variantes |
| 38 | VEND NESTOR | Nestor | Si | 0 variantes |
| 39 | VEND CARLOS VILLA | Carlos Villa | Si | 0 variantes |
| 40 | VEND FREDY | Fredy | **NO** — falta agregar | 2 variantes, qty -2 |

### Lo que las maletas SÍ representan

- Muestras de venta (producto para exhibicion y toma de pedidos)
- Inventario asignado a un vendedor especifico
- Mercancia que salio de Bodega 01 via TM (fuente 206)

### Lo que las maletas NO representan

- **No son ventas** (el vendedor muestra, no vende de la maleta)
- **No son inventario comercial** (no deben sumarse a Bodega 01)
- **No son producto disponible** para comprometer contra pedidos

### Estado Actual

Las bodegas de vendedores estan **practicamente vacias** en ProductInventoryLevel (V2). Esto se debe a que fuente 206 (TM = Traslado de Maletas) NO esta sincronizada. Los movimientos de entrada a bodegas 35-40 no se reflejan.

---

## FASE 8: Reglas de Maletas

### Flujo de Evaluacion de Reemplazo

```
Referencia en maleta del vendedor
  |
  v
Evaluar existencia en Bodega 01
  |
  v
[existencia <= umbral de linea?]
  |
  SI → Generar alerta
  |     |
  |     v
  |   Buscar reemplazo en mismo SubGrupo
  |     |
  |     v
  |   Verificar disponibilidad del reemplazo en Bodega 01
  |     |
  |     v
  |   Verificar produccion activa (OP en Bodega 04)
  |     |
  |     v
  |   [reemplazo disponible?]
  |     |
  |     SI → Sugerir reemplazo (suggestedOnly: true)
  |     NO → Sugerir nueva OP (suggestedOnly: true)
  |
  NO → Referencia se mantiene en maleta
```

### Umbrales por Linea

| Linea | Umbral | Fuente |
|-------|--------|--------|
| LATIN KIDS | <= 30 unidades en Bodega 01 | CEO Castillitos |
| CASTILLITOS | <= 20 unidades en Bodega 01 | CEO Castillitos |
| IMPORTACION | Pendiente definicion | CEO aun no validó |

### Declaracion

> Las muestras normalmente no se venden. Las referencias permanecen en maleta mientras existe disponibilidad comercial en Bodega 01. Cuando una referencia alcanza umbral critico, se evalua reemplazo dentro del mismo SubGrupo.

---

## FASE 9: Modelo de Tiendas

### Definicion Oficial

Cada tienda es una ubicacion independiente con inventario propio. Las tiendas consumen inventario desde Bodega 01 via traslados (TR, fuente 34).

### Registro de Tiendas

| Codigo | Nombre | Tipo | Stock Positivo | % Overlap con 01 | Estado |
|--------|--------|------|----------------|-------------------|--------|
| 00 | BODEGA CENTRO | Tienda propia | 1,275 | 73% | ACTIVA |
| 02 | BODEGA SANDIEGO | Tienda propia | 992 | 73% | ACTIVA |
| 03 | BODEGA MAYORCA | Tienda C.C. | 715 | 99% | ACTIVA |
| 23 | GRAN PLAZA | Tienda C.C. | 932 | 66% | ACTIVA |
| 29 | BODEGA CALDAS | Bodega/tienda | 886 | 57% | ACTIVA |
| 41 | DEXCATO. MC | Outlet/descuento | 354 variantes | — | ACTIVA |

### Franquicias (Historicas)

| Codigo | Nombre | Estado | Evidencia |
|--------|--------|--------|-----------|
| 08-15, 21 | F1 a F19 | Solo salidas historicas | 100% overlap con 01, solo qty negativas |

### Reglas de Tiendas

1. Las tiendas consumen inventario desde Bodega 01 via TR (fuente 34)
2. Las tiendas NO generan produccion
3. Las tiendas pueden generar sugerencias de reposicion
4. El inventario en tiendas NO se suma a Bodega 01
5. Cada tienda es una entidad administrativa independiente (COMERCIAL-TIENDAS-ENTERPRISE-05)

---

## FASE 10: Modelo de Transferencias

### Tipos de Transferencia

#### TR (Fuente 34) — Traslado entre Bodegas

| Atributo | Valor |
|----------|-------|
| Proposito | Mover mercancia entre cualquier par de ubicaciones |
| Origen | Cualquier bodega con stock |
| Destino | Cualquier bodega receptora |
| Impacto financiero | Ninguno (movimiento interno) |
| Impacto inventario | Neutro (resta en origen, suma en destino) |
| Estado sync | **NO SINCRONIZADO** |

**Rutas principales confirmadas:**

| Ruta | Proposito | Productos Compartidos |
|------|-----------|----------------------|
| 01 → 00 | Reposicion Centro | 1,578 |
| 01 → 02 | Reposicion Sandiego | 1,606 |
| 01 → 03 | Reposicion Mayorca | 813 |
| 01 → 23 | Reposicion Gran Plaza | 1,101 |
| 01 → 29 | Reposicion Caldas | 761 |
| 24 → 01 | Nacionalizacion importaciones | Confirmado por overlap |
| 42-49 → 24 | Contenedores a staging | 100% overlap |

#### TM (Fuente 206) — Traslado de Maletas

| Atributo | Valor |
|----------|-------|
| Proposito | Mover muestras desde Bodega 01 a bodegas de vendedores (35-40) |
| Origen | Siempre Bodega 01 |
| Destino | Bodegas 35-40 (vendedores) |
| Impacto financiero | Ninguno (movimiento interno) |
| Impacto inventario | Neutro |
| Estado sync | **NO SINCRONIZADO** |

---

## FASE 11: Modelo de Pedidos

### Definicion

Los pedidos (PD) representan compromisos de venta que reducen la disponibilidad comercial.

### Estados Validos (En DB)

| Status | Descripcion | Registros | Impacto |
|--------|-------------|-----------|---------|
| `PENDIENTE` | Pedido registrado, no despachado | 9,045 | Reduce disponibleReal |

### Estados Invalidos (Bug Conocido)

| Problema | Detalle |
|----------|---------|
| Query usa `status='open'` | Los datos guardan `status='PENDIENTE'`. Resultado: 0 pedidos afectan disponibilidad |

### Estados Pendientes de Validacion

| Estado | Nota |
|--------|------|
| `DESPACHADO` | No existe en DB. Posiblemente PD se elimina o cambia al despachar |
| `CANCELADO` | No existe en DB. Se desconoce como se anulan pedidos en SAG |
| `PARCIAL` | No existe en DB. Despachos parciales no documentados |

### Impacto de Pedidos

1. **Disponibilidad Comercial** — reduce `disponibleReal = existencia - pedidosPendientes`
2. **Reposicion** — referencias con alta demanda por pedidos generan sugerencias
3. **Alertas** — pedidos contra referencias con stock critico generan alertas
4. **Produccion** — pedidos sin stock pueden disparar sugerencias de produccion

---

## FASE 12: Fuentes de Verdad

### Matriz Oficial

| Dominio | Fuente de Verdad | Tabla Prisma | Bodega(s) | Estado |
|---------|-----------------|--------------|-----------|--------|
| **Inventario Comercial** | Bodega 01 | ProductInventoryLevel (externalRef='01') | 01 | ACTIVA (5d) |
| **Produccion** | Bodegas productivas | ProductionOrder + Lines | 04, 05, 06, 07 | ACTIVA (3d) |
| **Maletas** | Bodegas vendedores | ProductInventoryLevel (externalRef IN '35'-'40') | 35, 36, 37, 38, 39, 40 | SIN DATOS (TM no sync) |
| **Tiendas** | Bodegas tiendas | ProductInventoryLevel (externalRef IN '00','02','03','23','29') | 00, 02, 03, 23, 29 | ACTIVA (5d) |
| **Pedidos** | CustomerOrderRecord | CustomerOrderRecord (sourceCode='PD') | N/A | STALE (60d) |
| **Transferencias** | SAG fuente 34 (TR) + 206 (TM) | InventoryTransfer | N/A | **TABLA NO EXISTE** |
| **Disponibilidad** | Derivada | CommercialCoverageSnapshot | Calculada de 01 | ACTIVA (HOY) |
| **Cartera** | SAG facturas | CustomerReceivable | N/A | STALE (67d) |
| **Catalogo** | SAG articulos | ProductEntity | N/A | ACTIVA (5d) |
| **Variantes** | SAG tallas/colores | ProductVariant | N/A | ACTIVA (5d) |

### Regla: No Duplicar

> Cada dato tiene exactamente una fuente de verdad. No crear tablas paralelas que dupliquen la misma informacion. El inventario de Bodega 01 vive en ProductInventoryLevel, no en CommercialCoverageSnapshot (CCS es derivada, no fuente).

---

## FASE 13: Calculos Prohibidos

### PROHIBIDO: Sumar Bodega 01 + Bodega 04

**Razon:** Bodega 04 es trabajo en proceso. No es producto terminado. Sumarlos infla la disponibilidad real.

**Evidencia:** Bodega 04 tiene 1,318,904 unidades positivas vs Bodega 01 con 67,950 positivas. Si se suman, la disponibilidad se multiplica x20 artificialmente.

### PROHIBIDO: Contar Produccion como inventario disponible

**Razon:** Las OP abiertas representan trabajo futuro, no existencia actual.

**Evidencia:** 3,352 OPs abiertas con 1,386,210 unidades ordenadas. Nada de eso es vendible hoy.

### PROHIBIDO: Contar Maletas como inventario comercial

**Razon:** Las maletas son muestras asignadas a vendedores. No son stock disponible para nuevos pedidos.

### PROHIBIDO: Duplicar inventario entre dominios

**Razon:** El producto que esta en Bodega 02 (Sandiego) ya salio de Bodega 01. Contar ambos = doble conteo.

**Regla:** Cada unidad de producto existe en exactamente una bodega a la vez. Los traslados mueven, no duplican.

### PROHIBIDO: Calcular disponibilidad desde multiples bodegas sin contexto operacional

**Razon:** Sumar stock de todas las bodegas da un numero sin significado comercial. El CEO necesita saber cuanto puede vender desde Principal, no cuanto existe en todo el sistema.

### PROHIBIDO: Presentar inventario negativo como "cero disponible"

**Razon:** Inventario negativo en SAG significa movimientos acumulados (salidas > entradas sincronizadas). No es lo mismo que "no hay stock". Debe mostrarse como dato con flag de calidad.

### PROHIBIDO: Usar produccion para "garantizar" disponibilidad

**Razon:** Una OP abierta no garantiza entrega. La produccion puede retrasarse, cancelarse, o tener problemas de calidad. Solo puede usarse como "capacidad futura estimada", no como stock confirmado.

---

## FASE 14: Calculos Permitidos

### Consultas Inter-Dominio Validas

| Quien Consulta | Que Consulta | Proposito | Regla |
|----------------|-------------|-----------|-------|
| Produccion | Inventario (Bodega 01) | Verificar si producto terminado ya llego | Solo lectura |
| Maletas | Inventario (Bodega 01) | Verificar disponibilidad para evaluar reemplazo | Solo lectura |
| Reposicion | Inventario (Bodega 01) | Detectar referencias agotadas o criticas | Solo lectura |
| Executive Reports | Inventario (Bodega 01) | KPIs de disponibilidad comercial | Solo lectura |
| Disponibilidad | Pedidos | Calcular `disponibleReal = existencia - pendientes` | Solo lectura |
| Produccion | OP (ProductionOrder) | Estado de ordenes activas por referencia | Solo lectura |
| Maletas | Produccion | Verificar si referencia tiene OP activa antes de sugerir reemplazo | Solo lectura |
| Tiendas | Inventario (Bodega 01) | Verificar stock disponible para reposicion | Solo lectura |
| Executive Reports | Todos los dominios | Consolidar vision ejecutiva | Solo lectura |

### Regla de Direccion

```
Produccion → alimenta → Inventario (via ET fuente 116)
Inventario → alimenta → Disponibilidad Comercial
Inventario → alimenta → Maletas (via TM fuente 206)
Inventario → alimenta → Tiendas (via TR fuente 34)
Pedidos → reduce → Disponibilidad Comercial
```

Los dominios SOLO se leen entre si. Ningun dominio modifica datos de otro dominio.

---

## FASE 15: Impacto en Agentik

### Motores Alineados (Correctos)

| Motor | Estado | Evidencia |
|-------|--------|-----------|
| Production Intelligence | ALINEADO | Usa ProductionOrder + Lines. Stage inference por tipo de documento, no por bodega. Correcto. |
| Production Flow Engine | ALINEADO | `buildProductionFlowSnapshot()` modela flujo 04→01 correctamente |
| Tenant Rule Resolver | ALINEADO | Reglas apuntan a `existenciaBodega01` con umbrales CEO |

### Motores que Requieren Ajustes

| Motor | Problema | Ajuste Requerido |
|-------|----------|-----------------|
| **CommercialCoverageSnapshot builder** | Calcula desde PIL Bodega 01 pero no filtra qty > 0. Hereda negativos | Filtrar `quantity > 0` al calcular disponibilidad |
| **Disponibilidad query** | Usa `status='open'` para pedidos | Cambiar a `status='PENDIENTE'` |
| **LiveVendor** | No tiene datos de maletas (fuente 206 no sincronizada) | Sincronizar TM primero |
| **Replenishment Intelligence** | No tiene datos de traslados (fuente 34 no sincronizada) | Sincronizar TR primero |

### Metricas que Deben Revisarse

| Metrica | Problema | Accion |
|---------|----------|--------|
| `disponibleReal` | No descuenta pedidos (query rota) | Fix query de status |
| KPIs ejecutivos de disponibilidad | Basados en CCS que hereda negativos | Recalcular CCS filtrando qty > 0 |
| "Referencias con stock" | Incluye registros negativos como "con stock" | Filtrar qty <= 0 |
| Cobertura por linea | LT muestra 264 "disponibles" — puede incluir conteos distorsionados | Verificar post-fix |

### Dashboards que Deben Replantearse

| Dashboard | Problema | Accion |
|-----------|----------|--------|
| Executive Dashboard — Disponibilidad | Datos base distorsionados por negativos | Recalcular CCS post-fix |
| Executive Dashboard — Maletas | "Pendiente sincronizacion TM 206" | Sincronizar fuente 206 |
| Executive Dashboard — Vendedores | Sin datos de maletas | Depende de TM sync |
| Executive Dashboard — Cartera | Datos de hace 67 dias | Re-sync cartera |

---

## FASE 16: Roadmap de Correccion

### P0 — Errores Conceptuales (Bloquean integridad de datos)

| # | Problema | Impacto | Accion |
|---|----------|---------|--------|
| P0.1 | Query de pedidos usa `status='open'` en lugar de `'PENDIENTE'` | disponibleReal no descuenta pedidos | Fix query en availability engine |
| P0.2 | CCS incluye registros con inventario negativo | Disponibilidad distorsionada | Filtrar qty > 0 al calcular CCS |
| P0.3 | Fredy (bodega 40) falta en CASTILLITOS_SELLER_WAREHOUSES | Vendedor invisible | Agregar a registro |

### P1 — Errores de Sincronizacion (Datos faltantes o desactualizados)

| # | Problema | Impacto | Accion |
|---|----------|---------|--------|
| P1.1 | Pedidos no re-sincronizados desde abril 29 | 60 dias de pedidos perdidos | Re-sync fuente PD |
| P1.2 | Cartera no re-sincronizada desde abril 22 | 67 dias de movimientos perdidos | Re-sync cartera |
| P1.3 | Fuente 206 (TM) nunca sincronizada | Sin datos de maletas | Sync TM + aplicar migration InventoryTransfer |
| P1.4 | Fuente 34 (TR) nunca sincronizada | Sin datos de traslados | Sync TR |
| P1.5 | Inventario negativo masivo en Bodega 01 (94%) | Calidad de datos comprometida | Investigar con equipo SAG |

### P2 — Errores de UX (Presentacion incorrecta)

| # | Problema | Impacto | Accion |
|---|----------|---------|--------|
| P2.1 | Dashboard muestra inventario negativo como "disponible" | CEO ve datos incoherentes | Filtrar negativos + mostrar badge de calidad |
| P2.2 | Seccion Maletas muestra "Pendiente sincronizacion" | Seccion inutilizable | Depende de P1.3 |
| P2.3 | Seccion Cartera muestra datos de hace 67 dias sin disclaimer | CEO puede tomar decisiones erroneas | Agregar badge de frescura |

### P3 — Nuevas Funcionalidades (Cuando P0-P2 esten resueltos)

| # | Funcionalidad | Dependencia |
|---|---------------|-------------|
| P3.1 | LiveVendor con datos reales de maletas | P1.3 (TM sync) |
| P3.2 | Replenishment Intelligence con datos de traslados | P1.4 (TR sync) |
| P3.3 | Store→Bodega mapping automatico | P1.4 + confirmacion con Castillitos |
| P3.4 | InventoryLocation model en Prisma | Diseño validado en BODEGA-DISCOVERY-01 |
| P3.5 | Sync periodico automatizado (cron) | Todos los P1 |
| P3.6 | Confirmacion de 10 bodegas desconocidas | Reunion con Castillitos |

---

## Diagrama de Flujo Completo

```
                    ┌─────────────────────────────┐
                    │   MATERIA PRIMA (05, 06, 07) │
                    └──────────────┬──────────────┘
                                   │ CN (fuente 80)
                                   v
┌──────────┐       ┌──────────────────────────────┐
│CONTENEDOR│──TR──→│   PRODUCTO EN PROCESO (04)    │
│ (42-49)  │       │   WIP: 1,318,904 unidades     │
└──────────┘       │   3,007 productos              │
     │             └───────┬───────────┬───────────┘
     │ TR                  │ PC/EC     │ ET (fuente 116)
     v                     v           v
┌──────────┐     ┌──────────┐  ┌────────────────────────────┐
│IMPORTACION│     │CONFECCION│  │   BODEGA PRINCIPAL (01)     │
│   (24)   │──TR─→│ EXTERNA  │  │   Hub central               │
│ Staging  │     └──────────┘  │   67,950 unidades positivas  │
└──────────┘                   └─────┬────┬────┬────┬────────┘
                                     │    │    │    │
                          TR(34) ────┤    │    │    │──── TM(206)
                                     v    v    v    v
                              ┌──────┐┌──┐┌──┐┌──┐ ┌──────────────┐
                              │CENTRO││SD││MY││GP│ │  VENDEDORES  │
                              │ (00) ││02││03││23│ │  (35-40)     │
                              └──────┘└──┘└──┘└──┘ │  Maletas     │
                              ┌──────┐              └──────────────┘
                              │CALDAS│
                              │ (29) │
                              └──────┘
```

---

## Glosario

| Termino | Definicion |
|---------|-----------|
| **Bodega** | Ubicacion logica en SAG donde se almacena inventario |
| **Fuente** | Tipo de documento SAG que genera movimientos de inventario |
| **PIL** | ProductInventoryLevel — tabla de inventario por variante por bodega |
| **CCS** | CommercialCoverageSnapshot — tabla derivada de disponibilidad comercial |
| **OP** | Orden de Produccion (fuente 33) |
| **TR** | Traslado entre Bodegas (fuente 34) |
| **TM** | Traslado de Maletas (fuente 206) |
| **ET** | Entrada Producto Terminado (fuente 116) |
| **WIP** | Work In Process — producto en fabricacion |
| **SubGrupo** | Clasificacion de producto usada para buscar reemplazos |
| **disponibleReal** | existenciaBodega01 - pedidosPendientes |
| **suggestedOnly** | Flag que indica que una accion es sugerida, no ejecutada automaticamente |

---

## Validacion

- No se modifico ningun archivo de codigo
- No se crearon nuevas tablas, modelos, ni migraciones
- TSC baseline: 160 (verificado)
- Todas las afirmaciones tienen fuente de evidencia documentada
- Las reglas de negocio provienen de CEO Castillitos (tenant-rule-registry.ts)
- Las clasificaciones de bodegas provienen de BODEGA-DISCOVERY-01 y TRANSFER-DISCOVERY-01
- Los datos de frescura provienen de DATA-TRUST-AUDIT-01

---

## Criterio de Aprobacion

Este documento cumple el criterio de aprobacion del sprint:

> "Existe una definicion oficial y documentada del modelo operacional de Castillitos que permite que todos los motores actuales y futuros de Agentik trabajen sobre la misma interpretacion del negocio, evitando duplicaciones, calculos incorrectos, sumatorias invalidas y confusiones entre inventario comercial, produccion, maletas, tiendas y transferencias."

Especificamente:

1. **Dominios formalizados** (FASE 1): 8 dominios con responsabilidad, fuente, consumidores, propietario
2. **Inventario = Bodega 01** (FASE 2-3): Definido oficialmente con reglas de calculo
3. **Produccion != Inventario** (FASE 4-6): Separacion explicita con flujo documentado
4. **Maletas = Muestras** (FASE 7-8): Definidas como muestras, no como stock vendible
5. **Tiendas = Ubicaciones independientes** (FASE 9): Consumen de 01, no generan produccion
6. **Transferencias = Movimiento** (FASE 10): Neutras, no crean ni destruyen inventario
7. **Pedidos = Compromisos** (FASE 11): Reducen disponibilidad, estados documentados
8. **Fuentes de verdad** (FASE 12): Matriz completa sin duplicados
9. **Prohibiciones explicitas** (FASE 13): 7 calculos prohibidos con evidencia
10. **Calculos permitidos** (FASE 14): Direccion y reglas de consulta inter-dominio
11. **Impacto en Agentik** (FASE 15): 3 motores alineados, 4 requieren ajustes
12. **Roadmap priorizado** (FASE 16): P0 (3), P1 (5), P2 (3), P3 (6) acciones
