# COMMERCIAL_DATA_DOMAINS_01

**Sprint:** COMMERCIAL-DATA-DOMAINS-01
**Date:** 2026-07-11
**Tenant:** Castillitos (reference implementation)
**Scope:** Arquitectura oficial del Commercial Data Layer por dominios funcionales
**Constraint:** Cero cambios en produccion, Prisma, adapters, o modulos

---

## 1. Resumen Ejecutivo

El Commercial Data Layer se organiza en **6 dominios funcionales** que agrupan entidades,
adapters y proyecciones por responsabilidad de negocio:

```
┌──────────────────────────────────────────────────────────────────┐
│                   COMMERCIAL DATA LAYER                            │
├──────────────┬──────────────┬──────────────┬─────────────────────┤
│   PRODUCT    │  INVENTORY   │    SALES     │     CUSTOMER        │
│   DOMAIN     │   DOMAIN     │   DOMAIN     │      DOMAIN         │
├──────────────┼──────────────┼──────────────┼─────────────────────┤
│  PURCHASING  │    STORE     │              │                     │
│  & IMPORT    │  OPERATIONS  │              │                     │
│   DOMAIN     │   DOMAIN     │              │                     │
└──────────────┴──────────────┴──────────────┴─────────────────────┘
```

**Decision sobre dominios evaluados:**

| Dominio propuesto | Decision | Razon |
|---|---|---|
| PRODUCT | MANTENER | Nucleo referencial — todos dependen de el |
| INVENTORY | MANTENER | Posicion actual + movimientos = dominio coherente |
| SALES | MANTENER | Documentos + lineas + atribuciones = ciclo completo |
| CUSTOMER | MANTENER | Identidad + contacto + sucursales + comportamiento |
| PURCHASING & IMPORT | MANTENER | Entradas + costos + proveedor + lotes |
| STORE OPERATIONS | MANTENER | Cobertura + reglas + transferencias = subsistema propio |
| VENDOR / WORKFORCE | FUSIONAR → CUSTOMER | Vendedor es un tipo de actor, no un dominio aparte |
| RECEIVABLES | FUSIONAR → CUSTOMER | Cartera es una proyeccion del cliente, no dominio independiente |

**Justificacion de fusiones:**
- Vendor: La mayoria de datos de vendedor ya vienen del CRM quote (seller attribution).
  No tiene adapters propios ni fuente SAG dedicada. Vive como sub-entidad de Customer Domain.
- Receivables: CustomerReceivable ya esta synced y opera como extension de CustomerProfile.
  Separarlo crea una frontera artificial sin adapter ni fuente propia.

---

## 2. Principios

### P1: Dominio = Capacidad Completa
Cada dominio entrega preguntas respondibles, no solo datos persistidos.

### P2: Contratos Canonicos sobre Tipos Fisicos
Los motores importan contratos de dominio, nunca tipos SAG/SIIGO/CRM directamente.

### P3: Adapter como Traductor Puro
Un adapter traduce de una fuente especifica a un contrato canonico. Cero logica de negocio.

### P4: Ownership Unico
Cada dato tiene exactamente un dominio dueno. Otros dominios lo consumen via referencia o read model.

### P5: Evento sobre Polling
Cada cambio emite un evento tipado. Los consumidores reaccionan; no reconsultan.

### P6: Frescura Declarada
Cada entidad declara su SLA de actualizacion. Nunca se asume "tiempo real" sin evidencia.

### P7: ERP-Agnostic por Contrato
Los contratos canonicos deben poder alimentarse desde SAG, SIIGO, Dynamics, o manual. La logica de motores no sabe que ERP existe debajo.

### P8: MVP Primero
Cada dominio tiene un MVP (datos minimos para operar) y un V2 (enriquecimiento). El MVP se construye primero.

---

## 3. Dominios

### 3.1 PRODUCT DOMAIN

**Proposito:** Ser la fuente de verdad sobre QUE se vende — catálogo, variantes, atributos, precios de lista.

**Preguntas que responde:**
- Que referencias existen?
- Que tallas y colores tiene cada referencia?
- A que linea comercial pertenece?
- Cual es su subgrupo?
- Cual es su precio de lista (PV3/PV4)?
- Esta activo o descontinuado?
- Cual es su clasificacion de tamano (S/M/L)?
- Que categoria (nina/nino/bebe)?

**Entidades canonicas:**
- `ProductProfile` — referencia maestra
- `ProductVariant` — combinacion talla+color por referencia
- `ProductPrice` — precio de lista vigente (snapshot temporal)
- `ProductClassification` — linea, subgrupo, clase, categoria

**Fuentes SAG:**
- `v_articulos` — codigo, detalle, talla, color, linea, subgrupo, PV3, PV4
- Heuristicas de clasificacion (businessLine resolution)

**Datos confirmados:** codigo, detalle, talla, color, linea, subgrupo parcial, PV3/PV4 actual
**Gaps:** fecha creacion referencia, estado comercial confirmado, historico precios, categoria

**Adapters requeridos:**
- `SagProductAdapter` — traduce v_articulos → ProductProfile + ProductVariant

**Modulos consumidores:** Inventario, Tiendas, Maletas, Pedidos, Marketing Studio, Control Comercial
**Motores consumidores:** Coverage Engine, Rotation Engine, Repurchase Engine, Markdown Engine, Maletas Engine

**Dependencias:** NINGUNA — dominio raiz
**Eventos emitidos:** `product.created`, `product.updated`, `product.discontinued`, `price.changed`

**Proyecciones derivadas:**
- ProductCatalogView (UI-ready list with classification)
- ProductSearchIndex (referenceCode + name + attributes)

**Riesgos:** Subgrupo inferido heuristicamente; precio solo actual (sin historico retroactivo)
**Criterio de completitud:** 100% de referencias con talla/color; >90% con linea; >70% con subgrupo

---

### 3.2 INVENTORY DOMAIN

**Proposito:** Saber CUANTO hay, DONDE esta, y CUANDO cambio — posicion actual + movimientos historicos.

**Preguntas que responde:**
- Cuanto inventario hay de una referencia?
- En que bodega/tienda esta?
- Cuanto esta reservado?
- Cuando fue el ultimo movimiento?
- Cuando ingreso por primera vez?
- Cuantas unidades se han movido en un periodo?
- Hay inventario en transito?

**Entidades canonicas:**
- `InventoryPosition` — stock actual por variante+bodega (snapshot)
- `InventoryMovement` — evento de entrada o salida (transaccional)
- `InventoryAgeIndex` — fecha primer ingreso por referencia (derivado)
- `WarehouseProfile` — configuracion de bodega/tienda

**Fuentes SAG:**
- Inventario por bodega (ya accedido para B01, confirmado B11/B31/B32/B39)
- MOVIMIENTOS + MOVIMIENTOS_ITEMS (entradas: ET fuente 116, entradas directas)

**Datos confirmados:** disponible B01, reservado, pendiente PD, mapeo bodega→tienda
**Gaps:** inventario multi-bodega completo, fecha primer ingreso, movimientos historicos de entrada

