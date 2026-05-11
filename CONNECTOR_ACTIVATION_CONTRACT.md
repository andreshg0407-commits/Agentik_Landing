# CONNECTOR_ACTIVATION_CONTRACT.md
# Sprint TA-01 — Phase C: Connector Activation Contract

**Date:** 2026-05-06
**Status:** Architecture contract — no code changes

---

## 1. Philosophy

Connectors are the **data intake layer**. Each connector represents a live link between Agentik and one external provider for one organization.

Agentik does not replace the external platform — it subscribes to it, normalizes its data into the unified schema, and makes it actionable.

Connector lifecycle is deterministic, observable, and resumable. Every state transition is recorded.

---

## 2. Supported Provider Catalog

| Provider Key | Agentik Label | Data Domains | Auth Type |
|---|---|---|---|
| `sag_pya_soap` | ERP / PYA SAG | customers, products, receivables, collections, inventory, orders | Bearer token + company code |
| `shopify` | Shopify Commerce | orders, products, customers | API key + store URL |
| `meta_ads` | Meta (WhatsApp/Facebook/Instagram) | ad accounts, campaigns, insights | OAuth 2.0 |
| `tiktok_ads` | TikTok for Business | ad accounts, campaigns, insights | OAuth 2.0 |
| `google_drive` | Google Drive | documents, spreadsheets | OAuth 2.0 + service account |
| `whatsapp_cloud` | WhatsApp Business Cloud API | config, conversations | Phone number ID + token |
| `csv_upload` | CSV / Manual Import | any domain via mapping | File upload |

---

## 3. Connector Lifecycle — 8 States

```
NOT_CONNECTED
     │
     ▼
CREDENTIALS_RECEIVED         ← org admin pastes credentials
     │
     ▼
CONNECTION_VALIDATED         ← Agentik confirms reachability (ping/auth test)
     │
     ▼
DATA_SAMPLE_VERIFIED         ← first 50 rows fetched and mapped successfully
     │
     ▼
SYNC_ENABLED                 ← modules activated, connector status = ACTIVE
     │
     ▼
FIRST_SYNC_COMPLETED         ← ConnectorRun succeeds, rowsImported > 0
     │
     ▼
HEALTH_MONITORED             ← steady state, health checks on schedule
     │
     ▼ (on error)
ERROR_RECONNECT_REQUIRED     ← auto-detected or manually flagged
     │
     └──► → back to CONNECTION_VALIDATED (after credentials refresh)
```

### State Transitions

| From | To | Trigger | Who |
|---|---|---|---|
| NOT_CONNECTED | CREDENTIALS_RECEIVED | Admin submits credentials form | User |
| CREDENTIALS_RECEIVED | CONNECTION_VALIDATED | `POST /api/orgs/{orgSlug}/connectors/{id}/validate` | System |
| CREDENTIALS_RECEIVED | ERROR_RECONNECT_REQUIRED | Validation fails | System |
| CONNECTION_VALIDATED | DATA_SAMPLE_VERIFIED | `POST .../sync?mode=sample` | System |
| DATA_SAMPLE_VERIFIED | SYNC_ENABLED | Admin confirms and activates modules | User |
| SYNC_ENABLED | FIRST_SYNC_COMPLETED | First ConnectorRun completes with rowsImported > 0 | System |
| FIRST_SYNC_COMPLETED | HEALTH_MONITORED | Subsequent runs succeed | System |
| HEALTH_MONITORED | ERROR_RECONNECT_REQUIRED | ConnectorRun.status = ERROR, 3 consecutive | System |
| ERROR_RECONNECT_REQUIRED | CREDENTIALS_RECEIVED | Admin updates credentials | User |

---

## 4. ConnectorActivationState Data Structure

This is a read-only view computed from the `Connector` model + its `ConnectorRun` history. It does not require a new DB table — it is derived at query time for the activation UI.

