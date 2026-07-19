# AGENTIK INVENTORY INDEX

> Indice maestro oficial del repositorio AGENTIK.
> Sprint: AGENTIK-REPOSITORY-INDEX-01 + INDEX-01A
> Fecha: 2026-07-17
> Referencia: AGENTIK_PROJECT_MANIFEST.md FROZEN v1.0
> Proposito: Mapa de navegacion para la construccion de agentik-os.

---

## 1. Repository Overview

| Metrica | Valor | Fuente |
|---|---|---|
| Directorios raiz | 26 | [A] `find . -maxdepth 1 -type d` |
| Total archivos (excl .git, node_modules, .next, open-design) | 5,002 | [A] `find . -type f` con exclusiones |
| Archivos trackeados | 1,066 | [A] `git ls-files \| wc -l` |
| Archivos no trackeados | 3,504 | [A] `git ls-files --others --exclude-standard \| wc -l` |
| Componentes (.ts/.tsx en components/) | 276 | [A] `find components` |
| Rutas API (route.ts) | 329 | [A] `find app/api -name 'route.ts'` |
| Modelos Prisma | 253 | [A] `grep -c '^model ' prisma/schema.prisma` |
| Enums Prisma | 63 | [A] `grep -c '^enum ' prisma/schema.prisma` |
| Migraciones | 102 | [A] `ls -d prisma/migrations/*/` |
| Engine files (*-engine*.ts) | 279 | [A] `find lib -name '*-engine*.ts'` |
| Integraciones externas verificadas | 16 | [A] Manifest FROZEN v1.0 Seccion 9 |
| Scripts | 473 | [A] `find scripts -type f \( -name '*.ts' -o -name '*.js' -o -name '*.cjs' \)` |
| Documentacion (docs/) | 90 | [A] `find docs -type f` |
| Documentacion (root .md) | 276 | [A] `find . -maxdepth 1 -name '*.md' -type f` |

---

## 2. Root Structure

| Directorio | Proposito | Criticidad | Archivos |
|---|---|---|---|
| `app/` | Paginas Next.js + API routes | CRITICO | 555 |
| `components/` | Componentes React | CRITICO | 276 |
| `lib/` | Logica de negocio, engines, servicios | CRITICO | 2,684 |
| `prisma/` | Schema, migraciones, seed | CRITICO | 106 |
| `public/` | Assets estaticos | OPERATIVO | 39 |
| `scripts/` | Auditoria, validacion, backfill | DESARROLLO | 499 |
| `docs/` | Documentacion tecnica | REFERENCIA | 90 |
| `hooks/` | React hooks custom | OPERATIVO | 5 |
| `types/` | Declaraciones TypeScript globales | OPERATIVO | 3 |
| `exports/` | Exportaciones de datos | DESARROLLO | 6 |
| `styles/` | Estilos adicionales | OPERATIVO | 1 |
| `.github/` | Prompts de IA | DESARROLLO | 31 |
| `.vercel/` | Config Vercel | INFRA | 2 |
| `.agent/` | Config agente IA | DESARROLLO | 31 |
| `.claude/` | Config Claude Code | DESARROLLO | 33 |
| `.codebuddy/` | Config CodeBuddy | DESARROLLO | 31 |
| `.codex/` | Config Codex | DESARROLLO | 31 |
| `.continue/` | Config Continue | DESARROLLO | 31 |
| `.cursor/` | Config Cursor | DESARROLLO | 31 |
| `.gemini/` | Config Gemini | DESARROLLO | 31 |
| `.kiro/` | Config Kiro | DESARROLLO | 31 |
| `.opencode/` | Config OpenCode | DESARROLLO | 31 |
| `.qoder/` | Config Qoder | DESARROLLO | 31 |
| `.roo/` | Config Roo | DESARROLLO | 31 |
| `.trae/` | Config Trae | DESARROLLO | 31 |
| `.windsurf/` | Config Windsurf | DESARROLLO | 31 |

Fuente: [A] `find . -maxdepth 1 -type d` + `find <dir> -type f | wc -l`

---

## 3. Application Tree

