# JUPITER_PETS_ACTIVATION_BLUEPRINT.md
# Sprint TA-01 — Phase E: Jupiter Pets Activation Blueprint

**Date:** 2026-05-06
**Status:** Blueprint — no activation yet. Implementation in TA-07.

---

## 1. Business Profile

| Field | Value |
|---|---|
| Legal name | Jupiter Pets (exact legal name TBD) |
| Agentik org name | Jupiter Pets |
| Agentik org slug | `jupiter-pets` |
| Business type | Pet retail — food, accessories, hygiene, toys |
| Market | B2C + B2B (mayoristas) — Colombia |
| ERP provider | PYA/SAG — same provider as Castillitos, different company code |
| Business mode | `erp_first` |
| OrgGroup | Castillitos Group |
| Currency | COP |
| Language | es-CO |

---

## 2. Relationship to Castillitos

```
OrgGroup: Castillitos Group
├── Organization: castillitos     (kids retail — existing, live)
└── Organization: jupiter-pets   (pet retail — to be activated)
```

**Shared:**
- Same PYA/SAG provider (same SOAP endpoint URL)
- Same Agentik platform account for staff (SUPER_ADMIN/AGENTIK_ADMIN see both via TenantSwitcher)
- Same Agentik infrastructure (DB, hosting, domain)

**Isolated:**
- Jupiter PYA token ≠ Castillitos PYA token
- Jupiter company code in PYA ≠ Castillitos company code
- Completely separate CustomerReceivable, SaleRecord, CollectionRecord tables (by organizationId)
- Separate WhatsApp phone number and WABA
- Separate Shopify store (if used)
- Separate TenantModule flags
- Separate marketing config

---

## 3. PYA/SAG Strategy

### Connector Configuration

```typescript
// Jupiter Pets connector — Connector table row
{
  organizationId: "<jupiter-pets-org-id>",
  source: "sag_pya_soap",
  name: "Jupiter PYA",
  status: "ACTIVE",
  config: {
    baseUrl: "<same-pya-soap-endpoint>",  // same provider, different credentials
    token: "<JUPITER_PYA_TOKEN>",          // from env: JUPITER_PYA_TOKEN
    database: "<JUPITER_DB_CODE>",         // Jupiter's company code in PYA
    codigoFuente: "<JUPITER_FUENTE>",      // Jupiter's payment source code
    kaNiFuente: "<JUPITER_KA_NI>",         // Jupiter's NIT source key
  },
  modules: ["customers", "products", "receivables", "collections", "inventory"],
}
```

### Secret Strategy

- **Never hardcode** Jupiter credentials in source code
- Store in Vercel environment variables:
  - `JUPITER_PYA_TOKEN`
  - `JUPITER_PYA_DATABASE`
  - `JUPITER_PYA_CODIGO_FUENTE`
  - `JUPITER_PYA_KA_NI`
- At connector creation time (TA-07), seed Connector.config from env vars via admin script
- Castillitos connector credentials remain unchanged in their own Connector row

### Data Flow (identical to Castillitos)

```
PYA SAG SOAP endpoint
  └── sag_pya_soap adapter
        ├── pullCustomers()     → CustomerProfile (organizationId=jupiter-pets)
        ├── pullProducts()      → ProductSnapshot (organizationId=jupiter-pets)
        ├── pullReceivables()   → CustomerReceivable (organizationId=jupiter-pets)
        ├── pullCollections()   → CollectionRecord (organizationId=jupiter-pets)
        └── pullInventory()     → (future)
```

The adapter code (`lib/connectors/adapters/sag-pya-soap/index.ts`) already reads `connector.config.token`, `connector.config.database`, etc. — it is already generic. **No adapter changes needed** for Jupiter Pets.

---

## 4. Expected Modules

