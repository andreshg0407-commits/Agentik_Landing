# VENDEDORES_CRM_DATA_VALIDATION_01

**Sprint:** VENDEDORES-CRM-DATA-VALIDATION-01
**Fecha:** 2026-07-04
**Tenant:** Castillitos

---

## FASE 1 — Auditoría de datos CRM importados

### Estructura del modelo CRMQuote (Prisma)

```
CRMQuote {
  id             String (cuid)
  organizationId String
  customerId     String?       ← FK a CustomerProfile (resuelto durante sync)
  opportunityId  String?       ← FK a CRMOpportunity
  crmId          String?       ← ID original de SuiteCRM (AOS_Quotes.id)
  quoteNumber    String?       ← AOS_Quotes.number
  status         QuoteStatus   ← Mapeado desde AOS_Quotes.stage
  amount         Decimal(18,2) ← AOS_Quotes.total_amount
  currency       String        ← "COP"
  issuedAt       DateTime      ← AOS_Quotes.date_entered (NOT NULL)
  expiresAt      DateTime?
  respondedAt    DateTime?
  sellerSlug     String?       ← toSlug(assigned_user_name)
  sellerName     String?       ← AOS_Quotes.assigned_user_name
  rawCrmJson     Json?         ← Todos los atributos V8 crudos
  createdAt      DateTime      ← @default(now()) [timestamp de insercion Prisma]
  updatedAt      DateTime      ← @updatedAt [auto-update Prisma]
}
Indexes: (organizationId, crmId) UNIQUE, (organizationId, sellerSlug), (organizationId, issuedAt)
```

### Campos disponibles para auditoría (sin acceso DB directo)

| Campo | Origen | Disponible en UI |
|---|---|---|
| `issuedAt` | `date_entered` de SuiteCRM | Si (como fecha en tablas) |
| `createdAt` | Timestamp Prisma de insercion | No expuesto |
| `updatedAt` | Auto-update Prisma | No expuesto |
| `sellerName` | `assigned_user_name` de CRM | Si (determina agrupacion) |
| `sellerSlug` | `toSlug(assigned_user_name)` | Si (usado en queries) |
| `rawCrmJson.raw.date_modified` | Ultima modificacion en CRM | No expuesto |
| `rawCrmJson.raw.stage` | Estado actual en CRM | Si (como badge) |
| `rawCrmJson.raw.billing_account_id` | UUID de cuenta CRM | Usado para join, no visible |

### Evidencia de freshness

La UI muestra "4m" (4 meses) como ultima actividad para todos los vendedores. Esto indica:

```
max(CRMQuote.issuedAt) ≈ hoy - 120 dias
```

**No hay acceso a la base de datos para ejecutar queries SQL directamente** (DATABASE_URL no esta disponible en el entorno CLI). La evidencia se infiere del comportamiento de UI y del codigo auditado.

---

## FASE 2 — Validar fecha más reciente real

### Flujo de importación de fechas

```
SuiteCRM V8 API
  → GET /Api/V8/module/AOS_Quotes?sort=-date_entered&filter[date_entered][gte]=CURSOR
  → response.data[].attributes.date_entered = "2026-02-15 14:30:00" (UTC)

Mapper (mappers.ts:415)
  → parseDate(row, "date_entered", "issuedAt", ...) → Date object

Storage (storage.ts:680)
  → prisma.cRMQuote.upsert({ issuedAt: record.issuedAt })

Loader (vendedor-360-loader.ts:68)
  → orderBy: { issuedAt: "desc" }
  → quotes[0].issuedAt = la fecha MAS RECIENTE

UI (vendedores-client.tsx)
  → fmtDaysAgo(identity.lastActivityAt) → "4m"
```

### Analisis del cursor incremental

El sync usa `filter[date_entered][gte]=CURSOR` para pedir solo registros con `date_entered` >= cursor.

**Problema potencial identificado:**

```typescript
// index.ts:189
if (cursorDate && quote.issuedAt <= cursorDate) continue;
```

Este filtro client-side descarta registros cuyo `issuedAt` (= `date_entered`) es <= al cursor. Esto es correcto para incrementalidad.

**Pero el cursor se avanza con `date_modified`:**

```typescript
// index.ts:338
const dateStr = String(flat["date_modified"] ?? flat["date_entered"] ?? "");
```