```
app/
  (app)/
    [orgSlug]/
      [workspaceSlug]/dashboard/
      agentik/
        agentes/[agentId]/
        configuracion/
        connection-audit/
        control-center/
        copilot-preview/
        marketing-studio/
          analytics/
          anuncios/
          biblioteca/atributos/
          campaigns/
          catalogos/[catalogId]/, nuevo/
          connections/
          distribution/
          foto-estudio/new/
          intake/
          new/
          orchestration/
          orchestrator/
          pauta/
          plantillas/
          presets/
          publicaciones/
          publishing/
          redes/new/
          review/
          shopify/
            banners/
            configuracion/
            estadisticas/
            operaciones/
            productos/
            promociones/
          social/
          tenants/
          video-editor/
        operational-map/
        runtime-admin/
        sag-contract-review/
      agents/luca/
      alerts/[alertId]/
      aprobaciones/
      collections/campaigns/, performance/
      comercial/
        clientes/[clienteId]/
        control/
        importaciones/
        inteligencia/
        inventario/
        maletas/
        pedidos/
        tiendas/
        vendedores/
        ventas/
      configuracion/branding/
      control-center/cobranza/
      copilot/approval-center/
      customer-360/
      dashboard/
      data-explorer/
      documents/[documentId]/, new/
      ejecuciones/
      events/[eventId]/
      executive/
      finance/
      finanzas/
        cierre/
        conciliacion/
        documentos/
        facturas/
        planeacion/presupuestos/[budgetId]/
        tesoreria/
        torre-control/
          cobros-hoy/
          cobros-identificados/
          consignaciones/
          cuentas-por-pagar/
      integrations/
        connectors/[connectorId]/
        pya/[integrationId]/
      knowledge/[knowledgeId]/
      operaciones/pedidos/[orderId]/accion/
      pipeline/
      produccion/
        alertas/
        consumos/
        costos/
        etapas/
        ordenes/
        timeline/
      reconciliation/sessions/[sessionId]/
      reports/scheduled/
      runs/[runId]/
      sag/
        articulos/nuevo/
        clientes/nuevo/
        write/[id]/
      sales/
        branches/[branchSlug]/
        channels/
        customers/[customerSlug]/
        lines/[lineSlug]/
        vendors/[sellerSlug]/
      tareas/
      workforce/
  actions/marketing-studio/
  api/                          → ver Seccion 6
  c/[slug]/                     → Catalogo publico
  control-center/runs/[runId]/  → Fuera del shell (app)
  lib/
  login/
  privacy/
  publish/                      → Legacy TikTok
  review/whatsapp/
  sandbox-publish/
  sandbox-review/
  sandbox-upload/
  terms/
  unauthorized/
```

Fuente: [A] `find app -type d -maxdepth 6 | sort`

---

## 4. Components Tree

| Categoria | Directorio | Componentes |
|---|---|---|
| **UI Primitives** | `components/ui/` | 57 |
| **Copilot** | `components/copilot/` | 33 |
| **Marketing Studio** | `components/marketing-studio/` | 108 |
|   — Ads | `marketing-studio/ads/` | 5 |
|   — Campaigns | `marketing-studio/campaigns/` | 10 |
|   — Catalogs | `marketing-studio/catalogs/` | 10 |
|   — Connections | `marketing-studio/connections/` | 1 |
|   — Distribution | `marketing-studio/distribution/` | 7 |
|   — Foto Estudio | `marketing-studio/foto-estudio/` | 1 |
|   — Library | `marketing-studio/library/` | 17 |
|   — Luca | `marketing-studio/luca/` | 1 |
|   — Orchestration | `marketing-studio/orchestration/` | 8 |
|   — Orchestrator | `marketing-studio/orchestrator/` | 10 |
|   — Publicaciones | `marketing-studio/publicaciones/` | 1 |
|   — Publishing | `marketing-studio/publishing/` | 10 |
|   — Review | `marketing-studio/review/` | 2 |
|   — Shared | `marketing-studio/shared/` | 11 |
|   — Shopify | `marketing-studio/shopify/` | 5 |
|   — Social | `marketing-studio/social/` | 8 |
|   — Video Editor | `marketing-studio/video-editor/` | 1 |
| **Executive** | `components/executive/` | 11 |
| **Agentik** | `components/agentik/` | 8 |
| **Workspace** | `components/workspace/` | 8 |
| **Operational Map** | `components/operational-map/` | 6 |
| **Shell** | `components/shell/` | 5 |
| **Finance** | `components/finance/` | 5 |
| **Reconciliation** | `components/reconciliation/` | 5 |
| **Runtime** | `components/runtime/` | 5 |
| **Layout** | `components/layout/` | 4 |
| **Approvals** | `components/approvals/` | 4 |
| **Tasks** | `components/tasks/` | 4 |
| **Work Executions** | `components/work-executions/` | 4 |
| **Comercial** | `components/comercial/` | 2 |
| **Operational Intelligence** | `components/operational-intelligence/` | 2 |
| **Collections** | `components/collections/` | 1 |
| **Documents** | `components/documents/` | 1 |
| **App** | `components/app/` | 1 |

