# SAG Master Data Matrix — SAG-MASTER-DATA-MATRIX-01

**Sprint:** SAG-MASTER-DATA-DISCOVERY-01
**Date:** 2026-07-12
**Format:** Field -> Concept -> Domain -> Engine -> Priority -> Business Questions

---

## VENTAS Domain (41 fields)

| SAG Field | Concept | Agentik Domain | Consumer Engines | Priority | Business Questions |
|---|---|---|---|---|---|
| ID_VENTA | Sale identifier | SALES | All | P1 | Unique sale tracking |
| FECHA_VENTA | Sale date | SALES | RotationEngine, SalesIntelligence | P1 | "Cuanto vendimos hoy?" |
| MONTO_BRUTO | Gross amount | SALES | SalesIntelligence | P1 | Revenue reporting |
| MONTO_NETO | Net amount | SALES | SalesIntelligence, CommercialCopilot | P1 | "Cuanto vendimos?" |
| DESCUENTO_COMERCIAL | Commercial discount | SALES | MarkdownEngine | P1 | Discount effectiveness |
| ID_CLIENTE | Customer FK | SALES + CUSTOMER | CustomerIntelligence | P1 | Customer attribution |
| ID_PRODUCTO | Product FK | SALES + PRODUCT | RotationEngine | P1 | Product performance |
| CANAL_VENTA | Sales channel | SALES | SalesIntelligence | P1 | Channel analysis |
| DEVOLUCION_MONTO | Return amount | SALES | SalesIntelligence | P1 | Return rate |
| NUMERO_DOCUMENTO | Document number | SALES | All | P1 | Document traceability |
| TIPO_DOCUMENTO | Document type | SALES | All | P1 | FA/NC/ND classification |
| ESTADO_VENTA | Sale status | SALES | SalesIntelligence | P1 | Active vs voided |
| ID_VENDEDOR | Seller FK | SALES + CUSTOMER | SalesIntelligence | P1 | "Mejor vendedor?" |
| NOMBRE_VENDEDOR | Seller name | SALES | SalesIntelligence | P2 | Display |
| COSTO_VENTA | COGS | SALES | MarkdownEngine | P1 | "Margen bruto?" |
| IMPUESTO_VENTA | Sales tax | SALES | SalesIntelligence | P2 | Tax compliance |
| MARGEN_BRUTO | Gross margin | SALES | MarkdownEngine, CommercialCopilot | P1 | "Margen bruto?" |
| CANTIDAD_VENDIDA | Units sold | SALES | RotationEngine | P1 | Rotation velocity |
| UNIDAD_MEDIDA | Unit of measure | SALES + PRODUCT | RotationEngine | P2 | Unit normalization |
| CIUDAD_CLIENTE | Customer city | SALES + CUSTOMER | SalesIntelligence | P2 | Geographic analysis |
| PAIS_CLIENTE | Customer country | SALES + CUSTOMER | SalesIntelligence | P3 | Export analysis |
| SUCURSAL | Branch | SALES | SalesIntelligence | P2 | Multi-branch reporting |
| EMPRESA | Company | SALES | All | P1 | Multi-company isolation |
| FECHA_DESPACHO | Dispatch date | SALES | (future Logistics) | P3 | Delivery tracking |
| FECHA_ENTREGA | Delivery date | SALES | (future Logistics) | P3 | Delivery performance |
| DEVOLUCION_CANTIDAD | Return quantity | SALES | SalesIntelligence | P2 | Return unit analysis |
| MONEDA | Currency | SALES | SalesIntelligence | P2 | Multi-currency |
| TASA_CAMBIO | Exchange rate | SALES | SalesIntelligence | P3 | FX analysis |
| FECHA_CREACION | Created at | SALES | All | P2 | Audit |
| FECHA_ACTUALIZACION | Updated at | SALES | All | P1 | Freshness SLA |
| ID_FACTURA | Invoice FK | SALES | SalesIntelligence | P1 | Invoice traceability |
| CODIGO_PRODUCTO | Product code | SALES + PRODUCT | RotationEngine | P1 | Product cross-ref |
| NOMBRE_PRODUCTO | Product name | SALES + PRODUCT | SalesIntelligence | P2 | Display |
| NOMBRE_CLIENTE | Customer name | SALES + CUSTOMER | SalesIntelligence | P2 | Display |
| ESTADO_LOGISTICO | Logistics status | SALES | (future Logistics) | P3 | Delivery tracking |
| LINEA_DETALLE_ID | Detail line ID | SALES | All | P1 | Line-level analysis |
| GRANULARIDAD_REGISTRO | Record granularity | SALES | All | P1 | Header vs line |
| FECHA_COMPROMISO_ENTREGA | Committed delivery | SALES | (future Logistics) | P3 | SLA compliance |
| ID_BODEGA | Warehouse FK | SALES + INVENTORY | CoverageEngine | P1 | Warehouse attribution |
| ID_PEDIDO | Order FK | SALES | SalesIntelligence | P2 | Order traceability |
| ORIGEN_VENTA | Sale origin | SALES | SalesIntelligence | P2 | Attribution channel |

