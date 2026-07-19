# COMMERCIAL KNOWLEDGE ARCHITECTURE

**Version:** 1.0
**Date:** 2026-07-11
**Status:** OFFICIAL — Documento rector del ecosistema Comercial
**Tenant de referencia:** Castillitos
**Scope:** Arquitectura completa de como Agentik transforma datos operativos en conocimiento empresarial

---

## 0. Filosofia

### Por que existe este documento

Agentik NO sincroniza datos. Agentik transforma datos operativos en conocimiento empresarial reutilizable.

La diferencia es fundamental:

- **Sincronizar datos** = copiar tablas de un sistema a otro.
- **Construir conocimiento** = interpretar, clasificar, relacionar, y hacer decidible la informacion.

Un ERP como SAG PYA almacena MOVIMIENTOS con codigos de fuente (1, 2, 95, 113, 116, 118).
Para SAG, una factura y un pedido son la misma tabla con distinto `k_n_clase_fuente`.
Para Agentik, son conceptos empresariales radicalmente distintos con ciclos de vida, consumidores y decisiones diferentes.

### Por que NO modelamos segun SAG

SAG fue disenado para contabilizar. No para decidir.

Sus tablas reflejan la estructura de un motor contable de los anos 90: un documento generico
(MOVIMIENTOS) con un tipo (fuente). No distingue semanticamente entre una factura de venta,
un pedido de produccion, y una nota credito.

Si Agentik modelara segun SAG:
- Los motores dependerian de codigos de fuente (1, 2, 113, 116, 118)
- Cambiar de ERP requeriria reescribir toda la inteligencia
- El Copilot necesitaria "saber" que fuente 116 significa entrada a inventario
- Cada tenant con ERP distinto necesitaria motores distintos

### Por que existen dominios

Un dominio agrupa conocimiento por responsabilidad de negocio, no por tabla de origen.

El **Sales Domain** responde "que se vendio, a quien, cuanto, cuando" — sin importar si vino
de SAG MOVIMIENTOS fuente 1, de SIIGO factura electronica, o de un POS propio.

### Por que existe un Semantic Layer

El Semantic Layer traduce el lenguaje fisico del ERP al lenguaje canonico de Agentik.

```
SAG dice: MOVIMIENTOS con k_n_clase_fuente = 1, tipo FV
Agentik dice: SalesDocument (type: INVOICE, source: OFICIAL)
```

Esto permite que un motor diga "necesito SaleLine" sin saber que detras hay una vista
de MOVIMIENTOS_ITEMS filtrada por fuente.

### Por que existen motores

Los motores transforman datos en decisiones. No consultan, no almacenan, no sincronizan.

Un motor recibe contratos canonicos de dominio y produce:
- Una evaluacion (estado actual)
- Una sugerencia (accion recomendada)
- Evidencia (por que recomienda eso)
- Confianza (que tan seguro esta)

### Por que los agentes consumen conocimiento y no tablas

El Copilot (David) responde preguntas navegando el Knowledge Graph:

```
Pregunta: "Que productos llevan 6 meses sin venderse?"

Camino:
Product → HAS_POSITION → InventoryPosition (fecha ingreso)
Product → SOLD_AS → SaleLine (ultima venta)
Diferencia: hoy - max(ultima venta, ingreso) > 180 dias
```

David nunca dice "SELECT FROM MOVIMIENTOS_ITEMS WHERE...". Navega relaciones de conocimiento.

### Por que la UI es una representacion del conocimiento

Las pantallas de Agentik no son dashboards que consultan una base de datos.
Son representaciones visuales del estado del Knowledge Graph.

Cuando la pantalla de Tiendas muestra "3 referencias criticas", esta mostrando el resultado
del Coverage Engine que consumio InventoryPosition + StoreCoverageRule + ProductClassification.

La UI no calcula. Representa.

---

## 1. Arquitectura General

