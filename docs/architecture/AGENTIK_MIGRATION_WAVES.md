# AGENTIK MIGRATION WAVES — Execution Playbook

> Manual operativo oficial para construir agentik-os desde un repositorio vacio.
> Sprint: AGENTIK-MIGRATION-WAVES-01
> Fecha: 2026-07-17
> Version: v1.0
>
> Referencias:
> - AGENTIK_PROJECT_MANIFEST.md (FROZEN v1.0)
> - AGENTIK_INVENTORY_INDEX.md
> - AGENTIK_MODULE_DEPENDENCIES.md
> - AGENTIK_BOOTSTRAP_ARCHITECTURE.md v1.1
>
> Restriccion: NO code modification, NO git add, NO git commit, NO git push.
> Este documento no modifica ninguno de los documentos de referencia.

---

## Global Migration Rules

1. **Nunca migrar un modulo sin sus dependencias.** Si el modulo no compila aislado, sus dependencias van primero.
2. **Nunca romper una dependencia circular sin crear antes el contrato compartido.** Pre-Migration (Seccion 2 del Bootstrap Architecture) debe ejecutarse antes de Wave 5.
3. **No copiar codigo legacy innecesario.** Los 8 candidatos a eliminacion (Pending Runtime Validation) se incluyen en Wave 18 para validacion, no en waves tempranas.
4. **Mantener compilacion limpia en cada wave.** `npx tsc --noEmit` debe pasar con 0 errores propios al cierre de cada wave.
5. **Mantener TypeScript sin errores nuevos.** Errores heredados del repo original se documentan como baseline; nunca se incrementan.
6. **Mantener Prisma consistente.** `npx prisma generate` y `npx prisma validate` deben pasar desde Wave 2 en adelante.
7. **No modificar funcionalidad durante la migracion.** Copiar, no reescribir. Si un modulo necesita refactor, se documenta como tarea post-wave.
8. **Migrar antes de refactorizar.** Primero el codigo funciona identico en agentik-os. Despues se mejora.
9. **Cada wave es una rama.** Formato: `wave/{N}-{nombre}`. Se mergea a `main` solo cuando pasa el Validation Gate.
10. **Sin referencias al repositorio antiguo.** Ningun import, path, o comentario debe apuntar a `ai-landing-page`.

---

## Validation Gates

Compuertas obligatorias entre waves. Si una wave no supera su gate, la siguiente wave **no puede comenzar**.

| Gate | Verificacion | Comando |
|---|---|---|
| G-01 | TypeScript compila sin errores nuevos | `npx tsc --noEmit 2>&1 \| grep "error TS" \| wc -l` |
| G-02 | Prisma schema valido (desde Wave 2) | `npx prisma validate` |
| G-03 | Prisma client genera (desde Wave 2) | `npx prisma generate` |
| G-04 | Sin imports rotos | `npx tsc --noEmit 2>&1 \| grep "TS2307" \| wc -l` = 0 |
| G-05 | Sin dependencias faltantes | `npm ls --all 2>&1 \| grep "MISSING" \| wc -l` = 0 |
| G-06 | Sin referencias al repo antiguo | `grep -r "ai-landing-page" lib/ app/ components/ \| wc -l` = 0 |
| G-07 | Sin errores de tipos en modulos migrados | `npx tsc --noEmit 2>&1 \| grep "error TS" \| grep -v "pre-existing"` = 0 |
| G-08 | Wave branch mergeada limpia | `git merge --no-commit --no-ff wave/{N} && git merge --abort` sin conflictos |

### Gate Protocol

```
1. Ejecutar G-01 a G-07
2. Documentar resultados en el commit message de la wave
3. Si cualquier gate falla:
   a. Diagnosticar
   b. Corregir dentro de la misma wave branch
   c. Re-ejecutar gates
   d. No avanzar hasta que todos pasen
4. Merge a main
5. Tag: wave-{N}-complete
```

---

## Rollback Strategy

### Por Wave

| Evento | Accion |
|---|---|
| Wave falla gates despues de merge a main | `git revert --no-commit HEAD~{commits-de-wave}` + nuevo commit explicando rollback |
| Wave falla gates antes de merge | Eliminar branch `wave/{N}`. Re-crear desde `main`. |
| Dependencia inesperada descubierta | Pausar wave actual. Agregar dependencia faltante. Re-ejecutar gates. |
| Prisma migration falla | `npx prisma migrate reset --force` en DB de desarrollo. Corregir migration. Re-aplicar. |

### Validacion de rollback exitoso

1. `npx tsc --noEmit` retorna al baseline pre-wave
2. `npx prisma validate` pasa
3. `git log --oneline -5` muestra revert commit
4. Ningun archivo de la wave fallida permanece en `main`

### Ramas a conservar

- `main` — siempre protegida, solo merges de waves completadas
- `wave/{N}-{nombre}` — se elimina despues de merge exitoso, se conserva si rollback pendiente
- `pre-migration/circular-resolution` — se conserva hasta que Wave 8 pase gates

---

## Parallel Execution Matrix

| Wave | Puede ejecutarse en paralelo con | Requiere serie con | Requiere sincronizacion |
|---|---|---|---|
| 0 | Ninguna (primera) | — | — |
| 1 | Wave 2 (si toolchain ya esta) | Wave 0 | — |
| 2 | Wave 1 | Wave 0 | — |
| 3 | — | Wave 2 | — |
| 4 | Wave 5 (parcialmente) | Wave 3 | — |
| 5 | Wave 4 | Wave 0 (pre-migration completada) | Los 4 paquetes nuevos deben existir |
| 6 | — | Wave 5 | — |
| 7 | — | Wave 6 | — |
| 8a | — | Wave 7 | — |
| 8b | — | Wave 8a | — |
| 8c | — | Wave 8b | — |
| 8d | — | Wave 8b | — |
| 9 | — | Wave 8 | — |
| 10 | — | Wave 9 (para integrations) | — |
| 11 | — | Wave 10 | — |
| 12 | Wave 13 | Wave 10 | — |
| 13 | Wave 12 | Wave 8 | — |
| 14 | — | Wave 11 | — |
| 15 | Wave 16, Wave 17 (parcialmente) | Wave 14 | Componentes deben existir antes de sus pages |
| 16 | Wave 15 (parcialmente), Wave 17 | Wave 14 | Pages no pueden preceder a sus componentes |
| 17 | Wave 15, Wave 16 | Wave 8-13 (lib/ deps) | — |
| 18 | Wave 12-17 | Wave 10 (deps disponibles) | — |
| 19 | Ninguna (ultima) | Wave 18 | Revision manual de candidatos a eliminacion |

