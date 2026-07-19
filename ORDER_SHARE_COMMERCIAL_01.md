# ORDER-SHARE-COMMERCIAL-01 -- Sprint Report

**Date:** 2026-07-04
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)

---

## Problem

WhatsApp and Correo shares were technical summaries — 3 lines of raw data with no
branding, no client greeting, no detail, no preview. Users couldn't review or
customize before sending.

---

## Architecture

```
page.tsx (server)
  └─ getOrganizationBranding(orgId)
       └─ branding prop → PedidosClient
            └─ OrderDetailDrawer
                 └─ buildOrderSharePayload(order, branding)
                      └─ SharePreviewModal (tabs: WhatsApp / Correo)
                           └─ executeWhatsApp() | executeEmail()
```

---

## FASE 1 — Share model unificado

New file: `lib/comercial/pedidos/order-share.ts`

```typescript
buildOrderSharePayload(order, branding) → OrderSharePayload
```

Returns:
- `subject` — email subject line
- `emailBody` — full email text
- `whatsappText` — full WhatsApp message
- `summary.recipientName` / `sellerName` / `total` / `references` / `variants` / `units` / `fecha` / `orderNumber`

Both channels use the same source data — no divergence.

---

## FASE 2 — Mensaje comercial WhatsApp

```
Hola {cliente},

Compartimos el detalle de su pedido.

Pedido #{numero}
Fecha: {fecha}
Vendedor: {vendedor}

Resumen:
• {N} referencias
• {N} variantes
• {N} unidades

Valor total: ${total}

Detalle:
  • REF / color / talla / cantidad
  • REF / color / talla / cantidad
  ... y N lineas adicionales

{branding.commercialName}
Tel: {branding.phone}
{branding.website}

Generado desde Agentik.
```

Line detail limited to 10 items. If more: `"... y N lineas adicionales"`.

---

## FASE 3 — Correo profesional

**Asunto:** `Pedido #{numero} - {cliente} - {branding.commercialName}`

**Cuerpo:**
```
{branding.commercialName}
{branding.legalName}

Estimado/a {cliente},

Adjuntamos el detalle de su pedido.

--- Resumen ---
Cliente: {nombre}
Fecha: {fecha}
Vendedor: {vendedor}
Unidades: {N}
Total: ${total}

--- Detalle ---
Ref | Color | Talla | Cant. | Valor
...

---
{branding.documentFooter}
Tel: {branding.phone}
Email: {branding.email}
{branding.website}
```

---

## FASE 4 — Adjunto PDF

Preview modal shows note: "El PDF se adjuntara automaticamente si esta disponible."
The mailto: link opens with subject + body. PDF attachment requires server-side
email send (future sprint). Infrastructure is ready.

---

## FASE 5 — Modal de previsualizacion

`SharePreviewModal` component with:

- **Tabs:** WhatsApp | Correo
- **Summary strip:** Destinatario, Total, Unidades
- **WhatsApp preview:** green background, pre-wrapped text
- **Correo preview:** subject line + body in alt-surface card
- **Actions:** Cancelar (ghost) | Enviar (green for WA, blue for Correo)

Clicking outside the modal also closes it (backdrop click).

---

## FASE 6 — Cancelacion segura

Cancel closes the share modal ONLY. The order detail drawer stays open.
No navigation, no context loss. Fixed by:
- Modal is a child of the drawer, not a replacement
- `onClose` sets `shareOpen = false` — drawer state untouched

---

## FASE 7 — Datos de contacto

Customer name pre-filled from `order.header.customerName`.
Seller name from `order.header.sellerName`.
Summary strip shows recipient + total before sending.

---

## FASE 8 — Identidad tenant

Branding loaded server-side via `getOrganizationBranding(orgId)` in `page.tsx`.
Passed as serializable prop (only needed fields, no `isPersisted` or `id`).

Fields used:
- `commercialName` — greeting, header, footer
- `legalName` — email header (if different from commercial)
- `phone` — WhatsApp + email footer
- `email` — email footer
- `website` — WhatsApp + email footer
- `documentFooter` — email footer

Fallback: if no branding prop, uses "Agentik" defaults.
Zero hardcodes of "Castillitos".

---

## Files Modified

| File | Change |
|------|--------|
| `lib/comercial/pedidos/order-share.ts` | NEW — `buildOrderSharePayload()`, `OrderShareBranding`, `OrderSharePayload` |
| `app/(app)/[orgSlug]/comercial/pedidos/page.tsx` | Load `getOrganizationBranding(orgId)`, pass branding prop to PedidosClient |
| `app/(app)/[orgSlug]/comercial/pedidos/pedidos-client.tsx` | Import order-share; `branding` in Props; `SharePreviewModal` component; share preview state in drawer; replaced `shareWhatsApp()`/`shareEmail()` with preview flow |

---

## Example: Pedido #1

**WhatsApp preview:**
```
Hola Juan Perez,

Compartimos el detalle de su pedido.

Pedido #1
Fecha: 4 julio 2026
Vendedor: Maria Lopez

Resumen:
• 3 referencias
• 8 variantes
• 24 unidades

Valor total: $2,400,000

Detalle:
  • REF-001 / Negro / 38 / 4 uds
  • REF-001 / Azul / 40 / 6 uds
  ...

Castillitos (from branding)
Tel: 310 123 4567
www.castillitos.com

Generado desde Agentik.
```

**Correo asunto:** `Pedido #1 - Juan Perez - Castillitos`
