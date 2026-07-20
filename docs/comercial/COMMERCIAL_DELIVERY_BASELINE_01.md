# COMMERCIAL_DELIVERY_BASELINE_01

**Fecha**: 2026-07-19
**Branch**: main (post-merge feat/reconciliation-os)
**Commit**: 3aad36b
**Tenant activo**: castillitos

---

## Resumen ejecutivo

Los 8 submódulos Comerciales compilan y cargan sin errores de runtime (solo auth boundary).
Todos usan datos reales de SAG/CRM via Prisma — no hay datos mock en producción.
Dos submódulos carecen de página UI propia (Inteligencia Comercial tiene solo un placeholder sin contenido visible; la inteligencia se consume desde Executive Dashboard y Maletas).

---

## 1. Inventario

**Ruta**: `/comercial/inventario`
**Estado**: Funcional. Datos reales.

### Archivos clave
- `app/(app)/[orgSlug]/comercial/inventario/page.tsx` — Server Component
- `app/(app)/[orgSlug]/comercial/inventario/inventario-client.tsx` — 67KB Client Component

### Fuentes de datos
| Modelo Prisma | Rol |
|---|---|
| `CommercialCoverageSnapshot` | Inventario textil (B01+B04+B14+B15) |
| `ProductInventoryLevel` | Inventario accesorios (B26+B27) |
| `ProductEntity` | Master SKU (grupo, linea, subgrupo, costo) |
| `ProductVariant` | Talla/color |
| `ProductionOrderLine` | Badge de OPs activas |
| `OperationalReservation` | Reservas operativas |

### API
- `/api/orgs/[orgSlug]/comercial/inventario/product-detail` — detalle on-demand
- `/api/orgs/[orgSlug]/integrations/sag/refresh-inventory` — pipeline refresh
- `/api/cron/inventory-refresh` — cron diario 5 AM UTC

### Dependencias lib
- `lib/inventory/inventory-control-service.ts` — orquestador principal
- `lib/commercial-intelligence/report-loader.ts` — carga snapshots
- `lib/commercial-intelligence/availability-engine.ts` — motor puro

### Problemas visibles
- **Archivo monolítico**: `inventario-client.tsx` (67KB) contiene toda la UI
- **`prisma as any`**: bypass de tipos en todos los queries
- **Performance**: primera carga puede ser lenta (1126 modules, 151s cold compile)

### Problemas de datos
- Dependencia de `CommercialCoverageSnapshot` que requiere sync SAG activo
- Accesorios via `ProductInventoryLevel` — cobertura depende de bodega B26/B27

### Bloqueantes de entrega
- Ninguno funcional. El módulo opera con datos reales.

### Prioridad: BAJA (funcional)

---

## 2. Maletas

**Ruta**: `/comercial/maletas`
**Estado**: Funcional. Datos reales. API extensa.

### Archivos clave
- `app/(app)/[orgSlug]/comercial/maletas/page.tsx` — Server Component
- `app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx` — 240KB Client Component

### Fuentes de datos
| Modelo Prisma | Rol |
|---|---|
| `VendorCommercialBag` | Maleta por vendedor/temporada |
| `VendorBagItem` | Asignación por referencia |
| `VendorBagOrderLine` | Deducción por pedido |
| `MaletaReplenishmentPlan` | Plan de reposición |
| `MaletaReplenishmentItem` | Items del plan |
| `MaletaReplenishmentEvent` | Trazabilidad |
| `VendorBagIdealRouteRule` | Reglas de ruta ideal |
| `AssortmentIdealOverride` | Overrides de surtido |

### API (12 endpoints)
- `bags/` — CRUD de maletas
- `bags/[bagId]/items/` — items
- `bags/[bagId]/ideal-route/` — reglas de ruta
- `orders/ingest/` — deducción de ventas
- `portfolio/` — inventario elegible
- `replenishment-plans/` — planes de reposición
- `ideal-overrides/` — overrides de surtido

### Dependencias lib
- `lib/comercial/maletas/` — 30+ archivos (engine, runtime, adapters, repository)
- `lib/comercial/maletas/vendor-bag-repository.ts` — CRUD Prisma
- `lib/comercial/maletas/vendor-bag-engine.ts` — lógica funcional
- `lib/comercial/maletas/maletas-engine.ts` — contexto operacional

