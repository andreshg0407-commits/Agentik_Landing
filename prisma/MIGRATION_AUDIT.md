# Prisma Migration Audit — PRISMA-GOVERNANCE-01

**Generated:** 2026-05-18
**Sprint:** PRISMA-GOVERNANCE-01 — Phase 1 Audit
**Auditor:** Claude Code

---

## Summary

| Metric | Count |
|--------|-------|
| Total models in schema.prisma | 82 |
| Total enums in schema.prisma | 67 |
| Models with migration history | 59 |
| Models with NO migration history (db push orphans) | **23** |
| Enums with migration history | 59 |
| Enums with NO migration history (db push orphans) | **8** |
| CustomerProfile columns added via db push | **3** |
| Backfill migrations required | **7** |

---

## Root Cause

The Agentik project accumulated `prisma db push` deployments over several sprints (MS-04 through MS-12).
`db push` writes directly to Neon without creating migration files.
The Prisma shadow database (used by `migrate dev`/`migrate deploy`) has no record of these tables.
Any `migrate deploy` that includes a migration referencing these tables fails with **P3006 / P1014**.

**Known incident:** `20260505000000_payment_document_type` triggered P3006 because `PaymentRecord` was a
db-push orphan. Fixed via `20260504999999_create_payment_record` backfill.

---

## Orphaned Items by Group

### Group 1 — IdentityStatus Enhancement on CustomerProfile
*Estimated deployment: after 20260331224808, before 20260411000000*

| Item | Type |
|------|------|
| `IdentityStatus` | enum |
| `CustomerProfile.identityStatus` | column |
| `CustomerProfile.sagTerceroId` | column |
| `CustomerProfile.nitNormalized` | column |

**Backfill:** `20260406000000_identity_status_enum`

---

### Group 2 — WhatsApp Module
*Estimated deployment: around sprint MS-WA (April 2026)*

| Item | Type |
|------|------|
| `WaConversationStatus` | enum |
| `WaMessageRole` | enum |
| `WaIntent` | enum |
| `WhatsAppConfig` | model |
| `WhatsAppConversation` | model |
| `WhatsAppMessage` | model |
| `WhatsAppContactMemory` | model |

**Backfill:** `20260410000000_whatsapp_module`

---

### Group 3 — Marketing Studio
*Estimated deployment: MS-04 sprint (April 2026)*

| Item | Type |
|------|------|
| `StudioSessionDbStatus` | enum |
| `AssetGenerationStatus` | enum |
| `AssetPublishStatus` | enum |
| `StudioSession` | model |
| `GeneratedAsset` | model |

**Backfill:** `20260415000000_marketing_studio`

---

### Group 4 — Customer Order Records
*Estimated deployment: SAG PD orders sprint (April 2026)*

| Item | Type |
|------|------|
| `CustomerOrderStatus` | enum |
| `CustomerOrderRecord` | model |

**Backfill:** `20260420000000_customer_order_records`

---

### Group 5 — Agentik Financial Copilot
*Estimated deployment: after April 24*

| Item | Type |
|------|------|
| `CopilotSignalRecord` | model |
| `CopilotActionLog` | model |

**Backfill:** `20260425000000_copilot_signals`

---

### Group 6 — Product Intelligence Layer (MS-05 through MS-12)
*Estimated deployment: April-May 2026*

| Item | Type |
|------|------|
| `ProductEntity` | model |
| `ProductVariant` | model |
| `ProductAttribute` | model |
| `ProductAssetLink` | model |
| `ProductSyncState` | model |
| `ProductPublicationState` | model |
| `CommercePublicationEvent` | model |
| `PropagationJob` | model |
| `ProductActivity` | model |

**Backfill:** `20260428000000_product_intelligence_layer`

---

### Group 7 — Integration Runtime (MS-10)
*Estimated deployment: April-May 2026*

| Item | Type |
|------|------|
| `IntegrationConnection` | model |
| `IntegrationSecret` | model |
| `IntegrationEvent` | model |
| `IntegrationWebhookEvent` | model |
| `CommerceJob` | model |

**Backfill:** `20260429000000_integration_runtime`

---

## Phase 2 — Apply Backfills

After creating the 7 migration directories:

```bash
npx prisma migrate resolve --applied 20260406000000_identity_status_enum
npx prisma migrate resolve --applied 20260410000000_whatsapp_module
npx prisma migrate resolve --applied 20260415000000_marketing_studio
npx prisma migrate resolve --applied 20260420000000_customer_order_records
npx prisma migrate resolve --applied 20260425000000_copilot_signals
npx prisma migrate resolve --applied 20260428000000_product_intelligence_layer
npx prisma migrate resolve --applied 20260429000000_integration_runtime
npx prisma migrate status
```

Expected result: "Database schema is up to date!"

---

## Phase 3 — Enforcement

- `scripts/check-no-db-push.js` — fails CI if `prisma db push` found in package.json, CI config, or scripts
- Remove `db push` references from `package.json` dev scripts

## Phase 4 — Developer Workflow

`docs/PRISMA_WORKFLOW.md` — official rules:
- Always use `prisma migrate dev --name <name>` to create new migrations
- Never use `prisma db push` except on throwaway local DBs
- Before deploying: `prisma migrate status` must show zero pending
- For backfills: IF NOT EXISTS guards + `migrate resolve --applied`

---

*End of audit — PRISMA-GOVERNANCE-01 Phase 1*