| Module | Jupiter Pets | Notes |
|---|---|---|
| `dashboard` | ✅ | Centro de Operaciones |
| `torre_control` | ✅ | Cartera + riesgo |
| `finance` | ✅ | FP&A |
| `sales` | ✅ | Control Comercial |
| `collections` | ✅ | Cola de Cobranza |
| `alerts` | ✅ | Centro de Decisiones |
| `customer_360` | ✅ | via `sales` module |
| `marketing_studio` | ✅ | Foto Estudio + redes |
| `whatsapp` | ✅ opt-in | Jupiter WhatsApp number |
| `shopify` | ⚠️ TBD | If Jupiter has a Shopify store |
| `inventory` | ✅ opt-in | Pet product stock |
| `copilot` | ⚠️ opt-in | After data is stable |
| `workforce` | ❌ | Not needed initially |
| `production` | ❌ | N/A for retail |

---

## 5. Product Catalog Flow

Jupiter Pets product categories (to be confirmed with Jupiter team):

| ERP category | Agentik category alias | Marketing Studio type |
|---|---|---|
| ALIMENTO | `pet_food` | product flat lay |
| ALIMENTO PERRO | `pet_food_dog` | product flat lay |
| ALIMENTO GATO | `pet_food_cat` | product flat lay |
| ACCESORIO | `pet_accessory` | product lifestyle |
| JUGUETE MASCOTA | `pet_toy` | product playful |
| HIGIENE | `pet_hygiene` | product clean |
| CAMA / CASA | `pet_furniture` | product lifestyle |
| ROPA MASCOTA | `pet_clothing` | product fashion |
| OTROS | `other` | generic |

**Product sync flow:**
1. PYA sync pulls products → `ProductSnapshot.organizationId = jupiter-pets`
2. Category aliases resolve via Jupiter's `TenantMarketingConfig.categoryAliases` (DB-backed in TA-02)
3. Marketing Studio intake shows Jupiter's product catalog filtered by org

---

## 6. Shopify Flow (if applicable)

If Jupiter Pets has a Shopify store:

```typescript
{
  organizationId: "<jupiter-pets-org-id>",
  source: "shopify",
  name: "Jupiter Pets Store",
  config: {
    shopDomain: "jupiter-pets.myshopify.com",
    apiKey: "<JUPITER_SHOPIFY_TOKEN>",
    apiVersion: "2024-10",
  },
  modules: ["orders", "products", "customers"],
}
```

Marketing Studio → Shopify publishing would target Jupiter's own store, isolated from any Castillitos publishing.

---

## 7. WhatsApp Flow

Jupiter Pets needs its own WhatsApp Business phone number — separate from Castillitos.

```typescript
// WhatsAppConfig row for Jupiter Pets
{
  organizationId: "<jupiter-pets-org-id>",  // @unique — no conflict with Castillitos
  phoneNumberId: "<JUPITER_WA_PHONE_ID>",
  wabaId: "<JUPITER_WABA_ID>",
  webhookSecret: "<JUPITER_WA_WEBHOOK_SECRET>",
  displayName: "Jupiter Pets",
  welcomeMessage: "¡Hola! Soy el asistente de Jupiter Pets. ¿En qué puedo ayudarte?",
  brandConfig: {
    tone: "friendly",
    useEmoji: true,
    closingStyle: "warm",
    signaturePhrases: ["Tu tienda de mascotas de confianza"],
  },
  active: false,  // activated after verification
}
```

Webhook URL: `https://agentik.co/api/webhooks/whatsapp/jupiter-pets`

---

## 8. Marketing Studio Flow

**Jupiter Pets TenantMarketingConfig** (to be DB-backed in TA-02, currently would be code-level):

```typescript
{
  tenantId:   "jupiter-pets",
  tenantName: "Jupiter Pets",
  tenantSlug: "jupiter-pets",
  active:     true,

  brandVoice: {
    tones:      ["friendly", "playful", "trustworthy", "warm"],
    adjectives: ["natural", "seguro", "amoroso", "colombiano", "de calidad"],
    avoidWords: ["barato", "genérico", "ordinario"],
    signatureHashtags: [
      "#JupiterPets", "#TiendaMascotas", "#MascotasFelices",
      "#PerrosColombia", "#GatosColombia", "#AlimentoMascota",
    ],
    copySampleHints: [
      "Para ellos, solo lo mejor.",
      "Nutrición que se nota.",
      "Tu mascota, nuestra pasión.",
    ],
  },

  defaultPresetId: "catalogo_fondo_blanco",
  allowedPresets: [
    "catalogo_fondo_blanco",
    "catalogo_ecommerce",
    "lifestyle_pets",   // new preset needed
    "redes_reel_tiktok",
    "redes_promo_instagram",
    "campana_lanzamiento",
  ],

  fidelityMode: "standard",
  fotoEstudio: {
    defaultBrandLine: "natural_pets",
    defaultGarmentType: "pet_accessory",
  },
}
```

