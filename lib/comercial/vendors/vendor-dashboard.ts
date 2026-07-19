/**
 * vendor-dashboard.ts
 *
 * COMERCIAL-VENDEDORES-LIVE-01
 * Public facade for the Vendor Sales Performance Center.
 *
 * Components call ONLY these functions — never individual engines.
 * This is the vendor equivalent of executive-dashboard.ts.
 *
 * SERVER ONLY.
 */

import "server-only";
import type { LiveVendor, VendorTeamDashboard, VendorCard } from "./vendor-types";
import { resolveVendor, resolveVendorCards } from "./vendor-engine";

// ── Public API ───────────────────────────────────────────────────────────────

/** Resolve a single vendor into a full LiveVendor entity. */
export async function getVendorProfile(
  orgId: string,
  vendorId: string,
): Promise<LiveVendor | null> {
  return resolveVendor(orgId, vendorId);
}

/** Resolve all vendors into a team dashboard. */
export async function getVendorTeamDashboard(
  orgId: string,
): Promise<VendorTeamDashboard> {
  const vendors = await resolveVendorCards(orgId);

  const teamKpis = {
    totalSalesToday: vendors.reduce((s, v) => s + v.salesToday, 0),
    totalSalesMonth: vendors.reduce((s, v) => s + v.salesMonth, 0),
    totalOrdersToday: vendors.reduce((s, v) => s + v.ordersToday, 0),
    totalCustomersToday: vendors.reduce((s, v) => s + v.customersToday, 0),
    avgFulfillment: vendors.length > 0
      ? Math.round(vendors.reduce((s, v) => s + v.fulfillmentRate, 0) / vendors.length)
      : 0,
    vendorsActive: vendors.filter(v => v.health !== "unknown").length,
    vendorsWithAlerts: vendors.filter(v => v.alertCount > 0).length,
  };

  return {
    orgId,
    vendors,
    teamKpis,
    generatedAt: new Date().toISOString(),
  };
}

/** List vendor cards (lightweight, for list view). */
export async function getVendorCards(
  orgId: string,
): Promise<VendorCard[]> {
  return resolveVendorCards(orgId);
}
