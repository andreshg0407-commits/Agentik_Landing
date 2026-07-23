# AGENTIK-ORDERS-AND-CUSTOMERS-AUDIT-01

**Sprint:** Pedidos & Clientes — Auditoria Integral Pre-Implementacion
**Tenant:** Castillitos
**Fecha:** 2026-07-22
**Modo:** READ-ONLY — cero cambios de codigo

---

## 1. Resumen ejecutivo

El modulo de Pedidos de Castillitos es el modulo comercial mas avanzado del sistema. Tiene arquitectura empresarial completa con 43+ archivos en `lib/comercial/pedidos/`, un wizard matricial funcional, 6 rutas API con ~28 acciones, un decision engine con Policy Packs, reservas operacionales, y un pipeline de seller resolution de dos estrategias. Sin embargo, **el puente SAG de escritura es un stub** — los pedidos se crean y gestionan internamente pero nunca se sincronizan a SAG.

**Estado funcional:**
- Creacion/edicion de pedidos: FUNCIONAL (via AgentExecution store)
- Busqueda de productos con inventario: FUNCIONAL (PIL + reservedQty)
- Busqueda de clientes: FUNCIONAL (CustomerProfile + AgentExecution fallback)
- Auto-distribucion por tallas: IMPLEMENTADO (decision engine)
- Reservas operacionales: HOOKS LIVE (Prisma model + lifecycle hooks)
- Resolucion de vendedor: IMPLEMENTADO (SAG MOVIMIENTOS 92% + CRM fallback 60%)
- Envio a SAG: STUB (siempre retorna SAG_NOT_CONNECTED)
- PDF de pedido: FUNCIONAL
- Importacion desde SAG: IMPLEMENTADO (import_single, import_batch, fetch_pending)

**Brechas criticas:**
1. SAG write bridge no funcional — pedidos nunca llegan a SAG
2. Sucursal/branch no existe como dimension en CustomerProfile ni en ordenes
3. Direccion (address) nunca se escribe a CustomerProfile pese a existir en SAG
4. Ciudad/departamento solo viene de CRM — SAG suprimido por FKs irresolubles
5. 15 de 20 campos SAG TERCEROS no se mapean a CustomerProfile
6. No existe wizard de detal — solo mayorista

---

## 2. Inventario de archivos del modulo Pedidos

### lib/comercial/pedidos/ (18 archivos core)

| Archivo | Lineas | Funcion |
|---|---|---|
| `order-service.ts` | ~56KB | Persistencia via AgentExecution. CRUD completo. searchCustomers(). |
| `order-types.ts` | 200 | Modelo de dominio. 5 estados + syncState dual. |
| `order-core-types.ts` | 491 | Arquitectura empresarial. OrderDraft, OrderHeader, OrderLine. |
| `order-product-types.ts` | 222 | Tipos de busqueda de productos. Variantes, stock states. |
| `order-product-search.ts` | ~200 | Busqueda PIL con Math.max(0, qty - reservedQty). |
| `order-decision-engine.ts` | ~700 | 4 evaluadores: duplicados, auto-size, validation, batch. |
| `order-decision-types.ts` | ~100 | Tipos del decision engine. |
| `order-policy-pack.ts` | ~100 | Registro de 4 politicas en Policy Pack. |
| `order-policy-pack-config.ts` | ~80 | Umbrales: stock thresholds, line minimums, size distribution. |
| `order-inventory-service.ts` | ~150 | Consulta PIL con reservedQty. Formula canonica. |
| `order-lifecycle-hooks.ts` | ~220 | Hooks reales: reservation consume/release en Prisma. |
| `order-sag-bridge.ts` | 212 | Write queue bridge. Colas de escritura SAG. |
| `sag-order-sync-service.ts` | 161 | STUB. buildSagOrderPayload() real, sendOrderToSag() retorna SAG_NOT_CONNECTED. |
| `seller-resolution-service.ts` | ~300 | 2 estrategias: SAG MOVIMIENTOS (92%, high) + CRM quotes (60% threshold). |
| `wholesale-order-wizard.tsx` | 1697+ | Wizard matricial. 3 pasos: cliente → productos → resumen. |
| `order-alerts.ts` | ~80 | Generacion de alertas. |
| `order-alert-builder.ts` | ~60 | Builder de alertas. |
| `pedidos-client.tsx` | ~800 | Client component principal. Lista + drawer + wizard dispatch. |

### Rutas API (6 archivos, ~28 acciones)

| Ruta | Acciones |
|---|---|
| `comercial/pedidos/route.ts` | create, delete_draft, list, get, update_draft, update_line, submit, mark_pending_sag, mark_synced, mark_conflict, cancel, return_to_draft, check_duplicate, stats, send_to_sag, list_sellers, search_customers |
| `comercial/pedidos/history/route.ts` | customer, seller, commercial_intelligence, variant_metrics, seller_resolution, seller_performance |
| `comercial/pedidos/products/route.ts` | search, variants, availability |
| `comercial/pedidos/pdf/route.ts` | Genera y streama PDF binario |
| `comercial/pedidos/import/route.ts` | import_single, import_batch, fetch_pending |
| `comercial/pedidos/sync-lines/route.ts` | Sync CRM quote lines (CRMQuoteLine) |

### Archivos relacionados fuera de pedidos/

| Archivo | Funcion |
|---|---|
| `lib/comercial/orders/operational-order-lifecycle.ts` | Contrato operacional. 8 estados con transiciones enforced. |
| `lib/comercial/orders/order-inventory-service.ts` | Consulta PIL canonica. |
| `lib/comercial/pedidos/order-product-search.ts` | Fan-out ProductEntity + ProductVariant + PIL. |
| `lib/connectors/adapters/sag-pya-soap/mappers.ts` | mapSagCustomer(), mapSagOrder(). |
| `lib/connectors/adapters/sag-pya-soap/query-catalog.ts` | Queries SAG TERCEROS, MOVIMIENTOS. |
| `lib/connectors/adapters/sag-pya-soap/storage.ts` | customerProfileStorage.upsertMany(). |

