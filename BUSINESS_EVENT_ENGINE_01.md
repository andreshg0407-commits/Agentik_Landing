# BUSINESS-EVENT-ENGINE-01 — Operational Event Engine

**Sprint:** BUSINESS-EVENT-ENGINE-01
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained, zero regressions)

---

## Vision

The Operational Event Engine transforms Agentik from a module-based architecture into an event-driven enterprise operating system. Modules no longer call each other directly — they produce events. Engines consume events.

**A Signal = a condition exists.**
**An Event = a transition happened.**

| Concept | Example | Layer |
|---|---|---|
| Signal | "Stock critico" | Condition |
| Event | "Stock paso de critico a agotado" | Transition |

---

## Architecture

```
Business Signal (condition)
    ↓ signal lifecycle transition
Business Event (transition)          ← THIS SPRINT
    ↓ consumed by
Rule Engine (evaluation)             → future
    ↓
Planning Engine (what to do)         → future
    ↓
Action Engine (execute)              → future
    ↓
Executive Intelligence (inform)
    ↓
David / Copilot (advise)
```

**BUSINESS EVENT RULE:** Modules do not execute consequences directly. When something relevant occurs, they emit a Business Event. Rules, actions, notifications, recommendations, and executive updates fire from events.

---

## Files created

| File | Purpose |
|---|---|
| `lib/business-events/event-types.ts` | EventEntityRef, BusinessEventType (50+ types across 10 domains), nextEventId() |
| `lib/business-events/event-category.ts` | EventCategory (13 categories) |
| `lib/business-events/event-source.ts` | EventSource (10 sources) |
| `lib/business-events/event-severity.ts` | EventSeverity (6 levels), compareEventSeverity(), meetsEventSeverityThreshold() |
| `lib/business-events/event-priority.ts` | EventPriority (5 levels), compareEventPriority() |
| `lib/business-events/event-lifecycle.ts` | EventStatus (9 states), isTerminalEventStatus(), isProcessableEventStatus() |
| `lib/business-events/event-payload.ts` | EventPayload (summary, before/after/delta, metrics, documents, references, amounts, quantities, dates), buildEventPayload(), buildStateChangePayload() |
| `lib/business-events/event-correlation.ts` | EventCorrelation (9 fields), createCorrelationId(), buildEventCorrelation(), linkEvents(), buildChildCorrelation(), sameCorrelation() |
| `lib/business-events/event-trace.ts` | EventTrace (12 fields), buildEventTrace(), buildSignalTrace(), buildWorkflowTrace(), buildSyncTrace(), buildManualTrace() |
| `lib/business-events/event.ts` | BusinessEvent (22 fields) |
| `lib/business-events/event-builder.ts` | buildEvent(), eventFromSignal(), eventFromSignalTransition(), eventFromWorkflowTransition(), eventFromEntityChange(), eventFromSyncResult(), eventDedupKey() |
| `lib/business-events/event-engine.ts` | IEventEngine (15 methods), InMemoryEventEngine, EventFilter, EventDeduplicationResult, EventTimelineEntry |
| `lib/business-events/event-utils.ts` | 23 utility functions: filtering, sorting, aggregation, correlation analysis, causation chains |
| `lib/business-events/index.ts` | Client-safe barrel export |

---

## Business Event types by domain

### Inventory
`inventory_stock_critical_detected` | `inventory_out_of_stock_detected` | `inventory_stock_recovered` | `inventory_transfer_suggested`

### Commercial
`commercial_order_created` | `commercial_order_blocked` | `commercial_order_unblocked` | `commercial_order_fulfilled` | `commercial_customer_inactive_detected`

### Vendor
`vendor_portfolio_updated` | `vendor_portfolio_reference_out_of_stock` | `vendor_goal_reached` | `vendor_order_blocked`

### Portfolio / Maletas
`portfolio_reference_added` | `portfolio_reference_removed` | `portfolio_reference_out_of_stock` | `portfolio_needs_update`

### Store / Tiendas
`store_out_of_stock` | `store_stock_recovered` | `store_transfer_needed`

### Production
`production_order_created` | `production_order_closed` | `production_stage_entered` | `production_stage_completed` | `production_delayed` | `production_finished_goods_entered`

### Workflow
`workflow_started` | `workflow_stage_entered` | `workflow_stage_completed` | `workflow_blocked` | `workflow_completed`

### Financial
`financial_payment_received` | `financial_reconciliation_completed` | `financial_reconciliation_exception`

### Collection
`collection_account_overdue` | `collection_payment_promise_created` | `collection_risk_detected`

