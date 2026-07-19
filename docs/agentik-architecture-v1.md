# Agentik Architecture v1

Internal engineering reference document.
Status: **canonical** — all new modules must follow this document.

---

## 1. Purpose

Agentik is a multi-tenant operational intelligence platform. It connects organizations to their data sources (ERPs, channels, documents), processes that data through a structured pipeline, and surfaces the results as runs, events, alerts, and knowledge — all scoped to a tenant hierarchy.

It is not a general-purpose app builder, a chat interface, or an analytics dashboard. Every module exists to close the loop: ingest → process → observe → act.

The system is designed so that a new vertical (accounting, inventory, logistics, HR) can be added without changing the data model or the platform core. Vertical-specific logic lives in connectors, sync services, and module-scoped actions — never in shared infrastructure.

---

## 2. Core Modules

These modules form the operational backbone. They are always present regardless of which verticals an organization has enabled.

| Module | Purpose |
|---|---|
| **Runs** | Tracks every background operation: sync, index, agent execution. The system of record for what happened and when. |
| **Events** | Domain event bus. Every significant state change emits an event. Events drive Rules. |
| **Alerts** | Surfaced issues requiring human attention. Always have severity (CRITICAL / WARNING / INFO) and status (OPEN / ACKNOWLEDGED / RESOLVED). |
| **Documents** | Formal business documents (invoices, bank statements, contracts). Linked to FileObjects for storage. |
| **Knowledge** | Structured, indexed content derived from Documents or other sources. Used as context for agents and queries. |
| **Agentik Query** | Cross-module query interface. Answers deterministic operational questions without requiring an LLM call. |
| **Integrations** | Connections to external systems (ERP, channels, payment processors). Each integration has a provider, secrets, and config. |

---

## 3. System Layers

The platform is organized into four layers. Dependencies only flow downward.

```
┌─────────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER                                             │
│  app/(app)/[orgSlug]/...         Next.js server + client        │
│  Server Components · Server Actions · Client Components         │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│  API LAYER                                                      │
│  app/api/...                     Next.js Route Handlers         │
│  Auth guards · Input validation · HTTP error mapping            │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│  SERVICE LAYER                                                  │
│  lib/alerts/  lib/documents/  lib/knowledge/                    │
│  lib/runs/    lib/events/     lib/agentik/                      │
│  lib/sync/pya/                                                  │
│  Business logic · Prisma transactions · Run/Event emission      │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│  CONNECTOR LAYER                                                │
│  lib/connectors/pya/                                            │
│  External protocol adapters · No DB access · No business logic  │
│  Only: auth config, raw API calls, row-level mapping            │
└─────────────────────────────────────────────────────────────────┘
```

### Layer responsibilities

**Presentation layer** — renders data and collects user input. May call Server Actions directly or POST to API routes. Never calls Prisma directly. Never contains sync logic.

**API layer** — validates auth, parses and validates input, calls service functions, maps errors to HTTP status codes. No business logic. Route handlers must be thin.

**Service layer** — the only place where business decisions are made. All Prisma calls happen here. Every significant operation creates a Run and emits an Event. Services are pure TypeScript functions with typed params and typed returns.

**Connector layer** — wraps external systems. Has no knowledge of the Agentik DB schema. Receives a config object, makes external calls, returns raw data. Mapping happens at the connector boundary before data enters the service layer.

---

## 4. Tenant Hierarchy

All data is scoped to a tenant hierarchy. Every model carries `organizationId` at minimum.

```
Organization
  └── Workspace           (brand / client / department)
        └── Project       (technical initiative with a stable `key`)
              └── ...     (agents, integrations, runs, documents, etc.)
```

Rules:
- `organizationId` is **always required** on every entity.
- `workspaceId` is optional — used when data belongs to a specific brand or client.
- `projectId` is optional — used when an operation is scoped to a technical initiative.
- Workspace scoping flows through `Project.workspaceId`, not directly on most entities. Exceptions: `Document`, `ProductSnapshot`, `OrderSnapshot` carry `workspaceId` directly for cross-project queries.

