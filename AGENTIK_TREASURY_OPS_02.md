# AGENTIK-TREASURY-OPS-02
## Tesorería Operativa — Coherencia Operacional e Interactividad Real

**Sprint:** AGENTIK-TREASURY-OPS-02
**File scope:** `app/(app)/[orgSlug]/finanzas/tesoreria/page.tsx`
**New component:** `components/workspace/collapsible-section.tsx`
**Backend constraint:** NO Prisma, NO APIs, NO engine, NO SAG changes

---

## Problema diagnosticado

AGENTIK-TREASURY-RUNTIME-02 entregó la arquitectura correcta y la transformación visual completa.
Los problemas que quedaban pendientes eran de **coherencia operacional** — la página se veía como un runtime financiero, pero se comportaba como un prototipo estático:

1. **Fechas incoherentes** — fechas hardcodeadas que no coincidían con la fecha de renderizado real
2. **Falsa affordance** — botones que no ejecutaban ninguna acción navegaban ni expandían nada
3. **Sin colapso** — todas las secciones siempre visibles, sin control del operador
4. **Orden narrativo incorrecto** — Motor de Decisiones aparecía antes que el Flujo del Día
5. **Señales sin destino** — las CTAs del Motor de Decisiones no navegaban a rutas reales
6. **Proyección sin cobertura** — los periodos de forecast mostraban números pero no comunicaban riesgo de liquidez

---

## TASK 01 — Fechas coherentes con el render runtime

### Problema

`OBLIGATIONS` tenía fechas hardcodeadas como `"VIE 12/May"` siendo que esa fecha podía ser un martes o cualquier otro día dependiendo de cuándo se accediera la página.

### Solución

Helpers de fecha computadas server-side en el `async function Page()`:

```typescript
const _now   = new Date();
const _D     = ["DOM","LUN","MAR","MIÉ","JUE","VIE","SÁB"];
const _M     = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function _addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

function _nextDow(dow: number, minDays = 1): Date {
  let d = _addDays(_now, minDays);
  while (d.getDay() !== dow) d = _addDays(d, 1);
  return d;
}

function _fmt(d: Date): string {
  return `${_D[d.getDay()]} ${d.getDate()}/${_M[d.getMonth()]}`;
}

const DUE_FRIDAY    = _fmt(_nextDow(5, 2));   // próximo viernes ≥ 2 días
const DUE_MONDAY    = _fmt(_nextDow(1, 4));   // próximo lunes ≥ 4 días
const DUE_WEDNESDAY = _fmt(_nextDow(3, 6));   // próximo miércoles ≥ 6 días
```

`OBLIGATIONS` usa `DUE_FRIDAY`, `DUE_MONDAY`, `DUE_WEDNESDAY` en lugar de literales.

Las fechas en `AI_SIGNALS` (horizons) también se computan relativamente: `"9 días"`, `"Esta semana"`, `"HOY"` son etiquetas semánticas que no dependen de un día calendario específico.

### Principio

Las fechas en un workspace financiero NUNCA deben ser literales estáticos. Se computan al renderizar — siempre coherentes con la realidad del operador.

---

## TASK 02 — Eliminar falsa affordance

### Problema

Botones y elementos con apariencia interactiva que no ejecutaban ninguna acción. Un operador entrena expectativas de interacción desde el primer día — si algo parece clickeable y no hace nada, destruye la confianza en el sistema.

### Solución: `PassiveAction`

Sub-componente definido en la misma página:

```tsx
function PassiveAction({ label }: { label: string }) {
  return (
    <span style={{
      fontFamily:  T.mono,
      fontSize:    T.sz.sm,
      color:       C.inkGhost,
      padding:     `${S[2]}px ${S[3]}px`,
      display:     "block",
      cursor:      "default",
      userSelect:  "none",
    }}>
      {label}
    </span>
  );
}
```