### Problemas visibles
- **Archivo monolítico extremo**: `maletas-client.tsx` (240KB) — el más grande del proyecto
- **`prisma as any`** en queries para modelos nuevos
- **Doble fuente de datos**: runtime intenta Prisma → SaleRecord fallback → Excel fallback

### Problemas de datos
- `loadSellerMaletaRecords()` en `report-loader.ts` retorna `[]` (placeholder)
- Excel bootstrap como fallback legacy (`MALETAS_EXCEL_PATH` env var)

### Bloqueantes de entrega
- Ninguno funcional para la operación core (bag CRUD, deducción, portfolio).
- Inteligencia de reemplazo parcialmente conectada.

### Prioridad: MEDIA (funcional pero archivo monolítico es riesgo de mantenimiento)

---

## 3. Pedidos

**Ruta**: `/comercial/pedidos`
**Estado**: Funcional. Datos reales. El más complejo.

### Archivos clave
- `app/(app)/[orgSlug]/comercial/pedidos/page.tsx` — Server Component
- `app/(app)/[orgSlug]/comercial/pedidos/pedidos-client.tsx` — Client Component grande
- `app/(app)/[orgSlug]/comercial/pedidos/wholesale-order-wizard.tsx` — Wizard POS

### Fuentes de datos
| Modelo Prisma | Rol |
|---|---|
| `AgentExecution` | Persistencia de drafts (module=comercial, operation=COMERCIAL_ORDER_DRAFT) |
| `CRMQuote` | Pedidos importados de SAG/CRM |
| `CRMQuoteLine` | Líneas de cotización |
| `CustomerOrderRecord` | Pedidos SAG reales (PD) |
| `CustomerProfile` | Lookup de cliente |
| `ProductEntity` | Catálogo de productos |
| `ProductVariant` | Variantes |
| `ProductInventoryLevel` | Stock |
| `SagWriteOperation` | Idempotencia SAG |

### API (7 endpoints)
- `pedidos/` — 16 acciones (create, delete_draft, list, get, submit, send_to_sag, etc.)
- `pedidos/products/` — search, variants, availability
- `pedidos/history/` — customer, seller, intelligence
- `pedidos/import/` — single, batch, fetch_pending
- `pedidos/pdf/` — generación PDF
- `pedidos/sync-lines/` — sync CRM quote lines

### Dependencias lib
- `lib/comercial/pedidos/` — 43 archivos (order-service, validation, fulfillment, SAG bridge)
- `lib/comercial/pedidos/order-service.ts` — CRUD completo
- `lib/comercial/pedidos/order-sag-bridge.ts` — puente SAG write

### Problemas visibles
- **Persistencia via AgentExecution**: ordenes viven en `metadataJson` blob, no en modelo dedicado
- **SAG write bridge**: `SagWriteOperation` pipeline existe pero requiere credenciales SOAP activas
- **CRM quote lines sync**: bloqueado por CRM clientId/clientSecret faltantes en connector config

### Problemas de datos
- `CRMQuote.customerId` es NULL en todas las 285 cotizaciones — join solo via `rawCrmJson.raw.billing_account_id`
- SAG orders join via `customerNit` (no FK)

### Bloqueantes de entrega
- **P1**: Credenciales CRM para sync de líneas de cotización
- **P2**: SAG write credentials para enviar pedidos a SAG

### Prioridad: ALTA (core del flujo comercial, bloqueantes de integración)

---

## 4. Vendedores

**Ruta**: `/comercial/vendedores`
**Estado**: Funcional. Datos reales.

### Archivos clave
- `app/(app)/[orgSlug]/comercial/vendedores/page.tsx` — Server Component
- `app/(app)/[orgSlug]/comercial/vendedores/vendedores-client.tsx` — Client Component con drawer 360

