# AGENTIK-TREASURY-POLISH-03
## Tesorería Operativa — Cierre UX para Presentación + Side Drawer Operativo

**Sprint:** AGENTIK-TREASURY-POLISH-03
**Archivos modificados:**
- `app/(app)/[orgSlug]/finanzas/tesoreria/page.tsx` (reescritura → wrapper delgado)
- `app/(app)/[orgSlug]/finanzas/tesoreria/tesoreria-client.tsx` (NUEVO — componente client interactivo)
- `components/workspace/operational-side-drawer.tsx` (NUEVO — drawer reutilizable)
**Backend constraint:** NO Prisma, NO APIs, NO SAG changes

---

## Arquitectura: Server Component → Client Component split

El sprint anterior tenía toda la lógica en un Server Component async (`page.tsx`). Para habilitar estado interactivo (drawer), fue necesario separar en dos capas:

```
page.tsx (Server Component)
└─ requireOrgAccess(orgSlug)          ← auth permanece server-side
└─ <TesoreriaClient orgSlug={...} />  ← delega rendering al Client Component

tesoreria-client.tsx (Client Component)
└─ Estado: drawerCtx — qué elemento está abierto en el drawer
└─ Toda la lógica de presentación + mock data
└─ <OperationalSideDrawer> montado una sola vez, controlado por estado
```

Este patrón es consistente con `pipeline-client.tsx`, `recon-client.tsx` y otros módulos existentes.

---

## TASK 01 — Grid 2×2 en Posición de Caja

### Antes
4 cards en una sola fila: `gridTemplateColumns: "2fr 1fr 1fr 1fr"` — apretado en laptops.

### Después
Grid 2 columnas × 2 filas: `gridTemplateColumns: "1fr 1fr"`.

### Orden cognitivo (2×2)

| Fila 1 | Fila 2 |
|--------|--------|
| Caja Disponible | Disponible Hoy |
| Comprometido    | Proyección 7d  |

El operador lee: total → libre hoy → presión comprometida → proyección.

Todas las cards ahora usan `T.sz["3xl"]` para los montos (antes solo la primaria usaba 3xl). En una grilla igualada, el tamaño uniforme da más peso visual a cada número.

Todas las cards tienen `cursor: "pointer"` y `onClick` → abren el drawer con detalle contextual.

---

## TASK 02 — OperationalSideDrawer (componente reutilizable)

**Archivo:** `components/workspace/operational-side-drawer.tsx`

### Props

| Prop | Tipo | Default | Rol |
|------|------|---------|-----|
| `open` | `boolean` | requerido | Controla visibilidad |
| `onClose` | `() => void` | requerido | Callback de cierre |
| `title` | `string` | requerido | Título del panel |
| `subtitle` | `string?` | — | Contexto secundario |
| `statusLabel` | `string?` | — | Texto del badge de severidad (default: nombre del tier) |
| `severity` | `DrawerSeverity` | `"info"` | Color del badge y acento superior |
| `children` | `ReactNode` | requerido | Contenido (slot) |

### `DrawerSeverity`

```typescript
type DrawerSeverity = "info" | "watch" | "warning" | "critical"
```

Colores:
- `critical` → `C.red`
- `warning`  → `C.amber`
- `watch`    → `C.blue`
- `info`     → `C.inkFaint`

### Diseño visual

- Ancho: 420px (máximo 96vw en mobile)
- Position: `fixed`, `right: 0`, `top: 0`, `height: 100vh`
- Fondo: `C.white`, `borderLeft: 1px solid C.lineSubtle`
- Acento superior: `borderTop: 3px solid ${accentColor}` — misma gramática visual que signal cards y playbook cards
- Sombra izquierda: `-6px 0 32px rgba(15,15,26,0.10)` — sombra direccional, no en `E.*` tokens por ser caso especial de overlay
- Backdrop: `rgba(15,15,26,0.15)` — muy sutil, enterprise (no agresivo)
- Transición de entrada: `translateX(0/100%)` con `cubic-bezier(0.4,0,0.2,1)` a 280ms
- Cierre: tecla Escape + click en backdrop