**Total: 276 archivos**

Fuente: [A] `find components -maxdepth 2 -type d` + conteo por directorio

---

## 5. Library Tree

| Dominio | Directorio | Proposito | Archivos | Criticidad |
|---|---|---|---|---|
| **Copilot** | `lib/copilot/` | Sistema multi-agente, razonamiento, memoria | 744 | CRITICO |
| **Comercial** | `lib/comercial/` | Maletas, pedidos, tiendas, vendedores, inventario | 347 | CRITICO |
| **Marketing Studio** | `lib/marketing-studio/` | Contenido, shopify, ads, social, video | 299 | CRITICO |
| **Security** | `lib/security/` | Vault, KMS, MFA, RBAC, anomaly, compliance | 234 | CRITICO |
| **Integrations** | `lib/integrations/` | OAuth, shopify, tiktok, sag, dian, webhooks | 105 | CRITICO |
| **Finance** | `lib/finance/` | Runtime, graph, patterns, intelligence | 86 | CRITICO |
| **Reconciliation** | `lib/reconciliation/` | Engine, rules, loader, review, executions | 54 | CRITICO |
| **Connectors** | `lib/connectors/` | SAG PYA SOAP, CRM Castillitos | 47 | CRITICO |
| **Work** | `lib/work/` | Execution lifecycle, queues | 42 | OPERATIVO |
| **Agent Runtime** | `lib/agent-runtime/` | Action envelopes, execution graph | 41 | OPERATIVO |
| **Agents Runtime** | `lib/agents/` | Agent definitions, runtime engine | 33 | OPERATIVO |
| **Operational Map** | `lib/operational-map/` | KPI governance, source catalog | 33 | OPERATIVO |
| **SAG** | `lib/sag/` | Write layer, executive pack | 24 | CRITICO |
| **AI Billing** | `lib/ai-billing/` | Usage tracking, billing models | 21 | OPERATIVO |
| **Autonomous** | `lib/autonomous/` | Policy, risk engines | 17 | OPERATIVO |
| **AI Layer** | `lib/ai-layer/` | Multi-provider AI abstraction | 16 | CRITICO |
| **Business Planning** | `lib/business-planning/` | Planning models, decisions | 16 | OPERATIVO |
| **Operational Data** | `lib/operational-data/` | Agent context, entities | 16 | OPERATIVO |
| **Sales** | `lib/sales/` | CRM alerts, import | 16 | OPERATIVO |
| **Business Actions** | `lib/business-actions/` | Action engine | 15 | OPERATIVO |
| **Business Reasoning** | `lib/business-reasoning/` | Reasoning engine | 15 | OPERATIVO |
| **Approvals** | `lib/approvals/` | Approval workflow | 15 | OPERATIVO |
| **AI Pricing** | `lib/ai-pricing/` | Token pricing models | 14 | OPERATIVO |
| **Business Decisions** | `lib/business-decisions/` | Decision engine | 14 | OPERATIVO |
| **Business Events** | `lib/business-events/` | Event engine | 14 | OPERATIVO |
| **Tasks** | `lib/tasks/` | Task management | 14 | OPERATIVO |
| **Agentik** | `lib/agentik/` | Org activity, workspace | 13 | OPERATIVO |
| **Production Intelligence** | `lib/production-intelligence/` | Production flow, signals | 13 | OPERATIVO |
| **Business Rules** | `lib/business-rules/` | Rule engine | 13 | OPERATIVO |
| **Autonomous Operations** | `lib/autonomous-operations/` | Autonomous execution | 13 | OPERATIVO |
| **Business Entities** | `lib/business-entities/` | Core entity models | 12 | OPERATIVO |
| **Business Flow** | `lib/business-flow/` | Workflow engine | 12 | OPERATIVO |
| **Business Signals** | `lib/business-signals/` | Signal engine | 12 | OPERATIVO |
| **Collections** | `lib/collections/` | Queue, pipeline | 12 | OPERATIVO |
| **Decisions** | `lib/decisions/` | Decision fixtures | 12 | OPERATIVO |
| **Operational Inventory** | `lib/operational-inventory/` | Reconciliation, reservations | 12 | OPERATIVO |
| **WhatsApp** | `lib/whatsapp/` | Messaging, config, intent | 12 | OPERATIVO |
| **Business Knowledge** | `lib/business-knowledge/` | Knowledge graph | 11 | OPERATIVO |
| **Executive Dashboard** | `lib/executive-dashboard/` | Dashboard data | 11 | OPERATIVO |
| **Intelligence** | `lib/intelligence/` | Executive intelligence | 11 | OPERATIVO |
| **Auth** | `lib/auth/` | Auth guards, module access | 9 | CRITICO |
| **Financial** | `lib/financial/` | Observation engine | 9 | OPERATIVO |
| **Production** | `lib/production/` | Production core | 8 | OPERATIVO |
| **Agent Intelligence** | `lib/agent-intelligence/` | Runtime coordination | 6 | OPERATIVO |
| **Agent Memory** | `lib/agent-memory/` | Agent memory layer | 7 | OPERATIVO |
| **Agent Orchestration** | `lib/agent-orchestration/` | Delegation engine | 7 | OPERATIVO |
| **Agent Planning** | `lib/agent-planning/` | Planning, conflict | 7 | OPERATIVO |
| **Commercial Intelligence** | `lib/commercial-intelligence/` | Availability, replacement | 7 | OPERATIVO |
| **Production Events** | `lib/production-events/` | Event model | 7 | OPERATIVO |
| **Documents** | `lib/documents/` | Document processing | 6 | OPERATIVO |
| **Logistics** | `lib/logistics/` | Shipping, routes | 6 | OPERATIVO |
| **Observability** | `lib/observability/` | Logging, tracing | 6 | OPERATIVO |
| **OAuth** | `lib/oauth/` | OAuth providers | 6 | OPERATIVO |
| **Production Timeline** | `lib/production-timeline/` | Timeline engine | 6 | OPERATIVO |
| **Business Engine** | `lib/business-engine/` | Operational state | 5 | OPERATIVO |
| **Customer 360** | `lib/customer360/` | Customer profiles | 5 | OPERATIVO |
| **Idempotency** | `lib/idempotency/` | Idempotency keys | 5 | OPERATIVO |
| **Replenishment** | `lib/replenishment-intelligence/` | Replenishment engine | 5 | OPERATIVO |
| **Activation** | `lib/activation/` | Connector activation | 4 | OPERATIVO |
| **Alerts** | `lib/alerts/` | Alert definitions | 4 | OPERATIVO |
| **Approval** | `lib/approval/` | Execution approval | 4 | OPERATIVO |
| **Bootstrap** | `lib/bootstrap/` | Module bundles | 4 | OPERATIVO |
| **Business Structure** | `lib/business-structure/` | Org structure | 4 | OPERATIVO |
| **Control Center** | `lib/control-center/` | Agent control | 4 | OPERATIVO |
| **Production Stages** | `lib/production-stages/` | Stage engine | 4 | OPERATIVO |
| **Runtime** | `lib/runtime/` | Runtime utilities | 4 | OPERATIVO |
| **Tenant Rules** | `lib/tenant-rules/` | Commercial rules | 4 | OPERATIVO |
| **UI** | `lib/ui/` | Design tokens, surfaces | 4 | CRITICO |
| **Castillitos** | `lib/castillitos/` | Tenant-specific logic | 3 | OPERATIVO |
| **Execution** | `lib/execution/` | Execution types | 3 | OPERATIVO |
| **Executive Intelligence** | `lib/executive-intelligence/` | Executive analysis | 3 | OPERATIVO |
| **Operational Intelligence** | `lib/operational-intelligence/` | Op intelligence | 3 | OPERATIVO |
| **Reports** | `lib/reports/` | Report generation | 3 | OPERATIVO |
| **Tenant** | `lib/tenant/` | Module config, branding | 3 | OPERATIVO |
| **Commercial Ledger** | `lib/commercial-ledger/` | Ledger types | 2 | OPERATIVO |
| **Agentik Agents** | `lib/agentik-agents/` | Agent resolver | 2 | OPERATIVO |
| **API** | `lib/api/` | API utilities | 2 | OPERATIVO |
| **Production Control** | `lib/production-control/` | Production planning | 2 | OPERATIVO |
| **Scheduled Reports** | `lib/scheduled-reports/` | Scheduled jobs | 2 | OPERATIVO |
| **Sync** | `lib/sync/` | Sync utilities | 2 | OPERATIVO |
| **Workforce** | `lib/workforce/` | Workforce management | 2 | OPERATIVO |
| **Dashboard** | `lib/dashboard/` | Dashboard types | 2 | OPERATIVO |
| **Email** | `lib/email/` | Email adapter | 1 | OPERATIVO |
| **Others (single files)** | `lib/{ai,customers,events,i18n,knowledge,notifications,orders,pipeline,runs,utils,workspace}/` | Various | 1 each | OPERATIVO |

