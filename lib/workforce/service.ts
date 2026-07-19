/**
 * Workforce service — GOCEN integration preparation.
 *
 * STATUS: SCAFFOLD ONLY.
 *
 * All functions return typed empty/null results until the GOCEN adapter is
 * implemented (lib/connectors/adapters/gocen/).  No Prisma models for
 * workforce entities exist yet — they are documented in prisma/schema.prisma
 * under the §Workforce (future) comment block.
 *
 * Each function is fully typed and documents the query it will run once the
 * Prisma migration lands.  The function signatures are stable and will not
 * change when real data is connected — callers can be written now.
 *
 * ── Recommended next step ─────────────────────────────────────────────────────
 * 1. Obtain GOCEN API credentials / endpoint from Castillitos IT.
 * 2. Create lib/connectors/adapters/gocen/index.ts  following the same
 *    pattern as lib/connectors/adapters/castillitos-crm/.
 * 3. Run `npx prisma migrate dev --name add_workforce_models` after adding the
 *    Prisma models defined in prisma/schema.prisma §Workforce (future).
 * 4. Replace the stub returns below with real Prisma queries.
 * 5. Wire the SyncJob scheduler to periodically pull GOCEN data.
 */

import type {
  EmployeeProfile,
  AttendanceFact,
  PayrollFact,
  ComplianceSignal,
  WorkforceKpis,
  SellerWorkforceLink,
  BranchWorkforceLink,
} from "./types";

// ── Workforce KPIs ────────────────────────────────────────────────────────────

/**
 * Returns org-level workforce KPIs.
 *
 * Future implementation:
 *   const [headcount, compliance, payroll] = await Promise.all([
 *     prisma.employeeProfile.groupBy({ by: ["status"], _count: true, where: { organizationId } }),
 *     prisma.complianceSignal.count({ where: { organizationId, resolvedAt: null, severity: { in: ["warning","critical"] } } }),
 *     prisma.payrollFact.aggregate({ where: { organizationId, period: latestPeriod }, _sum: { grossAmount: true } }),
 *   ]);
 */
export async function getWorkforceKpis(
  organizationId: string,  // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<WorkforceKpis | null> {
  // SCAFFOLD: no data until GOCEN adapter is connected.
  return null;
}

// ── Employee directory ────────────────────────────────────────────────────────

/**
 * Returns all active employees for the org, ordered by full name.
 *
 * Future implementation:
 *   return prisma.employeeProfile.findMany({
 *     where:   { organizationId, status: "active" },
 *     orderBy: { fullName: "asc" },
 *   });
 */
export async function listEmployees(
  organizationId: string,  // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<EmployeeProfile[]> {
  return [];
}

/**
 * Looks up a single employee by their sellerSlug (join key from sales domain).
 * Used on /sales/vendors/[sellerSlug] to surface workforce context.
 *
 * Future implementation:
 *   return prisma.employeeProfile.findFirst({
 *     where: { organizationId, sellerSlug },
 *   });
 */
export async function getEmployeeBySellerSlug(
  organizationId: string,  // eslint-disable-line @typescript-eslint/no-unused-vars
  sellerSlug:     string,  // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<EmployeeProfile | null> {
  return null;
}

// ── Attendance ────────────────────────────────────────────────────────────────

/**
 * Returns recent attendance facts for a single employee.
 *
 * Future implementation:
 *   return prisma.attendanceFact.findMany({
 *     where:   { organizationId, employeeId },
 *     orderBy: { occurredAt: "desc" },
 *     take:    limit,
 *   });
 */
export async function getEmployeeAttendance(
  organizationId: string,  // eslint-disable-line @typescript-eslint/no-unused-vars
  employeeId:     string,  // eslint-disable-line @typescript-eslint/no-unused-vars
  limit = 30,              // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<AttendanceFact[]> {
  return [];
}

// ── Payroll ───────────────────────────────────────────────────────────────────

/**
 * Returns payroll facts for a single employee, all periods.
 *
 * Future implementation:
 *   return prisma.payrollFact.findMany({
 *     where:   { organizationId, employeeId },
 *     orderBy: { period: "desc" },
 *   });
 */
export async function getEmployeePayroll(
  organizationId: string,  // eslint-disable-line @typescript-eslint/no-unused-vars
  employeeId:     string,  // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<PayrollFact[]> {
  return [];
}

// ── Compliance ────────────────────────────────────────────────────────────────

/**
 * Returns open compliance signals for a single employee.
 *
 * Future implementation:
 *   return prisma.complianceSignal.findMany({
 *     where:   { organizationId, employeeId, resolvedAt: null },
 *     orderBy: [{ severity: "desc" }, { dueAt: "asc" }],
 *   });
 */
export async function getEmployeeComplianceSignals(
  organizationId: string,  // eslint-disable-line @typescript-eslint/no-unused-vars
  employeeId:     string,  // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<ComplianceSignal[]> {
  return [];
}

// ── Cross-domain joins ────────────────────────────────────────────────────────

/**
 * Resolves seller → employee for a list of seller slugs.
 * Used by the vendor leaderboard and vendor detail pages to show workforce context.
 *
 * Future implementation:
 *   const employees = await prisma.employeeProfile.findMany({
 *     where: { organizationId, sellerSlug: { in: sellerSlugs } },
 *   });
 *   const bySlug = new Map(employees.map(e => [e.sellerSlug!, e]));
 *   return sellerSlugs.map(slug => ({
 *     sellerSlug: slug,
 *     sellerName: ..., // from caller context
 *     employee:   bySlug.get(slug) ?? null,
 *     attendanceToday: await resolveAttendanceToday(organizationId, bySlug.get(slug)?.id),
 *     openSignals:     0,
 *     commissionThisMonth: null,
 *   }));
 */
export async function resolveSellerWorkforceLinks(
  organizationId: string,   // eslint-disable-line @typescript-eslint/no-unused-vars
  sellerSlugs:    string[], // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<SellerWorkforceLink[]> {
  return [];
}

/**
 * Resolves branch → workforce coverage for a list of store slugs.
 * Used by the branch detail page to show staffing alongside commercial KPIs.
 *
 * Future implementation:
 *   const grouped = await prisma.employeeProfile.groupBy({
 *     by:    ["storeSlug"],
 *     where: { organizationId, storeSlug: { in: storeSlugs }, status: "active" },
 *     _count: { id: true },
 *   });
 */
export async function resolveBranchWorkforceLinks(
  organizationId: string,   // eslint-disable-line @typescript-eslint/no-unused-vars
  storeSlugs:     string[], // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<BranchWorkforceLink[]> {
  return [];
}
