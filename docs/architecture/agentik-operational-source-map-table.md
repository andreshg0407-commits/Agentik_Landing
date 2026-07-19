# Agentik Operational Source Map — Matriz Operacional
### Versión 1.0 — Mayo 2026

**Leyenda de Estado:**
- `confirmado` — flujo de datos verificado y funcionando
- `pendiente_sag` — requiere validación de campo/tabla SAG en reunión técnica
- `interno_agentik` — completamente dentro de Agentik, sin dependencia SAG directa
- `crm` — fuente es conector CRM
- `futuro` — planificado, no implementado

**Leyenda de Prioridad:**
- `crítica` — bloquea operación si falla
- `alta` — impacto operacional diario
- `media` — importante para inteligencia/analytics
- `baja` — enriquecimiento / nice-to-have

**SAG_CONFIRMAR** = campo o tabla no validado aún con SAG PYA Castillitos.

---

## D01 — Torre de Control

| KPI / Entidad | Definición operacional | Evento origen | Source of Truth | Fuente SAG posible | Frecuencia | Prioridad | Consumido por | Generado por Agentik | Estado |
|---|---|---|---|---|---|---|---|---|---|
| Estado operacional global | Semáforo 0–100 del negocio en tiempo real | FinancialRuntimeSnapshot | Agentik | — | 15m | crítica | Dashboard ejecutivo, Copilot | ✓ FinancialRuntimeSnapshot | `interno_agentik` |
| Alertas activas | Lista de alertas operacionales con severidad | BusinessAlert, CopilotSignalRecord | Agentik | — | en tiempo real | crítica | Torre de Control, Copilot | ✓ BusinessAlert | `interno_agentik` |
| Integridad del grafo financiero | % de nodos del grafo sin problemas críticos | FinancialRuntimeSnapshot.graphIntegrityPct | Agentik | — | 15m | alta | Finanzas, Cierre | ✓ | `interno_agentik` |
| Salud de conciliación | % de movimientos bancarios conciliados | FinancialRuntimeSnapshot.reconciliationHealth | Agentik | — | 15m | alta | Tesorería, Cierre | ✓ | `interno_agentik` |

---

## D02 — Comercial / Coberturas

| KPI / Entidad | Definición operacional | Evento origen | Source of Truth | Fuente SAG posible | Frecuencia | Prioridad | Consumido por | Generado por Agentik | Estado |
|---|---|---|---|---|---|---|---|---|---|
| Portafolio de venta activo | Bag asignada a un vendedor con referencias y cantidades comprometidas | VendorCommercialBag.status = active | Agentik | — | event-driven | crítica | Vendedores, Torre de Control | ✓ VendorCommercialBag | `interno_agentik` |
| Ítem de portafolio | Referencia en una bag con qty asignada, mínima e ideal | VendorBagItem | Agentik | — | event-driven | crítica | Presión operacional, Inventario | ✓ VendorBagItem | `interno_agentik` |
| Cobertura por referencia | Disponible operacional vs. mínimo por vendedor | CommercialCoverageSnapshot + VendorBagItem | Agentik (cálculo) | SAG INVENTARIO (physicalQty) | sync manual V1 / ODBC V2 | crítica | Producción, Torre de Control | ✓ CommercialCoverageSnapshot | `pendiente_sag` |
| Presión operacional | Señal de urgencia cuando stock < mínimo en portafolios activos | CommercialProductionSignal | Agentik | — | event-driven | crítica | Coordinador, Copilot | ✓ CommercialProductionSignal | `interno_agentik` |
| Stock muerto | Referencia con physicalQty > 0 y demanda = 0 | CommercialDeadStockSignal | Agentik | SAG INVENTARIO (saldo) | diaria | media | Producción, Finanzas | ✓ CommercialDeadStockSignal | `pendiente_sag` |
| Caso de cobertura | Asignación vendedor × referencia × temporada | CommercialCase / CommercialCaseItem | Agentik | — | event-driven | alta | Portafolio, Conciliación | ✓ CommercialCase | `interno_agentik` |
| Snapshot ventas por vendedor | Perfil operacional histórico del representante | CommercialSalesRepProfileSnapshot | Agentik | SaleRecord (FUENTE_1) | semanal | media | Inteligencia Operacional | ✓ | `confirmado` |