```
┌────────────────────────────────────────────────────────────────────────┐
│                              ERP LAYER                                   │
│         SAG PYA  │  SIIGO  │  SAP  │  Dynamics  │  ERP Propio          │
└────────┬───────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          ERP ADAPTERS                                    │
│  SagProductAdapter │ SagSaleLineAdapter │ SagInventoryAdapter │ ...     │
│                                                                          │
│  Responsabilidad:                                                        │
│  - Conectar con el ERP fisico                                           │
│  - Traducir respuestas a contratos canonicos                            │
│  - Manejar paginacion, reintentos, errores                             │
│  - Reportar calidad del dato                                            │
│  - CERO logica de negocio                                               │
└────────┬───────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         SEMANTIC LAYER                                   │
│                                                                          │
│  Responsabilidad:                                                        │
│  - Traducir documentos ERP a conceptos canonicos                        │
│  - Normalizar identificadores (NIT, SKU, codigos)                       │
│  - Clasificar entidades (linea, subgrupo, clase, tamano)                │
│  - Calcular calidad del dato (confidence 0-1)                           │
│  - Generar evidencia de origen                                          │
│  - Resolver ambiguedades (fuente 1 vs 2 → OFICIAL vs REMISION)         │
└────────┬───────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     COMMERCIAL DATA DOMAINS                              │
│                                                                          │
│  ┌─────────┐ ┌──────────┐ ┌───────┐ ┌──────────┐ ┌─────────┐ ┌──────┐│
│  │ PRODUCT │ │INVENTORY │ │ SALES │ │ CUSTOMER │ │PURCHASNG│ │STORE ││
│  │  Domain │ │  Domain  │ │Domain │ │  Domain  │ │ Domain  │ │ OPS  ││
│  └─────────┘ └──────────┘ └───────┘ └──────────┘ └─────────┘ └──────┘│
│                                                                          │
│  Responsabilidad:                                                        │
│  - Ser fuente de verdad de cada concepto                                │
│  - Exponer contratos canonicos tipados                                  │
│  - Emitir eventos de cambio                                             │
│  - Mantener ownership unico (un dato, un dueno)                         │
│  - Proveer proyecciones derivadas                                       │
└────────┬───────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    COMMERCIAL KNOWLEDGE GRAPH                             │
│                                                                          │
│  Responsabilidad:                                                        │
│  - Definir relaciones entre entidades de dominio                        │
│  - Permitir navegacion conceptual (no SQL)                              │
│  - Habilitar preguntas complejas multi-dominio                          │
│  - Proveer caminos de resolucion para el Copilot                        │
└────────┬───────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   RULES & INTELLIGENCE ENGINES                           │
│                                                                          │
│  Coverage │ Rotation │ Repurchase │ Markdown │ Transfer │ Intelligence  │
│                                                                          │
│  Responsabilidad:                                                        │
│  - Transformar conocimiento en evaluaciones                             │
│  - Producir sugerencias accionables                                     │
│  - Generar evidencia de cada decision                                   │
│  - Calcular confianza                                                   │
│  - Emitir senales empresariales (BusinessSignal)                        │
└────────┬───────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      COPILOT / AI AGENTS                                 │
│                                                                          │
│  David (Finance) │ Luca (Marketing) │ Mila (Commercial)                 │
│                                                                          │
│  Responsabilidad:                                                        │
│  - Responder preguntas empresariales complejas                          │
│  - Navegar el Knowledge Graph                                           │
│  - Combinar resultados de multiples motores                             │
│  - Explicar decisiones con evidencia                                    │
│  - Sugerir acciones (suggestedOnly: true)                               │
└────────┬───────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        PRESENTATION LAYER                                │
│                                                                          │
│  Dashboards │ Alertas │ Automatizaciones │ UI Operativa                  │
│                                                                          │
│  Responsabilidad:                                                        │
│  - Representar el estado del conocimiento                               │
│  - Nunca calcular, solo mostrar                                         │
│  - Reaccionar a eventos y senales                                       │
│  - Proveer drill-down al detalle                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Semantic Layer

### Proposito

Traducir el lenguaje fisico del ERP al lenguaje canonico de negocio.

### Traducciones fundamentales

| Codigo ERP (SAG) | Concepto Canonico Agentik | Dominio destino |
|---|---|---|
| MOVIMIENTOS + fuente 1/2, tipo FV | `SalesDocument` (INVOICE) | SALES |
| MOVIMIENTOS + fuente 1/2, tipo NV | `SalesDocument` (REMISSION) | SALES |
| MOVIMIENTOS_ITEMS (FV/NV) | `SaleLine` | SALES |
| MOVIMIENTOS + fuente NC | `SalesReturn` | SALES |
| MOVIMIENTOS + fuente 118, tipo OP | `ProductionOrder` | PURCHASING |
| MOVIMIENTOS + fuente 116, tipo ET | `ProductionEntry` | PURCHASING |
| MOVIMIENTOS + fuente 113, tipo CN | `MaterialConsumption` | PURCHASING |
| MOVIMIENTOS + tipo PD | `CustomerOrder` | SALES |
| v_articulos | `ProductProfile` + `ProductVariant` | PRODUCT |
| TERCEROS | `CustomerProfile` | CUSTOMER |
| CARTERA | `CustomerReceivable` | CUSTOMER |
| v_pagosnew | `CollectionRecord` | CUSTOMER |
| Inventario por bodega | `InventoryPosition` | INVENTORY |
| BODEGAS | `WarehouseProfile` | INVENTORY |
| AOS_Quotes (CRM) | `CRMQuote` | SALES |
| AOS_Products_Quotes (CRM) | `CRMQuoteLine` | SALES |

### Funciones del Semantic Layer

1. **Traduccion de documentos:** `FV` → `SALE_INVOICE`; `ET` → `PRODUCTION_ENTRY`
2. **Normalizacion:** NIT `900.123.456-7` → `900123456`; ciudad codigo → DANE name
3. **Clasificacion:** referencia → linea + subgrupo + clase + tamano + categoria
4. **Evidencia de origen:** cada campo indica `source`, `confidence`, `lastSyncAt`
5. **Calidad del dato:** `dataConfidence: 0.85` (85% de campos poblados)
6. **Resolucion de ambiguedades:** fuente 1 = OFICIAL (revenue), fuente 2 = REMISION (pipeline)

### Regla fundamental

**Los motores nunca conocen codigos fisicos del ERP.**

```typescript
// PROHIBIDO en un motor
if (movimiento.k_n_clase_fuente === 1) { ... }

