# PEDIDOS_DATA_AUDIT.md

COMMERCIAL-DATA-AUDIT-01 -- Fase 4: Auditoria de Datos Pedidos

---

## Fuentes de Datos

### Fuente 1: CRM (SuiteCRM V8)

| Metrica | Valor |
|---|---|
| CRMQuote total | 285 |
| CRMQuoteLine total | 27,064 |
| Lineas promedio por quote | 95.0 |
| Rango de fechas | 2026-01-21 a 2026-03-18 |
| Ultima actividad | Marzo 18, 2026 (3+ meses sin sync) |

#### Estado de Quotes

| Status | Cantidad | % |
|---|---|---|
| DRAFT | 285 | 100% |
| SENT | 0 | 0% |
| ACCEPTED | 0 | 0% |
| REJECTED | 0 | 0% |

**TODOS los quotes son DRAFT. No hay progresion de ciclo de vida.**

#### Completitud de CRMQuote

| Campo | Poblado | % | Observaciones |
|---|---|---|---|
| crmId | 285 | 100% | OK |
| status | 285 | 100% | Siempre DRAFT |
| amount > 0 | 283 | 99.3% | 2 quotes con monto 0 |
| sellerName | 285 | 100% | 8 vendedores distintos |
| sellerSlug | 285 | 100% | Derivado de sellerName |
| customerId | **0** | **0%** | **NINGUNA quote esta vinculada a un CustomerProfile** |
| issuedAt | 285 | 100% | OK |

### Fuente 2: SAG (Pedidos de Distribucion - PD)

| Metrica | Valor |
|---|---|
| CustomerOrderRecord total | 9,522 |
| CustomerOrderLine total | 1,138,155 |
| Lineas promedio por order | 119.5 |
| Rango de fechas | 2020-06-11 a 2026-06-26 |
| Ultima actividad | Junio 26, 2026 (activo) |

#### Estado de Orders SAG

| Status | Cantidad | % |
|---|---|---|
| FACTURADO | 9,511 | 99.9% |
| PENDIENTE | 10 | 0.1% |
| CANCELADO | 1 | 0.0% |

#### Completitud de CustomerOrderRecord

| Campo | Poblado | % | Observaciones |
|---|---|---|---|
| erpMovId | 9,522 | 100% | PK estable de SAG |
| orderNumber | 9,522 | 100% | n_numero_documento |
| customerNit | 9,522 | 100% | ka_nl_tercero como string |
| customerName | 9,522 | 100% | sc_beneficiario |
| amount > 0 | 9,513 | 99.9% | OK |
| orderDate | 9,522 | 100% | d_fecha_documento |
| status | 9,522 | 100% | Mayoria FACTURADO |
| rawJson | 9,522 | 100% | Fila SAG completa para trazabilidad |

---

## Flujo Real Confirmado

```
FUENTE A: CRM (SuiteCRM)
  AOS_Quotes (ventas de vendedores en campo)
    |
    v (sync adapter)
  CRMQuote (285 registros, all DRAFT)
    |
    X  No vinculo CRMQuote → CustomerOrderRecord
    X  No campo sagDocNumber en Prisma schema
    X  id_sag_c solo en rawCrmJson.raw.id_sag_c (JSON)

FUENTE B: SAG (ERP)
  MOVIMIENTOS (fuente 40, clase 4 = PD)
    |
    v (sync adapter)
  CustomerOrderRecord (9,522 registros, 99.9% FACTURADO)
    |
    X  NO LEIDO POR LA UI DE PEDIDOS
    X  Solo alimenta reconciliacion y produccion

FUENTE C: Agentik (UI)
  OrderWizard en pedidos-client.tsx
    |
    v (order-service.ts :: createOrderDraft())
  AgentExecution (module=comercial, operation=COMERCIAL_ORDER_DRAFT)
    | metadataJson blob (no modelo tipado)
```

**HALLAZGO CRITICO: La UI de Pedidos lee FUENTE A + FUENTE C, pero IGNORA FUENTE B.**

`listOrders()` en order-service.ts concatena AgentExecution + CRMQuote. Los 9,522 CustomerOrderRecord (SAG PD reales) NO aparecen en el workspace de Pedidos.

