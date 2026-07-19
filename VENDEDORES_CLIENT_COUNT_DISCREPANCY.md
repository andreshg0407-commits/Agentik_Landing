# Discrepancia de conteo de clientes — Vendedores 360

**Sprint:** VENDEDORES-CLEANUP-01
**Fecha:** 2026-07-04
**Severidad:** Baja (cosmética)
**Estado:** Documentada, no corregida

---

## Problema

El numero de clientes mostrado en la **card principal** del vendedor puede diferir del numero de clientes listados en el **drawer tab Clientes**.

Ejemplo:
- Card: "12 clientes"
- Drawer: 8 clientes listados

---

## Causa raiz

### Card principal (seller-directory.ts)

```typescript
// Cuenta billing_account_id UNICOS de todas las CRMQuotes del vendedor
const customers = new Set<string>();
if (raw.billing_account_id) customers.add(raw.billing_account_id);
// → customerCount = customers.size
```

**Conteo:** Todos los `billing_account_id` distintos encontrados en cotizaciones CRM.

### Drawer (vendedor-360-loader.ts)

```typescript
// 1. Extrae billing_account_ids de quotes
for (const q of quotes) {
  if (raw.billing_account_id) customerBillingIds.add(raw.billing_account_id);
}

// 2. Busca CustomerProfile con crmId matching
const profiles = await db.customerProfile.findMany({
  where: { organizationId, crmId: { in: [...customerBillingIds] } },
});

// 3. Muestra SOLO profiles encontrados
const clients = profiles.map(p => ({ ... }));
```

**Conteo:** Solo los `billing_account_id` que tienen un `CustomerProfile.crmId` correspondiente en la base de datos.

---

## Por que difieren

Un `billing_account_id` de CRM puede NO tener `CustomerProfile` si:

1. **El modulo `customers` no se sincronizo** — Los CRMQuotes se importaron pero los Accounts no.
2. **El CustomerProfile fue creado por otra via** (NIT, manual) y su campo `crmId` no fue poblado.
3. **La cuenta CRM fue eliminada** despues de sincronizarse, pero las quotes persisten.

---

## Impacto

- **Cosmético:** El usuario ve un numero en la card y otro en el drawer.
- **No afecta funcionalidad:** El drawer muestra correctamente los clientes que SI tienen perfil completo.
- **No genera errores:** No hay crash, no hay datos incorrectos — simplemente son dos conteos con criterios distintos.

---

## Recomendacion futura

**Opcion A (preferida):** Unificar conteo en la card para usar el mismo criterio del drawer.

```typescript
// En seller-directory.ts, despues de obtener billing_account_ids:
// Hacer un count de CustomerProfile.crmId IN billing_account_ids
// Esto alinea card = drawer
```

**Opcion B:** Mantener ambos conteos pero hacer explicito en UI:
- Card: "12 cuentas CRM"
- Drawer: "8 clientes con perfil"

**Opcion C:** Crear CustomerProfile automaticamente durante sync de quotes (cuando se encuentra un billing_account_id sin perfil).

---

## Archivos involucrados

| Archivo | Linea | Conteo |
|---|---|---|
| `lib/comercial/foundation/seller-directory.ts` | 99-100 | `Set(billing_account_id).size` |
| `lib/comercial/vendors/vendedor-360-loader.ts` | 142-158 | `CustomerProfile.findMany({ crmId: in [...] })` |
| `app/(app)/[orgSlug]/comercial/vendedores/vendedores-client.tsx` | CardMiniKpi "Clientes" | Muestra `seller.customerCount` (de directory) |

---

## No corregir hasta

- Validar con el usuario si la diferencia es perceptible en produccion
- Determinar si Opcion A, B o C es la mas adecuada para el modelo de negocio