// CORRECTO en un motor
if (salesDocument.sourceType === "OFICIAL") { ... }
```

---

## 3. Commercial Data Domains

### 3.1 PRODUCT DOMAIN

| Aspecto | Definicion |
|---|---|
| **Proposito** | Fuente de verdad sobre QUE se vende |
| **Ownership** | Catalogo, variantes, atributos, precios de lista, clasificacion |
| **Contratos** | ProductProfile, ProductVariant, ProductPrice, ProductClassification |
| **Eventos** | product.created, product.updated, product.discontinued, price.changed |
| **Consumidores** | Coverage Engine, Rotation Engine, Maletas, Pedidos, UI |
| **Dependencias** | NINGUNA (dominio raiz) |

### 3.2 INVENTORY DOMAIN

| Aspecto | Definicion |
|---|---|
| **Proposito** | Saber CUANTO hay, DONDE esta, y CUANDO cambio |
| **Ownership** | Posiciones, movimientos, edad, bodegas |
| **Contratos** | InventoryPosition, InventoryMovement, InventoryAgeIndex, WarehouseProfile |
| **Eventos** | inventory.position_changed, inventory.entry_received, inventory.depleted |
| **Consumidores** | Coverage Engine, Transfer Engine, Rotation Engine, Age Engine |
| **Dependencias** | PRODUCT (referenceCode) |

### 3.3 SALES DOMAIN

| Aspecto | Definicion |
|---|---|
| **Proposito** | Registrar TODO lo que se vendio — fuente de verdad sobre REVENUE |
| **Ownership** | Documentos de venta, lineas, devoluciones, atribuciones |
| **Contratos** | SalesDocument, SaleLine, SalesReturn, SalesAttribution |
| **Eventos** | sale.line_recorded, sale.return_recorded, sale.period_closed |
| **Consumidores** | Rotation Engine, Repurchase Engine, Sales Intelligence, Pricing |
| **Dependencias** | PRODUCT (referenceCode), CUSTOMER (customerNit) |

### 3.4 CUSTOMER DOMAIN

| Aspecto | Definicion |
|---|---|
| **Proposito** | Identidad completa — quien es, donde esta, como contactarlo, cuanto debe |
| **Ownership** | Identidad, contacto, sucursales, cartera, vendedores, comportamiento |
| **Contratos** | CustomerProfile, CustomerBranch, CustomerReceivable, VendorProfile, CustomerBehavior |
| **Eventos** | customer.enriched, receivable.overdue, payment.applied, churn_risk.changed |
| **Consumidores** | Customer Intelligence, Order Validation, Commercial Copilot |
| **Dependencias** | NINGUNA (dominio raiz) |

### 3.5 PURCHASING & IMPORT DOMAIN

| Aspecto | Definicion |
|---|---|
| **Proposito** | Registrar como ENTRA mercancia — produccion, importaciones, costos |
| **Ownership** | Ordenes de produccion, entradas, consumos, timeline, importaciones |
| **Contratos** | ProductionOrder, ProductionEntry, MaterialConsumption, ImportReceipt |
| **Eventos** | production.order_opened, production.entry_received, production.cycle_completed |
| **Consumidores** | Production Signal Engine, Age Engine, Repurchase Engine (lead time) |
| **Dependencias** | PRODUCT (referenceCode) |

### 3.6 STORE OPERATIONS DOMAIN

| Aspecto | Definicion |
|---|---|
| **Proposito** | Gestionar la DISTRIBUCION hacia tiendas — cobertura, reglas, transferencias |
| **Ownership** | Tiendas, reglas de cobertura, evaluaciones, propuestas de transferencia |
| **Contratos** | StoreProfile, StoreCoverageRule, StoreCoverageEvaluation, StoreTransferProposal |
| **Eventos** | store.coverage_changed, store.critical_shortage, store.transfer_proposed |
| **Consumidores** | Coverage Engine, Transfer Engine, Assortment Engine |
| **Dependencias** | PRODUCT (clasificacion), INVENTORY (posicion por bodega) |

---

## 4. Commercial Knowledge Graph

### Relaciones oficiales

```
Customer ──PLACED──→ CustomerOrder
CustomerOrder ──CONTAINS──→ OrderLine
OrderLine ──REFERENCES──→ Product

Customer ──PURCHASED──→ SalesDocument
SalesDocument ──CONTAINS──→ SaleLine
SaleLine ──REFERENCES──→ Product
SalesDocument ──SOLD_BY──→ Vendor
SalesDocument ──ORIGINATED_AT──→ Store

Product ──HAS_VARIANT──→ ProductVariant
Product ──HAS_PRICE──→ ProductPrice
Product ──CLASSIFIED_AS──→ ProductClassification

ProductVariant ──HAS_POSITION──→ InventoryPosition
InventoryPosition ──LOCATED_IN──→ Warehouse
Warehouse ──IS_STORE──→ Store

Product ──PRODUCED_VIA──→ ProductionOrder
ProductionOrder ──RESULTED_IN──→ ProductionEntry
ProductionEntry ──ENTERED_AT──→ Warehouse

Product ──IMPORTED_VIA──→ ImportReceipt

Customer ──OWES──→ CustomerReceivable
Customer ──HAS_BRANCH──→ CustomerBranch
Customer ──ASSIGNED_TO──→ Vendor

