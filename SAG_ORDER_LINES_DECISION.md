# SAG_ORDER_LINES_DECISION.md

**Sprint:** SAG-ORDER-LINES-SYNC-01
**Date:** 2026-06-23
**Author:** Agentik Engineering
**Status:** IMPLEMENTADO — pendiente credenciales CRM

---

## 1. Fuente real descubierta

### Respuesta definitiva: AOS_Products_Quotes (SuiteCRM V8)

Las lineas de pedido viven en el modulo `AOS_Products_Quotes` del CRM SuiteCRM V8, accesible via:

```
GET {baseUrl}/Api/V8/module/AOS_Products_Quotes
  ?filter[operator]=and
  &filter[parent_id][eq]={quoteId}
  &page[size]=500
```

Cada linea contiene:

| Campo CRM | Descripcion | Ejemplo |
|---|---|---|
| `name` / `part_number` | SKU / referencia | CJ-4031425 |
| `product_qty` | Cantidad | 10 |
| `product_unit_price` | Precio unitario | 45000 |
| `product_total_price` | Total linea | 450000 |
| `product_list_price` | Precio de lista | 45000 |
| `product_discount` | % descuento | 5 |
| `product_discount_amount` | Descuento absoluto | 22500 |
| `vat` | % IVA | 19 |
| `vat_amt` | IVA absoluto | 85500 |
| `talla_c` | Talla (custom) | M |
| `color_c` | Color (custom) | NEGRO |
| `bodega_c` | Bodega nombre | Principal |
| `adm_bodega_id_c` | Bodega UUID | 32c847e9-... |
| `estado_pedido_c` | Estado linea | Facturado |

### Fuentes descartadas

| Fuente | Razon |
|---|---|
| `CRMQuote.rawCrmJson.line_items` | Siempre vacio (`""`) — CRM no embebe lineas |
| `CustomerOrderRecord.rawJson` | Siempre vacio (`{}`) — SAG no incluye detalle |
| `CustomerOrderRecord.lineItems` | Campo no existe en el modelo |
| Consulta directa a SAG SOAP | Prohibido desde UI — solo via sync |

---

## 2. Infraestructura pre-existente (nunca invocada)

| Componente | Archivo | Estado previo |
|---|---|---|
| `pullQuoteLines(quoteId)` | `castillitos-crm/index.ts:215` | Implementado, nunca llamado |
| `pullQuoteLinesBatch(quoteIds)` | `castillitos-crm/index.ts:256` | Implementado, nunca llamado |
| `upsertQuoteLines()` | `castillitos-crm/storage.ts:534` | Implementado, nunca llamado |
| `CrmQuoteLineRaw` type | `crm-quote-line-types.ts` | Completo |
| `CrmQuoteLineAttributes` | `crm-quote-line-types.ts` | Todos los campos documentados |
| `crmNumToFloat()` helper | `crm-quote-line-types.ts:106` | Funcional |
| `CRMQuoteLine` Prisma model | `schema.prisma:2619` | 19 campos, indices, relacion con CRMQuote |
| `CRM_MODULE.QUOTE_LINES` | `crm-castillitos/index.ts:74` | Definido como "NOT YET CONSUMED" |

---

## 3. Modelo definitivo

### CRMQuoteLine (Prisma — ya existente, sin cambios)

```prisma
model CRMQuoteLine {
  id              String    @id @default(cuid())
  organizationId  String
  crmId           String?   // V8 record UUID
  quoteId         String?   // FK to CRMQuote.id
  quoteCrmId      String?   // CRMQuote.crmId
  productCrmId    String?   // product_id
  reference       String    // SKU
  productName     String?
  qty             Decimal   @db.Decimal(12, 3)
  unitPrice       Decimal   @db.Decimal(18, 2)
  listPrice       Decimal   @db.Decimal(18, 2)
  totalPrice      Decimal   @db.Decimal(18, 2)
  discount        Decimal   @db.Decimal(10, 4)
  discountAmount  Decimal   @db.Decimal(18, 2)
  vatRate         Decimal   @db.Decimal(10, 4)
  vatAmount       Decimal   @db.Decimal(18, 2)
  size            String?   // talla_c
  color           String?   // color_c
  warehouseName   String?   // bodega_c
  warehouseId     String?   // adm_bodega_id_c
  status          String?   // estado_pedido_c
  rawCrmJson      Json?
  syncedAt        DateTime
  createdAt       DateTime
  updatedAt       DateTime

  @@unique([organizationId, crmId])
  @@index([organizationId, quoteId])
  @@index([organizationId, reference])
}
```

**No se requirio migracion. Todos los campos necesarios ya existian.**

---

## 4. Archivos creados