---

## D03 — Inventario

| KPI / Entidad | Definición operacional | Evento origen | Source of Truth | Fuente SAG posible | Frecuencia | Prioridad | Consumido por | Generado por Agentik | Estado |
|---|---|---|---|---|---|---|---|---|---|
| Saldo físico en bodega | Unidades físicamente presentes por referencia y bodega según SAG | SAG INVENTARIO (tabla SALDO/EXISTENCIA) | **SAG** | `SELECT * FROM INVENTARIO` — tabla `SAG_CONFIRMAR`, campo `SAG_CONFIRMAR` | diaria (V1 manual), continua (V2 ODBC) | crítica | Disponibilidad operacional, Portafolio, Producción | ✗ (SAG es SOT) | `pendiente_sag` |
| Disponibilidad operacional | physicalQty − reservedQty − salesAssignedQty − pendingTransfersQty | OperationalInventoryItem (cálculo Agentik) | **Agentik** | SAG physicalQty como input | on-demand | crítica | CRM pedidos, Portafolio, Inteligencia Operacional | ✓ OperationalInventoryItem | `pendiente_sag` (physicalQty) |
| disponible SAG | Valor reportado por SAG — informacional, no usado como verdad operacional | SAG INVENTARIO.disponible (o SALDO) | SAG (referencia) | `SAG_CONFIRMAR` — ¿descuenta PD? | diaria | media | Diagnóstico, Comparación | ✗ almacenado como sagReportedAvailableQty | `pendiente_sag` |
| Reserva operacional | Unidades bloqueadas por Agentik para pedido o portafolio antes de SAG PD | OperationalReservation (Agentik) | **Agentik** | — | event-driven | crítica | Disponibilidad, Portafolio | ✓ OperationalReservation | `interno_agentik` |
| Catálogo de artículos | Maestro de productos con código, descripción, línea, grupo, precio | ProductSnapshot ← SAG ARTICULOS | **SAG** | `SELECT * FROM ARTICULOS` — status `pending` | semanal | alta | Portafolio, CRM, Customer 360 | ✗ (SAG SOT) | `pendiente_sag` |
| Snapshot por bodega | Saldos segregados por bodega para análisis de distribución | CommercialCoverageSnapshot.bodega | SAG por bodega | `SELECT * FROM INVENTARIO WHERE BODEGA = '{bodega}'` — `SAG_CONFIRMAR` | diaria | media | Logística, Producción | ✗ | `pendiente_sag` |
| Costo promedio | Costo de valorización por referencia en bodega | SAG INVENTARIO.COSTO_PROMEDIO | **SAG** | `SAG_CONFIRMAR` — ¿en INVENTARIO o en ARTICULOS? | semanal | media | Finanzas, Margen | ✗ | `pendiente_sag` |

---

## D04 — Producción

| KPI / Entidad | Definición operacional | Evento origen | Source of Truth | Fuente SAG posible | Frecuencia | Prioridad | Consumido por | Generado por Agentik | Estado |
|---|---|---|---|---|---|---|---|---|---|
| Señal de producción | Alerta: referencia con stock < mínimo en ≥1 portafolio activo | CommercialProductionSignal | Agentik | — | event-driven | crítica | Coordinador producción, Copilot | ✓ CommercialProductionSignal | `interno_agentik` |
| Orden de producción SAG | OP registrada en SAG con estado y cantidad | SAG OP (tabla `SAG_CONFIRMAR`) | **SAG** | Tabla OPs: `SAG_CONFIRMAR` | diaria | alta | Inventario (al completar), Producción | ✗ | `futuro` |
| Completación de OP | SAG completó OP → inventario físico aumenta | SAG OP.estado = COMPLETADA | **SAG** | `SAG_CONFIRMAR` | event-driven (V3) / polling (V2) | alta | Inventario, Producción, Torre de Control | ✗ (trigger hacia CommercialProductionSignal) | `futuro` |
| Presión de producción agregada | Total de unidades faltantes × urgencia por línea | CommercialProductionSignal (agregado) | Agentik | — | diaria | alta | Coordinador, Finanzas (COGS estimado) | ✓ | `interno_agentik` |
| Stock muerto por línea | Referencias sin rotación > N días con saldo físico | CommercialDeadStockSignal | Agentik | SAG INVENTARIO (base) | semanal | media | Finanzas, Producción | ✓ CommercialDeadStockSignal | `pendiente_sag` |

