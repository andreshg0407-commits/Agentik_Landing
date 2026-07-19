# Marketing Studio Design System

**Lock:** MARKETING-STUDIO-DESIGN-SYSTEM-LOCK-01
**Code source:** `lib/marketing-studio/ms-design-system.ts`
**Reference implementation:** `app/(app)/[orgSlug]/agentik/marketing-studio/foto-estudio/new/wizard.tsx`

---

## Principio

Marketing Studio es un producto creativo dentro de un OS enterprise.
Debe sentirse **más creativo que Agentik Core** pero **consistente con la plataforma**.

Referencia estética: Canva, Adobe Express, Shopify Magic.
No: Bootstrap, admin templates, ERP dashboards.

---

## Sistema de color semántico

| Dominio | Color | Hex | Usos |
|---|---|---|---|
| Producto | Azul | `#004AAD` | Foto producto, catálogo, ecommerce, Shopify |
| Redes | Morado | `#7c3aed` | Feed, historias, reels, anuncios sociales |
| Video | Naranja | `#c2410c` | Video corto, reels, TikTok, shorts |
| Diseño | Verde | `#166534` | Plantillas, banners, catálogos, carruseles |

**Regla:** Estos cuatro colores son fijos. Un tipo de contenido nuevo debe mapearse a uno de ellos. No crear un quinto color de dominio.

Cada color tiene un ramp completo en `MS_PALETTE`:
- `primary` — color puro para bordes, iconos, estados activos
- `iconBg` — fondo de la cápsula del ícono (5–8% tint)
- `cardBg` — fondo de la card (2–5% tint, casi blanco)
- `heroGradient` — gradiente para zonas de ilustración
- `selectedBg` — fondo cuando la card está seleccionada

---

## Intent Cards

Patrón para toda selección de tipo, acción, formato, canal o plantilla.

### Estructura

```
┌───────────────────────────────────────┐
│                            [BADGE]    │  ← absolute top-right
│  ┌──────────┐                         │
│  │  [icon]  │                         │  ← App Icon Capsule 56×56
│  └──────────┘                         │
│  Título de la opción                  │  ← 14px black, ellipsis
│  Descripción breve de un solo renglón │  ← 11px inkMid, ellipsis
│  [tag] [tag] [tag]                ●  │  ← 9px pills + radio 16px
└───────────────────────────────────────┘
```

### Dimensiones fijas

| Propiedad | Valor |
|---|---|
| Altura | 166px — no aumentar |
| Border radius | 12px (R.xl) |
| Padding | 12px 12px 10px |
| Grid | 2 columnas desktop, 1 columna mobile |
| Gap entre cards | 12px (S[3]) |

### Estados

| Estado | Borde | Fondo | Sombra |
|---|---|---|---|
| Normal | 1px `#e8eaed` | `meta.cardBg` | capas sutiles + inset highlight |
| Hover | 1px `primaryColor44` | `meta.cardBg` | elevación 8px + ambient color |
| Selected | 1.5px `primaryColorbb` | `meta.selectedBg` | glow ring 3px + elevación |

### Guardrails de layout obligatorios

```tsx
// En el <button> de cada card:
overflow:    "hidden",       // nunca "visible"
boxSizing:   "border-box",   // siempre
minWidth:    0,              // siempre (previene overflow en CSS Grid)
```

---

## App Icon Capsule

Cada card tiene un ícono dentro de una cápsula estilo "app icon".
No usar íconos flotantes sin cápsula.

```
Tamaño cápsula:   56 × 56 px
Border radius:    16px
Fondo:            gradient blanco → iconBg
Icono tamaño:     28px
Icono strokeWidth: 1.6
```

Sombra de la cápsula (generada por `MS_SHADOWS.appIcon(primaryColor)`):
```
0 4px 16px color22
0 1px 4px rgba(0,0,0,0.08)
inset 0 1px 1px rgba(255,255,255,1)
inset 0 -1px 2px rgba(0,0,0,0.04)
```

---

## Stepper Premium

Componente para flujos multi-paso. Copiar de `wizard.tsx → Stepper`.
No construir un stepper nuevo.

```
Paso activo:     44×44 badge, gradiente azul→morado, número, glow ring
Paso completo:   34×34 badge, #004AAD sólido, ✓
Paso inactivo:   34×34 badge, #f0f2f6, ícono de dominio 16px
Conector:        1.5px dashed #dde1ea → #004AAD55 cuando completo
Card wrapper:    fondo blanco, borde C.line, R.xl, E.sm
```

---

## CTA Bar

Barra de acción estándar al final de cada paso de selección.

```
Izquierda: ícono 💡 + texto de ayuda (xs, C.inkMid)
Derecha:   botón "Continuar →" con gradiente #004AAD → #1e40af
Botón deshabilitado: C.inkGhost, cursor not-allowed
```

---

## Submódulos existentes

| Submódulo | Path | Estado visual |
|---|---|---|
| Foto Estudio wizard | `foto-estudio/new/wizard.tsx` | ✅ Referencia canónica |
| Biblioteca | `biblioteca/page.tsx` | ⏳ Pendiente adopción DS |
| Redes | `redes/page.tsx` | ⏳ Pendiente adopción DS |
| Shopify | `shopify/page.tsx` | ⏳ Pendiente adopción DS |
| Campañas | `campaigns/page.tsx` | ⏳ Pendiente adopción DS |
| Catálogos | `catalogos/page.tsx` | ⏳ Pendiente adopción DS |
| Analytics | `analytics/page.tsx` | ⏳ Pendiente adopción DS |
| Distribución | `distribution/page.tsx` | ⏳ Pendiente adopción DS |
| Publicaciones | `publishing/page.tsx` | ⏳ Pendiente adopción DS |

---

## Reglas de uso

```typescript
// ✅ Correcto
import { MS_PALETTE, MS_SHADOWS, MS_APP_ICON, MS_CARD } from "@/lib/marketing-studio/ms-design-system";

const color  = MS_PALETTE.product.primary;
const shadow = MS_SHADOWS.cardHover(color);

// ❌ Incorrecto — duplicar colores inline
const color  = "#004AAD";        // nunca
const shadow = "0 8px 28px ..."; // nunca sin MS_SHADOWS
```

---

## Lo que NO hacer

- No crear variantes nuevas de Intent Cards — reutilizar el patrón
- No crear nuevos steppers — copiar el componente de referencia
- No introducir colores fuera del ramp `MS_PALETTE`
- No usar Tailwind color classes en componentes MS
- No usar `overflow: visible` en cards sin `boxSizing: border-box` y `minWidth: 0`
- No escalar la altura de las cards más allá de 166px