**Adapters requeridos:**
- `SagInventoryAdapter` — traduce snapshot de inventario → InventoryPosition
- `SagMovementAdapter` — traduce MOVIMIENTOS entrada → InventoryMovement

**Modulos consumidores:** Tiendas, Maletas, Inventario, Control Comercial, Pedidos
**Motores consumidores:** Coverage Engine, Transfer Engine, Rotation Engine (entrada), Production Signal Engine

**Dependencias:** PRODUCT (para resolver referenceCode → variante)
**Eventos emitidos:** `inventory.position_changed`, `inventory.entry_received`, `inventory.depleted`, `inventory.age_threshold`

**Proyecciones derivadas:**
- StoreInventoryView (por tienda, para Coverage Engine)
- AgeByReferenceView (dias desde primer ingreso)
- DepletionAlertView (referencias agotadas)

**Riesgos:** Volumen de movimientos puede ser alto; mapeo bodega→tienda requiere config
**Criterio de completitud:** Posicion en 4 tiendas + bodega principal; fecha ingreso para >80% de refs activas

---

### 3.3 SALES DOMAIN

**Proposito:** Registrar TODO lo que se vendio — documentos, lineas, atribuciones, devoluciones. Fuente de verdad sobre REVENUE.

**Preguntas que responde:**
- Que se vendio, cuando, a quien, por cuanto?
- Cuantas unidades de cada variante?
- A que precio unitario real?
- Que vendedor cerro la venta?
- En que tienda/canal se origino?
- Hubo devolucion? Cuantas unidades?
- Cual es la rotacion por referencia?
- Cual es el precio promedio real?

**Entidades canonicas:**
- `SalesDocument` — header de factura/remision (ya existe como SaleRecord)
- `SaleLine` — linea de detalle: variante + cantidad + precio unitario (NUEVO)
- `SalesReturn` — nota credito con detalle (NUEVO)
- `SalesAttribution` — vendedor + canal + tienda (derivado de SalesDocument)

**Fuentes SAG:**
- MOVIMIENTOS header (FV/NV) — ya synced como SaleRecord
- MOVIMIENTOS_ITEMS (FV/NV) — lineas de factura (NO synced — GAP principal)
- MOVIMIENTOS + ITEMS (NC) — notas credito

**Datos confirmados:** Header FV/NV (monto, fecha, cliente, vendedor, tienda, canal, fuente 1/2)
**Gaps:** Lineas de detalle (unidades, precio unitario, variante), notas credito detalladas

**Adapters requeridos:**
- `SagSaleLineAdapter` — traduce MOVIMIENTOS_ITEMS FV/NV → SaleLine
- `SagReturnAdapter` — traduce MOVIMIENTOS_ITEMS NC → SalesReturn

**Modulos consumidores:** Control Comercial, Vendedores 360, Clientes 360, Tiendas, Inventario, Maletas
**Motores consumidores:** Rotation Engine, Repurchase Engine, Markdown Engine, Sales Intelligence, Pricing Engine

**Dependencias:** PRODUCT (referenceCode), CUSTOMER (customerNit), INVENTORY (para cruce rotacion)
**Eventos emitidos:** `sale.line_recorded`, `sale.return_recorded`, `sale.period_closed`

**Proyecciones derivadas:**
- RotationByReferenceView (unidades vendidas / periodo)
- RevenueByVariantView (precio × cantidad por variante)
- ReturnRateView (devuelto / vendido)
- VendorPerformanceView (ventas por vendedor — derivada)

**Riesgos:** Volumen 50-100K lineas/ano; fuente FV/NV requiere confirmacion exacta; n_valor_unitario puede no existir
**Criterio de completitud:** >10K lineas synced; precio unitario en >80% de lineas; unidades en 100%

---

### 3.4 CUSTOMER DOMAIN

**Proposito:** Identidad completa del cliente — quien es, donde esta, como contactarlo, que compra, cuanto debe.

**Preguntas que responde:**
- Quien es el cliente (NIT, nombre, razon social)?
- Donde esta (ciudad, departamento, direccion)?
- Como contactarlo (telefono, correo)?
- Tiene sucursales?
- Quien es su vendedor asignado?
- Cuando fue su ultima compra?
- Cuanto debe en cartera?
- Con que frecuencia compra?
- Cual es su CLV?
- Es un cliente en riesgo de churn?

**Entidades canonicas:**
- `CustomerProfile` — identidad maestra (YA EXISTE, requiere enrichment)
- `CustomerBranch` — sucursal/punto de entrega (NUEVO si SAG tiene tabla)
- `CustomerReceivable` — posicion de cartera (YA EXISTE)
- `CustomerBehavior` — frecuencia, CLV, churn risk (DERIVADO)
- `VendorProfile` — vendedor asignado (sub-entidad, ya parcial)
- `CollectionRecord` — pagos aplicados (YA EXISTE)

**Fuentes SAG:**
- TERCEROS — NIT, nombre, ciudad, tipo doc (ya synced parcial)
- CARTERA — facturas pendientes (ya synced)
- v_pagosnew — recibos de pago (ya synced)
- CRM Accounts — contacto, correo, telefono (ya synced via CRM adapter)
- VENDEDORES? — tabla no confirmada

**Datos confirmados:** NIT, nombre, ciudad (90%), cartera completa, pagos, CRM contact parcial
**Gaps:** telefono/correo SAG, direccion completa, sucursales, zona vendedor, frecuencia/CLV (derivable)

**Adapters requeridos:**
- `SagCustomerAdapter` — enrichment de TERCEROS → CustomerProfile (campos adicionales)
- `CrmCustomerAdapter` — YA EXISTE (castillitos-crm)
- `SagBranchAdapter` — traduce DIRECCIONES/SUCURSALES → CustomerBranch (SI EXISTE tabla)

**Modulos consumidores:** Clientes 360, Control Comercial, Pedidos, Vendedores, Maletas
**Motores consumidores:** Customer Intelligence, Order Validation, Sales Intelligence, Commercial Copilot

**Dependencias:** NINGUNA (dominio raiz junto con PRODUCT)
**Eventos emitidos:** `customer.enriched`, `customer.churn_risk_changed`, `receivable.overdue`, `payment.applied`

**Proyecciones derivadas:**
- CustomerHealthView (score = cartera + frecuencia + LTV)
- ChurnRiskView (dias sin compra > umbral)
- VendorPortfolioView (clientes por vendedor)
- GeographyView (clientes por ciudad/departamento)

**Riesgos:** Sucursales pueden no existir en SAG PYA; datos contacto pueden estar incompletos
**Criterio de completitud:** >90% con ciudad resuelta; >50% con telefono o correo; lastPurchaseAt en 100%

---

### 3.5 PURCHASING & IMPORT DOMAIN

**Proposito:** Registrar como ENTRA mercancia al sistema — produccion nacional, importaciones, costos, tiempos.

**Preguntas que responde:**
- Que se produjo y cuando?
- Cuanto tardo el ciclo productivo?
- Cual fue el costo unitario?
- Que materia prima consumio?
- Cuando ingreso al inventario?
- Que proveedor surtio?
- Cual fue el costo FOB/nacionalizacion?
- Que lote de importacion?

