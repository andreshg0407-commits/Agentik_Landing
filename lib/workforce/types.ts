/**
 * Workforce domain — normalized type definitions.
 *
 * STATUS: SCAFFOLD ONLY — no live GOCEN integration yet.
 *
 * Source system:    GOCEN (employee control / payroll / workforce platform)
 * Adapter location: lib/connectors/adapters/gocen/  (not yet implemented)
 * Prisma models:    See prisma/schema.prisma §Workforce (not yet migrated)
 *
 * ── Commercial join points ────────────────────────────────────────────────────
 *   EmployeeProfile.sellerSlug  ↔  SaleRecord.sellerSlug
 *                                   CRMQuote.sellerSlug
 *   EmployeeProfile.storeSlug   ↔  SaleRecord.storeSlug
 *   AttendanceFact.storeSlug    ↔  SaleRecord.storeSlug
 *   PayrollFact (commission)    ↔  getSellerDetail() revenue
 *   ComplianceSignal            ↔  sales-performance cross-analysis
 */

// ── Employment status enums ────────────────────────────────────────────────────

export type EmploymentStatus =
  | "active"
  | "inactive"
  | "on_leave"
  | "terminated";

export type EmploymentType =
  | "full_time"
  | "part_time"
  | "contractor"
  | "intern";

export type WorkforceRole =
  | "seller"
  | "supervisor"
  | "branch_manager"
  | "logistics"
  | "admin"
  | "other";

// ── Core employee entity ──────────────────────────────────────────────────────

export interface EmployeeProfile {
  /** Agentik internal CUID */
  id:             string;
  organizationId: string;

  /** Stable employee number from GOCEN (código empleado). */
  gocenId:        string | null;

  // ── Identity ────────────────────────────────────────────────────────────────
  firstName:      string;
  lastName:       string;
  fullName:       string;
  /** Cédula de ciudadanía (Colombian national ID). */
  nationalId:     string | null;
  email:          string | null;
  phone:          string | null;

  // ── Role & assignment ───────────────────────────────────────────────────────
  role:           WorkforceRole;
  employmentType: EmploymentType;
  status:         EmploymentStatus;
  department:     string | null;
  position:       string | null;    // Job title / cargo

  // ── Commercial domain join keys ─────────────────────────────────────────────
  /**
   * Matches SaleRecord.sellerSlug and CRMQuote.sellerSlug.
   * Populated only for employees in selling roles.
   * Derivation: toSlug(fullName) — same algorithm used by normalize.ts.
   */
  sellerSlug:     string | null;

  /**
   * Matches SaleRecord.storeSlug.
   * Primary branch / workplace assignment.
   */
  storeSlug:      string | null;
  storeName:      string | null;

  // ── Lifecycle dates ─────────────────────────────────────────────────────────
  hiredAt:        Date | null;
  terminatedAt:   Date | null;
  lastSyncAt:     Date | null;

  /** Raw payload from GOCEN API — preserved for future field additions. */
  rawGocenJson:   Record<string, unknown> | null;
}

// ── Attendance ────────────────────────────────────────────────────────────────

export type AttendanceEventType =
  | "check_in"
  | "check_out"
  | "break_start"
  | "break_end"
  | "absence";

export type AbsenceReason =
  | "vacation"
  | "sick_leave"
  | "personal"
  | "unpaid"
  | "public_holiday"
  | "other";

export interface AttendanceFact {
  id:             string;
  organizationId: string;
  employeeId:     string;

  eventType:      AttendanceEventType;
  occurredAt:     Date;

  /** Branch where the event occurred — links to SaleRecord.storeSlug. */
  storeSlug:      string | null;

  absenceReason:  AbsenceReason | null;
  notes:          string | null;

  /** Minutes worked this session (set on check_out events). */
  minutesWorked:  number | null;

  /** GOCEN event / log reference ID. */
  sourceRef:      string | null;
}

// ── Payroll ───────────────────────────────────────────────────────────────────