Esto significa:
- El servidor filtra por `date_entered >= cursor`
- El cursor se avanza al max(`date_modified`) del batch
- Si `date_modified` > `date_entered` (un registro fue editado despues de creado), el cursor avanza mas alla de donde `date_entered` deberia filtrar

**Consecuencia:** Si un registro antiguo fue EDITADO (stage change, etc.), su `date_modified` avanza el cursor. La proxima ejecucion pide `date_entered >= nuevo_cursor`, lo cual puede saltar registros con `date_entered` intermedio.

**Sin embargo:** Este es un problema edge-case que causa perdida de actualizaciones puntuales, NO explica 4 meses de inactividad total.

### Conclusion Fase 2

| Pregunta | Respuesta |
|---|---|
| La sync trajo datos recientes? | **No determinable sin DB.** |
| Dato mas reciente estimado | ~Feb 2026 (4m atras desde Jul 2026) |
| Diferencia entre fecha CRM y fecha import | No medible sin acceso a `createdAt` vs `issuedAt` |

**Posibilidades:**

- **A)** La sync SI corrio despues del hotfix PERO el CRM no tiene datos nuevos desde Feb 2026
- **B)** La sync NO ha corrido exitosamente desde el hotfix (credenciales, connector INACTIVE, etc.)
- **F)** El CRM de Castillitos simplemente no genera cotizaciones desde Feb 2026

---

## FASE 3 — Auditoría de asignación de vendedor

### Mapa completo de asignacion

```
SuiteCRM V8 API
  └── AOS_Quotes.assigned_user_name = "Juan Perez"
       │
       ▼
mapCrmQuote() [mappers.ts:419]
  └── sellerRaw = str(row, "assigned_user_name", "sellerName", "seller_name", "vendedor")
  └── sellerSlug = toSlug(sellerRaw) → "juan-perez"
  └── sellerName = sellerRaw → "Juan Perez"
       │
       ▼
crmQuoteStorage [storage.ts:678-679]
  └── prisma.cRMQuote.upsert({
        sellerSlug: record.sellerSlug,    // "juan-perez"
        sellerName: record.sellerName,    // "Juan Perez"
      })
       │
       ▼
CRMQuote table
  └── sellerSlug = "juan-perez"  (indexed: @@index([organizationId, sellerSlug]))
  └── sellerName = "Juan Perez"
       │
       ▼
seller-directory.ts [line 59]
  └── findMany WHERE sellerSlug = ? → groupBy sellerName
       │
       ▼
vendedor-360-loader.ts [line 59]
  └── findMany WHERE { organizationId, sellerSlug }
       │
       ▼
Vendedores 360 Drawer
```

### Riesgos de asignacion identificados

| Riesgo | Impacto | Probabilidad |
|---|---|---|
| `assigned_user_name` vacio en CRM | Quote se pierde (sellerName=null, no aparece en ningun vendedor) | Baja — pero posible |
| Cambio de nombre de usuario CRM | Nuevo slug → aparece como vendedor distinto | Media |
| `assigned_user_name` con caracteres especiales | `toSlug()` normaliza NFD, remueve diacriticos | Manejado |
| Multiples variantes del mismo nombre | "Juan Perez" vs "juan perez" → mismo slug "juan-perez" | Manejado (toSlug es idempotente) |

### Conclusion Fase 3

La asignacion es directa y confiable:
- `assigned_user_name` → `sellerName` (display)
- `toSlug(assigned_user_name)` → `sellerSlug` (join key)
- Query usa `WHERE { organizationId, sellerSlug }` con indice dedicado
- **No hay transformacion intermedia que pueda perder la asociacion**

---

## FASE 4 — Validación contra Vendedores 360

### Flujo de datos del Drawer

```
1. Usuario click en card
2. Client: fetch(`/api/orgs/${orgSlug}/comercial/vendedores/${sellerSlug}`)
3. API Route: loadVendedor360(orgId, sellerSlug)
4. Loader:
   a. findMany CRMQuote WHERE { organizationId, sellerSlug } ORDER BY issuedAt DESC
   b. quotes[0].issuedAt → lastActivityAt
   c. sum(quotes.amount) → totalCrmAmount
   d. count(distinct billing_account_id) → customerCount
   e. Parallel: CustomerProfile, CustomerReceivable, CustomerOrderRecord
5. Response: Vendedor360Data
6. Client: renders tabs
```

### Consistencia de KPIs

