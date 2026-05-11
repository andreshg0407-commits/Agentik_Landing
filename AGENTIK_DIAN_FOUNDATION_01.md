# AGENTIK-DIAN-FOUNDATION-01
## DIAN Infrastructure Foundation Layer

**Sprint closed:** 2026-05-10
**Files created:** 9 (all in `lib/integrations/dian/`)
**Files modified:** 0 — zero modifications to existing code
**TypeScript errors before:** 162 | **after:** 162 — no regressions

---

## Sprint Objective

Build the enterprise foundation for future DIAN web services integration.

This sprint does NOT connect to DIAN. It builds the infrastructure layer so
that Agentik can integrate DIAN securely, scalably, and auditably in the future.

```
FOUNDATION-01:  Types + SOAP architecture + WS-Security types + XML pipeline
SECURITY-01:    PKCS#12 parsing + RSA-SHA256 signing (future)
OPERATIONS-01:  Live GetAcquirer + GetStatus calls (future)
FISCAL-01:      Electronic invoice generation + CUFE (future)
```

---

## PDF Audit Summary

**Document:** Guía Herramienta para el Consumo de Web Services
**Source:** DIAN — Dirección de Gestión de Impuestos, Subdirección de Factura Electrónica
**Purpose:** GetAcquirer — complete buyer information for electronic invoicing

### Architecture understood from PDF