## PAGOS Domain (25 fields)

| SAG Field | Concept | Agentik Domain | Consumer Engines | Priority | Business Questions |
|---|---|---|---|---|---|
| ID_PAGO | Payment ID | CUSTOMER | RulesEvidenceEngine | P1 | Payment tracking |
| FECHA_PAGO | Payment date | CUSTOMER | CustomerIntelligence | P1 | "Cuando pago?" |
| MONTO_PAGO | Payment amount | CUSTOMER | CustomerIntelligence | P1 | "Cuanto pago?" |
| ID_FACTURA_REF | Invoice FK | CUSTOMER + SALES | RulesEvidenceEngine | P1 | Payment-to-invoice match |
| ID_CLIENTE | Customer FK | CUSTOMER | CustomerIntelligence | P1 | Customer payment behavior |
| MEDIO_PAGO | Payment method | CUSTOMER | CustomerIntelligence | P2 | Payment method analysis |
| ESTADO_PAGO | Payment status | CUSTOMER | RulesEvidenceEngine | P1 | Reconciliation |
| BANCO_DESTINO | Destination bank | CUSTOMER + Finance | (Treasury) | P1 | Bank reconciliation |
| NUMERO_RECIBO | Receipt number | CUSTOMER | All | P1 | Receipt traceability |
| FECHA_APLICACION | Application date | CUSTOMER | CustomerIntelligence | P1 | Payment timing |
| SALDO_POSTERIOR | Post-payment balance | CUSTOMER | CustomerIntelligence | P1 | Balance tracking |
| TIPO_APLICACION | Application type | CUSTOMER | RulesEvidenceEngine | P2 | Payment classification |
| REFERENCIA_BANCARIA | Bank reference | CUSTOMER + Finance | (Reconciliation) | P1 | Cross-ref with bank |
| BANCO_ORIGEN | Source bank | CUSTOMER + Finance | (Treasury) | P2 | Cash source tracking |
| FECHA_VENCIMIENTO_FACTURA | Invoice due date | CUSTOMER | CustomerIntelligence | P1 | Late payment detection |
| SUCURSAL | Branch | CUSTOMER | All | P2 | Multi-branch |
| EMPRESA | Company | CUSTOMER | All | P1 | Multi-company |
| NOMBRE_CLIENTE | Customer name | CUSTOMER | All | P2 | Display |
| NIT_CLIENTE | Customer NIT | CUSTOMER | All | P1 | Customer identity |
| MONEDA | Currency | CUSTOMER | All | P2 | Multi-currency |
| TASA_CAMBIO | Exchange rate | CUSTOMER | All | P3 | FX |
| FECHA_CREACION | Created at | CUSTOMER | All | P2 | Audit |
| FECHA_ACTUALIZACION | Updated at | CUSTOMER | All | P2 | Freshness |
| ESTADO_CONCILIACION | Reconciliation status | CUSTOMER + Finance | (Reconciliation) | P1 | "Pagos sin conciliar?" |
| MONTO_NO_APLICADO | Unapplied amount | CUSTOMER | CustomerIntelligence | P1 | Unapplied payment tracking |

## RECAUDOS Domain (38 fields)

