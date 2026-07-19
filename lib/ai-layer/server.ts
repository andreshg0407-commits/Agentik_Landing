/**
 * lib/ai-layer/server.ts
 *
 * Agentik — AI Layer Foundation — Server Barrel
 * Sprint: AGENTIK-AI-LAYER-FOUNDATION-01
 *
 * SERVER-ONLY barrel. Import this to access the AI Layer service.
 * Never import this in client components.
 *
 *   import { aiLayerService } from "@/lib/ai-layer/server";
 */

import "server-only";

export { aiLayerService } from "./ai-layer-service";
