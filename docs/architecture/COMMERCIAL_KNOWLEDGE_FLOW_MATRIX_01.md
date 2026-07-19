# COMMERCIAL KNOWLEDGE FLOW MATRIX

**Sprint:** COMMERCIAL-KNOWLEDGE-ARCHITECTURE-01
**Date:** 2026-07-11
**Companion:** COMMERCIAL_KNOWLEDGE_ARCHITECTURE_01.md

---

## Business Questions → Knowledge Flow

| # | Pregunta de negocio | Conocimiento requerido | Dominios involucrados | Eventos consumidos | Motor responsable | Respuesta tipo | Evidencia minima | Confianza minima |
|---|---|---|---|---|---|---|---|---|
| Q1 | Que productos necesita esta tienda hoy? | Inventario actual + reglas de cobertura + rotacion historica | STORE OPS, INVENTORY, PRODUCT, SALES | InventoryPosition.updated, SaleLine.created, StoreCoverageRule.changed | Coverage Engine | Lista priorizada de SKUs con cantidad sugerida | >=3 dias de ventas + inventario <24h | 0.75 |
| Q2 | Que clientes estan en riesgo de churn? | Ultima compra + frecuencia historica + cartera vencida | CUSTOMER, SALES | SalesDocument.created, CustomerReceivable.updated | Customer Intelligence | Lista de clientes con dias sin compra > umbral | >=90 dias de historial + lastPurchaseAt confirmado | 0.70 |
| Q3 | Que productos tienen baja rotacion? | Ventas por unidad + inventario por antiguedad + ubicacion | SALES, INVENTORY, PRODUCT | SaleLine.created, InventoryPosition.updated | Rotation Engine | Ranking de SKUs con unidades/dia < umbral | SaleLine con unidades (no solo montos) + 30 dias minimo | 0.80 |
| Q4 | A que productos aplicar descuento por antiguedad? | Edad en inventario + rotacion + margen bruto | INVENTORY, SALES, PRODUCT | InventoryMovement.created, SaleLine.created | Markdown Engine | SKUs con edad > umbral + sugerencia % descuento | AgeIndex calculado + RotationMetric confirmado | 0.85 |
| Q5 | Que transferir entre tiendas? | Excedente en tienda A + deficit en tienda B + costo logistico | STORE OPS, INVENTORY | InventoryPosition.updated, StoreCoverageEvaluation.completed | Transfer Engine | Pares origen-destino con SKU y cantidad | Multi-tienda operativa + cobertura evaluada en ambas | 0.75 |
| Q6 | Cuando recomprar un producto? | Lead time promedio + consumo proyectado + inventario actual | INVENTORY, PURCHASING, SALES | InventoryPosition.updated, ProductionEntry.created, SaleLine.created | Repurchase Engine | Fecha sugerida de reorden + cantidad | Lead time con >=3 ciclos + rotacion confirmada | 0.80 |
| Q7 | Este pedido cumple las reglas de negocio? | Reglas por tamano + cartera + limites por cliente | STORE OPS, CUSTOMER | OrderDraft.created | Rules Evidence Engine | PASS/FAIL con evidencia por regla | Reglas configuradas + datos frescos (<1h para cartera) | 0.90 |
| Q8 | Cual es la salud comercial del negocio hoy? | Ventas del dia + cartera + cobertura + produccion | ALL DOMAINS | Multiple (diario) | Commercial Copilot | Resumen ejecutivo con alertas priorizadas | Datos de todas las fuentes con frescura aceptable | 0.60 |

---

## Knowledge Production Pipeline

| Etapa | Input | Proceso | Output | Latencia tipica |
|---|---|---|---|---|
| 1. Ingestion | Raw ERP data (SAG API response) | Adapter.pull() / pullIncremental() | Raw records + metadata | 5-60 min (segun SLA) |
| 2. Translation | Raw records | Semantic Layer mapping | Canonical entities (ProductProfile, SaleLine, etc.) | <1s |
| 3. Persistence | Canonical entities | Upsert/Insert/Overwrite segun tipo | Domain store (Prisma) | <1s |
| 4. Event Emission | Persisted entities | Detect changes vs previous state | Domain events (created/updated/deleted) | <1s |
| 5. Graph Update | Domain events | Update Knowledge Graph relationships | Connected knowledge nodes | <1s |
| 6. Motor Execution | Graph queries + domain data | Engine-specific algorithms | Motor outputs (suggestions, alerts, scores) | 1-30s |
| 7. Confidence Scoring | Motor outputs + evidence | Evidence chain validation | Scored outputs with confidence [0..1] | <1s |
| 8. Copilot Consumption | Scored motor outputs | Agent context building | Natural language insights + actions | 1-5s |

---

## Domain Event Catalog

| Dominio | Evento | Trigger | Consumidores | Frecuencia |
|---|---|---|---|---|
| PRODUCT | ProductProfile.updated | Sync completes | Coverage, Rotation, Copilot | Diario |
| PRODUCT | ProductVariant.created | New variant discovered | Coverage, Marketing | Diario |
| INVENTORY | InventoryPosition.updated | Periodic sync | Coverage, Transfer, Rotation, Markdown | 15 min |
| INVENTORY | InventoryMovement.created | Movement detected | Age, Production Signal | 30 min |
| SALES | SaleLine.created | Sale document synced | Rotation, Repurchase, Sales Intel | 30 min |
| SALES | SalesReturn.created | Credit note synced | Rotation (adjustment), Customer Intel | Diario |
| CUSTOMER | CustomerProfile.enriched | Sync + derivation | Customer Intel, Copilot | Diario |
| CUSTOMER | CustomerReceivable.updated | Receivable sync | Rules Evidence, Collection alerts | 1h |
| PURCHASING | ProductionEntry.created | Production sync | Production Signal, Repurchase | Diario |
| STORE OPS | StoreCoverageEvaluation.completed | Coverage Engine runs | Transfer, Copilot, Alerts | On-demand |
| STORE OPS | StoreTransferProposal.created | Transfer Engine runs | Approval flow, Copilot | On-demand |