**Total: 2,684 archivos en 96 subdirectorios**

Fuente: [A] `find lib -maxdepth 1 -type d` + conteo por subdirectorio

---

## 6. API Index

### Org-scoped routes (`app/api/orgs/[orgSlug]/`)

| Dominio | Rutas |
|---|---|
| Marketing Studio | 85 |
| Comercial | 29 |
| Agent Runtime | 20 |
| Operational Map | 14 |
| Integrations | 10 |
| Copilot | 9 |
| SAG Write | 8 |
| Reconciliation | 6 |
| Sales | 5 |
| Operational Inventory | 5 |
| Finance | 3 |
| Actions | 2 |
| Branding | 2 |
| Collections | 2 |
| Notifications | 2 |
| Scheduled Reports | 2 |
| Commercial Op Intelligence | 1 |
| Conciliar | 1 |
| Connectors | 4 |
| Customer 360 | 1 |
| Executive Intelligence | 1 |
| Operational Intelligence | 1 |
| Reports | 1 |
| Validate | 1 |

### System routes

| Dominio | Rutas | Ruta base |
|---|---|---|
| Internal (workers, tests, cron) | 56 | `app/api/internal/` |
| Integrations (OAuth callbacks) | 15 | `app/api/integrations/` |
| Documents | 8 | `app/api/documents/` |
| WhatsApp + WA + Meta | 8 | `app/api/whatsapp/` + `app/api/wa/` + `app/api/meta/` |
| TikTok | 5 | `app/api/tiktok/` |
| Luca | 5 | `app/api/luca/` |
| Alerts | 5 | `app/api/alerts/` |
| Cron | 4 | `app/api/cron/` |
| Runs | 2 | `app/api/runs/` |
| Auth | 1 | `app/api/auth/` |
| Debug | 1 | `app/api/debug/` |
| PYA | 1 | `app/api/pya/` |
| Public | 1 | `app/api/public/` |
| User | 1 | `app/api/user/` |

