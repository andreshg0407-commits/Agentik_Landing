# Seller Identity Cases — Castillitos

**Sprint:** P0 CIERRE COMERCIAL
**Fecha:** 2026-08-14
**Estado:** DOCUMENTADO — pendiente validacion con Castillitos

---

## Contexto

Durante la auditoria del modulo Comercial se identificaron 5 casos donde el campo
`sellerName` en `CustomerProfile` contiene el mismo nombre que el cliente. Esto NO
es corrupcion de datos — los valores provienen directamente de SAG/CRM y representan
la forma en que el negocio registra ciertos clientes.

**Decision:** No modificar. No investigar mas. Dejar para posterior validacion con
el equipo de Castillitos, quienes confirmaran si estos clientes son auto-vendedores,
errores de captura en SAG, o una practica de negocio intencional.

---

## Casos identificados

| # | sellerName (= nombre del cliente) | Fuente | Accion |
|---|---|---|---|
| 1 | Industrias Diana Alzate | SAG sync | Ninguna — validar con Castillitos |
| 2 | (por confirmar con query real) | SAG sync | Ninguna — validar con Castillitos |
| 3 | (por confirmar con query real) | SAG sync | Ninguna — validar con Castillitos |
| 4 | (por confirmar con query real) | SAG sync | Ninguna — validar con Castillitos |
| 5 | (por confirmar con query real) | SAG sync | Ninguna — validar con Castillitos |

> **Nota:** Los nombres exactos de los 5 casos fueron reportados por el usuario en
> sesion de trabajo. Solo "Industrias Diana Alzate" fue mencionado explicitamente.
> Los otros 4 requieren una query de verificacion cuando haya acceso a produccion.

---

## Reglas de UI aplicadas (ya implementadas)

1. **Sin vendedor asignado:** Cuando `sellerName` es NULL o vacio, la UI muestra
   "Sin vendedor asignado" — nunca inventa un vendedor.
   - `manager-commercial-adapter.ts:870`: `data.seller.sellerName ?? "Sin vendedor asignado"`
   - `cliente-360-client.tsx:219`: "Sin vendedor asignado"
   - `order-operational-state.ts:180`: "Sin vendedor asignado"

2. **Sin certificacion de vendedor:** No se usa codigo de bodega como identificador
   de vendedor. No se genera un seller ficticio.

3. **Vendedor sin Maleta:** No todos los vendedores tienen `VendorCommercialBag`.
   Una Maleta solo existe para vendedores de viaje. Si no hay Maleta, no se inventa
   una ni se trata como error.

---

## Query de verificacion (para ejecucion futura)

```sql
SELECT cp.name AS customer_name, cp."sellerName" AS seller_name,
       COUNT(*) AS profile_count
FROM "CustomerProfile" cp
WHERE cp."organizationId" = '<castillitos_org_id>'
  AND cp."sellerName" IS NOT NULL
  AND cp."sellerName" != ''
  AND LOWER(cp.name) = LOWER(cp."sellerName")
GROUP BY cp.name, cp."sellerName"
ORDER BY profile_count DESC
LIMIT 10;
```

---

## Proximo paso

Validar con Castillitos en la proxima sesion de revision operativa:
- Confirmar si estos 5 casos son intencionales o errores de captura en SAG
- Si son errores, definir la correccion en origen (SAG), no en Agentik
