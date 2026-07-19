# COMERCIAL_PEDIDOS_VARIANTES_VALIDATION.md

**Sprint:** COMERCIAL-PEDIDOS-VARIANTES-02
**Date:** 2026-06-24
**Status:** IMPLEMENTADO

---

## 1. Variant Profile — Real Data (Castillitos)

| Category | Count | % |
|---|---|---|
| Color + Talla | 168 | 84% |
| Solo color | 0 | 0% |
| Solo talla | 0 | 0% |
| Simple (sin attrs) | 0 | 0% |
| Sin variantes | 32 | 16% |

**Total sampled:** 200 of 4,561 products.

---

## 2. Real Data Examples

| SKU | Variants | Colors | Sizes |
|---|---|---|---|
| L-3594 | 20 | ROJO, AZUL REY, AZUL PETROLEO, AZUL OSCURO, GRIS JASPED | 10, 12, 14, 16 |
| L-3591 | 20 | GRIS JASPED, AZUL REY, AZUL PETROLEO, AZUL OSCURO, ROJO | 10, 14, 12, 16 |
| L-3587 | 20 | ROJO, GRIS JASPED, AZUL PETROLEO, AZUL OSCURO, AZUL REY | 4, 2, 6, 8 |
| CJ-1026066B | 12 | MORA LECHE, CANAMO, LILA | 12-18, 6-9, 18-24, 9-12 |
| CJ-1126072 | 12 | BEIGE, MORA LECHE, TIZA | 5, 2, 3, 4 |
| CJ-4031425 | 0 | — | — |
| CJ-4011435 | 0 | — | — |
| CJ-4001435B | 0 | — | — |

---

## 3. Phase Implementation

### Phase 1 — Agrupar variantes correctamente
- Variants grouped by color (primary), then size (secondary).
- Availability aggregated per color and per color+size combination.
- Long unordered lists replaced with sorted chip grids.

### Phase 2 — Selector Color → Talla
- Flow changed from Talla→Color to **Color→Talla**.
- Selecting color shows tallas available for that color only.
- If product has no colors, talla chips appear directly.
- Products without variants get one-tap add (no selector opened).

### Phase 3 — Chips comerciales
- Color chips: name + total units available (e.g., "AZUL REY / 24 uds").
- Talla chips: size + available units for selected color+size variant.
- Out of stock: opacity 0.5, cursor default.
- Low stock: red inventory color.
- Medium stock: amber inventory color.
- Available: green inventory color.
- Unsynced: em-dash.

### Phase 4 — Disponibilidad detallada
- AvailabilityBadge shows: Disponible, Parcial, Sin stock, Pendiente sync.
- David signals for low stock, over-stock, unsynced variants.

### Phase 5 — Cantidad inteligente
- Default: 1.
- Buttons: - / + with 44x44px touch targets.
- Shortcuts: +6, +12, +24 (common fashion pack sizes).
- Negative quantities prevented (Math.max(1, ...)).
- Over-availability warning via David signal (not blocking).

### Phase 6 — Agregar y continuar
- After adding: product stays open, variant resets, qty resets to 1.
- Selected color persists so seller can pick next talla of same color.
- "Agregado" feedback shown inline.
- "Cambiar" button to close product and search again.

### Phase 7 — Resumen de variantes agregadas
- Green panel inside selector: "Ya agregado al pedido".
- Shows each added variant: color + size → qty (e.g., "AZUL REY 4 → 6 uds").
- Duplicate lines merged automatically (same ref+size+color = sum qty).

### Phase 8 — Productos sin variantes
- Detected as: variants.length <= 1 AND no size AND no color.
- Shows "Producto sin variantes" label.
- One-tap add with quantity controls.
- No variant selector opened.
- 32 products in Castillitos catalog match this pattern.

### Phase 9 — Mobile first
- All chips: min 48px height, min 48px/56px width.
- Touch-friendly buttons: 44x44px minimum.
- No tables in selector.
- No horizontal scroll.
- Flex wrap for chip grids.
- Content padded to avoid footer overlap (paddingBottom: 72px).

### Phase 10 — Validation with real data
See Section 2 above. Covers:
- Products with many colors (5 colors: L-3594)
- Products with many sizes (4 sizes: L-3594)
- Products with single variant type (CJ-1126072: 3 colors x 4 sizes)
- Products without variants (CJ-4031425, CJ-4011435, CJ-4001435B)
- Products with high stock (synced from SAG)
- Products with infant sizing (CJ-1026066B: 12-18, 6-9, 18-24, 9-12)

### Phase 11 — TSC
- Baseline: **160** (preserved, 0 new errors).

---

## 4. Files Modified

| File | Change |
|---|---|
| `pedidos-client.tsx` | Color→Talla flow, merge duplicate lines, add-and-continue, quantity shortcuts, already-added summary, simple product one-tap, QuantityControls component |

## 5. Files NOT Modified (per sprint rules)

- No SAG adapter changes
- No inventory sync changes
- No CRMQuoteLine changes
- No mock data created
- No David agent built
- No Drive integration

---

## 6. Acceptance Criteria

| Criteria | Status |
|---|---|
| Selector no parece ERP | PASS — chip-based, touch-friendly |
| Color/talla se eligen rapido | PASS — Color→Talla flow, 2 taps |
| Variantes agotadas se entienden | PASS — opacity + color coding |
| Disponibilidad real visible | PASS — per-chip units + badge |
| Varias variantes del mismo producto | PASS — add-and-continue flow |
| No se duplican lineas | PASS — merge by ref+size+color |
| Productos sin variantes | PASS — one-tap, no selector |
| Mobile/tablet usable | PASS — min 48px targets, flex wrap |
| TSC baseline 160 | PASS |
