# AGENTIK-DIAN-MULTITENANT-SECURITY-01
## Multi-Tenant Fiscal Security Architecture

**Sprint closed:** 2026-05-10
**Files created:** 3 (in `lib/integrations/dian/tenant/`)
**Files modified:** 1 (`lib/integrations/dian/client/dian-client.ts`)
**TypeScript errors before:** 162 | **after:** 162 — no regressions

---

## Sprint Objective

Evolve the DIAN foundation from single-org to multi-tenant enterprise architecture.

```
FOUNDATION-01:         Types + SOAP + WS-Security + XML pipeline (single-org env vars)
MULTITENANT-01:        Per-tenant certificate ownership + vault abstraction + tenant context
SECURITY-01 (future):  PKCS#12 signing layer
OPERATIONS-01 (future): Live GetAcquirer + GetStatus
```

---

## Architectural Decision: No Global DIAN Certificate

**Before (FOUNDATION-01):** The DIAN client read credentials from global env vars
(`DIAN_ENVIRONMENT`, `DIAN_CERT_PATH`, `DIAN_CERT_PASSWORD`).

**After (MULTITENANT-01):** Each tenant owns their certificate. Agentik is a
consumer and orchestration layer — not a fiscal entity.

```
BEFORE:                              AFTER:
Agentik → DIAN (1 cert)             Castillitos → DIAN (Castillitos cert)
                                     Cliente A   → DIAN (Cliente A cert)
                                     Cliente B   → DIAN (Cliente B cert)
                                     ...60+ tenants, zero sharing
```

---

## Architecture Audit (Mandatory Pre-work)

### Existing tenant model

| Layer | Finding |
|-------|---------|
| `Organization` | The tenant unit. All data scoped by `organizationId`. |
| `Integration` | `organizationId + provider: DIAN` — **already in schema**. Has `secretsJson` + `configJson` + `status`. This is the correct anchor — no new models needed. |
| `IntegrationProvider` | Enum already includes `"DIAN"`. Ready. |
| `Connector` | Per-tenant, per-source. Pattern reference for `config` storage. |
| `MetricSnapshot` | Per-org. Confirmed pattern for tenant data isolation. |
| `TenantModule` | Per-org module flags. Reference for how opt-in activation works. |

### Scaling assessment (ARKETOPS model)

- ARKETOPS has ~60 fiscal clients
- Each client = one `Organization` row + one `Integration` row (provider: DIAN)
- Certificate isolation: each `Integration.configJson` carries its own `certPath`
- Password isolation: each `Integration.secretsJson` carries its own cert password
- Zero cross-tenant leakage: every query is scoped by `organizationId`
- No singleton client, no global cert cache — each `DianClient.forTenant()` call is isolated

---

## New File Structure

```
lib/integrations/dian/
├── tenant/                               NEW this sprint
│   ├── tenant-types.ts                   Tenant domain model + stored config schemas
│   ├── tenant-loader.ts                  Loads TenantDianIntegration from DB
│   └── certificate-vault.ts             Vault abstraction + filesystem implementation
├── client/
│   └── dian-client.ts                    EVOLVED: added forTenant() + tenant accessors
└── ... (all other files unchanged)
```

---

## Tenant Domain Model

### TenantDianIntegration

The assembled fiscal integration for a tenant. Loaded from `Integration` record.

```
organizationId       Tenant boundary — all operations scoped here
integrationId        Integration.id (provider: DIAN)
environment          "habilitacion" | "produccion"
fiscalIdentity       NIT + digitoVerificacion + razonSocial
certificates[]       TenantCertificateRef[] — references, not bytes
softwareIdentity     softwareId + providerNit (null until e-invoicing is needed)
syncState            operational health + testSetId + lastError
```

### TenantCertificateRef

A reference to a certificate — never the raw bytes or password.

```
id              Internal ID matching secretsJson entry
label           "Castillitos producción 2024"
alias           PKCS#12 keystore alias
storageType     "filesystem" | "vault_reference" | "encrypted_db"
certPath        Absolute server path (filesystem only, infra-managed)
vaultRef        Vault key (vault_reference only)
environment     "habilitacion" | "produccion"
isActive        Whether this cert is the active one for its environment
expiresAt       ISO string — populated once PKCS#12 parsing is added
commonName      Certificate CN — populated once PKCS#12 parsing is added
```

### TenantDianContext (runtime)

The per-request operational context. Has the cert password loaded at runtime.