### Sincronizaciones que requieren revision manual

| Caso | Razon |
|---|---|
| Wave 8c y Wave 8d | Ambas dependen de Wave 8b. Pueden correr en paralelo pero comparten dependencias de comercial. Verificar que no hay conflictos en types compartidos. |
| Wave 15, 16, 17 | Las tres involucran archivos que importan de los mismos lib/ modules. Verificar que no se pisan. |
| Wave 19 | Requiere decision humana sobre cada candidato a eliminacion. No automatizable. |

---

## Definition of Done

Una wave puede marcarse como **COMPLETED** unicamente cuando:

| # | Criterio | Verificable por |
|---|---|---|
| DoD-01 | Todos los archivos listados en la wave estan presentes en agentik-os | `find` + diff contra lista |
| DoD-02 | `npx tsc --noEmit` pasa con 0 errores propios de la wave | Comando + conteo |
| DoD-03 | `npx prisma validate` pasa (desde Wave 2) | Comando |
| DoD-04 | `npx prisma generate` pasa (desde Wave 2) | Comando |
| DoD-05 | 0 imports apuntan a `@/lib/` modulos no migrados aun | `grep` + lista de modulos pendientes |
| DoD-06 | 0 referencias a `ai-landing-page` | `grep -r "ai-landing-page"` |
| DoD-07 | Wave branch mergeada a `main` sin conflictos | `git merge` |
| DoD-08 | Tag `wave-{N}-complete` creado | `git tag` |
| DoD-09 | Todos los Validation Gates (G-01 a G-08) pasan | Gate Protocol |
| DoD-10 | Resultado documentado en commit message | `git log` |

---

## Wave Execution Details

---

### WAVE 0 — Toolchain + Configuration

**Objetivo:** Repositorio agentik-os inicializado con toolchain funcional. `npm install` y `npx tsc --noEmit` ejecutan sin errores.

**Modulos incluidos:** Ninguno (solo configuracion).

**Archivos principales:**
- `package.json` — copiar dependencias de ai-landing-page, limpiar scripts innecesarios
- `tsconfig.json` — copiar configuracion de compilacion
- `next.config.mjs` — copiar configuracion de Next.js
- `tailwind.config.ts` — copiar configuracion de Tailwind
- `postcss.config.mjs` — copiar configuracion de PostCSS
- `.env.example` — template de variables de entorno (sin secretos)
- `.eslintrc.*` o `eslint.config.*` — copiar reglas de linting
- `.gitignore` — copiar
- `CLAUDE.md` — copiar reglas de desarrollo

**Dependencias de entrada:** Ninguna.
**Dependencias de salida:** Toolchain disponible para todas las waves.
**Puede ejecutarse en paralelo con:** Ninguna (primera wave).
**Bloquea las siguientes waves:** Wave 1, Wave 2 (todas las demas transitivamente).
**Riesgos:** Versiones de paquetes incompatibles si se actualizan durante copia. Mitigacion: copiar package-lock.json exacto.
**Compatibilidad temporal requerida:** Ninguna.

**Validaciones obligatorias:**
- [ ] `npm install` completa sin errores
- [ ] `npx tsc --noEmit` ejecuta (puede tener 0 archivos, debe no fallar)
- [ ] `npx next build` no falla por configuracion (puede fallar por ausencia de paginas)

**Criterio de salida:** `npm install && npx tsc --noEmit` retorna exit code 0.
**Estado esperado:** Repositorio vacio con toolchain funcional.

---

### WAVE 1 — Design System + Pure Utilities

**Objetivo:** Tokens de diseno, CSS del OS, y utilidades puras disponibles. Ningun modulo en esta wave tiene dependencias externas.

**Modulos incluidos (16 archivos):**

| Modulo | Archivos | Dependencias |
|---|---|---|
| ui | 4 | 0 |
| utils | 1 | 0 |
| email | 1 | 0 |
| observability | 6 | 0 |
| runtime | 4 | 0 |

**Archivos principales:**
- `app/design-system.css` — variables CSS y clases ag-*
- `app/globals.css` — importa design-system.css
- `lib/ui/tokens.ts` — C, T, S, R, E constants
- `lib/ui/surfaces.ts` — surface style helpers
- `lib/ui/op-table.ts` — operational table helpers
- `lib/utils/` — 1 archivo de utilidades puras
- `lib/email/` — 1 archivo de email adapter (Resend)
- `lib/observability/` — 6 archivos de observabilidad
- `lib/runtime/` — 4 archivos de runtime utilities

**Dependencias de entrada:** Wave 0 (toolchain).
**Dependencias de salida:** `C.*`, `T.*`, `S.*`, `R.*`, `E.*` disponibles. CSS design system cargable.
**Puede ejecutarse en paralelo con:** Wave 2.
**Bloquea las siguientes waves:** Wave 14 (components/shell necesita ui/tokens).
**Riesgos:** Ninguno. Modulos sin dependencias.
**Compatibilidad temporal requerida:** Ninguna.

**Validaciones obligatorias:**
- [ ] `npx tsc --noEmit` — 0 errores en archivos de esta wave
- [ ] `import { C, T, S, R, E } from "@/lib/ui/tokens"` resuelve
- [ ] `app/design-system.css` parsea sin errores de sintaxis

**Criterio de salida:** Todos los tokens importables. CSS valido.
**Estado esperado:** Design system del OS disponible.

---

### WAVE 2 — Prisma + Data Layer

**Objetivo:** Schema de base de datos completo. `npx prisma generate` funciona. Client disponible para todas las waves posteriores.

**Modulos incluidos (5 archivos + schema + migrations):**

| Archivo | Descripcion |
|---|---|
| `prisma/schema.prisma` | 253 modelos, 63 enums, 9,789 lineas |
| `prisma/migrations/` | Todas las migrations (directorio completo) |
| `prisma/seed.ts` | Seed data |
| `lib/prisma.ts` | Prisma client singleton |
| `lib/ensure-main-project.ts` | Inicializacion de proyecto principal |

**Dependencias de entrada:** Wave 0 (toolchain — prisma en package.json).
**Dependencias de salida:** `prisma` client disponible. 54 modulos dependen de este.
**Puede ejecutarse en paralelo con:** Wave 1.
**Bloquea las siguientes waves:** Wave 3, Wave 4, y todas las waves que importen prisma (3-18).
**Riesgos:**
- Schema demasiado grande — verificar que `prisma generate` completa en tiempo razonable.
- `@prisma/adapter-neon` requiere configuracion de DATABASE_URL. Mitigacion: `.env.example` debe incluir template.
**Compatibilidad temporal requerida:** Si ambos repos apuntan a la misma DB, las migrations deben estar sincronizadas.