| Archivo | Proposito |
|---|---|
| `lib/comercial/pedidos/quote-lines-sync.ts` | Servicio de sincronizacion CRM → CRMQuoteLine |
| `app/api/.../pedidos/sync-lines/route.ts` | API endpoint POST para trigger de sync |

## 5. Archivos modificados

| Archivo | Cambio |
|---|---|
| `lib/comercial/pedidos/order-service.ts` | `getOrder()` incluye quoteLines, `crmQuoteToOrderDraft()` convierte CRMQuoteLine → OrderLine, `listSagOrders()` incluye _count |
| `app/(app)/.../pedidos/pedidos-client.tsx` | Drawer: totals row, em-dash for empty size/color, sync guidance message |

---

## 6. Metricas

### E2E Validation (20 pedidos)

| Metrica | Valor |
|---|---|
| Pedidos validados | 20/20 |
| Lineas creadas | 67 |
| Lineas leidas correctamente | 67/67 |
| getOrder() con lines > 0 | 20/20 |
| Cleanup exitoso | 67/67 eliminadas |
| TSC baseline | 160 (preservado) |

### CRM API Status

| Metrica | Valor |
|---|---|
| CRM connector status | INACTIVE |
| CRM clientId | MISSING |
| CRM clientSecret | MISSING |
| Sync ejecutable | NO — requiere credenciales |

---

## 7. Evidencias

### 7.1 rawCrmJson de CRMQuote

```json
{
  "raw": {
    "id": "7f5a41b9-...",
    "name": "Pedido No. 00005",
    "number": "5",
    "stage": "Facturado",
    "id_sag_c": "257356",
    "total_amount": "479401.020000",
    "billing_account": "LUIS FERNANDO GOMEZ CARTAGENA",
    "line_items": "",               // <-- SIEMPRE VACIO
    "aos_products_quotes": "",      // <-- RELACION, NO EMBEBIDO
    "respuesta_sag_c": "DOCUMENTO CREADO CORRECTAMENTE"
  }
}
```

### 7.2 CustomerOrderRecord.rawJson

```json
{}  // SIEMPRE VACIO — 9,045 registros, todos con rawJson = {}
```

### 7.3 CRM API endpoint documentado

```
GET /Api/V8/module/AOS_Products_Quotes
  ?filter[parent_id][eq]={quoteId}

Campos: name, product_qty, product_unit_price, product_total_price,
        talla_c, color_c, bodega_c, adm_bodega_id_c, estado_pedido_c
```

---

## 8. Riesgos

| Riesgo | Severidad | Mitigacion |
|---|---|---|
| CRM credentials no configuradas | ALTO | Requiere que JR Consultores provea clientId/clientSecret y se almacenen en Connector.config |
| CRM server inestable (HTTP 500 en auth) | MEDIO | Sync service tiene retry via adapter, skip individual errors |
| Lineas CRM pueden tener campos vacios | BAJO | `crmNumToFloat()` maneja nulls, strings vacios, formatos invalidos |
| Quote sin lineas en CRM (pedido verbal) | BAJO | Drawer muestra "importado sin detalle" — no inventa |

---

## 9. Dependencias para inteligencia comercial

Con CRMQuoteLine poblada, los siguientes modulos pueden consumir datos reales:

| Modulo | Dato disponible | Tabla |
|---|---|---|
| Historial cliente | Referencias compradas, cantidades, frecuencia | CRMQuoteLine JOIN CRMQuote |
| Historial vendedor | Portfolio de referencias vendidas | CRMQuoteLine JOIN CRMQuote |
| Productos mas vendidos | Ranking por referencia, qty, revenue | CRMQuoteLine GROUP BY reference |
| Recompra | Patron temporal por cliente x referencia | CRMQuoteLine JOIN CRMQuote |
| Cumplimiento | Comparar pedido vs factura | CRMQuoteLine vs SAG facturacion |
| Radar comercial | Tendencias por linea/categoria | CRMQuoteLine.reference → ProductEntity |
| David Comercial IA | Signals basados en datos reales | CRMQuoteLine aggregate |

---

## 10. Proximos pasos

| Paso | Prioridad | Descripcion |
|---|---|---|
| Obtener credenciales CRM | CRITICO | Solicitar clientId/clientSecret a JR Consultores y almacenar en Connector.config |
| Ejecutar sync completo | CRITICO | POST /api/orgs/castillitos/comercial/pedidos/sync-lines |
| Validar con datos reales | ALTO | Verificar SUM(lineas) ≈ total para 20 pedidos reales |
| Agregar sync a cron | MEDIO | Ejecutar sync de lineas como post-step de quotes sync |
| Integrar con inteligencia | MEDIO | CrmCommercialProvider debe incluir quoteLines |
| Full sync (285 quotes) | MEDIO | Incremental: solo quotes sin lineas |