### Signal lifecycle
`signal_created` | `signal_activated` | `signal_resolved` | `signal_escalated` | `signal_expired` | `signal_ignored` | `signal_merged` | `signal_compound_created`

### System
`sync_completed` | `sync_failed` | `data_stale_detected` | `ai_alert_generated`

### Custom
`custom_${string}` (extensible template literal type)

---

## Event lifecycle

```
created → published → processing → processed
                                  → failed
                                  → ignored
                                  → superseded
                                  → expired
```

Terminal: `processed`, `failed`, `ignored`, `superseded`, `expired`.
Processable: `created`, `published`.

---

## Event payload

Captures WHAT changed:

```typescript
interface EventPayload {
  summary: string;                    // "Stock: 9 → 0"
  before: Record<string, unknown>;    // { stock: 9 }
  after: Record<string, unknown>;     // { stock: 0 }
  delta: Record<string, unknown>;     // { stock: { from: 9, to: 0 } }
  metrics: EventPayloadMetric[];      // quantitative data
  documents: EventPayloadDocument[];  // document references
  references: EventPayloadReference[];// entity/external refs
  amounts: EventPayloadAmount[];      // monetary values
  quantities: EventPayloadQuantity[]; // physical quantities
  dates: EventPayloadDate[];          // relevant dates
  metadata: Record<string, unknown>;  // domain-specific
}
```

---

## Event correlation

Groups related events so downstream consumers understand causation chains.

```typescript
interface EventCorrelation {
  correlationId: string;              // shared group ID
  causationId: string | null;         // direct cause event
  parentEventId: string | null;       // hierarchical parent
  rootEventId: string | null;         // original trigger
  relatedSignalIds: string[];         // connected signals
  relatedEventIds: string[];          // sibling events
  relatedWorkflowInstanceId: string | null;
  relatedReasoningChainId: string | null;
  relatedEntityIds: string[];
}
```

Example: `inventory_out_of_stock_detected` and `commercial_order_blocked` share a `correlationId` because one caused the other.

---

## Event trace

Every event MUST carry traceability. No event without trace is valid.

```typescript
interface EventTrace {
  origin: string;
  sourceSignalId: string | null;
  sourceObservationIds: string[];
  sourceEntitySnapshotIds: string[];
  sourceWorkflowInstanceId: string | null;
  sourceReasoningChainId: string | null;
  sourceUserId: string | null;
  sourceSyncRunId: string | null;
  evidence: TraceEvidenceItem[];
  createdBy: string;
  traceMetadata: Record<string, unknown>;
}
```

Quick trace builders: `buildSignalTrace()`, `buildWorkflowTrace()`, `buildSyncTrace()`, `buildManualTrace()`.

---

## Event deduplication

Deterministic dedup key: `{organizationId}:{entityId}:{eventType}:{occurredAt}`

InMemoryEventEngine maintains a dedup index. Publishing an event with a known key returns the existing event instead of creating a duplicate.

---

## Relationship with Business Signals

Events originate FROM signals via two builders:

| Builder | When to use |
|---|---|
| `eventFromSignal()` | A signal's existence is itself noteworthy |
| `eventFromSignalTransition()` | A signal changed lifecycle state (new→active, active→resolved, etc.) |

Signal lifecycle transitions map to event types:
- `new→active` → `signal_activated`
- `active→resolved` → `signal_resolved`
- `active→expired` → `signal_expired`
- `active→ignored` → `signal_ignored`

---

## Relationship with Business Entities

Events reference entities via `EventEntityRef` (compatible with `EntityRef` and `SignalEntityRef`). The `eventFromEntityChange()` builder creates events from entity state transitions with automatic delta computation.

Events NEVER import one BusinessEntity from another. Relations are resolved via BusinessEntityRelation or Knowledge Graph.

---

## Relationship with Knowledge Graph

Not wired yet. Future enrichment: when an event fires, the Knowledge Graph can resolve related entities to build a richer correlation. The `EventCorrelation.relatedEntityIds` field is ready for this.

---

## Relationship with Reasoning

`EventTrace.sourceReasoningChainId` links events to reasoning chains. Events can feed back into the Reasoning pipeline as new Observations or Signals.

---

## Relationship with Workflow Engine

`eventFromWorkflowTransition()` creates events from workflow stage transitions. Maps to `workflow_started`, `workflow_stage_entered`, `workflow_stage_completed`, `workflow_blocked`, `workflow_completed`. Compatible with the `WorkflowEventType` already documented in `lib/business-flow/workflow-engine.ts`.

---

## Relationship with Rule Engine (future)

Rule Engine will be the first natural consumer of Business Events:

