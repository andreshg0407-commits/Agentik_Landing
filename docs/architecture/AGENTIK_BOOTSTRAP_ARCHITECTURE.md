# AGENTIK BOOTSTRAP ARCHITECTURE

> Secuencia exacta para construir agentik-os desde un repositorio vacio hasta un sistema funcional.
> Sprint: AGENTIK-BOOTSTRAP-ARCHITECTURE-01, AGENTIK-BOOTSTRAP-ARCHITECTURE-02
> Version: v1.1 (FROZEN)
> Fecha: 2026-07-17

### Architectural Notice

Las decisiones de **bootstrap y secuenciacion** se basan en dependencias estaticas verificadas (235 pares medidos sobre 2,684 archivos).

Las decisiones de **eliminacion de modulos** requieren validacion dinamica del runtime y quedan **explicitamente fuera del alcance** de este documento. Ningun modulo se clasifica como "codigo muerto" o "eliminable" sin validacion runtime previa. Los modulos sin imports estaticos detectados se clasifican unicamente como **Candidate for Removal (Pending Runtime Validation)**.
> Referencia: AGENTIK_MODULE_DEPENDENCIES.md, AGENTIK_PROJECT_MANIFEST.md FROZEN v1.0
> Fuente: 235 pares de dependencia medidos sobre 96 modulos (2,684 archivos)
> Restriccion: NO code modification, NO git add, NO git commit, NO git push

---

## 1. Principios de Secuenciacion

1. **Ninguna wave puede importar codigo de una wave posterior.**
   Si el modulo A depende de B, B debe estar en una wave anterior o en la misma wave (co-deploy).

2. **Las dependencias circulares se resuelven por co-deploy, no por hack.**
   Modulos con imports mutuos se migran juntos en la misma wave, con un contrato de tipos extraido primero.

3. **Los modulos sin imports estaticos detectados son candidatos a revision, no a eliminacion automatica.**
   Se clasifican como Candidate for Removal (Pending Runtime Validation). La eliminacion definitiva requiere validacion del runtime (ver Seccion 3a y Seccion 10).

4. **"type-only" circulares se resuelven con `import type` + paquete de tipos compartido.**
   Si ambas direcciones son `import type`, el ciclo se rompe extrayendo las interfaces a un archivo comun.

5. **El grafo medido manda.** No se inventan dependencias. No se asumen.

---

## 2. Pre-Migration: Circular Dependency Resolution

Antes de la Wave 0, estos 16 ciclos deben resolverse con una estrategia definida.

### Cluster A — Agent Stack (4 ciclos mutuos)

| Par | A→B | B→A | Resolucion |
|---|---|---|---|
| agent-memory ↔ agent-runtime | 2 type / 2 total | 1 type / 2 total | **Extraer `agent-types.ts`** con ActionEnvelope, AgentRuntimeId, AgentDomain, RuntimeMemoryNode. Ambos importan de ahi. |
| agent-orchestration ↔ agent-runtime | 2 type / 6 total | 3 type / 4 total | **Extraer `agent-contracts.ts`** con AgentDelegation, OperationalPlan. Runtime-only imports quedan en un barrel compartido. |
| agent-planning ↔ agent-runtime | 4 type / 4 total | 1 type / 3 total | planning→runtime es 100% type-only. **Mover tipos a `agent-contracts.ts`**. |
| agent-runtime ↔ comercial | 0 type / 1 total | 1 type / 1 total | comercial→runtime importa ToolHandlerContext (type). runtime→comercial importa 1 handler. **Invertir: comercial registra su handler via registry pattern, runtime no importa comercial.** |

**Pre-migration task:** Crear `lib/agent-contracts/` con tipos compartidos. Refactorizar los 4 ciclos. Costo: ~15 archivos.

### Cluster B — Commercial Core (4 ciclos mutuos)

| Par | A→B | B→A | Resolucion |
|---|---|---|---|
| business-entities ↔ comercial | 1 type / 1 total | 1 type / 2 total | Casi todo type. **Extraer interfaces compartidas a `business-entities/core-types.ts`.** comercial deja de importar de business-entities directamente para tipos basicos. |
| comercial ↔ commercial-intelligence | 2 type / 5 total | 0 type / 2 total | comercial importa loaders + engine de c-i. c-i importa utilidades de comercial. **Extraer tipos compartidos a `commercial-types.ts`. Mover inferProductType y LINE_TO_SUBLINEA a un archivo de utilidades comerciales neutro.** |
| comercial ↔ connectors | tipo mixto | tipo mixto | comercial importa SAG client. connectors importa filtros comerciales. **Extraer `connector-types.ts` y `commercial-filters.ts` como archivos compartidos. consultaSagJson queda en connectors; isCommercialArticle queda en comercial; ambos accesibles sin ciclo.** |
| comercial ↔ operational-inventory | tipo mixto | tipo mixto | **Extraer `operational-types.ts`** con OperationalInventoryItem, SagInventoryItem, VendorBagItem. Ambos importan de ahi. |