---

## 3. Modelo de datos de pedido (OrderDraft)

```
OrderDraft (persisted as AgentExecution.metadataJson)
  header: OrderHeader
    customerId:    string    // NIT del cliente
    customerName:  string
    customerCode:  string    // sagCode / erpId
    channel:       string    // "" (no implementado como selector)
    sellerName:    string | null
    sellerCode:    string | null
    notes:         string
    paymentTerms:  string | null
    discount:      number | null
    orderDate:     string    // ISO date
    externalSyncKey: string | null  // SAG document reference
  lines: OrderLine[]
    referenceCode: string
    productName:   string
    size:          string
    color:         string
    quantity:      number
    unitPrice:     number
    availableUnits: number | null  // null = not synced, show "—"
    lineTotal:     number
  status:    OrderStatus    // borrador | listo_para_enviar | pendiente_sag | sincronizado | conflicto | cancelado
  syncState: OrderSyncState // nunca_sincronizado | sincronizado | error_sincronizacion
```

**Persistencia:** Los pedidos NO tienen tabla Prisma propia. Se persisten como `AgentExecution` con `operation: "COMERCIAL_ORDER_DRAFT"` y el draft completo en `metadataJson`. Esto permite iteracion rapida pero sacrifica queries SQL directas.

---

## 4. Maquina de estados del pedido

### Estados internos (order-types.ts)

```
borrador → listo_para_enviar → pendiente_sag → sincronizado
                                              → conflicto
         → cancelado (desde cualquier estado)
```

### Contrato operacional (operational-order-lifecycle.ts)

```
draft → reserved → confirmed → sent_to_sag → processing → fulfilled → returned
     ↓           ↓           ↓             ↓            ↓
   cancelled  cancelled   cancelled     cancelled    cancelled
```

Transiciones enforced via `ORDER_TRANSITIONS` map + `isValidOrderTransition()`.

### Mapeo a documentos SAG

| Estado Agentik | Documento SAG |
|---|---|
| draft / reserved / confirmed | Sin documento |
| sent_to_sag / processing | PD (Pedido) |
| fulfilled | F1/F2 (Factura) |
| returned | NC (Nota Credito) |

### Razones de cancelacion (OrderCancelReason)

`vendor_request | inventory_depleted | coordinator_reject | sag_rejection | expired | duplicate | other`

---

## 5. Pipeline de busqueda de productos

**Archivo:** `order-product-search.ts`

El wizard busca productos con un fan-out de 3 fuentes:

1. **ProductEntity** — catalogo base (nombre, referencia, linea, precio)
2. **ProductVariant + ProductInventoryLevel** — variantes con stock real
   - Formula canonica: `available = Math.max(0, quantity - reservedQty)`
   - Batch query por productIds
3. **CRMQuoteLine** — fallback para enriquecimiento de talla/color/precio cuando variantes no existen

### Umbrales de stock (order-policy-pack-config.ts)

| Estado | Condicion |
|---|---|
| `high` | >= 20 unidades |
| `medium` | >= 5 unidades |
| `low` | > 0 unidades |
| `out` | = 0 unidades |
| `last_units` | <= 10 unidades |

### Minimos por linea

| Linea | Minimo |
|---|---|
| LT (textil) | 30 unidades |
| CS (calzado) | 20 unidades |

---

## 6. Wizard de pedido mayorista

**Archivo:** `wholesale-order-wizard.tsx` (1697+ lineas)

### Flujo de 3 pasos

1. **Cliente** — Busqueda con debounce 250ms → CustomerProfile + AgentExecution fallback. Muestra NIT, nombre, ciudad, ultimo pedido. Flag `missingSagCode` si no tiene erpId.
2. **Productos** — Busqueda por referencia/nombre → grilla matricial talla×color con stock disponible por celda. `MatrixCell.available: number | null` directo de PIL.
3. **Resumen** — Revision de lineas, notas, descuento, generacion de PDF. Submit → crea AgentExecution.

### Interaccion con inventario

- Cada celda de la matriz muestra unidades disponibles
- Colores de semaforo segun umbrales de stock
- `isProductSellable()` y `getCommercialStockState()` determinan estado visual
- Productos con `variantCount === 0` son no-vendibles

### Limitaciones actuales

- Solo existe wizard mayorista — no hay wizard detal/POS
- Campo `channel` existe en OrderHeader pero no tiene selector UI
- No hay validacion de credito del cliente
- No hay calculo de descuento por volumen automatico

---

## 7. Auto-distribucion por tallas

**Archivo:** `order-decision-engine.ts` lineas 227-356

**Funcion:** `evaluateAutoSizeDistribution(referenceCode, productName, requestedUnits, sizeInventory, config)`

### Algoritmo (dos fases)

1. **Fase 1:** Floor-divide unidades solicitadas equitativamente entre todas las tallas con stock
2. **Fase 2:** Round-robin del residuo a tallas ordenadas por disponibilidad descendente

### Configuracion (CASTILLITOS_AUTO_SIZE_DISTRIBUTION)

| Parametro | Valor |
|---|---|
| maxUnitsPerSize | 50 |
| minSizesForBalance | 3 |
| redistributeOnMissing | true |

### Resultado (AutoSizeDistributionResult)

```typescript
{
  distribution: SizeDistributionEntry[]  // { size, allocated, available }
  balanced: boolean
  totalAllocated: number
  unallocated: number
}
```

### Relacion con Maletas

Maletas tiene un sistema paralelo de assortment (`MalletAssortmentEvaluationInput` → `MalletAssortmentSuggestion`) que opera a nivel subgrupo. Estructuralmente identico pero granularidad diferente. El patron de `suggestedQty + availableUnits + reason + confidence` es reutilizable.

