# PRODUCTION-PLANNING-POLICY-PACK-01 — Production Planning Policy Pack

**Sprint:** PRODUCTION-PLANNING-POLICY-PACK-01
**Tenant:** Castillitos + Latin Kids
**Status:** COMPLETE
**TSC Impact:** 0 new errors (baseline: 162)
**QA:** 117/117 passed
**Validation:** 240/240 passed

---

## What it does

The Production Planning Policy Pack evaluates Castillitos' textile production needs and answers 5 key business questions:

1. **What should we produce?** Subgroups below their brand-specific inventory threshold without an active OP
2. **Which subgroups are below threshold?** Shortage detection with CRITICAL/HIGH/MEDIUM priority
3. **Is there an active OP?** If yes, WAIT_EXISTING_OP — don't suggest duplicate production
4. **What priority does each suggestion have?** 6-factor weighted scoring (inventory, sales, coverage, orders, maletas, tiendas)
5. **What is the overall production health?** HEALTHY / AT_RISK / CRITICAL / NO_DATA

---

## The Textile Reorder Rule

The core business rule:

> When available inventory of a subgroup reaches the brand threshold
> AND no active OP exists for that subgroup
> -> Generate production suggestion (NOT an OP)

| Brand | Threshold |
|---|---|
| CASTILLITOS | 100 units |
| LATIN KIDS | 200 units |
| Default (unknown) | 100 units |

**Precedence:** Active OP always wins. If inventory < threshold but OP exists -> WAIT_EXISTING_OP.

---

## Architecture

- **Pure functions** — no DB, no Prisma, no React, no side effects
- **Config-driven** — all thresholds from `production-planning-config.ts`
- **Evidence-first** — every result answers 4 questions
- **Registered in Business Policy Engine** — uses existing categories (REPLENISHMENT, INVENTORY, GENERAL)
- **No Business Policy Engine modifications** — zero changes to policy-types.ts or policy-registry.ts
- **Production Queue** — priority-ranked recommendation queue for Torre de Control

---

## Files

| File | Purpose |
|---|---|
| `lib/comercial/produccion/production-planning-types.ts` | All domain types (19+ types) |
| `lib/comercial/produccion/production-planning-config.ts` | Configurable thresholds |
| `lib/comercial/produccion/production-planning-pack.ts` | 5 policy registrations |
| `lib/comercial/produccion/production-decision-engine.ts` | 6 pure evaluation functions |
| `lib/comercial/produccion/production-alerts.ts` | 5 alert builders + batch |
| `lib/comercial/produccion/production-evidence.ts` | Evidence bridge + SAG gaps |
| `lib/comercial/produccion/production-read-models.ts` | Planning state + BusinessDecision |
| `lib/comercial/produccion/index.ts` | Public barrel export |
| `scripts/_test-production-planning-policy-pack-01.ts` | 117 QA tests (42 sections) |
| `scripts/_validate-production-planning-policy-pack-01.ts` | 240 structural validations |

---

## Decision flow

```
SubgroupInput
    |
    v
evaluateProductionNeed()
    |
    +-- SUFFICIENT_STOCK (inventory >= threshold) -> no action
    +-- WAIT_EXISTING_OP (below threshold + active OP) -> wait
    +-- PRODUCE (below threshold + no OP) -> suggestion
    +-- INSUFFICIENT_DATA (bad data) -> verify
    |
    v
evaluatePriority() -- 6 weighted factors -> CRITICAL/HIGH/MEDIUM/LOW
    |
    v
evaluateShortage() -- severity by % of threshold
    |
    v
buildProductionQueue() -- sorted recommendations
    |
    v
buildAllBusinessDecisions() -- universal BusinessDecision contract
```

---

## Priority scoring factors

| Factor | Weight | Signal logic |
|---|---|---|
| inventoryDeficit | 0.30 | % of threshold missing |
| salesVolume | 0.20 | 6-month sales volume tiers |
| coverage | 0.15 | Days of inventory coverage |
| pendingOrders | 0.15 | Unfulfilled order count |
| maletas | 0.10 | Sales rep bags with subgroup |
| tiendas | 0.10 | Stores carrying subgroup |

Priority thresholds: CRITICAL >= 80, HIGH >= 60, MEDIUM >= 35, LOW < 35

---

## Alert types

| Type | Trigger | Severity |
|---|---|---|
| PRODUCTION_REQUIRED | decision = PRODUCE | warning |
| WAIT_EXISTING_OP | decision = WAIT_EXISTING_OP | info |
| LOW_STOCK | shortage priority = HIGH or MEDIUM | warning |
| CRITICAL_SHORTAGE | shortage priority = CRITICAL | critical |
| DATA_QUALITY | missing fields detected | info |

---

## Production Queue

The Production Queue is a **recommendation queue, not a production order queue**. It feeds:
- Torre de Control
- Copilot
- Produccion module
- Daily alerts

Each item includes: subgroup, brand, priority, score, decision, deficit, active OP status, recommended action, and full evidence.

Items sorted: PRODUCE before WAIT_EXISTING_OP, then by priority score descending.

---

## BusinessDecision universal contract

Introduced in this sprint for cross-engine consumption:

```typescript
interface BusinessDecision {
  decisionId: string;
  tenantId: string;
  engine: string;        // "ProductionPlanningPack"
  policy: string;        // policy ID
  severity: string;
  priority: string;      // CRITICAL/HIGH/MEDIUM/LOW
  title: string;
  summary: string;
  recommendedAction: string;
  status: string;        // pending/accepted/rejected/expired/superseded
  confidence: number;
  evidence: ProductionEvidenceItem;
  generatedAt: string;
  expiresAt: string | null;
}
```

When COMMERCIAL-CONTROL-TOWER-01 arrives, all 6 policy packs (Mallet, Store, Order, SalesRep, Import, Production) will emit BusinessDecision objects for uniform consumption.

---

## SAG discovery gaps

| Field | Status | Priority |
|---|---|---|
| opDocumentNumber | AVAILABLE | HIGH |
| opStatus | AVAILABLE | HIGH |
| opQuantity | AVAILABLE | HIGH |
| opDocumentDate | AVAILABLE | MEDIUM |
| opSubgroup | PARTIAL | HIGH |
| opBusinessLine | PARTIAL | MEDIUM |
| opPriority | NOT_AVAILABLE | LOW |
| opStageProgress | PARTIAL | MEDIUM |

---

## Design decisions

1. **Uses existing policy categories** (REPLENISHMENT, INVENTORY, GENERAL) — zero modifications to Business Policy Engine
2. **Brand-specific thresholds** via config map — extensible for new brands without code changes
3. **Active OP = blocker** — closed OPs are ignored, only open OPs prevent new suggestions
4. **Threshold comparison uses < (less than)** — exactly at threshold = SUFFICIENT_STOCK
5. **Production Queue sorted by decision then score** — PRODUCE items always appear before WAIT items
6. **BusinessDecision contract** — universal format for Torre de Control consumption across all engines