**Validaciones obligatorias:**
- [ ] `npx prisma validate` — schema valido
- [ ] `npx prisma generate` — client genera sin errores
- [ ] `import { prisma } from "@/lib/prisma"` resuelve
- [ ] 253 modelos verificados: `grep -c "^model " prisma/schema.prisma` = 253
- [ ] 63 enums verificados: `grep -c "^enum " prisma/schema.prisma` = 63

**Criterio de salida:** `npx prisma validate && npx prisma generate` retorna exit code 0.
**Estado esperado:** Data layer completo.

---

### WAVE 3 — Tenant + Auth + Core Infrastructure

**Objetivo:** Multi-tenancy funcional. Autenticacion disponible. Bootstrap del sistema operativo.

**Modulos incluidos (16 archivos):**

| Modulo | Archivos | Dependencias |
|---|---|---|
| tenant | 3 | prisma |
| auth | 9 | prisma, tenant |
| bootstrap | 4 | ensure-main-project, prisma, tenant |

**Archivos principales:**
- `lib/tenant/` — modulos.ts, branding.ts, index
- `lib/auth/` — 9 archivos (module-access, session, guards, etc.)
- `lib/bootstrap/` — 4 archivos (module-bundles, etc.)
- `middleware.ts` — middleware de Next.js (importa auth)

**Dependencias de entrada:** Wave 2 (prisma, ensure-main-project).
**Dependencias de salida:** `auth`, `tenant`, `bootstrap` disponibles. 4+ modulos dependen de auth. 4+ dependen de tenant.
**Puede ejecutarse en paralelo con:** Ninguna (serie estricta: tenant → auth → bootstrap).
**Bloquea las siguientes waves:** Wave 4 (actions, api dependen de auth). Wave 16 (app routes necesitan middleware).
**Riesgos:**
- Auth provider configuration (NextAuth/custom). Verificar que .env.example incluye todas las variables.
- middleware.ts puede tener imports de modulos no migrados. Verificar y stub si necesario.
**Compatibilidad temporal requerida:** auth y tenant deben compartirse entre repos durante transicion (sesiones, org data).

**Validaciones obligatorias:**
- [ ] `npx tsc --noEmit` — 0 errores en archivos de esta wave
- [ ] `import { requireAuth } from "@/lib/auth"` resuelve (o equivalente)
- [ ] `import { getTenantModules } from "@/lib/tenant/modules"` resuelve
- [ ] middleware.ts compila

**Criterio de salida:** Auth + tenant + bootstrap compilan sin errores.
**Estado esperado:** Sistema multi-tenant con autenticacion.

---

### WAVE 4 — Infrastructure Services

**Objetivo:** Todos los servicios de infraestructura (tasks, approvals, events, work, etc.) disponibles.

**Modulos incluidos (200 archivos):**

| Modulo | Archivos | Dependencias |
|---|---|---|
| tasks | 14 | prisma |
| approvals | 15 | prisma |
| events | 1 | prisma |
| runs | 1 | prisma |
| orders | 1 | prisma |
| notifications | 1 | prisma |
| knowledge | 1 | prisma |
| documents | 6 | prisma |
| pipeline | 1 | prisma |
| operational-map | 33 | prisma |
| reconciliation | 54 | prisma |
| dashboard | 2 | prisma |
| ai-billing | 21 | prisma |
| execution | 3 | prisma |
| actions | 2 | auth, prisma |
| api | 2 | auth, prisma |
| work | 42 | prisma, tasks |

**Dependencias de entrada:** Wave 2 (prisma) + Wave 3 (auth para actions/api).
**Dependencias de salida:** tasks, approvals, work, execution, etc. disponibles para waves 9, 11, 18.
**Puede ejecutarse en paralelo con:** Wave 5 (parcialmente — Wave 5 no depende de Wave 4).
**Bloquea las siguientes waves:** Wave 9 (agents necesita approvals, tasks, work). Wave 11 (copilot necesita approvals, tasks, work). Wave 18 (agentik necesita actions, events, runs, knowledge).
**Riesgos:**
- reconciliation (54 archivos) puede tener imports internos complejos. Verificar que no importa de waves posteriores.
- operational-map (33 archivos) puede importar de operational-inventory (Wave 8d). Verificar y stub si necesario.
**Compatibilidad temporal requerida:** Ninguna.

**Validaciones obligatorias:**
- [ ] `npx tsc --noEmit` — 0 errores en archivos de esta wave
- [ ] Cada modulo importable desde su barrel export
- [ ] `work` importa correctamente de `tasks`
- [ ] `actions` y `api` importan correctamente de `auth`

**Criterio de salida:** 200 archivos compilan. Todos los barrels importables.
**Estado esperado:** Infraestructura de servicios completa.

---

### WAVE 5 — Foundation Types

**Objetivo:** Tipos compartidos y contratos de ciclos circulares disponibles. Pre-requisito para toda la logica de negocio.

**Modulos incluidos (35+ archivos):**

| Modulo | Archivos | Dependencias | Notas |
|---|---|---|---|
| logistics | 6 | 0 | |
| production-events | 7 | 0 | |
| ai-pricing | 14 | 0 | |
| ai | 1 | 0 | |
| agentik-agents | 2 | 0 | |
| business-engine | 5 | 0 | |
| commercial-types | NUEVO | 0 | Extraido de circulares comerciales |
| source-types | NUEVO | 0 | Extraido de sag↔sales |
| agent-contracts | NUEVO | 0 | Extraido de agent stack |
| pya-client | NUEVO | 0 | Extraido de connectors↔sag |

**Archivos principales:**
- `lib/logistics/` — 6 archivos de tipos logisticos
- `lib/production-events/` — 7 archivos de tipos de eventos de produccion
- `lib/ai-pricing/` — 14 archivos de pricing engine
- `lib/ai/` — 1 archivo de AI utilities
- `lib/agentik-agents/` — 2 archivos de definicion de agentes
- `lib/business-engine/` — 5 archivos de motor de negocio
- `lib/commercial-types/` — **NUEVO**: tipos compartidos (OperationalInventoryItem, SagInventoryItem, VendorBagItem, LiveVendor, etc.)
- `lib/source-types/` — **NUEVO**: SagSourceType, SagDocumentFamilyMap
- `lib/agent-contracts/` — **NUEVO**: ActionEnvelope, AgentRuntimeId, AgentDomain, AgentDelegation, OperationalPlan, RuntimeMemoryNode
- `lib/pya-client/` — **NUEVO**: getPyaConfig, PyaApiConfig, consultaSagJson