**Pre-migration task:** Crear `lib/commercial-types/` como paquete de tipos neutro. Costo: ~10 archivos.

### Cluster C — Integration Layer (4 ciclos mutuos)

| Par | A→B | B→A | Resolucion |
|---|---|---|---|
| connectors ↔ integrations | tipo mixto | re-export | integrations→connectors es un re-export barrel. **Consolidar: CRM adapter vive en connectors, integrations solo re-exporta.** |
| connectors ↔ sag | runtime | runtime | sag→connectors importa getPyaConfig. connectors→sag importa logger + rules. **Extraer `pya-client/` como modulo independiente. sag y connectors importan de ahi.** |
| integrations ↔ marketing-studio | tipo mixto | runtime | **Extraer `shopify-types.ts`** con ProductConsoleItem. marketing-studio y integrations importan de ahi. |
| sag ↔ sales | runtime | runtime | sag importa source-dedup de sales. sales importa source-semantics de sag. **Extraer `source-types.ts`** con SagSourceType, SagDocumentFamilyMap. |

**Pre-migration task:** Crear `lib/pya-client/` y `lib/source-types/`. Costo: ~8 archivos.

### Cluster D — Platform (4 ciclos mutuos)

| Par | A→B | B→A | Resolucion |
|---|---|---|---|
| copilot ↔ security | runtime (11) | runtime (7) | security→copilot importa 3 encryption adapters. **Invertir: copilot registra sus adapters via encryption adapter registry. security no importa copilot.** |
| copilot ↔ marketing-studio | runtime | runtime (3 type / 4 total) | marketing-studio→copilot es casi todo type. **Extraer `runtime-types.ts`** con ExecutionContext, RuntimeStepSpec. Copilot y m-s importan de ahi. |
| finance ↔ financial | runtime | runtime | financial es wrapper legacy. **Merge: financial se absorbe en finance.** Un solo modulo, sin ciclo. |
| operational-data ↔ operational-inventory | tipo mixto | runtime | **Extraer `operational-entity-types.ts`.** Ambos importan de ahi. |

**Pre-migration task:** Merge finance+financial. Registry pattern para security→copilot. Costo: ~20 archivos.

### Resumen Pre-Migration

| Tarea | Modulos afectados | Archivos estimados | Prioridad |
|---|---|---|---|
| Crear `agent-contracts/` | 5 (agent-*) | ~15 | P1 — bloquea Wave 9 |
| Crear `commercial-types/` | 4 (comercial cluster) | ~10 | P1 — bloquea Wave 7 |
| Crear `pya-client/` + `source-types/` | 4 (integration cluster) | ~8 | P2 — bloquea Wave 8 |
| Merge finance+financial | 2 | ~20 | P1 — bloquea Wave 7 |
| Registry pattern security→copilot | 2 | ~5 | P2 — bloquea Wave 10 |
| Extraer runtime-types copilot↔m-s | 2 | ~3 | P2 — bloquea Wave 10 |

---

## 3. Modules NOT to Copy

### 3a. Candidate for Removal (Pending Runtime Validation)

Estos modulos tienen 0 imports estaticos detectados en lib/, app/ y components/.
Sin embargo, **no pueden clasificarse como codigo muerto** unicamente con analisis estatico.
La eliminacion definitiva requiere validacion del runtime (ver Seccion 10).

| Modulo | Files | Static lib consumers | Static app/comp consumers | Clasificacion |
|---|---|---|---|---|
| decisions | 12 | 0 | 0 | Candidate for Removal (Pending Runtime Validation) |
| business-flow | 12 | 0 | 0 | Candidate for Removal (Pending Runtime Validation) |
| business-knowledge | 11 | 0 | 0 | Candidate for Removal (Pending Runtime Validation) |
| business-structure | 4 | 0 | 0 | Candidate for Removal (Pending Runtime Validation) |
| i18n | 1 | 0 | 0 | Candidate for Removal (Pending Runtime Validation) |
| intelligence | 11 | 0 | 0 | Candidate for Removal (Pending Runtime Validation) |
| idempotency | 5 | 0 | 0 | Candidate for Removal (Pending Runtime Validation) |
| customers | 1 | 0 | 0 | Candidate for Removal (Pending Runtime Validation) |

**Total candidatos: 8 modulos, 57 archivos. Pendiente validacion runtime antes de eliminar.**