Tiendas tiene su propio template de size curve (`sizeDistribution: {S: 0.15, M: 0.30, L: 0.30, XL: 0.25}`) en `store-policy-template-registry.ts` — porcentajes target por talla.

---

## 8. Reservas operacionales

### Modelo Prisma

`OperationalReservation` — modelo existente en Prisma.

### Flujo

```
draft → POST /api/.../operational-inventory/reservations → reserved
reserved → PATCH action:"release" → cancelled
reserved → PATCH action:"consume" → sent_to_sag
```

### Hooks en vivo (order-lifecycle-hooks.ts)

Los hooks son **reales** — ejecutan `prisma.operationalReservation.updateMany()`:
- SAG SUCCESS → reservations marcadas `consumed`
- SAG FAILED/REJECTED → reservations marcadas `released`

### Uso de reservedQty

`ProductInventoryLevel.reservedQty` se usa en 5+ archivos:
- `order-inventory-service.ts` — formula canonica
- `order-product-search.ts` — busqueda de productos
- `maletas-sag-adapter.ts` — disponible para maletas
- `vendor-sample-loader.ts` — coverage B24
- `tiendas/sag-store-adapter.ts` — inventario de tiendas
- `sales-portfolio/search-operational-inventory.ts` — busqueda operacional

---

## 9. Puente SAG de escritura (sag-order-sync-service.ts)

### Estado: STUB — V1, no funcional

| Funcion | Estado |
|---|---|
| `buildSagOrderPayload(order)` | IMPLEMENTADO — convierte OrderDraft a SagOrderPayload |
| `canSendToSag(order)` | IMPLEMENTADO — valida status, customerCode, externalSyncKey |
| `sendOrderToSag()` | STUB — siempre retorna `SAG_NOT_CONNECTED` |
| `getSagOrderStatus()` | STUB — siempre retorna `remoteStatus: "unknown"` |
| `normalizeSagOrderResponse()` | IMPLEMENTADO — mapea respuesta SAG cruda |

**Lo que falta para activar:**
1. Obtener conexion SAG del connector config
2. Implementar POST del payload al endpoint SOAP de creacion de pedidos SAG
3. Mapear respuesta SAG a `SagOrderSyncResult`
4. Wiring del lifecycle hook para actualizar syncState

---

## 10. Resolucion de vendedor

**Archivo:** `seller-resolution-service.ts`

### Cascada de 2 estrategias

**Estrategia 1 — SAG MOVIMIENTOS (confianza HIGH)**
- Consulta `MOVIMIENTOS.ka_nl_tercero_vend` para el pedido especifico
- Resuelve nombre via `TERCEROS.sc_nombre` por ka_nl_tercero
- Cache 10 minutos
- Cobertura: 92% de pedidos PD en 2026, ~0% en 2023-2025, ~99% en 2020-2021

**Estrategia 2 — CRM Quote History (confianza MEDIUM/LOW)**
- Agrupa CRMQuote por customer, elige seller con mas cotizaciones
- Confianza = (primaryCount / total) * 100
- Umbral: 60% (`CRM_CONFIDENCE_THRESHOLD`)
- >= 80% → MEDIUM, 60-79% → LOW
- Filtra "Administrator" como seller name
- Cache 10 minutos

**Estrategia 3 — null**
- Si ninguna resuelve: `sellerName: null, source: "none", confidence: "unknown"`

### Cobertura actual

| Dato | Cobertura |
|---|---|
| SAG MOVIMIENTOS 2026 | 92% |
| SAG MOVIMIENTOS 2023-2025 | ~0% |
| CustomerProfile.sellerName | 46/33k (0.14%) — no util |
| CRM assigned_user_name | Solo perfiles con CRM sync |

---

## 11. Por que no aparece el vendedor en pedidos historicos

### Diagnostico

El vendedor NO aparece en pedidos historicos porque:

1. **SAG MOVIMIENTOS** tiene el campo `ka_nl_tercero_vend` (FK al vendedor) pero solo esta poblado en ~92% de pedidos 2026 y ~0% en 2023-2025
2. **mapSagOrder()** en `mappers.ts` **no mapea ningun campo de vendedor** — el mapper de ordenes omite completamente el vendedor
3. **CustomerOrderRecord** (modelo Prisma para ordenes sincronizadas) tiene campos `vendedorSag` y `sucursalSag` definidos en el schema pero **nunca se escriben** durante el sync
4. **TERCEROS.VENDEDOR** es el vendedor asignado al *cliente*, no al *pedido*. Son conceptos diferentes. Este campo tampoco se sincroniza.

### Flujo actual de sync de ordenes

```
SAG MOVIMIENTOS (k_n_clase_fuente=4, sc_cobrar_pagar='C', code='PD')
  → mapSagOrder()  [NO mapea vendedor]
  → CustomerOrderRecord.create()  [vendedorSag queda null]
```

### Solucion propuesta

1. Agregar `ka_nl_tercero_vend` al SELECT de MOVIMIENTOS
2. Resolver nombre via TERCEROS lookup (ya implementado en seller-resolution-service.ts)
3. Escribir a `CustomerOrderRecord.vendedorSag` durante sync
4. Para historicos: batch job que resuelve `ka_nl_tercero_vend` de MOVIMIENTOS existentes

---

## 12. Donde esta el vendedor en SAG

### Tres ubicaciones distintas

| Ubicacion | Campo | Significado |
|---|---|---|
| TERCEROS (cliente) | `VENDEDOR` / `NIT_VENDEDOR` | Vendedor asignado al cliente |
| MOVIMIENTOS (pedido) | `ka_nl_tercero_vend` | Vendedor que genero el pedido |
| TERCEROS (vendedor) | Row con `TIPO_TERCERO = 'V'` | Registro del vendedor como tercero |

### Estado de sincronizacion