**Dependencias de entrada:** Wave 0 (solo types, no runtime). Pre-Migration tasks del Bootstrap Architecture deben estar completas.
**Dependencias de salida:** commercial-types para Wave 6. agent-contracts para Wave 9. pya-client para Wave 8. source-types para Wave 8a.
**Puede ejecutarse en paralelo con:** Wave 4.
**Bloquea las siguientes waves:** Wave 6 (business-entities necesita commercial-types). Wave 8 (sag, connectors necesitan pya-client, source-types). Wave 9 (agent stack necesita agent-contracts).
**Riesgos:**
- Los 4 paquetes NUEVOS no existen en el repo original. Deben crearse como parte de Pre-Migration. Si Pre-Migration no esta completa, esta wave se bloquea.
**Compatibilidad temporal requerida:** Ninguna.

**Validaciones obligatorias:**
- [ ] `npx tsc --noEmit` — 0 errores en archivos de esta wave
- [ ] Los 4 paquetes nuevos exportan sus tipos correctamente
- [ ] `import type { ActionEnvelope } from "@/lib/agent-contracts"` resuelve
- [ ] `import type { OperationalInventoryItem } from "@/lib/commercial-types"` resuelve
- [ ] `import { getPyaConfig } from "@/lib/pya-client"` resuelve
- [ ] `import type { SagSourceType } from "@/lib/source-types"` resuelve

**Criterio de salida:** Todos los tipos compartidos importables. 0 errores.
**Estado esperado:** Contratos de tipos listos para romper circulares.

---

### WAVE 6 — Business Foundation

**Objetivo:** Modelo de entidades y sistema de senales disponible.

**Modulos incluidos (24 archivos):**

| Modulo | Archivos | Dependencias |
|---|---|---|
| business-entities | 12 | commercial-types (Wave 5) |
| business-signals | 12 | business-entities |

**Dependencias de entrada:** Wave 5 (commercial-types).
**Dependencias de salida:** business-entities y business-signals disponibles para Wave 7 (toda la capa business-*).
**Puede ejecutarse en paralelo con:** Ninguna en este nivel.
**Bloquea las siguientes waves:** Wave 7 (business logic completa).
**Riesgos:**
- business-entities originalmente depende de comercial (circular). Verificar que la refactorizacion a commercial-types se aplico correctamente.
**Compatibilidad temporal requerida:** Ninguna.

**Validaciones obligatorias:**
- [ ] `npx tsc --noEmit` — 0 errores en archivos de esta wave
- [ ] business-entities NO importa de `@/lib/comercial` (circular rota)
- [ ] business-signals importa correctamente de business-entities

**Criterio de salida:** 24 archivos compilan. 0 imports circulares.
**Estado esperado:** Modelo de entidades de negocio disponible.

---

### WAVE 7 — Business Logic

**Objetivo:** Motor completo de reglas, eventos, razonamiento, planificacion, decisiones y acciones de negocio.

**Modulos incluidos (103 archivos):**

| Modulo | Archivos | Dependencias |
|---|---|---|
| business-events | 14 | business-entities, business-signals |
| business-rules | 13 | business-entities, business-events, business-signals |
| business-reasoning | 15 | business-entities |
| business-planning | 16 | business-entities, business-events, business-rules, business-signals |
| business-decisions | 14 | business-entities, business-events, business-planning, business-rules, business-signals |
| business-actions | 15 | business-decisions, business-entities, business-events, business-planning, business-signals |
| tenant-rules | 4 | commercial-types (diferido de commercial-intelligence) |

**Serie interna:** events + rules + reasoning (paralelo) → planning → decisions → actions.

**Dependencias de entrada:** Wave 6 (business-entities, business-signals).
**Dependencias de salida:** Motor de negocio completo para Wave 8 (domain core).
**Puede ejecutarse en paralelo con:** Ninguna en este nivel.
**Bloquea las siguientes waves:** Wave 8 (domain core depende de business logic).
**Riesgos:**
- tenant-rules depende de commercial-intelligence (Wave 8b). Se usa commercial-types temporalmente. Verificar que no hay imports directos a commercial-intelligence.
**Compatibilidad temporal requerida:** Ninguna.

**Validaciones obligatorias:**
- [ ] `npx tsc --noEmit` — 0 errores en archivos de esta wave
- [ ] tenant-rules NO importa de `@/lib/commercial-intelligence` (usa commercial-types)
- [ ] business-actions importa correctamente toda la cadena

**Criterio de salida:** 103 archivos compilan. Cadena business-* completa.
**Estado esperado:** Motor de reglas de negocio operativo.

---

### WAVE 8 — Domain Core

**Objetivo:** Dominios comercial, financiero, produccion y operacional completos. Esta es la wave mas grande y compleja.

**Modulos incluidos (604 archivos en 4 sub-waves):**

#### SUB-WAVE 8a — Finance + Sales + SAG (139 archivos)

| Modulo | Archivos | Dependencias |
|---|---|---|
| finance (+ financial merged) | 86 + 9 = 95 | documents, prisma, source-types, utils |
| sag | 24 | pya-client, prisma, sales (co-deploy) |
| sales | 16 | finance, prisma, sag (co-deploy) |
| alerts | 4 | finance, prisma |

**Co-deploy obligatorio:** sag + sales.
**Serie interna:** finance → sag+sales (co-deploy) → alerts.

#### SUB-WAVE 8b — Commercial Engine (401 archivos)

| Modulo | Archivos | Dependencias |
|---|---|---|
| comercial | 347 | 14 deps (todas en waves 2-8a + commercial-types) |
| commercial-intelligence | 7 | business-signals, comercial (co-deploy), prisma |
| connectors | 47 | comercial, pya-client, logistics, prisma, production-events, sag, sales |

**Co-deploy obligatorio:** comercial + commercial-intelligence.
**Serie interna:** comercial+c-i (co-deploy) → connectors.

#### SUB-WAVE 8c — Production (33 archivos)

| Modulo | Archivos | Dependencias |
|---|---|---|
| production-timeline | 6 | prisma, production-events |
| production-intelligence | 13 | business-signals, comercial, commercial-intelligence, prisma, tenant-rules |
| production-control | 2 | prisma, production-intelligence |
| production-stages | 4 | production-events, production-timeline |
| production | 8 | prisma, production-control, production-events, production-stages, production-timeline |

**Sin circulares.** Serie: timeline → intelligence → control → stages → production.

#### SUB-WAVE 8d — Operational (31 archivos)

| Modulo | Archivos | Dependencias |
|---|---|---|
| operational-inventory | 12 | comercial, operational-entity-types (commercial-types), prisma |
| operational-data | 16 | comercial, operational-inventory (co-deploy), prisma |
| operational-intelligence | 3 | comercial, operational-data, operational-inventory, prisma |