### 3b. Defer to Final Phase (bajo valor, pocos consumidores)

| Modulo | Files | Razon para diferir |
|---|---|---|
| autonomous | 17 | Solo 2 app/ consumers. No critico para produccion. |
| autonomous-operations | 13 | Solo 1 app/ consumer. Complemento de autonomous. |
| workforce | 2 | Solo 1 app/ consumer. |

### 3c. Merge Before Copy

| Modulo | Se absorbe en | Razon |
|---|---|---|
| financial | finance | Dependencia circular mutua. financial es un wrapper legacy de finance. |
| commercial-ledger | comercial | Solo 1 consumidor (customer360), 1 dep (prisma). |
| approval | execution | 1 archivo, depende solo de execution. |

---

## 4. The Build Sequence

```
WAVE 0 — Toolchain + Configuration
  package.json (dependencies only — no code)
  tsconfig.json
  next.config.mjs
  .env.example
  tailwind.config.ts
  postcss.config.mjs
  eslint config

  Resultado: `npm install` compila. `npx tsc --noEmit` corre (con 0 archivos).
  Parallelizable: todo en esta wave es independiente.

────────────────────────────────────────────────────

WAVE 1 — Design System + Pure Utilities
  app/design-system.css
  app/globals.css
  lib/ui/tokens.ts
  lib/ui/surfaces.ts
  lib/ui/op-table.ts
  lib/utils/
  lib/email/
  lib/idempotency/
  lib/observability/
  lib/runtime/

  Resultado: tokens, CSS variables, y utilidades puras disponibles.
  Parallelizable: todos los modulos son independientes entre si.
  Dependencias: WAVE 0 (solo toolchain)

────────────────────────────────────────────────────

WAVE 2 — Prisma + Data Layer
  prisma/schema.prisma (253 modelos, 63 enums)
  prisma/migrations/ (todas)
  prisma/seed.ts
  lib/prisma.ts
  lib/ensure-main-project.ts

  Resultado: `npx prisma generate` funciona. DB client disponible.
  Parallelizable: NO — schema debe estar completo antes de generate.
  Dependencias: WAVE 0

────────────────────────────────────────────────────

WAVE 3 — Tenant + Auth + Core Infrastructure
  lib/tenant/
  lib/auth/
  lib/tenant/modules.ts
  lib/tenant/branding.ts
  lib/bootstrap/ (ensure-main-project, prisma, tenant)
  middleware.ts

  Resultado: multi-tenancy funcional. Auth disponible.
  Serie obligatoria: tenant → auth → bootstrap (cadena lineal).
  Dependencias: WAVE 2 (prisma, tenant)

────────────────────────────────────────────────────

WAVE 4 — Infrastructure Services
  lib/tasks/             (prisma)
  lib/approvals/         (prisma)
  lib/events/            (prisma)
  lib/runs/              (prisma)
  lib/orders/            (prisma)
  lib/notifications/     (prisma)
  lib/knowledge/         (prisma)
  lib/documents/         (prisma)
  lib/customers/         (prisma)
  lib/pipeline/          (prisma)
  lib/operational-map/   (prisma)
  lib/reconciliation/    (prisma)
  lib/dashboard/         (prisma)
  lib/ai-billing/        (prisma)
  lib/execution/         (prisma)
  lib/actions/           (auth, prisma)
  lib/api/               (auth, prisma)
  lib/work/              (prisma, tasks)

  Resultado: todos los servicios de infraestructura disponibles.
  Parallelizable: todos excepto work (depende de tasks) y actions/api (dependen de auth).
  Dependencias: WAVE 2 (prisma) + WAVE 3 (auth)

────────────────────────────────────────────────────

WAVE 5 — Foundation Types (pre-requisito para business logic)
  lib/logistics/            (0 deps)
  lib/production-events/    (0 deps)
  lib/ai-pricing/           (0 deps)
  lib/ai/                   (0 deps)
  lib/agentik-agents/       (0 deps)
  lib/business-engine/      (0 deps)
  lib/commercial-types/     (NUEVO — tipos extraidos de ciclos comerciales)
  lib/source-types/         (NUEVO — tipos extraidos de sag↔sales)
  lib/agent-contracts/      (NUEVO — tipos extraidos de agent stack)
  lib/pya-client/           (NUEVO — extraido de connectors↔sag)

  Resultado: todos los tipos y contratos compartidos disponibles.
  Parallelizable: todos son independientes.
  Dependencias: WAVE 0 (solo types, no runtime)
  Nota: Los 4 paquetes NUEVOS deben crearse antes de esta wave (ver Seccion 2).

────────────────────────────────────────────────────

WAVE 6 — Business Foundation
  lib/business-entities/   (comercial → resuelto via commercial-types)
  lib/business-signals/    (business-entities)

  Resultado: modelo de entidades y senales disponible.
  Serie obligatoria: business-entities → business-signals.
  Dependencias: WAVE 5 (commercial-types)

  Nota: business-entities ya no depende de comercial directamente.
  La dependencia circular se rompio en Wave 5 (commercial-types/).

────────────────────────────────────────────────────

WAVE 7 — Business Logic
  lib/business-events/     (business-entities, business-signals)
  lib/business-rules/      (business-entities, business-events, business-signals)
  lib/business-reasoning/  (business-entities)
  lib/business-planning/   (business-entities, business-events, business-rules, business-signals)
  lib/business-decisions/  (business-entities, business-events, business-planning, business-rules, business-signals)
  lib/business-actions/    (business-decisions, business-entities, business-events, business-planning, business-signals)
  lib/tenant-rules/        (commercial-intelligence → diferido, usa commercial-types por ahora)

  Resultado: motor de reglas de negocio completo.
  Serie parcial: events+rules+reasoning (paralelo) → planning → decisions → actions.
  Dependencias: WAVE 6 (business-entities, business-signals)

────────────────────────────────────────────────────

WAVE 8 — Domain Core (co-deploy de ciclos comerciales)

  SUB-WAVE 8a — Finance + Sales + SAG
    lib/finance/           (documents, prisma, sag, utils — financial MERGED)
    lib/sag/               (pya-client, prisma, sales → co-deploy)
    lib/sales/             (finance, prisma, sag → co-deploy)
    lib/alerts/            (finance, prisma)

    Co-deploy obligatorio: sag ↔ sales (ambos runtime deps).
    Serie: finance primero (sin dep en sag real, solo source-types).
    Luego sag+sales co-deploy.

  SUB-WAVE 8b — Commercial Engine
    lib/commercial-intelligence/  (business-signals, comercial → co-deploy, prisma)
    lib/comercial/                (14 deps — todas resueltas en waves 2-8a + commercial-types)
    lib/connectors/               (comercial, pya-client, logistics, prisma, production*, sag, sales)

    Co-deploy obligatorio: comercial ↔ commercial-intelligence (runtime deps).
    connectors puede ir despues de comercial (dep unidireccional tras refactor).

  SUB-WAVE 8c — Production
    lib/production-timeline/      (prisma, production-events)
    lib/production-intelligence/  (business-signals, comercial, commercial-intelligence, prisma, tenant-rules)
    lib/production-control/       (prisma, production-intelligence)
    lib/production-stages/        (production-events, production-timeline)
    lib/production/               (prisma, production-control, production-events, production-stages, production-timeline)

    Serie obligatoria: timeline → intelligence → control → stages → production.
    Sin circulares. Migracion limpia.

  SUB-WAVE 8d — Operational
    lib/operational-inventory/    (comercial, operational-entity-types, prisma)
    lib/operational-data/         (comercial, operational-inventory → co-deploy, prisma)
    lib/operational-intelligence/ (comercial, operational-data, operational-inventory, prisma)

    Co-deploy obligatorio: operational-inventory ↔ operational-data.
    operational-intelligence va despues.

  Resultado: todo el dominio comercial, financiero, produccion y operacional disponible.
  Dependencias: WAVE 2-7

────────────────────────────────────────────────────

WAVE 9 — Agent Stack
  lib/agent-runtime/       (agent-contracts, comercial, prisma)
  lib/agent-memory/        (agent-contracts)
  lib/agent-intelligence/  (agent-contracts, agent-memory, agent-runtime)
  lib/agent-orchestration/ (agent-contracts, agent-intelligence, agent-memory, agent-runtime)
  lib/agent-planning/      (agent-contracts, agent-intelligence, agent-memory, agent-orchestration, agent-runtime)
  lib/agents/              (approvals, sales, tasks, work)

  Resultado: runtime de agentes funcional.
  Co-deploy: agent-runtime + agent-memory (mutual deps resueltas via agent-contracts).
  Serie: runtime+memory → intelligence → orchestration → planning.
  agents va ultimo (depende de sales, work).
  Dependencias: WAVE 4 (approvals, tasks, work) + WAVE 5 (agent-contracts) + WAVE 8 (comercial, sales)

────────────────────────────────────────────────────

WAVE 10 — Integration + Security Layer
  lib/security/            (prisma — copilot dep eliminada via registry pattern)
  lib/integrations/        (comercial, connectors, prisma, security — marketing-studio dep resuelto via shopify-types)
  lib/castillitos/         (finance, prisma, sag)

  Resultado: capa de seguridad + integraciones externas disponibles.
  Parallelizable: security, integrations, castillitos son independientes entre si tras refactor.
  Dependencias: WAVE 8 (comercial, connectors, finance, sag)

────────────────────────────────────────────────────

WAVE 11 — Copilot + Marketing Studio
  lib/copilot/             (agentik-agents, agents, approvals, comercial, finance, prisma, security, tasks, work)
    744 archivos — el modulo mas grande del sistema.
    37 subdirectorios internos.
    Incluye: memory-graph, cross-module-reasoning, learning, strategic-*, executive-*, board-intelligence.

  lib/marketing-studio/    (execution, integrations, prisma, security, ui — copilot dep resuelto via runtime-types)
    299 archivos.
    Incluye: commerce/shopify, social, video-editor, orchestration, publishing.

  Resultado: inteligencia empresarial + marketing studio disponibles.
  Co-deploy: copilot + marketing-studio (deps mutuas resueltas pero runtime coupling alto).
  Dependencias: WAVE 9 (agents, agent-runtime) + WAVE 10 (security, integrations)

────────────────────────────────────────────────────

WAVE 12 — AI Layer
  lib/ai-layer/            (ai-billing, ai-pricing, security)
  lib/ai-billing/          (prisma — ya migrado en Wave 4 pero ubicado aqui por coherencia)

  Resultado: capa de IA (Anthropic, OpenAI, Google adapters) funcional.
  Dependencias: WAVE 10 (security) + WAVE 4 (ai-billing ya disponible)

────────────────────────────────────────────────────

WAVE 13 — Enterprise Intelligence
  lib/executive-dashboard/         (11 deps — business-*, comercial, commercial-intelligence, production-intelligence, replenishment-intelligence, tenant-rules)
  lib/executive-intelligence/      (9 deps — business-entities, business-reasoning, castillitos, comercial, finance, orders, prisma, sag, sales)
  lib/replenishment-intelligence/  (business-signals, comercial, commercial-intelligence, logistics, production-intelligence, tenant-rules)
  lib/inventory/                   (comercial, commercial-intelligence, prisma, tenant-rules)
  lib/reports/                     (comercial, prisma)
  lib/collections/                 (actions, finance, prisma)
  lib/customer360/                 (ai, commercial-ledger/comercial, prisma, sales)

  Resultado: dashboards ejecutivos, inteligencia de reposicion, reportes disponibles.
  Parallelizable: todos son leaf modules, no se dependen entre si.
  Dependencias: WAVE 8 (domain core)

────────────────────────────────────────────────────

WAVE 14 — Shared UI Primitives
  components/shell/primitives.tsx
  components/shell/operational-primitives.tsx
  components/shell/workspace-shell-client.tsx
  components/shell/module-nav-config.ts
  components/workspace/operational-workspace-header.tsx
  components/workspace/collapsible-section.tsx
  components/workspace/operational-side-drawer.tsx
  components/layout/right-ops-rail.tsx
  components/layout/copilot-ops-rail.tsx
  components/ui/ (si existe)

  Resultado: shell del OS + primitivas operacionales disponibles.
  Dependencias: WAVE 1 (design system) + WAVE 11 (copilot — para right-ops-rail)

────────────────────────────────────────────────────

WAVE 15 — Domain Components
  components/comercial/          (comercial types + ui)
  components/marketing-studio/   (230 imports de lib/marketing-studio)
  components/copilot/            (127 imports de lib/copilot)
  components/reconciliation/     (reconciliation types + ui)
  components/finance/            (finance types + ui)
  components/operational-map/    (operational-map types + ui)
  components/operational-intelligence/ (operational-intelligence types + ui)
  components/agentik/            (agent-runtime types + ui)
  components/approvals/          (approvals types + ui)
  components/tasks/              (tasks types + ui)
  components/work-executions/    (work types + ui)
  components/runtime/            (runtime types + ui)
  components/executive/          (executive types + ui)

  Resultado: todos los componentes de dominio disponibles.
  Parallelizable: todos, mientras sus lib/ dependencias esten en waves anteriores.
  Dependencias: WAVE 8-13 (domain modules) + WAVE 14 (shell)

────────────────────────────────────────────────────

WAVE 16 — Application Routes
  app/(app)/[orgSlug]/layout.tsx
  app/(app)/[orgSlug]/comercial/     (112 app/ imports de comercial)
  app/(app)/[orgSlug]/finanzas/      (59 imports de finance)
  app/(app)/[orgSlug]/produccion/
  app/(app)/[orgSlug]/executive/
  app/(app)/[orgSlug]/agentik/       (agent-runtime, copilot)
  app/(app)/[orgSlug]/reports/
  app/(app)/[orgSlug]/pipeline/
  app/(app)/[orgSlug]/integrations/
  app/(app)/[orgSlug]/configuracion/
  app/(app)/[orgSlug]/copilot/
  app/(app)/[orgSlug]/ejecuciones/
  app/(app)/[orgSlug]/aprobaciones/
  app/(app)/[orgSlug]/tareas/

  Resultado: todas las paginas del OS disponibles.
  Parallelizable: paginas independientes entre si.
  Dependencias: WAVE 14-15 (components) + WAVE 3 (auth, tenant)

────────────────────────────────────────────────────

WAVE 17 — API Routes
  app/api/orgs/[orgSlug]/comercial/    (maletas, pedidos, clientes, vendedores, inventario, tiendas, control)
  app/api/orgs/[orgSlug]/reconciliation/
  app/api/orgs/[orgSlug]/marketing-studio/
  app/api/orgs/[orgSlug]/integrations/
  app/api/orgs/[orgSlug]/agent/
  app/api/orgs/[orgSlug]/branding/
  app/api/orgs/[orgSlug]/executive-intelligence/
  app/api/orgs/[orgSlug]/operational-intelligence/
  app/api/orgs/[orgSlug]/operational-inventory/
  app/api/orgs/[orgSlug]/operational-map/
  app/api/cron/
  app/api/alerts/
  app/api/integrations/ (shopify, google, meta, tiktok webhooks)
  app/api/internal/      (integration tests, workers, orchestrators)
  app/api/public/

  Resultado: 329 API routes funcionales.
  Parallelizable: routes independientes entre si.
  Dependencias: WAVE 8-13 (lib/ modules que importan)

────────────────────────────────────────────────────

WAVE 18 — Application Modules (diferidos)
  lib/agentik/              (9 deps — actions, alerts, auth, events, knowledge, prisma, runs, scheduled-reports, ui)
  lib/scheduled-reports/    (email, notifications, prisma, reports)
  lib/whatsapp/             (actions, api, notifications, prisma, tenant)
  lib/oauth/                (integrations)
  lib/sync/                 (connectors, prisma)
  lib/activation/           (connectors, prisma)
  lib/control-center/       (0 deps)
  lib/workspace/            (0 deps)
  lib/autonomous/           (0 deps)
  lib/autonomous-operations/ (0 deps)
  lib/workforce/            (0 deps)

  Resultado: modulos de aplicacion auxiliares disponibles.
  Parallelizable: todos.
  Dependencias: WAVE 4-10 (sus deps ya estan disponibles)
  Nota: estos pueden migrarse en cualquier momento despues de sus deps.

────────────────────────────────────────────────────

WAVE 19 — Optimization + Cleanup
  Ejecutar Runtime Validation Policy (Seccion 10) sobre 8 candidatos a eliminacion (Seccion 3a)
  Eliminar unicamente los modulos que pasen validacion runtime
  Validar TSC baseline en agentik-os
  Limpiar re-exports redundantes
  Verificar que 0 imports apuntan al repo viejo
```