---

## 5. Canonical Data Flow

This is the standard flow for any integration sync operation. All new operations must follow this pattern.

```
1. API route / Server Action receives request
        │
        ▼
2. Auth guard validates user + org membership
   (requireIntegrationAccess / requireOrgAccess)
        │
        ▼
3. Service function is called with typed params
        │
        ▼
4. Service loads integration record from DB
   (secretsJson + configJson)
        │
        ▼
5. getPyaConfig() / equivalent extracts typed config
        │
        ▼
6. Run.create({ status: RUNNING }) — observability starts
        │
        ▼
7. Connector is called (fetch/SOAP/REST/etc.)
   Returns raw rows/objects
        │
        ▼
8. Each row is mapped via connector mapper
   mapSagRowToProduct() / equivalent
        │
        ▼
9. Mapped data is upserted via @@unique key
   (organizationId + sourceSystem + sourceId)
        │
        ▼
10. $transaction: Run.update(SUCCEEDED) + Event.create(PROCESSED)
        │
        ▼
11. Service returns { runId, synced, failed }
        │
        ▼
12. API route returns { ok: true, result }
```

On any failure at steps 7–9: `Run.update({ status: FAILED, errorJson })` then re-throw.

---

## 6. Rules for Integrations

### Integration record

Every external system connection is represented by a single `Integration` row with:
- `provider` — enum value from `IntegrationProvider` (PYA, SHOPIFY, STRIPE, etc.)
- `secretsJson` — credentials, tokens, endpoint URLs. Encrypted at rest by the app layer. Never logged.
- `configJson` — non-sensitive settings. For connectors using query-based APIs (SAG, etc.), this holds the query strings.
- `status` — CONNECTED / DISCONNECTED / ERROR. Updated after sync.

### Connector structure

Each provider gets its own directory: `lib/connectors/{provider}/`

Required files:
```
lib/connectors/{provider}/
  types.ts      — all TypeScript types for this connector (config, raw rows, faults)
  auth.ts       — getPyaConfig() or equivalent — reads secretsJson, returns typed config
  client.ts     — external API calls only — no DB, no business logic
  mappers.ts    — raw row → MappedProductSnapshot / MappedOrderSnapshot / etc.
```

Rules:
- Connectors never import from `lib/prisma` or any service.
- Authentication is always encapsulated in `auth.ts`. Never hardcode credentials.
- `client.ts` functions take a typed config object as their first argument.
- Mappers must handle missing/null columns gracefully. Unknown columns must not throw.
- For query-based systems (SAG, SQL-over-HTTP), queries are stored in `Integration.configJson`, never hardcoded in connector code.
- Add debug logging behind an environment variable (`{PROVIDER}_DEBUG=true`).

### Sync service structure

Each provider gets sync services under `lib/sync/{provider}/`

```
lib/sync/{provider}/
  sync-products.ts
  sync-orders.ts
  (future: sync-customers.ts, sync-inventory.ts, etc.)
```

Each sync service:
1. Loads integration from DB (`secretsJson` + `configJson`)
2. Extracts config via connector's `auth.ts`
3. Creates a Run
4. Calls the connector
5. Maps and upserts each row via `@@unique` key
6. Marks Run SUCCEEDED + emits Event — both in a `$transaction`
7. On failure: marks Run FAILED, re-throws

### Auth guard

API routes for integrations must call `requireIntegrationAccess(organizationId, integrationId, provider)` before any DB mutation. This function validates:
1. User is authenticated
2. User has an active Membership in the organization
3. The Integration exists, belongs to that org, and matches the expected provider

---

## 7. Rules for Runs, Events, and Alerts

### Runs

A `Run` is the system of record for every non-trivial background operation.