**Entidades canonicas:**
- `ProductionOrder` — orden de produccion (YA EXISTE como ProductionEvent OP)
- `ProductionEntry` — entrada a inventario (YA EXISTE como ProductionEvent ET)
- `MaterialConsumption` — consumo materia prima (YA EXISTE como ProductionEvent CN)
- `ProductionTimeline` — ciclo completo OP→CN→ET (YA EXISTE)
- `ImportReceipt` — lote de importacion con costo (NO EXISTE en SAG — modulo propio)
- `SupplierProfile` — proveedor (NO EXISTE en SAG)

**Fuentes SAG:**
- MOVIMIENTOS OP (fuente 118) — ya synced (3,376 ordenes)
- MOVIMIENTOS ET (fuente 116) — ya synced (3,640 entradas)
- MOVIMIENTOS CN (fuente 113) — ya synced (7,890 consumos, 81,367 lineas)

**Datos confirmados:** OP completo, ET completo (header), CN completo, timeline 44d avg
**Gaps:** Importaciones (SAG no tiene), proveedor, costo FOB, fecha arribo

**Adapters requeridos:**
- `SagProductionAdapter` — YA EXISTE (ProductionEvent sync completo)
- `ImportReceiptManualAdapter` — futuro, ingesta Excel/manual

**Modulos consumidores:** Produccion, Inventario, Control Comercial, Inteligencia
**Motores consumidores:** Production Signal Engine, Repurchase Engine (lead time), Age Engine

**Dependencias:** PRODUCT (referenceCode para materiales y productos terminados)
**Eventos emitidos:** `production.order_opened`, `production.entry_received`, `production.cycle_completed`

**Proyecciones derivadas:**
- ProductionCycleView (dias promedio por referencia)
- CostByReferenceView (costo MP acumulado por producto)
- PendingProductionView (OP abiertas sin ET)

**Riesgos:** Importaciones no disponibles en SAG; requiere modulo propio manual
**Criterio de completitud:** YA COMPLETO para produccion nacional. Importaciones = futuro modulo propio.

---

### 3.6 STORE OPERATIONS DOMAIN

**Proposito:** Gestionar la DISTRIBUCION de inventario hacia tiendas — cobertura, reglas, transferencias, surtido.

**Preguntas que responde:**
- La tienda cumple su nivel ideal?
- Que referencias estan criticas/agotadas?
- Que transferir y desde donde?
- Que regla aplica a cada producto/tienda?
- Hay sobreinventario?
- Que productos necesita la maleta del vendedor?
- Cuando ingreso un producto a esta tienda?

**Entidades canonicas:**
- `StoreProfile` — tienda con config (YA EXISTE como StoreLocation)
- `StorePolicyRule` — regla de cobertura (YA EXISTE)
- `StoreCoverageEvaluation` — resultado de evaluacion (YA EXISTE como output del engine)
- `StoreTransferProposal` — propuesta de transferencia (YA EXISTE)
- `StoreInventoryPosition` — inventario por tienda (PARCIAL — requiere multi-bodega)

**Fuentes SAG:**
- Inventario por bodega (ya para B01; bodegas-tienda confirmadas)
- MOVIMIENTOS por bodega-tienda (para fecha ingreso a tienda)

**Datos confirmados:** Reglas, evaluaciones, propuestas, mapeo bodega→tienda
**Gaps:** Inventario multi-tienda real, fecha ingreso por tienda, rotacion por tienda

**Adapters requeridos:**
- `SagStoreInventoryAdapter` — traduce inventario por bodega-tienda → StoreInventoryPosition
  (reutiliza SagInventoryAdapter con filtro de bodega)

**Modulos consumidores:** Tiendas, Maletas, Control Comercial
**Motores consumidores:** Coverage Engine, Rules Evidence Engine, Transfer Engine, Assortment Engine

**Dependencias:** PRODUCT (clasificacion), INVENTORY (posicion por bodega), SALES (rotacion por tienda)
**Eventos emitidos:** `store.coverage_changed`, `store.critical_shortage`, `store.transfer_proposed`

**Proyecciones derivadas:**
- StoreDashboardView (salud por tienda)
- CriticalShortageAlertView (referencias bajo minimo)
- TransferQueueView (propuestas pendientes de aprobacion)

**Riesgos:** Inventario multi-tienda depende de config correcta de bodega→tienda
**Criterio de completitud:** 4 tiendas con inventario real; Coverage Engine operando con datos confirmados

---

## 4. Contratos Canonicos

### 4.1 PRODUCT DOMAIN Contracts

```
ProductProfile {
  // Identificadores
  tenantId: string              // organizationId
  referenceCode: string         // PK canonico (k_sc_codigo_articulo)
  externalId?: string           // ka_nl_articulo (SAG internal PK)

  // Datos de negocio
  name: string                  // sc_detalle_articulo
  businessLine: string          // castillitos | latin_kids | accesorios_importacion
  productClass: string          // textile | accessory
  subgroup?: string             // pijama ll, bolso, etc.
  category?: string             // nina | nino | bebe | unisex
  sizeClass?: string            // small | medium | large
  commercialStatus: string      // active | discontinued | seasonal

  // Calidad
  dataConfidence: number        // 0-1
  source: string                // SAG | MANUAL | INFERRED
  lastSyncAt?: string           // ISO timestamp
  createdAt: string
}

ProductVariant {
  tenantId: string
  referenceCode: string         // FK → ProductProfile
  variantKey: string            // referenceCode + size + color (composite)
  size: string                  // ss_talla
  color: string                 // ss_color

  source: string
  lastSyncAt?: string
}

ProductPrice {
  tenantId: string
  referenceCode: string         // FK → ProductProfile
  priceType: string             // PV3_WHOLESALE | PV4_RETAIL | COST
  amount: number
  currency: string              // COP
  effectiveAt: string           // cuando se capturo/cambio
  source: string                // SAG_SNAPSHOT | INVOICE_DERIVED

  lastSyncAt?: string
}
```

### 4.2 INVENTORY DOMAIN Contracts

```
InventoryPosition {
  tenantId: string
  referenceCode: string         // FK → ProductProfile
  variantKey: string            // ref + size + color
  warehouseId: string           // ka_nl_bodega (internal PK)
  warehouseCode: string         // ss_codigo (display code)
  warehouseName: string         // descriptive

  availableQty: number
  reservedQty: number
  committedQty: number          // pedidos pendientes
  netAvailable: number          // available - reserved - committed

  snapshotAt: string            // ISO timestamp del snapshot
  source: string
  dataConfidence: number
}

InventoryMovement {
  tenantId: string
  movementId: string            // ka_nl_movimiento_item (idempotencia)
  referenceCode: string
  variantKey: string
  warehouseId: string

  direction: string             // ENTRY | EXIT
  movementType: string          // PRODUCTION_ENTRY | PURCHASE | TRANSFER_IN | SALE | RETURN | TRANSFER_OUT
  quantity: number
  documentDate: string          // d_fecha_documento
  documentId: string            // ka_nl_movimiento (header)
  documentType: string          // ET | FV | NV | NC | TRANSFER

  source: string
  lastSyncAt?: string
}

WarehouseProfile {
  tenantId: string
  warehouseId: string           // ka_nl_bodega
  warehouseCode: string         // ss_codigo
  name: string
  warehouseType: string         // MAIN | STORE | WIP | RAW_MATERIAL | VENDOR_SAMPLE
  storeId?: string              // si es tienda, FK → StoreProfile
  active: boolean
}
```