---

## Motor Dependency Chain

```
LEVEL 0 (sin dependencias de otros motores):
  Rules Evidence Engine ← STORE OPS config only
  Production Signal Engine ← PURCHASING + INVENTORY
  Customer Intelligence ← CUSTOMER + SALES (montos)

LEVEL 1 (depende de datos, no de otros motores):
  Coverage Engine ← STORE OPS + INVENTORY + PRODUCT
  Transfer Engine ← STORE OPS + INVENTORY

LEVEL 2 (depende de SaleLine — Sprint 3):
  Rotation Engine ← SALES (unidades) + INVENTORY + PRODUCT
  Sales Intelligence ← SALES + PRODUCT + CUSTOMER

LEVEL 3 (depende de motores Level 2):
  Repurchase Engine ← Rotation + PURCHASING (lead time) + INVENTORY
  Markdown Engine ← Rotation + Age (INVENTORY temporal)

LEVEL 4 (meta-motor):
  Commercial Copilot ← ALL motors + ALL domains
```

---

## Confidence Propagation Rules

| Fuente de datos | Confidence base | Degradacion por tiempo | Minimo operativo |
|---|---|---|---|
| SAG inventario (sync <15 min) | 0.95 | -0.05 por hora extra | 0.70 |
| SAG ventas (sync <30 min) | 0.90 | -0.03 por hora extra | 0.65 |
| SAG maestros (sync diario) | 0.85 | -0.01 por dia extra | 0.60 |
| CRM datos (sync diario) | 0.80 | -0.02 por dia extra | 0.55 |
| Datos derivados (calculo) | min(inputs) * 0.95 | Hereda de inputs | 0.50 |
| Datos manuales (config) | 0.70 | No degrada (static) | 0.70 |

**Regla de propagacion:** La confianza de un motor output = min(confianza de cada input requerido).
Si cualquier input esta por debajo de su minimo operativo, el motor NO emite output (fail-closed).

---

## Sprint Activation Map

| Sprint | Dominios activados | Preguntas respondibles | Motores operativos | % Coverage de Meeting Requirements |
|---|---|---|---|---|
| 1 | PRODUCT + CUSTOMER + INVENTORY (foundation) | Q2 (parcial), Q7 | Rules Evidence, Customer Intel (parcial), Coverage (parcial) | 47% (9/19) |
| 2 | STORE OPS (multi-tienda) | Q1, Q5 (parcial) | Coverage (100%), Transfer (100%) | 63% (12/19) |
| 3 | SALES (lineas) | Q2, Q3, Q8 (parcial) | Rotation, Sales Intelligence | 79% (15/19) |
| 4 | INVENTORY temporal + motores compuestos | Q4, Q6 | Markdown, Repurchase, Age | 89% (17/19) |
| 5 | PURCHASING enrich + CUSTOMER branches | Q8 (completo) | Commercial Copilot (100%) | 100% (19/19) |

---

## Data Freshness Decision Tree

```
Pregunta: Que SLA de frescura necesita esta entidad?

1. Se usa en decisiones de segundos? (e.g., validar pedido)
   → On-demand (fetch before decision)

2. Cambia varias veces al dia? (e.g., inventario, ventas)
   → Near-real-time (5-15 min) si inventario
   → Periodic (15-60 min) si ventas/movimientos

3. Cambia diariamente? (e.g., nuevos productos, clientes)
   → Daily (cron nocturno o matutino)

4. Cambia semanalmente? (e.g., precios de lista)
   → Weekly (snapshot semanal)

5. Solo cambia por accion humana? (e.g., reglas, config)
   → Manual (user-triggered refresh)
```

---

## Multi-ERP Adapter Mapping

| Concepto canonico | SAG PYA (Castillitos) | SIIGO (futuro) | WMS propio (futuro) |
|---|---|---|---|
| Sale Invoice | MOVIMIENTOS k_n_clase_fuente=1 | FacturaElectronica | N/A |
| Sale Order | MOVIMIENTOS k_n_clase_fuente=2 | N/A | N/A |
| Credit Note | MOVIMIENTOS k_n_clase_fuente=95 | NotaCredito | N/A |
| Inventory Position | v_inventario_por_bodega | SaldoInventario | Stock.current |
| Production Order | MOVIMIENTOS k_n_clase_fuente=113 | N/A | N/A |
| Production Entry | MOVIMIENTOS k_n_clase_fuente=116 | N/A | N/A |
| Material Consumption | MOVIMIENTOS k_n_clase_fuente=118 | N/A | N/A |
| Product Master | v_articulos | ProductoServicio | Product.catalog |
| Customer Master | TERCEROS | TerceroCliente | N/A |
| Receivables | CARTERA | CuentaPorCobrar | N/A |

**Principio:** Solo la columna del ERP cambia. Las columnas de dominios, motores, y UI son identicas.
