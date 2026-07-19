# VENDEDORES DATA AUDIT — Sprint Report

**Sprint:** VENDEDORES-DATA-AUDIT-01
**Generated:** 2026-07-03
**Tenant:** Castillitos
**TSC Baseline:** 160 (maintained)

---

## 1. Vendedores Reales Detectados

### Maestro desde CRMQuote (fuente primaria)

| # | Vendedor | Slug | Cotizaciones | Clientes | Ultimo movimiento |
|---|---|---|---|---|---|
| 1 | Luis Orlando Naranjo | luis-orlando-naranjo | 91 | 33 | 2026-03-17 |
| 2 | Nestor Fernando Alzate Jimenez | nestor-fernando-alzate-jimenez | 74 | 41 | 2026-03-18 |
| 3 | Carlos Villa | carlos-villa | 34 | 20 | 2026-03-13 |
| 4 | Carlos Agudelo | carlos-agudelo | 32 | 25 | 2026-03-15 |
| 5 | Manuela Tamayo Perez | manuela-tamayo-perez | 26 | 12 | 2026-03-18 |
| 6 | Fredy Velez | fredy-velez | 25 | 18 | 2026-03-16 |
| 7 | Juan Valencia | juan-valencia | 2 | 2 | 2026-03-13 |
| 8 | Yuliana Ospina Tabares | yuliana-ospina-tabares | 1 | 1 | 2026-02-23 |

**8 vendedores unicos. Cero duplicados detectados.**

### Registro en Maletas (VENDOR_BODEGA_CONFIGS)

| vendorId | Display | Bodega SAG | Activo | sagName confirmado |
|---|---|---|---|---|
| ORLANDO | Orlando | 45 | SI | "LUIS ORLANDO NARANJO" |
| CARLOS_LEON | Carlos Leon | 46 | SI | null |
| LUIS | Luis | 47 | NO | null |
| NESTOR | Nestor | 48 | SI | "NESTOR ALZATE" |
| CARLOS_VILLA | Carlos Villa | 49 | SI | null |
| FREDY | Fredy | 50 | NO | null |

**6 vendedores en registro de maletas. Solo 2 con sagName confirmado (ORLANDO, NESTOR).**

### Mapeo CRM → Maletas (propuesto)

| CRM sellerName | vendorId (maletas) | Confianza |
|---|---|---|
| Luis Orlando Naranjo | ORLANDO | ALTA (sagName confirmado) |
| Nestor Fernando Alzate Jimenez | NESTOR | ALTA (sagName confirmado) |
| Carlos Villa | CARLOS_VILLA | ALTA (nombre exacto) |
| Fredy Velez | FREDY | ALTA (nombre exacto) |
| Carlos Agudelo | CARLOS_LEON | MEDIA (necesita confirmacion) |
| Manuela Tamayo Perez | — | NO MAPEADO (no tiene maleta) |
| Juan Valencia | — | NO MAPEADO (no tiene maleta) |
| Yuliana Ospina Tabares | — | NO MAPEADO (no tiene maleta) |

---

## 2. Fuentes Encontradas

| Fuente | Campo vendedor | Volumen | Calidad | Observaciones |
|---|---|---|---|---|
| CRMQuote.sellerName | sellerName | 285/285 (100%) | ALTA | Fuente primaria. 8 vendedores distintos. |
| CRMQuote.sellerSlug | sellerSlug | 285/285 (100%) | ALTA | Slug estable para join. |
| CRMQuote.rawCrmJson | assigned_user_name | 285 | ALTA | UUID de CRM (assigned_user_id) disponible. |
| CustomerProfile.sellerName | sellerName | 18/33,203 (0.05%) | MUY BAJA | Casi vacio. No usable como fuente. |
| SaleRecord.sellerSlug | sellerSlug | 0/128,636 (0%) | NO USABLE | Hardcoded "sin-vendedor" en SAG adapter. |
| SaleRecord.sellerName | sellerName | 128,636 | NO USABLE | Todos con valor "sin-vendedor". |
| SaleRecord.sellerCode | sellerCode | — | NO USABLE | No poblado desde SAG. |
| CustomerOrderRecord | NINGUNO | 9,522 rows | N/A | No tiene campo vendedor. |
| CustomerReceivable | NINGUNO | 128,471 rows | N/A | No tiene campo vendedor. Linkable via customerId. |
| CollectionRecord | NINGUNO | 21,053 rows | N/A | No tiene campo vendedor. Linkable via customerId. |
| CommercialSalesRepProfileSnapshot | salesRepId, salesRepName | 0 rows | VACIO | Tabla existe pero sin datos. |
| CommercialCase | salesRepId, salesRepName | — | OPERACIONAL | Datos de maletas, no comerciales directos. |
| VendorCommercialBag | salesRepId | — | OPERACIONAL | Portafolio de maleta por vendedor. |
| Budget (dimension=SELLER) | dimensionKey=sellerSlug | — | NO POBLADO | Esquema existe, sin datos de metas. |

