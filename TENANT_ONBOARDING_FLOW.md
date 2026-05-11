# TENANT_ONBOARDING_FLOW.md
# Sprint TA-01 — Phase D: Onboarding Flow Design

**Date:** 2026-05-06
**Status:** Design — no code changes

---

## 1. Philosophy

Onboarding a new company into Agentik must be:
- **Guided** — no Andrés needed. An operator follows the flow and gets to a working state
- **Non-destructive** — partial completion is fine. Steps are independent and resumable
- **Validated at each gate** — next step only unlocks when current step succeeds
- **Honest about state** — if a connector fails, the UI says so clearly with fix instructions
- **AI-native** — as soon as any data exists, Agentik offers something useful

---

## 2. Onboarding Entry Points

| Scenario | Entry point | Who triggers |
|---|---|---|
| New company from scratch | `SUPER_ADMIN` creates Organization via admin panel | Agentik staff |
| New business unit under existing group | TenantSwitcher → "Agregar empresa" | Agentik staff or ORG_ADMIN with group access |
| Self-service (future) | Public signup → org creation wizard | New client |

**Sprint TA-01 scope:** Agentik-staff-initiated only. Self-service is a future sprint.

---

## 3. Business Modes

Before connecting anything, the org admin selects their primary business type. This determines the recommended connector order and default module set.

| Mode | Label | Primary connector | Default modules |
|---|---|---|---|
| `erp_first` | ERP-First (Distribución / Mayorista) | PYA/SAG | dashboard, sales, collections, finance, torre_control, customer_360 |
| `commerce_first` | Commerce-First (E-commerce / Retail) | Shopify | dashboard, sales, marketing_studio, torre_control |
| `crm_first` | CRM-First (Servicios / Consultora) | HubSpot or manual | dashboard, sales, pipeline, alerts |

**Castillitos:** `erp_first` — ERP is the data backbone.
**Jupiter Pets:** `erp_first` — same PYA/SAG provider, different company token.

---

## 4. First-Run Flow — Step by Step

### STEP 0 — Organization Created (by Agentik admin)

```
Action: POST /api/admin/organizations
Body: { name, slug, type: "ENTERPRISE", businessMode: "erp_first" }
Result:
  - Organization row created
  - Initial TenantModule rows seeded (mode-appropriate defaults)
  - OnboardingChecklist row created (all steps: PENDING)
  - ORG_ADMIN membership created for designated user
```

The org is live at `/{slug}` but shows an onboarding banner — no business data yet.

---

### STEP 1 — Create Organization / Group Membership

**Screen:** Workspace setup
**Action:** Define org identity:
- Legal / display name
- Business unit type (kids fashion / pet retail / etc.)
- Primary language (es-CO, etc.)
- Currency (COP)
- Assign to OrgGroup (optional — for CEO comparison dashboard)
- Upload logo

**Gate to next step:** Organization row exists with name + slug + businessMode.

---

### STEP 2 — Select Business Mode

**Screen:** "¿Cómo opera tu empresa?"
**Options:** ERP-First / Commerce-First / CRM-First
**Effect:**
- Sets `Organization.settingsJson.businessMode`
- Pre-seeds TenantModule rows for recommended modules
- Determines which connectors appear first in Step 3

**Gate:** businessMode set.

---

### STEP 3 — Connect ERP (PYA/SAG) [ERP-First mode]

**Screen:** Connector setup form — `sag_pya_soap`
**Fields:**
- SOAP Endpoint URL
- API Token (sensitive)
- Empresa / database code
- Código Fuente Cobros
- Ka-Ni Fuente

**Actions (sequential):**
1. Save credentials → Connector row created (status: INACTIVE)
2. `POST .../connectors/{id}/validate` → tests SOAP connection → status: CONNECTION_VALIDATED
3. `POST .../connectors/{id}/sync?mode=sample` → fetches 50 rows per module → status: DATA_SAMPLE_VERIFIED
4. Admin reviews sample table → confirms mapping → enables modules → status: SYNC_ENABLED

**Gate:** DATA_SAMPLE_VERIFIED + at least one module enabled.

**If fails:** Show error + specific troubleshooting steps per error code (auth failure / unreachable endpoint / wrong database code).

---

### STEP 4 — Validate Customers / Products / Inventory

**Screen:** Data preview panel
**Shows:**
- Customer count from sample (CustomerProfile staging)
- Product count from sample
- Receivable count + total balance (preview)
- Inventory row count

**Admin action:** "Looks good → Run full sync" OR "Fix mapping → Back"

**Action:** `POST .../connectors/{id}/sync?module=all` → full sync starts in background

**Gate:** FIRST_SYNC_COMPLETED (at least customers + receivables imported)

---

### STEP 5 — Connect Shopify (optional for ERP-First, required for Commerce-First)

**Screen:** Shopify connector form
**Fields:**
- Shopify store domain
- Admin API access token (sensitive)
- API version

**Validation:** Live ping to `/admin/api/{version}/shop.json`
**Sample:** First 50 orders + products
**Gate:** DATA_SAMPLE_VERIFIED

---

### STEP 6 — Connect WhatsApp Business (optional)

