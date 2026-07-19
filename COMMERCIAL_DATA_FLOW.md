# COMMERCIAL_DATA_FLOW.md

COMMERCIAL-DATA-AUDIT-01 -- Fase 1: Inventario de Datasources

---

## Clientes

```
SAG TERCEROS (ka_nl_tercero, NIT, name, city code)
  |
  v
CRM Accounts (SuiteCRM V8 API)
  |
  v
castillitos-crm/storage.ts :: CRMCustomerStorageHandler
  | upsert by (organizationId, slug)
  v
Prisma: CustomerProfile (33,203 registros)
  |
  v
lib/comercial/clientes/client-loader.ts :: loadClientesSummary()
  | select: name, nit, city, sellerName, status, totalSalesL12, lastPurchaseAt, totalReceivable, overdueReceivable
  v
app/(app)/[orgSlug]/comercial/clientes/page.tsx (server)
  |
  v
clientes-client.tsx (client) -- KPI strip, busqueda, filtros, tabla paginada
```

### Tablas SAG: TERCEROS
### Tabla Prisma: CustomerProfile
### Transformaciones: normalizeNit(), toSlug(), Decimal -> Number

---

## Vendedores

```
HARDCODED in lib/comercial/maletas/maletas-normalizer.ts
  | DEFAULT_VENDOR_REGISTRY: 4 vendedores
  | (CARLOS_LEON, CARLOS_VILLA, NESTOR, ORLANDO)
  v
getVendorRegistry(orgId) -- ignora orgId, retorna constante
  |
  v
lib/comercial/vendors/vendor-engine.ts :: resolveVendor()
  | Ensambla LiveVendor desde multiples fuentes:
  |   - CRMQuote (ventas, pedidos) via sellerSlug
  |   - CustomerProfile (clientes asignados) via sellerSlug
  |   - CommercialCase (maleta activa) via salesRepId
  v
lib/comercial/vendors/vendor-dashboard.ts :: getVendorTeamDashboard()
  |
  v
app/(app)/[orgSlug]/comercial/vendedores/page.tsx (server)
  |
  v
vendedores-client.tsx (client) -- Team KPIs, vendor cards, detail panel
```

### Tablas SAG: Ninguna directa
### Tabla Prisma: Ninguna (SalesRep model no existe)
### Transformaciones: hardcoded registry, CRM slug matching

---

## Pedidos

```
FUENTE 1: CRM (SuiteCRM V8)
  AOS_Quotes + AOS_Products_Quotes
    |
    v
  castillitos-crm/storage.ts :: CRMQuoteStorageHandler
    | upsert by (organizationId, crmId)
    v
  Prisma: CRMQuote (285 registros) + CRMQuoteLine (27,064 lineas)

FUENTE 2: SAG (MOVIMIENTOS donde k_n_clase_fuente=4, clase PD)
  MOVIMIENTOS + MOVIMIENTOS_ITEMS
    |
    v
  castillitos-crm/index.ts :: SAG sync adapter
    | upsert by (organizationId, erpMovId)
    v
  Prisma: CustomerOrderRecord (9,522) + CustomerOrderLine (1,138,155)

AMBAS FUENTES
  |
  v
lib/comercial/pedidos/order-service.ts :: getOrders()
  | Merge CRM + SAG into unified OrderDraft[]
  v
app/(app)/[orgSlug]/comercial/pedidos/page.tsx (server)
  |
  v
pedidos-client.tsx (client) -- Stats strip, order list, wizard, detail drawer
```

### Tablas SAG: MOVIMIENTOS (fuente 40, clase 4), MOVIMIENTOS_ITEMS
### Tablas Prisma: CRMQuote, CRMQuoteLine, CustomerOrderRecord, CustomerOrderLine
### Transformaciones: crmQuoteToOrderDraft(), sagOrderToOrderDraft()

---

## Inventario

```
Maletas Engine Pipeline (NOT a direct SAG sync)
  |
  v
lib/comercial/maletas/maletas-snapshots.ts :: persistCoverageSnapshot()
  | createMany from MaletasOperationalContext.intelligence.coverage
  v
Prisma: CommercialCoverageSnapshot (15,309 registros, 5 snapshot dates)
  |
  v
lib/comercial/control/control-comercial-loader.ts :: loadControlComercial()
  | (inventario section) findMany latest snapshotAt, count agotadas/criticas
  |
  | also: inventario-client.tsx reads snapshots directly via server page loader
  v
app/(app)/[orgSlug]/comercial/inventario/page.tsx (server)
  |
  v
inventario-client.tsx (client) -- LT/CS sections, collapsible, filters, sync status
```

### Tablas SAG: Indirectas via maletas engine (availability Excel + SAG PD demand)
### Tabla Prisma: CommercialCoverageSnapshot
### Transformaciones: disponible = bodega - reservas, status classification

---

## Maletas

```
Excel Workbooks (MALETAS.xlsx, DISPONIBLE PARA MALETAS.xlsx)
  |
  v
lib/comercial/maletas/maletas-runtime.ts :: loadMaletasContext()
  | also: sag-prisma-reader.ts for Prisma V2 path
  v
lib/comercial/maletas/maletas-engine.ts :: buildMaletasOperationalContext()
  |
  v
Prisma: CommercialCase (0 rows) + CommercialCaseItem (0 rows)
  | (snapshots never persisted to DB -- only coverage snapshots are saved)
  v
app/(app)/[orgSlug]/comercial/maletas/page.tsx (server)
  |
  v
maletas-client.tsx (client) -- Vendor maleta cards, reference detail, intelligence
```

### Tablas SAG: Indirectas via Excel + availability
### Tablas Prisma: CommercialCase (VACIA), CommercialCaseItem (VACIA)
### Transformaciones: maletas-normalizer rules, maletas-engine scoring

---

## Control Comercial

```
Aggregador multi-modulo (NO tiene datasource propio)
  |
  v
lib/comercial/control/control-comercial-loader.ts :: loadControlComercial()
  | Queries:
  |   CRMQuote.count() -- pedidos
  |   CommercialCoverageSnapshot.findMany(latest) -- inventario
  |   CommercialCase.findMany(latest) -- maletas (SIEMPRE 0)
  |   CustomerProfile.count() -- clientes
  |   CustomerReceivable.findMany(overdue) -- cartera
  v
app/(app)/[orgSlug]/comercial/control/page.tsx (server)
  |
  v
control-client.tsx (client) -- 8 KPIs, alertas, resumen por modulo
```

### Tablas SAG: Ninguna directa
### Tablas Prisma: CRMQuote, CommercialCoverageSnapshot, CommercialCase, CustomerProfile, CustomerReceivable
### Transformaciones: threshold-based alertas, graceful degradation via try/catch