```
organizationId   Tenant boundary
integrationId    Source integration
environment      "habilitacion" | "produccion"
soapEndpoint     Per-environment endpoint URL
certificate      DianCertificateConfig { certPath, certPassword, alias }
                 ↑ certPassword is runtime only — never persisted
```

---

## Stored Config Schemas

### Integration.configJson (non-sensitive)

```typescript
{
  version: "1",
  environment: "habilitacion" | "produccion",
  fiscalIdentity: {
    nit: "900123456", digitoVerificacion: "7",
    razonSocial: "Castillitos S.A.S.", ...
  },
  certificates: [{
    id: "cert_prod_2024",
    label: "Castillitos producción 2024",
    alias: "castillitos",
    storageType: "filesystem",
    certPath: "/run/secrets/dian/castillitos_prod.p12",
    environment: "produccion",
    isActive: true,
    expiresAt: null,    // populated after PKCS#12 parsing
    commonName: null    // populated after PKCS#12 parsing
  }],
  software: {
    softwareId: "uuid-from-dian",
    providerNit: "900999888",
    providerRazonSocial: "Proveedor Tech S.A.S."
  }
}
```

### Integration.secretsJson (encrypted at app layer)

```typescript
{
  version: "1",
  certificates: [{ id: "cert_prod_2024", password: "..." }],
  softwarePin: "..."
}
```

**Never log. Never serialize to client. Never include in error messages.**

---

## Certificate Ownership Model

```
Tenant (Organization)
  └── Integration (provider: DIAN)
        ├── configJson.certificates[0]  ← reference (path, alias, env, active)
        ├── configJson.certificates[1]  ← rotation candidate
        └── secretsJson.certificates    ← passwords (encrypted)
```

Rules:
1. Certificate belongs to the tenant — Agentik never holds a shared cert
2. Path managed by infrastructure (not the repository)
3. Password from secretsJson — encrypted at application layer before storage
4. Multiple certs supported: active + rotation candidate + legacy
5. Environment separation: each cert tagged `"habilitacion"` or `"produccion"`

---

## Certificate Vault Abstraction

```
CertificateVault (interface)
  ├── loadCertBytes(ref, orgId) → Buffer
  └── getCertPassword(certId, orgId) → string

Implementations:
  FilesystemCertificateVault    COMPLETE — reads .p12 from certPath
  ExternalVaultCertificateVault PENDING  — HashiCorp Vault / AWS SM
  EncryptedDbCertificateVault   PENDING  — encrypted blob in DB
  StubCertificateVault          COMPLETE — for testing only (blocked in production)
```

The vault interface allows swapping storage backends without touching
the DIAN client or SOAP stack.

`buildVaultForCertificate(ref, secrets)` selects the correct implementation
based on `ref.storageType`. Currently only "filesystem" is live.

---

## DianClient: Two Instantiation Modes

### Mode 1 — Global env (single-org / fallback)

```typescript
const client = new DianClient(buildDianClientConfig());
// Reads: DIAN_ENVIRONMENT, DIAN_CERT_PATH, DIAN_CERT_PASSWORD
```

### Mode 2 — Tenant-aware (multi-tenant, preferred)

```typescript
const result = await loadTenantDianContext(organizationId, "habilitacion");
if (!result.success) { /* handle */ }
const client = DianClient.forTenant(result.context);
// client.organizationId → organizationId
// client.integrationId  → Integration.id
```

Each `forTenant()` call creates a fully isolated client instance.
No global state. No tenant leakage.

---

## Environment Isolation Per Tenant

```
Tenant A — habilitación
  Integration.configJson.environment: "habilitacion"
  Certificate[0].environment: "habilitacion"
  → loadTenantDianContext(orgA, "habilitacion") ✅
  → loadTenantDianContext(orgA, "produccion")   ❌ returns error

Tenant B — producción
  Integration.configJson.environment: "produccion"
  Certificate[0].environment: "produccion"
  → loadTenantDianContext(orgB, "produccion")   ✅
  → loadTenantDianContext(orgB, "habilitacion") ❌ returns error
```

Cross-environment contamination is structurally impossible.

---

## ARKETOPS Scaling Readiness

| Dimension | Design | Capacity |
|-----------|--------|---------|
| Tenants | One Integration row per org | Unlimited |
| Concurrent clients | Each DianClient.forTenant() is isolated | Unlimited |
| Certificates | Array in configJson — multiple per tenant | N per tenant |
| Certificate rotation | Old cert kept in array; isActive toggled | Zero downtime |
| Expiry monitoring | `validateTenantDianIntegration()` detects expiry | Checked on use |
| Batch health check | `listDianIntegrationsForGroup(orgIds[])` | All 60 orgs in one query |
| Sync scheduling | `TenantFiscalSyncState` tracks status per org | Per-tenant state |
| Error isolation | One tenant's cert failure does not affect others | Full isolation |