| Campo SAG | Sincronizado | Motivo |
|---|---|---|
| TERCEROS.VENDEDOR | NO | No mapeado en mapSagCustomer() |
| TERCEROS.NIT_VENDEDOR | NO | No mapeado |
| MOVIMIENTOS.ka_nl_tercero_vend | NO | No mapeado en mapSagOrder() |
| TERCEROS WHERE TIPO_TERCERO='V' | NO | Query `master.vendedores` en status `"pending"` |

### Ruta de activacion

La query `master.vendedores` ya esta definida en `query-catalog.ts` lineas 599-610:
```sql
SELECT * FROM TERCEROS WHERE TIPO_TERCERO = 'V'
```
Estado: `"pending"` — TIPO_TERCERO code para vendedores no confirmado.

---

## 13. Investigacion de sucursal/branch

### Estado: NO EXISTE como dimension

**CustomerProfile:** No tiene campo `sucursal` ni `branch`.

**CustomerOrderRecord:** Tiene campo `sucursalSag` en el schema Prisma pero **nunca se escribe** durante sync.

**Schema Prisma:** "sucursal" aparece solo en:
- `BudgetDimension.BRANCH` — enum value para presupuestos (`// by store / sucursal`)
- Un campo comentado en workforce model (`role = "branch_manager"`)
- Metadata comments en modelo de cuenta bancaria

**SAG:** No hay evidencia de un campo de sucursal en TERCEROS ni MOVIMIENTOS en los queries actuales.

### Implicacion

Si el negocio necesita asociar clientes o pedidos a sucursales, se requiere:
1. Identificar la fuente de verdad de sucursales en SAG (si existe)
2. Agregar campo a CustomerProfile y/o CustomerOrderRecord
3. Mapear durante sync

---

## 14. Inventario de infraestructura de clientes

### Modelo CustomerProfile (41 campos)

**Campos de identidad:** id, organizationId, erpId, crmId, sagTerceroId, nitNormalized, nit, slug, name, legalName, identityStatus, identityNotes, status

**Campos demograficos:** segment, customerType, email, phone, city, department, address, sellerSlug, sellerName

**Campos financieros:** ltv, lastPurchaseAt, purchasePeriods, avgMonthlyRevenue, avgTicket, totalSalesL12, totalReceivable, overdueReceivable, maxDpd

**Campos de inteligencia:** healthScore, riskScore, churnRisk, nextBestAction, aiSummary, scoredAt

**Campos de sync:** erpSyncedAt, crmSyncedAt, rawErpJson, rawCrmJson

**Relaciones:** organization, crmOpportunities, activities, quotes, receivables, paymentRecords, collectionRecords

---

## 15. Campos SAG TERCEROS — mapeados vs no mapeados

### Query SAG: 20 campos esperados

| Campo SAG | Mapeado | Campo CustomerProfile | Notas |
|---|---|---|---|
| NIT (n_nit) | SI | nit, nitNormalized, erpId | |
| NOMBRE (sc_nombre) | SI | name | |
| NATURALEZA (sc_naturaleza) | SI | customerType (company/individual) | |
| EMAIL (ss_email) | SI | email | Frecuentemente null en SAG |
| TELEFONO (sc_telefono_ppal) | SI | phone | |
| DIRECCION (sc_direccion) | PARCIAL | — | Mapper lee, storage NO escribe |
| CIUDAD (ka_ni_ciudad) | NO | — | FK entero irresolvible |
| DEPARTAMENTO (ka_nl_departamento) | NO | — | FK entero irresolvible |
| VENDEDOR | NO | — | Nombre del vendedor no denormalizado |
| NIT_VENDEDOR | NO | — | Requiere JOIN a VENDEDORES |
| ZONA | NO | — | Sin campo destino |
| FORMA_PAGO | NO | — | Sin campo destino |
| TIPO_TERCERO | PARCIAL | — | En raw data, no en campo dedicado |
| TIPO_CLIENTE | NO | — | Sin campo destino |
| PRECIO_VENTA | NO | — | Lista de precios — sin campo destino |
| CREDITO | NO | — | Limite de credito — sin campo destino |
| DIAS_CREDITO | NO | — | Dias de credito — sin campo destino |
| ACTIVO | NO | — | Todos tratados como ACTIVE |
| FECHA_MODIFICACION | SI | — | Cursor de sync incremental |
| TIPO_DOC | NO | — | Tipo de documento de identidad |

**Resultado: 5 de 20 campos mapeados a CustomerProfile. 1 parcial (direccion). 14 no mapeados.**

Los 14 campos no mapeados existen en `rawErpJson` (JSON crudo) pero no son consultables via SQL.

---

## 16. Cobertura demografica actual

| Campo | Fuente | Cobertura estimada |
|---|---|---|
| name | SAG (100%) + CRM | ~100% |
| email | SAG (parcial) + CRM | Baja — SAG frecuentemente null |
| phone | SAG (parcial) + CRM | Baja-media |
| city | CRM ONLY (DANE code) | Solo perfiles con CRM sync (~98.7% de esos) |
| department | CRM ONLY | Solo perfiles con CRM sync |
| address | NINGUNA fuente escribe | 0% |
| sellerName | CRM ONLY (assigned_user_name) | Solo perfiles con CRM sync |
| segment | NINGUNA fuente escribe | 0% |
| legalName | NINGUNA fuente escribe | 0% |

### Brecha critica: address

SAG tiene `sc_direccion` y el mapper (`mapSagCustomer()`) lo lee en `address.line1` del `UnifiedCustomer`. Pero `customerProfileStorage.upsertMany()` en `storage.ts` lineas 111-151 **omite address** del payload de CREATE y UPDATE. Es un bug o una decision de diseno no documentada.

---

## 17. Resolucion de ciudad (DANE)

**Archivos:** `city-resolver.ts`, `dane-municipios.ts`

### Dos sistemas de codigos

| Sistema | Formato | Ejemplo | Resolvible |
|---|---|---|---|
| SAG (ka_ni_ciudad) | Entero corto | "1", "1142" | NO — no hay tabla de lookup |
| CRM (DANE DIVIPOLA) | 5 digitos | "05001" = Medellin | SI — 437 municipios en tabla |