**Co-deploy obligatorio:** operational-inventory + operational-data.

**Dependencias de entrada:** Wave 2-7 (prisma, auth, business-*, commercial-types, source-types, pya-client).
**Dependencias de salida:** Todos los dominios core disponibles para Wave 9-13.
**Puede ejecutarse en paralelo con:** Sub-waves 8c y 8d pueden ejecutarse en paralelo despues de 8b.
**Bloquea las siguientes waves:** Wave 9 (agent-runtime necesita comercial). Wave 10 (integrations necesita connectors). Wave 13 (executive-dashboard necesita comercial, commercial-intelligence, production-intelligence).
**Riesgos:**
- comercial (347 archivos) es el modulo con mas dependencias (14). Cualquier import faltante bloquea.
- financial merge: verificar que todos los imports de `@/lib/financial` se redirigen a `@/lib/finance`.
- connectors depende de production (Wave 8c). Verificar orden o stub.
**Compatibilidad temporal requerida:** connectors (SAG adapter) puede necesitar existir en ambos repos para sync jobs.

**Validaciones obligatorias:**
- [ ] `npx tsc --noEmit` — 0 errores en archivos de esta wave
- [ ] 0 imports a `@/lib/financial` (merged en finance)
- [ ] sag+sales compilan juntos sin circular
- [ ] comercial+commercial-intelligence compilan juntos sin circular
- [ ] operational-inventory+operational-data compilan juntos sin circular
- [ ] connectors compila con todas sus dependencias

**Criterio de salida:** 604 archivos compilan. 0 circulares remanentes. Todos los dominios core importables.
**Estado esperado:** Motor comercial, financiero, de produccion y operacional completo.

---

### WAVE 9 — Agent Stack

**Objetivo:** Runtime de agentes funcional con memoria, inteligencia, orquestacion y planificacion.

**Modulos incluidos (101 archivos):**

| Modulo | Archivos | Dependencias |
|---|---|---|
| agent-runtime | 41 | agent-contracts, comercial (via registry), prisma |
| agent-memory | 7 | agent-contracts |
| agent-intelligence | 6 | agent-contracts, agent-memory, agent-runtime |
| agent-orchestration | 7 | agent-contracts, agent-intelligence, agent-memory, agent-runtime |
| agent-planning | 7 | agent-contracts, agent-intelligence, agent-memory, agent-orchestration, agent-runtime |
| agents | 33 | approvals, sales, tasks, work |

**Co-deploy:** agent-runtime + agent-memory (deps mutuas resueltas via agent-contracts).
**Serie interna:** runtime+memory → intelligence → orchestration → planning. agents al final.

**Dependencias de entrada:** Wave 4 (approvals, tasks, work) + Wave 5 (agent-contracts) + Wave 8 (comercial, sales).
**Dependencias de salida:** agent-runtime y agents disponibles para Wave 11 (copilot).
**Puede ejecutarse en paralelo con:** Ninguna en este nivel.
**Bloquea las siguientes waves:** Wave 11 (copilot depende de agents, agent-runtime).
**Riesgos:**
- agent-runtime originalmente importa de comercial (circular). Verificar que el registry pattern se aplico correctamente.
- agents (33 archivos) depende de sales — verificar que Wave 8a esta completa.
**Compatibilidad temporal requerida:** Ninguna.

**Validaciones obligatorias:**
- [ ] `npx tsc --noEmit` — 0 errores en archivos de esta wave
- [ ] agent-runtime NO importa de `@/lib/comercial` directamente (usa registry)
- [ ] Todos los agent-* importan de `@/lib/agent-contracts` en lugar de importarse mutuamente para tipos
- [ ] agents importa correctamente de approvals, sales, tasks, work

**Criterio de salida:** 101 archivos compilan. 0 circulares en agent stack.
**Estado esperado:** Runtime de agentes operativo.

---

### WAVE 10 — Integration + Security Layer

**Objetivo:** Capa de seguridad completa y sistema de integraciones externas disponible.

**Modulos incluidos (342 archivos):**

| Modulo | Archivos | Dependencias |
|---|---|---|
| security | 234 | prisma (copilot dep eliminada via registry) |
| integrations | 105 | comercial, connectors, prisma, security |
| castillitos | 3 | finance, prisma, sag |

**Parallelizable:** security, integrations, castillitos son independientes entre si tras refactor.

**Dependencias de entrada:** Wave 8 (comercial, connectors, finance, sag).
**Dependencias de salida:** security e integrations disponibles para Wave 11 (copilot, marketing-studio). security disponible para Wave 12 (ai-layer).
**Puede ejecutarse en paralelo con:** Ninguna (depende de Wave 9 para integrations que usa comercial post-agent-runtime).
**Bloquea las siguientes waves:** Wave 11 (copilot necesita security). Wave 12 (ai-layer necesita security).
**Riesgos:**
- security (234 archivos) originalmente importa de copilot (circular). Verificar que el registry pattern se aplico correctamente.
- integrations originalmente importa de marketing-studio (circular). Verificar que shopify-types se extrajo correctamente.
**Compatibilidad temporal requerida:** Ninguna.

**Validaciones obligatorias:**
- [ ] `npx tsc --noEmit` — 0 errores en archivos de esta wave
- [ ] security NO importa de `@/lib/copilot` (circular rota via registry)
- [ ] integrations NO importa de `@/lib/marketing-studio` (circular rota via shopify-types)
- [ ] security: vault, kms, mfa, rbac, encryption, anomaly, compliance sub-modulos compilan

**Criterio de salida:** 342 archivos compilan. 0 circulares con copilot o marketing-studio.
**Estado esperado:** Seguridad empresarial + integraciones externas disponibles.

---

### WAVE 11 — Copilot + Marketing Studio

**Objetivo:** Inteligencia empresarial completa (7 agentes, memory graph, strategic forecasting, board intelligence) y Marketing Studio (shopify, social, video, orchestration).

**Modulos incluidos (1,043 archivos):**

| Modulo | Archivos | Dependencias | Notas |
|---|---|---|---|
| copilot | 744 | agentik-agents, agents, approvals, comercial, finance, prisma, security, tasks, work | 37 subdirectorios |
| marketing-studio | 299 | execution, integrations, prisma, security, ui | copilot dep resuelto via runtime-types |

**Co-deploy:** copilot + marketing-studio (deps mutuas resueltas pero runtime coupling alto).

