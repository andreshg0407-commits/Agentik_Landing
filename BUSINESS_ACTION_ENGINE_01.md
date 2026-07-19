# BUSINESS-ACTION-ENGINE-01 — Controlled Execution Engine

**Sprint:** BUSINESS-ACTION-ENGINE-01
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained, zero regressions)

---

## Vision

The Action Engine closes the operational cycle:

```
Observe → Understand → Govern → Plan → Decide → Act → Observe again
```

Acting never means executing blindly. Every action is backed by a BusinessDecision, governed by policy, controlled by approval, traced to its origin, and produces an auditable result.

**Business Action Rule:** Modules do not execute actions as a consequence of rules or decisions. Modules expose capabilities. Action Engine orchestrates approved actions. Action Engine never skips Decision Engine, Approval, Trace, or Execution Result.

**Event Feedback Rule:** Every execution produces a result. Every relevant result can become a BusinessEvent, closing the cycle.

---

## Architecture

```
BusinessDecision (from Decision Engine)
    ↓
ActionContext (assembled by caller)
    ├─ decision
    ├─ plan
    ├─ selectedOption
    ├─ policy
    ├─ executionMode (default: dry_run)
    ├─ events[]
    ├─ signals[]
    └─ entitySnapshots[]
    ↓
IActionEngine.buildActionPlan()
    ├─ buildActionsFromDecision()    ← strategy → action types
    ├─ validateAction()              ← policy check
    ├─ checkApproval()               ← approval requirements
    └─ executeAction() / dryRunAction()
    ↓
ActionPlan
    ├─ actions[]                     ← BusinessAction[]
    │   ├─ approval                  ← ActionApproval
    │   ├─ policy                    ← ActionPolicy
    │   └─ trace                     ← ActionTrace (full provenance)
    ↓
ActionExecutionResult[]
    ├─ success / status
    ├─ receipt                       ← ActionReceipt
    ├─ eventsToEmit[]                ← suggested (NOT emitted)
    └─ nextActions[]                 ← suggested follow-ups
```

---

## Complete operational pipeline

```
Business Condition
    ↓ Signals (condition exists)
    ↓ Events (transition happened)
    ↓ Rules (which policies apply?)
    ↓ Plans (what alternatives exist?)
    ↓ Decisions (which is best? why?)
    ↓ Actions (controlled execution)
    ↓ Events (feedback from execution)
    ↓ Observe again
```

---

## Files created (15)

| File | Purpose |
|---|---|
| `lib/business-actions/action-types.ts` | ActionStatus(12), ActionType(18), ActionSource(8), ExecutionMode(4), ExecutionStatus(8), ActionApprovalStatus(6), ActionApprovalType(8), ActionTargetKind(9), ActionRiskLevel(5), nextActionId() |
| `lib/business-actions/action.ts` | BusinessAction (19 fields), buildBusinessAction() |
| `lib/business-actions/action-plan.ts` | ActionPlan (13 fields, executionMode default: dry_run), buildActionPlan() |
| `lib/business-actions/action-step.ts` | ActionStep (14 fields), ActionTarget, buildActionStep() |
| `lib/business-actions/action-approval.ts` | ActionApproval (11 fields), buildActionApproval(), approveAction(), rejectAction(), noActionApprovalNeeded() |
| `lib/business-actions/action-policy.ts` | ActionPolicy (11 fields), buildActionPolicy(), defaultSafePolicy(), checkPolicy(), PolicyCheckResult |
| `lib/business-actions/action-execution.ts` | ActionExecution (16 fields), buildActionExecution(), completeExecution() |
| `lib/business-actions/action-result.ts` | ActionExecutionResult (9 fields), SuggestedEvent, SuggestedNextAction, buildSuccessResult(), buildDryRunResult(), buildFailedResult(), buildApprovalRequiredResult() |
| `lib/business-actions/action-trace.ts` | ActionTrace (10 fields) — no execution without trace, buildActionTrace() |
| `lib/business-actions/action-receipt.ts` | ActionReceipt (10 fields), buildActionReceipt(), buildDryRunReceipt() |
| `lib/business-actions/action-context.ts` | ActionContext (10 fields), ActionEntitySnapshot, buildActionContext() |
| `lib/business-actions/action-engine.ts` | IActionEngine (8 methods), InMemoryActionEngine with strategy→actions mapping |
| `lib/business-actions/action-registry.ts` | ActionHandler contract, ActionRegistry, 18 built-in dry-run handlers, DEFAULT_HANDLERS |
| `lib/business-actions/action-utils.ts` | 15 utilities (actionsPendingApproval, isPlanComplete, allSuggestedEvents, actionPlanSummary, etc.) |
| `lib/business-actions/index.ts` | Client-safe barrel export |

---

## Safety rules

1. Every action is **dry_run** by default
2. Every action with external impact requires **approval**
3. Every action must have **trace**
4. Every action must generate **result**
5. Every failed action must preserve **error**
6. Every executed action can generate **eventsToEmit** (suggested, not emitted)
7. No destructive actions permitted in this sprint
8. No external APIs called
9. No SAG modifications
10. No real operational data modifications

---

## Action types (18)

