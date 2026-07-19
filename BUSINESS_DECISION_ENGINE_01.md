# BUSINESS-DECISION-ENGINE-01 — Operational Decision Engine

**Sprint:** BUSINESS-DECISION-ENGINE-01
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained, zero regressions)

---

## Vision

Planning Engine produces alternatives. Decision Engine selects the best one. Action Engine (future) will execute approved decisions. David explains the decision.

The Decision Engine is the bridge between **planning** (what could we do?) and **action** (what will we do?). It selects, justifies, and structures the best suggested decision before any execution.

**Business Decision Rule:** Decisions do not belong to modules. Comercial does not decide. Inventory does not decide. Production does not decide. Finance does not decide. Modules produce data, Signals and Events. Rule Engine evaluates policies. Planning Engine builds alternatives. Decision Engine selects the recommended alternative. Action Engine will execute only approved decisions. David explains decisions — never invents them.

---

## Architecture

```
BusinessPlan (from Planning Engine)
    ↓
DecisionContext (assembled by caller)
    ├─ plan (with alternatives)
    ├─ ruleResults[]
    ├─ events[]
    ├─ signals[]
    ├─ reasoningContext
    ├─ knowledgeContext
    ├─ entitySnapshots[]
    ├─ metrics
    ├─ constraints
    └─ policy ("balanced" | "fastest" | "lowest_risk" | ...)
    ↓
IDecisionEngine.decideFromPlan()
    ├─ buildOptions()               ← PlanAlternative → DecisionOption
    ├─ evaluateOptions()            ← 10 criteria × policy weights
    ├─ rankOptions()                ← feasible first, then by score
    ├─ selectRecommendedOption()    ← top feasible option
    ├─ buildJustification()         ← why this option, why not others
    ├─ buildTradeoffs()             ← gain vs sacrifice
    ├─ buildApproval()              ← approval requirements
    └─ buildConfidence()            ← rich confidence assessment
    ↓
BusinessDecision (suggestedOnly: true, status: "recommended")
    ├─ options[]                    ← ranked DecisionOption[]
    ├─ recommendedOptionId          ← selected option
    ├─ criteria[]                   ← evaluation criteria used
    ├─ justification                ← why this was chosen
    ├─ tradeoffs[]                  ← what is gained/sacrificed
    ├─ approval                     ← approval requirements
    ├─ confidence                   ← rich confidence model
    └─ audit                        ← full reconstruction trail
```

---

## Complete operational pipeline (all engines)

```
Business Condition
    ↓ Business Signals (condition exists)
    ↓ Business Events (transition happened)
    ↓ Rule Engine (which policies apply?)
    ↓ Planning Engine (what alternatives exist?)
    ↓ Decision Engine (which is best? why?)
    ↓ [future] Action Engine (execute approved decision)
    ↓ [future] David (explain to user)
```

---

## Files created (14)

| File | Purpose |
|---|---|
| `lib/business-decisions/decision-types.ts` | DecisionStatus(9), DecisionSource(7), DecisionPolicy(9+), ConfidenceLevel(5), DecisionApprovalType(8), CriterionDirection(3), nextDecisionId() |
| `lib/business-decisions/decision.ts` | BusinessDecision (22 fields, suggestedOnly:true), DecisionTriggerRef, buildBusinessDecision() |
| `lib/business-decisions/decision-option.ts` | DecisionOption (18 fields), buildDecisionOption() |
| `lib/business-decisions/decision-criteria.ts` | DecisionCriterion (7 fields), DecisionCriterionKey (10), DEFAULT_CRITERIA_WEIGHTS, buildDecisionCriterion() |
| `lib/business-decisions/decision-justification.ts` | DecisionJustification (9 fields), RejectedAlternativeSummary, buildDecisionJustification() |
| `lib/business-decisions/decision-tradeoff.ts` | DecisionTradeoff (8 fields), buildDecisionTradeoff() |
| `lib/business-decisions/decision-approval.ts` | DecisionApproval (7 fields), buildDecisionApproval(), noApprovalNeeded() |
| `lib/business-decisions/decision-confidence.ts` | DecisionConfidence (8 fields), confidenceLevelFromScore(), buildDecisionConfidence() |
| `lib/business-decisions/decision-audit.ts` | DecisionAudit (12 fields), DecisionAuditEntry, buildDecisionAudit(), addAuditEntry() |
| `lib/business-decisions/decision-context.ts` | DecisionContext (12 fields), DecisionEntitySnapshot, buildDecisionContext() |
| `lib/business-decisions/decision-engine.ts` | IDecisionEngine (11 methods), InMemoryDecisionEngine |
| `lib/business-decisions/decision-registry.ts` | DecisionPolicyConfig, DecisionPolicyRegistry, 9 built-in policies |
| `lib/business-decisions/decision-utils.ts` | 13 utilities (recommendedOption, rankedOptions, decisionSummary, recommendationGap, etc.) |
| `lib/business-decisions/index.ts` | Client-safe barrel export |

---

## Evaluation criteria (10)

| Criterion | Direction | Default Weight | Description |
|---|---|---|---|
| benefit | maximize | 0.18 | Expected benefit |
| cost | minimize | 0.12 | Estimated cost |
| risk | minimize | 0.14 | Risk level |
| speed | maximize | 0.10 | Speed of execution |
| feasibility | maximize | 0.15 | Viability |
| confidence | maximize | 0.10 | Confidence in data |
| approval_complexity | minimize | 0.06 | Approval requirements |
| customer_impact | maximize | 0.08 | Customer impact |
| operational_effort | minimize | 0.05 | Operational effort |
| strategic_alignment | maximize | 0.02 | Strategic alignment |

