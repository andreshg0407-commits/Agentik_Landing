# PEDIDOS-DETAIL-AND-SELLER-HISTORY-01

**Sprint:** Historial comercial real desde CustomerOrderRecord
**Estado:** COMPLETO
**TSC Baseline:** 160 (sin regresiones)
**Validacion:** 27/27 PASS

---

## Causa raiz

### P1 — Historial del cliente vacio

`getCustomerHistory()` solo consultaba `AgentExecution` (0 registros para Castillitos). Los 9,592 pedidos reales en `CustomerOrderRecord` nunca se consultaban.

### P2 — "Primer pedido del vendedor" erroneo

`customerOrderRecordToOrderDraft()` mapea `sellerName: ""` porque `CustomerOrderRecord` no tiene campo de vendedor (SAG MOVIMIENTOS no incluye vendedor). Esto causaba que `getSellerHistory(orgId, "")` retornara vacio → "Primer pedido del vendedor".

### P3 — Inteligencia comercial ausente

`buildCustomerMemory()` solo consultaba `AgentExecution`. Sin datos reales de SAG, los insights de David (frecuencia, ticket promedio, recompra) no se generaban.

---

## Cambios realizados

### order-history-service.ts

- `getCustomerHistory()`: Agrega `CustomerOrderRecord` como segunda fuente
  - Consulta por `customerNit = customerCode`
  - Incluye `lines` para calcular preferencias (tallas, colores, referencias)
  - Merge y sort de entries de ambas fuentes por fecha descendente
  - Early return si `customerCode` esta vacio
- `getSellerHistory()`: Retorna vacio inmediatamente si `sellerName` esta en blanco (SAG orders)
- `corStatusToHistoryStatus()`: Mapea CustomerOrderStatus a labels del historial

### commercial-memory-builder.ts

- `buildCustomerMemory()`: Agrega `CustomerOrderRecord` como segunda fuente
  - Consulta por `customerNit = customerCode` con `include: { lines: true }`
  - Acumula lineas en refMap/sizeMap/colorMap/catMap para preferencias
  - Early return si `customerCode` esta vacio

### pedidos-client.tsx

- **Drawer header**: No muestra " · " cuando sellerName esta vacio
- **CustomerHistoryPanel**:
  - Empty state cambia de "Primer pedido del cliente" a "Sin historial registrado"
  - Agrega strip de inteligencia comercial: ticket promedio, primer pedido, dias sin comprar
  - Dias sin comprar en rojo si > 60 dias
- **SellerHistoryPanel**:
  - Empty state distingue vendedor SAG no disponible vs vendedor sin historial
  - Mensaje: "Vendedor no disponible en datos SAG. El historial del vendedor se construye con pedidos creados en Agentik."
- `formatDateShort()`: Helper para fechas YYYY-MM-DD

---

## Datos antes/despues

### Customer History (ejemplo: cualquier cliente SAG)

| Metrica | Antes | Despues |
|---|---|---|
| Fuentes | AgentExecution (0 rows) | AgentExecution + CustomerOrderRecord |
| Pedidos visibles | 0 | Hasta 500 pedidos reales SAG |
| Preferencias (tallas/colores) | Vacias | Computadas desde lineas SAG |
| Mensaje empty | "Primer pedido del cliente" | "Sin historial registrado" |

### Seller History (pedidos SAG)

| Metrica | Antes | Despues |
|---|---|---|
| Mensaje empty | "Primer pedido del vendedor" | "Vendedor no disponible en datos SAG" |
| Causa | sellerName="" → query retorna 0 | Early return + mensaje honesto |

### Commercial Intelligence (customer panel)

| Metrica | Antes | Despues |
|---|---|---|
| Ticket promedio | No se mostraba | `$totalValue / totalOrders` |
| Primer pedido | No se mostraba | Fecha del primer pedido |
| Dias sin comprar | No se mostraba | Dias desde ultimo pedido (rojo si >60) |

---

## Limitacion conocida

CustomerOrderRecord **no tiene campo de vendedor**. El campo `sellerName` del header queda vacio para pedidos SAG. Esto es una limitacion del SOAP endpoint de SAG (MOVIMIENTOS), no un bug. Si SAG agrega vendedor en el futuro, solo se necesita actualizar `customerOrderRecordToOrderDraft()`.

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `lib/comercial/pedidos/order-history-service.ts` | +CustomerOrderRecord en getCustomerHistory, early return en getSellerHistory, +corStatusToHistoryStatus |
| `lib/comercial/pedidos/commercial-memory-builder.ts` | +CustomerOrderRecord en buildCustomerMemory |
| `app/(app)/[orgSlug]/comercial/pedidos/pedidos-client.tsx` | Header sin seller separator vacio, empty states corregidos, +intelligence strip, +formatDateShort |

## Archivos creados

| Archivo | Proposito |
|---|---|
| `scripts/validate-pedidos-detail-seller-history.ts` | Validacion estructural (27 checks) |

---

## Criterio de exito

| Criterio | Estado |
|---|---|
| Customer history muestra pedidos de CustomerOrderRecord | OK |
| No aparece "Primer pedido del vendedor" para SAG orders | OK |
| No aparece "Primer pedido del cliente" para clientes con historial SAG | OK |
| Inteligencia comercial: ticket promedio, primer pedido, dias sin comprar | OK |
| Preferencias (referencias, tallas, colores) desde lineas SAG | OK |
| buildCustomerMemory incluye CustomerOrderRecord | OK |
| AgentExecution path preservado | OK |
| TSC baseline 160 | OK |
| Validacion 27/27 | OK |
