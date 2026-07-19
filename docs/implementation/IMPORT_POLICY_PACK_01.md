# IMPORT-POLICY-PACK-01 — Import World Policy Pack

**Sprint:** IMPORT-POLICY-PACK-01
**Tenant:** Castillitos
**Status:** COMPLETE
**TSC Impact:** 0 new errors (baseline: 162)
**QA:** 99/99 passed
**Validation:** 207/207 passed

---

## What it does

The Import Policy Pack evaluates Castillitos' imported product portfolio (Chinese goods) and answers 6 key business questions:

1. **Which references have low rotation?** (>8 months without new entry AND still has inventory)
2. **Which references should be repurchased?** (REBUY / WATCH / DO_NOT_REBUY / INSUFFICIENT_DATA)
3. **What should the next container contain?** (Priority-ranked recommendations, NOT purchase orders)
4. **How old is the inventory?** (NEW / NORMAL / AGING / LOW_ROTATION / OBSOLETE_CANDIDATE)
5. **What is the overall health of the import portfolio?** (HEALTHY / AT_RISK / CRITICAL / NO_DATA)
6. **What alerts need attention?** (5 alert types with evidence)

---

## Architecture

- **Pure functions** — no DB, no Prisma, no React, no side effects
- **Config-driven** — all thresholds from `import-policy-pack-config.ts`, never hardcoded
- **Evidence-first** — every result answers 4 questions: Why activated? What data? What action + why? What missing?
- **Registered in Business Policy Engine** — 4 IMPORT + 1 INVENTORY policies
- **Independent from Textil** — import rules never mix with textile rules

---

## Files

| File | Purpose |
|---|---|
| `lib/comercial/importaciones/import-policy-types.ts` | All domain types (16 types) |
| `lib/comercial/importaciones/import-policy-pack-config.ts` | Configurable thresholds |
| `lib/comercial/importaciones/import-policy-pack.ts` | 5 policy registrations |
| `lib/comercial/importaciones/import-decision-engine.ts` | 5 pure evaluation functions |
| `lib/comercial/importaciones/import-alerts.ts` | 5 alert builders + batch |
| `lib/comercial/importaciones/import-evidence.ts` | Evidence bridge + SAG gaps |
| `lib/comercial/importaciones/import-policy-index.ts` | Public barrel export |
| `scripts/_test-import-policy-pack-01.ts` | 99 QA tests (40 sections) |
| `scripts/_validate-import-policy-pack-01.ts` | 207 structural validations |

---

## Key thresholds (Castillitos)

| Parameter | Value |
|---|---|
| Low rotation months | >8 (>240 days, strictly greater than) |
| Repurchase REBUY score | >= 65 |
| Repurchase WATCH score | >= 35 |
| Repurchase DO_NOT_REBUY | < 35 |
| Aging NEW | <= 90 days |
| Aging NORMAL | <= 180 days |
| Aging AGING | <= 240 days |
| Aging LOW_ROTATION | <= 365 days |
| Aging OBSOLETE_CANDIDATE | > 365 days |
| Next container max items | 50 |
| Health CRITICAL | >30% require review |
| Health AT_RISK | >20% at risk + require review |

---

## Repurchase scoring factors

| Factor | Weight | Signal logic |
|---|---|---|
| salesVolume | 0.25 | 6-month sales volume tiers |
| inventoryLevel | 0.25 | Lower inventory = higher urgency |
| rotation | 0.20 | % sold of total imported |
| timeSinceEntry | 0.15 | Months since last entry |
| trend | 0.15 | accelerating / stable / decelerating |

---

## Alert types

| Type | Trigger |
|---|---|
| LOW_ROTATION | isLowRotation = true |
| REBUY_CANDIDATE | decision = REBUY |
| NO_REPURCHASE | decision = DO_NOT_REBUY |
| AGING_INVENTORY | agingStatus in AGING, LOW_ROTATION, OBSOLETE_CANDIDATE |
| DATA_QUALITY | Missing fields detected |

---

## SAG discovery gaps

| Field | Status | Priority |
|---|---|---|
| lastEntryDate | AVAILABLE | HIGH |
| lastImportDate | PARTIAL | MEDIUM |
| supplierName | PARTIAL | MEDIUM |
| countryOfOrigin | NOT_AVAILABLE | LOW |
| containerNumber | NOT_AVAILABLE | MEDIUM |
| unitCost | NOT_AVAILABLE | HIGH |
| leadTimeDays | NOT_AVAILABLE | MEDIUM |
| transitStatus | NOT_AVAILABLE | LOW |

---

## Design decisions

1. **Strictly greater than for low rotation**: 240 days exactly does NOT trigger (matches overdue receivable pattern from Sales Rep pack)
2. **suggestedQty only for REBUY**: WATCH and DO_NOT_REBUY get null, never negative
3. **No date + inventory = LOW_ROTATION**: Conservative — if we can't measure age but product exists, flag it
4. **No date + no inventory = NORMAL**: No action needed for empty references without dates
5. **Next container = recommendations only**: Never generates purchase orders or financial commitments
6. **INSUFFICIENT_DATA when no sales and below minimum**: Don't guess repurchase for products with zero data
