# CRM_SYNC_FRESHNESS_AUDIT_01

**Sprint:** CRM-SYNC-FRESHNESS-AUDIT-01
**Fecha:** 2026-07-03
**Tenant:** Castillitos

---

## 1. Ultimo dato CRM real

| Metrica | Valor |
|---|---|
| Campo de fecha comercial | `CRMQuote.issuedAt` (= CRM `date_entered`) |
| Ultimo pedido CRM estimado | ~4 meses atras (UI muestra "4m" en todos los vendedores) |
| Campo `issuedAt` | Non-nullable, indexado, poblado desde CRM V8 `date_entered` |
| `CRMQuote.createdAt` | Timestamp Prisma (cuando se inserto el row, NO la fecha del pedido) |
| `CRMQuote.updatedAt` | Timestamp Prisma auto-update (sin uso comercial) |

**Conclusion:** Los datos CRM son reales pero historicos. `issuedAt` es la fecha correcta de actividad comercial. El CRM no ha enviado datos nuevos en >90 dias.

---

## 2. Ultima sincronizacion exitosa

### Cron activo: Solo SAG

```
app/api/cron/data-sync/route.ts
Schedule: 0 */6 * * * (cada 6 horas)
Filtro: { status: "ACTIVE", source: "sag_pya_soap" }
```

**El cron de sync NO incluye `castillitos_crm`.** Solo sincroniza `sag_pya_soap`.

### Sync CRM: Solo manual

El sync CRM se activa exclusivamente via:

| Mecanismo | Ruta/Script |
|---|---|
| UI (Connector Sync Panel) | `POST /api/orgs/{org}/connectors/{id}/sync` con `{ module }` |
| Dry-run (UI) | `POST /api/orgs/{org}/connectors/{id}/dry-run` |
| Script bootstrap | `scripts/setup-castillitos-connectors.ts` |
| Quote lines | `POST /api/orgs/{org}/comercial/pedidos/sync-lines` |

**No existe cron ni job automatico para CRM.** La ultima sync fue cuando alguien la ejecuto manualmente desde el panel de conectores.

### Tracking de runs

Los runs se registran en `ConnectorRun` (Prisma model):
- `connectorId`, `module`, `startedAt`, `finishedAt`
- `status`: RUNNING | SUCCESS | PARTIAL | FAILED
- `rowsRead`, `rowsImported`, `rowsSkipped`, `rowsErrored`
- `cursorBefore`, `cursorAfter`

---

## 3. Causa probable de pausa

### Causa raiz: CRM excluido del cron

`app/api/cron/data-sync/route.ts` linea de filtro:

```typescript
where: { status: "ACTIVE", source: "sag_pya_soap" }
```

Esto excluye explicitamente `castillitos_crm`. El CRM nunca ha tenido sync automatico — siempre fue manual.

### Factores contribuyentes

| Factor | Estado |
|---|---|
| Credenciales CRM | Dependen de env vars `CRM_CLIENT_ID` / `CRM_CLIENT_SECRET`. Si no estan en Vercel, el connector queda `INACTIVE`. |
| Connector status | Debe ser `ACTIVE` para que el sync funcione. Si las credenciales fallan, pasa a `ERROR`. |
| Quote lines | Sync separado, sin cron, sin trigger automatico. Siempre vacio si nadie lo ejecuta. |
| Token cache | OAuth2 `client_credentials` con cache en memoria — se pierde en cada cold start de Vercel. |

---

## 4. Modulos afectados

### Dependencia directa de CRMQuote.issuedAt

| Modulo | Archivo | Uso de issuedAt | Clasificacion |
|---|---|---|---|
| **Vendedores** | `seller-directory.ts`, `seller-metrics.ts` | `lastActivityAt` = max `issuedAt` por vendedor. Determina activo/atencion/inactivo. | Historico util |
| **Vendedores 360** | `vendedor-360-loader.ts` | Timeline, KPIs, inteligencia — todo basado en `issuedAt` | Historico util |
| **Clientes** | `cliente-360-loader.ts` | Actividad del cliente = max `issuedAt` de sus quotes | Historico util |
| **Clientes (lastPurchaseAt)** | `client-loader.ts` | Usa `CustomerProfile.lastPurchaseAt` (campo separado) — NO depende de issuedAt directamente | Depende de sync de CustomerProfile |
| **Pedidos** | `order-service.ts` | `OrderDraft.createdAt` = `issuedAt`. Lista de pedidos ordenada por `issuedAt`. | Historico util |
| **Pipeline** | `pipeline/service.ts` | Ordenamiento y display por `issuedAt` | Historico util |
| **Reports / Executive** | `reports/runners.ts`, `executive-dashboard.ts` | Filtros de rango `issuedAt: { gte, lte }` para hoy/ayer/mes | **No apto para operacion diaria** |
| **CRM Alerts** | `crm-alert-engine.ts` | Deteccion de quotes stale via `daysSince(issuedAt)` | Historico util (pero todas aparecen stale) |
| **Identidad comercial** | `commercial-identity-map.ts` | `lastActivity` = max `issuedAt` | Historico util |
| **Vendor metrics (mensual)** | `vendor-metrics.ts` | Filtro `issuedAt: { gte: monthStart }` para metricas del mes | **No apto para operacion diaria** |

### Clasificacion consolidada