---

## 3. Relaciones Confiables

### Clientes por Vendedor

| Metrica | Valor |
|---|---|
| Total CustomerProfiles | 33,203 |
| Con crmId | 30,235 |
| Con cotizaciones CRM (asignables) | 146 |
| Con vendedor confiable (>=60%) | 141 |
| Con multiples vendedores | 6 |
| Sin datos de vendedor | 33,057 |

**Solo 146 de 33,203 clientes tienen cotizaciones CRM para determinar vendedor.** Los 33,057 restantes son clientes SAG sin actividad CRM.

### Clientes por vendedor (confiables)

| Vendedor | Clientes |
|---|---|
| Nestor Fernando Alzate Jimenez | 40 |
| Luis Orlando Naranjo | 33 |
| Carlos Agudelo | 21 |
| Carlos Villa | 19 |
| Fredy Velez | 15 |
| Manuela Tamayo Perez | 12 |
| Juan Valencia | 1 |
| **Total** | **141** |

### Pedidos CRM por Vendedor

| Vendedor | Cotizaciones | Con link SAG (id_sag_c) |
|---|---|---|
| Luis Orlando Naranjo | 91 | — |
| Nestor Fernando Alzate Jimenez | 74 | — |
| Carlos Villa | 34 | — |
| Carlos Agudelo | 32 | — |
| Manuela Tamayo Perez | 26 | — |
| Fredy Velez | 25 | — |
| Juan Valencia | 2 | — |
| Yuliana Ospina Tabares | 1 | — |
| **Total** | **285** | **272 (95.4%)** |

### Pedidos CRM por Estado

| Stage | Cantidad |
|---|---|
| Facturado | 142 |
| Gestionado_Parcialmente | 48 |
| No_Gestionado | 46 |
| Remisionado | 31 |
| Anulado | 12 |
| Pendiente | 5 |
| Confirmado | 1 |

---

## 4. Relaciones Debiles

### Ventas (SaleRecord → Vendedor)

**ESTADO CRITICO:** Los 128,636 registros de SaleRecord tienen `sellerSlug: "sin-vendedor"` porque el adapter SAG SOAP (`lib/connectors/adapters/sag-pya-soap/storage.ts:475`) hardcodea ese valor.

El esquema Prisma SaleRecord **tiene** los campos `sellerCode`, `sellerSlug`, `sellerName` y un indice `[organizationId, sellerSlug, saleDate]`. Estan preparados pero no poblados.

**Solucion futura:** El adapter SAG necesita extraer el campo vendedor del export SAG (vw_agentik_ventas) cuando PYA lo implemente.

### Pedidos SAG (CustomerOrderRecord → Vendedor)

**NO LINKABLE DIRECTAMENTE.** CustomerOrderRecord no tiene campo vendedor. Solo tiene `customerNit` y `customerName`.

**Link indirecto:** CustomerOrderRecord.customerNit → CustomerProfile → CRMQuote.billing_account_id → sellerName. Confianza BAJA (solo 146 clientes tienen link CRM).

### Cartera (CustomerReceivable → Vendedor)

**NO LINKABLE DIRECTAMENTE.** No tiene campo vendedor.

**Link indirecto:** CustomerReceivable.customerId → CustomerProfile.crmId → CRMQuote.billing_account_id → sellerName.

| Metrica | Valor |
|---|---|
| Total documentos cartera | 128,471 |
| Linkables a CRM (tienen crmId) | 104,714 |
| Clientes linkables | 27,217 |
| Saldo total linkable | $29,648M COP |