- Every sync, index, agent execution, and workflow invocation must create a Run.
- `type` is a dot-separated string identifying the operation: `integration.pya.sync_products`, `document.index`, `agent.conversation`.
- `status` lifecycle: `QUEUED → RUNNING → SUCCEEDED | FAILED | CANCELED`.
- `inputJson` — parameters the operation was called with (safe to log).
- `outputJson` — result summary (counts, IDs, metrics). Never raw API payloads.
- `errorJson` — failure details. Populated only on FAILED.
- `startedAt` / `endedAt` — set explicitly. Never rely on `createdAt` for duration calculation.
- Runs are always scoped to `organizationId`. `projectId` is set when the operation belongs to a specific initiative.

Do not create a Run for:
- Read-only queries
- Auth validation steps
- Simple CRUD operations triggered by users in the UI

### Events

An `Event` is an immutable fact that something happened.

- Every Run that succeeds must emit an Event documenting the outcome.
- `type` follows the domain-event naming convention: `noun.verb` in past tense — `integration.pya.products_synced`, `document.indexed`, `alert.created`.
- `sourceType` — who originated the event: `"integration"`, `"api"`, `"workflow"`, `"user"`, `"system"`.
- `sourceId` — the ID of the source entity (integrationId, userId, etc.).
- `runId` — link back to the Run that produced this event.
- `payloadJson` — summary data for Rules evaluation. Keep it small and flat.
- `status` lifecycle: `PENDING → PROCESSED | FAILED`.
- Events are append-only. Never update or delete them.

Events feed the Rules engine. Every Rule listens on a specific `eventType` and evaluates its `conditionJson` against the event payload.

### Alerts

Alerts are the human-facing output of the Rules engine (or manual creation).

- Always set `severity`: CRITICAL for blocking/urgent, WARNING for degraded/at-risk, INFO for informational.
- Always set `type` as a dot-separated domain string: `inventory.low`, `portfolio.overdue`, `sync.failed`.
- `sourceType` + `sourceId` identify what triggered the alert (an integration, a run, a workflow).
- `status` lifecycle: `OPEN → ACKNOWLEDGED → RESOLVED`.
- Never create duplicate open alerts for the same `(organizationId, type, sourceId)` without checking first.
- Alerts are displayed grouped by severity (CRITICAL first) in the UI.

---

## 8. Rules for Documents, Knowledge, and Snapshots

### Documents

A `Document` is a formal business record with a processing lifecycle.

- Always linked to a `FileObject` when a physical file exists. The `FileObject` holds storage pointers; the `Document` holds extracted metadata.
- `type` is a `DocumentType` enum value — be precise. Do not use `OTHER` unless the type is genuinely undetermined.
- `status` lifecycle: `PENDING → PROCESSING → PROCESSED | REVIEWED | REJECTED | ERROR`.
- `extractedJson` holds the structured output of document parsing. Shape is document-type-specific.
- Common fields (`issuerName`, `issuerId`, `amount`, `documentDate`) are denormalized on the Document for fast filtering. These are populated during processing, not at upload time.
- `createdById` must always be set for user-initiated uploads.
- Documents support soft-delete via `deletedAt`. Never hard-delete.

### Knowledge

A `KnowledgeItem` is structured, indexed content derived from a Document or other source.

- `title` — required. Should be human-readable and searchable.
- `content` — the searchable text content. Derived from the source; never user-free-typed.
- `contentJson` — traceability envelope: `{ sourceType, sourceId, runId, indexedAt, indexedBy }`. This is the canonical way to trace a KnowledgeItem back to its origin.
- `tags` — string array. Conventions: `"source:document"`, `"documentId:{id}"`, `"category:{slug}"`. Tags are the primary mechanism for filtering.
- `embeddingRef` — reserved for future vector search. Not used in v1.
- Every indexing operation must create a Run and emit a `document.indexed` event.
- KnowledgeItems must not be created outside of a service function. The UI triggers indexing via an API route; the service owns the transaction.
- Text search uses Prisma `contains` with `mode: "insensitive"`. Tag filtering uses `has`. Both are supported in `listKnowledgeItems`.

### Snapshots

