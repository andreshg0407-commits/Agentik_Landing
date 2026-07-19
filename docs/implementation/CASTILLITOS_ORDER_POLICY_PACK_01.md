# CASTILLITOS-ORDER-POLICY-PACK-01

Sprint: Order Policy Pack para Castillitos
Estado: COMPLETO
Fecha: 2026-07-14

---

## Resumen

6 politicas de pedidos registradas en el Business Policy Engine existente.
Sin motores nuevos, sin UI, sin Prisma en archivos de engine.
Toda logica configurable desde `order-policy-pack-config.ts`.

---

## Archivos

| Archivo | Proposito |
|---|---|
| `lib/comercial/pedidos/order-decision-types.ts` | Tipos de dominio (6 policy types, 6 result types, context, evidence) |
| `lib/comercial/pedidos/order-policy-pack-config.ts` | Valores configurables (5 secciones, 0 hardcoded en engine) |
| `lib/comercial/pedidos/order-decision-engine.ts` | 7 funciones puras de evaluacion |
| `lib/comercial/pedidos/order-policy-pack.ts` | 6 BusinessPolicy registradas via registerPolicy() |
| `scripts/_test-castillitos-order-policy-pack-01.ts` | 110 QA tests |
| `scripts/_validate-castillitos-order-policy-pack-01.ts` | 94 validaciones estructurales |

---

## Politicas

### FASE 2: Seleccion de Sucursal (`cop-customer-branch-v1`)
- Si el cliente tiene 1 sucursal: seleccion automatica
- Si tiene varias: exigir seleccion explicita
- Si no tiene: alertar para registrar
- Nunca asumir sucursal

### FASE 3: Validacion de Cartera (`cop-customer-credit-v1`)
- Warning: >= 30 dias vencidos (configurable)
- Critico: >= 60 dias vencidos (configurable)
- No bloquea automaticamente (configurable: `blockOnWarning`, `blockOnCritical`)
- Alerta informativa al vendedor

### FASE 4: Distribucion Automatica por Tallas (`cop-auto-size-distribution-v1`)
- Algoritmo de nivelacion: floor division + round-robin remainder
- Max 50 und/talla (configurable)
- Min 3 tallas para balance (configurable)
- Redistribuye si una talla no tiene stock (configurable)

### FASE 5: Despacho Parcial (`cop-partial-delivery-v1`)
- Evalua cada linea: COMPLETE / PARTIAL / BACKORDER
- Despacho parcial habilitado (configurable)
- Backorder habilitado (configurable)
- Min fulfillment: 0% (configurable)

### FASE 6: Omision de Descuento (`cop-discount-override-v1`)
- Omision permitida (configurable)
- Motivo obligatorio (configurable)
- Trazabilidad completa: usuario, fecha, motivo

### FASE 7: Evaluacion de Preparacion (`cop-order-readiness-v1`)
- 7 dimensiones: sucursal, cliente, cartera, inventario, referencias, tallas, valor/unidades
- Resultado: READY / WARNING / BLOCKED
- `canSubmit: true` si no hay dimensiones bloqueadas
- Min valor: $0 COP (configurable)
- Min unidades: 1 (configurable)

---

## Configuracion

Todos los umbrales en `order-policy-pack-config.ts`:

```typescript
CASTILLITOS_ORDER_POLICY_PACK_CONFIG = {
  tenantId: "castillitos",
  version: "1.0.0",
  customerCredit: {
    warningDaysPastDue: 30,
    criticalDaysPastDue: 60,
    blockOnWarning: false,
    blockOnCritical: false,
    defaultSeverity: "warning",
  },
  autoSizeDistribution: {
    maxUnitsPerSize: 50,
    minSizesForBalance: 3,
    redistributeOnMissing: true,
  },
  partialDelivery: {
    minFulfillmentPct: 0,
    partialDeliveryEnabled: true,
    backorderEnabled: true,
  },
  discountOverride: {
    overrideAllowed: true,
    requireReason: true,
  },
  orderReadiness: {
    minOrderValue: 0,
    minOrderUnits: 1,
    creditBlocksSubmission: false,
    branchRequiredForSubmission: false,
  },
};
```

Para cambiar un umbral: modificar el valor en config, re-ejecutar el engine.

---

## Evidencia (Regla de Oro)

Cada evaluacion responde tres preguntas:

1. **Por que se activo?** (`activationReason`)
2. **Que datos uso?** (`dataUsed`)
3. **Que accion recomienda y por que?** (`recommendedAction` + `actionRationale`)

Ejemplo de evidencia real:

```
activationReason: "Cliente Calzado Bucaramanga tiene 3 sucursales. Se requiere seleccion."
dataUsed: { customerId: "C-001", branchCount: 3, availableBranches: [...] }
recommendedAction: "Seleccionar una de las 3 sucursales disponibles"
actionRationale: "El cliente tiene multiples puntos de entrega. La politica no asume."
```

---

## Separacion de Dominio

- Scope: Pedidos exclusivamente
- NO importa de `lib/comercial/tiendas/`
- NO importa de `lib/comercial/maletas/`
- NO referencia `store-policy-pack` ni `store-decision-engine`
- NO usa Prisma, fetch, process.env, async/await, console.log, Math.random

---

## SAG Discovery (FASE 10)

### Datos disponibles en SAG

| Campo | Estado | Fuente |
|---|---|---|
| Cliente (NIT, nombre) | Disponible | SAG TERCEROS via CRM sync |
| Cartera (facturas, vencimientos) | Disponible | CustomerReceivable model |
| Inventario por talla/color | Disponible | SAG inventario sync |
| Productos/referencias | Disponible | SAG catalogo sync |

### Datos NO disponibles en SAG (gaps documentados)

| Campo | Estado | Nota |
|---|---|---|
| Sucursales del cliente | NO EXISTE | `CustomerBranch` es tipo de dominio, no modelo Prisma. SAG TERCEROS no tiene concepto de sucursal. |
| Direccion de entrega | NO EXISTE | Sin modelo de direcciones por sucursal |
| Ciudad/zona del cliente | PARCIAL | DANE lookup existe pero no vinculado a sucursales |
| Canal de venta | NO EXISTE | Sin campo en modelos actuales |
| Tipo de cliente | NO EXISTE | Sin clasificacion en SAG |
| Lista de precios | NO EXISTE | Sin modelo de listas de precios |
| Condicion de pago | NO EXISTE | Sin campo en CustomerProfile |
| Vendedor asignado | PARCIAL | CRM quote history (60% confianza) |

### Implicaciones

Las politicas de sucursal (`cop-customer-branch-v1`) y readiness evaluan sucursales pero dependen de datos que hoy no estan sincronizados. El engine funciona correctamente con datos vacios (devuelve `no_branches`), pero para produccion real se necesita:

1. Modelo Prisma para `CustomerBranch`
2. Sync desde SAG o entrada manual
3. Vinculacion con direcciones de entrega

---

## Resultados de QA

- **TSC baseline**: 160 errores (sin regresion)
- **QA tests**: 110/110 passed
- **Validacion estructural**: 94/94 passed
- **Separacion de dominio**: verificada (0 imports cruzados)
- **Funciones puras**: verificadas (0 side effects)