**`PassiveAction`** comunica "esta operación existe pero no está disponible en esta vista" sin mentir al operador. Color `C.inkGhost` (el más atenuado del sistema) + `cursor: "default"` + `userSelect: "none"` = no interactivo, visualmente honesto.

### Inventario de conversiones

| Elemento | Antes | Después |
|----------|-------|---------|
| "Registrar pago" (Operativo) | `<button>` sin onClick | `<PassiveAction>` |
| "Programar transferencia" (Operativo) | `<button>` sin onClick | `<PassiveAction>` |
| "Actualizar proyección" (Estratégico) | `<button>` sin onClick | `<PassiveAction>` |
| "Revisar posición consolidada" (Estratégico) | `<button>` sin onClick | `<PassiveAction>` |

---

## TASK 03 — Secciones colapsables

### Nuevo componente: `CollapsibleSection`

**Archivo:** `components/workspace/collapsible-section.tsx`

```tsx
"use client";

import { useState } from "react";
import { C, T, S, R } from "@/lib/ui/tokens";

export function CollapsibleSection({
  title, meta, accent, defaultOpen = true, children,
}: {
  title:        string;
  meta?:        string;
  accent?:      string;
  defaultOpen?: boolean;
  children:     React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // ...
}
```

### Patrón de arquitectura

**Server Component** renderiza datos → pasa como `children: React.ReactNode` → **Client Component** controla estado expand/collapse.

Este patrón es el correcto en Next.js App Router: el Client Component solo posee estado de interacción, nunca toca datos. Los datos son Server Component output pasado como slot.

### Props

| Prop | Tipo | Default | Uso |
|------|------|---------|-----|
| `title` | `string` | requerido | Label uppercase del header |
| `meta` | `string?` | — | Segunda línea del header (contexto operacional) |
| `accent` | `string?` | — | Color de dot de acento (CSS color string) |
| `defaultOpen` | `boolean` | `true` | Estado inicial |
| `children` | `React.ReactNode` | requerido | Contenido Server Component |

### Animación

```css
maxHeight: open ? "9999px" : "0px"
transition: open ? "max-height 0.35s ease" : "max-height 0.2s ease"
```

350ms al abrir, 200ms al cerrar — el colapso es más rápido que la apertura, lo que se percibe más natural.

### Secciones que usan `CollapsibleSection`

| Sección | `title` | `accent` | `defaultOpen` |
|---------|---------|----------|---------------|
| Flujo del Día | `"FLUJO DEL DÍA"` | `C.blue` | `true` |
| Estado Bancario Operativo | `"ESTADO BANCARIO OPERATIVO"` | `C.inkMid` | `true` |
| Obligaciones Pendientes | `"OBLIGACIONES PENDIENTES"` | `C.amber` | `true` |

---

## TASK 04 — Reorden de secciones: narrativa operacional correcta

### Problema

Motor de Decisiones aparecía en posición 4 (después de Posición de Caja), antes del Flujo del Día.

### Por qué importa el orden

El operador financiero necesita leer su contexto antes de recibir interpretaciones del sistema de IA:

```
❌ Orden anterior:
  Posición de Caja → Motor de Decisiones → Flujo del Día → ...

  El operador recibe diagnósticos del sistema antes de ver qué pasó hoy.

✅ Orden correcto:
  Posición de Caja → Flujo del Día → Motor de Decisiones → ...

  El operador ve la posición, ve qué movimientos ocurrieron hoy,
  LUEGO recibe el diagnóstico del sistema sobre esa realidad.
```

### Orden final de secciones

```
1. OperationalWorkspaceHeader
2. Franja de Estado Operativo
3. Posición de Caja
4. Flujo del Día            ← CollapsibleSection
5. Motor de Decisiones
6. Estado Bancario Operativo ← CollapsibleSection
7. Obligaciones Pendientes   ← CollapsibleSection
8. Proyección de Liquidez
9. Centro de Decisiones
```

---