**Total: 329 rutas**

Fuente: [A] `find app/api -name 'route.ts'` agrupado por directorio

---

## 7. Prisma Index

| Elemento | Valor | Fuente |
|---|---|---|
| Schema | `prisma/schema.prisma` | [A] filesystem |
| Lineas | 9,789 | [A] `wc -l` |
| Models | 253 | [A] `grep -c '^model '` |
| Enums | 63 | [A] `grep -c '^enum '` |
| Migrations (tracked) | 31 | [A] `git ls-files prisma/migrations/` |
| Migrations (untracked) | 71 | [A] diferencia medida |
| Migrations (total dirs) | 102 | [A] `ls -d prisma/migrations/*/` |
| Seed | `prisma/seed.ts` | [A] filesystem |
| Config | `prisma.config.ts` (root) | [A] filesystem |
| Provider | PostgreSQL + @prisma/adapter-neon | [A] schema + package.json |

Fuente: [A] mediciones directas

---

## 8. Documentation Index

### docs/ (90 archivos)

| Categoria | Directorio | Archivos |
|---|---|---|
| Architecture | `docs/architecture/` | 25 |
| Implementation | `docs/implementation/` | 23 |
| Importaciones | `docs/importaciones/` | 12 |
| Discovery | `docs/discovery/` | 6 |
| Comercial | `docs/comercial/` | 6 |
| Certification | `docs/certification/` | 4 |
| Audit | `docs/audit/` | 4 |
| Integrations | `docs/integrations/` | 2 |
| Marketing Studio | `docs/marketing-studio/` | 1 |
| Business Rules | `docs/business-rules/` | 1 |
| Root docs/ | `docs/*.md` | 6 |