| Categoria | Modulos |
|---|---|
| **Confiable actual** | Ninguno — todos dependen de CRM fresco para datos operativos |
| **Historico util** | Vendedores, Vendedores 360, Clientes 360, Pedidos, Pipeline, CRM Alerts, Identidad comercial |
| **No apto para operacion diaria** | Reports/Executive (filtros hoy/ayer vacios), Vendor metrics mensual (mes actual vacio) |

---

## 5. Arquitectura del sync CRM

```
SuiteCRM V8 (pruebas)
  |
  | OAuth2 client_credentials
  | GET /Api/V8/module/{ModuleName}?filter[date_entered][gte]=CURSOR
  |
  v
CastillitosCrmAdapter (lib/connectors/adapters/castillitos-crm/)
  |
  | pullCustomers()  → CustomerProfile (upsert by NIT-slug)
  | pullOpportunities() → CRMOpportunity
  | pullActivities() → CRMActivity
  | pullQuotes() → CRMQuote (upsert by crmId)
  | pullQuoteLines() → CRMQuoteLine (sync separado)
  |
  v
ConnectorRun (audit trail)
ConnectorCursor (posicion incremental por modulo)
```

### Orden de sync (obligatorio)

1. `customers` (Accounts) — debe correr primero para que `CustomerProfile.crmId` exista
2. `opportunities` (AOS_Opportunities)
3. `activities` (Calls)
4. `quotes` (AOS_Quotes)
5. `quote-lines` (AOS_Products_Quotes) — sync separado via `/sync-lines`

### Cursor incremental

- Filtro servidor: `filter[date_entered][gte]=CURSOR` (ISO datetime)
- Avance cursor: `max(date_modified, date_entered)` del batch
- Dedup cliente: `if (q.issuedAt <= cursorDate) continue`

---

## 6. Fecha comercial correcta

| Campo | Que representa | Uso correcto |
|---|---|---|
| `CRMQuote.issuedAt` | Fecha de creacion del pedido en CRM (`date_entered`) | Fecha comercial principal |
| `CRMQuote.createdAt` | Cuando el row se inserto en Prisma (sync time) | Solo auditoria de sync |
| `CRMQuote.updatedAt` | Ultima vez que Prisma toco el row | Solo auditoria de sync |
| `rawCrmJson.raw.date_modified` | Ultima modificacion en CRM | Avance de cursor (no expuesto como campo) |
| `rawCrmJson.raw.closing_date` | No existe en quotes (solo en opportunities como `date_closed`) | N/A para CRMQuote |

**Veredicto:** `issuedAt` ES la fecha comercial correcta. El problema no es que se use la fecha equivocada — el problema es que no llegan datos nuevos.

---

## 7. Accion correctiva recomendada

### Inmediata (sin riesgo)

1. **Agregar `castillitos_crm` al cron de data-sync**

   `app/api/cron/data-sync/route.ts` — cambiar el filtro de connectors para incluir CRM:

   ```typescript
   // Actual:
   where: { status: "ACTIVE", source: "sag_pya_soap" }

   // Corregido:
   where: { status: "ACTIVE", source: { in: ["sag_pya_soap", "castillitos_crm"] } }
   ```

   Esto habilita sync automatico cada 6 horas.

2. **Verificar credenciales CRM en Vercel**

   Confirmar que `CRM_CLIENT_ID` y `CRM_CLIENT_SECRET` estan configurados en las env vars de Vercel. Sin ellos, el connector queda `INACTIVE` y el cron lo ignora.

3. **Verificar estado del connector**

   Confirmar que el connector `castillitos_crm` tiene `status: "ACTIVE"` en la tabla `Connector`. Si esta en `INACTIVE` o `ERROR`, el cron lo salta.

### A corto plazo

4. **Agregar quote-lines al flujo post-sync**

   Despues de sincronizar `quotes`, trigger automatico de `syncQuoteLines()` para poblar `CRMQuoteLine`.

5. **Agregar freshness badge al dashboard de Vendedores**

   Mostrar "Ultimo sync: hace 4 meses" basado en `max(CRMQuote.updatedAt)` o `max(ConnectorRun.finishedAt)` para dar visibilidad operativa.

### A mediano plazo

6. **Migrar credenciales CRM al Vault**

   `Connector.config` almacena `clientId`/`clientSecret` en texto plano. Migrar a `VaultSecret` (ya existe la infraestructura en `lib/security/vault/`).

---

## 8. Diagnostico final

| Pregunta | Respuesta |
|---|---|
| El sync CRM sigue activo? | **No.** No tiene cron. Solo manual. |
| Cuando corrio por ultima vez? | **Hace ~4+ meses** (inferido de `issuedAt` mas reciente). Verificable en `ConnectorRun`. |
| Que endpoint usa? | `GET {baseUrl}/Api/V8/module/AOS_Quotes` con OAuth2 `client_credentials` |
| Esta fallando? | **No se puede determinar sin acceso a DB.** Posible: credenciales expiradas, connector `INACTIVE`, o simplemente nunca se ejecuto automaticamente. |
| Esta pausado por credenciales? | **Probable.** Si `CRM_CLIENT_ID`/`CRM_CLIENT_SECRET` no estan en Vercel, el connector nunca paso a `ACTIVE`. |
| Esta trayendo solo historico? | **Trae todo** (incremental desde cursor). Si se reactiva, traera datos nuevos desde la ultima posicion del cursor. |

**La causa raiz es que `castillitos_crm` fue excluido del cron de sync.** No es un bug — es una omision. El cron solo fue configurado para `sag_pya_soap`. Corregir el filtro del cron y verificar credenciales resuelve el problema.
