# SALES-REP-POLICY-PACK-01

Sprint: SalesRep Policy Pack para Castillitos
Estado: COMPLETO
Fecha: 2026-07-14

---

## Resumen

Policy Pack completo para vendedores comerciales (SalesRep).
17 fases: tipos, config, 7 politicas, 8 evaluadores puros, alertas, read models, evidencia, mobile contract, tests, validacion.

Nomenclatura: **SalesRep** = vendedor comercial. Nunca "Vendor" para vendedores (reservado para proveedores).

---

## Archivos

| Archivo | Proposito |
|---|---|
| `lib/comercial/sales-reps/sales-rep-decision-types.ts` | Tipos de dominio (18 interfaces/tipos) |
| `lib/comercial/sales-reps/sales-rep-policy-pack-config.ts` | Configuracion: umbrales, pesos, frescura |
| `lib/comercial/sales-reps/sales-rep-policy-pack.ts` | 7 BusinessPolicy registradas en Business Policy Engine |
| `lib/comercial/sales-reps/sales-rep-decision-engine.ts` | 8 funciones puras de evaluacion |
| `lib/comercial/sales-reps/sales-rep-alerts.ts` | 7 alert builders + batch builder |
| `lib/comercial/sales-reps/sales-rep-read-models.ts` | Mobile contract builder (6 capabilities) |
| `lib/comercial/sales-reps/sales-rep-evidence.ts` | Evidence bridge, summary, validation |
| `lib/comercial/sales-reps/index.ts` | Barrel export |

---

## 7 Politicas

| ID | Categoria | Nombre |
|---|---|---|
| `srp-mallet-out-of-stock-v1` | ALERT | Referencia Agotada en Maleta |
| `srp-mallet-replacement-v1` | ALERT | Sugerencia de Reemplazo en Maleta |
| `srp-overdue-receivable-v1` | CUSTOMER | Alerta Cartera Vencida del Cliente |
| `srp-inactive-customer-v1` | CUSTOMER | Cliente Inactivo |
| `srp-customer-priority-v1` | CUSTOMER | Prioridad Comercial del Cliente |
| `srp-mallet-status-v1` | VENDOR | Estado Operativo de Maleta |
| `srp-order-fulfillment-v1` | VENDOR | Seguimiento de Pedidos |

---

## 8 Evaluadores Puros

| Funcion | Fase | Que hace |
|---|---|---|
| `evaluateMalletOutOfStock()` | 2 | Detecta referencias agotadas en maleta |
| `evaluateMalletReplacement()` | 3 | Sugiere reemplazos por grupo/subgrupo |
| `evaluateCustomerReceivablesAlert()` | 4 | Alerta cartera vencida (STRICTLY > threshold) |
| `evaluateCustomerInactivity()` | 5 | Identifica clientes inactivos (5 estados) |
| `evaluateCustomerPriority()` | 6 | Scoring con 6 factores ponderados |
| `buildSalesRepMalletState()` | 7 | Read model de estado de maleta |
| `buildOrderFulfillmentState()` | 8 | Read model de seguimiento de pedidos |
| `buildSalesRepDailyState()` | 9 | Agregado diario del vendedor |

---

## Configuracion (valores Castillitos)

| Parametro | Valor |
|---|---|
| outOfStockThreshold | 0 |
| maxReplacementSuggestions | 3 |
| overdueDaysThreshold | 30 (STRICTLY >) |
| inactivityThresholdDays | 90 |
| atRiskThresholdDays | 60 |
| Priority weights | inactivity=0.25, sales=0.20, receivables=0.20, frequency=0.15, recency=0.10, dataQuality=0.10 |
| highThreshold | 70 |
| mediumThreshold | 40 |
| todayHours | 24 |
| recentHours | 72 |

---

## Evidence Contract (5-question rule)

Cada evaluacion responde:
1. Por que se activo? (`activationReason`)
2. Que datos uso? (`dataUsed`)
3. Que accion recomienda? (`recommendedAction`)
4. Por que esa accion? (`actionRationale`)
5. Que datos faltan? (`missingData[]`)

Mas: `confidence` (0-1), `traceId`, `evaluatedAt`.

---

## Alert Types (7)

| Tipo | Severidad |
|---|---|
| MALLET_ITEM_OUT_OF_STOCK | warning / critical |
| MALLET_REPLACEMENT_AVAILABLE | info |
| CUSTOMER_OVERDUE_RECEIVABLE | warning / critical |
| CUSTOMER_INACTIVE | info / warning |
| ORDER_FOLLOW_UP_REQUIRED | warning |
| ORDER_BLOCKED | critical |
| DATA_QUALITY_WARNING | warning |

---

## Mobile Capabilities (6)

| ID | Status Inicial |
|---|---|
| mallet_overview | AVAILABLE (si tiene maleta) / NOT_CONFIGURED |
| customer_alerts | AVAILABLE |
| order_tracking | AVAILABLE |
| replacement_suggestions | AVAILABLE (si tiene maleta) / NOT_CONFIGURED |
| order_creation | UNAVAILABLE (version futura) |
| customer_priority | AVAILABLE |

---

## Que NO hace

- NO crea motores nuevos
- NO modifica Business Policy Engine
- NO escribe en base de datos
- NO tiene UI / React
- NO importa de otros dominios (tiendas, maletas, pedidos, clientes)
- NO usa Prisma

---

## Resultados de QA

- **TSC baseline**: 160 errores (sin regresion)
- **QA tests**: 121/121 passed (48 secciones)
- **Validacion estructural**: 147/147 passed (15 secciones)
- **Dominio separado**: 0 imports cruzados
- **Read-only**: 0 operaciones de escritura
- **Pure functions**: 0 side effects en engine
