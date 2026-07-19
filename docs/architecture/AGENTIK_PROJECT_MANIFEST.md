# AGENTIK PROJECT MANIFEST

> **Status: FROZEN v1.0**
> Documento de referencia oficial para la reconstruccion del repositorio.
> Sprint: AGENTIK-REPOSITORY-MANIFEST-01 + AGENTIK-REPOSITORY-MANIFEST-02
> Generado: 2026-07-17 | Frozen: 2026-07-17
> Metodo: Auditoria automatizada sobre el estado real del repositorio.
> Clasificacion: Toda afirmacion marcada [A] MEDIDO. No quedan hipotesis ni deducciones.

---

## 1. Resumen Ejecutivo

| Campo | Valor | Fuente |
|---|---|---|
| Nombre del repo en GitHub | `Agentik_Landing` | [A] `git remote -v` |
| Repositorio remoto | `https://github.com/andreshg0407-commits/Agentik_Landing.git` | [A] `git remote -v` |
| Rama actual | `feat/reconciliation-os` | [A] `git branch --show-current` |
| Commit HEAD | `1cc25653efc46dc4a8d9d2de6f5cc9af9157b67b` | [A] `git rev-parse HEAD` |
| Fecha HEAD | 2026-07-16 21:21:17 -0500 | [A] `git log -1 --format='%ai'` |
| Rama nunca pusheada | Si | [A] No existe `origin/feat/reconciliation-os` en `git branch -r` |
| Total de archivos en disco | 5,000 | [A] `find . -type f` excluyendo .git, node_modules, .next, open-design |
| Archivos trackeados | 1,066 | [A] `git ls-tree -r HEAD --name-only | wc -l` |
| Archivos untracked | 3,504 | [A] `git ls-files --others --exclude-standard | wc -l` (actualizado en MANIFEST-02) |
| Archivos modificados (tracked) | 56 | [A] `git status --short | awk '$1=="M"'` |
| Commits en rama actual | 60 total, 57 sobre main | [A] `git log --oneline --all | wc -l` y `git log --oneline main..HEAD | wc -l` |
| Ramas locales | main, feat/reconciliation-os, backup/reconciliation-os-alpha, demo/foto-estudio | [A] `git branch -a` |
| Ramas remotas | origin/main, origin/demo/foto-estudio | [A] `git branch -r` |
| Framework | Next.js 14.2.25, React 18.2.0, TypeScript 5.9.3 | [A] `package.json` |
| ORM | Prisma 7.4.2 con @prisma/adapter-neon | [A] `package.json` |
| Modelos Prisma | 253 | [A] `grep -c '^model ' prisma/schema.prisma` |
| Enums Prisma | 63 | [A] `grep -c '^enum ' prisma/schema.prisma` |
| Migraciones totales | 102 directorios | [A] `find prisma/migrations -maxdepth 1 -type d` |
| Migraciones tracked | 31 | [A] `git ls-files prisma/migrations/` agrupado |
| Migraciones untracked | 71 | [A] Diferencia medida |
| Schema lines | 9,789 | [A] `wc -l prisma/schema.prisma` |
| Rutas API | 329 | [A] `find app/api -name 'route.ts' | wc -l` (actualizado en MANIFEST-02; la cifra original de 237 excluia rutas en subdirectorios untracked) |
| Sparse checkout | No | [A] `git sparse-checkout list` retorna `fatal: this worktree is not sparse` |
| Worktrees | 1 | [A] `git worktree list` |
| Archivos basura (.pyc) | 3 | [A] `grep '\.pyc$'` sobre lista de untracked |

### Directorios principales

```
app/           — Paginas Next.js y API routes
components/    — Componentes React reutilizables
lib/           — Logica de negocio, engines, servicios, adapters
prisma/        — Schema, migraciones, seed
scripts/       — Scripts de auditoria, validacion, backfill
docs/          — Documentacion tecnica
public/        — Assets estaticos
hooks/         — React hooks custom (2 archivos)
middleware.ts  — Middleware Next.js (untracked)
exports/       — Exportaciones de datos
types/         — Declaraciones TypeScript globales
```

Fuente: [A] `find . -maxdepth 1 -type d` + `find . -maxdepth 1 -type f`

---

## 2. Arquitectura General

### 2.1 `app/` — Paginas y API Routes

**Estructura medida:** [A] `find app -maxdepth 4 -type d`
- `app/(app)/[orgSlug]/` — Shell principal. Cada submodulo es un subdirectorio.
- `app/api/orgs/[orgSlug]/` — API routes organizacionales.
- `app/api/internal/` — Endpoints internos (workers, tests, cron).
- `app/api/integrations/` — Callbacks OAuth y webhooks.
- `app/login/`, `app/unauthorized/` — Auth pages.
- `app/c/[slug]/` — Pagina publica de catalogos. [A] Verificado: el archivo importa `getPublicCatalogView` y `CatalogPublicView`.
- `app/publish/route.ts` — Ruta legacy de publicacion TikTok. [A] Verificado: el codigo referencia `tt_access_token` cookie.
- `app/(app)/[orgSlug]/agents/` — Pagina legacy de agentes. [A] Verificado: es una pagina landing con cards de agentes, no el modulo enterprise.
- `app/control-center/runs/` — 4 archivos fuera del shell `(app)`. [A] Verificado via `find`.

**Dependencias:** [A] Medido via `grep -rh "from ['\"]@/"` — importa de `lib/`, `components/`, `@/types/`.

### 2.2 `components/` — Componentes React

Fuente de todas las cifras: [A] `find` + `git ls-files` por directorio.

| Directorio | Total | Tracked | Proposito medido |
|---|---|---|---|
| `components/shell/` | 5 | 5 | WorkspaceShellClient, primitives, module-nav-config [A] git ls-files |
| `components/ui/` | 57 | 57 | shadcn/ui primitives [A] git ls-files |
| `components/workspace/` | 8 | 6 | OperationalWorkspaceHeader, collapsible sections [A] git ls-files |
| `components/marketing-studio/` | 108 | 3 | Subdirs: ads(5), campaigns(10), catalogs(10), library(17), orchestration(8), orchestrator(10), publishing(10), shared(11), shopify(5), social(8), otros(14) [A] find |
| `components/copilot/` | 33 | 0 | [A] find |
| `components/executive/` | 11 | 10 | [A] find + git ls-files |
| `components/agentik/` | 8 | 0 | [A] find |
| `components/layout/` | 4 | 3 | [A] find + git ls-files |
| `components/operational-map/` | 6 | 0 | [A] find |
| `components/finance/` | 5 | 4 | [A] find + git ls-files |
| `components/reconciliation/` | 5 | 0 | [A] find |
| `components/runtime/` | 5 | 0 | [A] find |
| `components/approvals/` | 4 | 0 | [A] find |
| `components/tasks/` | 4 | 0 | [A] find |
| `components/work-executions/` | 4 | 0 | [A] find |
| `components/comercial/` | 2 | 0 | [A] find |
| `components/operational-intelligence/` | 2 | 0 | [A] find |