---

## D05 — Cartera (Cuentas por Cobrar)

| KPI / Entidad | Definición operacional | Evento origen | Source of Truth | Fuente SAG posible | Frecuencia | Prioridad | Consumido por | Generado por Agentik | Estado |
|---|---|---|---|---|---|---|---|---|---|
| Saldo de cartera por cliente | Total adeudado por NIT según SAG CARTERA | SAG CARTERA (SELECT * FROM CARTERA) | **SAG** | `SELECT * FROM CARTERA` — status `validated` | diaria | crítica | Cobranza, Tesorería, Customer 360 | ✗ importado como CustomerReceivable | `confirmado` |
| Días de mora | Número de días de atraso por documento en SAG | SAG CARTERA.DIAS_MORA | **SAG** | Campo `DIAS_MORA` — validado | diaria | crítica | Scoring cobranza, Alertas | ✗ almacenado en CustomerReceivable | `confirmado` |
| Cartera vencida | Documentos con DIAS_MORA > 0 | SAG CARTERA.DIAS_MORA > 0 | **SAG** | `SELECT * FROM CARTERA WHERE DIAS_MORA > 0` — status `pending` | diaria | crítica | Cobranza, Finanzas | ✗ | `pendiente_sag` |
| Cartera total activa | Suma de saldos de todos los documentos abiertos | CustomerReceivable (importado de SAG) | SAG | CARTERA query | diaria | crítica | Tesorería, P&L, Torre de Control | ✗ | `confirmado` |
| Apertura de cartera | Factura FUENTE_1 emitida → crea CustomerReceivable | SaleRecord.sagSourceType = OFICIAL | SAG (vía SaleRecord) | SaleRecord import | al importar | crítica | Cartera, Conciliación | ✓ CustomerReceivable (de SaleRecord) | `confirmado` |
| Imputación de pago | Aplicación de un pago a una factura específica | PaymentAllocation | Agentik (lógica) | SAG MOVIMIENTOS confirma | event-driven | alta | Cobranza, Conciliación | ✓ PaymentAllocation | `confirmado` |

---

## D06 — Cobranza

| KPI / Entidad | Definición operacional | Evento origen | Source of Truth | Fuente SAG posible | Frecuencia | Prioridad | Consumido por | Generado por Agentik | Estado |
|---|---|---|---|---|---|---|---|---|---|
| Recibo de caja | Pago recibido y registrado en SAG (R1/R2/RS) | SAG MOVIMIENTOS.comprobanteCode IN ('R1','R2','RS') | **SAG** | `SELECT * FROM MOVIMIENTOS` (parcialmente validado para FUENTE_1/FUENTE_2) | diaria | crítica | Tesorería, Conciliación, Cartera | ✗ importado como CollectionRecord | `confirmado` |
| Gestión de cobranza | Acción de seguimiento por cliente y documento vencido | CopilotSignalRecord, agente Laura | Agentik | — | diaria | alta | Cobranza, Customer 360 | ✓ CopilotSignalRecord | `interno_agentik` |
| Scoring de cobranza | Prioridad de gestión (riesgo × monto × mora) | CollectionRecord + CustomerReceivable | Agentik | — | diaria | alta | Agente cobranza, Torre de Control | ✓ (calculado) | `interno_agentik` |
| Asignación de cobro | CollectionAllocation — pagos parciales → facturas abiertas | CollectionAllocation | Agentik | SAG MOVIMIENTOS confirma | event-driven | alta | Conciliación, Finanzas | ✓ CollectionAllocation | `confirmado` |
| Recaudo del día | Suma de CollectionRecord.amount del día en curso | CollectionRecord.collectionDate = hoy | **SAG** (via sync) | MOVIMIENTOS filtrado por fecha | diaria | crítica | Tesorería, Torre de Control | ✗ | `confirmado` |

---

## D07 — Tesorería