**Screen:** WhatsApp setup
**Fields:**
- Phone Number ID (from Meta App Dashboard)
- WABA ID
- System User Access Token (sensitive)
- Webhook Secret (sensitive)
- Display name for AI greetings

**Validation:** Creates WhatsAppConfig row, sets `active: false`
**Test:** Sends test message to admin's own number
**Gate:** Connection verified + test message received

**Module activation:** `TenantModule: whatsapp → enabled: true`

---

### STEP 7 — Connect Social Accounts (optional)

**Screen:** Social channels
**Channels:**
- Meta (Facebook Page + Instagram Business)
- TikTok for Business

**For each:** OAuth flow → access token stored in Connector.config
**Gate:** At least one channel connected (or skip)

---

### STEP 8 — Configure AI Assistants

**Screen:** AI layer setup
**Options:**
- Brand voice (tones, adjectives, avoid words, hashtags)
- Marketing Studio preset whitelist
- WhatsApp AI persona (name, greeting style, escalation rules)
- Copilot mode (coach / auto)

**This populates:**
- Marketing Studio tenant config (DB-backed in TA-02)
- WhatsAppConfig.brandConfig
- WhatsAppConfig.intentConfig

**Gate:** Brand voice saved (can be minimal — name + 3 tones).

---

### STEP 9 — Activate Modules

**Screen:** Module checklist
**Shows:** All available modules with toggle
**Pre-selected:** Mode-appropriate defaults (Step 2)
**Admin adjusts:** Enable/disable per business need

**Action:** Batch upsert TenantModule rows

**Gate:** At least dashboard + one operational module enabled.

---

### STEP 10 — Run First Sync

**Screen:** Sync launcher
**Shows:** Selected modules + estimated row counts from sample
**Action:** POST sync per connector per module
**Progress:** Real-time row counts (polling ConnectorRun)
**Gate:** All enabled modules reach FIRST_SYNC_COMPLETED

---

### STEP 11 — Readiness Checklist

**Screen:** "Tu empresa está lista"
**Checklist (green/yellow/red per item):**

```
✅  Organization created
✅  ERP connected and synced
✅  Customers imported: 1,247
✅  Products imported: 3,891
✅  Receivables imported: 124,998 ($32.6B)
✅  Dashboard available
⚠️  Shopify not connected (optional)
⚠️  WhatsApp not connected (optional)
⚠️  Social accounts not connected (optional)
✅  Marketing Studio configured
✅  AI assistant ready
```

**Actions:**
- "Ir al Dashboard" → `/{orgSlug}/dashboard`
- "Completar configuración" → returns to first incomplete optional step
- "Conectar WhatsApp" → jumps to Step 6

---

## 5. OnboardingChecklist Model (TA-02)

```prisma
model OnboardingChecklist {
  id             String   @id @default(cuid())
  organizationId String   @unique

  // Core setup
  orgCreated          Boolean @default(false)
  businessModeSet     Boolean @default(false)

  // ERP
  erpConnected        Boolean @default(false)
  erpSampleVerified   Boolean @default(false)
  erpFirstSyncDone    Boolean @default(false)

  // Commerce
  shopifyConnected    Boolean @default(false)
  shopifyFirstSyncDone Boolean @default(false)

  // Channels
  whatsappConnected   Boolean @default(false)
  socialConnected     Boolean @default(false)

  // AI
  brandVoiceSet       Boolean @default(false)
  modulesActivated    Boolean @default(false)

  // Meta
  completedAt DateTime?
  updatedAt   DateTime  @updatedAt

  organization Organization @relation(...)
}
```

**Completion %** = count(true fields) / total fields — drives the onboarding progress bar.

---

## 6. Resumability

The onboarding flow is not a wizard with forced sequential steps — it is a **checklist with gates**. An operator can:
- Complete Step 3 (ERP) today, Step 5 (Shopify) next week
- Skip optional steps permanently
- Return to any step at any time via the onboarding panel

The OnboardingChecklist persists state. The readiness panel is always accessible from the sidebar until `completedAt` is set.

---

## 7. Error Recovery Per Step

| Step | Failure mode | Recovery action shown to user |
|---|---|---|
| STEP 3: ERP connect | 401 Unauthorized | "Verificar token en panel PYA → Copiar nuevo token" |
| STEP 3: ERP connect | Connection refused | "Verificar URL del endpoint + acceso de red" |
| STEP 3: ERP connect | Wrong database code | "Verificar código de empresa en PYA → campo 'database'" |
| STEP 4: Sync fails | Partial import | "Ver log de errores → Reintentar módulos fallidos" |
| STEP 5: Shopify | 403 Forbidden | "Regenerar token en Shopify Admin → Apps → Tokens" |
| STEP 6: WhatsApp | Webhook fails | "Verificar Webhook Secret en Meta App Dashboard" |

---

## 8. Post-Onboarding Health Monitoring

Once `completedAt` is set, Agentik transitions the org to steady-state monitoring:
- ConnectorRun health tracked every sync cycle
- BusinessAlert engine runs on new data
- Torre de Control cartera alerts activate
- WhatsApp AI handles incoming messages (if enabled)

Health degradation triggers the `ERROR_RECONNECT_REQUIRED` state and shows a banner in the dashboard.