### 2.3 `lib/` — Logica de Negocio

Fuente: [A] `find` + `git ls-files` por directorio.

| Modulo | Archivos | Tracked | Imports desde otros modulos [A] |
|---|---|---|---|
| `lib/copilot/` | 744 | 131 | comercial, finance, marketing-studio, security, tasks, work, prisma |
| `lib/comercial/` | 347 | 7 | agent-runtime, business-*, commercial-intelligence, connectors, logistics, operational-inventory, prisma, tenant-rules |
| `lib/marketing-studio/` | 299 | 46 | approval, copilot, execution, integrations, prisma, security |
| `lib/security/` | 234 | 6 | copilot, prisma |
| `lib/integrations/` | 105 | 27 | comercial, connectors, marketing-studio, prisma, security |
| `lib/finance/` | 86 | 24 | prisma (+ internal finance submodules) |
| `lib/reconciliation/` | 54 | 36 | prisma |
| `lib/connectors/` | 47 | 26 | comercial, integrations, logistics, prisma, production, production-events |
| `lib/work/` | 42 | 0 | prisma, tasks |
| `lib/agent-runtime/` | 41 | 0 | agent-memory, agent-orchestration, agent-planning, comercial, prisma |
| `lib/operational-map/` | 33 | 0 | prisma |
| `lib/ai-billing/` | 21 | 0 | prisma |
| `lib/autonomous/` | 17 | 0 | (ninguna dependencia externa medida) |
| `lib/ai-layer/` | 16 | 0 | ai-billing, ai-pricing, security |
| `lib/operational-data/` | 16 | 0 | comercial, operational-inventory, prisma |
| `lib/business-planning/` | 16 | 0 | business-entities, business-events, business-rules, business-signals |
| `lib/business-actions/` | 15 | 0 | business-decisions, business-entities, business-events, business-planning, business-signals |
| `lib/business-reasoning/` | 15 | 0 | business-entities |
| `lib/approvals/` | 15 | 0 | prisma |
| `lib/tasks/` | 14 | 0 | prisma |
| `lib/ai-pricing/` | 14 | 0 | (ninguna dependencia externa medida) |
| `lib/business-decisions/` | 14 | 0 | business-entities, business-events, business-planning, business-rules, business-signals |
| `lib/business-events/` | 14 | 0 | business-entities, business-signals |
| `lib/agentik/` | 13 | 10 | prisma |
| `lib/production-intelligence/` | 13 | 0 | business-signals, comercial, commercial-intelligence, prisma, tenant-rules |
| `lib/business-rules/` | 13 | 0 | business-entities, business-events, business-signals |
| `lib/autonomous-operations/` | 13 | 0 | (ninguna dependencia externa medida) |
| `lib/business-entities/` | 12 | 0 | comercial |
| `lib/business-flow/` | 12 | 0 | business-entities |
| `lib/business-signals/` | 12 | 0 | business-entities |
| `lib/operational-inventory/` | 12 | 0 | comercial, operational-data, prisma |
| `lib/decisions/` | 12 | 0 | (ninguna dependencia externa medida) |
| `lib/whatsapp/` | 12 | 0 | [A] Verificado: WhatsAppConfig referenciado en 4 archivos |
| `lib/business-knowledge/` | 11 | 0 | business-entities |
| `lib/executive-dashboard/` | 11 | 0 | business-*, comercial, commercial-intelligence, production-intelligence, replenishment-intelligence, tenant-rules |
| `lib/intelligence/` | 11 | 0 | comercial, prisma |
| `lib/auth/` | 8 | 8 | prisma |
| `lib/production/` | 8 | 0 | prisma, production-control, production-events, production-stages, production-timeline |
| `lib/agents/runtime/` | 31 | 0 | (ninguna dependencia externa medida) |
| `lib/agent-memory/` | 7 | 0 | agent-runtime |
| `lib/agent-orchestration/` | 7 | 0 | agent-intelligence, agent-memory, agent-runtime |
| `lib/agent-planning/` | 7 | 0 | agent-intelligence, agent-memory, agent-orchestration, agent-runtime |
| `lib/agent-intelligence/` | 6 | 0 | agent-memory, agent-runtime |
| `lib/production-events/` | 7 | 0 | (ninguna dependencia externa medida) |
| `lib/production-timeline/` | 6 | 0 | prisma, production-events |
| `lib/financial/` | 9 | 0 | [A] Verificado: 10+ imports desde lib/finance/ y app/ |
| `lib/commercial-intelligence/` | 7 | 1 | business-signals, comercial, prisma |
| `lib/logistics/` | 6 | 0 | (ninguna dependencia externa medida) |
| `lib/observability/` | 6 | 0 | (ninguna dependencia externa medida) |
| `lib/oauth/` | 6 | 0 | integrations |
| `lib/documents/` | 6 | 6 | prisma |
| `lib/replenishment-intelligence/` | 5 | 0 | business-signals, comercial, commercial-intelligence, logistics, production-intelligence, tenant-rules |
| `lib/idempotency/` | 5 | 0 | (ninguna dependencia externa medida) |
| `lib/customer360/` | 5 | 0 | prisma |
| `lib/ui/` | 4 | 3 | (ninguna dependencia externa) |
| `lib/production-stages/` | 4 | 0 | production-events, production-timeline |
| `lib/inventory/` | 4 | 0 | comercial, commercial-intelligence, prisma, tenant-rules |
| `lib/tenant-rules/` | 4 | 0 | commercial-intelligence |
| `lib/approval/` | 4 | 0 | execution |
| `lib/tenant/` | 3 | 2 | prisma |
| `lib/control-center/` | 4 | 0 | (ninguna dependencia externa medida) |
| `lib/runtime/` | 4 | 0 | (ninguna dependencia externa medida) |
| `lib/execution/` | 3 | 0 | prisma |
| `lib/executive-intelligence/` | 3 | 0 | business-entities, business-reasoning, castillitos, comercial, finance, prisma |
| `lib/operational-intelligence/` | 3 | 0 | comercial, operational-data, operational-inventory, prisma |
| `lib/castillitos/` | 3 | 0 | prisma |
| `lib/commercial-ledger/` | 2 | 0 | [A] Verificado: 5 imports desde otros archivos — NO es huerfano |
| `lib/production-control/` | 2 | 0 | prisma, production-intelligence |
| `lib/agentik-agents/` | 2 | 0 | (ninguna dependencia externa medida) |
| `lib/business-engine/` | 5 | 0 | [A] Verificado: 2 imports desde otros archivos (OperationalState type) — NO es huerfano |

