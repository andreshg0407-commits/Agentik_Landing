# AGENTIK-TREASURY-REFINEMENT-05
## Tesorería Operativa — Refinamiento Final V1 y Cierre Enterprise

**Sprint:** AGENTIK-TREASURY-REFINEMENT-05
**Archivos modificados:**
- `app/(app)/[orgSlug]/finanzas/tesoreria/tesoreria-client.tsx`
- `components/workspace/operational-side-drawer.tsx`
- `components/workspace/collapsible-section.tsx`
**Backend constraint:** NO Prisma, NO APIs, NO SAG changes, NO rail right changes

---

## Objetivo

Cerrar Tesorería Operativa V1 con refinamiento enterprise final.
La arquitectura ya era correcta — este sprint es de profundidad visual, coherencia operacional y polish.

---

## TASK 01-02 — Drawer premium: bloques internos

### `DrawerMetricGrid`
Cada chip KPI ahora tiene `borderLeft: 3px solid ${item.accent ?? C.lineSubtle}`.
Los chips con valor de acento (verde = positivo, ámbar = atención, rojo = crítico) codifican la severidad directamente en el borde izquierdo — misma gramática visual que filas de obligaciones y señales.

```tsx
// Antes
background: C.surface, border: `1px solid ${C.lineSubtle}`, borderRadius: R.md

// Después
background: C.surface, border: `1px solid ${C.lineSubtle}`,
borderLeft: `3px solid ${item.accent ?? C.lineSubtle}`,  // ← NUEVO
borderRadius: R.md
```

### `DrawerRelatedItems`
Sin cambio estructural — la separación entre filas ya era correcta.
El contraste `C.white` background en tags vs `C.surface` contenedor es suficiente.

---

## TASK 03 — Timeline vertical real

### `DrawerTimeline`
Dots de 8px → 10px con ring shadow en lugar de borde:

```tsx
// Antes
width: 8, height: 8, border: `1px solid ${C.white}`

// Después
width: 10, height: 10,
boxShadow: `0 0 0 2px ${C.white}`  // anillo blanco que separa el dot del conector
```

El `boxShadow: 0 0 0 2px` crea un halo blanco entre el dot y la línea vertical — efecto de "estado activo" enterprise sin gradientes ni glow.

Colores del dot (sin cambios — ya eran correctos):
- `C.green` → estado normal/ok
- `C.amber` → warning
- `C.red` → critical
- `C.blue` → info (default)
- `C.inkGhost` → dim/inactivo

---

## TASK 04 — Jerarquía real de CTA en drawer

### Antes
Primeros CTAs en cash + forecast usaban `ag-action-secondary` (borde, sin relleno).

### Después
Primera acción de cada drawer usa `ag-action-primary` (azul sólido).
Segunda acción usa `ag-action-secondary` (borde).
Tercera acción (si existe) usa `ag-action-ghost` o `PassiveAction`.

### Drawers corregidos

| Drawer | CTA primario | CTA secundario |
|--------|-------------|----------------|
| `cash.disponible` | Abrir conciliación → (`primary`) | Priorizar cobros → (`secondary`) |
| `cash.hoy` | Ver flujo del día → (`primary`) | — |
| `cash.comprometido` | Priorizar cobros → (`primary`) | — |
| `forecast.*` | Priorizar cobros → (`primary`) | Actualizar proyección (`PassiveAction`) |

Drawers que ya tenían jerarquía correcta (sin cambios):
- `signal.*` → `ag-action-primary` ✓
- `bank.requires_action` → `ag-action-primary` ✓
- `bank.pending` → `ag-action-primary` ✓
- `flow_tile.sin_identificar` → `ag-action-primary` ✓
- `movement.warn` → `ag-action-primary` ✓

---

## TASK 05 — Trazabilidad enterprise

### `DrawerTraceability`
Convertido de dos spans separados (left/right) a barra de auditoría unificada:

```tsx
// Antes
<div style={{ display: "flex", justifyContent: "space-between" }}>
  <span>{source}</span>
  <span>{updated}</span>
</div>

// Después
<div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
  <span style={{ width: 5, height: 5, borderRadius: R.pill, background: C.green }} />
  <span>{source} · {updated}</span>
</div>
```

El punto verde izquierdo indica "sistema activo + datos frescos".
La concatenación `source · updated` crea la trazabilidad tipo:
`Datos SAG · 5 cuentas · Actualizado 14:52`
`Agentik IA · Motor de riesgo · Detectado 14:52`
`SAG · Conector Bancolombia · Hace 12 min`

---

## TASK 06 — Header del drawer

Refinamiento en `OperationalSideDrawer`:
- Subtitle: `C.inkFaint` → `C.inkMid` — más legible, mayor presencia
- Backdrop: `rgba(15,15,26,0.15)` → `rgba(15,15,26,0.20)` — presencia más definida sin ser agresivo

El header ya tenía:
- `borderTop: 3px solid ${accentColor}` — acento visual fuerte
- Badge de severidad + título + subtitle → jerarquía vertical correcta
- Close button con transición suave

---

## TASK 07-08 — Headers colapsables premium

### `CollapsibleSection`

Tres mejoras:

**1. Padding más generoso**
`S[3]` → `S[4]` (top/bottom) — más presencia, más "enterprise".

**2. Nueva prop `detailLabel?: string`**
Texto opcional antes de la flecha que indica qué hay dentro.

```tsx
// Nueva estructura del lado derecho
<div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
  {detailLabel && (
    <span>{detailLabel} ▸</span>  // ▸ inline (diferente del ▶ de collapse)
  )}
  <span style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
</div>
```