**Dependencias de entrada:** Wave 9 (agents, agent-runtime) + Wave 10 (security, integrations).
**Dependencias de salida:** copilot disponible para Wave 14 (right-ops-rail). marketing-studio disponible para Wave 15 (components).
**Puede ejecutarse en paralelo con:** Ninguna.
**Bloquea las siguientes waves:** Wave 14 (shell necesita copilot para rail).
**Riesgos:**
- Wave mas grande del proyecto: 1,043 archivos.
- copilot tiene 37 subdirectorios con acoplamiento interno alto. Un import faltante puede ser dificil de localizar.
- marketing-studio originalmente importa de copilot (circular). Verificar que runtime-types se extrajo.
**Compatibilidad temporal requerida:** Ninguna.

**Validaciones obligatorias:**
- [ ] `npx tsc --noEmit` — 0 errores en archivos de esta wave
- [ ] marketing-studio NO importa de `@/lib/copilot` directamente (usa runtime-types)
- [ ] Todos los 37 subdirectorios de copilot compilan
- [ ] marketing-studio: commerce/shopify, social, video-editor, orchestration, publishing compilan

**Criterio de salida:** 1,043 archivos compilan. 0 circulares remanentes.
**Estado esperado:** Inteligencia empresarial + marketing studio operativos.

---

### WAVE 12 — AI Layer

**Objetivo:** Capa de IA con adapters para Anthropic, OpenAI, Google/Gemini funcional.

**Modulos incluidos (16 archivos):**

| Modulo | Archivos | Dependencias |
|---|---|---|
| ai-layer | 16 | ai-billing (Wave 4), ai-pricing (Wave 5), security (Wave 10) |

**Dependencias de entrada:** Wave 4 (ai-billing), Wave 5 (ai-pricing), Wave 10 (security).
**Dependencias de salida:** AI adapters disponibles para app/ routes.
**Puede ejecutarse en paralelo con:** Wave 13.
**Bloquea las siguientes waves:** Ninguna directamente (leaf module en lib/).
**Riesgos:** Ninguno significativo. Modulo pequeno con deps ya disponibles.
**Compatibilidad temporal requerida:** Ninguna.

**Validaciones obligatorias:**
- [ ] `npx tsc --noEmit` — 0 errores en archivos de esta wave
- [ ] Adapters de Anthropic, OpenAI, Google importables

**Criterio de salida:** 16 archivos compilan. AI adapters importables.
**Estado esperado:** Capa de IA disponible.

---

### WAVE 13 — Enterprise Intelligence

**Objetivo:** Dashboards ejecutivos, inteligencia de reposicion, reportes, y modulos de analisis disponibles.

**Modulos incluidos (43 archivos):**

| Modulo | Archivos | Dependencias |
|---|---|---|
| executive-dashboard | 11 | business-*, comercial, commercial-intelligence, production-intelligence, replenishment-intelligence, tenant-rules |
| executive-intelligence | 3 | business-entities, business-reasoning, castillitos, comercial, finance, orders, prisma, sag, sales |
| replenishment-intelligence | 5 | business-signals, comercial, commercial-intelligence, logistics, production-intelligence, tenant-rules |
| inventory | 4 | comercial, commercial-intelligence, prisma, tenant-rules |
| reports | 3 | comercial, prisma |
| collections | 12 | actions, finance, prisma |
| customer360 | 5 | ai, commercial-ledger/comercial, prisma, sales |

**Todos son leaf modules.** Parallelizables entre si.

**Dependencias de entrada:** Wave 8 (domain core) + Wave 10 (castillitos).
**Dependencias de salida:** Disponibles para app/ routes y components/.
**Puede ejecutarse en paralelo con:** Wave 12.
**Bloquea las siguientes waves:** Wave 15 (components/executive necesita executive types).
**Riesgos:** executive-dashboard tiene 11 dependencias — la mayor cantidad del proyecto. Verificar que todas estan disponibles.
**Compatibilidad temporal requerida:** Ninguna.

**Validaciones obligatorias:**
- [ ] `npx tsc --noEmit` — 0 errores en archivos de esta wave
- [ ] executive-dashboard importa correctamente sus 11 dependencias
- [ ] customer360 importa correctamente de ai y sales

**Criterio de salida:** 43 archivos compilan. Todos los modulos de inteligencia importables.
**Estado esperado:** Inteligencia empresarial y reportes disponibles.

---

### WAVE 14 — Shared UI Primitives

**Objetivo:** Shell del OS, primitivas operacionales, y layout components disponibles.

**Modulos incluidos (17 archivos core):**

| Archivo | Dependencias |
|---|---|
| `components/shell/primitives.tsx` | ui/tokens |
| `components/shell/operational-primitives.tsx` | ui/tokens |
| `components/shell/workspace-shell-client.tsx` | ui/tokens, module-nav-config |
| `components/shell/module-nav-config.ts` | tenant/modules |
| `components/workspace/operational-workspace-header.tsx` | ui/tokens |
| `components/workspace/collapsible-section.tsx` | ui/tokens |
| `components/workspace/operational-side-drawer.tsx` | ui/tokens |
| `components/layout/right-ops-rail.tsx` | copilot, ui/tokens |
| `components/layout/copilot-ops-rail.tsx` | copilot, ui/tokens |

**Dependencias de entrada:** Wave 1 (ui/tokens, design-system.css) + Wave 11 (copilot para right-ops-rail).
**Dependencias de salida:** Shell y primitivas disponibles para Wave 15 (domain components) y Wave 16 (app routes).
**Puede ejecutarse en paralelo con:** Ninguna.
**Bloquea las siguientes waves:** Wave 15 (domain components necesitan shell). Wave 16 (app layout necesita shell).
**Riesgos:**
- right-ops-rail y copilot-ops-rail importan de copilot. Verificar que Wave 11 esta completa.
- module-nav-config puede tener imports de modulos no migrados. Verificar.
**Compatibilidad temporal requerida:** Ninguna.

**Validaciones obligatorias:**
- [ ] `npx tsc --noEmit` — 0 errores en archivos de esta wave
- [ ] WorkspaceShellClient renderiza sin errores de tipo
- [ ] OperationalWorkspaceHeader importable
- [ ] right-ops-rail importa correctamente de copilot

**Criterio de salida:** Shell del OS compila. Primitivas importables.
**Estado esperado:** Framework visual del OS disponible.

---

### WAVE 15 — Domain Components

**Objetivo:** Todos los componentes de dominio disponibles para renderizar las paginas del OS.

**Modulos incluidos (~214 archivos):**