```typescript
export interface ConnectorActivationState {
  // Identity
  connectorId:    string;
  organizationId: string;
  provider:       ConnectorProvider;     // "sag_pya_soap" | "shopify" | "meta_ads" | …
  name:           string;                // human-readable label

  // Lifecycle state
  activationStatus: ConnectorActivationStatus;
  activatedAt:    Date | null;           // when FIRST_SYNC_COMPLETED was reached

  // Health
  health:         ConnectorHealth;       // "HEALTHY" | "DEGRADED" | "DOWN" | "UNKNOWN"
  lastCheckedAt:  Date | null;
  lastSyncAt:     Date | null;
  lastSyncRows:   number | null;         // rowsImported from last successful run
  consecutiveErrors: number;             // resets on any success
  errorMessage:   string | null;

  // Sync state
  enabledModules: string[];              // from Connector.modules
  cursorState:    Record<string, string>; // module → cursor value

  // Provider requirements
  requiredScopes:    string[];           // provider-specific required permissions
  requiredFields:    ConnectorFieldSpec[]; // fields the admin must supply
  optionalFields:    ConnectorFieldSpec[];

  // Metadata
  lastRunId:      string | null;
  metadata:       Record<string, unknown>; // provider-specific extra context
}

export type ConnectorActivationStatus =
  | "NOT_CONNECTED"
  | "CREDENTIALS_RECEIVED"
  | "CONNECTION_VALIDATED"
  | "DATA_SAMPLE_VERIFIED"
  | "SYNC_ENABLED"
  | "FIRST_SYNC_COMPLETED"
  | "HEALTH_MONITORED"
  | "ERROR_RECONNECT_REQUIRED";

export type ConnectorHealth = "HEALTHY" | "DEGRADED" | "DOWN" | "UNKNOWN";

export interface ConnectorFieldSpec {
  key:         string;    // config JSON key
  label:       string;    // display label
  type:        "text" | "password" | "url" | "select";
  required:    boolean;
  sensitive:   boolean;   // if true: mask in UI, never log
  helpText?:   string;
  options?:    string[];  // for select type
}
```

---

## 5. Provider-Specific Contracts

### 5a. ERP / PYA SAG (`sag_pya_soap`)

**Required fields:**
```typescript
{
  baseUrl:        string;    // SOAP endpoint URL
  token:          string;    // sensitive — API bearer token
  database:       string;    // company code in PYA (e.g. "JUPITERP")
  codigoFuente:   string;    // source code for payment filtering
  kaNiFuente:     string;    // source key for NIT resolution
}
```

**Required scopes:** N/A (token-based)

**Enabled modules:** `["customers", "products", "receivables", "collections", "inventory"]`

**Health check:** `GET /api/orgs/{orgSlug}/connectors/{id}/ping` — calls SAG WSDL endpoint, expects 200 within 10s

**Notes:**
- Each business unit in PYA has a different `database` code AND a different `token`
- The same PYA provider (same SOAP endpoint) can serve multiple Agentik orgs with different tokens
- No cursor reset needed when adding a new org — each org starts fresh

---

### 5b. Shopify (`shopify`)

**Required fields:**
```typescript
{
  shopDomain:   string;    // "mystore.myshopify.com"
  apiKey:       string;    // sensitive — Admin API access token
  apiVersion:   string;    // e.g. "2024-10"
}
```

**Required scopes:**
- `read_products` — product catalog
- `read_orders` — order history
- `read_customers` — customer profiles
- `write_products` — Marketing Studio → Shopify draft publishing

**Enabled modules:** `["orders", "products", "customers"]`

**Health check:** `GET https://{shopDomain}/admin/api/{apiVersion}/shop.json` with token

---

### 5c. WhatsApp Business Cloud API (`whatsapp_cloud`)

**Required fields:**
```typescript
{
  phoneNumberId: string;   // Meta Cloud API phone_number_id
  wabaId:        string;   // WhatsApp Business Account ID
  accessToken:   string;   // sensitive — permanent system user token
  webhookSecret: string;   // sensitive — used to verify Meta webhook signatures
  displayName:   string;   // business display name for AI greetings
}
```

**Required scopes:**
- `whatsapp_business_messaging`
- `whatsapp_business_management`

**Notes:**
- WhatsAppConfig is org-scoped (`@unique organizationId`) — each org gets its own row
- Jupiter Pets gets its own phone number, WABA, and webhook secret
- Webhook URL format: `https://agentik.co/api/webhooks/whatsapp/{orgSlug}`

---

### 5d. Meta Ads / Facebook / Instagram (`meta_ads`)

**Required fields:**
```typescript
{
  accessToken:  string;    // sensitive — long-lived user or system token
  adAccountId:  string;    // act_XXXXXXXXXX
  pageId:       string;    // Facebook Page ID for organic content
  igUserId:     string;    // Instagram Business Account ID
}
```

**Required scopes:**
- `ads_read`
- `ads_management`
- `pages_read_engagement`
- `instagram_basic`
- `instagram_content_publish`

---

### 5e. TikTok for Business (`tiktok_ads`)

