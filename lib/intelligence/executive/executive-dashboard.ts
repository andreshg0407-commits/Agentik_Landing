/**
 * executive-dashboard.ts
 *
 * Public facade — the ONLY function consumers should import.
 * Delegates entirely to the Executive Engine.
 *
 * Usage:
 *   import { getExecutiveDashboard } from "@/lib/intelligence/executive/executive-dashboard";
 *   const dashboard = await getExecutiveDashboard(orgId);
 */

import "server-only";
import type { ExecutiveDashboard } from "./executive-types";
import { runExecutiveEngine } from "./executive-engine";

export async function getExecutiveDashboard(orgId: string): Promise<ExecutiveDashboard> {
  return runExecutiveEngine(orgId);
}