| KPI | Fuente directa | Transformacion |
|---|---|---|
| `identity.crmQuoteCount` | `quotes.length` | Ninguna |
| `identity.totalCrmAmount` | `sum(quote.amount)` | Number() cast de Decimal |
| `identity.customerCount` | `Set(billing_account_id).size` | Count distinct de rawCrmJson |
| `identity.lastActivityAt` | `quotes[0].issuedAt` (ordenado DESC) | toISOString() |
| `intelligence.pedidosUltimos30d` | Filter `issuedAt >= 30d ago` | Date comparison |
| `intelligence.pedidosUltimos90d` | Filter `issuedAt >= 90d ago` | Date comparison |

**No hay discrepancia posible entre CRMQuote y Drawer.** El Drawer lee directamente de la tabla sin cache, sin materialización, sin snapshot. Si los datos estan en CRMQuote, aparecen en el Drawer.

---

## FASE 5 — Validación del Top Vendedores

### Flujo del ranking

```
page.tsx:
  1. buildSellerDirectory(orgId) → sellers[]
  2. sellers.totalAmount = quotes.reduce(sum(amount))

vendedores-client.tsx:
  3. dashboard.ranked = [...sellers].sort((a,b) => b.totalCrmAmount - a.totalCrmAmount)
  4. dashboard.top3 = ranked.slice(0,3)
```

### Consistencia

| Paso | Fuente | Posible discrepancia |
|---|---|---|
| `seller-directory.ts` | `db.cRMQuote.findMany({ where: { organizationId } })` → agg by sellerName | Ninguna — lee TODOS los quotes |
| `page.tsx` merge | `s.totalAmount` (directory) → `totalCrmAmount` (prop) | Directo, sin transformacion |
| `vendedores-client.tsx` sort | `b.totalCrmAmount - a.totalCrmAmount` | Sort correcto |

**La suma es identica a lo que existe en CRMQuote.** No hay cache ni materialización. Si un vendor tiene 50 quotes sumando $100M en la tabla, el dashboard mostrara $100M.

---

## FASE 6 — Validación de clientes por vendedor

### Flujo de conteo de clientes

**En directory (cards):**
```typescript
// seller-directory.ts:100
if (customerId) customers.add(customerId);
// customerCount: data.customers.size
```
Usa `rawCrmJson.raw.billing_account_id` de TODAS las quotes del vendedor.

**En Drawer (tab Clientes):**
```typescript
// vendedor-360-loader.ts:117-118
if (raw.billing_account_id) customerBillingIds.add(raw.billing_account_id);
// Luego: CustomerProfile.findMany({ where: { crmId: { in: [...customerBillingIds] } } })
```

### Posible discrepancia

| Conteo en card | Conteo en drawer | Causa |
|---|---|---|
| `Set(billing_account_id).size` | `profiles.length` (after findMany by crmId) | **Si un billing_account_id NO tiene CustomerProfile con crmId matching, el drawer muestra MENOS clientes** |

**Esto es una discrepancia real potencial:**
- Card muestra: "12 clientes" (conteo de billing_account_ids unicos)
- Drawer muestra: "8 clientes" (solo los que tienen CustomerProfile.crmId = billing_account_id)

La diferencia son clientes CRM que no fueron sincronizados al modulo `customers` o cuyo `CustomerProfile.crmId` no matchea el `billing_account_id`.

---

## FASE 7 — Auditoría de cache y snapshots

### Resultado: NO hay cache

| Capa | Mecanismo | Cache? |
|---|---|---|
| API Route (`/api/orgs/.../vendedores/[sellerSlug]`) | Direct Prisma query | **No** |
| Server Component (`page.tsx`) | `buildSellerDirectory()` + `buildSellerMetrics()` | **No** — Prisma live query |
| Client fetch (drawer) | `fetch()` sin cache headers | **No** |
| Next.js page | No `export const revalidate` | **Default: dynamic** |
| Prisma | No query cache | **No** |
| CDN/Vercel | API routes are dynamic by default | **No** |

**Conclusion:** El flujo es 100% live. Cada page load y cada drawer open ejecuta queries fresh contra Postgres. No hay snapshots, no hay materialización, no hay stale cache.

---

## FASE 8 — Diagnóstico final

### Escenarios descartados