| KPI / Entidad | Definición operacional | Evento origen | Source of Truth | Fuente SAG posible | Frecuencia | Prioridad | Consumido por | Generado por Agentik | Estado |
|---|---|---|---|---|---|---|---|---|---|
| Movimiento bancario | Entrada o salida en extracto bancario | BankMovement (CSV/OFX/manual) | **Banco** (extracto) | SAG no expone saldos bancarios — `SAG_CONFIRMAR` | diaria (extracto) | crítica | Conciliación bancaria, Tesorería | ✗ importado como BankMovement | `confirmado` |
| Saldo bancario actual | Balance después del último movimiento por cuenta | BankMovement.balanceAfter (último) | Banco (extracto) | `SAG_CONFIRMAR` | diaria | crítica | Torre de Control, Tesorería | ✓ (calculado de BankMovement) | `confirmado` |
| Posición de caja proyectada | Saldo actual + entradas esperadas − salidas esperadas (N días) | FinancialRuntimeSnapshot.liquidityScore | Agentik | CustomerReceivable (cobros esperados) | 15m | crítica | Decisiones ejecutivas, Copilot | ✓ FinancialRuntimeSnapshot | `interno_agentik` |
| Conciliación bancaria | Cruce BankMovement vs. CollectionRecord vs. SAG | BankReconciliation | Agentik | MOVIMIENTOS SAG vs. BankMovement banco | diaria | crítica | Finanzas, Cierre | ✓ BankReconciliation | `confirmado` |
| Días de cobertura operacional | Días que el saldo actual puede cubrir gastos a ritmo histórico | FinancialRuntimeSnapshot (calculado) | Agentik | — | 15m | crítica | Ejecutivo, Copilot | ✓ | `interno_agentik` |
| Cuentas bancarias registradas | Catálogo de cuentas con nombre, banco, tipo, moneda | BankAccount | Agentik | `SAG_CONFIRMAR` (SAG puede tener cuentas registradas) | estático | alta | Tesorería, Conciliación | ✓ BankAccount | `interno_agentik` |

---

## D08 — Finanzas / Cierre

| KPI / Entidad | Definición operacional | Evento origen | Source of Truth | Fuente SAG posible | Frecuencia | Prioridad | Consumido por | Generado por Agentik | Estado |
|---|---|---|---|---|---|---|---|---|---|
| Ingresos reconocidos (ventas) | Suma de SaleRecord FUENTE_1 del período | SaleRecord.sagSourceType = OFICIAL | **SAG** (via SaleRecord) | DOCUMENTOS / FUENTES.xlsx | al importar / diaria | crítica | P&L, Presupuesto, Cierre | ✗ (SAG SOT via import) | `confirmado` |
| Pipeline de conversión (remisiones) | Suma de SaleRecord FUENTE_2 — demanda despachada pendiente facturar | SaleRecord.sagSourceType = REMISION | SAG (via SaleRecord) | DOCUMENTOS / FUENTES.xlsx | al importar / diaria | alta | Forecast, Finanzas, CRM | ✗ | `confirmado` |
| Tasa de conversión F2→F1 | % de remisiones que se convierten a factura oficial | SaleRecord FUENTE_2 → FUENTE_1 match | Agentik (cálculo) | — | semanal | alta | Finanzas, Copilot, Forecast | ✓ (calculado) | `confirmado` |
| Presupuesto vivo | Presupuesto con períodos, líneas y ejecución | Budget | Agentik | — | event-driven | alta | Finanzas, Cierre, Copilot | ✓ Budget | `interno_agentik` |
| Ejecución vs. presupuesto | Desvío entre SaleRecord real y Budget.lines | SaleRecord vs. Budget (cruce Agentik) | Agentik (cálculo) | — | diaria | alta | Finanzas, Ejecutivo | ✓ | `interno_agentik` |
| Cierre de período | Consolidación documental con todos los módulos | ReconciliationSession (tipo = cierre) | Agentik | SAG como input | mensual | crítica | Contabilidad, Ejecutivo | ✓ ReconciliationSession | `confirmado` |
| Margen bruto estimado | Ingresos F1 − Costo promedio SAG por referencia | SaleRecord + INVENTARIO.COSTO_PROMEDIO | Agentik (cálculo) | `SAG_CONFIRMAR` costo | mensual | alta | Finanzas, Ejecutivo | ✓ (parcial — costo pendiente SAG) | `pendiente_sag` |