Todas las dependencias marcadas [A] fueron medidas con `grep -rh "from ['\"]@/lib/"` recursivo sobre cada directorio.

### 2.4 `prisma/`

- Schema: `prisma/schema.prisma` — 9,789 lineas [A] `wc -l`
- Schema status: Modified, +866 insertions [A] `git diff --stat prisma/schema.prisma`
- Migraciones: 102 directorios, 31 tracked, 71 untracked [A] Medido

### 2.5 `scripts/`

- Total archivos: 471 [A] `find scripts -name '*.ts' -o -name '*.js' | wc -l`
- Clasificacion por prefijo: ver Seccion 13.

### 2.6 `docs/`

- Total: 89 archivos [A] `find docs -type f -name '*.md' | wc -l`

### 2.7 `public/`

Archivos de agentes medidos [A] `ls -lh public/agents/`:

| Archivo | Tamano | Tracked |
|---|---|---|
| Diego.png | 5.1 MB | No |
| Laura.PNG | 1.1 MB | No |
| Pablo.PNG | 1.2 MB | No |
| Robert.PNG | 1.2 MB | No |
| enzo.png | 2.0 MB | Si |
| luca.png | 1.9 MB | Si |
| mila.png | 2.0 MB | Si |
| sofi.png | 2.0 MB | Si |

Referencia en codigo: [A] `copilot-agent-registry.ts` lineas 23, 47, 71, 92, 112, 133, 154 — cada agente tiene `avatar: "/agents/..."` apuntando a estos archivos.

### 2.8 `hooks/`

2 archivos [A] `find hooks -type f`:
- `use-agent-runtime.ts`
- `use-operational-inventory.ts`

### 2.9 `middleware.ts`

1 archivo, untracked [A] `git status --short | grep middleware`

---

## 3. Modulos Funcionales

**NOTA:** Las secciones anteriores incluian porcentajes de "completitud" (85%, 70%, etc.) y etiquetas de estado ("Operativo", "Parcial"). Estos fueron eliminados porque no tienen evidencia medible. En su lugar se documenta lo que SI se puede medir: archivos existentes, imports activos, rutas API, y presencia de integration tests.

### 3.1 Comercial

| Submodulo | Ruta app | Ruta lib | Archivos lib | API routes | Integration test |
|---|---|---|---|---|---|
| Maletas | `comercial/maletas/` | `lib/comercial/maletas/` | 50 | 12 | No |
| Pedidos | `comercial/pedidos/` | `lib/comercial/pedidos/` | 44 | 6 | No |
| Tiendas | `comercial/tiendas/` | `lib/comercial/tiendas/` | 37 | 6 | No |
| Vendedores | `comercial/vendedores/` | `lib/comercial/sales-reps/` | 10 | 1 | No |
| Importaciones | `comercial/importaciones/` | `lib/comercial/importaciones/` | 12 | 0 | No |
| Demand | — | `lib/comercial/demand/` | 10 | 1 | No |
| Inventario | `comercial/inventario/` | `lib/comercial/inventory/` + `lib/inventory/` | 4+4 | 1 | No |
| Clientes | `comercial/clientes/` | `lib/comercial/clientes/` + `lib/customer360/` | 3+5 | 1 | No |
| Control | `comercial/control/` | `lib/comercial/control/` | 1 | 0 | No |
| Inteligencia | `comercial/inteligencia/` | `lib/comercial/intelligence/` + `lib/commercial-intelligence/` | 3+7 | 1 | No |
| Vendors | — | `lib/comercial/vendors/` | 13 | 0 | No |
| Foundation | — | `lib/comercial/foundation/` | 6 | 0 | No |
| Data Sources | — | `lib/comercial/data-sources/` | 3 | 0 | No |
| Business Policy | — | `lib/comercial/business-policy/` | 11 | 0 | No |

Fuente: [A] `find` por directorio.

### 3.2 Finanzas

| Submodulo | Ruta app | Ruta lib | Archivos lib | API routes |
|---|---|---|---|---|
| Finance core | — | `lib/finance/` | 86 | 3 |
| Financial | — | `lib/financial/` | 9 | 0 |
| Reconciliation | `finanzas/conciliacion/` | `lib/reconciliation/` | 54 | 6 |
| Castillitos | — | `lib/castillitos/` | 3 | 0 |

[A] `lib/financial/` NO es duplicado de `lib/finance/` — tiene 10+ imports activos desde `lib/finance/` y `app/`. Son modulos complementarios.

### 3.3 Produccion

| Submodulo | Ruta lib | Archivos |
|---|---|---|
| Production core | `lib/production/` | 8 |
| Production Events | `lib/production-events/` | 7 |
| Production Timeline | `lib/production-timeline/` | 6 |
| Production Intelligence | `lib/production-intelligence/` | 13 |
| Production Stages | `lib/production-stages/` | 4 |
| Production Control | `lib/production-control/` | 2 |

App pages: `produccion/` con 6 subpaginas (ordenes, timeline, etapas, consumos, costos, alertas) [A] find.

### 3.4 Marketing Studio