### Cobertura DANE

- 437 de ~1,122 municipios colombianos cubiertos
- ~39% de municipios retornarian null si no estan en la tabla
- 98.7% de cuentas CRM usan codigos DANE validos

### Regla de supresion (CUSTOMER-GEOGRAPHY-RECOVERY-01)

SAG **nunca** escribe city/department a CustomerProfile porque los FKs enteros son irresolubles sin tabla de lookup SAG. Solo CRM escribe estos campos.

---

## 18. Pipeline de sync de clientes

### SAG → CustomerProfile

```
SAG SOAP: SELECT * FROM TERCEROS
  → mapSagCustomer() [mappers.ts:119-196]
  → UnifiedCustomer { name, taxId, email, phone, address.line1 }
  → customerProfileStorage.upsertMany() [storage.ts:86-166]
  → Escribe: erpId, nit, nitNormalized, name, email, phone, customerType, erpSyncedAt, rawErpJson
  → NO escribe: city, department, address, sellerName, sagTerceroId
```

### CRM → CustomerProfile

```
SuiteCRM V8: GET /api/v8/module/Accounts
  → mapCrmCustomer() [castillitos-crm/mappers.ts:216-257]
  → Escribe: crmId, name, email, phone, city (DANE), department, sellerName, sellerSlug, crmSyncedAt, rawCrmJson
```

### Post-sync: sagTerceroId

`sagTerceroId` se popula **separadamente** via `linkCustomerSagTerceroIds()` usando CollectionRecord como puente, no durante el sync principal.

---

## 19. Propuesta de cliente canonico minimo

Para que el modulo de Pedidos funcione con datos completos, CustomerProfile necesita estos campos poblados:

### Tier 1 — Critico para pedidos

| Campo | Fuente actual | Accion requerida |
|---|---|---|
| name | SAG + CRM | OK — ya poblado |
| nit / nitNormalized | SAG + CRM | OK — ya poblado |
| erpId | SAG | OK — ya poblado |
| city | CRM only | Necesita fuente SAG alternativa |
| sellerName | CRM only | Mapear TERCEROS.VENDEDOR o MOVIMIENTOS.ka_nl_tercero_vend |

### Tier 2 — Importante para inteligencia comercial

| Campo | Fuente actual | Accion requerida |
|---|---|---|
| address | NINGUNA | Activar escritura de sc_direccion en storage.ts |
| phone | SAG + CRM (parcial) | OK — mejorar cobertura |
| email | SAG + CRM (parcial) | OK — mejorar cobertura |
| ZONA | rawErpJson only | Agregar campo dedicado a CustomerProfile |
| PRECIO_VENTA | rawErpJson only | Agregar campo para lista de precios |
| CREDITO / DIAS_CREDITO | rawErpJson only | Agregar campos para validacion de credito en pedidos |

### Tier 3 — Deseable

| Campo | Fuente actual | Accion requerida |
|---|---|---|
| FORMA_PAGO | rawErpJson only | Agregar campo |
| TIPO_CLIENTE | rawErpJson only | Agregar campo |
| legalName | NINGUNA | Mapear de SAG si disponible |
| segment | NINGUNA | Calcular o importar |

---

## 20. Cliente 360 — estado actual

**Ruta:** `/comercial/clientes/[clienteId]`
**Archivo:** `cliente-360-loader.ts`
**Estado:** PRODUCTION-READY

### 9 secciones

1. **Perfil** — nombre, NIT, ciudad, departamento, seller, tipo
2. **Resumen financiero** — LTV, avgTicket, avgMonthlyRevenue, totalSalesL12
3. **Cartera** — totalReceivable, overdueReceivable, maxDpd
4. **Historial de compras** — CustomerOrderRecord list
5. **Cotizaciones CRM** — CRMQuote list (JOIN via billing_account_id → crmId, no customerId)
6. **Cobranza** — CollectionRecord list
7. **Pagos** — PaymentRecord list
8. **Actividad** — Activity records
9. **Oportunidades** — CRMOpportunity list

### Gotcha critico

`CRMQuote.customerId` es NULL en las 285 cotizaciones. El join se hace via `rawCrmJson.raw.billing_account_id` → `CustomerProfile.crmId`.

---

## 21. Busqueda de clientes en el wizard

**Archivo:** `order-service.ts` lineas 1231-1369

### Fan-out de 2 fuentes

**Fuente 1 (primaria):** `prisma.customerProfile.findMany()`
- Filtro: OR sobre name, slug, nit, nitNormalized, sellerName, city
- Status: ACTIVE
- Orden: lastPurchaseAt DESC
- Limite: 30 resultados
- Campos: id, slug, name, nit, nitNormalized, sellerName, city, ltv, avgTicket, lastPurchaseAt, erpId, crmId

**Fuente 2 (fallback):** AgentExecution scan
- Escanea hasta 500 ordenes recientes
- Extrae customer info de metadataJson.header
- Captura clientes que hicieron pedidos antes del sync de CustomerProfile

**Deduplicacion:** Map keyed por `slug|nit|id`.

### Flag missingSagCode

Se activa cuando el cliente no tiene `erpId` (sagCode) — indica que existe en CRM pero no en SAG. Pedidos con este flag no pueden enviarse a SAG.

---

## 22. Auditoria del wizard mayorista

### Fortalezas

- Grilla matricial talla×color intuitiva
- Stock real por celda (PIL con reservedQty)
- Semaforo de disponibilidad visual
- Auto-distribucion por tallas via decision engine
- Busqueda de clientes con deduplicacion
- Edicion de borradores existentes
- Generacion de PDF

### Debilidades