---

## D09 — CRM / Pedidos

| KPI / Entidad | Definición operacional | Evento origen | Source of Truth | Fuente SAG posible | Frecuencia | Prioridad | Consumido por | Generado por Agentik | Estado |
|---|---|---|---|---|---|---|---|---|---|
| Oportunidad comercial | Pipeline deal: cliente × monto estimado × etapa | CRMOpportunity | **CRM** | — | event-driven (CRM push) | alta | Finanzas, Customer 360, Copilot | ✗ | `crm` |
| Cotización | Propuesta formal con líneas de precio confirmado | CRMQuote / CRMQuoteLine | **CRM** | SAG LISTAS_PRECIOS para validar precio | event-driven | alta | Pedidos, Inventario, Customer 360 | ✗ | `crm` |
| Pedido en CRM | Orden capturada en CRM antes de pasar a SAG | CustomerOrderRecord | **CRM** | — | event-driven | crítica | OperationalReservation, Inventario | ✗ | `crm` |
| Reserva pre-SAG | Bloqueo de inventario para pedido confirmado en CRM | OperationalReservation | **Agentik** | — | event-driven | crítica | Disponibilidad, Portafolio | ✓ OperationalReservation | `interno_agentik` |
| Pedido enviado a SAG | Confirmación → SAG PD via SagWriteOperation | SagWriteOperation.type = PD | SAG (una vez confirmado) | PEDIDOS SAG / `SAG_CONFIRMAR` | manual V1, automático V4 | alta | Inventario SAG, Cobranza futura | ✓ SagWriteOperation | `futuro` |
| Pipeline de demanda | Suma de órdenes CRM activas como señal de demanda futura | CustomerOrderRecord (aggregate) | CRM + Agentik | — | diaria | alta | Producción, Inventario, Forecast | ✓ (señal hacia CommercialProductionSignal) | `crm` |

---

## D10 — Customer 360

| KPI / Entidad | Definición operacional | Evento origen | Source of Truth | Fuente SAG posible | Frecuencia | Prioridad | Consumido por | Generado por Agentik | Estado |
|---|---|---|---|---|---|---|---|---|---|
| Perfil del cliente | Datos maestros: NIT, nombre, ciudad, vendedor, condición de pago | CustomerProfile ← SAG TERCEROS | **SAG** | `SELECT * FROM TERCEROS` — status `validated` | diaria | alta | Customer 360, CRM, Cartera | ✗ importado como CustomerProfile | `confirmado` |
| Historial de compras | Documentos SAG por NIT: FV, NC, REM | SaleRecord filtrado por NIT | SAG (via SaleRecord) | `SELECT * FROM DOCUMENTOS WHERE NIT = '{nit}'` — placeholder | diaria | alta | Customer 360, Cobranza, CRM | ✗ | `pendiente_sag` |
| Saldo de cartera por cliente | Deuda vigente del cliente (todos los documentos abiertos) | CustomerReceivable filtrado por NIT | SAG (via CustomerReceivable) | `SELECT * FROM CARTERA WHERE NIT = '{nit}'` — status `pending` | diaria | alta | Customer 360, Cobranza | ✗ | `pendiente_sag` |
| Pipeline CRM activo | Oportunidades y cotizaciones abiertas del cliente | CRMOpportunity, CRMQuote | CRM | — | event-driven | media | Customer 360, Vendedor | ✗ | `crm` |
| Scoring de riesgo | Puntaje de comportamiento de pago y mora histórica | Agentik (de CollectionRecord + CustomerReceivable) | Agentik | — | semanal | media | Cobranza, CRM, Portafolio | ✓ (calculado) | `interno_agentik` |

---

## D11 — Logística

