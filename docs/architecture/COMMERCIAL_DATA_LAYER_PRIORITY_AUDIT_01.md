# COMMERCIAL_DATA_LAYER_PRIORITY_AUDIT_01

**Sprint:** AUDIT-COMMERCIAL-DATA-LAYER-PRIORITY-01
**Date:** 2026-07-11
**Tenant:** Castillitos
**Scope:** Priorizacion objetiva de entidades faltantes del Commercial Data Layer
**Constraint:** Cero cambios en produccion, Prisma, o adapters

---

## Resumen Ejecutivo

Este documento audita cual entidad del Commercial Data Layer debe construirse primero,
usando exclusivamente la evidencia del Knowledge Gap Discovery y los requerimientos
confirmados del negocio Castillitos.

**Resultado:** SaleLineRecord NO es necesariamente la primera pieza. El analisis revela
que **CustomerProfile enrichment** (sucursales, contacto completo, datos maestros) tiene
igual o mayor impacto inmediato porque desbloquea 6 de los 15 puntos de la reunion sin
dependencias tecnicas, mientras que SaleLineRecord requiere confirmacion de fuentes SAG
y su impacto se materializa solo tras construir motores derivados.

**Recomendacion final:** Construir un **paquete minimo de 3 entidades** en secuencia:

1. **CustomerProfile enrichment** (sucursales, contacto, datos maestros)
2. **SaleLineRecord** (lineas FV/NV — unidades + precio)
3. **InventoryPosition por bodega-tienda** (mapeo confirmado)

---

## FASE 1 — Trazabilidad a la Reunion

### Puntos de la reunion mapeados a entidades

| # | Punto de reunion | Entidad principal | Entidades secundarias | Bloqueado? | Parcial? | Fuente SAG | Evidencia |
|---|---|---|---|---|---|---|---|
| 1 | Sucursales de clientes en pedidos | CustomerBranch | CustomerProfile, OrderRecord | SI — no existe modelo sucursal | NO | TERCEROS + DIRECCIONES (si existe) | Discovery: CustomerProfile solo tiene 1 direccion |
| 2 | Alerta de cartera vencida | CustomerReceivable | CustomerProfile | NO — ya funciona | SI (funcional) | CARTERA (ya synced) | CONTROL_COMERCIAL_02: cartera vencida $44.5B real |
| 3 | Clientes con mas de 3 meses sin comprar | CustomerProfile (lastPurchaseAt) | SaleRecord | NO — derivable hoy | SI (requiere calculo) | SaleRecord existente | Discovery CAP-11: derivable sin nuevo sync |
| 4 | Surtido automatico por tallas | InventoryPosition | StorePolicyRule, ProductVariant | PARCIAL — motor existe, datos parciales | SI | Inventario por bodega | Coverage Engine funcional; falta inv por tienda |
| 5 | Trazabilidad de pedidos | SaleLineRecord | CustomerOrderRecord, OrderInvoiceMatch | PARCIAL — header existe, lineas NO | SI | MOVIMIENTOS_ITEMS FV | order-invoice-match-engine.ts existe |
| 6 | Ventas por tienda | SaleRecord (storeSlug) | — | NO — ya funciona | SI (montos, no unidades) | SaleRecord existente | CONTROL_COMERCIAL: ventas por tienda real |
| 7 | Ventas por vendedor | SaleRecord (sellerSlug) | Vendor | NO — ya funciona | SI (montos, no unidades) | SaleRecord existente | Ranking vendedores real en Control Comercial |
| 8 | Productos de baja rotacion | SaleLineRecord | InventoryPosition, ProductVariant | SI — sin unidades | NO | MOVIMIENTOS_ITEMS FV/NV | Discovery CAP-02: rotacion requiere unidades |
| 9 | Descuentos por antiguedad | SaleLineRecord | ProductMovement (fecha ingreso) | SI — sin fecha ingreso ni precio | NO | MOVIMIENTOS_ITEMS + ET | Discovery CAP-04 + CAP-15 |
| 10 | Fecha de ingreso a tienda | StoreInventoryMovement | ProductMovement, InventoryPosition | SI — no existe | NO | MOVIMIENTOS por bodega-tienda | Discovery GAP-02: derivable de MOVIMIENTOS |
| 11 | Productos que rotan en una tienda y en otra no | SaleLineRecord + InventoryPosition | Store config | SI — sin ventas por variante/tienda | NO | MOVIMIENTOS_ITEMS FV por bodega | Requiere GAP-01 + GAP-06 |
| 12 | Ciudad, documento, direccion, telefono, correo | CustomerProfile (enriched) | — | PARCIAL — ciudad 90%, resto incompleto | SI | TERCEROS (campos adicionales) | Stabilization: ciudad 90% via CRM |
| 13 | Tallas, colores, precios, subgrupo, linea, tamano | ProductVariant + SaleLineRecord | — | PARCIAL — atributos existen, precio NO | SI | v_articulos + MOVIMIENTOS_ITEMS | Discovery: talla/color existen, precio falta |
| 14 | Canal de venta | SaleRecord (channel) | — | NO — ya funciona | SI | SaleRecord.channel | CONTROL_COMERCIAL_02 Fase 8: canales reales |
| 15 | Ventas historicas y ultimos 6 meses | SaleRecord + SaleLineRecord | — | PARCIAL — montos SI, unidades NO | SI | SaleRecord existe; lineas falta | SaleRecord tiene historico por monto |