### Fuentes de datos
| Modelo Prisma | Rol |
|---|---|
| `CRMQuote` | Identidad del vendedor (sellerSlug/sellerName) |
| `CustomerProfile` | Clientes asignados |
| `CustomerReceivable` | Cartera por cliente |
| `CustomerOrderRecord` | Pedidos SAG por NIT |
| `SaleRecord` | Ventas agregadas |
| `VendorCommercialBag` | Maleta activa |
| `VendorBagItem` | Items en maleta |
| `CommercialCase` | Maleta V1 (fallback) |

### API
- `/comercial/vendedores/[sellerSlug]` — GET 360 data

### Dependencias lib
- `lib/comercial/vendors/` — 12 archivos (loader, engine, metrics, alerts, recommendations)
- `lib/comercial/foundation/seller-directory.ts` — directorio dinámico desde CRM
- `lib/comercial/vendors/vendedor-360-loader.ts` — loader 360 (3 fases paralelas)

### Problemas visibles
- **Drawer 360 con 8 tabs**: PERFIL, CLIENTES, VENTAS, RECAUDOS, CARTERA, METAS, COMISIONES, INTELIGENCIA
- **N+1 en seller resolution**: `buildClientSellerLinks()` carga TODOS los quotes + perfiles del org en cada render 360

### Problemas de datos
- Seller identity derivada de `CRMQuote.sellerName` — no hay catálogo maestro de vendedores
- METAS y COMISIONES tabs probablemente vacías (no hay modelo de metas/comisiones)

### Bloqueantes de entrega
- **P2**: Performance de N+1 en seller resolution
- **P3**: Tabs METAS/COMISIONES sin datos reales

### Prioridad: MEDIA (funcional, problemas de performance)

---

## 5. Clientes

**Ruta**: `/comercial/clientes` + `/comercial/clientes/[clienteId]`
**Estado**: Funcional. Datos reales. Dos vistas.

### Archivos clave
- `app/(app)/[orgSlug]/comercial/clientes/page.tsx` — lista paginada
- `app/(app)/[orgSlug]/comercial/clientes/clientes-client.tsx` — lista + drawer 360
- `app/(app)/[orgSlug]/comercial/clientes/[clienteId]/page.tsx` — detalle 360 completo
- `app/(app)/[orgSlug]/comercial/clientes/[clienteId]/cliente-360-client.tsx` — vista 360

### Fuentes de datos
| Modelo Prisma | Rol |
|---|---|
| `CustomerProfile` | Entidad core |
| `CRMQuote` | Historia de cotizaciones (join via rawCrmJson) |
| `CustomerReceivable` | Cartera |
| `CollectionRecord` | Cobros/recibos |
| `CustomerOrderRecord` | Pedidos SAG (join via NIT) |
| `SaleRecord` | Facturas/remisiones |

### API
- `/comercial/clientes/[clienteId]/360` — GET 360 on-demand
- `/customer-360/score` — POST scoring AI/determinístico

### Dependencias lib
- `lib/comercial/clientes/client-loader.ts` — KPIs + lista paginada
- `lib/comercial/clientes/cliente-360-loader.ts` — datos 360
- `lib/comercial/clientes/city-resolver.ts` — DANE DIVIPOLA
- `lib/comercial/foundation/client-seller-linker.ts` — resolución de vendedor

### Problemas visibles
- **Performance fix aplicado**: ya no carga `rawCrmJson` en lista (resolvió timeout de 76MB)
- **N+1 en seller linker**: `buildClientSellerLinks()` full org scan en cada 360

### Problemas de datos
- `CRMQuote.customerId` NULL en 285 cotizaciones — join via `billing_account_id`
- SAG orders via `customerNit` (no FK)
- City resolver: cobertura DANE ~90%

### Bloqueantes de entrega
- Ninguno funcional.

### Prioridad: BAJA (funcional, performance aceptable post-hotfix)

---

## 6. Tiendas

**Ruta**: `/comercial/tiendas`
**Estado**: Funcional. Datos reales. Complejo.

### Archivos clave
- `app/(app)/[orgSlug]/comercial/tiendas/page.tsx` — Server Component
- `app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx` — Client Component grande