---

## TASK 03 — Mapa completo de interacciones

Todo elemento clickeable en Tesorería abre el drawer o navega.

### Posición de Caja

| Elemento | Tipo | Acción |
|----------|------|--------|
| Card: Caja Disponible | onClick | Drawer `{type:"cash", key:"disponible"}` |
| Card: Disponible Hoy | onClick | Drawer `{type:"cash", key:"hoy"}` |
| Card: Comprometido | onClick | Drawer `{type:"cash", key:"comprometido"}` |
| Card: Proyección 7d | onClick | Drawer `{type:"cash", key:"proyectado"}` |
| Fila banco (distribución) | onClick | Drawer `{type:"bank", id:bank.id}` |

### Flujo del Día

| Elemento | Tipo | Acción |
|----------|------|--------|
| Tile: Ingresos | onClick | Drawer `{type:"flow_tile", key:"ingresos"}` |
| Tile: Egresos | onClick | Drawer `{type:"flow_tile", key:"egresos"}` |
| Tile: Identificados | onClick | Drawer `{type:"flow_tile", key:"identificados"}` |
| Tile: Sin identificar | onClick | Drawer `{type:"flow_tile", key:"sin_identificar"}` |
| Tile: Pendientes | onClick | Drawer `{type:"flow_tile", key:"pendientes"}` |
| Cada fila de movimiento | onClick | Drawer `{type:"movement", index:i}` |
| "3 sin identificar → Conciliar" | Link | `/${orgSlug}/reconciliation` |

### Motor de Decisiones

| Elemento | Tipo | Acción |
|----------|------|--------|
| Card completa | onClick | Drawer `{type:"signal", index:i}` |
| Botón CTA interior | Link (stopPropagation) | Navega a ruta real del señal |

### Estado Bancario Operativo

| Elemento | Tipo | Acción |
|----------|------|--------|
| Botón de acción (fila banco) | onClick | Drawer `{type:"bank", id:bank.id}` |
| Link "N pendientes →" | Link | `/${orgSlug}/reconciliation` |

### Obligaciones Pendientes

| Elemento | Tipo | Acción |
|----------|------|--------|
| Fila de obligación | onClick | Drawer `{type:"obligation", index:i}` |

### Proyección de Liquidez

| Elemento | Tipo | Acción |
|----------|------|--------|
| Card de periodo | onClick | Drawer `{type:"forecast", period:string}` |

### Centro de Decisiones (playbooks)

| Elemento | Tipo | Acción |
|----------|------|--------|
| Card completa | onClick | Drawer `{type:"playbook", key:pb.key}` |
| CTA interior (con href) | Link (stopPropagation) | Navega directamente |
| CTA interior (sin href) | button | Re-abre drawer mismo contexto |

---

## TASK 04 — Contenido del drawer por contexto

### `DrawerCtx` type

```typescript
type DrawerCtx =
  | { type: "cash";       key:    "disponible" | "hoy" | "comprometido" | "proyectado" }
  | { type: "flow_tile";  key:    "ingresos" | "egresos" | "identificados" | "sin_identificar" | "pendientes" }
  | { type: "movement";   index:  number }
  | { type: "signal";     index:  number }
  | { type: "bank";       id:     string }
  | { type: "obligation"; index:  number }
  | { type: "forecast";   period: string }
  | { type: "playbook";   key:    "conciliacion" | "cobros" | "obligaciones" }
```

### Contenido por tipo

| Tipo | Secciones del drawer |
|------|---------------------|
| `cash.disponible` | Posición consolidada · Distribución por banco · Nota Agentik · CTA: Ver estado bancario |
| `cash.hoy` | Cálculo disponible hoy · Nota Agentik · CTA: Ver flujo del día |
| `cash.comprometido` | Detalle comprometido · Nota Agentik · CTA: Priorizar cobros |
| `cash.proyectado` | Proyección 7d · Variables clave · Escenario de riesgo |
| `signal.i` | Causa detectada · Ruta de solución (pasos) · Nota · CTA primaria |
| `bank.id` | Estado de cuenta · Acciones requeridas (si aplica) · Nota · CTAs |
| `obligation.i` | Detalle · Impacto en caja · Nota según severidad |
| `forecast.period` | Resumen horizonte · Variables · Escenario de riesgo |
| `playbook.key` | Estado actual · Pasos recomendados · Nota · CTA |
| `flow_tile.key` | Métricas del ciclo · CTA si sin_identificar |
| `movement.i` | Detalle del movimiento · Nota + CTA si pendiente |