### Resumen de bloqueos

| Estado | Puntos | Detalle |
|---|---|---|
| **Ya funciona** | 2, 6, 7, 14 | Cartera, ventas tienda, ventas vendedor, canal |
| **Derivable hoy** | 3 | Clientes sin comprar (calculo sobre SaleRecord) |
| **Parcial (funciona con limitaciones)** | 4, 5, 12, 13, 15 | Surtido, trazabilidad, datos cliente, atributos, historico |
| **Bloqueado** | 1, 8, 9, 10, 11 | Sucursales, rotacion, descuentos, ingreso tienda, rotacion cruzada |

---

## FASE 2 — Matriz de Candidatos

### Evaluacion de 12 entidades candidatas

| # | Entidad | Capacidades desbloqueadas | Motores consumidores | Modulos consumidores | Fuente SAG | Estado conocimiento | Dependencias | Riesgos |
|---|---|---|---|---|---|---|---|---|
| 1 | SaleLineRecord | CAP-02, CAP-04, CAP-05, CAP-06, CAP-14, CAP-15 | Rotation, Repurchase, Markdown, Pricing, Intelligence | Inventario, Tiendas, Maletas, Control, Vendedores | MOVIMIENTOS_ITEMS (FV/NV) | ALTO — campos mapeados en SAG_MAPPING | Confirmacion fuentes FV; volumen 50-100K | Volumen masivo; n_valor_unitario puede no existir |
| 2 | CustomerProfile (enriched) | CAP-08, CAP-11, CAP-12 | Customer Intelligence, CRM, Segmentation | Clientes 360, Control, Pedidos, Vendedores | TERCEROS (ya synced parcial) | ALTO — TERCEROS ya accedido | Ninguna critica | Campos adicionales pueden estar vacios |
| 3 | CustomerBranch | — (operativo) | Order Creator, Pedidos | Pedidos, Clientes 360 | TERCEROS + DIRECCIONES_SUCURSALES? | BAJO — tabla no confirmada | Existencia de tabla en SAG | Puede no existir en SAG PYA |
| 4 | ProductVariant | CAP-02, CAP-03 | Coverage, Maletas, Inventario | Tiendas, Maletas, Inventario | v_articulos (ya accedido) | ALTO — talla/color existen | Ninguna | Modelo ya existe parcialmente (ProductEntity) |
| 5 | ProductMovement | CAP-01, CAP-04, GAP-02, GAP-03 | Age Engine, Staleness Engine, Markdown | Inventario, Inteligencia | MOVIMIENTOS (todas fuentes) | ALTO — tabla mapeada | SaleLineRecord para movimientos de salida | Volumen potencialmente masivo |
| 6 | ImportReceipt | CAP-13 | Importaciones, Costos | Importaciones (futuro) | NO EXISTE en SAG | CONFIRMADO no disponible | Modulo propio necesario | Ingesta manual/Excel |
| 7 | InventoryPosition | CAP-03, CAP-10 | Coverage, Transfer, Alerts | Tiendas, Maletas, Control | Inventario por bodega (ya para B01) | ALTO — mapeo bodega confirmado | Config bodega→tienda en Agentik | Bajo riesgo tecnico |
| 8 | Vendor | CAP-07 | Vendor Engine, Live Vendor | Vendedores, Maletas | VENDEDORES? (no confirmado) | MEDIO — SAG table no confirmada | CRM ya tiene vendedores parcial | Duplicacion con CRM sellers |
| 9 | StoreInventoryMovement | CAP-01 (por tienda), punto 10 | Coverage temporal, Alerts | Tiendas | MOVIMIENTOS por bodega-tienda | MEDIO — derivable de MOVIMIENTOS | InventoryPosition + ProductMovement | Complejidad alta; requiere ambas previas |
| 10 | CustomerReceivable | — (ya funciona) | Cobros, Riesgo, Cartera | Finanzas, Clientes, Control | CARTERA (ya synced) | COMPLETO | — | — |
| 11 | ReturnLineRecord (NC) | CAP-14 | Rotation (neta), Quality | Inventario, Inteligencia | MOVIMIENTOS_ITEMS (NC) | ALTO — misma tabla que FV | SaleLineRecord (misma infra) | Bajo riesgo incremental |
| 12 | PriceSnapshot | CAP-15 | Pricing, Markdown | Inteligencia, Pricing | v_articulos PV3/PV4 | ALTO — campos confirmados | Cron job periodico | Sin historico retroactivo |

