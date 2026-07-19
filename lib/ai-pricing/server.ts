/**
 * lib/ai-pricing/server.ts
 *
 * Agentik — AI Pricing Engine — Server-Safe Entry Point
 * Sprint: AGENTIK-AI-PRICING-ENGINE-01
 *
 * Import path for server-side AI pricing:
 *   import { aiPricingService } from "@/lib/ai-pricing/server";
 *
 * CLIENT-SAFE barrel is at "@/lib/ai-pricing" (index.ts).
 * SERVER-ONLY — do not import from client components.
 */
import "server-only";
export { aiPricingService }           from "./server/ai-pricing-service";
export { aiPricingPrismaRepository }  from "./persistence/ai-pricing-prisma-repository";