| # | Debilidad | Severidad |
|---|---|---|
| 1 | No valida credito del cliente | ALTA |
| 2 | No calcula descuento por volumen automatico | MEDIA |
| 3 | Campo `channel` sin selector UI — siempre vacio | MEDIA |
| 4 | No muestra historico de compras del cliente seleccionado | MEDIA |
| 5 | No hay sugerencia de productos basada en historico | BAJA |
| 6 | No hay wizard detal / POS — solo mayorista | MEDIA |
| 7 | `console.log` activos en produccion (search_customers, seller_performance) | BAJA |
| 8 | missingSagCode no bloquea submit — permite crear pedidos no-sincronizables | ALTA |

---

## 23. Investigacion de auto-surtido

### Motor existente: evaluateAutoSizeDistribution()

**Archivo:** `order-decision-engine.ts` lineas 227-356

Ya implementado como evaluador del Policy Pack. Algoritmo:
1. Floor-divide equitativo entre tallas con stock
2. Round-robin residuo por disponibilidad descendente
3. Respeta maxUnitsPerSize (50)
4. redistributeOnMissing: tallas sin stock se saltan

### Motor reusable de Maletas

**Archivo:** `mallet-assortment-types.ts`

El patron `MalletAssortmentEvaluationInput → MalletAssortmentSuggestion` es estructuralmente identico:
- `suggestedQty` / `availableUnits` / `reason` / `confidence` por item
- Opera a nivel subgrupo (vs talla en pedidos)

### Motor de tiendas

**Archivo:** `store-policy-template-registry.ts` lineas 105-129

Template de size curve con porcentajes target:
```json
{ "S": 0.15, "M": 0.30, "L": 0.30, "XL": 0.25 }
```

### Oportunidad de unificacion

Los tres motores (pedidos, maletas, tiendas) resuelven variantes del mismo problema: "dado un target de unidades y disponibilidad por variante, como distribuir?" Podrian compartir una abstraccion comun en `lib/comercial/assortment/` pero actualmente son independientes.

---

## 24. Reservas e inventario disponible

### Formula canonica

```typescript
available = Math.max(0, quantity - reservedQty)
```

Usada en 6+ archivos de forma consistente. No hay discrepancia.

### Modelo OperationalReservation

Existe en Prisma. Lifecycle hooks en `order-lifecycle-hooks.ts` ejecutan mutations reales:
- `prisma.operationalReservation.updateMany({ status: "consumed" })` en SAG SUCCESS
- `prisma.operationalReservation.updateMany({ status: "released" })` en SAG FAILED/REJECTED

### Sprint de activacion

`AGENTIK-OPERATIONAL-RESERVATION-ENGINE-01` — el contrato REST esta definido pero los endpoints pueden no estar live.

---

## 25. Importacion de pedidos desde SAG

### Ruta: `comercial/pedidos/import/route.ts`

3 acciones:
- `import_single` — importa un pedido SAG por referencia
- `import_batch` — importa multiples pedidos
- `fetch_pending` — consulta pedidos pendientes en SAG

### Flujo SAG → Agentik

```
SAG MOVIMIENTOS (fuente=4, cobrar_pagar='C', code='PD')
  → mapSagOrder() [mappers.ts — NO mapea vendedor]
  → CustomerOrderRecord.create()
```

### Datos disponibles en MOVIMIENTOS_ITEMS

| Campo | Disponible | Sincronizado |
|---|---|---|
| Referencia (ss_codigo_barras) | SI | SI |
| Talla (ss_talla) | SI | Parcial |
| Color (ss_color) | SI | Parcial |
| Cantidad (nd_cantidad) | SI | SI |
| Precio (nd_valor_unitario) | SI | SI |
| Bodega (ka_nl_bodega) | SI | Parcial |
| Vendedor (ka_nl_tercero_vend) | SI | NO |

---

## 26. Generacion de PDF

**Ruta:** `comercial/pedidos/pdf/route.ts`

Funcional. Genera PDF binario de un OrderDraft por orderId. Acepta parametro `discount` opcional. Streama el binario como response.

---

## 27. Sync de lineas CRM

**Ruta:** `comercial/pedidos/sync-lines/route.ts`

Sprint: `SAG-ORDER-LINES-SYNC-01`

Sincroniza CRMQuoteLine desde SuiteCRM V8 `AOS_Products_Quotes`. Requiere CRM connector configurado.

**BLOCKER conocido:** CRM `clientId`/`clientSecret` MISSING del connector config.

---

## 28. Decision engine de pedidos

**Archivo:** `order-decision-engine.ts`

### 4 evaluadores registrados como Policy Pack

| Evaluador | Funcion | Estado |
|---|---|---|
| Deteccion de duplicados | Busca pedidos similares recientes | IMPLEMENTADO |
| Auto-distribucion por tallas | Distribuye unidades equitativamente | IMPLEMENTADO |
| Validacion de pedido | Valida completitud y coherencia | IMPLEMENTADO |
| Evaluacion batch | Procesa multiples refs con sus size inventories | IMPLEMENTADO |

Todos registrados en `order-policy-pack.ts` con tags `["pedidos", ...]`.

---

## 29. Modelos Prisma relacionados

| Modelo | Uso | Poblado |
|---|---|---|
| CustomerProfile | Cliente canonico | SI — SAG + CRM |
| CustomerOrderRecord | Ordenes sincronizadas desde SAG | SI — sync MOVIMIENTOS |
| CustomerOrderLine | Lineas de orden (ref, qty, precio) | SI — sync MOVIMIENTOS |
| CRMQuote | Cotizaciones CRM | SI — pero customerId NULL |
| CRMQuoteLine | Lineas de cotizacion CRM | PARCIAL — sync bloqueado |
| AgentExecution | Store de borradores de pedido | SI — operation COMERCIAL_ORDER_DRAFT |
| OperationalReservation | Reservas de inventario | SI — modelo existe, hooks live |
| ProductEntity | Catalogo de productos | SI |
| ProductVariant | Variantes (talla/color) | SI |
| ProductInventoryLevel | Stock por bodega | SI |

