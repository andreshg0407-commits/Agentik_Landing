# MALETAS-BULK-REPLENISHMENT-01 — Sprint Report

## Problema corregido

La unidad operativa de surtido era el **reemplazo individual**:
- Una oportunidad -> un reemplazo -> un documento.
- Sin trazabilidad consolidada.
- Sin historial operativo.
- Sin concepto de campana de surtido.

La operacion real de Castillitos:
- Bodega revisa una maleta completa.
- Retira multiples referencias.
- Agrega multiples referencias.
- Genera una unica guia de surtido.
- Despacha todo el paquete al vendedor.

## Nueva unidad operativa

**Plan de surtido de maleta** — reemplaza al reemplazo individual.

## Modelo de datos

### MaletaReplenishmentPlan

| Campo | Tipo | Descripcion |
|---|---|---|
| id | string | ID unico |
| organizationId | string | Org del tenant |
| vendorId | string | ID del vendedor |
| vendorName | string | Nombre del vendedor |
| warehouseCode | string | Bodega asignada |
| status | ReplenishmentPlanStatus | Estado del plan |
| createdAt | string | Fecha creacion |
| updatedAt | string | Ultima actualizacion |
| createdBy | string | Usuario creador |
| notes | string | Observaciones |
| items | MaletaReplenishmentItem[] | Cambios del plan |
| summaryAddedRefs | number | Total referencias entrantes |
| summaryRemovedRefs | number | Total referencias salientes |
| documentNumber | string | null | Numero de documento (asignado al generar) |
| events | ReplenishmentEvent[] | Trazabilidad |

### MaletaReplenishmentItem

| Campo | Tipo | Descripcion |
|---|---|---|
| id | string | ID unico |
| planId | string | FK al plan |
| subgroupSag | string | Subgrupo SAG |
| removedReference | string | null | Referencia que sale |
| removedDescription | string | null | Descripcion |
| addedReference | string | Referencia que entra |
| addedDescription | string | Descripcion |
| quantity | number | Cantidad |
| reason | string | Motivo |
| createdAt | string | Fecha |

## Estados del plan

| Estado | Descripcion |
|---|---|
| draft | Borrador — acumulando cambios |
| pending_warehouse | Documento generado, esperando preparacion |
| prepared | Bodega preparo el paquete |
| shipped | Enviado al vendedor |
| received | Recibido por el vendedor |
| cancelled | Cancelado |

## Flujo operativo

```
1. Revisar oportunidades de cobertura
2. Click "+ Plan" en cada oportunidad
3. Seleccionar maleta/vendedor
4. Seleccionar referencia que sale (opcional)
5. Confirmar → se agrega al plan draft del vendedor
6. Repetir para multiples oportunidades (se acumulan en el mismo plan)
7. Abrir plan del vendedor (badge en la tarjeta)
8. Revisar todos los cambios
9. "Generar documento de surtido" → status = pending_warehouse
10. Imprimir guia
11. "Marcar como enviado" → status = shipped
12. "Marcar como recibido" → status = received
13. Consultar historial meses despues
```

## Regla: no duplicar planes draft

Si ya existe un plan con status=draft para un vendedor, **no se crea otro**. Los nuevos cambios se agregan al plan existente.

## Historial de surtidos

Nueva pestana con:
- Filtro por estado (draft, pending, shipped, received, cancelled)
- Filtro por vendedor
- Lista cronologica de todos los planes
- Acceso al detalle y PDF de cada plan

## KPIs de dashboard

| KPI | Descripcion |
|---|---|
| Planes draft | Planes en construccion |
| Pendientes bodega | Documentos generados sin preparar |
| Enviados | Paquetes en transito |
| Recibidos | Surtidos completados |

## Trazabilidad

Cada plan registra eventos con:
- Tipo (created, item_added, item_removed, document_generated, dispatched, received, cancelled)
- Descripcion
- Usuario
- Timestamp

## Cobertura recuperada

Cada plan muestra:
- Referencias agregadas
- Referencias retiradas
- Subgrupos cubiertos
- Cobertura estimada recuperada (+N)

## Documento PDF

Guia de surtido con:
1. Cabecera: numero, fecha, vendedor, bodega, estado
2. Resumen: refs agregadas, retiradas, subgrupos, cobertura
3. Tabla "Referencias a agregar": referencia, descripcion, subgrupo, cantidad
4. Tabla "Referencias a retirar": referencia, descripcion, cantidad
5. Firmas: Preparo, Despacho, Recibio
6. Fechas: entrega, recepcion

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `replenishment-plan-types.ts` | NUEVO: tipos MaletaReplenishmentPlan, MaletaReplenishmentItem, ReplenishmentEvent, CoverageRecovery, helpers |
| `maletas-client.tsx` | Plan state, getDraftPlan, addItemToPlan, removeItemFromPlan, generatePlanDocument, updatePlanStatus, PlanDrawerContent, HistoryDrawerContent, PrintPlanOverlay, VendorCard con badge de plan, gap action alimenta plan |

## Compatibilidad

Todos los flujos anteriores siguen funcionando:
- ProductionDetailDrawer
- CoverageGapRow
- ProductionRow
- ReplacementDetailPanel
- PrintGuideOverlay (legacy)
- VendorIntelligencePanel

## TSC baseline

160 (sin cambios).

## Validacion

95 checks, 95 PASS.