| KPI / Entidad | Definición operacional | Evento origen | Source of Truth | Fuente SAG posible | Frecuencia | Prioridad | Consumido por | Generado por Agentik | Estado |
|---|---|---|---|---|---|---|---|---|---|
| Remisión emitida | Despacho físico confirmado (FUENTE_2) — producto salió de bodega | SaleRecord.sagSourceType = REMISION | **SAG** | DOCUMENTOS TIPO_DOC = REM (confirmación pendiente) | al importar | alta | Inventario (ajuste), Cartera (pre-factura), Customer 360 | ✗ | `pendiente_sag` |
| Catálogo de bodegas | Lista de bodegas SAG con código y nombre | `SAG_CONFIRMAR` | **SAG** | `SAG_CONFIRMAR` — tabla BODEGAS o similar | estático | media | Inventario por bodega, Logística | ✗ | `pendiente_sag` |
| Traslado entre bodegas | Movimiento de stock bodega A → bodega B en SAG | `SAG_CONFIRMAR` | **SAG** | Movimientos de traslado: `SAG_CONFIRMAR` | diaria | media | Inventario, Producción | ✗ | `futuro` |
| Portafolio como ruta de despacho | VendorCommercialBag como proxy de "lote de despacho" a un vendedor | VendorCommercialBag | Agentik | — | event-driven | media | Logística, Cobertura | ✓ VendorCommercialBag | `interno_agentik` |

---

## D12 — Inteligencia Operacional

| KPI / Entidad | Definición operacional | Evento origen | Source of Truth | Fuente SAG posible | Frecuencia | Prioridad | Consumido por | Generado por Agentik | Estado |
|---|---|---|---|---|---|---|---|---|---|
| Snapshot de inteligencia | Estado operacional de todas las referencias con why[], impacts[], suggestions[] | OperationalIntelligenceSnapshot | Agentik | todos los dominios como input | on-demand / 15m | crítica | Torre de Control, Copilot, Dashboard | ✓ OperationalIntelligenceSnapshot | `interno_agentik` |
| Señal de referencia crítica | Referencia con status = critical o pressure activa | OperationalIntelligenceReference.status | Agentik | CommercialCoverageSnapshot + OperationalReservation | on-demand | crítica | Copilot (Diego/David), Coordinador | ✓ | `interno_agentik` |
| Señal de copilot | Señal activa generada por motor de inteligencia para un agente | CopilotSignalRecord | Agentik | — | event-driven | alta | Copilot (7 agentes), Torre de Control | ✓ CopilotSignalRecord | `interno_agentik` |
| Demanda comercial | Señal de demanda agregada por referencia desde portafolios y órdenes CRM | CommercialDemandSignal (calculado) | Agentik | — | diaria | alta | Producción, Forecast, Inventario | ✓ | `interno_agentik` |

---

## D13 — Conciliación

| KPI / Entidad | Definición operacional | Evento origen | Source of Truth | Fuente SAG posible | Frecuencia | Prioridad | Consumido por | Generado por Agentik | Estado |
|---|---|---|---|---|---|---|---|---|---|
| Sesión de conciliación | Conciliación de un período y tipo (ventas vs banco, cartera vs cobros) | ReconciliationSession | Agentik | SaleRecord, BankMovement, CollectionRecord, CustomerReceivable | semanal / mensual | crítica | Finanzas, Cierre, Auditoría | ✓ ReconciliationSession | `confirmado` |
| Evento de reconciliación | Resultado de cruzar dos registros (MATCH, MISMATCH, ONLY_IN_A...) | ReconciliationEvent | Agentik | — | por sesión | alta | Cierre, Auditoría, Copilot | ✓ ReconciliationEvent | `confirmado` |
| Excepción de conciliación | Item que no pudo ser conciliado automáticamente — requiere revisión humana | ReconciliationException | Agentik | — | por sesión | alta | Coordinador Finanzas, Copilot | ✓ ReconciliationException | `confirmado` |
| Cruce banco vs SAG | BankMovement vs CollectionRecord: banco dice X, SAG dice Y | BankReconciliation | Agentik | SAG MOVIMIENTOS, extracto bancario | diaria | crítica | Tesorería, Cierre | ✓ BankReconciliation | `confirmado` |

---

*Sprint: AGENTIK-OPERATIONAL-SOURCE-MAP-01*
*Para uso en reunión técnica SAG × Agentik × Negocio*
*Los campos marcados `SAG_CONFIRMAR` requieren validación antes de ODBC V2*