---

### Puntaje por criterio (1-5)

| # | Entidad | C1: Reunion (25%) | C2: Motores (20%) | C3: Impacto inmediato (20%) | C4: Fuente SAG (10%) | C5: Multi-tenant (10%) | C6: Dependencias (10%) | C7: Riesgo (5%) | TOTAL |
|---|---|---|---|---|---|---|---|---|---|
| 1 | SaleLineRecord | 4 | 5 | 3 | 4 | 5 | 4 | 3 | **4.00** |
| 2 | CustomerProfile (enriched) | 5 | 3 | 5 | 5 | 5 | 5 | 5 | **4.55** |
| 3 | CustomerBranch | 3 | 1 | 3 | 2 | 3 | 3 | 2 | **2.55** |
| 4 | ProductVariant | 3 | 4 | 3 | 5 | 5 | 5 | 5 | **3.85** |
| 5 | ProductMovement | 3 | 4 | 2 | 4 | 4 | 3 | 3 | **3.20** |
| 6 | ImportReceipt | 1 | 1 | 1 | 1 | 2 | 2 | 2 | **1.30** |
| 7 | InventoryPosition | 4 | 4 | 4 | 5 | 4 | 4 | 5 | **4.15** |
| 8 | Vendor | 2 | 2 | 2 | 3 | 4 | 4 | 4 | **2.65** |
| 9 | StoreInventoryMovement | 2 | 2 | 1 | 3 | 3 | 2 | 2 | **2.10** |
| 10 | CustomerReceivable | 1 | 1 | 1 | 5 | 5 | 5 | 5 | **2.30** |
| 11 | ReturnLineRecord | 2 | 3 | 2 | 4 | 5 | 3 | 4 | **2.85** |
| 12 | PriceSnapshot | 2 | 3 | 2 | 5 | 4 | 4 | 4 | **3.00** |

### Justificacion de puntajes clave

**CustomerProfile enriched (4.55):**
- C1=5: Resuelve directamente puntos 3 (sin comprar), 12 (ciudad/doc/dir/tel/correo), y habilita 1 (sucursales parcial)
- C3=5: Impacto inmediato en Clientes 360, Control Comercial — UI ya existe, solo faltan datos
- C4=5: TERCEROS ya accedido, campos adicionales son consulta directa
- C5=5: Todos los ERPs tienen tabla de terceros/clientes
- C6=5: Zero dependencias tecnicas — enriquece modelo existente
- C7=5: Bajo riesgo — peor caso: campos vacios, no rompe nada

