# ORDER-PDF-BRANDING-01 -- Sprint Report

**Date:** 2026-07-04
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)

---

## Problem

The order PDF used `orgDisplayName` (a plain string) and hardcoded `#004AAD` for all
brand colors. No logo, no legal info, no tenant-specific footer. Every organization
produced the same generic document.

---

## Solution

Made the PDF generator **tenant-aware** by loading `OrganizationBrandingData` from
Configuracion > Identidad corporativa and threading it through the render pipeline.

### FASE 1 — Branding load

`order-pdf-service.ts` now calls `getOrganizationBranding(orgId)` and passes the
result to the renderer. The branding service never returns null — it falls back to
Agentik defaults automatically.

### FASE 2 — Header corporativo

```
[LOGO]  Nombre comercial          PEDIDO COMERCIAL
        Razon social                    #N
        NIT: xxx.xxx.xxx-x              4 julio 2026
        Ciudad                          SAG: xxx
        Tel: xxx                        [BORRADOR]
        www.example.com
```

- Logo rendered from `branding.logoUrl` (omitted if empty)
- Brand divider line using `branding.primaryColor`
- All header text uses brand primary color

### FASE 3 — Cliente

2-column grid layout:

| Nombre | NIT |
| Vendedor | Canal |
| Ciudad (if available) | |

All fields show `"\u2014"` (em dash) when empty.

### FASE 4 — Tabla profesional

Columns: Referencia | Descripcion | Color | Talla | Cant. | P. Unit. | Total

- Table header border uses brand primary color
- Currency formatted via `Intl.NumberFormat("es-CO")`
- Summary strip below table: Referencias / Variantes / Unidades

### FASE 5 — Resumen

Shows subtotal with brand-colored total line.

Future-ready rows (shown as `$0` when not applicable):
- Descuento
- IVA
- Total final

When discount IS active, shows discount row + green total final.

### FASE 6 — Footer corporativo

```
[branding.documentFooter]
Generado por Agentik · 4 julio 2026 14:30    Pedido #N
```

Footer uses brand primary color for top border.

### FASE 7 — Fallbacks

If no branding exists in DB:
- `commercialName` falls back to `orgDisplayName`
- `primaryColor` falls back to `#004AAD`
- `documentFooter` falls back to "Documento generado por Agentik para {orgName}."
- Logo section omitted entirely
- PDF generation never breaks

### FASE 8 — Validation

Castillitos branding record exists in DB with:
- Logo URL (configured via Identidad corporativa)
- Corporate colors
- Legal name, NIT, address, phone, website
- Custom document footer

PDF for any Castillitos order will automatically use these values.

---

## Files Modified

| File | Change |
|------|--------|
| `lib/comercial/pedidos/order-pdf-service.ts` | Import `getOrganizationBranding`; load branding; pass to renderer props |
| `lib/comercial/pedidos/order-pdf-renderer.tsx` | Full rewrite: `branding` prop; `buildStyles(primary)` factory; logo + identity header; 2-col client grid; brand-colored dividers/borders; summary strip; future-ready totals (descuento/IVA/$0); corporate footer with `documentFooter`; `money()` formatter; all colors from branding |

---

## No hardcodes

Zero references to "Castillitos" in the PDF code.
All tenant identity comes from `OrganizationBrandingData`.
Any tenant with branding configured gets their own branded PDF automatically.