### Fuentes de datos
| Modelo Prisma | Rol |
|---|---|
| `AgentExecution` | Admin state (warehouse config, policies, proposals, guides) |
| `ProductInventoryLevel` | Stock por bodega/variante |
| `CRMQuoteLine` | Fallback de inventario |
| `CommercialCoverageSnapshot` | Fallback para bodega principal |

### API (7 endpoints)
- `tiendas/` — 8 acciones (store_detail, summary, inventory, shortages, suggestions, textile_coverage, main_warehouse, stock_lookup)
- `suggestions/` — load
- `warehouse-config/` — list, save, toggle_active
- `policies/` — CRUD de reglas por tienda
- `proposals/` — lifecycle completo de transferencias
- `guides/` — guías de bodega
- `needs/` — necesidades de reposición

### Dependencias lib
- `lib/comercial/tiendas/` — 39 archivos
- `store-replenishment-service.ts` — orquestador con cache TTL in-memory
- `sag-store-adapter.ts` — queries Prisma batch

### Problemas visibles
- **Sin modelo Prisma dedicado**: todo estado admin en `AgentExecution.metadataJson`
- **Provider stub**: `sag-data-warehouse-provider.ts` no implementado
- **Cache in-memory**: TTL cache no persiste entre serverless invocations

### Problemas de datos
- Depende de `ProductInventoryLevel` por bodega — cobertura depende de sync SAG
- Warehouse mapping requiere configuración manual por tienda

### Bloqueantes de entrega
- **P2**: Cache in-memory no funciona en serverless (Vercel)
- **P3**: Provider de data warehouse stub

### Prioridad: MEDIA (funcional pero cache issue en producción)

---

## 7. Control Comercial

**Ruta**: `/comercial/control`
**Estado**: Funcional. Datos reales. Dashboard consolidado.

### Archivos clave
- `app/(app)/[orgSlug]/comercial/control/page.tsx` — Server Component
- `app/(app)/[orgSlug]/comercial/control/control-client.tsx` — Client Component

### Fuentes de datos
| Modelo Prisma | Rol |
|---|---|
| `SaleRecord` | KPIs de ventas (mes/semana/hoy) |
| `CRMQuote` | KPIs de pedidos, ranking vendedores |
| `CustomerProfile` | Clientes activos/nuevos, geografía |
| `CustomerReceivable` | Cartera total/vencida |
| `CollectionRecord` | Recaudos |
| `CommercialCoverageSnapshot` | Inventario (refs totales/críticas/agotadas) |

### API
- Sin API dedicada — datos cargados en SSR
- `/comercial/decisions` — endpoint compartido de decisiones de negocio

### Dependencias lib
- `lib/comercial/control/control-comercial-loader.ts` — orquestador de 13 secciones
- `lib/comercial/importaciones/` — datos de importación
- `lib/comercial/produccion/` — datos de producción
- `lib/comercial/sales-reps/` — datos de vendedores
- `lib/comercial/business-policy/` — motor de decisiones

### Problemas visibles
- **Loader pesado**: 13 secciones ejecutadas secuencialmente en SSR
- **`prisma as any`** en todas las consultas

### Problemas de datos
- Todos los datos vienen de modelos ya validados en otros submódulos
- Depende de sync SAG activo para inventario y producción

### Bloqueantes de entrega
- Ninguno funcional. Dashboard opera con datos reales.

### Prioridad: BAJA (funcional)

---

## 8. Inteligencia Comercial

**Ruta**: `/comercial/inteligencia`
**Estado**: Parcial. Página placeholder. Motor existe pero se consume desde otros módulos.

### Archivos clave
- `app/(app)/[orgSlug]/comercial/inteligencia/page.tsx` — existe pero contenido mínimo

### Fuentes de datos
| Modelo Prisma | Rol |
|---|---|
| `CommercialCoverageSnapshot` | Disponibilidad por referencia |
| `CRMQuote` + `CRMQuoteLine` | Historia de pedidos |
| `ProductEntity` | Master de productos |

### Donde se consume la inteligencia
- **Executive Dashboard** (`/reports`) — `CommercialAvailabilityReport` + `MaletaReplacementReport`
- **Maletas** — inteligencia de reemplazo
- **Pedidos** — `commercial_intelligence` action en history API