**InventoryPosition por tienda (4.15):**
- C1=4: Resuelve puntos 4 (surtido), 10 (fecha ingreso tienda parcial), 11 (rotacion cruzada parcial)
- C3=4: Coverage Engine YA existe y opera con datos parciales; datos reales lo activan al 100%
- C4=5: Inventario por bodega ya confirmado; mapeo bodega→tienda CONFIRMADO (julio 2026)
- C6=4: Solo requiere configuracion de mapeo en Agentik (no sync nuevo)

**SaleLineRecord (4.00):**
- C1=4: Resuelve puntos 5 (trazabilidad), 8 (rotacion), 13 (precios), 15 (historico unidades)
- C2=5: Alimenta 6 motores directamente (maximo de todos los candidatos)
- C3=3: Impacto NO es inmediato — requiere construir Rotation Engine + Age Engine despues
- C4=4: Campos mapeados pero fuentes FV/NV no 100% confirmadas (fuente 1 vs 2)
- C7=3: Riesgo medio — volumen 50-100K, n_valor_unitario puede no existir

---

## FASE 3 — Analisis de Dependencias

### Grafo de dependencias

```
CustomerProfile (enriched)
├── requiere: TERCEROS SAG (YA accedido)
├── requiere: CRM Accounts (YA synced)
├── NO requiere nuevas tablas SAG
├── NO requiere nuevos modelos Prisma (enriquece existente)
└── dependencia: NINGUNA

InventoryPosition (por bodega-tienda)
├── requiere: mapeo bodega→tienda (CONFIRMADO julio 2026)
├── requiere: inventario por bodega (YA accedido para B01)
├── requiere: configuracion StoreLocation (EXISTE en tiendas)
├── se beneficia de: ProductVariant (ya parcial)
└── dependencia: solo configuracion, NO sync nuevo

SaleLineRecord
├── requiere: MOVIMIENTOS_ITEMS tabla SAG (mapeada)
├── requiere: confirmacion fuente FV (1 o 2?)
├── requiere: header MOVIMIENTOS (fecha, cliente, vendedor)
├── requiere: v_articulos join (referenceCode)
├── se beneficia de: CustomerProfile (para enriquecer)
├── se beneficia de: InventoryPosition (para comparar)
├── se beneficia de: ProductVariant (para agregar)
└── dependencia: confirmacion fuente, nuevo modelo Prisma

ProductMovement
├── requiere: MOVIMIENTOS_ITEMS SAG (misma tabla que SaleLineRecord)
├── requiere: SaleLineRecord (movimientos de salida = ventas)
├── requiere: ProductionEvent ET (movimientos de entrada = produccion)
├── se beneficia de: InventoryPosition (contexto actual)
└── dependencia: SaleLineRecord DEBE existir primero

ReturnLineRecord
├── requiere: misma infra que SaleLineRecord (MOVIMIENTOS_ITEMS)
├── requiere: fuente NC confirmada
├── se beneficia de: SaleLineRecord (comparar venta vs devolucion)
└── dependencia: SaleLineRecord construido primero (reutiliza patron)

ProductVariant
├── requiere: v_articulos SAG (YA accedido)
├── requiere: ProductEntity existente (parcial)
├── NO requiere nuevas tablas SAG
└── dependencia: baja (enriquece modelo existente)

CustomerBranch
├── requiere: tabla DIRECCIONES/SUCURSALES en SAG (NO CONFIRMADA)
├── requiere: CustomerProfile (ya existe)
├── BLOQUEADOR: no se sabe si SAG PYA tiene sucursales como entidad
└── dependencia: DISCOVERY necesario antes de poder implementar

StoreInventoryMovement
├── requiere: InventoryPosition (saber donde esta hoy)
├── requiere: ProductMovement (saber cuando entro)
├── requiere: SaleLineRecord (saber cuando salio)
└── dependencia: ALTA — requiere ambos paquetes anteriores
```

### Paquetes minimos viables

| Paquete | Entidades | Se puede construir solo? | Valor standalone? |
|---|---|---|---|
| A: Customer enrichment | CustomerProfile (enriquecer) | SI | SI — Clientes 360 mejora inmediatamente |
| B: Inventory per store | InventoryPosition (config) | SI | SI — Coverage Engine se activa al 100% |
| C: Sale lines | SaleLineRecord | SI (con confirmacion fuente) | PARCIAL — necesita motores derivados |
| D: Temporal layer | ProductMovement + SaleLineRecord | NO (C primero) | SI (tras C) — edad + rotacion |
| E: Returns | ReturnLineRecord | NO (C primero) | Incremental sobre C |

