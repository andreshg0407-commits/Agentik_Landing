# CLIENTES 360 — Sprint Report

**Sprint:** CLIENTES-360-01
**Generated:** 2026-07-03
**Tenant:** Castillitos
**TSC Baseline:** 160 (maintained)

---

## Objective

Convert Comercial > Clientes into an operational 360 module where a user can open
any customer and understand: who they are, where they are, who serves them, what orders
they have, whether they owe money, when their last activity was, and what commercial
opportunities exist.

---

## Phase Completion

| Phase | Deliverable | Status |
|---|---|---|
| 1 | `/comercial/clientes/[clienteId]` route | COMPLETE |
| 2 | `cliente-360-loader.ts` | COMPLETE |
| 3 | Header 360 (name, NIT, city, status, seller, confidence) | COMPLETE |
| 4 | KPI strip (6 reliable KPIs) | COMPLETE |
| 5 | Pedidos (CRM + SAG combined table) | COMPLETE |
| 6 | Cartera (receivables with aging) | COMPLETE |
| 7 | Historial comercial (sales + collections) | COMPLETE |
| 8 | Composicion comercial (product line aggregation) | COMPLETE |
| 9 | Oportunidades (5 rule-based signals) | COMPLETE |
| 10 | Updated list table (8 columns + 360 link) | COMPLETE |
| 11 | Empty states per block | COMPLETE |
| 12 | Documentation (this file) | COMPLETE |

---

## Data Sources Used

| Source | Model | Join Key | Used For |
|---|---|---|---|
| CustomerProfile | Prisma | `id` (direct) | Profile, identity, status |
| CRMQuote | Prisma | `rawCrmJson.raw.billing_account_id` = profile.crmId | CRM orders, seller, stage (customerId FK is null on all 285 quotes) |
| CustomerOrderRecord | Prisma | `customerNit` = profile.nit | SAG orders |
| SaleRecord | Prisma | `customerNit` = profile.nit | Facturas, remisiones, product lines |
| CustomerReceivable | Prisma | `customerId` FK | Cartera, aging, overdue |
| CollectionRecord | Prisma | `customerId` FK | Cobros |
| CRM rawCrmJson | JSON field | `raw.billing_address_city` | City (DANE), `raw.id_sag_c` (traceability), `raw.stage` (lifecycle) |

---

## Reliable Fields (shown in UI)

| Field | Source | Trust |
|---|---|---|
| Nombre | CustomerProfile.name | ALTA |
| NIT | CustomerProfile.nit | ALTA |
| Ciudad | CRM DANE code via dane-municipios.ts | ALTA (90% resolved) |
| Estado | CustomerProfile.status | ALTA |
| Vendedor principal | CRM quote history via client-seller-linker | MEDIA (60%+ confidence threshold) |
| Confianza vendedor | Computed from quote distribution | MEDIA |
| Pedidos CRM | CRMQuote count | MEDIA (sync stopped Mar 2026) |
| Pedidos SAG | CustomerOrderRecord via NIT | ALTA |
| Stage CRM | rawCrmJson.raw.stage | ALTA |
| Cartera total/vencida | CustomerReceivable aggregates | MEDIA (98% overdue is suspicious) |
| Facturas | SaleRecord where sagSourceType=OFICIAL | ALTA |
| Ultima compra | Max date across all sources | ALTA |

## Fields NOT Available (not shown)

| Field | Reason |
|---|---|
| Ventas L12 | Never calculated — totalSalesL12 is 0% populated |
| Margen | No cost data available |
| Frecuencia de compra | Not calculated |
| Segmento RFM | Not implemented |
| SAG city name | SAG ka_ni_ciudad is internal FK, no lookup table |

---

## Opportunity Rules

| ID | Type | Trigger | Explanation |
|---|---|---|---|
| `opp_inactivo` | inactividad | No activity > 90 days | Shows days since last movement |
| `opp_cartera_vencida` | cartera | Any overdue receivables | Shows count, total, max days |
| `opp_no_facturado` | conversion | CRM quotes not Facturado/Anulado | Shows count and stages |
| `opp_sin_vendedor` | asignacion | Confidence < 60% | Explains why (no quotes or low confidence) |
| `opp_sag_sin_crm` | trazabilidad | SAG orders exist, no CRM quotes | Seller may not be using CRM |

Each opportunity includes a `reason` field explaining why it was triggered with specific data.

---

## Files Created/Modified

### New files

| File | Purpose |
|---|---|
| `lib/comercial/clientes/cliente-360-loader.ts` | Full 360 data loader |
| `app/.../clientes/[clienteId]/page.tsx` | Server route |
| `app/.../clientes/[clienteId]/cliente-360-client.tsx` | 360 detail UI |
| `app/.../clientes/[clienteId]/not-found-client.tsx` | Not-found state |

### Modified files

| File | Change |
|---|---|
| `lib/comercial/clientes/client-loader.ts` | Added `sellerConfidence`, seller resolution from CRM quotes |
| `app/.../clientes/clientes-client.tsx` | 8-column table, 360 link, city/seller/last activity columns |

---

## Empty States

| Block | Empty Message |
|---|---|
| Cliente not found | "El cliente solicitado no existe o no pertenece a esta organizacion" |
| Pedidos | "Sin pedidos registrados — No hay pedidos CRM ni SAG vinculados" |
| Cartera | "Sin cartera registrada — No hay facturas pendientes de cobro" |
| Historial | "Sin historial comercial — No hay facturas, remisiones ni cobros" |
| Composicion | "Pendiente de consolidar — Se requiere historial de SaleRecord con productLine" |
| Oportunidades | "Sin oportunidades detectadas — No se identificaron oportunidades con los datos actuales" |
| List filter empty | "Sin resultados para [search]" / "Sin clientes con filtro [filter]" |

---

## Limitations

1. **CRM sync stopped since March 2026** — CRM quotes are historical only
2. **SAG orders join via NIT** — only works for profiles with NIT (86.8%)
3. **Cartera data** — 98% overdue is suspicious, may be inflated
4. **Seller linking** — only 145/33,203 customers have CRM quote history
5. **Product lines** — depends on SaleRecord.productLine being populated
6. **Collections** — depends on CollectionRecord.customerId FK being set
7. **CRMQuote.customerId** — FK is null on all 285 quotes. Join uses `billing_account_id → crmId` instead