| SAG Field | Concept | Agentik Domain | Consumer Engines | Priority | Business Questions |
|---|---|---|---|---|---|
| ID_RECAUDO | Receipt ID | CUSTOMER | All | P1 | Receipt tracking |
| NUMERO_RECIBO | Receipt number | CUSTOMER | All | P1 | Receipt traceability |
| ID_CLIENTE / NIT_CLIENTE | Customer | CUSTOMER | CustomerIntelligence | P1 | Who paid |
| MONTO_RECAUDO | Receipt amount | CUSTOMER | CustomerIntelligence | P1 | "Cuanto cobramos hoy?" |
| MONTO_APLICADO | Applied amount | CUSTOMER | CustomerIntelligence | P1 | Application rate |
| MONTO_NO_APLICADO | Unapplied | CUSTOMER | RulesEvidenceEngine | P1 | Unapplied receipts |
| TIPO_RECAUDO | Receipt type | CUSTOMER | CustomerIntelligence | P2 | Classification |
| MEDIO_RECAUDO | Receipt method | CUSTOMER | CustomerIntelligence | P2 | Channel analysis |
| CANAL_RECAUDO | Receipt channel | CUSTOMER | CustomerIntelligence | P2 | Channel tracking |
| REFERENCIA_BANCARIA | Bank ref | CUSTOMER + Finance | (Reconciliation) | P1 | Bank cross-ref |
| ID_CUENTA_BANCO | Bank account | Finance | (Treasury) | P1 | Cash tracking |
| CONCILIADO | Reconciled flag | CUSTOMER + Finance | (Reconciliation) | P1 | "Recaudos sin conciliar?" |
| ESTADO_CONCILIACION | Recon status | CUSTOMER + Finance | (Reconciliation) | P1 | Reconciliation tracking |
| ESTADO_RECAUDO | Receipt status | CUSTOMER | All | P1 | Status filtering |
| FECHA_RECAUDO | Receipt date | CUSTOMER | CustomerIntelligence | P1 | Timing |
| FECHA_CONSIGNACION | Deposit date | Finance | (Treasury) | P1 | Cash availability |

## CARTERA Domain (39 fields)

| SAG Field | Concept | Agentik Domain | Consumer Engines | Priority | Business Questions |
|---|---|---|---|---|---|
| ID_CARTERA | Receivable ID | CUSTOMER | All | P1 | Receivable tracking |
| ID_FACTURA / NUMERO_FACTURA | Invoice ref | CUSTOMER + SALES | RulesEvidenceEngine | P1 | Invoice-level aging |
| ID_CLIENTE / NIT_CLIENTE | Customer | CUSTOMER | CustomerIntelligence | P1 | "Quien debe mas?" |
| SALDO_PENDIENTE | Outstanding balance | CUSTOMER | CustomerIntelligence | P1 | "Cuanto nos deben?" |
| SALDO_CORRIENTE | Current balance | CUSTOMER | CustomerIntelligence | P1 | Current vs overdue |
| SALDO_VENCIDO | Overdue balance | CUSTOMER | CustomerIntelligence, CommercialCopilot | P1 | "Cuanto esta vencido?" |
| DIAS_MORA | Days overdue | CUSTOMER | CustomerIntelligence | P1 | Aging analysis |
| RANGO_MORA | Aging bucket | CUSTOMER | CustomerIntelligence | P1 | Aging distribution |
| CUPO_CREDITO | Credit limit | CUSTOMER | RulesEvidenceEngine | P1 | Credit control |
| CUPO_DISPONIBLE | Available credit | CUSTOMER | RulesEvidenceEngine | P1 | Order approval |
| RIESGO_CLIENTE | Customer risk | CUSTOMER | CustomerIntelligence, CommercialCopilot | P1 | "Cliente de mas riesgo?" |
| ESTADO_COBRANZA | Collection status | CUSTOMER | CustomerIntelligence | P1 | Collection pipeline |
| PROMESA_PAGO_FECHA | Promise date | CUSTOMER | CustomerIntelligence | P2 | Collection follow-up |
| PROMESA_PAGO_VALOR | Promise amount | CUSTOMER | CustomerIntelligence | P2 | Collection forecast |
| CLIENTE_BLOQUEADO_CREDITO | Credit blocked | CUSTOMER | RulesEvidenceEngine | P1 | Order blocking |
| SCORE_RIESGO_NUMERICO | Risk score | CUSTOMER | CustomerIntelligence, CommercialCopilot | P1 | AI risk scoring |
| ID_VENDEDOR | Seller FK | CUSTOMER | SalesIntelligence | P2 | Seller portfolio |
| FECHA_VENCIMIENTO | Due date | CUSTOMER | CustomerIntelligence | P1 | Due date tracking |
| FECHA_ULTIMO_PAGO | Last payment | CUSTOMER | CustomerIntelligence | P1 | Payment recency |