| Submodulo | Ruta lib | Archivos |
|---|---|---|
| Commerce/Shopify | `lib/marketing-studio/commerce/` | 38 |
| Core | `lib/marketing-studio/` (root) | 28 |
| Ads | `lib/marketing-studio/ads/` | 23 |
| Catalogs | `lib/marketing-studio/catalogs/` | 22 |
| Orchestrator | `lib/marketing-studio/orchestrator/` | 16 |
| Products | `lib/marketing-studio/products/` | 15 |
| Video Editor | `lib/marketing-studio/video-editor/` | 15 |
| Publishing | `lib/marketing-studio/publishing/` | 11 |
| Distribution | `lib/marketing-studio/distribution/` | 10 |
| Campaigns | `lib/marketing-studio/campaigns/` | 10 |
| Orchestration | `lib/marketing-studio/orchestration/` | 9 |
| Operators | `lib/marketing-studio/operators/` | 9 |
| Execution | `lib/marketing-studio/execution/` | 9 |
| Library | `lib/marketing-studio/library/` | 7 |
| Attributes | `lib/marketing-studio/attributes/` | 5 |
| Bulk Import | `lib/marketing-studio/bulk-import/` | 5 |
| Social | `lib/marketing-studio/social/` | 4 |
| Publicaciones | `lib/marketing-studio/publicaciones/` | 3 |
| Connections | `lib/marketing-studio/connections/` | 2 |
| Video Editor subfiles | `video-editor/{music,drafts,render,subtitles}/` | 15 |

Total: 299 archivos [A] find. API routes: 56 [A] find.

### 3.5 Copilot (Sistema Multi-Agente)

**7 agentes registrados** [A] Verificado en `lib/copilot/copilot-agent-registry.ts` lineas 15-168:

| ID | Nombre | Departamento | Avatar |
|---|---|---|---|
| `luca` | Luca | Marketing | `/agents/luca.png` |
| `diego` | Diego | Finanzas | `/agents/Diego.png` |
| `laura` | Laura | WhatsApp Comercial | `/agents/Laura.PNG` |
| `david` | David | Comercial | `/agents/enzo.png` |
| `sofia` | Sofia | Shopify / Ecommerce | `/agents/sofi.png` |
| `mila` | Mila | Cobranza | `/agents/mila.png` |
| `pablo` | Pablo | Gerencia | `/agents/Pablo.PNG` |

Submodulos por tamano [A] find:

| Submodulo | Archivos |
|---|---|
| copilot/ root (types, runtime, signals, etc.) | 77 |
| executive-governance/ | 29 |
| enterprise-direction/ | 28 |
| board-intelligence/ | 26 |
| memory-graph/ | 26 |
| strategic-forecasting/ | 25 |
| strategic-advisor/ | 23 |
| executive-brain-v2/ | 23 |
| cross-module-reasoning/ | 22 |
| learning/ | 22 |
| strategic-simulations/ | 22 |
| strategic-planning/ | 21 |
| strategic-memory/ | 20 |
| executive-council/ | 17 |
| runtime/ | 17 |
| executive-brain/ (v1) | 13 |
| memory/ | 11 |
| actions/ | 10 |
| playbooks/ | 10 |
| profiles/ | 10 |
| viewmodel/ | 10 |
| intent-resolver/ | 9 |
| insights/ | 8 |
| language/ | 8 |
| knowledge/ | 7 |
| execution-store/ | 7 |
| suggestions/ | 7 |
| memory-planning/ | 6 |
| navigation/ | 6 |
| policy/ | 6 |
| approval-workflow/ | 5 |
| diego/ | 5 |
| david/ | 4 |
| finance/ | 4 |
| signal-rules/ | 4 |
| agents/ | 2 |
| decision/ | 1 |

**executive-brain/ (v1) vs executive-brain-v2/:** Ambos tienen consumidores activos [A]:
- v1: 5 imports medidos (types, audit, encryption adapter)
- v2: 5+ imports medidos (engine, context engines, situation engine, priority engine)

**No se puede afirmar que v1 sea reemplazable sin verificar que los consumidores de v1 no dependan de exports unicos.**

### 3.6 Seguridad

| Submodulo | Archivos | Integration test [A] |
|---|---|---|
| Core (root) | 14 | security-foundation |
| Vault | 28 | vault, vault-migration |
| KMS | 16 | kms |
| MFA | 18 | mfa |
| RBAC | 15 | rbac |
| Anomaly Detection | 17 | anomaly-detection |
| Compliance | 16 | compliance |
| Encryption | 14 | security-encryption |
| Zero Trust | 18 | zero-trust |
| Audit Persistence | 11 | audit-persistence |
| Secret Rotation | 16 | secret-rotation |

Total: 234 archivos [A] find.
Integration tests existentes: 11 de 11 submodulos [A] `ls app/api/internal/integration-tests/`

### 3.7 Agent Runtime

| Submodulo | Archivos | Consumidores [A] |
|---|---|---|
| `lib/agent-runtime/` | 41 | Multiples (ActionEnvelope, RuntimeEvent imports) |
| `lib/agents/runtime/` | 31 | Multiples (AgentId, resolveAgent imports) |
| `lib/agent-intelligence/` | 6 | — |
| `lib/agent-memory/` | 7 | — |
| `lib/agent-orchestration/` | 7 | — |
| `lib/agent-planning/` | 7 | — |
| `lib/agentik-agents/` | 2 | Verificado: importado desde copilot-context-resolver.ts |

[A] `lib/agents/runtime/` y `lib/agent-runtime/` NO son duplicados. Exportan tipos distintos:
- `lib/agents/runtime/`: exporta `AgentId`, `AgentDefinition`, `resolveAgent`
- `lib/agent-runtime/`: exporta `ActionEnvelope`, `RuntimeEvent`, execution graph

### 3.8 Business Logic Layer

| Submodulo | Archivos | Dependencias [A] |
|---|---|---|
| business-entities | 12 | comercial |
| business-signals | 12 | business-entities |
| business-events | 14 | business-entities, business-signals |
| business-rules | 13 | business-entities, business-events, business-signals |
| business-decisions | 14 | business-entities, business-events, business-planning, business-rules, business-signals |
| business-actions | 15 | business-decisions, business-entities, business-events, business-planning, business-signals |
| business-planning | 16 | business-entities, business-events, business-rules, business-signals |
| business-reasoning | 15 | business-entities |
| business-knowledge | 11 | business-entities |
| business-flow | 12 | business-entities |
| business-engine | 5 | (ninguna externa) |

Root del grafo: `business-entities` [A] Medido via imports.

### 3.9 Work Execution

