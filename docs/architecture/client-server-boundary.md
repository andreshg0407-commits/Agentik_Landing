# Agentik — Client/Server Boundary Rules

**Sprint:** AGENTIK-FINANCIAL-CLIENT-SERVER-BOUNDARY-FIX-01

---

## Rule

**Client Components render. Server Components calculate.**

---

## Prohibited in Client Components

| Category | Examples |
|---|---|
| Prisma | `@/lib/prisma`, `PrismaClient` |
| Node.js built-ins | `pg`, `fs`, `path`, `node:*` |
| Finance runtimes | `@/lib/finance/banking`, `@/lib/finance/banking/banking-runtime` |
| Graph runtimes | `@/lib/finance/graph`, `@/lib/finance/relationship-graph` |
| Runtime services | `@/lib/finance/runtime-service`, `@/lib/finance/runtime-activation` |
| Intelligence layer | `@/lib/finance/intelligence`, `@/lib/finance/source-confidence` |
| Diego summary engine | `@/lib/copilot/diego/diego-summary` |
| Copilot finance | `@/lib/copilot/finance` |

## Permitted in Client Components

| Category | What |
|---|---|
| Pure types (erased) | `import type { Foo } from "@/lib/finance/banking/..."` |
| Client DTOs | `import type { BankingSnapshotDTO } from "@/lib/finance/client-types"` |
| Pure formatters | `import { fmtBankAmount } from "@/lib/finance/client-types"` |
| Language constants | `import { FINANCE_LANGUAGE } from "@/lib/finance/language"` |
| Serialized serial types | `import type { DiegoSummarySerial } from "@/lib/copilot/diego/diego-types"` |
| UI tokens | `import { C, T, S, R, E } from "@/lib/ui/tokens"` |

## Correct Pattern

```typescript
// page.tsx (Server Component) ─────────────────────────────────────────────────
import { getBankingSnapshot } from "@/lib/finance/banking";
import { buildDiegoExecutiveSummary } from "@/lib/copilot/diego/diego-summary";

export default async function Page() {
  const [snapshot, diego] = await Promise.all([
    getBankingSnapshot(orgId),
    buildDiegoExecutiveSummary(orgId),
  ]);

  return <ClientComponent bankingSnapshot={serializeSnapshot(snapshot)} diego={serializeDiego(diego)} />;
}

// client-component.tsx (Client Component) ─────────────────────────────────────
"use client";
import type { BankingSnapshotDTO } from "@/lib/finance/client-types";
import type { DiegoSummarySerial } from "@/lib/copilot/diego/diego-types";

export function ClientComponent({ bankingSnapshot, diego }: {
  bankingSnapshot?: BankingSnapshotDTO;
  diego?: DiegoSummarySerial;
}) { ... }
```

## Root Cause of the Build Error (FIXED)

**Error:** `Module not found: Can't resolve 'fs'`

**Chain:**
```
tesoreria-client.tsx
  → import { fmtBankAmount } from "@/lib/finance/banking"   ← VALUE import from barrel
  → banking/index.ts re-exports banking-balances.ts
  → banking-balances.ts imports { prisma } from "@/lib/prisma"
  → prisma.ts imports pg
  → pg needs fs (Node.js built-in)
```

**Fix applied:**
```typescript
// BEFORE (broken)
import { fmtBankAmount } from "@/lib/finance/banking";

// AFTER (fixed)
import { fmtBankAmount } from "@/lib/finance/client-types";
```

## Safe Client Files — lib/finance/

| File | Client-safe? | Why |
|---|---|---|
| `lib/finance/client-types.ts` | YES | Pure TS types + formatters, no imports |
| `lib/finance/language.ts` | YES | Pure constants, no imports |
| `lib/finance/runtime-events.ts` | YES for `import type` | Type-only erased by TS |
| Any `@/lib/finance/banking*` | NO as value import | Pulls Prisma → pg → fs |
| Any `@/lib/finance/graph*` | NO as value import | Pulls Prisma |
| Any `@/lib/finance/runtime*` | NO as value import | Pulls Prisma |

## Note on `import type`

TypeScript's `import type { Foo } from "server-module"` is **completely erased** before
reaching webpack. It does NOT cause `fs` errors. Only **value imports** (`import { foo }`)
pull the module into the browser bundle.

However, prefer `lib/finance/client-types.ts` DTOs over `import type` from server modules
for clarity and to avoid accidental value usage in the future.