## INVENTARIO Domain (28 fields)

| SAG Field | Concept | Agentik Domain | Consumer Engines | Priority | Business Questions |
|---|---|---|---|---|---|
| CODIGO_ARTICULO | Product code | INVENTORY + PRODUCT | CoverageEngine | P1 | Product stock lookup |
| TALLA | Size | INVENTORY + PRODUCT | CoverageEngine | P1 | Variant-level stock |
| COLOR | Color | INVENTORY + PRODUCT | CoverageEngine | P1 | Variant-level stock |
| CODIGO_BODEGA | Warehouse code | INVENTORY | CoverageEngine, TransferEngine | P1 | Warehouse stock |
| EXISTENCIA | Stock on hand | INVENTORY | CoverageEngine, RotationEngine | P1 | "Cuantas unidades hay?" |
| DISPONIBLE | Available stock | INVENTORY | CoverageEngine | P1 | "Que esta disponible?" |
| RESERVADO | Reserved stock | INVENTORY | CoverageEngine | P1 | Reserved tracking |
| COMPROMETIDO | Committed stock | INVENTORY | CoverageEngine | P2 | Committed orders |
| TRANSITO | In-transit stock | INVENTORY | CoverageEngine | P2 | Transit tracking |
| COSTO_PROMEDIO | Average cost | INVENTORY | MarkdownEngine | P1 | Inventory valuation |
| COSTO_TOTAL_EXISTENCIA | Total cost | INVENTORY | (derived) | P2 | "Cuanto vale el inventario?" |
| DIAS_COBERTURA | Coverage days | INVENTORY | CoverageEngine | P1 | "Cuantos dias de stock?" |
| ACTIVO | Active flag | INVENTORY + PRODUCT | CoverageEngine | P1 | Active product filter |
| DESCONTINUADO | Discontinued | INVENTORY + PRODUCT | MarkdownEngine | P2 | Markdown candidates |
| BLOQUEADO_VENTA | Blocked | INVENTORY | CoverageEngine | P1 | Blocked stock |
| PROVEEDOR_PRINCIPAL | Main supplier | INVENTORY + PURCHASING | RepurchaseEngine | P2 | Supplier dependency |

## BANCOS Domain (28 fields)

| SAG Field | Concept | Agentik Domain | Consumer Engines | Priority | Business Questions |
|---|---|---|---|---|---|
| ID_MOVIMIENTO_BANCO | Movement ID | Finance | (Reconciliation) | P1 | Movement tracking |
| BANCO / NUMERO_CUENTA | Bank/Account | Finance | (Treasury) | P1 | Bank position |
| FECHA_MOVIMIENTO | Movement date | Finance | (Reconciliation) | P1 | Transaction timing |
| VALOR_DEBITO | Debit amount | Finance | (Reconciliation) | P1 | Cash outflow |
| VALOR_CREDITO | Credit amount | Finance | (Reconciliation) | P1 | Cash inflow |
| SALDO_ANTERIOR / SALDO_POSTERIOR | Balances | Finance | (Treasury) | P1 | Position tracking |
| CONCILIADO | Reconciled flag | Finance | (Reconciliation) | P1 | "Movimientos sin conciliar?" |
| ID_RECAUDO | Receipt FK | Finance + CUSTOMER | (Reconciliation) | P1 | Receipt matching |
| REFERENCIA_BANCARIA | Bank ref | Finance + CUSTOMER | (Reconciliation) | P1 | Cross-ref bridge |
| ESTADO_CONCILIACION | Recon status | Finance | (Reconciliation) | P1 | Reconciliation tracking |
| ID_CLIENTE / ID_FACTURA | Related entities | Finance + CUSTOMER + SALES | (Reconciliation) | P2 | Full traceability |