---

## 29b. Motor de reservas operacionales (detalle)

**Archivo:** `lib/operational-inventory/operational-reservation-engine.ts`

### Maquina de estados de reserva

```
active → consumed (order sent to SAG — SAG owns units)
       → released (order cancelled — units returned)
       → expired  (TTL elapsed, default 24h — units auto-returned)
       → cancelled (coordinator manual action)
```

### Formula de disponibilidad operacional

```
operationalAvailableQty =
    physicalQty (SAG PIL)
  - reservedQty (sum active OperationalReservation.qtyReserved)
  - salesAssignedQty (Sales Portfolio allocations)
  - pendingTransfersQty (inter-warehouse transfers)
```

### Senales de presion (ReservationPressureSignal)

Se emiten cuando:
- Stock operacional llega a 0 → `depleted`
- Stock operacional < umbral minimo → `below_minimum`
- Reservas > stock fisico → `overcommitted`

Incluye: trigger type, referencia, stock antes/despues, severidad (alta/media/baja), vendedor.

### Archivos adicionales

| Archivo | Funcion |
|---|---|
| `operational-reservation-types.ts` | Contrato de tipos completo |
| `order-reservation-bridge.ts` | Sync CRM order → operational reservation |

### Idempotencia

Key: `organizationId + "order" + sourceId + reference`. Ejecutar sync multiples veces para el mismo pedido es seguro — cambios de cantidad se actualizan in-place.

---

## 29c. Evaluacion de fulfillment

**Archivo:** `lib/comercial/pedidos/order-fulfillment.ts`

### Estado por linea

| Estado | Condicion |
|---|---|
| `available` | stock >= solicitado |
| `low_stock` | stock >= solicitado PERO <= 10 unidades |
| `partial` | solicitado > disponible |
| `out_of_stock` | disponible = 0 |
| `inventory_unknown` | sin datos de sync |

### Grado del pedido

| Grado | Condicion |
|---|---|
| `ready` | todas las lineas available o low_stock |
| `partial` | algunas lineas partial |
| `blocked` | cualquier linea out_of_stock |
| `unknown` | sin datos de inventario |

**Completion %** = (lineas despachables / total lineas) x 100

### Politica de despacho parcial (CASTILLITOS_PARTIAL_DELIVERY)

| Parametro | Valor |
|---|---|
| minFulfillmentPct | 0 (permite cualquier %) |
| partialDeliveryEnabled | true |
| backorderEnabled | true |

### Descuento (CASTILLITOS_DISCOUNT_OVERRIDE)

| Parametro | Valor |
|---|---|
| overrideAllowed | true |
| requireReason | true (razon obligatoria) |

Tipos: `percentage` (% del valor) o `fixed` (monto fijo). Total nunca negativo (clamped a 0).

---

## 29d. Inventario canonico — bodegas comerciales

### Clasificacion de bodegas (40 Castillitos)

| Tipo | Bodegas | Comercial | Uso |
|---|---|---|---|
| COMMERCIAL_TEXTILE | B01 (ka_nl=10) | SI | Stock textil principal |
| COMMERCIAL_AVAILABLE_IMPORT | B24 (ka_nl=33) | SI | Stock importacion |
| IMPORT_STAGING | B26, B27 | NO | Staging — "no tener en cuenta" |
| IMPORT_CONTAINER | 13 temporales | NO | Contenedores — nunca comercial |
| PRODUCTION_ONLY | B04, Samples, Arreglos, Segundas | NO | Produccion/reparaciones |
| STORE | Centro, SanDiego, Plaza, Caldas | NO | Retail fisico |
| VENDOR | Orlando, Carlos, Luis, Nestor, Villa, Fredy | NO | Muestras vendedores |
| EXCLUDED | 10 cerradas | NO | Fuera de servicio |

### Politica de stock comercial por dominio

- **TEXTILE:** Solo B01 (ka_nl=10) — "Inventario comercial textil"
- **IMPORT:** Solo B24 (ka_nl=33) — "Inventario comercial importacion"

### Resolucion de stock

`resolveCompatibleCommercialStock()`:
1. Resolver politica por dominio
2. Si CCS (Commercial Coverage Snapshot) compatible → usar CCS
3. Si no → sumar PIL de bodegas autorizadas (negativos clamped a 0)
4. Retorna source ("CCS" | "PIL" | "NONE") + bodegas contribuyentes

---

## 29e. Estado actual vs pendiente — resumen consolidado

### COMPLETO Y OPERACIONAL

- Motor de reservas operacionales (active/released/consumed/expired/cancelled)
- Checks de disponibilidad multi-fuente (ProductEntity + CRMQuoteLine + PIL)
- Evaluacion de fulfillment por linea y por pedido
- Inventario canonico con 40 bodegas clasificadas
- Policy Pack de pedidos (6 fases: credito, despacho parcial, descuento, readiness, stock, auto-size)
- Busqueda de variantes con stock real (talla x color x bodega)
- Logica de descuento (percentage + fixed)
- Tipos de entrega (immediate + scheduled)

### PARCIALMENTE IMPLEMENTADO

- Auto-distribucion por tallas: policy definida, config existe, **NO wired al wizard**
- Senales de presion: engine emite, **NO wired a David/produccion**
- Integracion maletas→pedidos: toda la logica existe, **NO usada en wizard**

### NO CONSTRUIDO

- Persistencia real de reservedQty en PIL (SAG lo gestiona, Agentik no decrementa)
- Sistema de backorder (policy dice enabled, no hay modelo)
- Fulfillment multi-bodega (campo sourceWarehouseCode vacio)
- Curva de surtido dinamica (solo estatica por linea)
- Generacion de PD en SAG (bridge conceptual, sin SOAP call)

---

## 30. console.log activos en produccion

