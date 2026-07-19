# COMERCIAL-VENDEDORES-LIVE-01

## Sales Performance Center — First Digital Business Entity

**Estado:** Completo
**Fecha:** 2026-06-25
**TSC Baseline:** 160 (sin regresion)

---

## 1. Que se construyo

El vendedor ya no es un registro administrativo.
Es la primera Digital Business Entity de Agentik: un centro operativo vivo
que consolida informacion en tiempo real de multiples modulos.

Cuando un gerente abre el perfil de un vendedor, entiende inmediatamente:
- Que esta haciendo
- Que ha vendido
- Que pedidos tiene
- Que clientes requieren atencion
- Que referencias debe retirar
- Que oportunidades tiene
- Que problemas requieren accion

---

## 2. Modelo LiveVendor

```typescript
interface LiveVendor {
  kind: "vendor";
  identity: VendorIdentity;        // nombre, SAG name, slug, zona, estado
  commercial: VendorCommercialKpis; // ventas dia/semana/mes, pedidos, clientes, ranking
  activeCase: VendorActiveCaseSnapshot; // maleta activa con refs/agotadas/criticas
  customers: VendorCustomerSummary; // activos, visitados, sin atencion, top
  orders: VendorOrderSummary;       // hoy, abiertos, bloqueados
  fulfillment: VendorFulfillment;   // tasa, facturados, sin factura
  alerts: VendorAlert[];            // motor de alertas
  recommendations: VendorRecommendation[]; // motor de recomendaciones
  operationalState: OperationalState; // health, alertCount, completeness
  assembledAt: string;              // timestamp de ensamblaje
}
```

---

## 3. Motores Creados

| Archivo | Responsabilidad |
|---|---|
| `lib/comercial/vendors/vendor-types.ts` | Tipos: LiveVendor, VendorCard, VendorTeamDashboard, alertas, recomendaciones |
| `lib/comercial/vendors/vendor-utils.ts` | Utilidades: toSlug, timestamps, ID generators |
| `lib/comercial/vendors/vendor-metrics.ts` | KPIs comerciales, clientes, pedidos (queries CRM/Prisma) |
| `lib/comercial/vendors/vendor-performance.ts` | Fulfillment (reusa seller-fulfillment-service.ts) + maleta activa |
| `lib/comercial/vendors/vendor-alerts.ts` | Motor de alertas: 8 tipos, severidad, puro calculo |
| `lib/comercial/vendors/vendor-recommendations.ts` | Motor de recomendaciones: 8 tipos, suggestedOnly: true |
| `lib/comercial/vendors/vendor-engine.ts` | Orquestador: resuelve LiveVendor desde multiples fuentes |
| `lib/comercial/vendors/vendor-dashboard.ts` | Fachada publica: getVendorProfile, getVendorTeamDashboard |

---

## 4. Integracion con Executive Intelligence Engine

El vendor engine reutiliza patrones del Executive Intelligence Engine:

- **Fase 1:** Data engines en paralelo (commercial, case, customers, orders, fulfillment)
- **Fase 2:** Intelligence engines sin DB (alerts, recommendations)
- **Fase 3:** Operational state computation

NO duplica logica del Executive Intelligence Engine.
Consume `computeSellerFulfillmentKpi()` directamente del modulo Pedidos.

---

## 5. Preparacion para Business Event Engine

### Eventos Futuros Documentados

| Evento | Trigger |
|---|---|
| `vendor.sale_created` | Se registra una venta |
| `vendor.portfolio_updated` | Se actualiza la maleta |
| `vendor.portfolio_depleted` | Una referencia llega a cero |
| `vendor.goal_reached` | Se cumple la meta mensual |
| `vendor.order_blocked` | Se bloquea un pedido |
| `vendor.customer_visited` | Un cliente recibe pedido |
| `vendor.recommendation_generated` | Nueva recomendacion creada |

Estos eventos estan tipados en `VendorBusinessEventType` pero NO se emiten aun.
La arquitectura esta preparada: las alertas y recomendaciones ya son computaciones puras
que reciben estado y devuelven resultados — la transicion a event-driven es directa.

---

## 6. Alertas Generadas