export type PayrollComponent =
  | "base"
  | "commission"
  | "bonus"
  | "overtime"
  | "deduction"
  | "tax"
  | "social_security";

export type PayrollStatus =
  | "draft"
  | "approved"
  | "paid"
  | "disputed";

export interface PayrollFact {
  id:             string;
  organizationId: string;
  employeeId:     string;

  /** YYYY-MM payroll period — aligns with SaleRecord.periodoAoMes format. */
  period:         string;

  status:         PayrollStatus;
  component:      PayrollComponent;

  /** Gross amount for this component (COP). */
  grossAmount:    number;

  /** Net amount after deductions (COP). */
  netAmount:      number | null;

  /**
   * For commission components: the sales base used to compute commission.
   * Can be cross-referenced against getSellerDetail() totalAmount.
   */
  commissionBase: number | null;

  /** Commission rate as decimal (e.g. 0.03 = 3%). */
  commissionRate: number | null;

  paidAt:         Date | null;

  /** GOCEN payroll run reference ID. */
  sourceRef:      string | null;
}

// ── Compliance signals ────────────────────────────────────────────────────────

export type ComplianceSignalType =
  | "contract_expiry"      // Employment contract nearing or past expiry
  | "document_missing"     // Required document not on file (cédula, ARL, etc.)
  | "training_overdue"     // Mandatory training not completed
  | "disciplinary_note"    // Disciplinary action on record
  | "background_check"     // Background check due or failed
  | "health_check_due"     // Medical exam (examen médico ocupacional) overdue
  | "overtime_threshold";  // Hours approaching legal limit (Código Sustantivo del Trabajo)

export type ComplianceSeverity = "info" | "warning" | "critical";

export interface ComplianceSignal {
  id:              string;
  organizationId:  string;
  employeeId:      string;

  signalType:      ComplianceSignalType;
  severity:        ComplianceSeverity;

  /** Human-readable description of the compliance issue. */
  description:     string;

  /** Date this becomes or became critical. */
  dueAt:           Date | null;

  acknowledged:    boolean;
  acknowledgedAt:  Date | null;
  acknowledgedBy:  string | null;   // userId

  createdAt:       Date;
  resolvedAt:      Date | null;

  /** GOCEN source record reference. */
  sourceRef:       string | null;
}

// ── Aggregated KPI views ──────────────────────────────────────────────────────

export interface WorkforceKpis {
  // ── Headcount ───────────────────────────────────────────────────────────────
  totalEmployees:     number;
  activeEmployees:    number;
  sellerCount:        number;        // employees with sellerSlug ≠ null
  branchManagerCount: number;
  onLeaveToday:       number;

  // ── Compliance ──────────────────────────────────────────────────────────────
  pendingCompliance:  number;        // open warning + critical signals

  // ── Payroll snapshot ────────────────────────────────────────────────────────
  payrollPeriod:      string | null; // YYYY-MM of latest payroll run
  totalPayrollGross:  number | null; // COP
  totalCommissions:   number | null; // COP, commissions component only
}

// ── Cross-domain link views ───────────────────────────────────────────────────

/**
 * Joins a seller (from sales domain) with their employee record (workforce domain).
 * Used on the vendor detail page to surface HR context alongside sales KPIs.
 */
export interface SellerWorkforceLink {
  sellerSlug:          string;
  sellerName:          string;
  /** Null when the seller has no matching EmployeeProfile. */
  employee:            Pick<EmployeeProfile, "id" | "fullName" | "status" | "position" | "storeSlug"> | null;
  /** Derived from today's AttendanceFacts. */
  attendanceToday:     "present" | "absent" | "unknown";
  openSignals:         number;
  commissionThisMonth: number | null;
}

/**
 * Joins a branch (from sales domain) with its workforce coverage.
 * Used on the branch detail page to surface staffing context.
 */
export interface BranchWorkforceLink {
  storeSlug:    string;
  storeName:    string;
  totalStaff:   number;
  presentToday: number;
  openSignals:  number;
}