```
Business Event
    ↓
Rule Engine (evaluate conditions)
    ↓
Planning Engine (determine actions)
    ↓
Action Engine (execute with approval)
```

Not implemented. Documented as architectural roadmap.

---

## Relationship with Planning Engine (future)

Planning Engine will consume evaluated rules and produce action plans. Events provide the trigger. Not implemented.

---

## Relationship with Action Engine (future)

Action Engine will execute approved plans. All actions will carry `suggestedOnly: true` until the approval system is integrated. Not implemented.

---

## Relationship with Executive Intelligence

Executive Intelligence will consume events for:
- **Timeline**: Entity event history via `buildTimeline()`
- **Alerts**: High-severity events become executive alerts
- **Daily report**: "What happened today" powered by events
- **Trend analysis**: Event patterns over time

Not wired yet. The `EventTimelineEntry` type is ready.

---

## Case: Castillitos — referencia agotada

```
1. SAG sync detects stock = 0 for REF-001
   ↓
2. Signal: inventory_out_of_stock (condition declared)
   ↓
3. Event: inventory_out_of_stock_detected (transition recorded)
   ↓ correlation propagation
4. Knowledge Graph: REF-001 → maletas, vendedores, pedidos, clientes, produccion
   ↓
5. Event: commercial_order_blocked (correlated, same correlationId)
   ↓
6. Event: vendor_portfolio_reference_out_of_stock (correlated)
   ↓
7. Reasoning: riesgo comercial (consumes events via signals)
   ↓
8. Rule Engine (future): IF agotado + maleta activa + pedidos abiertos
   ↓
9. Planning (future): retirar muestra, revisar produccion, sugerir traslado
   ↓
10. Action (future): notificar vendedor, alertar produccion, actualizar informes
```

Steps 1-7 are architecturally ready. Steps 8-10 are future sprints.

---

## Event Engine contract

```typescript
interface IEventEngine {
  // Publishing
  publish(event: BusinessEvent): Promise<BusinessEvent>;
  publishMany(events: BusinessEvent[]): Promise<BusinessEvent[]>;

  // Processing
  markProcessed(eventId: string): Promise<BusinessEvent | null>;
  markFailed(eventId: string, reason?: string): Promise<BusinessEvent | null>;
  ignore(eventId: string, reason?: string): Promise<BusinessEvent | null>;
  supersede(eventId: string, supersededByEventId: string): Promise<BusinessEvent | null>;
  expire(organizationId: string, olderThan: string): Promise<number>;

  // Queries
  findEvents(filter: EventFilter): Promise<BusinessEvent[]>;
  findByEntity(orgId: string, entityId: string): Promise<BusinessEvent[]>;
  findBySignal(orgId: string, signalId: string): Promise<BusinessEvent[]>;
  findByCorrelation(correlationId: string): Promise<BusinessEvent[]>;
  getEvent(eventId: string): Promise<BusinessEvent | null>;

  // Aggregation
  groupEvents(filter: EventFilter, groupBy: EventGroupKey): Promise<EventGroup[]>;

  // Deduplication
  deduplicate(events: BusinessEvent[]): EventDeduplicationResult;

  // Timeline
  buildTimeline(orgId: string, entityId: string, limit?: number): Promise<EventTimelineEntry[]>;
}
```

---

## Roadmap

1. **BUSINESS-EVENT-ENGINE-02**: Persistence (Prisma models for events)
2. **BUSINESS-EVENT-ENGINE-03**: Wire Signal Engine to emit events on lifecycle transitions
3. **BUSINESS-EVENT-ENGINE-04**: Wire Workflow Engine to emit events on stage transitions
4. **BUSINESS-RULE-ENGINE-01**: First rule evaluation consuming events
5. **BUSINESS-PLANNING-ENGINE-01**: Action planning from evaluated rules
6. **BUSINESS-ACTION-ENGINE-01**: Supervised action execution
7. **EXECUTIVE-INTELLIGENCE-04**: Event-driven executive timeline and daily report

---

## Rules enforced

- No Prisma, no React, no UI, no server-only — pure domain contracts
- Every event carries trace (no event without traceability)
- Every event carries correlation (events are always linked)
- Events represent TRANSITIONS, not conditions (that's Signals)
- Modules produce events, engines consume events
- Priority is independent of severity
- Deduplication via deterministic dedup key
- Event Engine is interface-first (IEventEngine contract)
- InMemoryEventEngine provided for testing only
- BusinessEntity Isolation Rule maintained
- Compatible with BusinessEntityType, SignalEntityRef, WorkflowEventType