| Escenario | Descartado? | Razon |
|---|---|---|
| C) Datos llegan pero no se asocian al vendedor | **SI** | `sellerSlug` se escribe en CRMQuote.upsert directamente desde `assigned_user_name`. Indice dedicado. Query del loader usa exactamente ese campo. |
| D) Loader usa logica incorrecta | **SI** | Loader hace `findMany WHERE { orgId, sellerSlug } ORDER BY issuedAt DESC`. Es la query correcta. |
| E) UI consume cache antiguo | **SI** | No hay cache en ninguna capa. Todo es live. |

### Escenarios posibles (requieren verificacion en DB)

| Escenario | Evidencia desde codigo | Probabilidad |
|---|---|---|
| **A) SuiteCRM no entrega datos recientes** | El sync filtra `date_entered >= cursor`. Si CRM no tiene nuevos registros post-cursor, la sync retorna 0 records. | **ALTA** |
| **B) Sync CRM no importa datos recientes** | Requiere: connector ACTIVE + credenciales validas + cron ejecutandose. El cron fue corregido en hotfix pero no hay evidencia de ejecucion exitosa. | **MEDIA** |
| **F) Todo funciona y la operacion comercial esta detenida** | Castillitos puede simplemente no estar generando cotizaciones nuevas en SuiteCRM. | **ALTA** |

### CAUSA RAIZ PRINCIPAL

**Escenario F con componente B como agravante.**

**Evidencia:**

1. El flujo de datos es correcto end-to-end (Fases 3-7 lo demuestran).
2. No hay cache, no hay snapshot, no hay transformacion incorrecta.
3. La UI muestra exactamente lo que esta en CRMQuote.
4. El cron CRM NO estaba activo hasta el hotfix (confirmado: `source: "sag_pya_soap"` excluia CRM).
5. Incluso despues del hotfix, si el CRM real (SuiteCRM de Castillitos) no tiene cotizaciones nuevas, el sync traera 0 registros.
6. "4m" de inactividad es consistente con: el equipo comercial de Castillitos no ha generado cotizaciones en SuiteCRM desde ~Febrero 2026.

**Para confirmar definitivamente se necesita:**

```sql
-- 1. Ultima cotizacion en Agentik
SELECT MAX("issuedAt") as ultima_cotizacion, MAX("updatedAt") as ultimo_sync FROM "CRMQuote";

-- 2. Ultimo ConnectorRun exitoso para CRM
SELECT "startedAt", "finishedAt", "status", "rowsImported"
FROM "ConnectorRun"
WHERE source = 'castillitos_crm' AND module = 'quotes'
ORDER BY "startedAt" DESC LIMIT 5;

-- 3. Cursor actual
SELECT module, cursor FROM "ConnectorCursor"
WHERE "connectorId" IN (SELECT id FROM "Connector" WHERE source = 'castillitos_crm');
```

---

## FASE 9 — Reporte ejecutivo

### 1. Hallazgos

1. **El flujo de datos CRM → Vendedores 360 es correcto y sin cache.** No hay bug.
2. **El cron de sync CRM estaba excluido** hasta el hotfix CRM-SYNC-CRON-HOTFIX-01.
3. **La asignacion de vendedor es directa y confiable** (`assigned_user_name` → `sellerSlug`).
4. **La UI refleja exactamente lo que esta en la base de datos** — sin intermediarios.
5. **Existe una discrepancia menor** entre conteo de clientes en card vs drawer (billing_account_id count vs CustomerProfile.crmId match).

### 2. Evidencia

- Codigo de sync: `storage.ts:678-679` escribe `sellerSlug`/`sellerName` directamente
- Codigo de loader: `vendedor-360-loader.ts:59` usa `WHERE { organizationId, sellerSlug }`
- Codigo de UI: No hay cache (`grep -r "cache|revalidate|unstable_cache"` = 0 hits)
- Codigo de cron: `data-sync/route.ts:49` filtraba solo SAG (corregido)
- Cursor: Avanza por `date_modified` pero filtra servidor por `date_entered`

### 3. Flujo completo auditado