---

## 5. Parallelism Map

### Que puede migrarse en paralelo

| Wave | Modulos paralelos | Razon |
|---|---|---|
| 1 | ui, utils, email, idempotency, observability, runtime | 0 deps entre si |
| 4 | tasks, approvals, events, runs, orders, notifications, knowledge, documents, customers, pipeline, operational-map, reconciliation, dashboard, ai-billing, execution | Solo dependen de prisma (Wave 2) |
| 5 | logistics, production-events, ai-pricing, ai, agentik-agents, business-engine, commercial-types, source-types, agent-contracts, pya-client | 0 deps entre si |
| 7 | business-events, business-rules, business-reasoning | Solo dependen de Wave 6 |
| 8c | production-timeline, production-intelligence, production-control, production-stages, production | Cadena lineal pero sin circulares |
| 13 | executive-dashboard, executive-intelligence, replenishment-intelligence, inventory, reports, collections, customer360 | Todos son leaf modules |
| 15 | Todos los directorios de components/ | Independientes entre si |
| 16 | Todas las rutas de app/(app)/ | Independientes entre si |
| 17 | Todas las rutas de app/api/ | Independientes entre si |

### Que DEBE migrarse en serie

| Secuencia | Razon |
|---|---|
| Wave 2 → Wave 3 | tenant depende de prisma. auth depende de tenant. |
| Wave 6 → Wave 7 | business-signals depende de business-entities. business-logic depende de ambos. |
| Wave 8a → Wave 8b → Wave 8c → Wave 8d | comercial depende de sag+sales. production depende de comercial. operational depende de comercial. |
| Wave 8 → Wave 9 | agent-runtime depende de comercial. |
| Wave 9 → Wave 10 → Wave 11 | copilot depende de agents + security. marketing-studio depende de integrations + security + copilot. |
| Wave 14 → Wave 15 → Wave 16 | Componentes dependen de shell. Paginas dependen de componentes. |