| Type | Description |
|---|---|
| notification_send | Send notification |
| alert_create | Create alert |
| task_create | Create task |
| portfolio_remove_reference | Remove reference from portfolio |
| portfolio_update | Update portfolio |
| production_review_request | Request production review |
| production_create_request | Request production order creation |
| inventory_transfer_suggestion | Suggest inventory transfer |
| inventory_transfer_request | Request inventory transfer |
| order_priority_mark | Mark order as priority |
| customer_contact_request | Request customer contact |
| vendor_contact_request | Request vendor contact |
| dashboard_update | Update dashboard |
| timeline_append | Append to timeline |
| data_refresh_request | Request data refresh |
| manual_review_request | Request manual review |
| external_api_call | External API call |
| custom | Custom action |

---

## Strategy → Actions mapping

| Strategy | Actions generated |
|---|---|
| remove_portfolio_sample | portfolio_remove_reference, vendor_contact_request, timeline_append |
| produce | production_review_request, timeline_append |
| transfer_inventory | inventory_transfer_suggestion, alert_create, timeline_append |
| contact_vendor | vendor_contact_request, task_create |
| contact_customer | customer_contact_request, task_create |
| escalate_to_management | alert_create, notification_send, dashboard_update |
| wait_for_production | production_review_request, timeline_append |
| review_data | data_refresh_request, manual_review_request |
| do_nothing | timeline_append |

---

## Policy model

```typescript
interface ActionPolicy {
  policyId: string;
  organizationId: string;
  name: string;
  enabled: boolean;
  allowedActionTypes: ActionType[] | null;  // null = all
  blockedActionTypes: ActionType[];
  requiresApprovalFor: ActionType[];
  dryRunOnly: boolean;                      // default: true
  maxRiskLevel: ActionRiskLevel;
  allowedExecutionModes: ExecutionMode[];
  metadata: Record<string, unknown>;
}
```

**Rule:** If no explicit policy exists, every action stays in dry_run or pending_approval. Never execute by default.

---

## Event feedback (suggested, not emitted)

| Event type | When |
|---|---|
| business_action_completed | Action executed successfully (dry_run or real) |
| business_action_failed | Action execution failed |
| business_action_approval_required | Action blocked pending approval |
| business_action_rejected | Approval rejected |
| business_action_started | Action execution began |

These are returned as `eventsToEmit` in ActionExecutionResult — NOT emitted directly. The caller decides whether to emit them through the Event Engine.

---

## Castillitos case

### Scenario: Decision recommends inventory transfer for depleted reference

**Decision Engine output:** "Traslado de inventario" recommended

**Action Engine builds ActionPlan:**

| # | Action | Type | Status |
|---|---|---|---|
| 1 | Sugerir traslado | inventory_transfer_suggestion | dry_run |
| 2 | Crear alerta logistica | alert_create | dry_run |
| 3 | Registrar en timeline | timeline_append | dry_run |

**Execution (dry_run):**

```
[DRY RUN] Sugerir traslado de inventario: "Sugerir traslado"
  → receipt: dry_run_completed
  → eventsToEmit: [business_action_completed]

[DRY RUN] Crear alerta: "Crear alerta"
  → receipt: dry_run_completed
  → eventsToEmit: [business_action_completed]

[DRY RUN] Agregar a timeline: "Registrar en timeline"
  → receipt: dry_run_completed
  → eventsToEmit: [business_action_completed]
```

All actions produce results, receipts, and suggested events — with zero side effects.

---

## Relationships

| Engine | Relationship |
|---|---|
| **Decision Engine** | Consumes BusinessDecision. Does not select or reevaluate decisions. |
| **Planning Engine** | Uses PlanStep for context. Does not generate new plans. |
| **Rule Engine** | Preserves sourceRuleEvaluationIds in trace. Does not evaluate rules. |
| **Event Engine** | Suggests eventsToEmit. Does not modify Event Engine. |
| **Signal Engine** | Signals available in context. Does not modify Signal Engine. |
| **Executive Intelligence** | Can display action plans, pending approvals, execution results. |
| **David / Copilot** | Explains actions. Does not execute, approve, or invent actions. |

---

## What this sprint does NOT do

- Does NOT connect real WhatsApp, email, or messaging
- Does NOT modify SAG or external systems
- Does NOT create real production orders
- Does NOT modify real orders or inventory
- Does NOT call external APIs
- Does NOT automate destructive actions
- Does NOT call AI/LLM
- Does NOT create complex UI
- All execution is dry_run / mock

---

## Roadmap

1. **ACTION-HANDLERS-REAL-01** — Real handler implementations (WhatsApp, email, SAG, etc.)
2. **ACTION-PERSISTENCE-01** — Persist actions and executions to Prisma
3. **ACTION-APPROVAL-FLOW-01** — Wire approvals into the approval lifecycle
4. **ACTION-RETRY-01** — Retry failed actions with backoff
5. **ACTION-SCHEDULING-01** — Schedule deferred actions
6. **ACTION-UI-01** — Action plan execution UI with approval buttons
7. **ACTION-DAVID-01** — David explains action plans and results
8. **ACTION-EVENT-FEEDBACK-01** — Emit real BusinessEvents from execution results

---

## Rules enforced

- No Prisma, React, AI, or UI imports — pure domain types
- Default execution mode: dry_run
- No real external side effects
- Every action has trace (provenance chain)
- Every action has policy check
- Every action produces result
- Every result includes suggested events
- No execution without trace
- Default safe policy: dryRunOnly: true
- 18 built-in dry-run handlers
- BusinessEntity Isolation Rule maintained
- TSC baseline maintained at 160