| Archivo | Lineas | Accion |
|---|---|---|
| `comercial/pedidos/route.ts` | 159, 162 | `console.log` en search_customers |
| `comercial/pedidos/history/route.ts` | 75-79, 88-99 | `console.log` en seller_performance |

Deben limpiarse antes de release.

---

## 31. Brechas funcionales priorizadas

| # | Brecha | Severidad | Esfuerzo |
|---|---|---|---|
| 1 | SAG write bridge stub — pedidos nunca llegan a SAG | CRITICA | ALTO — requiere endpoint SOAP |
| 2 | Vendedor no mapeado en sync de ordenes | ALTA | BAJO — agregar campo a mapSagOrder() |
| 3 | address nunca escrito a CustomerProfile | ALTA | BAJO — activar en storage.ts |
| 4 | 14 campos SAG TERCEROS no mapeados (credito, zona, forma_pago...) | ALTA | MEDIO — schema + mapper |
| 5 | city/department solo de CRM — SAG suprimido | MEDIA | MEDIO — requiere tabla DANE para SAG FKs |
| 6 | missingSagCode no bloquea submit de pedido | ALTA | BAJO — validacion en canSendToSag() |
| 7 | No hay wizard detal/POS | MEDIA | ALTO — nuevo componente |
| 8 | No hay validacion de credito del cliente | MEDIA | MEDIO — requiere CREDITO/DIAS_CREDITO de SAG |
| 9 | Sucursal/branch no existe como dimension | MEDIA | MEDIO — requiere fuente SAG |
| 10 | CRM quote sync bloqueado (clientId/clientSecret) | MEDIA | BAJO — config fix |
| 11 | console.log en produccion | BAJA | BAJO — limpiar |
| 12 | Canal (channel) sin selector UI | BAJA | BAJO — agregar select |

---

## 32. Dependencias externas

| Dependencia | Estado | Impacto |
|---|---|---|
| SAG SOAP (lectura) | ACTIVO | Queries TERCEROS y MOVIMIENTOS funcionan |
| SAG SOAP (escritura de pedidos) | NO IMPLEMENTADO | Blocker #1 |
| CRM SuiteCRM V8 | ACTIVO (parcial) | clientId/clientSecret missing para quote lines |
| ProductEntity sync | ACTIVO | Base del catalogo de productos |
| PIL sync | ACTIVO | Stock real con reservedQty |
| ProductVariant sync | ACTIVO | Tallas y colores |

---

## 33. Plan de implementacion por fases

### Fase 0 — Quick wins (sin schema changes)

1. **Activar escritura de address** en `customerProfileStorage.upsertMany()` — 1 linea
2. **Limpiar console.log** en rutas de produccion — 4 lineas
3. **Bloquear submit** cuando missingSagCode — 1 validacion
4. **Agregar selector de canal** al wizard — UI only

### Fase 1 — Vendedor + campos SAG criticos

1. Agregar `ka_nl_tercero_vend` al mapper de ordenes (`mapSagOrder()`)
2. Escribir a `CustomerOrderRecord.vendedorSag` durante sync
3. Mapear TERCEROS.VENDEDOR y NIT_VENDEDOR a CustomerProfile (nuevo campo o sellerName)
4. Mapear CREDITO, DIAS_CREDITO a nuevos campos en CustomerProfile
5. Mapear ZONA, FORMA_PAGO, PRECIO_VENTA a nuevos campos
6. Batch job para resolver vendedor en ordenes historicas

### Fase 2 — SAG write bridge

1. Implementar `sendOrderToSag()` con endpoint SOAP real
2. Implementar `getSagOrderStatus()` para polling
3. Activar lifecycle completo: draft → sent_to_sag → processing → fulfilled
4. Wiring de reservation consume/release en flujo real

### Fase 3 — Geografia + inteligencia

1. Resolver brecha de city/department para clientes SAG-only
   - Opcion A: Obtener tabla de lookup de ciudades SAG
   - Opcion B: Mapear DANE codes desde otro campo SAG
2. Implementar validacion de credito en wizard (usar CREDITO/DIAS_CREDITO)
3. Agregar historico de compras del cliente en paso 1 del wizard
4. Sugerencia de productos basada en historico

### Fase 4 — Expansion

1. Wizard detal/POS (si el negocio lo requiere)
2. Unificacion de motores de auto-surtido (pedidos + maletas + tiendas)
3. Investigar sucursal como dimension (requiere fuente SAG)

---

## Apendice A — Preguntas que requieren decision empresarial

### P1: Activar escritura de address?
`sc_direccion` existe en SAG y el mapper lo lee. El storage no lo escribe. Es un bug o una decision de diseno? Recomendacion: activar.

### P2: Tabla de lookup de ciudades SAG
SAG usa `ka_ni_ciudad` (FK entero). Sin tabla de lookup, city nunca se pobla desde SAG. Opciones:
- A) Solicitar tabla CIUDADES a proveedor SAG
- B) Mantener CRM como unica fuente de city
- C) Construir tabla de mapping manual (si hay pocos valores)

### P3: Vendedor — cliente vs pedido
TERCEROS.VENDEDOR es el vendedor asignado al *cliente*. MOVIMIENTOS.ka_nl_tercero_vend es el vendedor del *pedido*. Son conceptos diferentes. Cual es mas importante para Pedidos?

### P4: Credito — bloquear o advertir?
Si se mapea CREDITO/DIAS_CREDITO de SAG, el wizard debe:
- A) Bloquear pedidos que excedan el limite de credito
- B) Solo advertir y permitir override con aprobacion
- C) Solo mostrar informacion sin bloquear

### P5: Canal — cuales opciones?
El campo `channel` en OrderHeader esta vacio. Opciones posibles:
- mayorista / detal / institucional / exportacion?
- Debe alinearse con la clasificacion de canal de Importaciones (classifySale)?

### P6: Sucursal — existe en SAG?
No hay evidencia de un campo de sucursal en TERCEROS ni MOVIMIENTOS. Confirmar con administrador SAG si existe como dimension.