---

## 6. Modules Requiring Temporary Compatibility

Durante la migracion, estos modulos necesitan existir en ambos repos temporalmente.

| Modulo | Razon | Duracion |
|---|---|---|
| prisma | Modelo de datos compartido. Ambos repos apuntan a la misma DB durante transicion. | Hasta que el repo viejo se archive. |
| auth | Sesiones de usuario compartidas. | Hasta corte de trafico. |
| tenant | Datos de organizacion compartidos. | Hasta corte de trafico. |
| connectors (SAG adapter) | Sync jobs pueden correr desde cualquiera de los dos repos. | Hasta que cron se migre. |

---

## 7. Migration Metrics

| Metrica | Valor |
|---|---|
| Total waves | 19 (0-18 + cleanup) |
| Modulos a migrar | 88-96 (8 candidatos a eliminacion pendiente validacion runtime) |
| Modulos nuevos (pre-migration) | 4-6 (tipos extraidos de circulares) |
| Modulos a merge | 3 (financial→finance, commercial-ledger→comercial, approval→execution) |
| Candidatos a eliminacion (pending runtime validation) | 8 (decisions, business-flow, business-knowledge, business-structure, i18n, intelligence, idempotency, customers) |
| Archivos candidatos a eliminacion | ~57 (pendiente validacion runtime) |
| Dependencias circulares a resolver pre-migration | 16 |
| Co-deploys obligatorios | 5 (sag+sales, comercial+commercial-intelligence, operational-data+operational-inventory, copilot+marketing-studio, agent-runtime+agent-memory) |
| Modulos que pueden esperar al final | 11 (Wave 18) |
| Modulos bootstrap obligatorio (Wave 0-3) | ~12 (toolchain + prisma + tenant + auth + bootstrap) |
| Critical path length | Wave 0 → 2 → 3 → 6 → 7 → 8b → 9 → 10 → 11 = 9 serial gates |