### 4.3 SALES DOMAIN Contracts

```
SalesDocument {
  tenantId: string
  documentId: string            // ka_nl_movimiento
  documentNumber: string        // n_numero_documento
  documentType: string          // INVOICE | REMISSION
  sourceType: string            // OFICIAL (F1) | REMISION (F2)

  customerNit: string
  sellerSlug: string
  storeSlug?: string
  channel: string               // DIRECT | DISTRIBUTOR | ONLINE
  saleDate: string
  amount: number                // total documento
  currency: string

  source: string
  lastSyncAt?: string
}

SaleLine {
  tenantId: string
  lineId: string                // ka_nl_movimiento_item (idempotencia)
  documentId: string            // FK → SalesDocument
  referenceCode: string         // FK → ProductProfile
  variantKey: string            // ref + size + color
  size: string
  color: string

  quantity: number              // unidades vendidas
  unitPrice: number             // precio unitario real
  lineTotal: number             // quantity * unitPrice
  warehouseId: string           // bodega de despacho

  documentDate: string          // heredado del header
  source: string
  dataConfidence: number        // 1.0 si qty+price confirmados
  lastSyncAt?: string
}

SalesReturn {
  tenantId: string
  returnId: string              // ka_nl_movimiento_item (NC)
  documentId: string            // header NC
  originalDocumentId?: string   // factura original (si SAG lo tiene)
  referenceCode: string
  variantKey: string
  size: string
  color: string

  quantity: number              // unidades devueltas (positivo)
  unitPrice: number
  returnDate: string
  reason?: string               // si SAG lo provee

  source: string
  lastSyncAt?: string
}
```

### 4.4 CUSTOMER DOMAIN Contracts

```
CustomerProfile {
  tenantId: string
  customerId: string            // Agentik internal ID
  nit: string                   // normalized
  name: string
  legalName?: string

  // Contacto
  phone?: string
  email?: string
  address?: string
  city?: string                 // DANE-resolved
  department?: string
  country: string               // default: CO

  // Clasificacion
  segment?: string              // A | B | C
  channel?: string
  sellerSlug?: string
  identityStatus: string        // CONFIRMED | NEEDS_REVIEW | DUPLICATE

  // Comportamiento (derivado)
  lastPurchaseAt?: string
  purchaseFrequencyDays?: number
  lifetimeValue?: number
  churnRisk?: string            // LOW | MEDIUM | HIGH

  // Trazabilidad
  erpId?: string                // sagTerceroId
  crmId?: string
  source: string
  lastSyncAt?: string
}

CustomerBranch {
  tenantId: string
  branchId: string
  customerId: string            // FK → CustomerProfile
  name: string
  address: string
  city?: string
  phone?: string
  isDefault: boolean
  active: boolean

  source: string
}

CustomerReceivable {
  tenantId: string
  receivableId: string
  customerId: string
  invoiceNumber: string
  originalAmount: number
  balanceDue: number
  invoiceDate: string
  dueDate: string
  daysOverdue: number
  agingBucket: string           // CURRENT | 30 | 60 | 90 | 120_PLUS
  status: string                // OPEN | PARTIALLY_PAID | PAID | WRITTEN_OFF

  source: string
  lastSyncAt?: string
}

VendorProfile {
  tenantId: string
  vendorId: string
  name: string
  slug: string
  zone?: string
  active: boolean
  assignedCustomerCount?: number

  source: string                // CRM | SAG | MANUAL
  lastSyncAt?: string
}
```

### 4.5 PURCHASING & IMPORT DOMAIN Contracts

```
ProductionOrder {
  tenantId: string
  orderId: string               // ka_nl_movimiento
  orderNumber: string
  referenceCode: string
  quantity: number
  orderDate: string
  status: string                // OPEN | IN_PROGRESS | COMPLETED | CANCELLED
  estimatedCompletionDate?: string

  source: string
  lastSyncAt?: string
}

ProductionEntry {
  tenantId: string
  entryId: string
  referenceCode: string
  variantKey: string
  quantity: number
  entryDate: string
  warehouseId: string
  linkedOrderId?: string        // via ss_remision

  source: string
  lastSyncAt?: string
}

ImportReceipt {
  tenantId: string
  receiptId: string
  referenceCode: string
  quantity: number
  supplierName?: string
  costFob?: number
  costNationalization?: number
  arrivalDate: string
  lotNumber?: string

  source: string                // MANUAL | EXCEL_IMPORT
  createdAt: string
}
```

### 4.6 STORE OPERATIONS DOMAIN Contracts

```
StoreProfile {
  tenantId: string
  storeId: string
  name: string
  warehouseId: string           // ka_nl_bodega (FK → WarehouseProfile)
  storeType: string             // OWNED | FRANCHISE | POP_UP
  city?: string
  status: string                // ACTIVE | PAUSED | CLOSED
  capacity?: number

  source: string
}

StoreCoverageRule {
  tenantId: string
  ruleId: string
  storeId: string
  scope: string                 // variant_override | class_size | line_subgroup | productClass | store
  productClass?: string
  sizeClass?: string
  line?: string
  subgroup?: string
  minQty: number
  idealQty: number
  maxQty: number
  coverageStrategy: string      // SIZE | SUBGROUP
  priority: number
  active: boolean
}
```

---

## 5. Ownership — Bounded Contexts

### Source of Truth (cada dato tiene UN dueno)

| Dato | Dominio dueno | Otros dominios lo usan como |
|---|---|---|
| Nombre/atributos del producto | PRODUCT | Read model |
| Talla, color, subgrupo | PRODUCT | Read model |
| Precio de lista (PV3/PV4) | PRODUCT | Read model |
| Stock actual por bodega | INVENTORY | Read model |
| Fecha primer ingreso | INVENTORY (derivado de movimientos) | Read model |
| Unidades vendidas | SALES | Read model |
| Precio unitario venta | SALES | Read model |
| Identidad del cliente | CUSTOMER | Read model |
| Cartera vencida | CUSTOMER | Read model |
| Vendedor asignado | CUSTOMER | Read model |
| Costo produccion | PURCHASING | Read model |
| Ciclo productivo | PURCHASING | Read model |
| Reglas de cobertura | STORE OPS | Exclusivo |
| Evaluacion cobertura | STORE OPS | Exclusivo |

### Proyecciones derivadas (no son source of truth)

| Proyeccion | Se calcula de | Vive en |
|---|---|---|
| Rotacion | SALES (unidades) + INVENTORY (ingreso) | Motor Rotation |
| Edad inventario | INVENTORY (fecha ingreso) + System (hoy) | Motor Age |
| CLV | SALES (historico) + CUSTOMER (periodo) | Motor Customer Intel |
| Frecuencia compra | SALES (fechas) | Motor Customer Intel |
| Performance vendedor | SALES (por seller) | Motor Sales Intel |
| Margen | SALES (precio venta) - PURCHASING (costo) | Motor Pricing |