Store ──GOVERNED_BY──→ StoreCoverageRule
StoreCoverageRule ──APPLIES_TO──→ Product (via classification)
Store ──EVALUATED_BY──→ StoreCoverageEvaluation
```

### Preguntas resolubles por navegacion

| Pregunta | Camino |
|---|---|
| Que vendio vendedor X? | Vendor ← SOLD_BY ← SalesDocument → SaleLine → Product |
| Cuanto hay en tienda Y? | Store ← IS_STORE ← Warehouse ← LOCATED_IN ← InventoryPosition |
| Que clientes compran producto Z? | Product ← REFERENCES ← SaleLine → SalesDocument → Customer |
| Cual es el margen de X? | Product → SaleLine.unitPrice MINUS Product → ProductionOrder.unitCost |
| Que tienda necesita surtido? | Store → GOVERNED_BY → Rule (evaluar vs InventoryPosition) |

---

## 5. Rules & Intelligence Engines

### Motor 1: Coverage Engine (OPERATIVO)

| Aspecto | Valor |
|---|---|
| **Proposito** | Evaluar si cada tienda cumple su nivel ideal de inventario |
| **Entradas** | InventoryPosition (tienda), StoreCoverageRule, ProductClassification |
| **Salidas** | CommercialCoverageEvaluation, CommercialCoverageSuggestion |
| **Dominios** | STORE OPS + INVENTORY + PRODUCT |
| **Estado** | Funcional (parcial — datos de 1 bodega) |

### Motor 2: Rules Evidence Engine (OPERATIVO)

| Aspecto | Valor |
|---|---|
| **Proposito** | Documentar por que se eligio cada regla, cuales se descartaron y por que |
| **Entradas** | StoreCoverageRule[], CommercialCoverageInput |
| **Salidas** | CommercialEvidence, DiscardedRuleEvidence[], DecisionTrace |
| **Dominios** | STORE OPS |
| **Estado** | Completo |

### Motor 3: Rotation Engine (PLANIFICADO)

| Aspecto | Valor |
|---|---|
| **Proposito** | Calcular velocidad de venta por referencia/variante/tienda |
| **Entradas** | SaleLine (unidades vendidas), InventoryMovement (entradas), periodo |
| **Salidas** | RotationMetric (vendido/ingresado), RotationClassification |
| **Dominios** | SALES + INVENTORY |
| **Estado** | Bloqueado — requiere SaleLine (Sprint 3) |

### Motor 4: Repurchase Engine (PLANIFICADO)

| Aspecto | Valor |
|---|---|
| **Proposito** | Decidir que referencias recomprar este mes |
| **Entradas** | RotationMetric, InventoryPosition, DemandSignal, ProductionTimeline (lead time) |
| **Salidas** | RepurchaseRecommendation[], priority, suggestedQty |
| **Dominios** | SALES + INVENTORY + PURCHASING |
| **Estado** | Bloqueado — requiere Rotation Engine (Sprint 4) |

### Motor 5: Markdown Engine (PLANIFICADO)

| Aspecto | Valor |
|---|---|
| **Proposito** | Identificar candidatos a promocion o liquidacion por antiguedad |
| **Entradas** | InventoryAgeIndex, RotationMetric, ProductPrice |
| **Salidas** | MarkdownCandidate[], suggestedDiscount, reason |
| **Dominios** | INVENTORY + SALES + PRODUCT |
| **Estado** | Bloqueado — requiere AgeIndex + Rotation (Sprint 4) |

### Motor 6: Transfer Engine (PARCIAL)

| Aspecto | Valor |
|---|---|
| **Proposito** | Redistribuir stock entre bodegas/tiendas |
| **Entradas** | StoreCoverageEvaluation, InventoryPosition (origen), StoreProfile |
| **Salidas** | StoreTransferProposal[] |
| **Dominios** | STORE OPS + INVENTORY |
| **Estado** | Parcial — funciona con datos parciales |

### Motor 7: Production Signal Engine (OPERATIVO)

| Aspecto | Valor |
|---|---|
| **Proposito** | Priorizar produccion por demanda insatisfecha |
| **Entradas** | DemandSignal (PD pendientes), InventoryPosition, ProductionOrder (OP abiertos) |
| **Salidas** | ProductionPressureSignal[] |
| **Dominios** | INVENTORY + PURCHASING |
| **Estado** | Completo |

### Motor 8: Customer Intelligence (PARCIAL)

| Aspecto | Valor |
|---|---|
| **Proposito** | Entender comportamiento del cliente — frecuencia, valor, riesgo |
| **Entradas** | CustomerProfile, SalesDocument (historico), CustomerReceivable |
| **Salidas** | CustomerBehavior (CLV, frecuencia, churnRisk) |
| **Dominios** | CUSTOMER + SALES |
| **Estado** | Parcial — falta lastPurchaseAt population |

### Motor 9: Sales Intelligence (PARCIAL)

| Aspecto | Valor |
|---|---|
| **Proposito** | Analizar ventas por vendedor, tienda, linea, canal |
| **Entradas** | SalesDocument, SaleLine, ProductClassification |
| **Salidas** | VendorPerformance, StorePerformance, LinePerformance |
| **Dominios** | SALES + PRODUCT |
| **Estado** | Parcial — funciona por montos, no por unidades |

### Motor 10: Commercial Copilot (PARCIAL)

| Aspecto | Valor |
|---|---|
| **Proposito** | Responder preguntas empresariales complejas con evidencia |
| **Entradas** | Knowledge Graph completo + resultados de todos los motores |
| **Salidas** | Respuesta con evidencia, confianza, y sugerencias |
| **Dominios** | TODOS |
| **Estado** | Parcial — depende de cada motor individual |

### Cadena de dependencias

```
Coverage Engine (OPERATIVO)
     │
     └──→ necesita: InventoryPosition multi-tienda (Sprint 2)