---

## 8. Critical Path

La ruta mas larga que no se puede paralelizar:

```
Wave 0: Toolchain
  ↓
Wave 2: Prisma
  ↓
Wave 3: Tenant → Auth
  ↓
Wave 5: commercial-types (pre-requisito para romper circular)
  ↓
Wave 6: business-entities → business-signals
  ↓
Wave 7: business-events → business-planning → business-decisions → business-actions
  ↓
Wave 8a: finance → sag+sales (co-deploy)
  ↓
Wave 8b: comercial+commercial-intelligence (co-deploy) → connectors
  ↓
Wave 9: agent-runtime+agent-memory → agent-intelligence → agent-orchestration → agent-planning → agents
  ↓
Wave 10: security → integrations
  ↓
Wave 11: copilot + marketing-studio (co-deploy)
  ↓
Wave 14: Shell + UI primitives
  ↓
Wave 15: Domain components
  ↓
Wave 16: Application routes

Critical path: 15 serial steps.
```

Todo lo que no esta en este camino se puede paralelizar con el.

---

## 9. Decision Log

| # | Decision | Rationale |
|---|---|---|
| D-01 | 8 modulos clasificados como Candidate for Removal (Pending Runtime Validation) | 57 archivos sin imports estaticos detectados. La eliminacion definitiva requiere validacion runtime (Seccion 10). El repo viejo queda como archivo de respaldo. |
| D-02 | Merge financial → finance | Ciclo mutuo runtime. financial es wrapper legacy. 1 modulo es mas simple que 2 con ciclo. |
| D-03 | Crear 4-6 paquetes de tipos compartidos pre-migration | Romper circulares antes de migrar es mas limpio que copiar circulares y arreglar despues. |
| D-04 | copilot (744 files) se migra como unidad atomica | Sus 37 subdirectorios tienen acoplamiento interno alto. Dividirlo requiere un sprint propio. |
| D-05 | marketing-studio (299 files) se migra como unidad atomica | Similar a copilot. Acoplamiento interno alto. |
| D-06 | Wave 18 (modulos auxiliares) puede ejecutarse en cualquier orden | Ninguno es consumido por modulos criticos. Solo aportan funcionalidad periferica. |
| D-07 | security no debe depender de copilot en agentik-os | La dependencia actual es un smell arquitectonico. El registry pattern la invierte correctamente. |
| D-08 | Prisma schema se copia completo, no incremental | 253 modelos + 63 enums son una unidad atomica. Migrar parcialmente crea inconsistencias. |