| Tipo | Severidad | Condicion |
|---|---|---|
| `depleted_references` | critical/high | Refs agotadas en maleta |
| `blocked_orders` | critical/high | Pedidos bloqueados |
| `unattended_customers` | high/medium | Clientes sin pedidos > 3 |
| `stale_case` | high/medium | Maleta sin actualizar > 7 dias |
| `orders_waiting_production` | medium | Pedidos esperando produccion |
| `orders_waiting_inventory` | medium | Pedidos esperando inventario |
| `low_fulfillment` | critical/high | Cumplimiento < 60% |
| `goal_at_risk` | high | Meta < 50% despues del dia 15 |

---

## 7. Recomendaciones Generadas

| Tipo | Trigger |
|---|---|
| `update_case` | >= 3 refs agotadas |
| `remove_depleted_reference` | Refs sin disponibilidad |
| `visit_customer` | Clientes sin pedidos este mes |
| `follow_up_cartera` | Clientes con saldo pendiente |
| `prioritize_order` | Pedidos bloqueados |
| `add_new_reference` | < 10 refs activas |
| `replenish_reference` | Refs bajo minimo |
| `call_customer` | Top clientes sin compra > 30 dias |

Todas las recomendaciones llevan `suggestedOnly: true` per BUSINESS-ENGINE-01.

---

## 8. Regla Arquitectonica Permanente

A partir de este sprint:

**Ningun modulo nuevo puede implementar logica de negocio aislada.**

Antes de escribir cualquier funcionalidad, determinar si pertenece a:
- Executive Intelligence Engine
- Business Flow Engine
- Business Event Engine
- Business Rule Engine
- Action Engine

Si pertenece a alguno de estos motores, NO implementar dentro del modulo.
Solo la logica exclusiva del dominio permanece en el modulo.

---

## 9. Archivos Creados/Modificados

### Nuevos
- `lib/comercial/vendors/vendor-types.ts`
- `lib/comercial/vendors/vendor-utils.ts`
- `lib/comercial/vendors/vendor-metrics.ts`
- `lib/comercial/vendors/vendor-performance.ts`
- `lib/comercial/vendors/vendor-alerts.ts`
- `lib/comercial/vendors/vendor-recommendations.ts`
- `lib/comercial/vendors/vendor-engine.ts`
- `lib/comercial/vendors/vendor-dashboard.ts`
- `app/(app)/[orgSlug]/comercial/vendedores/page.tsx`
- `app/(app)/[orgSlug]/comercial/vendedores/vendedores-client.tsx`
- `app/api/orgs/[orgSlug]/comercial/vendedores/[vendorId]/route.ts`

### Modificados
- `components/shell/module-nav-config.ts` — Vendedores nav entry updated

---

## 10. Compatibilidad

| Modulo | Estado |
|---|---|
| Pedidos | Sin cambios. Se reutiliza `computeSellerFulfillmentKpi()` |
| Maletas | Sin cambios. Se reutiliza `getVendorRegistry()` |
| Inventario | Sin cambios |
| Executive Intelligence | Sin cambios |
| Informes Inteligentes | Sin cambios |
| David | Sin cambios. Recomendaciones listas para consumo futuro |

---

## 11. Roadmap de Evolucion

### Phase 2: Datos en Vivo
- [ ] Crear modelo Prisma `CommercialSalesRep` (reemplaza hardcoded registry)
- [ ] Conectar `ordersWaitingInventory` y `ordersWaitingProduction` con inventory/production engines
- [ ] Conectar `customersWithCartera` con modulo de cobranza
- [ ] Agregar metas configurables por tenant (`salesGoal`)
- [ ] Zonas/territorios configurables

### Phase 3: Business Events
- [ ] Emitir `vendor.sale_created` desde sync de CRM
- [ ] Emitir `vendor.portfolio_depleted` desde maletas engine
- [ ] Conectar alertas a Business Rule Engine
- [ ] David consume recomendaciones del vendor engine

### Phase 4: Sales Performance Center Completo
- [ ] Tendencias temporales (grafico de ventas diarias)
- [ ] Comparativo entre vendedores
- [ ] Prediccion de cumplimiento de meta
- [ ] Vista de derrotero (ruta de visitas)
