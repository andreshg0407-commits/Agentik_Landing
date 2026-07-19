# TENANT-BRANDING-FOUNDATION-01 -- Sprint Report

**Date:** 2026-07-04
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)

---

## Objective

Create a single source of corporate identity per tenant, consumed transversally by Comercial, Marketing, PDFs, catalogs, and communications.

---

## Model: OrganizationBranding

| Field | Type | Purpose |
|-------|------|---------|
| id | String | Primary key |
| organizationId | String (unique) | 1:1 with Organization |
| commercialName | String? | Visible business name |
| legalName | String? | Registered legal name |
| taxId | String? | NIT / RUT |
| address | String? | Business address |
| city | String? | City |
| country | String? | Country (default: Colombia) |
| phone | String? | Contact phone |
| email | String? | Contact email |
| website | String? | Website URL |
| primaryColor | String? | Brand primary hex color |
| secondaryColor | String? | Brand secondary hex color |
| accentColor | String? | Brand accent hex color |
| logoUrl | String? | Main logo URL |
| logoDarkUrl | String? | Dark mode logo URL |
| logoMonoUrl | String? | Monochrome logo URL |
| documentFooter | String? | Default footer for generated documents |
| socialInstagram | String? | Instagram handle |
| socialFacebook | String? | Facebook URL |
| socialWhatsapp | String? | WhatsApp number |

---

## Service: lib/tenant/branding.ts

| Function | Behavior |
|----------|----------|
| `getOrganizationBranding(orgId)` | Never returns null. Falls back to defaults. |
| `getOrganizationBrandingBySlug(orgSlug)` | Resolves slug to ID, then delegates. Never null. |
| `upsertOrganizationBranding(orgId, input)` | Creates or updates branding. |

Fallback defaults:
- commercialName/legalName: org name from Organization table
- country: "Colombia"
- primaryColor/accentColor: "#004AAD" (Agentik blue)
- secondaryColor: "#1e1e2e"
- documentFooter: "Documento generado por Agentik para {orgName}."

---

## Castillitos Default

Seeded in `prisma/seed.ts`:
- commercialName: Castillitos
- country: Colombia
- primaryColor: #004AAD
- No NIT invented (empty until real data available)
- No logo URL (null until uploaded)

---

## Configuration UI

Route: `/[orgSlug]/configuracion/branding`

Sections:
- Identidad (nombre comercial, razon social, NIT)
- Contacto (direccion, ciudad, pais, telefono, email, web)
- Visual (colores hex, URLs de logo)
- Documento (pie de documento)
- Redes sociales (Instagram, Facebook, WhatsApp)

Features:
- Live preview strip with logo, name, and color swatches
- Hex color validation (client + server)
- Inline feedback on save
- Submit lock during save

---

## Navigation

New "Configuracion" domain added to module-nav-config.ts:
- Visible to all roles (transversal, not inside Agentik)
- "Identidad corporativa" links to /configuracion/branding

---

## API

`POST /api/orgs/[orgSlug]/branding`

| Action | Description |
|--------|-------------|
| `get` | Returns branding (always non-null) |
| `upsert` | Creates or updates branding with hex color validation |

---

## Future Usage

This branding foundation will be consumed by:
- PDF generation (pedidos, facturas, cotizaciones)
- Marketing Studio catalogs
- WhatsApp message templates
- Email communications
- Public-facing documents

All consumers will call `getOrganizationBranding(orgId)` instead of hardcoding tenant data.

---

## Limitations

- Logo upload requires existing storage infrastructure (R2/S3). Current: URL-based.
- No font customization yet.
- No dark/light mode automatic switching for logos.

---

## Files Modified/Created

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Added `OrganizationBranding` model + relation |
| `prisma/migrations/20260715000000_organization_branding/` | Migration SQL |
| `prisma/seed.ts` | Castillitos branding seed |
| `lib/tenant/branding.ts` | Service layer (get, getBySlug, upsert, fallback) |
| `app/api/orgs/[orgSlug]/branding/route.ts` | API route (get, upsert) |
| `app/(app)/[orgSlug]/configuracion/branding/page.tsx` | Server page |
| `app/(app)/[orgSlug]/configuracion/branding/branding-client.tsx` | Client editor |
| `components/shell/module-nav-config.ts` | Added "Configuracion" domain |
| `scripts/validate-tenant-branding.ts` | Validation script |