---

## 10. Runtime Validation Policy

Un modulo **NO puede considerarse eliminable** unicamente porque tenga cero imports estaticos.

El analisis estatico (`grep` de `from "@/lib/"`) solo detecta dependencias explicitas en tiempo de compilacion. Existen mecanismos de consumo que no generan imports estaticos y que este documento no puede verificar:

| Mecanismo | Descripcion | Ejemplo |
|---|---|---|
| Registries | Modulos que se registran en un catalogo central al arrancar | `registerAgent("decisions", DecisionsAgent)` |
| Dynamic loading | Imports condicionales o `await import()` en runtime | `const mod = await import(\`@/lib/${name}\`)` |
| Factories | Funciones que instancian modulos por nombre | `createEngine(config.engineType)` |
| Dependency injection | Contenedores IoC que resuelven modulos sin import directo | `container.resolve("idempotency")` |
| Runtime discovery | Sistemas que escanean directorios o convenciones de nombres | `fs.readdirSync("lib/").filter(...)` |
| Plugin registration | Modulos que se autoregistran via side-effect imports | `import "@/lib/decisions/register"` |
| AI runtime | El runtime de agentes puede invocar modulos por capacidad | `agent.use("business-knowledge")` |
| Execution graph | Grafos de ejecucion que referencian modulos como nodos | `graph.addNode({ module: "intelligence" })` |
| String-based resolution | Resolucion de modulos mediante strings en configuracion | `{ module: "customers", action: "lookup" }` |
| Configuration-driven loading | Archivos de configuracion que listan modulos activos | `modules: ["i18n", "idempotency"]` |

