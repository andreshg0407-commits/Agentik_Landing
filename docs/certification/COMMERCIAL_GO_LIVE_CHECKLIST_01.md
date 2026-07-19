# COMMERCIAL GO LIVE CHECKLIST 01

**Date:** 2026-07-14
**Tenant:** Castillitos
**Decision:** GO LIVE APPROVED WITH CONDITIONS
**Readiness Score:** 86/100

---

## Architecture

- [x] BusinessDecision universal contract defined
- [x] 6 commercial domains registered (MALETAS, TIENDAS, PEDIDOS, VENDEDORES, IMPORTACIONES, PRODUCCION)
- [x] 7 decision engines operational
- [x] 6 BusinessDecision bridges implemented
- [x] 1 decision aggregator with filtering
- [x] No circular dependencies
- [x] No business logic in UI components
- [x] Server/client boundary respected

## Policy Packs

- [x] Store Policy Pack (8 policies, v1.0.0)
- [x] Order Policy Pack (6 policies, v1.0.0)
- [x] Import Policy Pack (5 evaluators, v1.0.0)
- [x] SalesRep Policy Pack (6 policies, v1.0.0)
- [x] Production Planning Pack (6 evaluators, v1.0.0)
- [x] Maletas Rules (5+ pure functions)
- [x] All configs externalized (CASTILLITOS_* pattern)
- [x] No hardcoded thresholds in evaluators

## Data Pipeline

- [x] SAG SOAP adapter active (query-catalog + mappers + storage)
- [x] CRM adapter active (castillitos-crm)
- [x] Cron: data-sync CRM (every 6h)
- [x] Cron: data-sync SAG (every 6h)
- [x] Cron: inventory-refresh (daily 5AM UTC)
- [x] Import data loader operational
- [x] Production data loader operational
- [x] SalesRep data loader operational
- [x] Decisions API endpoint operational

## Data Coverage

- [x] PRODUCTOS: 90%
- [x] INVENTARIO: 85%
- [x] CLIENTES: 80%
- [ ] PEDIDOS: 65% (Order engine not wired to UI)
- [x] MALETAS: 85%
- [x] TIENDAS: 90%
- [x] IMPORTACIONES: 95%
- [x] PRODUCCION: 90%
- [x] VENDEDORES: 90%

## Business Rules

- [x] Regla 36 (global low stock)
- [x] Cobertura textil (min/ideal/max)
- [x] Baja rotacion (8 meses / 240 dias)
- [x] Descuentos automaticos por antiguedad
- [x] Descuento override con trazabilidad
- [x] Cartera vencida (30 dias alerta)
- [x] Cliente inactivo (60d riesgo, 90d inactivo)
- [x] Produccion need (PRODUCE/WAIT_EXISTING_OP)
- [x] Recompra importacion (REBUY/WATCH/DO_NOT_REBUY)
- [x] Auto surtido por historial de tienda
- [x] Seleccion de sucursal del cliente
- [x] Despacho parcial
- [x] Readiness de pedido

## UI Pages

- [x] Control Comercial (dashboard con decisionsSummary)
- [x] Maletas (vendor sample loader)
- [x] Pedidos (order service)
- [x] Tiendas (store replenishment service)
- [x] Vendedores (seller directory + metrics)
- [x] Importaciones (import service)
- [x] Inventario (inventory control service)
- [x] Clientes (client loader con paginacion)
- [x] Cliente 360 (detail view)
- [x] Inteligencia (operational intelligence)

## Manager Questions

- [x] Que debo producir?
- [x] Que debo comprar en China?
- [x] Que tienda necesita surtido?
- [x] Que vendedor necesita atencion?
- [x] Que clientes estoy perdiendo?
- [x] Que clientes tienen cartera vencida?
- [x] Que referencias retirar de maleta?
- [x] Que referencias tienen baja rotacion?
- [x] Que pedidos requieren atencion? (partial)
- [x] Cual es el estado de las maletas?
- [x] Cual es la cobertura de las tiendas?
- [x] Cual es mi inventario por marca?

## Known Gaps (Accepted)

- [ ] P0-002: SaleRecord.productCode NULL (workaround: CustomerOrderLine)
- [ ] P0-003: CRMQuote.customerId NULL (workaround: rawCrmJson.billing_account_id)
- [ ] P1-001: Order Policy Pack not wired to Pedidos UI
- [ ] P1-002: Payment history not synced (SAG ABONOS)

## Pre-Launch Verification

- [ ] Confirm cron jobs are running in Vercel production
- [ ] Verify SAG SOAP endpoint is reachable from production
- [ ] Verify CRM V8 API is reachable from production
- [ ] Run `npx tsx scripts/validate-commercial-data-connectivity-01.ts` against production DB
- [ ] Verify inventory-refresh ran at least once in last 24h