### Lo que NO pertenece a cada dominio

| Dominio | NO incluye |
|---|---|
| PRODUCT | Stock actual (→ INVENTORY), precio de venta real (→ SALES) |
| INVENTORY | Reglas de cobertura (→ STORE OPS), costo (→ PURCHASING) |
| SALES | Inventario disponible (→ INVENTORY), datos contacto (→ CUSTOMER) |
| CUSTOMER | Lineas de factura (→ SALES), stock (→ INVENTORY) |
| PURCHASING | Stock actual (→ INVENTORY), precio venta (→ SALES) |
| STORE OPS | Inventario principal (→ INVENTORY), ventas globales (→ SALES) |

---

## 6. Dependencias entre Dominios

### Grafo de dependencias

```
PRODUCT ─────────────────────── Dominio raiz (sin dependencias)
   │
   ├──→ INVENTORY (obligatoria: referenceCode para identificar posiciones)
   │       │
   │       ├──→ STORE OPS (obligatoria: posicion por bodega-tienda)
   │       │
   │       └──→ ROTATION ENGINE (obligatoria: ingreso + posicion actual)
   │
   ├──→ SALES (obligatoria: referenceCode + variantKey)
   │       │
   │       ├──→ ROTATION ENGINE (obligatoria: unidades vendidas)
   │       │
   │       ├──→ REPURCHASE ENGINE (obligatoria: velocidad de salida)
   │       │
   │       └──→ MARKDOWN ENGINE (obligatoria: precio real + antiguedad)
   │
   └──→ PURCHASING (obligatoria: referenceCode para produccion)
           │
           └──→ AGE ENGINE (opcional: fecha ingreso ya en INVENTORY)

CUSTOMER ────────────────────── Dominio raiz (sin dependencias)
   │
   ├──→ SALES (enriquecimiento: customerNit para atribucion)
   │
   ├──→ ORDER VALIDATION (obligatoria: cartera antes de tomar pedido)
   │
   └──→ CUSTOMER INTELLIGENCE (obligatoria: comportamiento derivado)

STORE OPS ───────────────────── Depende de PRODUCT + INVENTORY
   │
   └──→ COVERAGE ENGINE (obligatoria: posicion + reglas)
         └──→ TRANSFER ENGINE (obligatoria: evaluacion de cobertura)
```

### Tipos de dependencia

| De → A | Tipo | Descripcion |
|---|---|---|
| INVENTORY → PRODUCT | Obligatoria | Necesita referenceCode para identificar |
| SALES → PRODUCT | Obligatoria | Necesita referenceCode + variantKey |
| SALES → CUSTOMER | Enriquecimiento | customerNit para atribuir ventas |
| STORE OPS → INVENTORY | Obligatoria | Posicion por bodega-tienda |
| STORE OPS → PRODUCT | Obligatoria | Clasificacion para reglas |
| STORE OPS → SALES | Opcional | Rotacion por tienda (V2) |
| PURCHASING → PRODUCT | Obligatoria | referenceCode de produccion |
| ROTATION → SALES + INVENTORY | Obligatoria | Vendido / Ingresado |
| REPURCHASE → ROTATION + INVENTORY | Obligatoria | Velocidad + stock + demanda |
| MARKDOWN → ROTATION + INVENTORY | Obligatoria | Antiguedad + rotacion baja |

### Verificacion de ciclos

```
PRODUCT → (nada)                    OK — no depende de nadie
CUSTOMER → (nada)                   OK — no depende de nadie
INVENTORY → PRODUCT                 OK — cadena lineal
SALES → PRODUCT, CUSTOMER          OK — dos raices
PURCHASING → PRODUCT                OK — cadena lineal
STORE OPS → PRODUCT, INVENTORY     OK — dos niveles lineales
```

**No existen ciclos.** Cada dominio puede construirse en orden topologico.

---

## 7. Mapeo a Motores

| Motor | Datos minimos | Datos deseables | Dominio fuente | Opera hoy? | Gap bloqueante |
|---|---|---|---|---|---|
| Coverage Engine | Posicion tienda + Reglas + Disponible origen | Rotacion por tienda, tendencia | STORE OPS + INVENTORY | SI (parcial) | Inventario multi-tienda real |
| Rules Evidence Engine | Reglas + evaluacion + discarded | Historico decisiones | STORE OPS | SI (completo) | — |
| Rotation Engine | Unidades vendidas + Unidades ingresadas + Periodo | Rotacion por variante, por tienda | SALES + INVENTORY | NO | SaleLine (GAP-01) |
| Repurchase Engine | Rotacion + Stock + Demanda + Lead time | Historico recompra, estacionalidad | SALES + INVENTORY + PURCHASING | NO | Rotation Engine (requiere SALES) |
| Markdown Engine | Antiguedad + Rotacion baja + Precio | Elasticidad, competencia | INVENTORY + SALES + PRODUCT | NO | SaleLine + Age Index |
| Transfer Engine | Evaluacion cobertura + Disponible origen | Costo logistico, prioridad | STORE OPS + INVENTORY | SI (parcial) | Multi-tienda completo |
| Production Signal Engine | PD pendientes + Disponible + OP abiertas | Tendencia demanda | INVENTORY + PURCHASING | SI (completo) | — |
| Customer Intelligence | Identidad + Cartera + Frecuencia + CLV | Segmentacion, churn | CUSTOMER + SALES | PARCIAL | lastPurchaseAt, frecuencia |
| Sales Intelligence | Ventas por vendedor/tienda/linea + Unidades | Precio promedio, tendencia | SALES + PRODUCT | PARCIAL | SaleLine (solo montos hoy) |
| Commercial Copilot | TODOS | TODOS + Knowledge Graph | TODOS | PARCIAL | Depende de cada motor |

---

## 8. Mapeo a Requerimientos de Castillitos