Los dos caracteres son distintos: `▸` = destino/detalle (acompañamiento), `▶` = expand/collapse (estado).
El `detailLabel` usa `C.inkLight` cuando está abierto, `C.inkFaint` cuando cerrado — sigue el estado de la sección.

**3. Aplicación en Tesorería**

| Sección | `detailLabel` |
|---------|--------------|
| Flujo del Día | `"Ver movimientos"` |
| Estado Bancario Operativo | `"Ver bancos"` |
| Obligaciones Pendientes | `"Ver obligaciones"` |

---

## TASK 09 — Microinteracciones honestas

Revisión completa de affordances:

| Elemento | Estado |
|----------|--------|
| Cards KPI 2×2 | `cursor: pointer` + `onClick` → drawer ✓ |
| Filas banco (distribución) | `ag-op-row` hover + `onClick` → drawer ✓ |
| Filas movimiento | `ag-op-row` hover + `onClick` → drawer ✓ |
| Tiles de flujo | `cursor: pointer` + `onClick` → drawer ✓ |
| Señales de riesgo | `cursor: pointer` + `onClick` → drawer ✓ |
| Cards de forecast | `cursor: pointer` + `onClick` → drawer ✓ |
| Cards de plan | `cursor: pointer` + `onClick` → drawer ✓ |
| Filas de obligación | `ag-op-row` hover + `onClick` → drawer ✓ |
| Botones banco (tabla) | `cursor: pointer` + `onClick` → drawer ✓ |
| `PassiveAction` | `cursor: default` + `userSelect: none` — sin affordance falsa ✓ |
| Links reales | `stopPropagation()` — navegan directamente ✓ |

---

## TASK 10 — Recomendación IA premium

### `DrawerAIRecommendation`

```tsx
// Antes: punto azul + "Agentik IA"
<span style={{ width: 6, height: 6, borderRadius: R.pill, background: C.blueDark }} />
<span>Agentik IA</span>
<div style={{ color: C.inkMid }}>{text}</div>

// Después: badge chip "IA" + "Agentik detecta" + texto en C.ink
<span style={{
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 22, height: 16, borderRadius: R.sm,
  background: C.blueDark, color: C.white,
  fontFamily: T.mono, fontSize: 8, fontWeight: 700,
}}>
  IA
</span>
<span style={{ color: C.blueDark, fontWeight: 700 }}>Agentik detecta</span>
<div style={{ color: C.ink }}>{text}</div>
```

"Agentik detecta" vs "Agentik IA": el primero es activo y operacional. El badge chip `IA` con fondo `C.blueDark` es la identidad visual del sistema de IA — reconocible, compacto, enterprise.
Texto cambia de `C.inkMid` → `C.ink` — máximo contraste en el contexto azul claro.

---

## TASK 11-12 — Movimientos y Estado Bancario

### Estado Bancario — tint contextual por estado

Filas con `requires_action` o `pending` reciben un fondo muy sutil:
```tsx
background: bank.status === "requires_action" ? "rgba(217,119,6,0.04)" :
            bank.status === "pending"          ? "rgba(220,38,38,0.04)" : undefined
```

El 4% de opacidad es apenas perceptible pero suficiente para distinguir visualmente las filas que requieren acción del resto — sin interrumpir el ritmo de la tabla.

Combinado con el `borderLeft: 3px solid BANK_ACCENT[bank.status]` que ya existía, el estado bancario ahora comunica en dos canales visuales simultáneos.

---

## TASK 13 — Auditoría visual final

### Checklist de cierre

| Criterio | Estado |
|----------|--------|
| ¿El drawer ya se siente premium? | ✅ MetricGrid con accent border + timeline con ring + IA badge |
| ¿Existe timeline real? | ✅ `DrawerTimeline` con dots 10px, ring shadow, colores por severidad |
| ¿Los CTA tienen jerarquía? | ✅ Primary → Secondary → Ghost/Passive en todos los drawers |
| ¿La trazabilidad ya parece enterprise? | ✅ Barra unificada con punto verde + concat `source · updated` |
| ¿Los headers colapsables llaman la atención? | ✅ Padding S[4], accent border, meta operacional |
| ¿"Ver detalle" aparece antes de la flecha? | ✅ `detailLabel ▸` antes de `▶` |
| ¿La flecha rota correctamente? | ✅ `transform: rotate(90deg/0deg)` con transición 0.2s |
| ¿Las microinteracciones son honestas? | ✅ `PassiveAction` para inactivos, drawer/link para todo lo demás |
| ¿La IA ya se siente integrada al sistema? | ✅ Badge `IA` + "Agentik detecta" en 8 contextos de drawer |
| ¿Tesorería ya puede congelarse como V1? | ✅ |

---

## TypeScript compliance

- Cero nuevos errores introducidos.
- Total del proyecto: **160 errores** (baseline mantenido).
- `detailLabel?: string` — prop opcional, ningún uso existente se rompe.
- `DrawerTraceability({ source, updated })` — API sin cambios, solo render distinto.
- `DrawerMetricGrid` — `item.accent` ya era `string | undefined`, `C.lineSubtle` es `string` — tipado limpio.

---

## Pendientes backend real (sin cambios)

Tesorería V1 está congelada como demo. Activación backend por sección:

| Sección | Fuente real |
|---------|-------------|
| Posición de Caja | `GET /api/orgs/[orgSlug]/tesoreria/position` |
| Motor de Decisiones | `GET /api/orgs/[orgSlug]/tesoreria/ai-signals` |
| Estado Bancario | SAG sync engine + BANK_TIMELINE from sync log |
| Obligaciones | Prisma: `ApDocument` + `PaymentRecord` |
| Flujo del Día | `CollectionRecord` aggregate query |
| Proyección | Modelo de proyección financiera |
| DrawerTraceability | Timestamp real del último sync por fuente |