Rotation Engine (BLOQUEADO)
     │
     ├──→ necesita: SaleLine (Sprint 3)
     └──→ necesita: InventoryMovement entries (Sprint 4)

Repurchase Engine (BLOQUEADO)
     │
     └──→ necesita: Rotation Engine (Sprint 4)

Markdown Engine (BLOQUEADO)
     │
     ├──→ necesita: Rotation Engine (Sprint 4)
     └──→ necesita: InventoryAgeIndex (Sprint 4)

Commercial Copilot
     │
     └──→ mejora con cada motor activado
```

---

## 6. Evidence Architecture

### Principio

**Toda decision debe ser trazable.** Ningun motor puede recomendar algo sin explicar por que.

### Flujo de evidencia

```
Datos de dominio
       │
       ▼
Motor evalua
       │
       ▼
┌──────────────────────────────────┐
│        EVIDENCE PACKAGE           │
│                                    │
│  EvidenceItems[]                  │
│    - tipo (RULE/INVENTORY/STORE)  │
│    - fuente                        │
│    - confirmed: boolean           │
│    - data: structured             │
│                                    │
│  ConfidenceFactors[]              │
│    - label                         │
│    - satisfied: boolean           │
│    - impact: 0-1                  │
│                                    │
│  DecisionTrace[]                  │
│    - step (ordered pipeline)      │
│    - status (OK/WARNING/DEGRADED) │
│    - summary                       │
│                                    │
│  DiscardedRules[]                 │
│    - ruleId, rejectionReason      │
│    - specificityRank              │
│    - candidateValues              │
│                                    │
│  MissingData[]                    │
│    - field, impact                │
└──────────────────────────────────┘
       │
       ▼
Explanation (derivada de Evidence, NUNCA al reves)
       │
       ▼
Copilot / UI (muestra evidencia al usuario)
```

### Regla de construccion

```
Evidence → Explanation → UI

NUNCA:
UI → Explanation → Evidence (inventar evidencia para una conclusion)
```

### Confianza

```typescript
confidence = sum(factor.impact * (factor.satisfied ? 1 : 0)) / sum(factor.impact)

// Niveles
HIGH:   confidence >= 0.8
MEDIUM: confidence >= 0.5
LOW:    confidence < 0.5
```

**Regla:** Un motor con confianza LOW debe indicar "datos insuficientes" — NUNCA generar
una recomendacion con baja confianza sin advertencia explicita.

---

## 7. Knowledge Flow — Escenarios

### Escenario 1: Venta

```
ERP registra factura FV
       │
       ▼
SagSaleLineAdapter traduce MOVIMIENTOS_ITEMS → SaleLine[]
       │
       ▼
Semantic Layer: normaliza referenceCode, resuelve variante, asigna confidence
       │
       ▼
Sales Domain: persiste SaleLine, emite evento sale.line_recorded
       │
       ▼
Knowledge Graph: actualiza relacion Product ← SOLD_AS ← SaleLine
       │
       ▼
Rotation Engine: recalcula rotacion de la referencia afectada
       │
       ▼
Alerta: si rotacion cambio de categoria (alta→baja), emite BusinessSignal
       │
       ▼
Copilot: puede responder "que se vendio hoy?" con evidencia
       │
       ▼
UI: Control Comercial actualiza ventas del dia
```

### Escenario 2: Surtido de tienda

```
Inventario de tienda cambia (polling detecta diferencia)
       │
       ▼
SagStoreInventoryAdapter traduce snapshot → InventoryPosition[]
       │
       ▼
Inventory Domain: actualiza posicion, emite inventory.position_changed
       │
       ▼
Coverage Engine: evalua posicion vs StoreCoverageRule
       │
       ▼
Evidence Engine: documenta regla aplicada, descartadas, trace
       │
       ▼
Resultado: CRITICAL_REPLENISH (4 unidades sugeridas)
       │
       ▼
Alerta: store.critical_shortage emitida
       │
       ▼
Transfer Engine: genera StoreTransferProposal
       │
       ▼
UI: Tiendas muestra alerta + propuesta de transferencia
```

### Escenario 3: Recompra

```
Rotation Engine calcula que referencia X tiene rotacion ALTA
       │
       ▼
InventoryPosition muestra stock bajo (cobertura < 30 dias)
       │
       ▼
Repurchase Engine evalua:
  - rotacion: ALTA (5 unidades/semana)
  - stock actual: 12 unidades
  - lead time produccion: 44 dias
  - demanda pendiente (PD): 8 unidades
       │
       ▼
Recomendacion: producir 100 unidades (suggestedOnly: true)
       │
       ▼
Evidence: rotacion confirmada, lead time historico, demand signal
       │
       ▼
Copilot: "Referencia X se agota en 2 semanas. Recomiendo producir 100."
```

### Escenario 4: Descuento por antiguedad

```
InventoryAgeIndex muestra referencia Y con 240 dias sin movimiento
       │
       ▼