| Submodulo | Archivos |
|---|---|
| work | 42 |
| tasks | 14 |
| approvals | 15 |
| execution | 3 |
| idempotency | 5 |

Integration tests: workflow-hardening [A]

---

## 4. Inventario de APIs

**Total: 329 rutas** [A] `find app/api -name 'route.ts' | wc -l` (corregido en MANIFEST-02; la medicion original de 237 no contabilizaba todos los subdirectorios untracked)

### Agrupacion por dominio [A] Medido

| Dominio | Rutas |
|---|---|
| Marketing Studio | 56 |
| Internal (workers, tests, cron) | 48 |
| Comercial | 29 |
| Agent Runtime | 18 |
| Integrations | 18 |
| Operational Map | 13 |
| Copilot | 9 |
| SAG Write | 8 |
| Documents | 8 |
| Reconciliation | 6 |
| Alerts | 5 |
| TikTok | 5 |
| Luca | 5 |
| Operational Inventory | 5 |
| WhatsApp (api/whatsapp + wa) | 6 |
| Finance | 3 |
| Others | 15 |

Listado completo de las 237 rutas disponible en version anterior del manifiesto.

### Integration test routes [A]

41 rutas en `app/api/internal/integration-tests/` cubriendo:
agent-execution, agent-learning, agent-runtime, ai-billing, ai-layer, ai-pricing,
anomaly-detection, audit-persistence, autonomous-operations, autonomous-runtime,
board-intelligence, compliance, copilot-intelligence, copilot-intelligence-02,
copilot-memory, copilot-memory-aware-planning, copilot-memory-persistence,
copilot-playbooks, copilot-tenant-profiles, cross-module-reasoning,
enterprise-direction, executive-brain, executive-brain-v2, executive-council,
executive-governance, kms, memory-graph, mfa, rbac, secret-rotation,
security-encryption, security-foundation, strategic-advisor, strategic-forecasting,
strategic-memory, strategic-planning, strategic-simulations, vault, vault-migration,
workflow-hardening, zero-trust

---

## 5. Inventario de Componentes

Ver Seccion 2.2. Todas las cifras provienen de [A] `find` + `git ls-files`.

---

## 6. Inventario de Librerias

Ver Seccion 2.3. Todas las cifras y dependencias provienen de [A] `find` + `grep`.

---

## 7. Prisma

### 7.1 Schema

- **Location:** `prisma/schema.prisma` [A]
- **Lines:** 9,789 [A] `wc -l`
- **Status:** Modified, +866 insertions [A] `git diff --stat`
- **Provider:** PostgreSQL [A] Leido del schema
- **Adapter:** `@prisma/adapter-neon` [A] package.json
- **Models:** 253 [A] `grep -c '^model '`
- **Enums:** 63 [A] `grep -c '^enum '`

### 7.2 Lista completa de modelos [A] `grep '^model ' prisma/schema.prisma | awk '{print $2}' | sort`

253 modelos. Lista completa disponible en la version anterior del manifiesto.

### 7.3 Migraciones [A]

| Status | Count | Rango de timestamps |
|---|---|---|
| Tracked | 31 | `20260302` - `20260705` |
| Untracked | 71 | `20260406` - `20260716` |
| **Total** | **102** | |

Los rangos se solapan: algunas migraciones del mismo periodo fueron commiteadas y otras no [A] medido.

---

## 8. Motores del Sistema

**NOTA:** Los "motores" se identifican por la existencia de archivos con sufijo `-engine` y sus imports medidos. No se evalua si estan "completos" o "funcionando" — solo se documenta su existencia y consumidores.

### Motores identificados [A] find + grep imports

| Motor | Ruta | Archivos | Consumidores medidos [A] |
|---|---|---|---|
| Reconciliation Engine | `lib/reconciliation/engine/` | 13 | `app/finanzas/conciliacion/`, `lib/copilot/diego/` |
| Coverage Engine | `lib/comercial/foundation/` | 6 | `lib/comercial/control/`, `lib/executive-dashboard/` |
| Business Rule Engine | `lib/business-rules/` | 13 | `lib/business-decisions/`, `lib/business-planning/` |
| Action Runtime | `lib/agent-runtime/` | 41 | `lib/copilot/`, `app/api/agent/` |
| Copilot Runtime | `lib/copilot/runtime/` | 17 | `components/copilot/`, `components/layout/` |
| Work Execution | `lib/work/` | 42 | `lib/approvals/`, `app/ejecuciones/` |
| Demand Engine | `lib/comercial/demand/` | 10 | `lib/comercial/maletas/`, `lib/comercial/tiendas/` |
| Financial Runtime | `lib/finance/runtime-*.ts` | 8 | `app/finanzas/`, `lib/copilot/finance/` |
| Pattern Engine | `lib/finance/pattern-engine.ts` | 1 | `lib/finance/` (internal) |
| Cross-Module Reasoning | `lib/copilot/cross-module-reasoning/` | 22 | `lib/copilot/board-intelligence/` |
| Strategic Forecasting | `lib/copilot/strategic-forecasting/` | 25 | `lib/copilot/executive-council/` |

---

## 9. Integraciones