### Dependencias lib
- `lib/commercial-intelligence/` — 7 archivos (engine, loader, signals, capability-catalog)
- `lib/commercial-intelligence/availability-engine.ts` — motor puro
- `lib/commercial-intelligence/maleta-replacement-engine.ts` — reglas hardcodeadas Castillitos
- `lib/commercial-intelligence/report-loader.ts` — loader Prisma

### Problemas visibles
- **No tiene vista propia funcional** — inteligencia dispersa en otros módulos
- **Reglas hardcodeadas**: `CASTILLITOS_REPLACEMENT_RULES` y `CASTILLITOS_SELLER_WAREHOUSES` en código
- **`loadSellerMaletaRecords()` retorna `[]`** — placeholder

### Bloqueantes de entrega
- **P2**: Sin vista unificada de inteligencia comercial
- **P3**: Reglas hardcodeadas por tenant

### Prioridad: BAJA (motor funciona, solo falta vista dedicada)

---

## Orden de auditoría recomendado

| # | Submódulo | Prioridad | Razón |
|---|---|---|---|
| 1 | **Pedidos** | ALTA | Core del flujo comercial. Bloqueantes de integración SAG/CRM. |
| 2 | **Inventario** | MEDIA | Base de datos para todos los demás. Performance. |
| 3 | **Maletas** | MEDIA | Archivo de 240KB. Doble fuente de datos. |
| 4 | **Vendedores** | MEDIA | N+1 performance. Tabs sin datos. |
| 5 | **Tiendas** | MEDIA | Cache in-memory en serverless. |
| 6 | **Clientes** | BAJA | Funcional post-hotfix. |
| 7 | **Control Comercial** | BAJA | Dashboard consolidado funcional. |
| 8 | **Inteligencia Comercial** | BAJA | Motor existe, vista pendiente. |

---

## Bloqueantes reales

| ID | Submódulo | Severidad | Descripción |
|---|---|---|---|
| B1 | Pedidos | P1 | Credenciales CRM (clientId/clientSecret) faltantes para sync de líneas de cotización |
| B2 | Pedidos | P2 | Credenciales SAG SOAP write para enviar pedidos a SAG |
| B3 | Vendedores | P2 | N+1 en `buildClientSellerLinks()` — full org scan en cada render 360 |
| B4 | Tiendas | P2 | Cache in-memory TTL no persiste en Vercel serverless |
| B5 | Inteligencia | P2 | Sin vista unificada propia |
| B6 | Vendedores | P3 | Tabs METAS/COMISIONES sin modelo de datos |
| B7 | Tiendas | P3 | Provider `sag-data-warehouse-provider.ts` stub |
| B8 | Inteligencia | P3 | `loadSellerMaletaRecords()` placeholder (retorna `[]`) |
| B9 | Inteligencia | P3 | Reglas de reemplazo hardcodeadas por tenant |

---

## Patrones transversales

1. **`prisma as any`** — usado en todos los submódulos para modelos post-migration. No es bloqueante pero reduce seguridad de tipos.
2. **Archivos monolíticos** — `maletas-client.tsx` (240KB), `inventario-client.tsx` (67KB), `pedidos-client.tsx` (grande). Riesgo de mantenimiento.
3. **Sin componentes compartidos** — la mayoría de la UI es self-contained. Solo 3 archivos en `components/comercial/`.
4. **AgentExecution como storage genérico** — Pedidos y Tiendas persisten estado admin en `metadataJson` blobs en lugar de modelos Prisma dedicados.
5. **Datos reales** — todos los submódulos usan datos SAG/CRM reales via Prisma. No hay mock data en producción.

---

## Primer sprint recomendado

**COMERCIAL-PEDIDOS-INTEGRATION-AUDIT-01**

Objetivo: Auditar y resolver los bloqueantes de integración de Pedidos (B1, B2).

Alcance:
1. Verificar estado actual de credenciales CRM en connector config
2. Verificar estado de credenciales SAG SOAP write
3. Documentar el pipeline completo de send_to_sag
4. Identificar qué se puede probar sin credenciales reales
5. Definir plan de activación con credenciales reales

No implementar correcciones — solo diagnóstico y plan.