### Proceso de validacion

Para que un modulo pase de **Candidate for Removal** a **Confirmed Removable**, se debe ejecutar:

1. **Busqueda de string references**: Buscar el nombre del modulo como string literal en todo el codebase (no solo como import path).
2. **Analisis de registries**: Verificar todos los archivos `*-registry.ts`, `*-catalog.ts`, `register*.ts` por referencias.
3. **Analisis de dynamic imports**: Buscar `import(` y `require(` con variables o template literals.
4. **Analisis de configuracion**: Revisar archivos `.env`, `*.config.*`, seed data, y Prisma seed por referencias.
5. **Analisis del execution graph**: Si el sistema tiene grafos de ejecucion (agent-runtime, copilot, n8n), verificar nodos que referencien el modulo.
6. **Test de eliminacion**: Eliminar temporalmente el modulo y ejecutar `npx tsc --noEmit` + test suite completa.

Solo despues de los 6 pasos, con resultado negativo en todos, el modulo puede reclasificarse como **Confirmed Removable**.

### Clasificaciones validas

| Clasificacion | Significado |
|---|---|
| **Candidate for Removal (Pending Runtime Validation)** | 0 imports estaticos detectados. No se ha ejecutado validacion runtime. NO eliminar. |
| **Confirmed Removable** | Validacion runtime completada. 0 referencias dinamicas encontradas. Seguro eliminar. |
| **Runtime-Only Consumer** | 0 imports estaticos pero consumido via mecanismos dinamicos. NO eliminar. |

---

## Revision Log

| Version | Fecha | Sprint | Cambio |
|---|---|---|---|
| v1.0 | 2026-07-17 | AGENTIK-BOOTSTRAP-ARCHITECTURE-01 | Documento inicial. 19 waves, 235 deps, 16 circulares, 8 modulos marcados como "codigo muerto". |
| v1.1 | 2026-07-17 | AGENTIK-BOOTSTRAP-ARCHITECTURE-02 | Reclasificacion: "Dead Code"/"Codigo muerto"/"Eliminar" reemplazado por "Candidate for Removal (Pending Runtime Validation)". Nueva Seccion 10 (Runtime Validation Policy). Architectural Notice agregado. Ninguna wave, co-deploy, critical path, ni dependencia modificada. |

---

## Repository State

| Metrica | Valor | Fuente |
|---|---|---|
| HEAD commit | `1cc25653efc46dc4a8d9d2de6f5cc9af9157b67b` | [A] `git rev-parse HEAD` |
| Branch | `feat/reconciliation-os` | [A] `git branch --show-current` |
| Fecha | 2026-07-17 | [A] `date` |
| Fuente de dependencias | 235 pares medidos | [A] AGENTIK_MODULE_DEPENDENCIES.md |
| Dependencias circulares analizadas | 16 pares, 32 direcciones | [A] grep bidireccional + analisis type vs runtime |

---

*Fin del documento. Toda secuencia proviene del grafo de dependencias medido. Las decisiones de eliminacion quedan sujetas a validacion runtime (Seccion 10). No se modifico ningun archivo de codigo. No se ejecutaron operaciones Git.*