Rotation Engine confirma: 0 unidades vendidas en 6 meses
       │
       ▼
Markdown Engine evalua:
  - antiguedad: 240 dias (umbral: 180)
  - rotacion: NULA
  - precio actual: $45,000
  - margen estimado: 60%
       │
       ▼
Recomendacion: descuento 30% (suggestedOnly: true)
       │
       ▼
Evidence: fecha ingreso confirmada, cero ventas, margen permite descuento
       │
       ▼
UI: lista de candidatos a promocion con justificacion
```

### Escenario 5: Transferencia entre tiendas

```
Coverage Engine detecta:
  - Tienda A: referencia Z ABOVE_MAX (12 unidades, max 8)
  - Tienda B: referencia Z BELOW_MIN (1 unidad, min 4)
       │
       ▼
Transfer Engine:
  - sugiere mover 4 unidades de Tienda A → Tienda B
       │
       ▼
Evidence: Coverage evaluations de ambas tiendas, reglas aplicadas
       │
       ▼
StoreTransferProposal: pendiente aprobacion
       │
       ▼
UI: Tiendas muestra propuesta con drill-down a evidencia
```

### Escenario 6: Cliente en riesgo de churn

```
Customer Intelligence calcula:
  - cliente C: ultima compra hace 95 dias
  - frecuencia historica: cada 30 dias
  - ratio: 95/30 = 3.1x (muy por encima de lo normal)
       │
       ▼
Clasificacion: churnRisk = HIGH
       │
       ▼
BusinessSignal emitido: customer.churn_risk_changed
       │
       ▼
Copilot: "Cliente C lleva 3 meses sin comprar. Historicamente compra cada mes."
       │
       ▼