| # | Requerimiento | Dominio principal | Dominios secundarios | Motores | Datos faltantes | Etapa |
|---|---|---|---|---|---|---|
| 1 | Sucursales de clientes en pedidos | CUSTOMER | — | Order Creator | CustomerBranch (tabla SAG no confirmada) | Sprint 4 |
| 2 | Alerta de cartera vencida | CUSTOMER | — | Customer Intelligence | — (YA FUNCIONA) | Sprint 1 |
| 3 | Clientes con tres meses sin comprar (rotan fuera del ciclo) | CUSTOMER | SALES | Customer Intelligence | lastPurchaseAt population | Sprint 1 |
| 4 | Surtido automatico por tallas | STORE OPS | INVENTORY, PRODUCT | Coverage Engine | Inventario multi-tienda | Sprint 2 |
| 5 | Trazabilidad del pedido | SALES | CUSTOMER | Order-Invoice Match | SaleLine (lineas detalle) | Sprint 3 |
| 6 | Ventas por tienda | SALES | STORE OPS | Sales Intelligence | — (YA FUNCIONA por monto) | Sprint 1 |
| 7 | Ventas por vendedor | SALES | CUSTOMER | Sales Intelligence | — (YA FUNCIONA por monto) | Sprint 1 |
| 8 | Productos de baja rotacion | SALES | INVENTORY | Rotation Engine | SaleLine (unidades) | Sprint 3 |
| 9 | Descuentos por antiguedad | INVENTORY | SALES, PRODUCT | Markdown Engine | Fecha ingreso + rotacion | Sprint 4 |
| 10 | Fecha de ingreso a tienda | INVENTORY | STORE OPS | Age Engine | InventoryMovement por tienda | Sprint 4 |
| 11 | Productos que rotan en una tienda y en otra no (rotacion comparativa) | SALES | STORE OPS, INVENTORY | Rotation Engine | SaleLine por bodega-tienda | Sprint 3-4 |
| 12 | Datos completos de cliente | CUSTOMER | — | Customer Intelligence | Telefono, correo, direccion | Sprint 1 |
| 13 | Tallas y colores | PRODUCT | INVENTORY | Coverage Engine | — (YA EXISTE) | Sprint 1 |
| 14 | Canal de venta | SALES | — | Sales Intelligence | — (YA FUNCIONA) | Sprint 1 |
| 15 | Ventas historicas y 6 meses | SALES | — | Sales Intelligence | SaleLine (para unidades) | Sprint 3 |
| 16 | Alerta producto agotado a vendedores | INVENTORY | STORE OPS | Coverage Engine, Alerts | Multi-tienda + notificacion | Sprint 2 |
| 17 | Reglas por tamano | STORE OPS | PRODUCT | Coverage Engine | — (YA EXISTE) | Sprint 1 |
| 18 | Regla general 36 unidades | STORE OPS | PRODUCT | Coverage Engine | — (YA EXISTE) | Sprint 1 |
| 19 | Productos especiales por tienda | STORE OPS | PRODUCT | Coverage Engine | Regla scope variant_override | Sprint 2 |

### Resumen por etapa

| Etapa | Requerimientos resueltos | Nuevos | Ya funcionan |
|---|---|---|---|
| Sprint 1 | #2, #3, #6, #7, #12, #13, #14, #17, #18 | #3, #12 | #2, #6, #7, #13, #14, #17, #18 |
| Sprint 2 | #4, #16, #19 | #4, #16, #19 | — |
| Sprint 3 | #5, #8, #11 (parcial), #15 | #5, #8, #15 | — |
| Sprint 4 | #1, #9, #10, #11 (completo) | #1, #9, #10 | — |

---

## 9. Secuencia Propuesta

### Sprint 1: FOUNDATION — Product + Customer + Inventory Config

**Dominios:** PRODUCT (enrichment) + CUSTOMER (enrichment) + INVENTORY (multi-bodega config)
**Entidades:**
- ProductProfile (enriquecer subgrupo, clasificacion)
- CustomerProfile (enriquecer contacto, lastPurchaseAt)
- WarehouseProfile (configurar mapeo bodega→tienda)
- InventoryPosition (extender a 4 tiendas)

**Adapters:** Enriquecer SagCustomerAdapter + configurar SagInventoryAdapter multi-bodega
**Persistencia:** Enrichment sobre modelos existentes; WarehouseProfile como REFERENCE
**Consumidores:** Clientes 360, Coverage Engine, Control Comercial
**Requerimientos resueltos:** #2, #3, #6, #7, #12, #13, #14, #17, #18
**Motores desbloqueados:** Coverage Engine (100%), Customer Intelligence (parcial)
**Riesgos:** Campos contacto vacios; config bodega→tienda requiere validacion
**Criterio de exito:** Coverage Engine opera con 4 tiendas reales; lastPurchaseAt en 100% clientes

---

### Sprint 2: STORE OPERATIONS — Cobertura Real + Alertas

**Dominios:** STORE OPS (completo) + INVENTORY (alertas)
**Entidades:**
- StoreInventoryPosition (posicion real por tienda)
- StoreCoverageRule (reglas por tienda — ya existen, solo confirmar)
- StoreTransferProposal (ya existe)
- DepletionAlert (nueva proyeccion)

**Adapters:** SagStoreInventoryAdapter (inventario por bodega-tienda)
**Persistencia:** StoreInventoryPosition como SNAPSHOT; alertas como EVENT
**Consumidores:** Tiendas, Maletas, Vendedores (alertas)
**Requerimientos resueltos:** #4, #16, #19
**Motores desbloqueados:** Coverage Engine (completo), Transfer Engine (completo)
**Riesgos:** Volumen de variantes por tienda; frecuencia de actualizacion
**Criterio de exito:** Surtido automatico operativo; alertas de agotado llegan a vendedores

---

### Sprint 3: SALES — Unidades + Precios + Rotacion

**Dominios:** SALES (SaleLine + SalesReturn)
**Entidades:**
- SaleLine (MOVIMIENTOS_ITEMS FV/NV)
- SalesReturn (MOVIMIENTOS_ITEMS NC)
- SalesDocument enrichment (ya existe como SaleRecord)

**Adapters:** SagSaleLineAdapter + SagReturnAdapter
**Persistencia:** SaleLine como TRANSACTIONAL; ReturnRate como DERIVED
**Consumidores:** Control Comercial, Vendedores 360, Inventario, Inteligencia
**Requerimientos resueltos:** #5, #8, #11 (parcial), #15
**Motores desbloqueados:** Rotation Engine, Sales Intelligence (completa), Pricing Engine (base)
**Riesgos:** Volumen 50-100K lineas; fuente FV/NV requiere confirmacion; n_valor_unitario
**Criterio de exito:** >10K lineas synced; rotacion calculable por referencia/mes

---

### Sprint 4: TEMPORAL + DECISIONS — Edad + Rotacion Cruzada + Markdown

**Dominios:** INVENTORY (movimientos temporales) + motores derivados
**Entidades:**
- InventoryMovement (entradas historicas para edad)
- InventoryAgeIndex (fecha primer ingreso — derivado)
- RotationMetric (vendido/ingresado — derivado)

**Adapters:** Reutiliza SagMovementAdapter (entradas de ET ya synced)
**Persistencia:** InventoryAgeIndex como DERIVED; RotationMetric como DERIVED
**Consumidores:** Markdown Engine, Repurchase Engine, Inteligencia
**Requerimientos resueltos:** #1 (si SAG tiene sucursales), #9, #10, #11 (completo)
**Motores desbloqueados:** Markdown Engine, Repurchase Engine, Age Engine
**Riesgos:** Fecha ingreso solo via ET (no cubre importaciones directas)
**Criterio de exito:** Edad calculada para >80% refs; rotacion cruzada entre tiendas operativa

---

### Sprint 5 (opcional): ENRICHMENT — Importaciones + Snapshots + Sucursales

**Dominios:** PURCHASING (importaciones manual) + PRODUCT (precio historico) + CUSTOMER (sucursales)
**Entidades:**
- ImportReceipt (modulo propio, ingesta manual/Excel)
- ProductPriceSnapshot (cron semanal PV3/PV4)
- CustomerBranch (si SAG tiene tabla — requiere discovery)