### Componentes de drawer reutilizables (internos)

| Componente | Rol |
|------------|-----|
| `DRow` | Fila label/valor con color opcional |
| `DSection` | Sección con título en caps |
| `DNote` | Bloque "Agentik detecta:" con acento de severidad |
| `DSteps` | Lista numerada de pasos |
| `DActions` | Franja de CTAs separada por border-top |

---

## TASK 05 — Motor de Decisiones ampliado

Cada señal en `AI_SIGNALS` ahora incluye:
- `cause: string` — causa raíz detectada (texto paragraph)
- `steps: string[]` — ruta de solución en pasos numerados

Al hacer click en la card, el drawer muestra:
1. Causa detectada (párrafo)
2. Ruta de solución recomendada (DSteps numerados)
3. Nota Agentik (impacto + horizonte)
4. CTA primaria que navega a la ruta correcta

La CTA interior (`ag-action-secondary`) usa `stopPropagation()` para navegar directamente sin abrir el drawer.

---

## TASK 07 — Estado Bancario: acciones sin affordance falsa

Los botones de la tabla de bancos (antes usaban `cursor: "pointer"` pero no ejecutaban nada real) ahora todos abren el drawer con el contexto del banco:

```tsx
<button
  className={actionCls}
  onClick={() => open({type:"bank",id:bank.id})}
  style={{ cursor: "pointer" }}
>
  {actionLbl}
</button>
```

El drawer de banco muestra estado completo, pasos requeridos (si aplica), y CTAs a páginas reales.

---

## TASK 08 — Obligaciones agrupadas por horizonte

### Grupos definidos

```typescript
const OBL_HOY  = OBLIGATIONS.filter(o => o.due === "HOY");
const OBL_WEEK = OBLIGATIONS.filter(o => o.severity === "warning");
const OBL_PROX = OBLIGATIONS.filter(o => o.severity === "normal" || o.severity === "info");
```

### Estructura visual de cada grupo

```
[dot] NOMBRE GRUPO · N obligaciones · $total
─────────────────────────────────────────────
| Concepto | Cat | Vence | Monto | Estado |
─────────────────────────────────────────────
```

- Header del grupo: `C.surface` background, dot color + label color = `SEV_DOT[sev]`
- Filas: `ag-op-row`, `borderLeft: 3px solid SEV_DOT`, clickable → drawer
- Tabla del grupo: border unificado con radio en esquinas superiores/inferiores

Grupos con cero ítems se ocultan con `.filter(g => g.items.length > 0)`.

### Campo `dueLong` en OBLIGATIONS

Se agregó `dueLong: string` a cada obligación para mostrar la fecha completa en el drawer (ej: "viernes 16 de mayo") en lugar del label corto "VIE 16/May".

---

## TASK 09 — Proyección de Liquidez

Se añadió `scenarioRisk: string` a cada `FORECAST_PERIOD` — describe el escenario de riesgo al colapsar cartera. Visible en el drawer de cada periodo.

Cards clickeables: `cursor: "pointer"`, `onClick` → drawer `{type:"forecast", period}`.

---

## TASK 10 — Centro de Decisiones: playbooks operativos

### Antes
3 columnas con botones planos (Crítico / Operativo / Estratégico).

### Después
3 playbook cards, cada una con:
- Badge de severidad + horizonte
- Título del playbook
- Impacto esperado (en verde)
- Estado actual (breve)
- CTA primaria

