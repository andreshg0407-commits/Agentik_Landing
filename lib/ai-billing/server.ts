/**
 * lib/ai-billing/server.ts
 *
 * Agentik — AI Billing Foundation — Server-Safe Entry Point
 * Sprint: AGENTIK-AI-BILLING-FOUNDATION-01
 *
 * Import path for server-side AI billing:
 *   import { aiBillingService } from "@/lib/ai-billing/server";
 *
 * CLIENT-SAFE barrel is at "@/lib/ai-billing" (index.ts).
 * SERVER-ONLY — do not import from client components.
 */
export { aiBillingService }             from "./server/ai-billing-service";
export { aiBillingPrismaRepository }    from "./persistence/ai-billing-prisma-repository";
export { atomicDebit, atomicGrant, getStoredBalance } from "./persistence/ai-credit-atomic-repository";
export type { StoredBalance }           from "./persistence/ai-credit-atomic-repository";