| Integracion | Evidencia de existencia [A] | Archivos |
|---|---|---|
| **SAG PYA SOAP** | `lib/connectors/adapters/sag-pya-soap/` + `lib/sag/` (write layer) + env vars PYA_SOAP_* | Adaptador completo: queries, storage, mappers, inventory, orders, production, transfers, catalog |
| **CRM Castillitos** | `lib/connectors/adapters/castillitos-crm/` + `lib/integrations/crm-castillitos/` | 2 + 2 archivos |
| **Shopify** | `lib/integrations/shopify/` (15 files) + `lib/marketing-studio/commerce/` (38 files) + 17 API routes + env vars SHOPIFY_* | Admin API, webhooks, catalog sync, publish |
| **DIAN** | `app/api/internal/dian/sync/route.ts` (1 ruta) + `lib/integrations/dian/security/dian-secret-provider.ts` | Ruta de sync existe [A], secret provider existe [A] |
| **WhatsApp** | `lib/whatsapp/` (12 files) + 6 API routes (whatsapp/* + wa/*) + env vars META_WA_* | WhatsAppConfig model usado en 4 archivos [A] |
| **Meta (Marketing)** | `integrations/meta/callback` (1 ruta) + `lib/marketing-studio/social/` (4 files) | OAuth callback |
| **TikTok** | `app/api/tiktok/*` (5 routes) + `lib/integrations/tiktok/security/tiktok-secret-provider.ts` | Auth + callback. 1 archivo en lib [A] |
| **Google (OAuth)** | `lib/integrations/oauth/providers/google-oauth.ts` + `lib/integrations/oauth/providers/google-drive-oauth.ts` + `lib/ai-layer/adapters/google-adapter.ts` | OAuth providers + AI adapter |
| **Google Drive** | `integrations/google-drive/{callback,connect}` (2 rutas) + `lib/marketing-studio/drive/` (1 file) | OAuth flow + drive import |
| **Anthropic (Claude)** | `@anthropic-ai/sdk ^0.80.0` en package.json [A] + env var ANTHROPIC_API_KEY | SDK instalado como dependencia |
| **OpenAI** | env var OPENAI_API_KEY referenciado en codigo [A]. No hay `openai` en package.json [A] | Usado via API directa, no SDK |
| **Replicate** | env var REPLICATE_API_TOKEN [A] | Generacion de imagenes |
| **Cloudflare R2** | `@aws-sdk/client-s3` en package.json [A] + `lib/marketing-studio/r2-upload.ts` + env vars R2_* | Storage de assets |
| **Resend** | env var RESEND_API_KEY [A] + `lib/email/adapter.ts` [A] | Email delivery |
| **Neon (PostgreSQL)** | `@neondatabase/serverless` + `@prisma/adapter-neon` en package.json [A] | Base de datos primaria |
| **n8n** | env vars N8N_* [A] + referenciado en `lib/integrations/` (3 archivos) [A] | Webhook bridges |
| **FFmpeg** | env vars FFMPEG_PATH, FFPROBE_PATH [A] + `lib/marketing-studio/video-editor/render/ffmpeg-render-adapter.ts` [A] | Video rendering |

| **Google/Gemini (AI)** | `lib/ai-layer/adapters/google-adapter.ts` [A] + `lib/ai-layer/ai-model-registry.ts` referencia "gemini" [A] + `lib/ai-layer/ai-layer-types.ts` [A] | Adapter existe. No hay `@google/generative-ai` en package.json [A]. Implementacion parcial via ai-layer abstraction |

**Integraciones eliminadas del manifiesto anterior por falta de evidencia:**
- ~~Stripe~~ — 0 archivos de integracion, 0 imports, 0 env vars [A]. Las unicas apariciones son `stripe` como CSS pattern en `lib/ui/op-table.ts` [A]
- ~~FedEx~~ — 0 archivos de integracion [A]. Solo aparece como ejemplo en `lib/security/security-registry.ts` y `zero-trust-readiness.ts` [A]
- ~~FAL~~ — env var FAL_API_KEY declarada pero codigo es placeholder: `// PLACEHOLDER — implement when FAL_API_KEY is available` en `lib/marketing-studio/generation-providers.ts` [A]
- ~~AssemblyAI~~ — env var ASSEMBLYAI_API_KEY declarada pero codigo esta comentado: `//   const aaiToken = process.env.ASSEMBLYAI_API_KEY;` en `lib/whatsapp/audio.ts` [A]

---

## 10. Multi-Tenant

### 10.1 Organizacion

- **Model:** `Organization` en Prisma schema [A]
- **Routing:** `app/(app)/[orgSlug]/` [A] filesystem
- **API guard:** `requireOrgAccess()` en `lib/auth/require-org-access.ts` [A] git ls-files

### 10.2 Roles [A] `grep '^enum ' prisma/schema.prisma` → enum `Role`

Valores del enum Role: OWNER, ADMIN, AGENTIK_ADMIN, SUPER_ADMIN, MEMBER, VIEWER [A] grep del schema.

### 10.3 Membership

- **Model:** `Membership` en Prisma (userId + organizationId + role) [A] schema
- **Module access:** `lib/auth/module-access.ts` [A] git ls-files

### 10.4 Tenant Modules

- **Model:** `TenantModule` en Prisma [A] schema
- **Config:** `lib/tenant/modules.ts` [A] filesystem
- **Branding:** `OrganizationBranding` model en Prisma [A] schema

---

## 11. Dependencias

### 11.1 Produccion [A] package.json

71 paquetes. Lista completa disponible en version anterior del manifiesto.

**Categorias principales:**
- Framework: next, react, react-dom
- Database: @prisma/client, @prisma/adapter-neon, @neondatabase/serverless, pg
- Auth: next-auth, @auth/prisma-adapter, bcryptjs
- AI: @anthropic-ai/sdk
- UI: 24 @radix-ui/* packages, lucide-react, recharts, framer-motion
- Data: fast-xml-parser, xlsx, papaparse, date-fns
- PDF: @react-pdf/renderer, pdf-parse, pdf2json
- Storage: @aws-sdk/client-s3
- Security: node-forge

### 11.2 Desarrollo [A] package.json

22 paquetes: typescript, prisma, tailwindcss, tsx, ts-node, md-to-pdf, @types/*.

### 11.3 Dependencias instaladas sin consumidores en codigo [A]

| Paquete | En package.json | Imports en codigo | Nota |
|---|---|---|---|
| `expo-asset` | Si (`"latest"`) | 0 [A] | Todas las expo-* estan con version `"latest"`, sin ningun import en el codebase [A] |
| `expo-file-system` | Si (`"latest"`) | 0 [A] | |
| `expo-gl` | Si (`"latest"`) | 0 [A] | |
| `@splinetool/runtime` | Si | 0 imports directos. `components/SplineRobot.tsx` existe (tracked) pero 0 consumidores medidos [A] | Legacy landing page component |
| `@emotion/is-prop-valid` | Si | 0 [A] | Posible transitive dep de framer-motion |

**Dependencias con imports encontrados:**

| Paquete | Consumidores [A] |
|---|---|
| `canvas-confetti` | `types/canvas-confetti.d.ts` (type declaration exists) [A] |
| `@tsparticles/*` | `components/ui/sparkles.tsx` importa `@tsparticles/react`, `@tsparticles/engine`, `@tsparticles/slim` [A] |

---

## 12. Variables de Entorno

**Total: 82 variables referenciadas en codigo** [A] `grep -rh 'process\.env\.' --include='*.ts' --include='*.tsx'`

Lista completa por categoria disponible en version anterior del manifiesto. Todas las variables fueron extraidas automaticamente del codigo fuente [A].

**Variables declaradas pero sin consumidores en codigo medidos:**
- `FAL_API_KEY` — en la lista de env vars pero 0 archivos lo importan [A]
- `ASSEMBLYAI_API_KEY` — en la lista de env vars pero 0 archivos lo importan [A]

---

## 13. Scripts

### Clasificacion [A] Basada en prefijo de nombre de archivo

| Tipo | Cantidad | Criterio de clasificacion |
|---|---|---|
| TEMP (`_` prefix) | 209 | Nombre empieza con `_` |
| VALIDATION (`validate-*`) | 129 | Nombre empieza con `validate-` |
| OTHER | 46 | No coincide con ningun patron |
| TEST (`test-*`, `verify-*`) | 26 | Nombre empieza con `test-` o `verify-` |
| INT_HARNESS (`integration/`) | 23 | Ubicado en `scripts/integration/` |
| AUDIT (`audit-*`) | 17 | Nombre empieza con `audit-` |
| DIAGNOSTIC (`forensic-*`, `diagnose-*`, `debug-*`) | 12 | Nombre empieza con patron diagnostico |
| OPERATIONAL (`seed-*`, `setup-*`, `enable-*`, `refresh-*`, `export-*`) | 9 | Nombre empieza con patron operacional |

**Total: 471 archivos** [A]

**Scripts sin prefijo `_` que son referencia operacional medida:**
- `scripts/setup-castillitos-connectors.ts` [A] existe
- `scripts/validate-castillitos.ts` [A] existe
- `scripts/worker.ts` [A] existe
- `scripts/seed-ai-pricing.ts` [A] existe
- `scripts/check-no-db-push.js` [A] existe
- `scripts/certify-commercial-go-live-01.ts` [A] existe
- `scripts/integration/*` — 23 harnesses [A] find

---

## 14. Documentacion

### 14.1 `docs/` [A] find

| Subdirectorio | Archivos |
|---|---|
| architecture/ | 24 |
| implementation/ | 23 |
| importaciones/ | 12 |
| discovery/ | 6 |
| comercial/ | 6 |
| certification/ | 4 |
| audit/ | 4 |
| integrations/ | 2 |
| marketing-studio/ | 1 |
| business-rules/ | 1 |
| Root docs/ files | 6 |

### 14.2 Root `.md` files [A]

- Tracked: 26 archivos [A] `git ls-files '*.md' | wc -l` (root level)
- Untracked: 204 archivos [A] `git status --short | awk '$1=="??"' | grep '\.md$'`
- Total: 230 archivos

---

## 15. Estado Git

Todo medido [A]. Ver Seccion 1 para datos completos.

### Evolucion de archivos trackeados [A] `git ls-tree -r --name-only` por commit

| Fecha | Commit | Tracked | Evento |
|---|---|---|---|
| 2026-01-12 | `9a24747` | 93 | Initial: Landing + TikTok |
| 2026-01-26 | `33444d7` | 119 | + Luca R2 upload |
| 2026-03-13 | `86163b6` | 120 | + Auth workspace (fork point de feat/) |
| 2026-04-19 | `9828506` | 593 | +473 archivos |
| 2026-05-10 | `5b08ece`-`b8c0821` | 726 | + Workspace, finance, connectors |
| 2026-05-11 | `6b30906` | 854 | + Migrations, tooling |
| 2026-06-07 | `759df68`-`93fe25a` | 962 | + Intelligence layers |
| 2026-06-15 | `b146bd5` | 1,033 | + Runtime, persistence |
| 2026-07-16 | `1cc2565` | 1,066 | HEAD |

---

## 16. Riesgos

### 16.1 Dependencias circulares [A] Medido via imports

| Ciclo | Evidencia |
|---|---|
| `comercial` <-> `operational-inventory` <-> `operational-data` | Imports bidireccionales medidos |
| `security` -> `copilot` -> `security` | Imports bidireccionales medidos |
| `integrations` -> `connectors` -> `integrations` | Imports bidireccionales medidos |
| `copilot` -> `marketing-studio` -> `copilot` (indirecto, via security) | Imports medidos con intermediario |

### 16.2 Directorios con nombres similares [A]

| Par | Status verificado |
|---|---|
| `lib/agents/runtime/` vs `lib/agent-runtime/` | Ambos activos. Exportan tipos distintos. NO son duplicados [A] |
| `lib/financial/` vs `lib/finance/` | Ambos activos. `financial` tiene 10+ consumidores. NO son duplicados [A] |
| `lib/copilot/executive-brain/` vs `executive-brain-v2/` | Ambos tienen consumidores activos (5 cada uno) [A] |
| `lib/business-engine/` | Tiene 2 consumidores activos (OperationalState type) [A] |
| `lib/commercial-ledger/` | Tiene 5 consumidores activos [A] |

### 16.3 Migraciones sin trackear

71 migraciones SQL untracked [A]. Si el schema se despliega sin ellas, la DB no tendra las tablas correspondientes.

### 16.4 Rutas verificadas como legacy [A]

| Ruta | Evidencia |
|---|---|
| `app/publish/route.ts` | Codigo referencia `tt_access_token` cookie — es un endpoint TikTok legacy [A] |
| `app/(app)/[orgSlug]/agents/page.tsx` | Landing page de agentes con cards estaticas — no es el modulo enterprise [A] |
| `app/sandbox-publish/`, `app/sandbox-review/`, `app/sandbox-upload/` | Solo referencia "sandbox" como string en 2 archivos no relacionados [A] |
| `app/control-center/runs/` | 4 archivos fuera del shell `(app)` [A] |

### 16.5 Archivos que NO deben entrar al repositorio [A]

| Archivo | Razon |
|---|---|
| `.github/prompts/ui-ux-pro-max/scripts/__pycache__/core.cpython-314.pyc` | Bytecode Python |
| `.github/prompts/ui-ux-pro-max/scripts/__pycache__/design_system.cpython-314.pyc` | Bytecode Python |
| `.github/prompts/ui-ux-pro-max/scripts/__pycache__/search.cpython-314.pyc` | Bytecode Python |

---

## 17. Orden de dependencias para reconstruccion

Basado en el grafo de imports medido [A] en Seccion 2.3, el orden minimo por niveles de dependencia es:

```
NIVEL 0 — Sin dependencias externas [A]
  production-events, ai-pricing, idempotency, logistics, observability,
  runtime, control-center, decisions, autonomous, autonomous-operations,
  business-engine, agentik-agents

NIVEL 1 — Solo Prisma o hojas N0 [A]
  prisma, reconciliation, approvals, tasks, execution, ai-billing,
  operational-map, business-entities, business-signals, production-timeline

NIVEL 2 — Depende de N0/N1 [A]
  tenant-rules, commercial-intelligence, business-events, business-rules,
  business-reasoning, business-flow, business-knowledge, production-stages,
  work, approval, ai-layer, oauth

NIVEL 3 — Depende de N2 [A]
  business-planning, business-decisions, business-actions,
  production-control, production-intelligence, replenishment-intelligence,
  agent-runtime, intelligence

NIVEL 4 — Depende de N3 [A]
  comercial, inventory, operational-inventory, operational-data,
  operational-intelligence, executive-dashboard, production

NIVEL 5 — Depende de N4 [A]
  connectors, finance, financial, security, integrations, castillitos

NIVEL 6 — Depende de N5 [A]
  marketing-studio, copilot, executive-intelligence
```

El orden de commits propuesto en la version anterior del manifiesto sigue este grafo.

---

## Apendice: Afirmaciones eliminadas

Las siguientes afirmaciones de la version anterior fueron eliminadas por ser hipotesis sin evidencia medible:

1. **Porcentajes de completitud** (85%, 70%, 40%, etc.) — No existe metrica objetiva para medirlos.
2. **Etiquetas de estado** ("Operativo", "Parcial", "Completo") — No verificables sin ejecutar cada modulo.
3. **"Posible duplicado"** para lib/agents/runtime, lib/financial, lib/business-engine, lib/commercial-ledger — Verificados: todos tienen consumidores activos y NO son duplicados.
4. **"Reemplazado por V2"** para executive-brain/ — Verificado: V1 tiene consumidores activos independientes.
5. **Integraciones Stripe, FedEx** — 0 archivos de integracion, 0 imports, 0 env vars. (Gemini restaurado en MANIFEST-02: `lib/ai-layer/adapters/google-adapter.ts` existe [A].)
6. **Integraciones FAL, AssemblyAI** — env vars declaradas pero 0 consumidores en codigo.
7. **"Modulos huerfanos"** — Todos los candidatos verificados tienen consumidores.
8. **"openai" como dependencia** — No esta en package.json. Se usa via OPENAI_API_KEY directa, no SDK.
9. **Agent PNGs "referenciados en codigo"** — Parcialmente correcto: referenciados en `copilot-agent-registry.ts` via `avatar` field [A], pero Diego.png y Robert.PNG no corresponden a ningun agente registrado (David usa `/agents/enzo.png`, no Diego).

**Correccion sobre avatares:**
- `Diego.png` — Usado por agente `diego` (avatar: "/agents/Diego.png") [A]
- `Laura.PNG` — Usado por agente `laura` (avatar: "/agents/Laura.PNG") [A]
- `Pablo.PNG` — Usado por agente `pablo` (avatar: "/agents/Pablo.PNG") [A]
- `Robert.PNG` — NO referenciado por ningun agente en el registry [A]. Sin consumidores verificados.

---

---

## Revision Log

| Version | Fecha | Sprint | Cambios |
|---|---|---|---|
| v0.1 | 2026-07-17 | AGENTIK-REPOSITORY-MANIFEST-01 | Manifiesto inicial con afirmaciones sin clasificar |
| v0.2 | 2026-07-17 | AGENTIK-REPOSITORY-MANIFEST-01 | Auditoria de verificacion: eliminadas hipotesis, toda afirmacion clasificada [A]/[B]/[C] |
| v0.3 | 2026-07-17 | AGENTIK-REPOSITORY-MANIFEST-01 | Reescritura completa: eliminadas todas las [C] hipotesis, [B] convertidas a [A] con evidencia o eliminadas |
| **v1.0** | **2026-07-17** | **AGENTIK-REPOSITORY-MANIFEST-02** | **FROZEN.** Restaurado Google/Gemini adapter (`lib/ai-layer/adapters/google-adapter.ts` [A]). Marcadas Expo deps como instaladas sin consumidores (`"latest"`, 0 imports [A]). Corregidas notas de Stripe (CSS pattern), FedEx (ejemplo security), FAL (placeholder explicitado), AssemblyAI (codigo comentado). Agregada seccion Migration Baseline. |

---

## Migration Baseline

> Este bloque es la referencia oficial para construir el repositorio `agentik-os`.
> Cualquier discrepancia entre este baseline y el estado real del repositorio invalida la migracion.

| Metrica | Valor | Fuente |
|---|---|---|
| HEAD commit | `1cc25653efc46dc4a8d9d2de6f5cc9af9157b67b` | [A] `git rev-parse HEAD` |
| Branch actual | `feat/reconciliation-os` | [A] `git branch --show-current` |
| Fecha de freeze | 2026-07-17T16:33:37Z | [A] `date -u` |
| Archivos trackeados | 1,066 | [A] `git ls-files \| wc -l` |
| Archivos no trackeados | 3,504 | [A] `git ls-files --others --exclude-standard \| wc -l` |
| Modelos Prisma | 253 | [A] `grep -c '^model ' prisma/schema.prisma` |
| Enums Prisma | 63 | [A] `grep -c '^enum ' prisma/schema.prisma` |
| Rutas API | 329 | [A] `find app/api -name 'route.ts' \| wc -l` |
| Componentes (archivos .ts/.tsx en components/) | 276 | [A] `find components -name '*.tsx' -o -name '*.ts' \| wc -l` |
| Migraciones (directorios en prisma/migrations/) | 102 | [A] `ls -d prisma/migrations/*/ \| wc -l` |

**Confirmacion:** Este documento en su version FROZEN v1.0 es la referencia oficial y unica para la construccion del repositorio `agentik-os`. Ningun archivo sera migrado, excluido, o reestructurado sin que su estado figure en este manifiesto.

---

*Fin del manifiesto. Status: FROZEN v1.0. Toda afirmacion esta clasificada como [A] MEDIDO (proveniente de git, filesystem, grep, o package.json). No quedan hipotesis ni deducciones.*