| Directorio | Archivos | Dependencias principales |
|---|---|---|
| components/marketing-studio/ | 108 | lib/marketing-studio |
| components/copilot/ | 33 | lib/copilot |
| components/executive/ | 11 | lib/executive-dashboard, lib/executive-intelligence |
| components/agentik/ | 8 | lib/agent-runtime |
| components/operational-map/ | 6 | lib/operational-map |
| components/reconciliation/ | 5 | lib/reconciliation |
| components/finance/ | 5 | lib/finance |
| components/runtime/ | 5 | lib/runtime |
| components/approvals/ | 4 | lib/approvals |
| components/tasks/ | 4 | lib/tasks |
| components/work-executions/ | 4 | lib/work |
| components/comercial/ | 2 | lib/comercial |
| components/operational-intelligence/ | 2 | lib/operational-intelligence |

**Todos paralelizables** entre si mientras sus lib/ dependencias esten en waves anteriores.

**Dependencias de entrada:** Wave 8-13 (domain modules) + Wave 14 (shell primitives).
**Dependencias de salida:** Componentes disponibles para Wave 16 (application routes).
**Puede ejecutarse en paralelo con:** Wave 16 (parcialmente), Wave 17 (parcialmente).
**Bloquea las siguientes waves:** Wave 16 (pages necesitan componentes).
**Riesgos:**
- components/marketing-studio (108 archivos) es el directorio de componentes mas grande. Verificar que todos los imports de lib/marketing-studio resuelven.
**Compatibilidad temporal requerida:** Ninguna.

**Validaciones obligatorias:**
- [ ] `npx tsc --noEmit` — 0 errores en archivos de esta wave
- [ ] Cada directorio de componentes importa correctamente de su lib/ correspondiente
- [ ] 0 imports a modulos no migrados

**Criterio de salida:** ~214 archivos compilan. Todos los componentes importables.
**Estado esperado:** UI completa del OS disponible.

---

### WAVE 16 — Application Routes

**Objetivo:** Todas las paginas del OS disponibles y navegables.

**Modulos incluidos (app/(app)/[orgSlug]/ — 32 subdirectorios):**

| Ruta | Dependencias principales |
|---|---|
| `layout.tsx` | auth, tenant, shell |
| `comercial/` | lib/comercial, components/comercial |
| `finanzas/` | lib/finance, components/finance |
| `produccion/` | lib/production |
| `executive/` | lib/executive-dashboard, components/executive |
| `agentik/` | lib/agent-runtime, lib/copilot, components/agentik |
| `reports/` | lib/reports |
| `pipeline/` | lib/pipeline |
| `integrations/` | lib/integrations |
| `configuracion/` | lib/tenant, lib/auth |
| `copilot/` | lib/copilot, components/copilot |
| `ejecuciones/` | lib/work |
| `aprobaciones/` | lib/approvals |
| `tareas/` | lib/tasks |

**Todas paralelizables** entre si.

**Dependencias de entrada:** Wave 14-15 (components) + Wave 3 (auth, tenant).
**Dependencias de salida:** Paginas disponibles para navegacion.
**Puede ejecutarse en paralelo con:** Wave 17 (API routes).
**Bloquea las siguientes waves:** Ninguna directamente.
**Riesgos:**
- Pages pueden importar de multiples lib/ modules y components/. Verificar que todos existen.
- layout.tsx es critico — si falla, ninguna page renderiza.
**Compatibilidad temporal requerida:** Ninguna.

**Validaciones obligatorias:**
- [ ] `npx tsc --noEmit` — 0 errores en archivos de esta wave
- [ ] layout.tsx compila
- [ ] Cada ruta de primer nivel compila
- [ ] `npx next build` pasa (primera compilacion completa de la app)

**Criterio de salida:** Todas las pages compilan. `npx next build` pasa.
**Estado esperado:** Aplicacion navegable.

---

### WAVE 17 — API Routes

**Objetivo:** Todos los 329 API endpoints disponibles y funcionales.

**Modulos incluidos (329 route.ts files):**

| Dominio | Rutas principales |
|---|---|
| `app/api/orgs/[orgSlug]/comercial/` | maletas, pedidos, clientes, vendedores, inventario, tiendas, control |
| `app/api/orgs/[orgSlug]/reconciliation/` | executions, review, rule-engine |
| `app/api/orgs/[orgSlug]/marketing-studio/` | foto-estudio, shopify, productos, publicaciones, orchestrator |
| `app/api/orgs/[orgSlug]/integrations/` | shopify, google, meta, tiktok |
| `app/api/orgs/[orgSlug]/agent/` | runtime, execution |
| `app/api/orgs/[orgSlug]/branding/` | tenant branding |
| `app/api/orgs/[orgSlug]/executive-intelligence/` | executive brain |
| `app/api/orgs/[orgSlug]/operational-*/` | inventory, intelligence, map |
| `app/api/cron/` | sync jobs |
| `app/api/alerts/` | alert rules |
| `app/api/integrations/` | webhooks (shopify, google, meta, tiktok) |
| `app/api/internal/` | integration tests, workers, orchestrators |
| `app/api/public/` | public endpoints |

**Todas paralelizables** entre si.

**Dependencias de entrada:** Wave 8-13 (lib/ modules).
**Dependencias de salida:** API funcional para frontend.
**Puede ejecutarse en paralelo con:** Wave 15, Wave 16.
**Bloquea las siguientes waves:** Ninguna directamente.
**Riesgos:**
- 329 routes. Alta probabilidad de imports faltantes en rutas individuales.
- `app/api/internal/integration-tests/` contiene tests que importan de multiples modulos. Pueden fallar si los modulos no estan todos presentes.
**Compatibilidad temporal requerida:** `app/api/cron/` puede necesitar correr desde ambos repos durante transicion.

**Validaciones obligatorias:**
- [ ] `npx tsc --noEmit` — 0 errores en archivos de esta wave
- [ ] 329 route.ts files presentes: `find app/api -name "route.ts" \| wc -l` = 329
- [ ] `npx next build` pasa con todas las API routes

**Criterio de salida:** 329 routes compilan. Build completo pasa.
**Estado esperado:** API completa.

---

### WAVE 18 — Application Modules (diferidos)

**Objetivo:** Modulos auxiliares de aplicacion y candidatos a validacion runtime disponibles.

**Modulos incluidos (76 archivos):**

| Modulo | Archivos | Dependencias |
|---|---|---|
| agentik | 13 | actions, alerts, auth, events, knowledge, prisma, runs, scheduled-reports, ui |
| scheduled-reports | 2 | email, notifications, prisma, reports |
| whatsapp | 12 | actions, api, notifications, prisma, tenant |
| oauth | 6 | integrations |
| sync | 2 | connectors, prisma |
| activation | 4 | connectors, prisma |
| control-center | 4 | 0 |
| workspace | 1 | 0 |
| autonomous | 17 | 0 |
| autonomous-operations | 13 | 0 |
| workforce | 2 | 0 |