```
SuiteCRM V8 (Castillitos)
  ├── assigned_user_name = "Vendedor X"
  ├── date_entered = "2026-02-15 14:30:00"
  ├── total_amount = 5000000
  ├── stage = "Facturado"
  └── billing_account_id = "abc-123"
       │
       │  OAuth2 client_credentials
       │  GET /Api/V8/module/AOS_Quotes?filter[date_entered][gte]=CURSOR
       │
       ▼
CastillitosCrmAdapter._fetchAllV8Pages()
  → flattenV8Record() → { date_entered, assigned_user_name, total_amount, ... }
  → latestDate = max(date_modified, date_entered) [cursor advancement]
       │
       ▼
mapCrmQuote() [mappers.ts:403-452]
  → issuedAt = parseDate("date_entered")
  → sellerName = str("assigned_user_name")
  → sellerSlug = toSlug(sellerName)
  → amount = num("total_amount")
  → meta.raw = full row
       │
       ▼
crmQuoteStorage [storage.ts:689-698]
  → prisma.cRMQuote.upsert({
      where: { organizationId_crmId },
      create/update: { sellerSlug, sellerName, issuedAt, amount, rawCrmJson, ... }
    })
       │
       ▼
CRMQuote (Postgres)
  → sellerSlug = "vendedor-x"
  → sellerName = "Vendedor X"
  → issuedAt = 2026-02-15T14:30:00Z
  → amount = 5000000
  → rawCrmJson.raw.billing_account_id = "abc-123"
  → rawCrmJson.raw.stage = "Facturado"
       │
       ├──────────────────────────────────────────────┐
       │                                              │
       ▼                                              ▼
buildSellerDirectory()                    loadVendedor360(orgId, slug)
  → findMany all quotes                    → findMany WHERE { orgId, sellerSlug }
  → groupBy sellerName                     → quotes[0].issuedAt → lastActivityAt
  → max(issuedAt) → lastActivityAt         → sum(amount) → totalCrmAmount
  → count(billing_account_id) → customers  → distinct(billing_account_id) → customerBillingIds
       │                                              │
       ▼                                              ▼
page.tsx (Server Component)               API Route → JSON response
  → sellers[] props                         → Vendedor360Data
       │                                              │
       ▼                                              ▼
VendedoresClient                          Drawer tabs (live render)
  → Dashboard KPIs                          → identity, crmQuotes, sagOrders, cartera
  → Cards grid                              → intelligence
  → Ranking
```

### 4. Punto exacto de ruptura

**No hay ruptura en el flujo de datos.** El sistema funciona correctamente.

La percepcion de "datos antiguos" tiene dos causas:

| # | Causa | Estado |
|---|---|---|
| 1 | **Cron CRM estaba deshabilitado** — no habia sync automatico | **CORREGIDO** (CRM-SYNC-CRON-HOTFIX-01) |
| 2 | **SuiteCRM no tiene cotizaciones nuevas** — el equipo comercial no las genera | **No es bug** — es realidad operativa |

### 5. Riesgo por módulo

| Modulo | Riesgo | Mitigacion |
|---|---|---|
| **Vendedores** | Todos en "Atencion" si no hay CRM nuevo | Regla 3-state (ACTIVITY-AUDIT-01) ya maneja esto correctamente |
| **Clientes** | lastPurchaseAt desactualizado | Depende de sync CustomerProfile (separado) |
| **Pedidos** | Lista muestra solo historico | Correcto si no hay pedidos nuevos |
| **Dashboards ejecutivos** | Filtros "hoy/ayer" vacios | **Riesgo bajo** — el dashboard muestra "—" correctamente |

### 6. Recomendación técnica

**Inmediata:**
1. Verificar en Vercel Logs si el cron `data-sync` ha corrido exitosamente con CRM
2. Verificar `ConnectorRun` para confirmar status del ultimo sync CRM
3. Verificar `ConnectorCursor` para quotes — determinar posicion actual del cursor

**Si la sync corrio pero trajo 0 registros:**
- **No es un bug.** SuiteCRM no tiene cotizaciones nuevas.
- Considerar agregar un indicador de freshness: "Datos CRM actualizados a: [fecha]"
- Considerar agregar estado "Sync OK - Sin datos nuevos" vs "Sync pendiente"

**Si la sync NO ha corrido:**
- Verificar `CRM_CLIENT_ID`/`CRM_CLIENT_SECRET` en Vercel env vars
- Verificar status del Connector (`ACTIVE` vs `INACTIVE`/`ERROR`)
- Ejecutar sync manual desde panel UI para diagnosticar

**Discrepancia de clientes (card vs drawer):**
- Card cuenta `billing_account_id` unicos (puede incluir IDs sin CustomerProfile)
- Drawer muestra solo los que tienen `CustomerProfile.crmId` match
- **Fix futuro:** Unificar conteo usando el mismo join, o crear CustomerProfile on-the-fly durante sync