### Root .md files (276 archivos)

Sprint logs, audits, forensics, and decision documents acumulados en la raiz del proyecto.

Fuente: [A] `find docs` + `find . -maxdepth 1 -name '*.md'`

---

## 9. Scripts Index

| Categoria | Criterio | Archivos |
|---|---|---|
| Temporary (`_` prefix) | `_*` | 210 |
| Validation | `validate-*` | 127 |
| Integration harnesses | `scripts/integration/` | 27 |
| Test / Verify | `test-*`, `verify-*` | 25 |
| Audit | `audit-*` | 17 |
| Operational | `seed-*`, `setup-*`, `enable-*`, `refresh-*`, `export-*` | 6 |
| Certification | `certify-*` | 1 |
| Other (sin patron) | Residual | 60 |

**Total: 473 archivos**

Fuente: [A] `find scripts -type f \( -name '*.ts' -o -name '*.js' -o -name '*.cjs' \)` + clasificacion por nombre

---

## 10. Assets Index

### public/ (39 archivos total)

| Categoria | Directorio | Archivos |
|---|---|---|
| Agent Avatars | `public/agents/` | 8 |
| Uploads | `public/uploads/` | 22 |
| Assets | `public/assets/` | 1 |
| Root public files | `public/` (root) | 8 |

### Agent Avatars (8 archivos)

| Archivo | Referenciado en registry |
|---|---|
| Diego.png | Si (agente `diego`) |
| Laura.PNG | Si (agente `laura`) |
| Pablo.PNG | Si (agente `pablo`) |
| enzo.png | Si (agente `david`) |
| luca.png | Si (agente `luca`) |
| mila.png | Si (agente `mila`) |
| sofi.png | Si (agente `sofia`) |
| Robert.PNG | No |

Fuente: [A] `ls public/agents/` + `copilot-agent-registry.ts`

---

## 11. External Integrations Index

| Integracion | Estado |
|---|---|
| **SAG PYA SOAP** | Operativa |
| **CRM Castillitos** | Operativa |
| **Shopify** | Operativa |
| **Anthropic (Claude)** | Operativa |
| **Neon (PostgreSQL)** | Operativa |
| **Cloudflare R2** | Operativa |
| **Replicate** | Operativa |
| **DIAN** | Parcial |
| **WhatsApp** | Parcial |
| **TikTok** | Parcial |
| **Meta (Marketing)** | Parcial |
| **Google Drive** | Parcial |
| **OpenAI** | Parcial |
| **Google/Gemini** | Stub |
| **n8n** | Parcial |
| **Resend** | Parcial |
| **FFmpeg** | Stub |
| **FAL** | Placeholder |
| **AssemblyAI** | Placeholder |
| ~~Stripe~~ | No existe |
| ~~FedEx~~ | No existe |

