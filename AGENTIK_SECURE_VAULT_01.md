# AGENTIK-SECURE-VAULT-01
## Multi-Tenant Secrets Vault Foundation

**Sprint closed:** 2026-05-10
**Files created:** 5 (in `lib/security/vault/`)
**TypeScript errors before:** 162 | **after:** 162 — no regressions

---

## Sprint Objective

Build a multi-tenant secrets vault foundation that:
- Covers ALL secret types across the platform (DIAN, PYA/SAG, Meta, Shopify, TikTok, banking)
- Enforces encryption before storage (AES-256-GCM)
- Provides a SecretRef pattern so modules receive references, never raw values
- Establishes role-based access boundaries
- Produces a typed audit trail for every secret access
- Enables safe logging via a redaction system

This sprint is the prerequisite for:
- DIAN-SECURITY-01 (real PKCS#12 signing + HTTP dispatch)
- Any live credential usage (Meta, Shopify, TikTok tokens)
- Banking API integration

---

## File Structure

```
lib/security/vault/                          NEW this sprint
├── vault-types.ts         Type surface: SecretRef, payloads, envelope, roles
├── vault-crypto.ts        AES-256-GCM encryption contract
├── vault-references.ts    vault:// URI builders and parsers
├── vault-redaction.ts     Masking, deep-redaction, safe metadata
├── vault-audit.ts         Typed audit event + structured log emitter
└── secure-vault.ts        Main facade: read/write/rotate/pack/unpack
```

---

## Secret Coverage

| Provider   | Secret Type          | SecretRef URI Pattern                              |
|------------|----------------------|----------------------------------------------------|
| DIAN       | Certificate password | `vault://orgId/dian/cert_<id>`                     |
| DIAN       | Software PIN         | `vault://orgId/dian/software_pin`                  |
| PYA / SAG  | SOAP token           | `vault://orgId/pya/soap_token`                     |
| Meta       | Page / system token  | `vault://orgId/meta/<tokenId>`                     |
| Shopify    | Admin API token      | `vault://orgId/shopify/admin_token`                |
| TikTok     | Business API token   | `vault://orgId/tiktok/access_token`                |
| Banking    | API credentials      | `vault://orgId/banking/<bankSlug>`                 |
| OAuth      | Any OAuth token set  | `vault://orgId/<provider>/oauth_<tokenId>`         |
| Webhook    | Verify secret        | `vault://orgId/<provider>/webhook_<id>`            |

---

## Architecture

### SecretRef — modules receive references, never values

```typescript
// A module gets a ref (safe to pass around):
const ref = dianCertRef("org_castillitos", "cert_prod_2024");
// ref.uri = "vault://org_castillitos/dian/cert_prod_2024"

// The vault resolves the ref to a payload (backend only, never serialized):
const result = SecureVault.readSecret(ref, envelope, context);
if (result.success) {
  const password = result.payload.certPassword; // DianCertSecretPayload
}
```

### Encryption contract

```
VAULT_MASTER_KEY   32-byte hex (64 hex chars) — server env var only
Algorithm          AES-256-GCM
IV                 12 bytes (randomBytes per operation)
Auth Tag           16 bytes (GCM AEAD)
Ciphertext format  base64( IV[12] || AuthTag[16] || Ciphertext )
Plaintext          JSON.stringify(VaultSecretPayload)
```

Generate a key: `openssl rand -hex 32`

### Storage model

```
Integration.secretsJson = VaultSecretEnvelope (version "2")

{
  version: "2",
  algorithm: "aes-256-gcm",
  secrets: [
    {
      id: "cert_prod_2024",
      type: "dian_certificate",
      ciphertext: "base64(...)",   // IV + AuthTag + AES-GCM ciphertext
      keyVersion: 1,
      createdAt: "2026-05-10T...",
      rotatedAt: null
    }
  ]
}
```

### Usage pattern (read)

```typescript
const raw = await prisma.integration.findFirst({ where: { organizationId, ... } });
const envelope = SecureVault.unpackEnvelope(raw.secretsJson);
const ref = dianCertRef(organizationId, "cert_prod_2024");
const result = SecureVault.readSecret(ref, envelope, {
  accessedBy: "dian-client",
  role: "AGENTIK_SERVICE",
  organizationId,
});
if (!result.success) throw new Error(result.error);
const { certPassword } = result.payload as DianCertSecretPayload;
```

### Usage pattern (write)

```typescript
const envelope = SecureVault.unpackEnvelope(existing.secretsJson);
const ref = dianCertRef(organizationId, "cert_prod_2024");
const result = SecureVault.writeSecret(ref, { type: "dian_certificate", certPassword }, envelope, context);
if ("error" in result) throw new Error(result.error);
await prisma.integration.update({
  where: { id: integrationId },
  data: { secretsJson: SecureVault.packEnvelope(result.env) }
});
```

---

## Role Boundaries

| Role             | READ | WRITE | ROTATE | DELETE | Secret Types              |
|------------------|------|-------|--------|--------|---------------------------|
| SUPER_ADMIN      | ✅   | ✅    | ✅     | ✅     | All                       |
| ORG_ADMIN        | ✅   | ✅    | ✅     | ❌     | All                       |
| FINANCE_ADMIN    | ✅   | ❌    | ❌     | ❌     | dian_certificate, dian_software_pin |
| AGENTIK_SERVICE  | ✅   | ❌    | ❌     | ❌     | All                       |
| OPERATOR         | ❌   | ❌    | ❌     | ❌     | None                      |

---

## Audit System

Every vault operation emits a structured log line to stderr:

```
[VAULT_AUDIT] action=READ org=org_castillitos provider=dian type=dian_certificate
ref=a3f912b4c7e81d2f by=usr_yyy role=AGENTIK_SERVICE success=true duration=2ms
ts=2026-05-10T15:30:00.000Z
```

- `ref` is SHA-256(vault URI)[0:16] — non-reversible, identifies the secret without revealing path
- No vault URIs in logs
- No secret values in logs
- Every DENIED also emits a reason (truncated to 120 chars, sanitized)

---

## Redaction System

```typescript
// Mask a single secret value
maskSecret("super-secret-token")  // → "supe****"

// Deep-redact an object before logging
redactObjectSecrets(integration.secretsJson)
// → { version: "2", secrets: [{ id: "...", ciphertext: "****", ... }] }

// Safe reference metadata (no URI, no secret content)
safeSecretMetadata(ref)
// → { referenceHash: "a3f912b4", provider: "dian", type: "dian_certificate", organizationId: "org_xxx" }
```

Redacted field names: `password`, `certPassword`, `token`, `accessToken`, `refreshToken`,
`idToken`, `apiKey`, `secret`, `secretKey`, `secretsJson`, `credentialsJson`, `pin`,
`softwarePin`, `privateKey`, `signingKey`, `encryptionKey`, `masterKey`, `webhookSecret`, `verifyToken`.

---

## Envelope Versioning

| Version | Shape                              | Status        |
|---------|------------------------------------|---------------|
| `"1"`   | Ad-hoc (DIAN: `{certificates:[]}`, PYA: `{token}`) | Legacy — unpackEnvelope returns empty envelope, triggers migration on next write |
| `"2"`   | VaultSecretEnvelope (this sprint)  | Current       |

---

## Key Rotation

```typescript
// 1. Generate new key: openssl rand -hex 32
// 2. Load old key as Buffer
const oldKey = Buffer.from(process.env["OLD_VAULT_MASTER_KEY"]!, "hex");
// 3. Set VAULT_MASTER_KEY to new key in environment
// 4. For each integration:
const result = SecureVault.rotateEnvelope(envelope, oldKey, context, NEW_KEY_VERSION);
if ("error" in result) throw new Error(result.error);
await prisma.integration.update({ data: { secretsJson: SecureVault.packEnvelope(result.env) } });
// 5. Decommission old key after all envelopes are rotated
```

---

## Security Audit

| Risk | Mitigation |
|------|-----------|
| Secrets in logs | redactObjectSecrets() on all objects; audit events never contain secret values |
| Vault URI in logs | Only referenceHash (SHA-256[0:16]) in logs — URI never logged |
| Wrong key | GCM auth tag failure throws VaultCryptoError before decrypted data is used |
| Cross-tenant read | Caller provides envelope from DB (already scoped to org); SecureVault checks role |
| Role bypass | VAULT_ROLE_PERMISSIONS enforced before every operation — no caller bypass |
| Stub in production | StubCertificateVault blocks in prod (DIAN layer) |
| Key not configured | loadMasterKey() throws VaultCryptoError if VAULT_MASTER_KEY is missing/invalid |
| Tampered ciphertext | AES-256-GCM authentication tag rejects any tampered data |

---

## Environment Variables Required

```env
VAULT_MASTER_KEY=<64 hex chars>   # openssl rand -hex 32
```

Never commit. Required in: development (local), staging, production.

---

## What Was NOT Implemented

- Prisma model for `VaultAuditRecord` (audit events go to stderr log only)
- Key rotation script (pattern documented, script pending ops tooling)
- Migration script for v1 → v2 envelopes (happens automatically on next write)
- Frontend components (vault is backend-only)
- API routes for vault admin
- External vault adapter (HashiCorp, AWS SM) — filesystem only

---

## What Was NOT Touched

- DIAN layer — zero modifications (DIAN-SECURITY-01 will integrate SecureVault)
- SAG / reconciliation — zero modifications
- Financial memory / observations — zero modifications
- Prisma schema — zero modifications
- All existing sprints' files — zero modifications

---

## Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | AES-256-GCM encryption contract with VAULT_MASTER_KEY | ✅ `vault-crypto.ts` |
| 2 | SecretRef vault:// URI pattern | ✅ `vault-references.ts` |
| 3 | Typed payloads for all secret providers | ✅ `vault-types.ts` (9 types) |
| 4 | Envelope versioning — v1 legacy handled | ✅ `secure-vault.ts unpackEnvelope()` |
| 5 | Role-based access enforcement | ✅ `VAULT_ROLE_PERMISSIONS` + `checkRolePermission()` |
| 6 | Audit trail on every READ/WRITE/ROTATE/DENIED | ✅ `vault-audit.ts` |
| 7 | Redaction system — safe for logs and API responses | ✅ `vault-redaction.ts` |
| 8 | Key rotation pattern | ✅ `rotateEnvelope()` + `rotateSecret()` |
| 9 | Zero new TypeScript errors | ✅ 162 → 162 |
| 10 | Zero SAG / reconciliation / financial modifications | ✅ Confirmed |

---

## Next Sprint Recommendation

**AGENTIK-DIAN-SECURITY-01 — WS-Security Signing Layer**

Now that the vault foundation exists, DIAN certs can be loaded securely:

```typescript
// New pattern for loadTenantDianContext():
const envelope = SecureVault.unpackEnvelope(integration.secretsJson);
const certRef   = dianCertRef(organizationId, activeCert.id);
const result    = SecureVault.readSecret(certRef, envelope, {
  accessedBy: "dian-client", role: "AGENTIK_SERVICE", organizationId,
});
const { certPassword } = result.payload as DianCertSecretPayload;
```

Then implement:
1. `node-forge` PKCS#12 parsing → extract private key + DER cert
2. RSA-SHA256 + C14N signing of SOAP envelope
3. Real `fetch()` dispatch to DIAN habilitación endpoint
4. Populate `TenantCertificateRef.commonName` and `expiresAt` from parsed cert