---

## Decision policies (9)

| Policy | Focus | Key weight overrides |
|---|---|---|
| balanced | Equal consideration of all factors | Default weights |
| fastest | Speed of execution | speed: 0.35 |
| lowest_risk | Minimize risk | risk: 0.35, feasibility: 0.20 |
| highest_benefit | Maximize benefit | benefit: 0.35, customer_impact: 0.15 |
| lowest_cost | Minimize cost | cost: 0.35, operational_effort: 0.15 |
| approval_light | Avoid approval requirements | approval_complexity: 0.35, speed: 0.20 |
| customer_first | Customer impact priority | customer_impact: 0.35, benefit: 0.15 |
| production_first | Production alignment | strategic_alignment: 0.25, feasibility: 0.20 |
| commercial_first | Commercial impact | customer_impact: 0.25, benefit: 0.25 |

---

## Justification model

Every decision carries a `DecisionJustification`:

- **summary** — one-line explanation
- **mainReasons** — top criteria that drove the selection
- **selectedBecause** — what specifically makes this option better
- **rejectedAlternatives** — why each other option was not chosen (with scores)
- **supportingEvidence** — data sources consulted
- **missingInformation** — what was unknown
- **assumptions** — what was assumed
- **confidenceExplanation** — why confidence is at this level

No decision without justification.

---

## Tradeoff model

Tradeoffs explain what is gained and sacrificed:

- *Trasladar inventario desbloquea pedidos mas rapido, pero reduce stock en otra tienda.*
- *Esperar produccion evita traslado, pero mantiene pedidos bloqueados.*
- *Retirar muestra protege consistencia de vendedor, pero reduce opciones de venta.*

Auto-generated from weak and strong criteria of the selected option.

---

## Confidence model

Richer than a number:

- **score** (0–100) + **level** (very_low → very_high)
- **evidenceQuality** — alta/media/baja
- **dataFreshness** — reciente/desconocida
- **missingInformation** — explicit gaps
- **assumptions** — what was assumed
- **sensitivity** — how stable the recommendation is

---

## Audit trail

Full reconstruction:

- sourcePlanId, sourceRuleEvaluationIds, sourceEventIds, sourceSignalIds
- evaluatedOptionIds, selectedOptionId, rejectedOptionIds
- Ordered auditTrail entries with timestamps

---

## Castillitos case

### Scenario: Referencia agotada con maleta activa y pedidos

**Input:** BusinessPlan with 6-7 alternatives from Planning Engine.

**Policy:** balanced (default)

**Decision Engine output:**

```
Decision: Traslado de inventario [RECOMENDADA]
  Score: 72/100 | Confianza: 68% (medium)

Justificacion:
  "Traslado de inventario" es la opcion recomendada con score 72/100
  Mejor combinacion de beneficio esperado, viabilidad, rapidez

Opciones evaluadas:
  #1 Traslado de inventario [RECOMENDADA] — score: 72
  #2 Retirar muestra de maleta — score: 68
  #3 Contactar vendedor — score: 65
  #4 Revisar produccion — score: 58
  #5 Escalar a gerencia — score: 55
  #6 Esperar produccion — score: 42
  #7 No tomar accion — score: 28

Tradeoffs:
  + Beneficio esperado (85/100) / - Costo estimado (40/100)
  + Viabilidad (80/100) / - Esfuerzo operativo (60/100)

Aprobacion: manager (jefe_logistica)
  Razon: traslados entre bodegas requieren aprobacion
```

If no alternative inventory exists, the engine would recommend "Retirar muestra de maleta" or "Esperar produccion" depending on OP availability.

---

## Relationships

| Engine | Relationship |
|---|---|
| **Planning Engine** | Consumes BusinessPlan and PlanAlternative. Does not modify plans. |
| **Rule Engine** | Uses RuleEvaluationResult as context input. |
| **Event Engine** | Events available as context. Does not modify events. |
| **Signal Engine** | Signals available as context. Does not modify signals. |
| **Knowledge Graph** | Knowledge context via DecisionContext.knowledgeContext. |
| **Reasoning Engine** | Reasoning context via DecisionContext.reasoningContext. |
| **Executive Intelligence** | Can display recommended decisions. |
| **David / Copilot** | Explains decisions via explainDecision(). Never invents them. |
| **Action Engine (future)** | Will consume approved BusinessDecision. NOT implemented. |

---

## What this sprint does NOT do

- Does NOT execute actions
- Does NOT send notifications
- Does NOT modify data or SAG
- Does NOT create orders or production
- Does NOT call AI/LLM
- Does NOT modify UI
- Does NOT build Action Engine
- Does NOT persist decisions to database

---

## Roadmap

1. **ACTION-ENGINE-01** — Execute approved decisions
2. **DECISION-PERSISTENCE-01** — Persist decisions to Prisma
3. **DECISION-UI-01** — Decision comparison UI with tradeoff visualization
4. **DECISION-DAVID-INTEGRATION-01** — David explains decisions using explainDecision()
5. **DECISION-FEEDBACK-01** — Track decision outcomes for learning

---

## Rules enforced

- No Prisma, React, AI, or UI imports — pure domain types
- Every decision carries `suggestedOnly: true`
- Decision Engine only produces `recommended` or `under_review` — never `executed`
- All information arrives via DecisionContext — no direct module queries
- Decisions belong to the Decision Engine, not to modules
- Policies are pluggable via DecisionPolicyRegistry
- No decision without justification
- Tradeoffs, confidence, and audit explicitly tracked
- BusinessEntity Isolation Rule maintained
- TSC baseline maintained at 160