## TASK 05 — Motor de Decisiones: CTAs con rutas reales

### Antes

Las CTAs del Motor de Decisiones tenían `actionHref: "#"` o rutas placeholder.

### Después

Cada señal navega al workspace correcto dentro del shell:

| Señal | Severidad | `actionHref` | Acción |
|-------|-----------|--------------|--------|
| Cartera vencida + 30d | `critical` | `sales` | Priorizar cobros |
| CxC vencimiento 9 días | `warning` | `sales` | Revisar cartera |
| Pagos por conciliar | `warning` | `reconciliation` | Revisar pagos |
| Conector bancario inactivo | `info` | `integrations/connectors` | Activar sincronización |

Rutas construidas como `/${orgSlug}/${actionHref}` — relativas al tenant activo.

---

## TASK 06 — Proyección de Liquidez: barra de cobertura

### Diseño

Cada periodo de proyección incluye ahora una barra de cobertura que comunica qué porcentaje del periodo cubre la liquidez proyectada:

```typescript
FORECAST_PERIODS: Array<{
  // campos existentes...
  runwayDays: number;   // días de cobertura de liquidez
  periodDays: number;   // días totales del periodo
}>
```

### Cálculo

```typescript
const pct      = Math.min(100, Math.round((fc.runwayDays / fc.periodDays) * 100));
const barColor = pct >= 90 ? C.green : pct >= 55 ? C.amber : C.red;
```

### Umbrales de color

| % cobertura | Color | Significado |
|-------------|-------|-------------|
| ≥ 90% | `C.green` | Liquidez holgada |
| ≥ 55% | `C.amber` | Presión moderada |
| < 55% | `C.red` | Riesgo de liquidez |

### Rendering

```tsx
<div style={{ height: 4, background: C.surfaceAlt, borderRadius: R.pill, overflow: "hidden" }}>
  <div style={{
    width: `${pct}%`, height: "100%",
    background: barColor, borderRadius: R.pill,
    transition: "width 0.5s ease",
  }} />
</div>
```

Track: `C.surfaceAlt` (4px height) — fill: color por umbral — transición suave de 500ms.

---

## TASK 07/08 — Affordance honesta en Centro de Decisiones

### Inventario final de acciones por tier

#### Crítico (HOY)

| Acción | Tipo | Destino |
|--------|------|---------|
| Revisar 3 movimientos | `<Link>` | `reconciliation` |
| Abrir conciliación IA | `<Link>` | `reconciliation` |
| Activar sincronización | `<Link>` | `integrations/connectors` |

#### Operativo (Esta semana)

| Acción | Tipo | Destino |
|--------|------|---------|
| Revisar cobros atrasados | `<Link>` | `sales` |
| Registrar pago CxP | `PassiveAction` | — |
| Programar transferencia | `PassiveAction` | — |

#### Estratégico (Proyección)

| Acción | Tipo | Destino |
|--------|------|---------|
| Actualizar proyección | `PassiveAction` | — |
| Ver flujo consolidado | `<Link>` | `finanzas/planeacion` |
| Revisar posición consolidada | `PassiveAction` | — |

---

## Fix post-sprint: `C.canvas` → `C.surfaceAlt`

Token `C.canvas` no existe en `lib/ui/tokens.ts`. Fue reemplazado por `C.surfaceAlt` (el token correcto para tracks de barras de progreso e insets) en la línea de la barra de cobertura.

---

## Qué NO se cambió

- Prisma schema — cero cambios
- SAG adapters — cero cambios
- Rutas API — cero cambios
- Estructura de navegación — intacta
- Otros módulos Finanzas — intactos
- Tokens de diseño — sin adiciones, solo uso correcto de los existentes

---

## TypeScript compliance

- Cero nuevos errores introducidos.
- Total del proyecto: 160 errores (baseline sin cambios).
- Fix aplicado: `C.canvas` → `C.surfaceAlt` (token inexistente corregido).