```typescript
type Playbook = {
  key:         "conciliacion" | "cobros" | "obligaciones";
  severity:    Severity;
  title:       string;
  impact:      string;
  horizon:     string;
  estado:      string;
  href:        string | null;   // null = abre drawer, string = navega
  actionLabel: string;
  steps:       string[];
}
```

Toda la card es clickeable → abre drawer con playbook detallado.
CTA interior usa `stopPropagation()`:
- Si `href` existe → `<Link>` navega directamente
- Si `href === null` → `<button>` abre el mismo drawer

---

## TASK 11 — Coherencia de fechas

Se consolidaron los helpers de fecha en `tesoreria-client.tsx` (Client Component). Los módulos-level constants se calculan una vez al cargar el módulo:

```typescript
const DUE_FRIDAY         = _fmt(_nextDow(5, 2));           // corto: "VIE 16/May"
const DUE_MONDAY         = _fmt(_nextDow(1, 4));
const DUE_WEDNESDAY      = _fmt(_nextDow(3, 6));
const DUE_FRIDAY_LONG    = _fmtLong(_nextDow(5, 2));      // largo: "viernes 16 de mayo"
const DUE_MONDAY_LONG    = _fmtLong(_nextDow(1, 4));
const DUE_WEDNESDAY_LONG = _fmtLong(_nextDow(3, 6));
```

Helper nuevo: `_fmtLong(d: Date): string` — retorna "día DD de mes" en español colombiano completo.

---

## TASK 12 — Validación demo Castillitos

| Criterio | Estado |
|----------|--------|
| ¿Tesorería se entiende en 10 segundos? | ✅ Strip operativo + 2×2 KPI + secciones claras |
| ¿Cada click importante abre algo útil? | ✅ 8 tipos de drawer con contenido coherente |
| ¿La caja ya no se ve apretada? | ✅ Grid 2×2 con padding S[6] en todas las cards |
| ¿El drawer da sensación de sistema real? | ✅ Datos coherentes, pasos accionables, CTAs reales |
| ¿La demo se presenta sin explicar "esto no hace nada"? | ✅ `PassiveAction` para inactivos, drawer para todo lo demás |
| ¿Todo el lenguaje visual está en español LATAM? | ✅ Convención UX-LANGUAGE-01 mantenida |

---

## Narrativa demo sugerida

> "Tesorería Operativa muestra la posición de caja del momento — caja disponible, cuánto está comprometido, qué queda libre hoy y la proyección a 7 días. Desde cada número se puede abrir el detalle: cuántas cuentas, qué obligaciones, cómo se calcula.
>
> Más abajo está el flujo del día — qué entró, qué salió, qué movimientos están sin identificar. El motor de decisiones detecta los riesgos activos: cartera vencida, pagos duplicados, bancos sin sincronización. Desde cada señal se puede ir directamente al workspace de resolución.
>
> Los bancos muestran estado operativo real. Las obligaciones están agrupadas: hoy, esta semana, próximas. La proyección de liquidez comunica cuántos días aguanta la caja en cada horizonte.
>
> Todo está conectado. Detectar aquí, resolver allá."

---

## Qué queda pendiente para backend real

| Sección | Activación backend |
|---------|-------------------|
| Posición de Caja | `GET /api/orgs/[orgSlug]/tesoreria/position` |
| Motor de Decisiones | `GET /api/orgs/[orgSlug]/tesoreria/ai-signals` |
| Estado Bancario | Conector SAG + sync engine |
| Obligaciones | Prisma: `ApDocument` + `PaymentRecord` |
| Flujo del Día | `CollectionRecord` aggregate query |
| Proyección | Modelo de proyección financiera |
| Drawer contenido | Mismas fuentes — solo cambiar los objetos mock por queries |

---

## TypeScript compliance

- Cero nuevos errores introducidos.
- Total del proyecto: 160 errores (baseline sin cambios).
- `DrawerCtx` discriminated union correctamente tipada.
- `getDrawerProps` retorna `{ content: React.ReactNode }` — compilado limpio.
- `SEV_TO_DRAWER: Record<Severity, DrawerSeverity>` — puente de tipos sin cast.
