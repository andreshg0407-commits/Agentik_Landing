# TENANT-BRANDING-SAVE-HOTFIX-01 -- Sprint Report

**Date:** 2026-07-04
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)

---

## Problem

"Error al guardar." shown without useful detail when saving corporate identity.

## Root Causes

### 1. API route had no try/catch around Prisma upsert
Any Prisma error (P2002 unique constraint, P2003 FK violation, connection error)
crashed the handler into a 500 response with no JSON body.

### 2. Client `brandingApi()` didn't check `res.ok`
On non-200 responses, `res.json()` could fail (HTML error page) or return
a body without an `.error` field, falling into the generic catch.

### 3. No client-side validation beyond colors
Email, URL, and website fields were sent without validation. Invalid URLs
would pass to the database and either fail silently or corrupt data.

### 4. No payload sanitization
The entire `form` object was sent as-is, including potential stale keys
not in `BrandingUpsertInput`. The API now whitelists accepted fields.

---

## Fixes

### FASE 1: API Save Hardening (`route.ts`)

- **try/catch** around `upsertOrganizationBranding()` with structured error logging:
  ```
  [BRANDING_SAVE_ERROR] orgSlug=... orgId=... code=P2002 message=...
  ```
- **Prisma error mapping:**
  - P2002 (unique constraint) -> 409: "Ya existe una identidad corporativa..."
  - P2003 (FK violation) -> 404: "La organizacion no existe o fue eliminada."
  - Other -> 500 with actual error message
- **Payload whitelist:** Only `ALLOWED_FIELDS` accepted (18 fields)
- **Server-side URL validation** for website, logoUrl, logoDarkUrl, logoMonoUrl
- **Server-side email validation** (must contain @)

### FASE 2: Detailed Error Messages in UI (`branding-client.tsx`)

- `brandingApi()` now checks `res.ok` before parsing JSON
- On non-OK responses, extracts `error` from response body
- On JSON parse failure, returns `"Error del servidor ({status})"`
- Catch block shows `e.message` instead of generic string

### FASE 3: Client-Side Validation

Before sending to API, validates:
- **Colors**: HEX format (#XXX or #XXXXXX)
- **URLs**: Must start with `http://` or `https://`
- **Email**: Basic format check (contains @, no spaces)
- All validation errors collected and shown at once

### FASE 4: Payload Normalization

- API whitelists exactly 18 accepted fields via `ALLOWED_FIELDS`
- Values trimmed before storage
- Empty strings preserved (allows user to clear fields)
- Unknown keys silently dropped

### FASE 5: Data Preservation on Error

- Form state is NEVER cleared on save failure
- Import files, extraction data, and uploaded logos all preserved
- `setSaving(false)` in `finally` block ensures button re-enables
- User can retry immediately after fixing the error

---

## Error Messages (User-Facing)

| Scenario | Message |
|----------|---------|
| Invalid hex color | "Color principal no tiene formato HEX valido (ej. #004AAD)." |
| Invalid URL | "Logo URL: debe comenzar con http:// o https://" |
| Invalid email | "Email: formato invalido." |
| Duplicate branding (P2002) | "Ya existe una identidad corporativa para esta organizacion." |
| Org not found (P2003) | "La organizacion no existe o fue eliminada." |
| DB error | "Error de base de datos al guardar: {message}" |
| Network error | "Error de conexion al guardar. Verifica tu conexion e intenta de nuevo." |

---

## Files Modified

| File | Change |
|------|--------|
| `app/api/orgs/[orgSlug]/branding/route.ts` | try/catch, logging, payload whitelist, URL/email validation, Prisma error mapping |
| `app/(app)/[orgSlug]/configuracion/branding/branding-client.tsx` | `res.ok` check, client validation (URL, email, colors), detailed error messages |
