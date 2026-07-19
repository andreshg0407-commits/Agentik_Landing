# COMMERCIAL_DATA_AUDIT_MASTER.md

COMMERCIAL-DATA-AUDIT-01 -- Entregable Final

Fecha: 2026-07-03
Tenant: Castillitos
TSC: No modificado (audit puro, 0 cambios de codigo)

---

## Inventario de Datos Vivos

| Tabla Prisma | Registros | Origen | Frecuencia Sync |
|---|---|---|---|
| CustomerProfile | 33,203 | SAG TERCEROS + CRM Accounts | ERP: activo, CRM: activo |
| CustomerReceivable | 128,471 | SAG MOVIMIENTOS | activo |
| CRMQuote | 285 | CRM AOS_Quotes | **detenido Mar 2026** |
| CRMQuoteLine | 27,064 | CRM AOS_Products_Quotes | **detenido Mar 2026** |
| CustomerOrderRecord | 9,522 | SAG MOVIMIENTOS (PD) | activo (Jun 26) |
| CustomerOrderLine | 1,138,155 | SAG MOVIMIENTOS_ITEMS | activo |
| CommercialCoverageSnapshot | 15,309 | Maletas engine pipeline | intermitente (3 dias) |
| CommercialCase | **0** | Maletas engine (nunca persistido) | nunca |
| CommercialCaseItem | **0** | Maletas engine (nunca persistido) | nunca |

**Total registros comerciales en DB: 1,357,009**

---

## Fase 8 -- Matriz de Confianza

| Campo | Fuente | Completitud | Confianza |
|---|---|---|---|
| **CLIENTES** | | | |
| Clientes.nombre | SAG TERCEROS + CRM | 100% | ALTA |
| Clientes.nit | SAG TERCEROS + CRM | 99.3% | ALTA |
| Clientes.city | SAG TERCEROS | 97.3% | **BAJA** (codigos DANE, no nombres) |
| Clientes.sellerName | CRM (no escrito) | **0.1%** | **NULA** |
| Clientes.status | Default ACTIVE | 100% | **BAJA** (sin segmentacion) |
| Clientes.totalSalesL12 | No calculado | **0.0%** | **NULA** |
| Clientes.lastPurchaseAt | No calculado | **0.0%** | **NULA** |
| Clientes.totalReceivable | CustomerReceivable join | ~87% | MEDIA |
| Clientes.overdueReceivable | CustomerReceivable join | ~87% | **BAJA** (98% overdue sospechoso) |
| Clientes.identityStatus | Identity engine | 100% | ALTA |
| **VENDEDORES** | | | |
| Vendedores.lista | Hardcoded (4 de 8 reales) | 50% | **BAJA** |
| Vendedores.ventas | CRMQuote.sellerSlug | parcial | **MEDIA** (solo 3 match) |
| Vendedores.clientes | CustomerProfile.sellerSlug | **0%** | **NULA** |
| Vendedores.maleta | CommercialCase | **0%** | **NULA** |
| Vendedores.pedidos | CRMQuote via sellerSlug | parcial | MEDIA |
| Vendedores.cumplimiento | Calculado pero sin datos | 0% | NULA |
| **PEDIDOS** | | | |
| Pedidos.CRM.status | CRM sync | 100% | **NULA** (todos DRAFT) |
| Pedidos.CRM.amount | CRM sync | 99.3% | ALTA |
| Pedidos.CRM.seller | CRM sync | 100% | ALTA |
| Pedidos.CRM.customer | CRM sync | **0%** | **NULA** (nunca vinculado) |
| Pedidos.SAG.status | SAG MOVIMIENTOS | 100% | ALTA |
| Pedidos.SAG.amount | SAG MOVIMIENTOS | 99.9% | ALTA |
| Pedidos.SAG.customer | SAG MOVIMIENTOS | 100% | ALTA |
| Pedidos.SAG.lines | SAG MOVIMIENTOS_ITEMS | 100% | ALTA |
| Pedidos.CRM_to_SAG | No implementado | **0%** | **NULA** |
| Pedidos.AgentExecution | metadataJson blob | desconocido | **BAJA** (sin modelo tipado) |
| Pedidos.SAG_en_UI | CustomerOrderRecord | **0%** | **NULA** (UI no lee SAG) |
| **INVENTARIO** | | | |
| Inventario.disponible | SAG via engine | 100% | ALTA |
| Inventario.linea | SAG via engine | 100% | ALTA |
| Inventario.dailyVelocity | No calculado | **0%** | **NULA** |
| Inventario.coverageDays | No calculado | **0%** | **NULA** |
| Inventario.status | Engine (depende velocidad) | 100% | **BAJA** (76% sin_datos_velocidad) |
| Inventario.subgrupoSag | SAG enrichment | 67.7% | MEDIA |
| Inventario.pendingOrdersQty | SAG PD demand | 1.0% | BAJA |
| **MALETAS** | | | |
| Maletas.cases_DB | CommercialCase | **0%** | **NULA** |
| Maletas.items_DB | CommercialCaseItem | **0%** | **NULA** |
| Maletas.runtime | Engine en vivo | 100% en UI | MEDIA |
| Maletas.cobertura | CommercialCoverageSnapshot | via Inventario | ALTA (disponible) |
| Maletas.riesgo | Engine calculo | runtime only | MEDIA (no persiste) |
| **CONTROL COMERCIAL** | | | |
| Control.pedidosTotales | CRMQuote | 285 | BAJA |
| Control.pedidosPendientes | CRMQuote DRAFT | 285 (falso positivo) | **NULA** |
| Control.refsCriticas | CoverageSnapshot | 730 | ALTA |
| Control.refsAgotadas | CoverageSnapshot | 727 | ALTA |
| Control.vendedoresActivos | CommercialCase | 0 | **NULA** |
| Control.maletasEnRiesgo | CommercialCase | 0 | **NULA** |
| Control.clientesActivos | CustomerProfile | 33,203 | MEDIA |
| Control.clientesConCartera | CustomerReceivable | ~28,801 | BAJA |

