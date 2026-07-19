# PEDIDOS-CUSTOMER-ORDER-RECORD-INTEGRATION-01

**Sprint:** Integrar CustomerOrderRecord como fuente principal de pedidos SAG
**Estado:** COMPLETO
**TSC Baseline:** 160 (sin regresiones)
**Validacion:** 28/28 PASS

---

## Causa raiz

El modulo Pedidos solo consultaba dos fuentes:
1. `AgentExecution` (pedidos creados en Agentik) — 0 registros
2. `CRMQuote` (cotizaciones del CRM SuiteCRM) — 305 registros, ultima fecha **2026-06-02**

Los pedidos reales de SAG estaban en `CustomerOrderRecord` (9,522 registros, hasta **2026-06-26**) pero **nunca se consultaban en el UI**. El usuario veia pedidos con 35 dias de antiguedad.

---

## Fuente anterior

| Fuente | Tabla | Registros | Fecha maxima |
|---|---|---|---|
| Agentik | AgentExecution | 0 | — |
| CRM | CRMQuote | 305 | 2026-06-02 |
| **Total visible** | | **305** | **2026-06-02** |

## Fuente nueva

| Fuente | Tabla | Registros | Fecha maxima |
|---|---|---|---|
| Agentik | AgentExecution | 0 | — |
| CRM | CRMQuote | 305 | 2026-06-02 |
| SAG | CustomerOrderRecord | 9,522 | 2026-06-26 |
| **Total visible** | | **9,827** | **2026-06-26** |

---

## Cambios realizados

### order-types.ts
- `OrderOrigin` extendido con `"sag_customer_order"`

### order-service.ts
- `customerOrderStatusToOrderStatus()` — mapea PENDIENTE/CONFIRMADO/DESPACHADO/FACTURADO/CANCELADO a OrderStatus
- `listCustomerOrderRecords()` — consulta CustomerOrderRecord con _count de lines
- `customerOrderRecordToOrderDraft()` — mapper completo incluyendo lines
- `getMaxCustomerOrderDate()` — metrica de frescura (fecha del pedido SAG mas reciente)
- `listOrders()` — ahora incluye CustomerOrderRecord como tercera fuente
- `getOrder()` — ahora busca CustomerOrderRecord como tercer fallback (con include lines)
- `getOrderStats()` — incluye conteos de CustomerOrderRecord

### page.tsx
- Llama `getMaxCustomerOrderDate()` en paralelo
- Pasa `maxSagOrderDate` al client component

### pedidos-client.tsx
- Props: `maxSagOrderDate?: string | null`
- Header statusLabel muestra "Ultimo: YYYY-MM-DD" con la fecha mas reciente de SAG
- Origin badge: SAG (verde) / CRM (ambar) / AGK (azul)
- `orderStateLabel()` maneja origin `sag_customer_order`
- Empty state de lineas maneja ambos origins SAG

---

## Badges de fuente

| Origin | Badge | Color |
|---|---|---|
| `sag_customer_order` | SAG | Verde (C.greenLight / C.green) |
| `sag` (CRMQuote) | CRM | Ambar (C.amberLight / C.amber) |
| `agentik` | AGK | Azul (C.blueLight / C.blueDark) |

---

## Deduplicacion

No se deduplica agresivamente entre CRMQuote y CustomerOrderRecord porque:
- CRMQuote viene del CRM (cotizaciones de vendedores de campo)
- CustomerOrderRecord viene de SAG (pedidos facturados/procesados)
- No existe clave comun confiable entre ambas tablas
- Ambos se muestran con badge de fuente diferenciado

---

## Limitaciones

1. CustomerOrderRecord lines (1,138,155 registros) solo se cargan en detalle individual, no en lista
2. El promedio de 119 lineas por pedido hace impractico cargarlas en la vista de lista
3. SAG SOAP no ha sincronizado desde 2026-06-29 (8 dias) — problema separado de sync, no de UI
4. CRM no tiene cotizaciones despues de 2026-06-02 — puede ser operacional

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `lib/comercial/pedidos/order-types.ts` | +1 origin value |
| `lib/comercial/pedidos/order-service.ts` | +4 funciones, +3 integraciones en funciones existentes |
| `app/(app)/[orgSlug]/comercial/pedidos/page.tsx` | +1 data fetch, +1 prop |
| `app/(app)/[orgSlug]/comercial/pedidos/pedidos-client.tsx` | +1 prop, badges tricolor, freshness label, origin handling |

## Archivos creados

| Archivo | Proposito |
|---|---|
| `scripts/validate-pedidos-customer-order-record-integration.ts` | Validacion estructural (28 checks) |

---

## Criterio de exito

| Criterio | Estado |
|---|---|
| Pedidos muestra CustomerOrderRecord | OK |
| Fecha mas reciente visible pasa de 2026-06-02 a 2026-06-26 | OK |
| Badge SAG/CRM/AGK distingue fuente | OK |
| Header muestra frescura operativa | OK |
| CRMQuote sigue funcionando | OK |
| AgentExecution sigue funcionando | OK |
| TSC baseline 160 | OK |
| Validacion 28/28 | OK |