`ProductSnapshot` and `OrderSnapshot` are connector-agnostic normalized representations of external data.

- `sourceSystem` — identifies the connector: `"pya"`, `"shopify"`, `"stripe"`.
- `sourceId` — the external system's primary key for this entity.
- The composite unique key `(organizationId, sourceSystem, sourceId)` enables idempotent upserts. Always use `upsert` via this key — never `create`.
- Normalized fields (`name`, `sku`, `price`, `status`) are the same regardless of which connector populated them. Connectors must map to these fields.
- `payloadJson` — the full raw row from the external system. Always populated for auditability.
- `syncedAt` — the timestamp of the last successful sync. Updated on every upsert.
- New connector types (customers, inventory, invoices) must follow the same pattern: define a new snapshot model with `(organizationId, sourceSystem, sourceId)` unique key.

---

## 9. What Belongs in the Service Layer (Not the App Layer)

The following must never be implemented directly in route handlers, Server Actions, or React components:

| Concern | Where it lives |
|---|---|
| Prisma queries | `lib/{module}/queries.ts` |
| Mutations and transactions | `lib/{module}/actions.ts` or `lib/sync/{provider}/` |
| Run creation and status updates | Service functions only |
| Event emission | Always inside the same `$transaction` as the triggering mutation |
| Alert creation | Service function, not inline in API routes |
| Connector calls | `lib/connectors/{provider}/client.ts` |
| Auth config extraction | `lib/connectors/{provider}/auth.ts` |
| Integration access validation | `lib/api/integration-auth.ts` |
| Org-level auth | `lib/auth/org-access.ts` |

Route handlers and Server Actions are allowed to:
- Call `requireOrgAccess` / `requireIntegrationAccess`
- Parse and validate input
- Call one service function
- Map the result to an HTTP response or returned object

They are not allowed to:
- Import `prisma` directly
- Construct Prisma queries inline
- Call connector functions directly
- Contain retry logic or transactional patterns

---

## 10. Naming and Design Conventions

### File and directory names

- Module service directories: `lib/{module}/` — singular noun (`lib/documents/`, `lib/knowledge/`, `lib/alerts/`)
- Connector directories: `lib/connectors/{provider}/` — provider slug in lowercase (`lib/connectors/pya/`)
- Sync service directories: `lib/sync/{provider}/` — same slug
- Query files: `{module}/queries.ts` — read-only Prisma queries
- Action files: `{module}/actions.ts` — mutations, transactions
- Server Actions: annotated `"use server"`, return `{ ok: true, data } | { ok: false, error: string }`

### API routes

- Integration-scoped: `app/api/integrations/{provider}/[integrationId]/{operation}/route.ts`
- Entity-scoped: `app/api/{entity}/route.ts` (list/create) and `app/api/{entity}/[entityId]/route.ts` (get/update)
- Dynamic param names must be semantic: `[integrationId]`, `[documentId]`, `[runId]` — not `[id]`

### App routes

- Module pages: `app/(app)/[orgSlug]/{module}/page.tsx`
- Detail pages: `app/(app)/[orgSlug]/{module}/[{module}Id]/page.tsx` — param name must match the entity
- Client panels in a page: co-located as `{module}-{action}-panel.tsx` (e.g., `pya-sync-panel.tsx`)

### Run types

Format: `{domain}.{provider_or_module}.{operation}` in snake_case.

Examples:
- `integration.pya.sync_products`
- `document.index`
- `agent.conversation`
- `workflow.n8n.execute`

### Event types

Format: `{domain}.{noun}_{past_tense_verb}` — no provider prefix; events describe what happened to a domain entity.

Examples:
- `integration.pya.products_synced`
- `document.indexed`
- `alert.created`
- `run.failed`

### Alert types

Format: `{domain}.{condition}` in dot notation.

Examples:
- `inventory.low`
- `sync.failed`
- `portfolio.overdue`
- `document.processing_error`

### Enum conventions