**Required fields:**
```typescript
{
  accessToken:   string;   // sensitive — TikTok Ads Manager token
  advertiserId:  string;   // TikTok advertiser ID
  appId:         string;   // TikTok developer app ID
}
```

**Required scopes:**
- `Ad account management`
- `Campaign management`
- `Report center`

---

### 5f. Google Drive (`google_drive`)

**Required fields (service account path):**
```typescript
{
  serviceAccountJson: string;  // sensitive — full service account key JSON
  folderId:           string;  // root folder ID to scope access
}
```

**OR OAuth path:**
```typescript
{
  clientId:     string;
  clientSecret: string;  // sensitive
  refreshToken: string;  // sensitive
}
```

---

## 6. Deriving ConnectorActivationState from Existing Data

```typescript
// lib/connectors/activation-state.ts (to be created in TA-02)

export async function getConnectorActivationState(
  connectorId: string,
): Promise<ConnectorActivationState> {
  const connector = await prisma.connector.findUnique({
    where: { id: connectorId },
    include: {
      runs: {
        orderBy: { startedAt: "desc" },
        take: 10,
      },
      cursors: true,
    },
  });

  const lastRun = connector.runs[0] ?? null;
  const hasEverSucceeded = connector.runs.some(r => r.rowsImported > 0);
  const consecutiveErrors = computeConsecutiveErrors(connector.runs);

  const activationStatus = deriveActivationStatus(connector, hasEverSucceeded, consecutiveErrors);
  const health = deriveHealth(connector, lastRun, consecutiveErrors);

  return { connectorId, /* ... */ activationStatus, health, /* ... */ };
}

function deriveActivationStatus(
  connector: Connector,
  hasEverSucceeded: boolean,
  consecutiveErrors: number,
): ConnectorActivationStatus {
  if (connector.status === "INACTIVE") return "NOT_CONNECTED";
  if (connector.status === "ERROR" || consecutiveErrors >= 3) return "ERROR_RECONNECT_REQUIRED";
  if (!hasEverSucceeded && connector.status === "ACTIVE") return "SYNC_ENABLED";
  if (hasEverSucceeded) return "HEALTH_MONITORED";
  return "CREDENTIALS_RECEIVED";
}
```

---

## 7. Health Computation

```typescript
function deriveHealth(
  connector: Connector,
  lastRun: ConnectorRun | null,
  consecutiveErrors: number,
): ConnectorHealth {
  if (!lastRun) return "UNKNOWN";
  if (consecutiveErrors >= 3) return "DOWN";
  if (consecutiveErrors >= 1) return "DEGRADED";
  const age = Date.now() - lastRun.startedAt.getTime();
  if (age > 48 * 60 * 60_000) return "DEGRADED";  // no run in 48h
  return "HEALTHY";
}
```

---

## 8. Required Scope Registry (Provider-Level)

The scope registry lives in `lib/connectors/provider-registry.ts` (to be created in TA-02):

```typescript
export const PROVIDER_REGISTRY: Record<ConnectorProvider, ProviderDefinition> = {
  sag_pya_soap: {
    label: "ERP / PYA SAG",
    requiredScopes: [],
    requiredFields: [
      { key: "baseUrl",      label: "SOAP Endpoint URL",     type: "url",      sensitive: false },
      { key: "token",        label: "API Token",             type: "password", sensitive: true  },
      { key: "database",     label: "Empresa (código PYA)",  type: "text",     sensitive: false },
      { key: "codigoFuente", label: "Código Fuente Cobros",  type: "text",     sensitive: false },
      { key: "kaNiFuente",   label: "Ka-Ni Fuente",          type: "text",     sensitive: false },
    ],
    optionalFields: [],
    defaultModules: ["customers","products","receivables","collections","inventory"],
    healthCheckModule: "customers",
  },
  shopify: { /* ... */ },
  meta_ads: { /* ... */ },
  // ...
};
```

---

## 9. Idempotency and Safety Rules

1. **Validate before activate** — never write business data until CONNECTION_VALIDATED
2. **Sample before full sync** — DATA_SAMPLE_VERIFIED gate catches mapping errors early
3. **Credentials never logged** — all `sensitive: true` fields are masked in ConnectorRun.meta
4. **Cursor isolation** — each Connector has its own ConnectorCursor; adding a new org never affects existing cursors
5. **No connector sharing** — two orgs never share a Connector row, even if same provider
6. **Error does not cascade** — one org's connector failure has no impact on other orgs
7. **Resume-safe** — cursor-based sync means a failed run can be retried from last position