---

## Future Fiscal Memory Readiness

`TenantFiscalSyncState` is the seed for future fiscal memory:

```
today:      status + lastError + testSetId
FISCAL-MEM: + lastSyncedAt + pendingDocuments + rejectedDocuments
FISCAL-OBS: + consecutive errors → DianObservation (like ConsignacionObservation)
FISCAL-COP: + fiscal attention routing (like AttentionRouterResult)
```

The fiscal copilot will follow the same deterministic pattern:
observations from sync state → attention routing → fiscal strip in UI.

---

## Future Fiscal Copilot Readiness

```
TenantDianIntegration    → fiscal identity + cert health + environment
TenantFiscalSyncState    → operational signals (errors, pending, rejected)
     ↓
DianObservationEngine    → deterministic pattern detection
     ↓
DianAttentionRouter      → primary signal + grouped signals
     ↓
FiscalObservationStrip   → "3 tenants con certificados por vencer"
                            "Castillitos: error de autenticación consecutivo"
```

---

## Security Audit

| Risk | Mitigation |
|------|-----------|
| Cross-tenant cert access | All queries filter by `organizationId` — structural isolation |
| Password in logs | Passwords only in memory during request handling — never logged |
| Shared global cert | No global cert — each tenant provides their own via Integration |
| Hardcoded cert paths | certPath comes from `Integration.configJson` — infra-managed |
| Production test calls | `loadTenantDianContext()` validates env match before returning context |
| Expired certificate | `validateTenantDianIntegration()` checks expiry; 30-day warning |
| StubVault in production | Constructor throws `DianVaultError` if `NODE_ENV === "production"` |
| SecretJson in batch list | `listDianIntegrationsForGroup()` explicitly excludes `secretsJson: false` |

---

## What Was NOT Implemented

- Real HTTP requests to DIAN
- PKCS#12 parsing / RSA-SHA256 signing (DIAN-SECURITY-01)
- Any fiscal logic (CUFE, invoice XML, tax validation)
- New Prisma models or migrations (uses existing `Integration` model)
- Frontend components
- API routes
- Cron jobs
- Fiscal memory or observations

---

## What Was NOT Touched

- SAG integration — zero modifications
- Reconciliation — zero modifications
- Financial memory / observations / attention routing — zero modifications
- Executive dashboards — zero modifications
- Prisma schema — zero modifications
- All FOUNDATION-01 files (types, config, security, soap, xml) — zero modifications
- Existing `lib/finance/dian-parser.ts` / `dian-read.ts` — zero modifications

---

## Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | DIAN architecture is multi-tenant | ✅ `TenantDianIntegration` + `loadTenantDianContext()` |
| 2 | Certificates belong to tenants | ✅ `TenantCertificateRef` owned by `organizationId` |
| 3 | Habilitación/producción separated per tenant | ✅ env validated in `loadTenantDianContext()` |
| 4 | No global env dependency for multi-tenant path | ✅ `DianClient.forTenant()` reads from Integration |
| 5 | Architecture supports 60+ clients | ✅ `listDianIntegrationsForGroup()` + isolated client instances |
| 6 | Layer remains decoupled from SAG/reconciliation | ✅ Zero cross-module imports |
| 7 | No unsafe fiscal logic | ✅ HTTP dispatch still stub — pending DIAN-SECURITY-01 |
| 8 | Financial architecture not broken | ✅ Zero financial module modifications |
| 9 | No secrets exposed | ✅ secretsJson excluded from batch listing, never logged |
| 10 | TypeScript no new errors | ✅ 162 → 162 |

---

## Next Sprint Recommendation

**AGENTIK-DIAN-SECURITY-01 — WS-Security Signing Layer**

Prerequisite: A valid DIAN habilitación `.p12` certificate for at least one tenant.

1. Install `node-forge` (or use Node.js native crypto P12 support)
2. Implement `parsePkcs12(buffer, password)` → extract private key + DER cert
3. Implement `signSoapEnvelope(xml, privateKey, derCert)` — RSA-SHA256 + C14N
4. Populate `TenantCertificateRef.commonName` and `expiresAt` from parsed cert
5. Replace stub return in `DianClient.getAcquirer()` with real `fetch()` dispatch
6. Test against habilitación using DIAN guide test data (NIT type 31, numbers 3199991–31999910)

No schema changes. No frontend changes. No fiscal logic. Signing layer only.