## COMPRAS Domain (47 fields)

| SAG Field | Concept | Agentik Domain | Consumer Engines | Priority | Business Questions |
|---|---|---|---|---|---|
| ID_COMPRA / NUMERO_OC | PO identity | PURCHASING_IMPORT | RepurchaseEngine | P2 | PO tracking |
| ID_PROVEEDOR / NIT_PROVEEDOR | Supplier | PURCHASING_IMPORT | RepurchaseEngine | P2 | Supplier analysis |
| CANTIDAD_ORDENADA / RECIBIDA / PENDIENTE | Quantities | PURCHASING_IMPORT | RepurchaseEngine | P2 | "Compras pendientes?" |
| PORCENTAJE_CUMPLIMIENTO | Fulfillment % | PURCHASING_IMPORT | RepurchaseEngine | P2 | "Proveedores que incumplen?" |
| VALOR_UNITARIO / VALOR_TOTAL | Values | PURCHASING_IMPORT | RepurchaseEngine | P2 | Purchase cost |
| FECHA_OC / FECHA_COMPROMISO / FECHA_RECEPCION | Dates | PURCHASING_IMPORT | RepurchaseEngine | P2 | Lead time |
| ESTADO_OC / OC_VENCIDA / DIAS_RETRASO | Status | PURCHASING_IMPORT | RepurchaseEngine | P2 | Overdue tracking |
| TIPO_COMPRA / ORIGEN_COMPRA | Classification | PURCHASING_IMPORT | RepurchaseEngine | P2 | National vs import |
| CONTENEDOR / GUIA_EMBARQUE / INCOTERM | Import logistics | PURCHASING_IMPORT | (future Logistics) | P3 | Import tracking |
| STOCK_PROYECTADO_POST_RECEPCION | Projected stock | PURCHASING_IMPORT + INVENTORY | CoverageEngine | P2 | "Stock despues de recepcion?" |
| COMPRA_SUGERIDA_POR_AGENTIK | AI suggestion | PURCHASING_IMPORT | RepurchaseEngine | P2 | AI replenishment |

## CLIENTES Domain (5 fields — NEEDS HARDENING)

| SAG Field | Concept | Agentik Domain | Consumer Engines | Priority | Business Questions |
|---|---|---|---|---|---|
| ID_CLIENTE | Customer ID | CUSTOMER | All | P1 | Customer identity |
| NIT | Customer NIT | CUSTOMER | All | P1 | Tax ID |
| RAZON_SOCIAL | Legal name | CUSTOMER | All | P1 | Display |
| SEGMENTO | Segment | CUSTOMER | CustomerIntelligence | P2 | Segmentation |
| PLAZO_CREDITO | Credit terms | CUSTOMER | RulesEvidenceEngine | P1 | Credit policy |

**Missing (need enterprise hardening):** Address, City, Department, Phone, Email, ContactPerson, Zone, Seller, CustomerType, Status, CreatedAt, UpdatedAt, CreditLimit, PaymentTerms, DeliveryTerms, TaxRegime, and ~20 more fields.

## PRODUCTOS Domain (62 fields)