**Adapters:** ImportReceiptManualAdapter + PriceSnapshotCronAdapter
**Persistencia:** ImportReceipt como TRANSACTIONAL; PriceSnapshot como SNAPSHOT
**Consumidores:** Importaciones (futuro), Pricing Engine, Pedidos
**Requerimientos resueltos:** #1 (completo si sucursales existen)
**Motores desbloqueados:** Pricing Engine (historico), Import Intelligence
**Riesgos:** Importaciones = modulo nuevo completo; sucursales pueden no existir en SAG
**Criterio de exito:** Snapshot semanal operativo; al menos 1 importacion registrada manual

---

## 10. Estrategia de Persistencia

| Entidad | Tipo | Razon |
|---|---|---|
| ProductProfile | REFERENCE | Cambia poco; fuente de verdad estable |
| ProductVariant | REFERENCE | Estable; creacion es rara |
| ProductPrice | SNAPSHOT | Valor actual + capturas periodicas |
| InventoryPosition | SNAPSHOT | Cambia frecuentemente; se sobreescribe |
| InventoryMovement | EVENT | Historico inmutable; nunca se borra |
| InventoryAgeIndex | DERIVED | Calculado de movimientos; se refresca |
| SalesDocument | TRANSACTIONAL | Registro inmutable de venta |
| SaleLine | TRANSACTIONAL | Registro inmutable de linea |
| SalesReturn | TRANSACTIONAL | Registro inmutable de devolucion |
| CustomerProfile | REFERENCE | Identidad estable; se enriquece |
| CustomerBranch | REFERENCE | Sucursales estables |
| CustomerReceivable | SNAPSHOT | Saldo cambia con pagos |
| VendorProfile | REFERENCE | Estable |
| ProductionOrder | TRANSACTIONAL | Evento de negocio |
| ProductionEntry | EVENT | Inmutable |
| ImportReceipt | TRANSACTIONAL | Registro manual inmutable |
| StoreProfile | REFERENCE | Configuracion estable |
| StoreCoverageRule | REFERENCE | Config editable |
| StoreInventoryPosition | SNAPSHOT | Se refresca con cada sync |
| RotationMetric | DERIVED | Calculado periodicamente |
| CustomerBehavior | DERIVED | CLV, frecuencia — recalculado |

### Read-through vs Persist

| Estrategia | Entidades |
|---|---|
| **Siempre persistir** | SaleLine, SalesReturn, InventoryMovement, ProductionEntry |
| **Persistir como snapshot** | InventoryPosition, CustomerReceivable, StoreInventoryPosition, ProductPrice |
| **Calcular on-demand** | RotationMetric (cache 1h), CustomerBehavior (cache 24h) |
| **Persistir + refrescar** | ProductProfile (sync diario), CustomerProfile (sync diario) |

---

## 11. Frescura y Tiempo Real

| Dominio | Entidad | SLA ideal | Metodo | Fallback |
|---|---|---|---|---|
| PRODUCT | ProductProfile | Diario | Sync batch nocturno | Ultimo snapshot |
| PRODUCT | ProductPrice | Semanal (snapshot) | Cron semanal | Ultimo snapshot |
| INVENTORY | InventoryPosition | 15 min | Polling incremental | Snapshot <1h |
| INVENTORY | InventoryMovement | 30 min | Incremental por fecha | Batch diario |
| SALES | SaleLine | 30 min | Incremental por fecha doc | Batch diario |
| SALES | SalesReturn | Diario | Batch (volumen bajo) | Ultimo sync |
| CUSTOMER | CustomerProfile | Diario | CRM sync + SAG enrich | Ultimo sync |
| CUSTOMER | CustomerReceivable | 1h (antes de pedido) | On-demand + periodic | Snapshot <24h |
| PURCHASING | ProductionOrder | Diario | Batch | Ultimo sync |
| STORE OPS | StoreInventoryPosition | 15 min (ideal) | Derivado de INVENTORY | Snapshot <1h |

### Categorias de frescura

| Categoria | Definicion | Dominios |
|---|---|---|
| Near-real-time (5-15 min) | Polling con delta check | INVENTORY positions |
| Periodic (15-60 min) | Incremental sync by date | SALES lines, INVENTORY movements |
| Daily batch | Full sync nocturno | PRODUCT, CUSTOMER enrichment, PURCHASING |
| On-demand | Trigger manual o pre-operacion | CUSTOMER receivables (antes de pedido) |
| Weekly snapshot | Cron para datos que cambian poco | ProductPrice (PV3/PV4 capture) |

**Regla:** Nunca afirmar "tiempo real" porque SAG PYA SOAP no soporta webhooks ni push.
El mejor SLA alcanzable es near-real-time via polling cada 5-15 minutos.

---

## 12. Estrategia de Adapters

### Arquitectura

```
┌─────────────────────────────────────────────┐
│          MOTORES / MÓDULOS / UI              │
│    (solo importan contratos canonicos)       │
├─────────────────────────────────────────────┤
│       DOMAIN CONTRACTS (lib/comercial/       │
│         domains/{domain}/contracts.ts)       │
├─────────────────────────────────────────────┤
│         ADAPTER LAYER                        │
│    (traduce fuente → contrato canonico)      │
├─────────────────────────────────────────────┤
│         ERP / CRM / MANUAL                   │
│    (SAG PYA, SuiteCRM V8, Excel, UI)        │
└─────────────────────────────────────────────┘
```

### Naming convention

```
lib/comercial/domains/
├── product/
│   ├── contracts.ts              // ProductProfile, ProductVariant, ProductPrice
│   ├── adapters/
│   │   ├── sag-product-adapter.ts
│   │   └── manual-product-adapter.ts
│   └── projections/
│       └── product-catalog-view.ts
├── inventory/
│   ├── contracts.ts
│   ├── adapters/
│   │   └── sag-inventory-adapter.ts
│   └── projections/
│       ├── age-index.ts
│       └── depletion-alerts.ts
├── sales/
│   ├── contracts.ts
│   ├── adapters/
│   │   ├── sag-sale-line-adapter.ts
│   │   └── sag-return-adapter.ts
│   └── projections/
│       ├── rotation-by-reference.ts
│       └── revenue-by-variant.ts
├── customer/
│   ├── contracts.ts
│   ├── adapters/
│   │   ├── sag-customer-adapter.ts
│   │   ├── crm-customer-adapter.ts
│   │   └── sag-branch-adapter.ts
│   └── projections/
│       ├── customer-health.ts
│       └── churn-risk.ts
├── purchasing/
│   ├── contracts.ts
│   ├── adapters/
│   │   ├── sag-production-adapter.ts
│   │   └── manual-import-adapter.ts
│   └── projections/
│       └── production-cycle.ts
└── store-ops/
    ├── contracts.ts
    ├── adapters/
    │   └── sag-store-inventory-adapter.ts
    └── projections/
        ├── store-dashboard.ts
        └── transfer-queue.ts
```

### Adapter contract interface