---

## FASE 4 — Valor por Motor

### Matriz entidad vs motor

| Motor | CustomerProfile | InventoryPosition | SaleLineRecord | ProductMovement | ReturnLine | ProductVariant |
|---|---|---|---|---|---|---|
| Coverage Engine | indirecto | **INMEDIATO** | futuro | — | — | indirecto |
| Rules Evidence Engine | — | **INMEDIATO** | — | — | — | — |
| Rotation Engine | — | futuro | **INMEDIATO** | **INMEDIATO** | futuro | indirecto |
| Repurchase Engine | — | indirecto | **INMEDIATO** | **INMEDIATO** | — | — |
| Markdown Engine | — | indirecto | **INMEDIATO** | **INMEDIATO** | — | — |
| Transfer Engine | — | **INMEDIATO** | futuro | — | — | — |
| Production Signal Engine | — | indirecto | indirecto | — | — | — |
| Customer Intelligence | **INMEDIATO** | — | futuro | — | — | — |
| Sales Intelligence | indirecto | — | **INMEDIATO** | — | futuro | — |
| Commercial Copilot (David) | **INMEDIATO** | **INMEDIATO** | futuro | futuro | — | indirecto |

### Conteo de activaciones

| Entidad | Consumidores inmediatos | Consumidores futuros | Total |
|---|---|---|---|
| SaleLineRecord | 4 (Rotation, Repurchase, Markdown, Sales Intel) | 3 (Coverage, Transfer, Copilot) | 7 |
| InventoryPosition | 4 (Coverage, Rules Evidence, Transfer, Copilot) | 2 (Rotation, Repurchase) | 6 |
| CustomerProfile | 2 (Customer Intelligence, Copilot) | 2 (Sales Intel, Rotation) | 4 |
| ProductMovement | 3 (Rotation, Repurchase, Markdown) | 1 (Coverage) | 4 |
| ProductVariant | 0 inmediatos (enriquece otros) | 3 (Coverage, Rotation, Sales) | 3 |
| ReturnLineRecord | 0 inmediatos | 2 (Rotation neta, Quality) | 2 |

**Analisis:** SaleLineRecord tiene mas consumidores FUTUROS, pero InventoryPosition y
CustomerProfile tienen consumidores que YA ESTAN CONSTRUIDOS y esperando datos.

---

## FASE 5 — Recomendacion

### 1. Adaptador recomendado como PRIMERO: CustomerProfile enrichment