| Aspect | Finding |
|--------|---------|
| SOAP version | SOAP 1.2 (`http://www.w3.org/2003/05/soap-envelope`) |
| WCF service namespace | `http://wcf.dian.colombia` |
| WS-Addressing version | 200508 (`http://www.w3.org/2005/08/addressing`) |
| SOAPAction encoding | In `Content-Type` action parameter (SOAP 1.2 convention) |
| Authentication | WS-Security certificate-based signature |
| Certificate type | `.p12` (PKCS#12) keystore |
| Key Identifier Type | `Binary Security Token` |
| Signature Algorithm | RSA-SHA256 (`http://www.w3.org/2001/04/xmldsig-more#rsa-sha256`) |
| Canonicalization | Exclusive C14N (`http://www.w3.org/2001/10/xml-exc-c14n#`) |
| Digest Algorithm | SHA-256 (`http://www.w3.org/2001/04/xmlenc#sha256`) |
| Use Single Certificate | true |
| Prepend Signature Element | true |
| Signed Parts | `To` (WS-A addressing element) |
| Timestamp TTL | 60,000ms |
| Millisecond Precision | true |

### Environments

| Environment | Endpoint |
|-------------|---------|
| Habilitación | `https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc` |
| Producción | `https://vpfe.dian.gov.co/WcfDianCustomerServices.svc` |

### GetAcquirer operation

**Request:**
```xml
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" ...>
  <soap:Header>
    <o:Security ...> [WS-Security] </o:Security>
    <a:Action>http://wcf.dian.colombia/IWcfDianCustomerServices/GetAcquirer</a:Action>
    <a:To>https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc</a:To>
  </soap:Header>
  <soap:Body>
    <wcf:GetAcquirer xmlns:wcf="http://wcf.dian.colombia">
      <wcf:identificationType>13</wcf:identificationType>
      <wcf:identificationNumber>12345678</wcf:identificationNumber>
    </wcf:GetAcquirer>
  </soap:Body>
</soap:Envelope>
```

**Response fields:**
```xml
<b:CorreoElectronico>...</b:CorreoElectronico>
<b:Message>...</b:Message>
<b:NombreRazonSocial>...</b:NombreRazonSocial>
<b:StatusCode>200</b:StatusCode>
```

### identificationType codes (12 total)

| Code | Type |
|------|------|
| 11 | Registro civil |
| 12 | Tarjeta de identidad |
| 13 | Cédula de ciudadanía |
| 21 | Tarjeta de extranjería |
| 22 | Cédula de extranjería |
| 31 | NIT |
| 41 | Pasaporte |
| 42 | Documento de identificación extranjero |
| 47 | PEP (Permiso Especial de Permanencia) |
| 48 | PPT (Permiso Protección Temporal) |
| 50 | NIT de otro país |
| 91 | NUIP |

---

## File Structure

```
lib/integrations/dian/
├── types/
│   └── dian-types.ts           All types, interfaces, enums, namespace constants
├── config/
│   └── environment.ts          Env loading, habilitación/producción separation
├── security/
│   ├── certificate-manager.ts  Certificate loading, validation, security policy
│   └── ws-security.ts          WS-Security config, timestamp builder, types
├── soap/
│   ├── soap-envelope.ts        Namespace map, serializer, WS-A headers, escapeXml
│   └── soap-builder.ts         GetAcquirer SOAP request builder
├── xml/
│   ├── xml-helpers.ts          Safe text extraction, SOAP fault detection
│   └── xml-parser.ts           GetAcquirer response parser
└── client/
    └── dian-client.ts          Main client class + factory
```

---

## Environment Strategy

### Variables (server-side only — never `NEXT_PUBLIC_`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DIAN_ENVIRONMENT` | YES | `"habilitacion"` or `"produccion"` — anything else throws hard |
| `DIAN_CERT_PATH` | YES | Absolute path to `.p12` certificate file |
| `DIAN_CERT_PASSWORD` | YES | Certificate password — inject from secret manager |
| `DIAN_WSDL_URL` | no | Override default WSDL URL |
| `DIAN_SOAP_ENDPOINT` | no | Override default SOAP endpoint |
| `DIAN_CERT_ALIAS` | no | Alias within keystore |
| `DIAN_TIMEOUT_MS` | no | HTTP timeout (default 30,000ms, max 60,000ms) |
| `DIAN_DEBUG_LOG_XML` | no | `"true"` only in development — hardcoded false in production |

### Separation strategy

- `loadDianEnvironmentConfig()` throws `DianEnvironmentError` if `DIAN_ENVIRONMENT` is missing or invalid
- `assertEnvironment(config, "habilitacion")` / `assertEnvironment(config, "produccion")` guards in operation handlers
- `isHabilitacion()` / `isProduccion()` for conditional logic
- No defaults that silently pick an environment — explicit configuration required

---

## Certificate Architecture

### Security policy

1. **Backend only** — all certificate operations are server-side exclusively
2. **Path from env** — `DIAN_CERT_PATH` points to infrastructure-managed storage, never the repo
3. **Password from secret manager** — `DIAN_CERT_PASSWORD` is runtime-injected, never hardcoded
4. **Memory only** — loaded buffer is never persisted, cached, or logged
5. **No content in logs** — certificate bytes, private keys, and passwords never appear in logs
6. **Expiry monitoring** — 30-day warning threshold enforced by `validateCertificateExpiry()`

### What's implemented

- `validateCertificateConfig()` — path format + file existence + password presence
- `loadCertificateBuffer()` — reads raw `.p12` bytes from disk
- `buildCertificateStub()` — wraps buffer with typed envelope (commonName/validUntil null until DIAN-SECURITY-01)
- `validateCertificateExpiry()` — safe no-op in FOUNDATION-01 (activates once PKCS#12 parsing is added)
- `CERTIFICATE_SECURITY_POLICY` — typed const documenting all rules

### What's pending (DIAN-SECURITY-01)

- PKCS#12 parsing via `node-forge` — extract private key + cert chain + commonName + validUntil
- RSA-SHA256 canonical XML signing
- BinarySecurityToken XML element generation

---

## WS-Security Strategy

DIAN requires outgoing messages signed with:
- Exclusive C14N (`http://www.w3.org/2001/10/xml-exc-c14n#`)
- RSA-SHA256 (`http://www.w3.org/2001/04/xmldsig-more#rsa-sha256`)
- SHA-256 digest (`http://www.w3.org/2001/04/xmlenc#sha256`)
- Signing the `wsa:To` element (WS-Addressing)
- 60-second Timestamp TTL with millisecond precision

All these values are encoded as constants in `DIAN_WSS_SIGNATURE_CONFIG` and `DIAN_WSS_TIMESTAMP_CONFIG`.

In FOUNDATION-01, the Timestamp element is fully built and correctly serialized into the SOAP header. The signature (BST + `ds:Signature`) is commented as a pending TODO. The built request will be rejected by DIAN's endpoint without a signature — this is intentional.

---

## SOAP Architecture

SOAP 1.2 envelope structure for all DIAN requests:

```
<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="..." xmlns:a="..." xmlns:wcf="..." xmlns:o="..." xmlns:u="...">
  <soap:Header>
    <o:Security soap:mustUnderstand="1">
      <u:Timestamp>...</u:Timestamp>
      <!-- BinarySecurityToken: PENDING DIAN-SECURITY-01 -->
      <!-- Signature: PENDING DIAN-SECURITY-01 -->
    </o:Security>
    <a:Action>http://wcf.dian.colombia/IWcfDianCustomerServices/GetAcquirer</a:Action>
    <a:To>{endpointUrl}</a:To>
  </soap:Header>
  <soap:Body>
    <wcf:GetAcquirer>...</wcf:GetAcquirer>
  </soap:Body>
</soap:Envelope>
```

SOAPAction is encoded in `Content-Type` (not as a separate HTTP header):
```
Content-Type: application/soap+xml; charset=UTF-8; action="http://wcf.dian.colombia/..."
```

---

## XML Pipeline

### Injection prevention

- `escapeXml()` applied to all external/user values before embedding in XML
- Pattern: user data → `escapeXml(value)` → XML string
- `identificationNumber` is always escaped (user-controlled input)
- Namespace URIs are escaped (treated as potentially modified)

### Response parsing

- `extractXmlTextContent()` — namespace-aware leaf element extraction via controlled regex
- `extractSoapFault()` — handles both SOAP 1.1 and SOAP 1.2 fault structures
- `validateSoapResponse()` — pre-check before operation-specific parsing
- No XEE surface (no entity expansion, no external DTD)

---

## Security Audit Checklist

| Risk | Status |
|------|--------|
| Backend-only enforcement | Documented; no client imports |
| No frontend SOAP calls | No API routes created — client layer only |
| Certificate not in repo | Policy enforced via env var loading |
| Certificate password not hardcoded | Only loaded from `process.env["DIAN_CERT_PASSWORD"]` |
| No real HTTP requests | `getAcquirer()` returns stub error with clear message |
| XML injection prevention | `escapeXml()` applied to all external values |
| Environment mixing | `assertEnvironment()` + hard error on missing `DIAN_ENVIRONMENT` |
| Debug log in production | `isDebugLogXmlEnabled()` returns false when `NODE_ENV === "production"` |
| No Prisma in DIAN layer | Zero Prisma imports across all 9 files |
| No SAG coupling | Zero SAG imports or references |
| No financial module coupling | Zero imports from `lib/finance/*` or `lib/financial/*` |

---

## What Was NOT Implemented

- Real HTTP requests to DIAN
- PKCS#12 parsing (private key extraction)
- RSA-SHA256 XML signing
- BinarySecurityToken generation
- Any fiscal logic (CUFE, invoice XML, tax validation)
- Prisma schema changes
- Frontend components
- API routes
- Cron jobs
- Any connection to SAG, reconciliation, treasury, or financial memory

---

## What Was NOT Touched

- SAG integration — zero modifications
- Reconciliation engine — zero modifications
- Financial memory / observations / attention — zero modifications
- Executive dashboards — zero modifications
- Prisma schema — zero modifications
- Existing `lib/finance/dian-parser.ts` — zero modifications (different domain: local XML parsing)
- Existing `lib/finance/dian-read.ts` — zero modifications (different domain: fiscal document validation)

---

## Risks

| Risk | Mitigation |
|------|-----------|
| DIAN endpoint URL may change | Loaded from env vars; `DIAN_ENDPOINT_REGISTRY` as reference only |
| WS-Security requirements may evolve | All values in typed constants — single change point |
| Certificate expiry undetected | `validateCertificateExpiry()` ready; activates when PKCS#12 parsing is added |
| PKCS#12 parsing is complex | `node-forge` is the established Node.js library; isolated to `DIAN-SECURITY-01` |
| Test data only valid in habilitación | `isHabilitacion()` / `assertEnvironment()` guards prevent mixing |

---

## Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Foundation DIAN enterprise-ready | ✅ 9-file typed layer in `lib/integrations/dian/` |
| 2 | SOAP architecture decoupled | ✅ `soap-envelope.ts` + `soap-builder.ts` |
| 3 | WS-Security prepared | ✅ `ws-security.ts` with all DIAN-mandated constants |
| 4 | XML pipeline prepared | ✅ `xml-helpers.ts` + `xml-parser.ts` |
| 5 | Habilitación/producción separation | ✅ `environment.ts` with hard guards |
| 6 | Certificates isolated | ✅ `certificate-manager.ts` + `CERTIFICATE_SECURITY_POLICY` |
| 7 | No productive fiscal logic | ✅ HTTP dispatch is a documented stub |
| 8 | SAG not touched | ✅ Zero SAG modifications |
| 9 | Financial architecture not broken | ✅ Zero financial module modifications |
| 10 | TypeScript no new errors | ✅ 162 → 162 |

---

## Next Sprint Recommendation

**AGENTIK-DIAN-SECURITY-01 — WS-Security Signing Layer**

Prerequisite: A valid DIAN `.p12` certificate (habilitación environment).

1. Add `node-forge` dependency (or use Node.js 19+ `crypto.createPrivateKey` with P12 support)

2. Implement `parsePkcs12(buffer, password)` in `certificate-manager.ts`:
   - Extract private key (`forge.pki.privateKeyFromPem`)
   - Extract public certificate chain
   - Populate `commonName` and `validUntil`

3. Implement `signSoapEnvelope(xml, cert)` in `ws-security.ts`:
   - Apply Exclusive C14N to the `<u:Timestamp>` and `<a:To>` elements
   - Compute SHA-256 digest of canonicalized elements
   - Build `<ds:SignedInfo>` with `<ds:Reference>` entries
   - Apply C14N to `<ds:SignedInfo>`
   - Compute RSA-SHA256 signature over the canonicalized SignedInfo
   - Build `<o:BinarySecurityToken>` (base64 DER public cert)
   - Build `<ds:Signature>` + inject into `<o:Security>` header

4. Wire signing into `DianClient.getAcquirer()` and implement real `fetch()` dispatch

5. Test against habilitación with test data from the DIAN guide (page 10-11):
   - `identificationType=31, identificationNumber=3199991` → Nombre NIT 1
   - Verify StatusCode=200 + populated fields in response

No schema changes, no frontend changes, no fiscal logic.