Fuente: [A] Manifest FROZEN v1.0 Seccion 9 + verificaciones de background tasks

---

## 12. Quick Navigation

### Modulos de negocio

| Modulo | App Page | Lib | API |
|---|---|---|---|
| Comercial | `app/(app)/[orgSlug]/comercial/` | `lib/comercial/` | `app/api/orgs/[orgSlug]/comercial/` |
| Finanzas | `app/(app)/[orgSlug]/finanzas/` | `lib/finance/` + `lib/financial/` | `app/api/orgs/[orgSlug]/finance/` |
| Produccion | `app/(app)/[orgSlug]/produccion/` | `lib/production*/` | — |
| Marketing Studio | `app/(app)/[orgSlug]/agentik/marketing-studio/` | `lib/marketing-studio/` | `app/api/orgs/[orgSlug]/marketing-studio/` |
| Conciliacion | `app/(app)/[orgSlug]/finanzas/conciliacion/` | `lib/reconciliation/` | `app/api/orgs/[orgSlug]/reconciliation/` |
| Tesoreria | `app/(app)/[orgSlug]/finanzas/tesoreria/` | `lib/finance/` | `app/api/orgs/[orgSlug]/finance/` |
| Executive | `app/(app)/[orgSlug]/executive/` | `lib/executive-dashboard/` + `lib/executive-intelligence/` | `app/api/orgs/[orgSlug]/executive-intelligence/` |
| Pipeline | `app/(app)/[orgSlug]/pipeline/` | `lib/collections/` + `lib/pipeline/` | `app/api/orgs/[orgSlug]/collections/` |
| Documents | `app/(app)/[orgSlug]/documents/` | `lib/documents/` | `app/api/documents/` |
| Reports | `app/(app)/[orgSlug]/reports/` | `lib/reports/` | `app/api/orgs/[orgSlug]/reports/` |

### Modulos de plataforma

| Modulo | Ruta principal |
|---|---|
| Copilot | `app/(app)/[orgSlug]/copilot/` → `lib/copilot/` |
| Agentik | `app/(app)/[orgSlug]/agentik/` → `lib/agentik/` |
| Agent Runtime | `lib/agent-runtime/` + `lib/agents/runtime/` |
| AI Layer | `lib/ai-layer/` |
| Security | `lib/security/` |
| Integrations | `app/(app)/[orgSlug]/integrations/` → `lib/integrations/` |
| SAG | `app/(app)/[orgSlug]/sag/` → `lib/sag/` + `lib/connectors/` |
| Operational Map | `app/(app)/[orgSlug]/agentik/operational-map/` → `lib/operational-map/` |
| Tasks | `app/(app)/[orgSlug]/tareas/` → `lib/tasks/` |
| Approvals | `app/(app)/[orgSlug]/aprobaciones/` → `lib/approvals/` |
| Executions | `app/(app)/[orgSlug]/ejecuciones/` → `lib/work/` |
| Configuracion | `app/(app)/[orgSlug]/configuracion/` → `lib/tenant/` |

### Infraestructura

| Recurso | Ruta |
|---|---|
| Prisma Schema | `prisma/schema.prisma` |
| Auth | `lib/auth/` |
| UI Tokens | `lib/ui/tokens.ts` |
| Design System CSS | `app/design-system.css` |
| Shell | `components/shell/workspace-shell-client.tsx` |
| Module Nav | `components/shell/module-nav-config.ts` |
| Middleware | `middleware.ts` |

---

## Manifest Inconsistencies