**Justificacion:**
- Puntaje ponderado mas alto (4.55)
- Zero dependencias tecnicas
- Impacto inmediato en UI existente (Clientes 360 ya construido)
- Resuelve 3 puntos de reunion directamente (#3, #12, parcial #1)
- No requiere nuevo modelo Prisma — enriquece campos existentes
- No requiere confirmacion de fuentes SAG — TERCEROS ya accedido
- Riesgo nulo — peor caso: campos vacios, cero regresion

**Alcance:** Agregar a CustomerProfile: telefono, correo, direccion completa, tipo documento,
numero documento, representante legal (si existe), ciudad confirmada (DANE), departamento,
fecha ultima compra calculada (lastPurchaseAt population).

---

### 2. Paquete minimo que debe acompanarlo

**InventoryPosition por bodega-tienda** (puntaje 4.15)

**Justificacion:**
- Coverage Engine YA existe y funciona con datos parciales
- Mapeo bodega→tienda CONFIRMADO en julio 2026
- Solo requiere configuracion + query a bodegas comerciales (ya accedidas)
- Activa completamente: Coverage Engine, Rules Evidence, Transfer Engine
- Resuelve puntos #4 (surtido) y parcialmente #10, #11

---

### 3. Segundo adaptador: SaleLineRecord

**Justificacion:**
- Maximo numero de motores alimentados (7 total)
- Desbloquea las capacidades de mayor impacto a largo plazo (rotacion, margen, recompra)
- Patron identico a CustomerOrderLine (ya implementado para PD)
- Requiere: confirmacion fuente FV + nuevo modelo Prisma

**Riesgo aceptable:** El impacto no es inmediato pero es FUNDAMENTAL. Sin unidades vendidas,
3 motores planificados (Rotation, Repurchase, Markdown) nunca pueden activarse.

---

### 4. Tercer adaptador: ProductMovement (derivado temporal)

**Justificacion:**
- Completa el ciclo con SaleLineRecord: entrada + salida = rotacion
- Desbloquea CAP-01 (edad), CAP-04 (antiguedad)
- Datos YA parcialmente disponibles (ProductionEvent ET tiene entradas)
- Combinado con SaleLineRecord, activa Rotation Engine

---

### 5. Que NO construir todavia

| Entidad | Razon para postergar |
|---|---|
| CustomerBranch | Tabla SAG no confirmada; requiere discovery previo |
| ImportReceipt | SAG no tiene entidad; requiere modulo propio manual |
| StoreInventoryMovement | Dependencia alta — necesita SaleLineRecord + InventoryPosition |
| Vendor (SAG) | CRM ya tiene vendedores; duplicaria esfuerzo |
| ReturnLineRecord | Esperar a que SaleLineRecord este estable; es incremental |
| PriceSnapshot | Requiere cron; valor solo tras tener SaleLineRecord |

---

### 6. Requerimientos resueltos por etapa

| Etapa | Puntos resueltos | Puntos parcialmente habilitados |
|---|---|---|
| Sprint 1 (Customer + Inventory) | #2, #3, #4, #6, #7, #12, #14 | #1, #10, #11 |
| Sprint 2 (SaleLineRecord) | #5, #8, #13, #15 | #9, #11 |
| Sprint 3 (ProductMovement) | #9, #10 | #11 (completo) |

**Tras Sprint 3:** 14 de 15 puntos resueltos o parcialmente habilitados.
**Punto #1 (sucursales)** queda pendiente discovery de tabla SAG.

---

### 7. Riesgos de elegir otro orden

| Orden alternativo | Riesgo |
|---|---|
| SaleLineRecord primero | UI sin mejora inmediata; 50-100K registros sin consumidor activo; motores derivados aun no existen |
| ProductMovement primero | Sin contexto de ventas, la edad de inventario no genera valor decisional |
| CustomerBranch primero | Discovery puede resultar en tabla inexistente; esfuerzo desperdiciado |
| InventoryPosition sin Customer | Pierde la oportunidad de quick win en Clientes 360 que ya esta construido |

---

## FASE 6 — Roadmap de Ejecucion

### Sprint 1: Customer Intelligence Foundation + Store Coverage Activation

**Entidades:** CustomerProfile enrichment + InventoryPosition por bodega-tienda
**Capacidades desbloqueadas:** CAP-03, CAP-08, CAP-10, CAP-11, CAP-12
**Puntos reunion resueltos:** #2 (cartera — ya), #3 (sin comprar), #4 (surtido), #6 (ventas tienda — ya), #7 (ventas vendedor — ya), #12 (datos cliente), #14 (canal — ya)
**Dependencias:** Ninguna critica
**Criterio de exito:**
- CustomerProfile tiene telefono/correo/direccion para >50% de clientes activos
- lastPurchaseAt calculado para 100% de clientes con SaleRecord
- Coverage Engine opera con inventario real de 4 tiendas (Sandiego, Centro, Gran Plaza, Caldas)
- Clientes 360 muestra datos de contacto reales
- Query "clientes sin comprar en 3 meses" funciona sin nuevo sync

---

### Sprint 2: Sale Lines — El dato mas critico

**Entidades:** SaleLineRecord (MOVIMIENTOS_ITEMS para FV/NV)
**Capacidades desbloqueadas:** CAP-02 (parcial), CAP-06, CAP-15
**Puntos reunion resueltos:** #5 (trazabilidad), #8 (baja rotacion — base), #13 (precios real), #15 (historico unidades)
**Dependencias:** Confirmacion fuente FV en SAG (1, 2, o ambas)
**Criterio de exito:**
- Modelo SaleLineRecord en Prisma con lineas de factura synced
- >10K lineas sincronizadas (primer batch incremental)
- Precio unitario real disponible para >80% de lineas
- Trazabilidad pedido→factura→linea funcional
- Query "unidades vendidas por referencia/mes" operativa

---

### Sprint 3: Temporal Layer — Edad y Rotacion

**Entidades:** ProductMovement (indice temporal) + ReturnLineRecord (NC)
**Capacidades desbloqueadas:** CAP-01, CAP-04, CAP-14
**Puntos reunion resueltos:** #9 (descuentos antiguedad), #10 (fecha ingreso tienda)
**Dependencias:** Sprint 2 completado (SaleLineRecord para movimientos de salida)
**Criterio de exito:**
- Fecha primer ingreso calculada para 100% de referencias con ProductionEvent ET
- Antiguedad comercial (dias sin movimiento) disponible por referencia
- Rotation Engine prototipo: unidades vendidas / unidades ingresadas por periodo
- NC lines sincronizadas; rotacion neta = vendido - devuelto

---

### Sprint 4: Decision Engines Activation

**Entidades:** Ninguna nueva — motores sobre datos de Sprints 1-3
**Capacidades desbloqueadas:** CAP-05 (recompra), sobreinventario cruzado
**Puntos reunion resueltos:** #11 (rotacion cruzada tiendas — completo)
**Dependencias:** Sprints 1-3 completados
**Criterio de exito:**
- Repurchase Engine operativo con datos reales
- Markdown Engine identifica candidatos por antiguedad
- Query "productos que rotan en una tienda y en otra no" funcional
- David/Copilot puede responder preguntas de rotacion con evidencia

---

### Sprint 5 (opcional): Discovery + Enrichment

**Entidades:** CustomerBranch (si SAG tiene tabla), PriceSnapshot (cron)
**Capacidades desbloqueadas:** Sucursales en pedidos, historico precios
**Puntos reunion resueltos:** #1 (sucursales — si posible)
**Dependencias:** Discovery query a SAG TERCEROS/DIRECCIONES
**Criterio de exito:**
- Confirmar o descartar existencia de sucursales en SAG
- Si existe: modelo CustomerBranch con al menos 1 sucursal por cliente top
- PriceSnapshot cron capturando PV3/PV4 semanalmente

---

## Riesgos del Roadmap

| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| TERCEROS no tiene telefono/correo | Media | Bajo | CRM puede tenerlo; priorizar CRM enrichment |
| Fuente FV ambigua (1 vs 2 vs ambas) | Media | Alto | Confirmar con query a FUENTES antes de Sprint 2 |
| Volumen SaleLineRecord satura sync | Baja | Medio | Incremental por fecha; batch de 1000 |
| Mapeo bodega→tienda tiene excepciones | Baja | Bajo | Config editable; override manual |
| ProductionEvent ET no cubre todas las entradas | Media | Medio | Complementar con entradas directas |
| Sucursales no existen en SAG PYA | Alta | Bajo | CustomerBranch seria config manual en Agentik |

---

## Decision Final

**Orden de construccion:**

```
1. CustomerProfile enrichment     → Quick win, zero risk, 3 puntos reunion
2. InventoryPosition (tiendas)    → Coverage Engine al 100%, 2+ puntos reunion
3. SaleLineRecord                 → Dato fundamental, 4 puntos reunion, 6 CAPs
4. ProductMovement                → Temporal layer, edad + rotacion
5. ReturnLineRecord               → Incremental sobre #3, rotacion neta
```

**Razon para NO empezar por SaleLineRecord:**
- Requiere nuevo modelo Prisma
- Requiere confirmacion de fuentes
- Su impacto se materializa solo tras motores derivados (Sprint 3-4)
- Mientras tanto, CustomerProfile y InventoryPosition generan valor INMEDIATO
  en UI que YA EXISTE (Clientes 360, Coverage Engine, Control Comercial)

**Razon para NO omitir SaleLineRecord:**
- Es el unico camino hacia rotacion, recompra, y margen real
- Sin el, 5 motores planificados nunca se activaran
- La reunion pide explicitamente: rotacion, precios, trazabilidad, historico

**La secuencia optima es: quick wins primero (Sprint 1), dato fundamental segundo (Sprint 2),
inteligencia temporal tercero (Sprint 3), motores decisionales cuarto (Sprint 4).**