| SAG Field | Concept | Agentik Domain | Consumer Engines | Priority | Business Questions |
|---|---|---|---|---|---|
| CODIGO_PRODUCTO / REFERENCIA / SKU | Product identity | PRODUCT | All | P1 | Product lookup |
| NOMBRE_COMERCIAL / NOMBRE_INTERNO | Names | PRODUCT | MarketingStudio | P1 | Display |
| MARCA / LINEA / SUBLINEA / CATEGORIA | Classification | PRODUCT | RotationEngine | P1 | Category analysis |
| COLOR / TALLA / PRESENTACION | Variants | PRODUCT | CoverageEngine | P1 | Variant management |
| PRECIO_LISTA / PRECIO_MINIMO | Prices | PRODUCT | MarkdownEngine | P1 | Pricing |
| MARGEN_OBJETIVO | Target margin | PRODUCT | MarkdownEngine, CommercialCopilot | P1 | "Productos de mas margen?" |
| MANEJA_INVENTARIO / MANEJA_TALLA_COLOR | Flags | PRODUCT | CoverageEngine | P1 | Inventory tracking |
| STOCK_MINIMO / STOCK_MAXIMO / PUNTO_REORDEN | Reorder params | PRODUCT + INVENTORY | RepurchaseEngine | P1 | "Productos a reabastecer?" |
| DESCRIPCION_MARKETING / TAGS_MARKETING | Marketing | PRODUCT | MarketingStudio | P2 | "Productos sin contenido?" |
| SEO_TITLE / SEO_DESCRIPTION / URL_SLUG | E-commerce | PRODUCT | MarketingStudio | P2 | E-commerce readiness |
| REQUIERE_PRODUCCION / TIEMPO_PRODUCCION | Production | PRODUCT + PURCHASING | ProductionSignalEngine | P2 | Production planning |
| PAIS_ORIGEN / CODIGO_ARANCELARIO | Import | PRODUCT + PURCHASING | RepurchaseEngine | P3 | Import classification |
| ACTIVO / DESCONTINUADO | Lifecycle | PRODUCT | All | P1 | "Productos descontinuados?" |
| ID_PROVEEDOR_PRINCIPAL | Supplier | PRODUCT + PURCHASING | RepurchaseEngine | P2 | "Proveedor unico?" |
| COSTO_ESTANDAR | Standard cost | PRODUCT | MarkdownEngine | P1 | Cost analysis |
| ES_IMPORTADO | Import flag | PRODUCT | RepurchaseEngine | P2 | "% importado?" |
| PRODUCTO_ESTRATEGICO | Strategic flag | PRODUCT | CommercialCopilot | P2 | Strategic products |

## PRODUCCION Domain (4 fields — NEEDS HARDENING)

| SAG Field | Concept | Agentik Domain | Consumer Engines | Priority | Business Questions |
|---|---|---|---|---|---|
| ID_OP | Production order ID | PURCHASING_IMPORT | ProductionSignalEngine | P3 | Production tracking |
| PRODUCTO_TERM | Finished product | PURCHASING_IMPORT + PRODUCT | ProductionSignalEngine | P3 | "Que se produjo?" |
| CANTIDAD_PROD | Units produced | PURCHASING_IMPORT | ProductionSignalEngine | P3 | "Cuantas unidades?" |
| COSTO_OP | Production cost | PURCHASING_IMPORT | ProductionSignalEngine | P3 | "Costo de produccion?" |

**Missing (need enterprise hardening):** OP status, start/end dates, bill of materials, raw material consumption (CN items), finished product entry (ET), production timeline, confeccionista assignment (PC/EC), warehouse movements (TR), quality control.

---

## Cross-Domain Join Matrix

| From Domain | To Domain | Join Key | Purpose |
|---|---|---|---|
| VENTAS | PRODUCTOS | ID_PRODUCTO / CODIGO_PRODUCTO | Product performance |
| VENTAS | CLIENTES | ID_CLIENTE / NIT_CLIENTE | Customer attribution |
| VENTAS | INVENTARIO | ID_PRODUCTO + ID_BODEGA | Stock impact |
| VENTAS | PAGOS | ID_FACTURA | Payment tracking |
| VENTAS | CARTERA | ID_FACTURA / NUMERO_FACTURA | Balance update |
| PAGOS | RECAUDOS | ID_PAGO / REFERENCIA_BANCARIA | Cash confirmation |
| PAGOS | BANCOS | REFERENCIA_BANCARIA / ID_MOVIMIENTO_BANCO | Bank reconciliation |
| RECAUDOS | BANCOS | ID_MOVIMIENTO_BANCO / REFERENCIA_BANCARIA | Receipt-bank match |
| CARTERA | CLIENTES | ID_CLIENTE | Customer risk profile |
| INVENTARIO | PRODUCTOS | CODIGO_ARTICULO / REFERENCIA | Product-stock link |
| COMPRAS | PRODUCTOS | ID_PRODUCTO / CODIGO_PRODUCTO | Supply chain |
| COMPRAS | INVENTARIO | BODEGA_DESTINO + PRODUCTO | Reception impact |
| PRODUCCION | PRODUCTOS | PRODUCTO_TERM | Production output |
| PRODUCCION | INVENTARIO | (via finished product) | Stock replenishment |
