# MALETAS-BULK-REPLENISHMENT-PERSISTENCE-01

**Sprint:** Persistencia de Planes de Surtido de Maleta
**Estado:** COMPLETO
**TSC Baseline:** 160 (sin regresiones)
**Validacion:** 77/77 PASS

---

## Objetivo

Migrar los planes de surtido de maleta de `useState` (perdidos al refrescar) a persistencia completa en base de datos con trazabilidad de eventos.

**Criterio de exito:** Si no sobrevive al refresh, el sprint no esta completo.

---

## Archivos creados

| Archivo | Proposito |
|---|---|
| `prisma/schema.prisma` (modificado) | 3 modelos nuevos: MaletaReplenishmentPlan, MaletaReplenishmentItem, MaletaReplenishmentEvent |
| `prisma/migrations/20260716000000_maleta_replenishment_plans/migration.sql` | DDL: tablas, indices, foreign keys con CASCADE |
| `lib/comercial/maletas/replenishment-plan-service.ts` | Servicio server-only: CRUD + maquina de estados + documento unico |
| `app/api/orgs/[orgSlug]/comercial/maletas/replenishment-plans/route.ts` | GET + POST action-based (7 acciones) |
| `scripts/audit-maletas-replenishment-persistence.ts` | Auditoria read-only de datos en DB |
| `scripts/validate-maletas-replenishment-persistence.ts` | Validacion estructural (77 checks) |

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx` | useState → API fetch/post, loading/saving/error states, imports limpiados |
| `prisma/schema.prisma` | Relaciones en Organization model |

---

## Modelo de datos

### MaletaReplenishmentPlan
- `id`, `organizationId`, `vendorId`, `vendorName`, `warehouseCode`
- `status` (draft | pending_warehouse | prepared | shipped | received | cancelled)
- `documentNumber` (formato PS-YYYYMMDD-NNN, unico por org+fecha)
- `summaryAddedRefs`, `summaryRemovedRefs` (contadores denormalizados)
- `createdBy`, `createdAt`, `updatedAt`

### MaletaReplenishmentItem
- `id`, `organizationId`, `planId`
- `subgroupSag`, `removedReference`, `removedDescription`
- `addedReference`, `addedDescription`, `quantity`, `reason`

### MaletaReplenishmentEvent
- `id`, `organizationId`, `planId`
- `type`, `description`, `userId`, `createdAt`

---

## Maquina de estados

```
draft ──────────→ pending_warehouse ──→ prepared ──→ shipped ──→ received
  │                     │
  └──→ cancelled        └──→ prepared
                        └──→ shipped
                        └──→ cancelled
```

Transiciones validadas en `VALID_TRANSITIONS`. Cualquier transicion invalida lanza `INVALID_TRANSITION`.

---

## API

**Base:** `/api/orgs/[orgSlug]/comercial/maletas/replenishment-plans`

| Metodo | Accion | Descripcion |
|---|---|---|
| GET | — | Listar planes (query: vendorId, status) |
| POST | `create_or_get_draft` | Crear borrador o retornar existente (1 draft por vendor) |
| POST | `get_draft` | Obtener borrador activo de un vendor |
| POST | `add_item` | Agregar item a plan (valida draft, qty>0, ref no vacia) |
| POST | `remove_item` | Eliminar item de plan (valida draft, pertenencia) |
| POST | `generate_document` | Generar documento (draft → pending_warehouse) |
| POST | `update_status` | Cambiar estado (valida transicion) |
| POST | `history` | Historial con filtros |

**Codigos de error:** 400 (validacion), 401 (auth), 404 (not found), 409 (conflicto de estado), 500 (interno)

---

## Validaciones de datos

| Regla | Ubicacion |
|---|---|
| `addedReference` no vacio | Service + API route |
| `quantity > 0` | Service + API route |
| Plan debe estar en `draft` para agregar/eliminar items | Service |
| Plan no puede estar vacio para generar documento | Service |
| Solo transiciones validas permitidas | Service (VALID_TRANSITIONS) |
| Un solo borrador por org+vendor | Service (createOrGetDraftPlan) |
| Documento unico por org+fecha | Service (generateUniqueDocumentNumber) |
| Item pertenece al plan+org correcto | Service (removeItemFromPlan) |

---

## Seguridad

- `requireOrgAccess(params.orgSlug)` en cada handler
- Todas las queries filtran por `organizationId` — sin confianza en client-side
- Foreign keys con CASCADE DELETE desde Organization
- Indices optimizados para queries multi-tenant

---

## Resultado

| Metrica | Valor |
|---|---|
| TSC errores | 160 (baseline preservada) |
| Checks de validacion | 77/77 PASS |
| Modelos Prisma | 3 |
| Funciones de servicio | 9 |
| Acciones API | 7 |
| Indices DB | 11 |
| Foreign keys | 5 |