- Status fields use uppercase enums: `PENDING`, `RUNNING`, `SUCCEEDED`.
- Severity is ordered CRITICAL → WARNING → INFO. Always display and query in this order.
- Provider and source system identifiers in string fields use lowercase slugs: `"pya"`, `"shopify"`.

### JSON field conventions

| Field | Contents |
|---|---|
| `secretsJson` | Credentials. Encrypted. Never logged or returned to the client. |
| `configJson` | Non-sensitive settings. Can be read by service layer freely. |
| `metaJson` | Provider-side metadata (OAuth state, external IDs). |
| `inputJson` | Run input parameters. Safe to log. |
| `outputJson` | Run result summary. Counts, IDs. No raw payloads. |
| `errorJson` | Run failure details. `{ message: string }` minimum. |
| `payloadJson` | Full raw payload from external system. Stored for auditability, not queried. |
| `contentJson` | Structured content or traceability metadata (KnowledgeItem, Document). |
| `settingsJson` | Organization or workspace-level preferences. |

---

## 11. Future Vertical Modules

When adding a new vertical (accounting, logistics, HR, etc.):

1. **Define the domain models** — add new Prisma models if needed, or extend existing Snapshot models with a new `sourceSystem` value. Every new model needs `organizationId` and soft-delete (`deletedAt`) if user-facing.

2. **Create the connector** — `lib/connectors/{provider}/` with the four standard files. Connectors are provider-specific, not vertical-specific.

3. **Create the sync service** — `lib/sync/{provider}/sync-{entity}.ts`. Always follows the Run → fetch → map → upsert → Run/Event transaction pattern.

4. **Add API routes** — under `app/api/integrations/{provider}/[integrationId]/{operation}/route.ts`. Always use `requireIntegrationAccess`.

5. **Add the module UI** — under `app/(app)/[orgSlug]/{module}/`. Server component for the list/detail page, co-located client component for interactive panels.

6. **Register the module in the nav** — `app/(app)/[orgSlug]/layout.tsx`. Add only after the module has at minimum a working list page.

7. **Extend Agentik Query** — add a new query function in `lib/agentik/query-service.ts` and register its keyword in the input parser in `agentik-console.tsx`.

A vertical module is considered complete when:
- Data flows from external source → Snapshot → KnowledgeItem (if applicable)
- Every operation produces a Run
- Every successful Run produces an Event
- Errors surface as Alerts
- The module is visible in Agentik Query

---

## Appendix: Key File Map

```
lib/
  connectors/pya/
    types.ts              — PyaApiConfig, PyaConnectorConfig, SagRow, SagSoapFault
    auth.ts               — getPyaConfig(secretsJson) → PyaApiConfig
    client.ts             — consultaSagJson, fetchPyaProducts, fetchPyaOrders
    mappers.ts            — mapSagRowToProduct, mapSagRowToOrder

  sync/pya/
    sync-products.ts      — syncPyaProducts({ organizationId, integrationId, ... })
    sync-orders.ts        — syncPyaOrders({ organizationId, integrationId, ... })

  api/
    integration-auth.ts   — requireIntegrationAccess(orgId, integrationId, provider)
    org-auth.ts           — requireOrgMembership(organizationId)

  auth/
    org-access.ts         — requireOrgAccess(orgSlug) → { organization, membership }

  alerts/queries.ts       — listAlerts, getAlert (severity-ordered)
  runs/queries.ts         — listRuns, getRun
  events/queries.ts       — listEvents, getEvent
  documents/
    queries.ts            — listDocuments, getDocument
    actions.ts            — createDocument (Run + Event)
    knowledge-actions.ts  — indexDocumentAsKnowledge (Run + KnowledgeItem + Event)
  knowledge/queries.ts    — listKnowledgeItems (text + tag filters), getKnowledgeItem
  agentik/query-service.ts — getExecutiveOverview, getOpenAlertsSummary, getRecentRunsSummary, ...

prisma/schema.prisma      — canonical data model (single source of truth)
```
