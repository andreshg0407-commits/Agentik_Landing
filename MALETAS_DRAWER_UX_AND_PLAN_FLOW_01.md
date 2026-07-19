# MALETAS-DRAWER-UX-AND-PLAN-FLOW-01

**Sprint:** Drawer UX y flujo de plan de surtido desde maleta
**Estado:** COMPLETO
**TSC Baseline:** 160 (sin regresiones)
**Validacion:** 31/31 PASS

---

## Problemas corregidos

1. **Scroll del drawer** — Al hacer scroll dentro del drawer, se movia la pagina principal.
2. **Boton confuso** — El boton de oportunidades decia "+ Plan", sin contexto operativo.
3. **Sin flujo de reemplazo** — Desde el drawer de maleta se veian referencias a reemplazar pero no se podian seleccionar candidatos ni construir un plan.

---

## Cambios UX

### Scroll y background lock
- `OperationalSideDrawer` ya tenia `overflowY: auto` en el body — funciona correctamente.
- Se agrego `document.body.style.overflow = "hidden"` cuando el drawer abre.
- Se restaura el overflow original al cerrar.
- Aplica a todos los drawers: maleta, produccion, gap action, plan, historial.

### Boton de oportunidades
- **Antes:** `+ Plan`
- **Ahora:** `Agregar` con tooltip: "Agregar esta referencia a un plan de surtido de maleta"

### Acciones por referencia en drawer
- Cada referencia con estado `reemplazar` muestra boton **Reemplazar**.
- Al hacer click, se expande un panel de candidatos debajo de la fila.
- Grid del drawer ampliado de 7 a 8 columnas (nueva columna "Accion").

---

## Flujo desde drawer de maleta

```
1. Abrir maleta de Orlando
2. Ver referencias marcadas "Reemplazar"
3. Click "Reemplazar" en una referencia
4. Se expande panel con candidatos del mismo subgrupo SAG
5. Candidatos ordenados por disponibilidad central
6. Candidatos excluyen: ya en maleta, ya en plan
7. Click "Elegir" en un candidato
8. Se agrega al plan draft persistente via API
9. Feedback: "Agregado al plan de surtido de Orlando"
10. Repetir para mas referencias sin cerrar drawer
11. Ver resumen del plan activo en la parte superior
12. Click "Generar guia" para crear documento
```

## Flujo desde oportunidades de cobertura

```
1. Ver tabla de oportunidades de cobertura
2. Click "Agregar" en una referencia disponible
3. Elegir maleta/vendedor destino
4. Elegir referencia que sale (opcional)
5. Confirmar cantidad
6. Se agrega al plan draft persistente via API
```

---

## Prevencion de duplicados

- Al agregar desde drawer: verifica si `removedReference` ya existe en el plan draft.
- En `DrawerCandidateSelector`: verifica `alreadyRemovedInPlan` y muestra aviso.
- Mensaje: "Esta referencia ya esta incluida en el plan de surtido."

---

## Plan activo en drawer

Bloque visible en la parte superior del drawer de maleta:

| Estado | Contenido |
|---|---|
| Con plan draft | Contador de cambios, entran/salen, botones "Ver plan" y "Generar guia" |
| Sin plan | "Sin plan activo" |

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `components/workspace/operational-side-drawer.tsx` | Background scroll lock (`body.overflow = hidden`) |
| `app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx` | Boton renombrado, grid 8 columnas, Reemplazar button, DrawerCandidateSelector, plan summary, feedback toast, duplicate prevention |

## Archivos creados

| Archivo | Proposito |
|---|---|
| `scripts/validate-maletas-drawer-ux-and-plan-flow.ts` | Validacion estructural (31 checks) |

---

## Criterio de exito

| Criterio | Estado |
|---|---|
| Abrir maleta y hacer scroll sin mover pagina | OK |
| Ver referencias a reemplazar | OK |
| Elegir reemplazo para varias referencias | OK |
| Acumular cambios en un mismo plan | OK |
| Generar guia de surtido desde drawer | OK |
| Refrescar y conservar plan/historial | OK (persistencia API) |
| TSC baseline 160 | OK |