**Hipotesis CRM → Reserva SAG → Pedido Operativo: NO CONFIRMADA en datos.**

La relacion CRM → SAG existe conceptualmente pero:
1. CRMQuote.customerId = null (no vincula a cliente)
2. No hay campo `sagDocNumber` en Prisma schema (solo en rawCrmJson.raw.id_sag_c)
3. Los 285 quotes CRM son Ene-Mar 2026; los 9,522 SAG PD cubren 2020-2026
4. Los flujos son independientes en la practica actual
5. CRMQuote.status (Prisma enum) esta MUERTO — la UI lee rawCrmJson.raw.stage en su lugar

---

## Problemas Criticos

### P0 — CRM sync detenido desde Marzo 2026

Ultimo quote sincronizado: 2026-03-18. Han pasado 3+ meses sin nuevos datos CRM.

**Impacto:** El modulo Pedidos muestra 285 quotes de Ene-Mar 2026 como si fueran los pedidos actuales. El "banner SAG" dice "sincronizacion en validacion" pero en realidad esta detenida.

### P0 — CRMQuote.customerId nunca vinculado

0% de quotes tienen customerId. Esto rompe:
- Vista de pedidos por cliente
- KPI "Clientes con cartera" que depende de cruce
- computeVendorCustomerSummary() que cruza quotes con CustomerProfile

**Causa probable:** El CRM sync (CRMQuoteStorageHandler) intenta vincular via opportunityId o billing_account_id, pero ambas estrategias fallan porque no hay oportunidad previa o el account ID CRM no matchea el CustomerProfile.crmId.

### P0 — Todos los quotes son DRAFT

El CRM no actualiza el estado de las quotes. Una vez sincronizadas quedan en DRAFT indefinidamente.

**Impacto:** El KPI "Pedidos pendientes de sincronizacion SAG" en Control Comercial siempre muestra 285.

### P1 — No hay vinculo CRM → SAG

No existe campo ni logica que vincule un CRMQuote con el CustomerOrderRecord (PD) que se genera en SAG despues de la legalizacion.

**Impacto:** No es posible trazar el ciclo de vida completo del pedido: cotizacion → pedido → despacho → factura.

### P1 — CustomerOrderRecord INVISIBLE en UI de Pedidos

Los 9,522 pedidos SAG reales (CustomerOrderRecord) NO se muestran en el workspace de Pedidos. `listOrders()` solo lee AgentExecution + CRMQuote. El usuario ve 285 quotes CRM stale pero NO ve los pedidos SAG operativos.

### P1 — Tercer almacen de pedidos sin modelo tipado

Los pedidos creados en Agentik se guardan en `AgentExecution.metadataJson` (JSON blob). No hay integridad referencial, no hay indices sobre campos de negocio, no hay dedup con CRMQuote.

### P1 — CRMQuote.status (Prisma enum) vs rawCrmJson.raw.stage

La UI ignora el campo `status` del schema Prisma y lee `rawCrmJson.raw.stage` en su lugar. Esto significa que las queries de Control Comercial (`status: "DRAFT"`) pueden no coincidir con lo que muestra la UI.

### P2 — SAG Orders son mayoritariamente historicos

El 99.9% de los CustomerOrderRecord son FACTURADO. Solo 10 estan PENDIENTE. Los datos son validos pero son mas un archivo historico que un estado operativo actual.

### P2 — listOrders() tiene cap de 500 registros

Ambas fuentes usan `take: 500`. Los stats son aproximados para tenants con mas de 500 pedidos por fuente.

---

## Confianza General

| Aspecto | Confianza |
|---|---|
| CRMQuote como fuente de pedidos actuales | **BAJA** (sync detenido, all DRAFT, sin vinculo a cliente) |
| CustomerOrderRecord como historico SAG | **ALTA** (9,522 registros completos, datos SAG nativos) |
| Vinculo CRM → SAG | **NULA** (no implementado) |
| KPIs de pedidos en Control Comercial | **BAJA** (basado en CRMQuote stale + all DRAFT) |
| Lineas de pedido (CRMQuoteLine) | **ALTA** (27,064 lineas con ref, precio, talla, color) |
| Lineas SAG (CustomerOrderLine) | **ALTA** (1,138,155 lineas detalladas) |