**Todos paralelizables** entre si.

**Dependencias de entrada:** Wave 4-10 (todas las deps ya disponibles).
**Dependencias de salida:** Ninguna critica. Estos modulos no son consumidos por otros modulos core.
**Puede ejecutarse en paralelo con:** Wave 12-17.
**Bloquea las siguientes waves:** Wave 19 (cleanup requiere que todo este migrado).
**Riesgos:**
- agentik (13 archivos, 9 deps) es el mas complejo de este grupo. Verificar que scheduled-reports esta disponible.
**Compatibilidad temporal requerida:** Ninguna.

**Validaciones obligatorias:**
- [ ] `npx tsc --noEmit` — 0 errores en archivos de esta wave
- [ ] Cada modulo importable desde su barrel
- [ ] 0 imports a modulos no migrados

**Criterio de salida:** 76 archivos compilan. Todos los modulos importables.
**Estado esperado:** Todos los modulos del sistema migrados.

---

### WAVE 19 — Optimization + Cleanup

**Objetivo:** Validacion final, limpieza, y cierre de migracion.

**Tareas:**

| # | Tarea | Criterio |
|---|---|---|
| 19-01 | Ejecutar Runtime Validation Policy (Bootstrap Architecture Seccion 10) sobre 8 candidatos | Cada candidato clasificado como Confirmed Removable o Runtime-Only Consumer |
| 19-02 | Eliminar modulos clasificados como Confirmed Removable | Solo los que pasaron los 6 pasos de validacion |
| 19-03 | Validar TSC baseline final | `npx tsc --noEmit` — documentar numero exacto de errores como baseline de agentik-os |
| 19-04 | Limpiar re-exports redundantes | 0 barrels que re-exportan modulos eliminados |
| 19-05 | Verificar 0 referencias al repo antiguo | `grep -r "ai-landing-page" lib/ app/ components/` = 0 |
| 19-06 | Verificar build completo | `npx next build` pasa |
| 19-07 | Documentar migration report | Markdown con: waves completadas, archivos migrados, errores encontrados, decisiones tomadas |

**Dependencias de entrada:** Wave 18 (todos los modulos migrados).
**Dependencias de salida:** Repositorio agentik-os certificado como funcional.
**Puede ejecutarse en paralelo con:** Ninguna (ultima wave).
**Bloquea las siguientes waves:** Ninguna (fin de migracion).
**Riesgos:**
- Runtime Validation puede descubrir modulos que se creia eliminables pero son consumidos dinamicamente.
**Compatibilidad temporal requerida:** Mantener repo antiguo como archivo hasta que agentik-os este en produccion.

**Validaciones obligatorias:**
- [ ] `npx tsc --noEmit` — baseline documentado
- [ ] `npx next build` — build completo pasa
- [ ] `npx prisma validate` — schema valido
- [ ] 0 referencias a `ai-landing-page`
- [ ] Migration report generado

**Criterio de salida:** Build limpio. Baseline documentado. Migration report completo.
**Estado esperado:** agentik-os listo para produccion.

---

## Migration Dashboard

| Wave | Nombre | Archivos | Estado |
|---|---|---|---|
| Pre | Circular Dependency Resolution | ~61 | NOT STARTED |
| 0 | Toolchain + Configuration | ~10 | NOT STARTED |
| 1 | Design System + Pure Utilities | 16 | NOT STARTED |
| 2 | Prisma + Data Layer | 5 + schema + migrations | NOT STARTED |
| 3 | Tenant + Auth + Core Infrastructure | 16 | NOT STARTED |
| 4 | Infrastructure Services | 200 | NOT STARTED |
| 5 | Foundation Types | 35+ | NOT STARTED |
| 6 | Business Foundation | 24 | NOT STARTED |
| 7 | Business Logic | 103 | NOT STARTED |
| 8a | Finance + Sales + SAG | 139 | NOT STARTED |
| 8b | Commercial Engine | 401 | NOT STARTED |
| 8c | Production | 33 | NOT STARTED |
| 8d | Operational | 31 | NOT STARTED |
| 9 | Agent Stack | 101 | NOT STARTED |
| 10 | Integration + Security Layer | 342 | NOT STARTED |
| 11 | Copilot + Marketing Studio | 1,043 | NOT STARTED |
| 12 | AI Layer | 16 | NOT STARTED |
| 13 | Enterprise Intelligence | 43 | NOT STARTED |
| 14 | Shared UI Primitives | 17 | NOT STARTED |
| 15 | Domain Components | 214 | NOT STARTED |
| 16 | Application Routes | 32 dirs | NOT STARTED |
| 17 | API Routes | 329 routes | NOT STARTED |
| 18 | Application Modules (diferidos) | 76 | NOT STARTED |
| 19 | Optimization + Cleanup | — | NOT STARTED |

### Estados validos

| Estado | Significado |
|---|---|
| NOT STARTED | Wave no iniciada. Dependencias pueden no estar listas. |
| IN PROGRESS | Wave en ejecucion activa. Branch `wave/{N}` existe. |
| BLOCKED | Wave no puede avanzar. Razon documentada. |
| COMPLETED | Wave paso todos los Validation Gates. Mergeada a main. Tag creado. |

### Regla de actualizacion

Durante la migracion, este documento se actualiza **unicamente** cambiando el estado de cada wave en la tabla anterior. No se modifica el contenido tecnico de las waves.

---

## Repository State

| Metrica | Valor | Fuente |
|---|---|---|
| HEAD commit | `1cc25653efc46dc4a8d9d2de6f5cc9af9157b67b` | [A] git rev-parse HEAD |
| Branch | `feat/reconciliation-os` | [A] git branch --show-current |
| Fecha | 2026-07-17 | [A] date |
| Total archivos a migrar | ~2,900+ | [A] suma de waves |
| Total waves | 20 (Pre + 0-19) | [A] Bootstrap Architecture v1.1 |
| Total API routes | 329 | [A] find app/api -name "route.ts" |
| Total Prisma models | 253 | [A] grep "^model " schema.prisma |
| Total Prisma enums | 63 | [A] grep "^enum " schema.prisma |

---

*Fin del playbook. Este documento es el manual operativo oficial para construir agentik-os. Toda secuencia proviene del grafo de dependencias medido en AGENTIK_MODULE_DEPENDENCIES.md y la arquitectura de bootstrap definida en AGENTIK_BOOTSTRAP_ARCHITECTURE.md v1.1. No se modifico ningun archivo de codigo. No se ejecutaron operaciones Git.*