UI: Clientes 360 muestra alerta de churn con contexto
```

---

## 8. Preguntas Empresariales

> Ver documento complementario: `COMMERCIAL_KNOWLEDGE_FLOW_MATRIX_01.md`

### Resumen

| Pregunta | Dominios | Motor | Respuesta |
|---|---|---|---|
| Que referencias llevan 8 meses sin venderse? | INVENTORY + SALES | Rotation + Age | Lista con fecha ingreso y 0 ventas |
| Que debo recomprar? | SALES + INVENTORY + PURCHASING | Repurchase | Lista priorizada con qty sugerida |
| Que tienda necesita surtido? | STORE OPS + INVENTORY | Coverage | Evaluacion por tienda con gap |
| Que clientes llevan 3 meses sin comprar? | CUSTOMER + SALES | Customer Intelligence | Lista con ultima fecha y frecuencia |
| Cual es mi producto estrella? | SALES + INVENTORY | Rotation + Sales Intel | Top por rotacion × margen |
| Que vendedor convierte mejor? | SALES + CUSTOMER | Sales Intelligence | Ranking por conversion PD→FV |
| Donde concentrar esfuerzo comercial? | CUSTOMER + SALES | Commercial Intelligence | Ciudades con alta demanda + baja cobertura |
| Que producto transferir a tienda X? | STORE OPS + INVENTORY + SALES | Coverage + Transfer | Propuesta con evidencia |

---

## 9. Data Ownership

### Principio: Un dato, un dueno

| Concepto | Dominio dueno | Otros lo ven como |
|---|---|---|
| Nombre, atributos, clasificacion del producto | PRODUCT | Read model |
| Precio de lista (PV3/PV4) | PRODUCT | Read model |
| Stock actual por bodega/tienda | INVENTORY | Read model |
| Fecha primer ingreso (edad) | INVENTORY | Read model |
| Unidades vendidas | SALES | Read model |
| Precio unitario de venta real | SALES | Read model |
| Identidad del cliente (NIT, nombre, contacto) | CUSTOMER | Read model |
| Cartera y saldos pendientes | CUSTOMER | Read model |
| Vendedor asignado | CUSTOMER | Read model |
| Costo de produccion | PURCHASING | Read model |
| Ciclo productivo (lead time) | PURCHASING | Read model |
| Reglas de cobertura | STORE OPS | Exclusivo |
| Evaluacion de cobertura | STORE OPS | Exclusivo |
| Propuestas de transferencia | STORE OPS | Exclusivo |

### Proyecciones (NO son source of truth)

| Proyeccion | Calculada de | Regenerable? |
|---|---|---|
| Rotacion | SALES (vendido) + INVENTORY (ingresado) | SI |
| Edad inventario | INVENTORY (fecha ingreso) + hoy | SI |
| CLV | SALES (sum historico) + CUSTOMER (periodo) | SI |
| Performance vendedor | SALES (por seller) | SI |
| Margen | SALES (precio venta) - PURCHASING (costo) | SI |
| Churn risk | SALES (ultima fecha) + CUSTOMER (frecuencia) | SI |

---

## 10. Persistencia

### Tipos de persistencia

| Tipo | Definicion | Patron | Ejemplo |
|---|---|---|---|
| **REFERENCE** | Entidad estable que cambia infrecuentemente | Upsert by naturalKey | ProductProfile, CustomerProfile, StoreProfile |
| **TRANSACTIONAL** | Registro inmutable de un evento de negocio | Insert + idempotencia | SaleLine, SalesReturn, ProductionOrder |
| **SNAPSHOT** | Estado actual que se sobreescribe periodicamente | Replace current + optional historico | InventoryPosition, CustomerReceivable, ProductPrice |
| **EVENT** | Hecho historico que nunca se modifica | Append-only | InventoryMovement, ProductionEntry |
| **DERIVED** | Calculado a partir de otros datos; puede regenerarse | Materialized view / cache | RotationMetric, CustomerBehavior, InventoryAgeIndex |

### Cuando usar cada uno

- **REFERENCE:** Cuando el dato describe una entidad persistente (producto, cliente, tienda)
- **TRANSACTIONAL:** Cuando el dato registra algo que ocurrio (venta, devolucion, produccion)
- **SNAPSHOT:** Cuando solo importa el estado actual (stock, saldo, precio vigente)
- **EVENT:** Cuando el historico completo tiene valor (movimientos, entradas)
- **DERIVED:** Cuando el dato se puede recalcular de otros (rotacion, CLV, edad)

---

## 11. Freshness

### Categorias

| Categoria | SLA | Metodo | Cuando usar |
|---|---|---|---|
| **Near-real-time** | 5-15 min | Polling con delta check | Inventario (decisiones inmediatas) |
| **Periodic** | 15-60 min | Incremental sync by date | Ventas, movimientos |
| **Daily** | 24h | Batch nocturno | Productos, clientes (datos estables) |
| **On-demand** | Pre-operacion | Trigger manual | Cartera (antes de tomar pedido) |
| **Weekly** | 7d | Cron programado | Precios de lista (snapshot) |

### SLA por dominio

| Dominio | Entidad principal | SLA |
|---|---|---|
| PRODUCT | ProductProfile | Daily |
| PRODUCT | ProductPrice | Weekly |
| INVENTORY | InventoryPosition | Near-real-time (15 min) |
| INVENTORY | InventoryMovement | Periodic (30 min) |
| SALES | SaleLine | Periodic (30 min) |
| SALES | SalesReturn | Daily |
| CUSTOMER | CustomerProfile | Daily |
| CUSTOMER | CustomerReceivable | On-demand + Periodic (1h) |
| PURCHASING | ProductionOrder | Daily |
| STORE OPS | StoreInventoryPosition | Near-real-time (15 min) |

### Restriccion

SAG PYA SOAP no soporta webhooks ni push notifications.
El mejor SLA alcanzable es **near-real-time via polling** cada 5-15 minutos.
Nunca afirmar "tiempo real" sin evidencia de que la fuente lo soporta.

---

## 12. Multi ERP

### Principio

Los motores y el Knowledge Graph son **ERP-agnostic**. Solo los adapters conocen el ERP.

### Incorporar un nuevo ERP

```
┌──────────────────────────────────────────────────┐
│  Motores / Knowledge Graph / Copilot             │
│  (SIN CAMBIOS — consumen contratos canonicos)    │
├──────────────────────────────────────────────────┤
│  Contratos canonicos                              │
│  (ProductProfile, SaleLine, InventoryPosition)   │
├──────────────────────────────────────────────────┤
│  ┌─────────┐  ┌──────────┐  ┌─────────────┐    │
│  │ SAG PYA │  │  SIIGO   │  │  Dynamics   │    │
│  │ Adapter │  │  Adapter │  │   Adapter   │    │
│  └─────────┘  └──────────┘  └─────────────┘    │
└──────────────────────────────────────────────────┘
```

### Pasos para agregar un ERP

1. **Crear adapter:** `lib/comercial/domains/{domain}/adapters/siigo-{entity}-adapter.ts`
2. **Implementar interface:** `DomainAdapter<TCanonical>` con `pull()` y `pullIncremental()`
3. **Mapear campos:** Traducir campos del ERP nuevo al contrato canonico
4. **Configurar por tenant:** Cada tenant selecciona su adapter en configuracion
5. **Validar data quality:** Verificar que el adapter nuevo produce confidence >= umbral

### Ejemplo: agregar SIIGO para Sales

```typescript
// lib/comercial/domains/sales/adapters/siigo-sale-line-adapter.ts
class SiigoSaleLineAdapter implements DomainAdapter<SaleLine> {
  readonly source = "SIIGO";
  readonly domain = "sales";
  readonly entity = "SaleLine";

  async pull(params: AdapterPullParams): Promise<AdapterResult<SaleLine>> {
    // Consultar API SIIGO → traducir a SaleLine canonico
    // Los motores NO cambian
  }
}
```

### Lo que NUNCA se modifica al agregar un ERP

- Motores (Coverage, Rotation, Repurchase, etc.)
- Knowledge Graph (relaciones conceptuales)
- UI (dashboards, alertas, drill-down)
- Copilot (logica de navegacion)
- Contratos canonicos (tipos de dominio)

---

## 13. Multi Tenant

### Principio

Los motores nunca contienen logica especifica de un tenant.

### Flujo multi-tenant

```
Tenant (organizationId)
       │
       ▼
Configuracion semantica (que ERP usa, que adapter, que reglas)
       │
       ▼
Adapter correspondiente (SAG para Castillitos, SIIGO para otro)
       │
       ▼
Contratos canonicos (identicos para todos los tenants)
       │
       ▼
Motores (misma logica para todos)
       │
       ▼
Knowledge Graph (mismas relaciones, datos aislados por tenantId)
       │
       ▼