| ID | Seccion Manifest | Dato Manifest | Dato medido (INDEX-01A) | Evidencia | Severidad |
|---|---|---|---|---|---|
| MI-01 | Seccion 1 — Total archivos en disco | 5,000 | 5,002 | [A] `find . -type f` excluyendo .git, node_modules, .next, open-design = 5,002 | MENOR — diferencia de 2 archivos, consistente con creacion del indice y manifest |
| MI-02 | Seccion 1 — Archivos modificados (tracked) | 56 | No re-verificado | `git status` es mutable; el Manifest registro un snapshot valido al momento de su creacion | INFO — no aplica re-medicion |
| MI-03 | Seccion 2.2 — components/marketing-studio/ total | 108 | 108 | [A] `find components/marketing-studio -type f \( -name '*.ts' -o -name '*.tsx' \) \| wc -l` = 108 | NINGUNA — consistente |
| MI-04 | Seccion 4 — Rutas API | 329 (corregido en MANIFEST-02) | 329 | [A] `find app/api -name 'route.ts' \| wc -l` = 329 | NINGUNA — consistente |
| MI-05 | Seccion 13 — Scripts total | 471 | 473 | [A] `find scripts -type f \( -name '*.ts' -o -name '*.js' -o -name '*.cjs' \) \| wc -l` = 473 | MENOR — +2 archivos respecto a medicion del Manifest |
| MI-06 | Seccion 13 — Scripts _ prefix | 209 | 210 | [A] `find scripts -maxdepth 1 -name '_*' -type f \| wc -l` = 210 | MENOR — +1 archivo |
| MI-07 | Seccion 13 — Scripts validate- | 129 | 127 | [A] `find scripts -maxdepth 1 -name 'validate-*' -type f \| wc -l` = 127 | MENOR — -2 archivos |
| MI-08 | Seccion 14.2 — Root .md untracked | 204 | 276 (total) / 204 (untracked no re-verificado) | [A] `find . -maxdepth 1 -name '*.md' -type f \| wc -l` = 276. El Manifest mide solo untracked; el indice mide todos. Metricas distintas, no son comparables | INFO — diferencia de alcance, no de dato |

**Resumen de inconsistencias:**
- 0 inconsistencias criticas
- 0 inconsistencias que invaliden el Manifest
- 3 diferencias menores (MI-05, MI-06, MI-07) de 1-2 archivos, consistentes con archivos creados entre mediciones
- 2 informativas (MI-02, MI-08) por diferencia de metrica o mutabilidad

El Manifest FROZEN v1.0 continua siendo la unica referencia oficial.

---

## Repository State

| Metrica | Valor | Fuente |
|---|---|---|
| HEAD commit | `1cc25653efc46dc4a8d9d2de6f5cc9af9157b67b` | [A] `git rev-parse HEAD` |
| Branch | `feat/reconciliation-os` | [A] `git branch --show-current` |
| Fecha de indice | 2026-07-17T16:33:37Z | [A] `date -u` |
| Archivos trackeados | 1,066 | [A] `git ls-files \| wc -l` |
| Archivos no trackeados | 3,504 | [A] `git ls-files --others --exclude-standard \| wc -l` |
| Total archivos en disco | 5,002 | [A] `find . -type f` con exclusiones |
| Modelos Prisma | 253 | [A] `grep -c '^model ' prisma/schema.prisma` |
| Enums Prisma | 63 | [A] `grep -c '^enum ' prisma/schema.prisma` |
| Rutas API | 329 | [A] `find app/api -name 'route.ts' \| wc -l` |
| Componentes | 276 | [A] `find components -name '*.tsx' -o -name '*.ts' \| wc -l` |
| Subdirectorios lib/ | 96 | [A] `find lib -maxdepth 1 -type d` |
| Subdirectorios components/ (depth 1) | 21 | [A] `find components -maxdepth 1 -type d` |
| Modulos app en [orgSlug] | 32 | [A] `find app/(app)/[orgSlug] -maxdepth 1 -type d` |
| Directorios app/ (total) | 591 | [A] `find app -type d` |
| Migraciones | 102 | [A] `ls -d prisma/migrations/*/` |
| Engine files | 279 | [A] `find lib -name '*-engine*.ts'` |
| Scripts | 473 | [A] `find scripts -type f` |

**Confirmacion:** Este indice fue construido sobre el mismo HEAD commit (`1cc2565`) que el Manifest FROZEN v1.0. Ambos documentos son complementarios y constituyen la referencia oficial para la construccion de agentik-os.

---

*Fin del indice. Toda cifra proviene de mediciones directas [A] sobre el estado del repositorio. No se ejecutaron operaciones Git.*