---

## Fase 9 -- Hallazgos Criticos

### 1. Datos APTOS para produccion

| Dato | Justificacion |
|---|---|
| Clientes: nombre, NIT | 99%+ completo, 0 duplicados NIT, datos SAG reales |
| Inventario: disponible, linea | Dato real de SAG, clasificacion agotadas/criticas confiable |
| Pedidos SAG: CustomerOrderRecord | 9,522 registros completos con lineas detalladas |
| Pedidos CRM: lineas (CRMQuoteLine) | 27,064 lineas con referencia, precio, talla, color |
| Identity engine | 86% VERIFIED, proceso de dedup funcionando |

### 2. Datos que REQUIEREN correccion

| Dato | Problema | Impacto |
|---|---|---|
| Clientes.city | Codigos DANE, no nombres | UI muestra numeros sin sentido |
| Clientes.overdueReceivable | 98% overdue es sospechoso | KPI "con cartera" posiblemente inflado |
| Inventario.status | 76% "sin_datos_velocidad" | Status no discrimina realmente |
| CRMQuote.status | Todos DRAFT permanentemente | Falso positivo en Control Comercial |
| Vendedores.registro | 4 de 8 reales | Modulo incompleto |

### 3. Datos que REQUIEREN integracion nueva

| Dato | Integracion faltante |
|---|---|
| Clientes.sellerName | CRM sync debe escribir vendedor asignado |
| Clientes.totalSalesL12 | Cron de consolidacion desde CRMQuote/SaleRecord |
| Clientes.lastPurchaseAt | Derivar de ultima CRMQuote o SaleRecord |
| Inventario.dailyVelocity | Calcular desde SaleRecord por referencia |
| CRMQuote.customerId | Resolver vinculo quote → customer en CRM sync |
| CRM → SAG link | Campo sagDocNumber en CRMQuote para trazar ciclo |
| SAG en Pedidos UI | listOrders() debe incluir CustomerOrderRecord | Pedidos | Alto |
| SaleRecord.sellerName | SAG sync debe extraer identidad de vendedor | Vendedores | Alto |
| CommercialCase persistence | Invocar persistFullMaletasSnapshot() |

### 4. Datos que DEBEN ocultarse temporalmente

| Dato | Razon |
|---|---|
| KPI "Pedidos pendientes" en Control | Falso positivo permanente (285 DRAFT) |
| KPI "Vendedores activos" en Control | Siempre 0 (CommercialCase vacia) |
| KPI "Maletas en riesgo" en Control | Siempre 0 (CommercialCase vacia) |
| Card "Maletas" en Control | Los 3 KPIs son 0 |
| Columna "Vendedor" en Clientes | 0.1% poblado |
| Columna "Ventas L12" en Clientes | 0% poblado |
| Columna "Ciudad" en Clientes | Muestra codigos DANE |
| Filtros "Inactivos" y "Prospectos" en Clientes | Siempre vacios (todos ACTIVE) |
| Status "sin_datos_velocidad" en Inventario | No aporta informacion util |
| Alerta "pedidos pendientes" en Control | Fatiga de alerta |

