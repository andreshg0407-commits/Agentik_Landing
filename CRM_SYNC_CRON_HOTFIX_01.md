# CRM_SYNC_CRON_HOTFIX_01

**Sprint:** CRM-SYNC-CRON-HOTFIX-01
**Fecha:** 2026-07-03

---

## Cambio realizado

**Archivo:** `app/api/cron/data-sync/route.ts`

```diff
- where: { status: "ACTIVE", source: "sag_pya_soap" }
+ where: { status: "ACTIVE", source: { in: ["sag_pya_soap", "castillitos_crm"] } }
```

El cron `0 */6 * * *` (cada 6 horas, definido en `vercel.json:17`) ahora incluye ambos conectores.

---

## Validaciones

### 1. Connector castillitos_crm existe

Creado por `scripts/setup-castillitos-connectors.ts`. Upsert por `(organizationId, source, name)`.
Se necesita confirmar en DB que el row existe y tiene `status: "ACTIVE"`.

**Accion requerida:** Ejecutar en produccion:
```sql
SELECT id, status, source, modules FROM "Connector" WHERE source = 'castillitos_crm';
```

Si `status != 'ACTIVE'`, actualizar:
```sql
UPDATE "Connector" SET status = 'ACTIVE' WHERE source = 'castillitos_crm';
```

### 2. Env vars en Vercel

| Variable | Local (.env) | Vercel |
|---|---|---|
| `CRM_CLIENT_ID` | Presente | **Verificar** |
| `CRM_CLIENT_SECRET` | Presente | **Verificar** |
| `CRM_BASE_URL` | No definida (usa default en adapter) | Opcional |
| `CRM_TOKEN_ENDPOINT` | No definida (usa default en adapter) | Opcional |

Defaults del adapter si no hay env vars:
- `baseUrl`: `https://crm-castillitos.jrconsultores.com.co/pruebas`
- `tokenEndpoint`: `https://crm-castillitos.jrconsultores.com.co/pruebas/Api/access_token`

**Accion requerida:** Confirmar en Vercel Dashboard > Settings > Environment Variables que `CRM_CLIENT_ID` y `CRM_CLIENT_SECRET` estan configurados para Production.

### 3. Sync CRM manual

Se puede ejecutar desde:
- UI: `/integrations/connectors/{connectorId}` > Sync Panel > "Sync All" o por modulo
- API: `POST /api/orgs/{orgSlug}/connectors/{connectorId}/sync`

Orden de modulos (configurado en connector):
1. `customers` (debe correr primero)
2. `opportunities`
3. `activities`
4. `quotes`

Quote lines (`AOS_Products_Quotes`) son sync separado:
- API: `POST /api/orgs/{orgSlug}/comercial/pedidos/sync-lines`

### 4. Post-sync: Validar CRMQuote

Despues de ejecutar sync, verificar:

```sql
-- Total quotes
SELECT COUNT(*) FROM "CRMQuote";

-- Fecha mas reciente
SELECT MAX("issuedAt") FROM "CRMQuote";

-- Ultimos 7/30/90 dias
SELECT
  COUNT(*) FILTER (WHERE "issuedAt" >= NOW() - INTERVAL '7 days') AS "7d",
  COUNT(*) FILTER (WHERE "issuedAt" >= NOW() - INTERVAL '30 days') AS "30d",
  COUNT(*) FILTER (WHERE "issuedAt" >= NOW() - INTERVAL '90 days') AS "90d"
FROM "CRMQuote";

-- Campos poblados
SELECT
  COUNT(*) AS total,
  COUNT("sellerName") AS con_seller,
  COUNT(*) FILTER (WHERE "rawCrmJson"->'raw'->>'billing_account_id' IS NOT NULL) AS con_billing,
  COUNT(*) FILTER (WHERE "rawCrmJson"->'raw'->>'id_sag_c' IS NOT NULL AND "rawCrmJson"->'raw'->>'id_sag_c' != '') AS con_sag
FROM "CRMQuote";
```

### 5. TSC

Baseline: **160** (sin cambios).

---

## Riesgos

| Riesgo | Mitigacion |
|---|---|
| Credenciales CRM expiradas | Verificar env vars en Vercel antes de deploy |
| Connector status = INACTIVE | Verificar y activar en DB |
| CRM server caido | El adapter tiene retry con backoff (3 intentos, 500ms base) |
| Timeout en Vercel (300s) | CRM usa paginacion de 500 rows. Si el backlog es muy grande, el cursor avanza parcialmente y el siguiente cron continua. |
| Conflicto con SAG sync | Sin conflicto: son connectors independientes con modulos separados. El cron itera secuencialmente por connector. |

---

## Siguiente paso

Despues de confirmar que el sync CRM esta activo y trayendo datos frescos:

1. Verificar que vendedores pasan de "Atencion" a "Activo"
2. Verificar que Reports/Executive muestran datos del dia
3. Considerar agregar quote-lines sync automatico post-quotes
4. Considerar agregar freshness badge al dashboard de Vendedores