Copilot (misma capacidad de navegacion para todos)
```

### Que cambia entre tenants

| Aspecto | Cambia? | Como |
|---|---|---|
| Adapter (que ERP) | SI | Configuracion por tenant |
| Contratos (estructura) | NO | Identicos |
| Reglas de cobertura (valores) | SI | StoreCoverageRule por storeId/tenant |
| Clasificacion de productos | SI | Heuristicas configurables |
| Vocabulario (maleta vs portafolio) | SI | terminology.ts por tenant |
| Motores (logica) | NO | Identica |
| Knowledge Graph (relaciones) | NO | Identicas |
| Datos | SI | Aislados por tenantId |

### Regla de aislamiento

```typescript
// TODA query DEBE filtrar por tenantId
const positions = await getInventoryPositions({ tenantId: org.id, ... });

// PROHIBIDO: query sin tenant
const positions = await getInventoryPositions({ ... }); // NUNCA
```

---

## 14. Principios Arquitectonicos

### Principios que rigen toda decision

| # | Principio | Implicacion |
|---|---|---|
| 1 | El ERP nunca define el modelo | Contratos canonicos representan conceptos de negocio, no tablas |
| 2 | Los motores nunca consultan el ERP | Solo consumen contratos de dominio |
| 3 | Cada dato tiene un unico dueno | No duplicar la verdad entre dominios |
| 4 | Toda decision debe tener evidencia | Evidence package obligatorio en cada evaluacion |
| 5 | Toda respuesta debe indicar confianza | confidence: 0-1, nivel HIGH/MEDIUM/LOW |
| 6 | Los adapters no contienen logica de negocio | Solo traducen y normalizan |
| 7 | Los dominios representan conceptos empresariales | No tablas, no vistas SQL, no endpoints |
| 8 | Los eventos nunca se modifican | Append-only; correccion = nuevo evento |
| 9 | Las proyecciones pueden regenerarse | DERIVED se recalcula sin perdida |
| 10 | El conocimiento es reutilizable por IA | El Copilot navega Knowledge Graph, no ejecuta SQL |
| 11 | Cada motor es independiente | Un motor puede fallar sin tumbar a otros |
| 12 | suggestedOnly: true | Ningun motor ejecuta acciones — solo sugiere |

### Decisiones que NO tomaremos

| Decision rechazada | Por que |
|---|---|
| Modelar segun tablas SAG | Acopla la inteligencia a un ERP especifico |
| Duplicar la verdad entre dominios | Genera inconsistencias y confusion de ownership |
| Consultar SAG desde motores | Rompe la separacion de capas; imposibilita multi-ERP |
| Poner reglas de negocio en React | La UI representa, no decide |
| Acoplar motores a un tenant | Impide escalar a Jupiter Pets, Do Jeans, etc. |
| Generar inteligencia en adapters | El adapter traduce; la inteligencia vive en motores |
| Afirmar "tiempo real" sin webhooks | SAG no soporta push; polling es near-real-time |
| Crear un motor sin evidencia | Toda decision debe ser explicable y auditable |
| Implementar Repurchase sin Rotation | Los motores tienen dependencias — respetar orden |
| Sincronizar "todo SAG" en Sprint 1 | MVP primero, enriquecimiento despues |

---

## 15. Roadmap Final

### Secuencia oficial de implementacion

```
Sprint 1: COMMERCIAL DATA LAYER FOUNDATION
─────────────────────────────────────────────────────
Dominios: PRODUCT (enrich) + CUSTOMER (enrich) + INVENTORY (config multi-bodega)
Entidades: ProductProfile, CustomerProfile, WarehouseProfile, InventoryPosition (4 tiendas)
Motores activados: Coverage Engine (100%), Customer Intelligence (parcial)
Requerimientos: #2, #3, #6, #7, #12, #13, #14, #17, #18

Sprint 2: STORE OPERATIONS
─────────────────────────────────────────────────────
Dominios: STORE OPS (completo)
Entidades: StoreInventoryPosition, DepletionAlert
Motores activados: Coverage (completo), Transfer (completo)
Requerimientos: #4, #16, #19

Sprint 3: SALES DOMAIN
─────────────────────────────────────────────────────
Dominios: SALES (lineas + devoluciones)
Entidades: SaleLine, SalesReturn
Motores activados: Rotation Engine, Sales Intelligence (completa)
Requerimientos: #5, #8, #11p, #15

Sprint 4: TEMPORAL INTELLIGENCE
─────────────────────────────────────────────────────
Dominios: INVENTORY temporal + motores derivados
Entidades: InventoryMovement, InventoryAgeIndex, RotationMetric
Motores activados: Markdown Engine, Repurchase Engine, Age Engine
Requerimientos: #9, #10, #11c

Sprint 5: COMMERCIAL INTELLIGENCE
─────────────────────────────────────────────────────
Dominios: Integracion de todos los dominios
Entidades: Ninguna nueva — motores compuestos
Motores activados: Commercial Intelligence Engine, Copilot (completo)
Requerimientos: Todos los restantes + preguntas empresariales complejas
```

### Nota final

Despues de este documento:
- No crear nuevos documentos arquitectonicos generales para Comercial
- Cualquier cambio futuro sera una actualizacion de este documento
- Los siguientes sprints seran exclusivamente de implementacion