---

## Fase 10 -- Roadmap de Correccion

### P0 -- Errores que afectan produccion

| # | Tarea | Modulo | Esfuerzo |
|---|---|---|---|
| P0-1 | Traducir codigos DANE a nombres de ciudad en Clientes | Clientes | Bajo (tabla lookup) |
| P0-2 | Ocultar KPIs de Maletas en Control Comercial (CommercialCase vacia) | Control | Bajo |
| P0-3 | Reemplazar pedidos CRM con pedidos SAG en Control Comercial | Control | Medio |
| P0-4 | Eliminar alerta falsa de "pedidos pendientes" o cambiar fuente a SAG | Control | Bajo |
| P0-5 | Actualizar registro de vendedores (4 → 8 reales del CRM) | Vendedores | Bajo |

### P1 -- Datos incompletos visibles al usuario

| # | Tarea | Modulo | Esfuerzo |
|---|---|---|---|
| P1-1 | CRM sync: escribir sellerName/sellerSlug en CustomerProfile | Clientes/Vendedores | Medio |
| P1-2 | Calcular totalSalesL12 y lastPurchaseAt (cron o sync hook) | Clientes | Medio |
| P1-3 | CRM sync: resolver customerId en CRMQuote | Pedidos | Medio |
| P1-4 | Invocar persistFullMaletasSnapshot() en pipeline de maletas | Maletas | Bajo |
| P1-5 | Implementar cron de snapshot diario para inventario | Inventario | Medio |
| P1-6 | Investigar y corregir 98% overdue en CustomerReceivable | Clientes | Alto |
| P1-7 | Ocultar o marcar campos sin datos (Ventas L12, Vendedor en tabla Clientes) | Clientes | Bajo |

### P2 -- Mejoras futuras

| # | Tarea | Modulo | Esfuerzo |
|---|---|---|---|
| P2-1 | Calcular dailyVelocity desde SaleRecord por referencia | Inventario | Alto |
| P2-2 | Implementar status lifecycle para CRMQuote (DRAFT→SENT→ACCEPTED) | Pedidos | Alto |
| P2-3 | Vincular CRMQuote con CustomerOrderRecord (CRM→SAG traceability) | Pedidos | Alto |
| P2-4 | Modelo Prisma CommercialSalesRep (reemplazar hardcoded) | Vendedores | Medio |
| P2-5 | Completar subgrupoSag para 32.3% faltante | Inventario | Medio |
| P2-6 | Implementar segmentacion de clientes (ACTIVE→INACTIVE por recencia) | Clientes | Medio |
| P2-7 | Umbrales de inventario configurables por tenant | Inventario | Bajo |

---

## Resumen Ejecutivo por Modulo

| Modulo | Listo para produccion? | Confianza datos | Accion inmediata |
|---|---|---|---|
| **Clientes** | Parcial | MEDIA | Traducir DANE, ocultar campos vacios |
| **Vendedores** | **No** | BAJA | Actualizar registro, arreglar CRM link |
| **Pedidos** | Parcial | MEDIA (SAG) / BAJA (CRM) | Usar SAG como fuente primaria |
| **Inventario** | **Si** (parcial) | ALTA (stock) / NULA (velocidad) | Listo para disponible/agotadas |
| **Maletas** | Solo runtime | MEDIA (UI) / NULA (DB) | Persistir snapshots |
| **Control Comercial** | **No** | BAJA | Ocultar KPIs sin datos, cambiar fuente pedidos |

---

## Entregables Producidos

| Archivo | Fase |
|---|---|
| COMMERCIAL_DATA_FLOW.md | Fase 1 — Inventario de datasources |
| CLIENTES_DATA_AUDIT.md | Fase 2 — Auditoria clientes |
| VENDEDORES_DATA_AUDIT.md | Fase 3 — Auditoria vendedores |
| PEDIDOS_DATA_AUDIT.md | Fase 4 — Auditoria pedidos |
| INVENTARIO_DATA_AUDIT.md | Fase 5 — Auditoria inventario |
| MALETAS_DATA_AUDIT.md | Fase 6 — Auditoria maletas |
| CONTROL_COMERCIAL_AUDIT.md | Fase 7 — Auditoria control comercial |
| COMMERCIAL_DATA_AUDIT_MASTER.md | Fases 8-10 — Matriz, hallazgos, roadmap |