Note: A `lifestyle_pets` preset may need to be created in the preset registry.

---

## 9. Torre de Control

Jupiter Pets gets its own Torre de Control at `/jupiter-pets/executive`:
- Cartera aging buckets — Jupiter's CustomerReceivable only
- Top debtors — Jupiter's CustomerProfile only
- Cobro queue — Jupiter's CollectionRecord only
- Alert signals — Jupiter's BusinessAlert only

No cross-contamination with Castillitos data.

---

## 10. CEO Comparison Dashboard (Castillitos Kids vs Jupiter Pets)

Accessible from the OrgGroup executive view (TA-07). Compares both business units side-by-side.

**Metrics:**

| KPI | Castillitos Kids | Jupiter Pets | Delta |
|---|---|---|---|
| Total cartera (COP) | $32.6B | TBD | TBD |
| Receivables OPEN | 124,998 | TBD | TBD |
| Cartera vencida > 90d | TBD | TBD | TBD |
| Clientes activos | TBD | TBD | TBD |
| Ventas MoM | TBD | TBD | TBD |
| Marketing Studio sessions / month | TBD | TBD | TBD |
| WhatsApp conversations / month | TBD | TBD | TBD |
| Cobros aplicados (auto-reconcile) | TBD | TBD | TBD |

**Query pattern:**
```typescript
// Group-level query — runs in parallel per org
const [castillitos, jupiter] = await Promise.all([
  getCarteraKPIs("castillitos-org-id"),
  getCarteraKPIs("jupiter-pets-org-id"),
]);
```

---

## 11. Activation Sequence (TA-07 Sprint)

```
Day 1:
  ✅ Create Organization jupiter-pets in DB (admin script)
  ✅ Create initial Membership for Andrés
  ✅ Seed TenantModule defaults (erp_first mode)
  ✅ Create OnboardingChecklist

Day 2:
  ✅ Retrieve Jupiter PYA credentials from Andrés/Jupiter team
  ✅ Create Connector row via admin script (NOT hardcoded)
  ✅ Validate connection (ping)
  ✅ Run DATA_SAMPLE_VERIFIED (50 rows per module)
  ✅ Review sample data with Andrés

Day 3:
  ✅ Run full sync — all modules
  ✅ Verify CustomerProfile, CustomerReceivable, SaleRecord counts
  ✅ Check cartera totals in Torre de Control
  ✅ Configure Marketing Studio tenant config
  ✅ Onboarding checklist → green

Week 2 (optional):
  ⬜ Jupiter WhatsApp number setup (requires Meta approval)
  ⬜ Shopify connection (if store exists)
  ⬜ Social accounts (Meta, TikTok)
  ⬜ Auto-reconciliation dry-run for Jupiter cartera
```

---

## 12. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Jupiter PYA database code differs significantly from Castillitos mapping | Medium | Medium | Sample verification gate catches this before full sync |
| PYA SOAP returns different field names for Jupiter company | Low | High | `mappers.ts` must be reviewed against Jupiter sample data |
| Jupiter has no Documento_pagado populated → reconciliation gap | Unknown | Medium | Dry-run first — same as Castillitos S3 sprint |
| WhatsApp WABA approval takes weeks | High | Low | Not blocking — WhatsApp is opt-in, activate post-onboarding |
| Jupiter category names differ from Castillitos aliases | Medium | Low | New categoryAliases in Jupiter's MarketingConfig |
| CEO dashboard requires cross-org query optimization | Low | Medium | Parallel Promise.all pattern, no single table join needed |
