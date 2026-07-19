# ORDER-ASSISTANT-01

Sprint: Order Assistant para Castillitos
Estado: COMPLETO
Fecha: 2026-07-14

---

## Resumen

Asistente inteligente que acompana al vendedor al iniciar un pedido.
Ejecuta automaticamente un analisis previo del cliente antes de que el vendedor empiece a escribir.

No crea motores nuevos. No crea reglas nuevas. No modifica Business Policy Engine.
Consume exclusivamente infraestructura existente.

---

## Arquitectura

```
┌─────────────────────────────────────────────────┐
│  loadOrderAssistant(input)                      │  ← server-only
│  ┌─────────────────────────────────────────────┐│
│  │ loadCliente360()   → profile, cartera, seller││
│  │ listOrders()       → pedidos recientes       ││
│  └──────────────────────┬──────────────────────┘│
│                         ▼                        │
│  ┌─────────────────────────────────────────────┐│
│  │ assembleOrderAssistant(data, config)         ││  ← pure function
│  │ ┌─────────────────────────────────────────┐  ││
│  │ │ evaluateCustomerBranch()   ← existing   │  ││
│  │ │ evaluateCustomerCredit()   ← existing   │  ││
│  │ │ evaluatePreOrderReadiness() ← pre-order │  ││
│  │ └─────────────────────────────────────────┘  ││
│  │ → alerts, warnings, actions, confidence      ││
│  └──────────────────────┬──────────────────────┘│
│                         ▼                        │
│  OrderAssistantResult                            │
└─────────────────────────────────────────────────┘
```

---

## Archivos

| Archivo | Proposito |
|---|---|
| `lib/comercial/pedidos/order-assistant-types.ts` | Tipos de dominio (result, customer, credit, branches, alerts, actions) |
| `lib/comercial/pedidos/order-assistant-engine.ts` | Funcion pura `assembleOrderAssistant()` — sin DB, sin side effects |
| `lib/comercial/pedidos/order-assistant-service.ts` | Loader server-only `loadOrderAssistant()` — consume loaders existentes |
| `scripts/_test-order-assistant-01.ts` | 81 QA tests |
| `scripts/_validate-order-assistant-01.ts` | 72 validaciones estructurales |

---

## Que consume (infraestructura existente)

| Fuente | Funcion | Que obtiene |
|---|---|---|
| Customer Domain | `loadCliente360()` | Perfil, NIT, ciudad, vendedor, cartera, cobros |
| Order Decision Engine | `evaluateCustomerBranch()` | Sucursales, seleccion automatica |
| Order Decision Engine | `evaluateCustomerCredit()` | Estado de cartera, alertas |
| Order Policy Pack Config | `CASTILLITOS_ORDER_POLICY_PACK_CONFIG` | Umbrales configurables |
| Order Service | `listOrders()` | Pedidos recientes del cliente |

---

## Que NO hace

- NO crea motores nuevos
- NO crea politicas nuevas
- NO modifica Business Policy Engine
- NO modifica Commercial Data Layer
- NO escribe en base de datos
- NO confirma pedidos
- NO escribe en SAG
- NO crea UI / React

---

## OrderAssistantResult

```typescript
{
  tenantId: "castillitos",
  evaluatedAt: "2026-07-14T...",

  customer: {
    customerId, customerName, customerCode,
    nit, city, status, segment, sagCode,
    sellerName, sellerConfidence
  },

  branches: {
    availableBranches: CustomerBranchInfo[],
    selectedBranch: CustomerBranchInfo | null,
    selectionMode: "auto_single" | "requires_selection" | "no_branches"
  },

  credit: {
    totalReceivable, overdueReceivable, maxDaysPastDue,
    creditStatus: "approved" | "warning" | "blocked",
    alerts: [{ message, severity, daysPastDue }]
  },

  readiness: {
    status: "READY" | "WARNING" | "BLOCKED",
    canSubmit: boolean,
    checks: [{ dimension, status, message }]
  },

  recentOrders: [{
    id, consecutivo, totalReferences, totalUnits,
    totalValue, status, origin, createdAt, daysSinceOrder
  }],

  autoSurtido: { available: boolean, reason: string },

  alerts: [{ id, dimension, message, severity }],
  warnings: [{ dimension, message }],
  recommendedActions: [{ action, rationale, priority }],

  confidence: 0.0 - 1.0,
  status: "recommended" | "caution" | "blocked",

  evidence: OrderPolicyEvidenceItem[],
  policyResults: { branch, credit, readiness }
}
```

---

## Escenarios validados

| Escenario | Status | Confidence | Alertas |
|---|---|---|---|
| Cliente ideal (1 sucursal, sin cartera, activo) | recommended | 1.0 | 0 |
| Cartera vencida 42 dias | caution | 0.85 | 1 (warning) |
| Cartera critica 75 dias | blocked | — | 1 (critical) |
| 4 sucursales (requiere seleccion) | caution | — | 1 (info) |
| Sin sucursales | caution | — | 1 (warning) |
| Pedido reciente (3 dias) | recommended | — | 0 + accion duplicado |
| Sin inventario sincronizado | recommended | — | auto surtido deshabilitado |
| Cliente incompleto (sin NIT, ciudad, vendedor) | recommended | 0.82 | 0 |
| Peor caso (critico + sin sucursales + sin inventario) | blocked | 0.40 | 2+ |

---

## Pre-Order Readiness vs Order Readiness

El asistente usa una evaluacion de readiness **pre-pedido** que solo verifica dimensiones a nivel de cliente:

| Dimension | Pre-Order | Order Readiness |
|---|---|---|
| Sucursal | ✓ | ✓ |
| Cliente | ✓ | ✓ |
| Cartera | ✓ | ✓ |
| Inventario | — | ✓ |
| Referencias | — | ✓ |
| Tallas | — | ✓ |
| Valor/Unidades | — | ✓ |

Las dimensiones de lineas/inventario/valor se evaluan cuando el vendedor agrega productos (Order Readiness completo del Order Policy Pack).

---

## Confidence scoring

| Factor | Impacto |
|---|---|
| Sin sucursales | -0.15 |
| Sucursal sin seleccionar | -0.05 |
| Cartera bloqueada | -0.25 |
| Cartera warning | -0.10 |
| Sin NIT | -0.05 |
| Sin ciudad | -0.03 |
| Sin vendedor | -0.05 |
| Vendedor baja confianza (<60%) | -0.05 |
| Readiness BLOCKED | -0.20 |
| Readiness WARNING | -0.05 |

---

## Resultados de QA

- **TSC baseline**: 160 errores (sin regresion)
- **QA tests**: 81/81 passed
- **Validacion estructural**: 72/72 passed
- **Dominio separado**: 0 imports cruzados (tiendas/maletas)
- **Read-only**: 0 operaciones de escritura
- **Pure functions**: 0 side effects en engine