```typescript
interface DomainAdapter<TCanonical> {
  readonly source: string;           // "SAG_PYA" | "SUITECRM_V8" | "MANUAL"
  readonly domain: string;           // "product" | "inventory" | "sales" | ...
  readonly entity: string;           // "ProductProfile" | "SaleLine" | ...

  pull(params: AdapterPullParams): Promise<AdapterResult<TCanonical>>;
  pullIncremental?(since: Date): Promise<AdapterResult<TCanonical>>;

  // Metadata
  getDataQuality(): DataQualityReport;
  getLastSyncAt(): Date | null;
}

interface AdapterPullParams {
  tenantId: string;
  since?: Date;                      // incremental
  limit?: number;                    // pagination
  cursor?: string;                   // pagination
}

interface AdapterResult<T> {
  records: T[];
  metadata: {
    totalFetched: number;
    hasMore: boolean;
    cursor?: string;
    syncedAt: string;
    source: string;
    dataQuality: number;             // 0-1
  };
  errors: AdapterError[];
}

interface AdapterError {
  recordId?: string;
  field?: string;
  message: string;
  severity: "WARNING" | "ERROR" | "FATAL";
}
```

### Principios de adapters

| Principio | Regla |
|---|---|
| Idempotencia | Cada record tiene un naturalKey; re-pull = upsert, no duplicado |
| Normalizacion | NIT → strip dots/dashes; city → DANE code; dates → ISO UTC |
| Data quality | Cada campo tiene confidence (0-1); missing = null, not empty string |
| Error isolation | Un record con error no bloquea el batch; se reporta en errors[] |
| Paginacion | Cursor-based para SAG (SOAP); limit+offset para CRM (REST) |
| Incremental | Siempre que sea posible: filter by d_fecha_documento >= since |
| Fallback | Si la fuente falla, retornar ultimo snapshot + metadata.stale = true |
| No business logic | Adapter solo traduce; nunca calcula rotacion, cobertura, o alertas |

---

## 13. Knowledge Graph

### Relaciones canonicas entre entidades

```
Product ──HAS_VARIANT──→ ProductVariant
Product ──HAS_PRICE──→ ProductPrice
Product ──CLASSIFIED_AS──→ ProductClassification

ProductVariant ──HAS_POSITION──→ InventoryPosition
InventoryPosition ──LOCATED_IN──→ Warehouse
Warehouse ──IS_STORE──→ StoreProfile

Product ──SOLD_AS──→ SaleLine
SaleLine ──BELONGS_TO──→ SalesDocument
SalesDocument ──SOLD_TO──→ Customer
SalesDocument ──SOLD_BY──→ Vendor
SalesDocument ──ORIGINATED_AT──→ StoreProfile

Customer ──HAS_BRANCH──→ CustomerBranch
Customer ──OWES──→ CustomerReceivable
Customer ──ASSIGNED_TO──→ Vendor
Customer ──BOUGHT──→ Product (via SalesDocument)

Product ──PRODUCED_VIA──→ ProductionOrder
ProductionOrder ──RESULTED_IN──→ ProductionEntry
ProductionEntry ──ENTERED_AT──→ Warehouse

Product ──IMPORTED_VIA──→ ImportReceipt (futuro)

StoreProfile ──GOVERNED_BY──→ StoreCoverageRule
StoreCoverageRule ──APPLIES_TO──→ Product (via classification match)
```

### Preguntas que el Knowledge Graph puede resolver

| Pregunta | Camino en el grafo |
|---|---|
| Que vendio el vendedor X este mes? | Vendor → SOLD_BY ← SalesDocument → SaleLine → Product |
| Cuanto inventario hay en tienda Y? | StoreProfile → IS_STORE ← Warehouse → LOCATED_IN ← InventoryPosition |
| Que clientes compran producto Z? | Product → SOLD_AS → SaleLine → BELONGS_TO → SalesDocument → SOLD_TO → Customer |
| Cuanto tardo en producirse referencia R? | Product → PRODUCED_VIA → ProductionOrder ... ProductionEntry (diff fechas) |
| Que tienda necesita surtido de P? | Product → HAS_POSITION ← StoreProfile → GOVERNED_BY → StoreCoverageRule (evaluar gap) |
| Cual es el margen de referencia X? | Product → SOLD_AS → SaleLine.unitPrice MINUS Product → PRODUCED_VIA → ProductionOrder.unitCost |

### Copilot integration

El Copilot (David) navega el Knowledge Graph para responder preguntas complejas:
1. Parsea la pregunta en entidades y relaciones
2. Identifica el camino mas corto en el grafo
3. Ejecuta queries por dominio (no queries ad-hoc)
4. Compone la respuesta con evidencia de cada nodo visitado

---

## 14. Riesgos

| Riesgo | Probabilidad | Impacto | Mitigacion | Dominio afectado |
|---|---|---|---|---|
| SAG no tiene tabla SUCURSALES | Alta | Bajo | CustomerBranch como config manual | CUSTOMER |
| n_valor_unitario no existe en MOVIMIENTOS_ITEMS | Media | Alto | Derivar de n_valor / n_cantidad | SALES |
| Volumen de SaleLines satura sync | Media | Medio | Incremental estricto; batch de 1000 | SALES |
| Subgrupo inferido incorrectamente | Media | Medio | Override manual; data quality flag | PRODUCT |
| Inventario por tienda desactualizado | Baja | Alto | SLA 15 min; alerta de stale | INVENTORY |
| Fuente FV ambigua (1 vs 2) | Media | Alto | Confirmar con FUENTES antes de Sprint 3 | SALES |
| Motores derivados consumen datos incompletos | Media | Medio | Confidence score; no operar bajo umbral | TODOS |
| Importaciones no modelables automaticamente | Confirmado | Medio | Modulo manual desde Sprint 5 | PURCHASING |
| Config bodega→tienda incorrecta | Baja | Alto | Validacion con datos reales + override | STORE OPS |

---

## 15. Decision Final

### Dominios oficiales del Commercial Data Layer

```
1. PRODUCT DOMAIN        — Que vendemos (catalogo, variantes, precios, clasificacion)
2. INVENTORY DOMAIN      — Cuanto tenemos y donde (posiciones, movimientos, edad)
3. SALES DOMAIN          — Que vendimos (documentos, lineas, devoluciones, atribuciones)
4. CUSTOMER DOMAIN       — A quien vendemos (identidad, contacto, cartera, vendedores)
5. PURCHASING DOMAIN     — Como entra mercancia (produccion, importaciones, costos)
6. STORE OPS DOMAIN      — Como distribuimos (cobertura, reglas, transferencias, alertas)
```

### Orden de construccion

```
Sprint 1: PRODUCT + CUSTOMER + INVENTORY (foundation enrichment)
           → 9 de 19 requerimientos, motores existentes activados

Sprint 2: STORE OPS (cobertura real + alertas)
           → 3 requerimientos nuevos, Coverage + Transfer completos

Sprint 3: SALES (lineas + devoluciones)
           → 3-4 requerimientos, Rotation + Sales Intel desbloqueados

Sprint 4: INVENTORY temporal + motores derivados
           → 3-4 requerimientos, Markdown + Repurchase + Age desbloqueados

Sprint 5: PURCHASING enrichment + CUSTOMER branches (opcional)
           → Ultimos requerimientos, completitud
```

### Principio rector

**"Un dominio no es una tabla sincronizada. Es una capacidad de negocio completa que responde preguntas y alimenta decisiones."**

Cada sprint entrega un dominio operativo — no datos inertes esperando consumidor.