**ADVERTENCIA:** Marcado como PROVISIONAL SAG. Cartera definitiva depende de PYA.

### Recaudos (CollectionRecord → Vendedor)

**NO LINKABLE DIRECTAMENTE.** No tiene campo vendedor.

**Link indirecto:** CollectionRecord.customerId → CustomerProfile → CRMQuote → sellerName.

| Metrica | Valor |
|---|---|
| Total registros | 21,053 |
| Valor total | $26,082M COP |
| Campos disponibles | documentNumber, collectionDate, amount, appliedStatus, bankReference |

---

## 5. Datos No Disponibles

### Metas Comerciales

**NO EXISTEN.** No hay tablas de targets, metas, quotas ni goals en el esquema.

El modelo `Budget` tiene un enum `BudgetDimension` con valor `SELLER`, pero no hay datos poblados con dimension=SELLER.

**Dependencia:** `vw_agentik_vendedores.META_MENSUAL` de PYA.

### Comisiones

**NO EXISTEN.** No hay tablas de comisiones en el esquema.

Existe un modelo `PayrollFact` comentado en el esquema con campos `commissionBase` y `commissionRate`, pero no esta activo.

**Dependencia:** Reglas de negocio del cliente (porcentajes, bases, excepciones).

### Supervisor / Zona / Territorio

**NO EXISTEN** en datos actuales. El tipo `VendorIdentity` tiene campo `zone: string | null` pero siempre es null.

**Dependencia:** `vw_agentik_vendedores` de PYA.

### Costos y Margenes

**NO EXISTEN.** SaleRecord no tiene campos `cost`, `unitCost`, `margin` ni `grossMargin`.

---

## 6. Dependencia PYA

| Vista PYA | Para que | Estado |
|---|---|---|
| vw_agentik_vendedores | Perfil, meta, supervisor, zona | NO DISPONIBLE |
| vw_agentik_ventas | Ventas con vendedor poblado (sellerCode) | NO DISPONIBLE |
| vw_agentik_cartera | Cartera con vendedor directo | NO DISPONIBLE |
| vw_agentik_pagos | Pagos con referencia bancaria | NO DISPONIBLE |
| vw_agentik_recaudos | Recaudos vinculados a vendedor | NO DISPONIBLE |

---

## 7. Matriz de Confianza

| Bloque | Confianza | Fuente | Notas |
|---|---|---|---|
| **Perfil vendedor** | MEDIA | CRMQuote.sellerName + slug | Sin supervisor, zona, meta. Solo nombre y slug. |
| **Clientes registrados** | ALTA | CRMQuote billing_account_id | 141 clientes con vendedor confiable. 33K sin link. |
| **Pedidos CRM** | ALTA | CRMQuote.sellerName | 285 cotizaciones, 100% con vendedor, 95% con link SAG. |
| **Pedidos SAG** | BAJA | Via NIT join indirecto | CustomerOrderRecord no tiene campo vendedor. |
| **Ventas** | NO USABLE | SaleRecord.sellerSlug="sin-vendedor" | 128K registros sin vendedor. Adapter SAG no lo pobla. |
| **Cartera** | PROVISIONAL SAG | Via customer join | 104K docs linkables, pero PROVISIONAL hasta PYA. |
| **Recaudos** | PENDIENTE PYA | Via customer join | 21K docs. Sin vendedor directo. |
| **Metas** | PENDIENTE PYA | vw_agentik_vendedores | No existe tabla ni datos. |
| **Comisiones** | NO DISPONIBLE | Sin reglas definidas | Modelo PayrollFact comentado. |
| **Inteligencia** | MEDIA | Derivable de CRM + cartera | Clientes, pedidos, cartera derivable. Ventas bloqueado. |

---

## 8. Inteligencia Disponible Ahora

Indicadores construibles HOY con datos existentes:

