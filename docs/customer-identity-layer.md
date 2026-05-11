# Customer Identity Layer

**Last updated:** 2026-05-02
**Status:** Live (schema + helper deployed; backfill script ready)

---

## Regla de oro

> **Ningún flujo operativo debe depender de NIT suelto, nombre suelto o `ka_nl_tercero` como identidad principal. Todo debe resolver a `customerId`.**

El `customerId` es el `CustomerProfile.id` — un CUID generado por Agentik que es estable, multi-tenant, y no contiene datos externos.

---

## Campos de identidad

### En `CustomerProfile` (entidad canónica)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | `String` (CUID) | **Identidad principal** del sistema |
| `sagTerceroId` | `Int?` | `ka_nl_tercero` de SAG TERCEROS — FK entera interna. Más estable que NIT para re-linking. |
| `nitNormalized` | `String?` | NIT real (dígitos solo, sin puntos/guiones/DV). Fuente de verdad para búsquedas por NIT. |
| `nit` | `String?` | Alias legacy de `nitNormalized`. Mantener sincronizados. |
| `identityStatus` | `IdentityStatus` | Nivel de confianza de la identidad (ver enum). |
| `identityNotes` | `String?` | Notas de auditoría cuando `identityStatus = NEEDS_REVIEW`. |

### En `CustomerReceivable`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `customerId` | `String?` | FK a `CustomerProfile.id` — set por backfill o por sync futuro. |
| `customerNit` | `String?` | NIT real (de `TERCEROS.n_nit` via JOIN en la query SAG). |
| `customerName` | `String` | Nombre denormalizado de SAG (para display sin JOIN). |

### En `CollectionRecord`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `customerId` | `String?` | FK a `CustomerProfile.id` — set por backfill o por sync. |
| `sagTerceroId` | `Int?` | `ka_nl_tercero` raw (para re-linking posterior). |
| `customerNit` | `String?` | NIT real (de TERCEROS JOIN si disponible). |
| `customerName` | `String?` | Nombre denormalizado. |

---

## `IdentityStatus` enum

| Valor | Significado |
|-------|-------------|
| `VERIFIED` | NIT confirmado de SAG TERCEROS, sin conflicto |
| `NEEDS_REVIEW` | Creado por fallback de nombre — requiere revisión manual |
| `CONSUMIDOR_FINAL` | Consumidor anónimo (NIT 222222222, 0, o ausente) |
| `DUPLICATE` | Duplicado sospechoso — pendiente merge manual |

---

## Flujo de resolución (`resolveCustomerIdentity`)

**Archivo:** `lib/customer360/identity.ts`

```
Input: { organizationId, sagTerceroId?, nit?, customerName?, email?, phone? }

1. ¿Es consumidor final? (NIT en {222222222, 0, ""} o nombre en lista genérica)
   → Buscar/crear perfil CONSUMIDOR_FINAL único por org
   → return { status: "CONSUMIDOR_FINAL" }

2. Buscar por sagTerceroId
   → Si encontrado: enriquecer con nitNormalized si ahora tenemos NIT real
   → return { resolvedBy: "sagTerceroId" }

3. Buscar por nitNormalized (o nit legacy)
   → Si encontrado: enriquecer con sagTerceroId, marcar VERIFIED
   → return { resolvedBy: "nit" }

4. Buscar por nombre exacto normalizado (fallback temporal)
   → Si encontrado: marcar NEEDS_REVIEW, enriquecer con sagTerceroId/nit
   → return { resolvedBy: "name", status: "NEEDS_REVIEW" }

5. Crear CustomerProfile nuevo
   → VERIFIED si tenemos NIT o sagTerceroId
   → NEEDS_REVIEW si solo tenemos nombre
   → return { isNew: true, resolvedBy: "created" }
```

---

## Casos especiales

### Consumidor Final
- NITs: `222222222`, `0`, `""`
- Nombres: `CONSUMIDOR FINAL`, `CLIENTE MOSTRADOR`, `VARIOS`, `CONTADO`
- Un solo perfil `CONSUMIDOR_FINAL` por org — no crear uno por transacción
- No usar para analytics de cliente — excluir de top deudores, churn, etc.

### Conflicto NIT vs sagTerceroId
- Si un perfil tiene `sagTerceroId=526` pero NIT real llega como `901383501`:
  → El helper actualiza `nitNormalized=901383501` y marca `VERIFIED`
- Si dos perfiles distintos convergen en el mismo NIT:
  → El segundo queda como `NEEDS_REVIEW` con `identityNotes` explicando el conflicto

### Datos anteriores al TERCEROS JOIN (bug "526 como NIT")
- `CustomerReceivable.customerNit` y `CollectionRecord.customerNit` pueden contener `ka_nl_tercero` en lugar del NIT real
- El script `_backfill-customer-identity.ts` usa `rawErpJson.terceroId` como `sagTerceroId` para resolver correctamente por nombre
- Tras re-sync con el TERCEROS JOIN activo, el NIT real se escribe en `customerNit` y la identidad se actualiza a `VERIFIED`

---

## Backfill

**Script:** `scripts/_backfill-customer-identity.ts`

```bash
# Dry-run (solo reporte):
npx tsx scripts/_backfill-customer-identity.ts --dry-run

# Por org:
npx tsx scripts/_backfill-customer-identity.ts --org castillitos

# Todos los orgs:
npx tsx scripts/_backfill-customer-identity.ts
```

El script recorre `CustomerReceivable` y `CollectionRecord` sin `customerId` y los vincula usando `resolveCustomerIdentity`. Genera reporte de: total, matched by sagId/nit/name, created, needsReview, consumidorFinal, errors.

---

## Navegación Cliente 360

Orden de prioridad para construir links:

```ts
const href = d.customerId
  ? `/${orgSlug}/customer-360?customerId=${d.customerId}`
  : d.slug
  ? `/${orgSlug}/customer-360?slug=${d.slug}`
  : d.nit
  ? `/${orgSlug}/customer-360?nit=${encodeURIComponent(d.nit)}`
  : `/${orgSlug}/customer-360`;
```

`customer-360/page.tsx` resuelve en el mismo orden: `customerId → slug → nit → error`.

---

## Qué nunca hacer

- ❌ Usar `ka_nl_tercero` como NIT de cliente (`customerNit`, `nit`, etc.)
- ❌ Crear un `CustomerProfile` por cada movimiento SAG sin deduplicar
- ❌ Usar `@@unique` global (sin `organizationId`) en campos de identidad — violación de multi-tenancy
- ❌ Confiar en `CustomerProfile.totalReceivable` para navegación — es campo denormalizado, puede estar obsoleto
- ❌ Usar `customerName` como identidad principal en producción — solo válido como fallback temporal
- ❌ Exponer `sagTerceroId` en URLs o APIs externas — es una FK interna de SAG

---

## Índices relevantes

```prisma
// CustomerProfile
@@index([organizationId, sagTerceroId])
@@index([organizationId, nitNormalized])
@@index([organizationId, identityStatus])

// CollectionRecord
@@index([organizationId, customerId])
@@index([organizationId, sagTerceroId])

// CustomerReceivable
@@index([organizationId, customerId])
@@index([organizationId, customerNit])
```