| Indicador | Fuente | Confianza |
|---|---|---|
| Clientes activos por vendedor | CRMQuote → billing_account_id | ALTA |
| Pedidos CRM por vendedor | CRMQuote.sellerName | ALTA |
| Estado pedidos por vendedor | CRMQuote stage | ALTA |
| Pedidos sin facturar por vendedor | CRM stage != Facturado/Anulado | ALTA |
| Clientes sin compra reciente | lastPurchaseAt > 90d | MEDIA |
| Cartera por vendedor | customer join | PROVISIONAL SAG |
| Maleta activa (refs, agotados, salud) | CommercialCase/VendorBag | ALTA (4 activos) |
| Link CRM → SAG via id_sag_c | 272/285 = 95.4% | ALTA |

### Indicadores NO construibles ahora

| Indicador | Bloqueado por |
|---|---|
| Ventas mes/L12 por vendedor | SaleRecord sin vendedor poblado |
| Ticket promedio por vendedor | SaleRecord sin vendedor |
| Recaudos por vendedor | Sin campo vendedor en CollectionRecord |
| Cumplimiento de meta | Sin tabla de metas |
| Comisiones | Sin reglas de negocio |
| Ranking por ventas | SaleRecord sin vendedor |
| Score vendedor | Requiere ventas + metas + cartera |

---

## 9. Tipos LiveVendor Ya Existentes

El archivo `lib/comercial/vendors/vendor-types.ts` ya define un sistema completo de tipos:

- `VendorIdentity` — id, name, sagName, slug, zone, active
- `VendorCommercialKpis` — salesToday/Week/Month, goal, ranking, etc.
- `VendorActiveCaseSnapshot` — maleta activa
- `VendorCustomerSummary` — clientes activos, visitados, con cartera
- `VendorOrderSummary` — pedidos hoy, abiertos, bloqueados
- `VendorFulfillment` — tasa de cumplimiento
- `VendorAlert` — 8 tipos de alertas
- `VendorRecommendation` — 8 tipos de recomendaciones
- `LiveVendor` — entidad completa ensamblada
- `VendorCard` — tarjeta ligera para listado
- `VendorTeamDashboard` — dashboard de equipo

**El sistema de tipos ya esta listo para un Drawer Vendedor 360.** Lo que falta son datos.

---

## 10. Recomendacion para VENDEDORES-360-01

### Fase inmediata (sin PYA)

Un Drawer Vendedor 360 puede construirse HOY con:

1. **Perfil:** nombre, slug, maleta asociada (si aplica), activo/inactivo
2. **Clientes:** lista de clientes asignados (141 total, 15-40 por vendedor)
3. **Pedidos CRM:** tabla completa con estados, fechas, valores, link SAG
4. **Cartera cliente:** cartera agregada por vendedor via customer join (PROVISIONAL SAG)
5. **Maleta:** snapshot de portafolio de maleta (para los 4 activos con maleta)
6. **Oportunidades:** pedidos sin facturar, clientes inactivos, clientes sin vendedor

### Bloqueadores criticos

1. **SaleRecord sin vendedor** — El adapter SAG en `lib/connectors/adapters/sag-pya-soap/storage.ts:475` hardcodea `sellerSlug: "sin-vendedor"`. Esto bloquea: ventas mes, ticket promedio, ranking, cumplimiento. **Solucion:** Cuando PYA entregue vw_agentik_ventas con campo vendedor, actualizar el adapter.

2. **Metas inexistentes** — Sin tabla de metas. No se puede calcular cumplimiento. **Solucion:** Esperar vw_agentik_vendedores de PYA, o implementar input manual (Budget dimension=SELLER).

3. **sagName incompleto en maletas** — Solo 2 de 6 vendedores tienen sagName confirmado. Los otros 4 necesitan confirmacion manual para vincular CRM → maleta.

### Prioridad de activacion

| Prioridad | Accion | Impacto |
|---|---|---|
| P0 | Confirmar sagName para CARLOS_LEON, CARLOS_VILLA, FREDY, LUIS | Completa el mapeo CRM → maletas |
| P1 | Construir Drawer con datos CRM + cartera + maleta | Drawer funcional sin ventas |
| P2 | Solicitar vw_agentik_ventas con campo vendedor a PYA | Desbloquea ventas por vendedor |
| P3 | Solicitar vw_agentik_vendedores a PYA | Desbloquea metas y supervisor |
| P4 | Definir reglas de comisiones con cliente | Desbloquea liquidacion |
