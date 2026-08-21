/**
 * lib/copilot-core/copilot-core-report-generator.ts
 *
 * Copilot Core — Report Generator
 * Sprint: COPILOT-CONVERSATIONAL-RUNTIME-01C
 *
 * Pure function. Formats adapter DTOs as CSV or JSON for download.
 * No storage, no artifact ID, no R2, no persistence.
 * Direct download response with Content-Disposition.
 *
 * PROHIBITED: NIT, email, phone, credit limit, address,
 * individual customer records, individual names, any identifier.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type ReportType =
  | "customer_summary"
  | "sales_performance"
  | "orders_summary";

export type ReportFormat = "csv" | "json";

export interface ReportOutput {
  readonly content: string;
  readonly contentType: string;
  readonly filename: string;
}

// ── Generator ────────────────────────────────────────────────────────────────

/**
 * Generate a downloadable report from a redacted adapter DTO.
 * Pure function — no network, no storage, no side effects.
 */
export function generateReport(
  reportType: ReportType,
  data: unknown,
  format: ReportFormat,
  organizationId: string,
): ReportOutput {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const ext = format === "csv" ? "csv" : "json";
  const filename = `copilot-${reportType}-${timestamp}.${ext}`;

  if (data == null) {
    return {
      content: format === "csv" ? "No data available\n" : JSON.stringify({ message: "No data available" }),
      contentType: format === "csv" ? "text/csv" : "application/json",
      filename,
    };
  }

  const content = format === "csv"
    ? formatCsv(reportType, data)
    : formatJson(reportType, data);

  return {
    content,
    contentType: format === "csv" ? "text/csv" : "application/json",
    filename,
  };
}

// ── CSV Safety ──────────────────────────────────────────────────────────────

/**
 * Neutralize CSV injection. Values starting with =, +, -, or @ are
 * prefixed with a single quote so spreadsheet apps treat them as text.
 * Numbers, dates, and fixed labels pass through unchanged in practice,
 * but this is a defense-in-depth measure.
 */
function safeCsvValue(value: unknown): string {
  const s = String(value ?? "—");
  if (/^[=+\-@]/.test(s)) {
    return `'${s}`;
  }
  return s;
}

// ── CSV Formatters ───────────────────────────────────────────────────────────

function formatCsv(reportType: ReportType, data: unknown): string {
  switch (reportType) {
    case "customer_summary":
      return formatCustomerSummaryCsv(data);
    case "orders_summary":
      return formatOrdersSummaryCsv(data);
    case "sales_performance":
      return formatSalesPerformanceCsv(data);
    default:
      return "Report type not supported\n";
  }
}

function formatCustomerSummaryCsv(data: unknown): string {
  const d = data as Record<string, unknown>;
  const rows = [
    "Metric,Value",
    `Total Customers,${safeCsvValue(d.totalCustomers)}`,
    `Active Customers,${safeCsvValue(d.activeCustomers)}`,
    `Inactive Customers,${safeCsvValue(d.inactiveCustomers)}`,
    `As Of,${safeCsvValue(d.asOf)}`,
  ];
  return rows.join("\n") + "\n";
}

function formatOrdersSummaryCsv(data: unknown): string {
  const d = data as Record<string, unknown>;
  const rows = [
    "Metric,Value",
    `Total Orders Today,${safeCsvValue(d.totalOrdersToday)}`,
    `Synced,${safeCsvValue(d.synced)}`,
    `Pending SAG,${safeCsvValue(d.pendingSag)}`,
    `Conflicts,${safeCsvValue(d.conflicts)}`,
    `As Of,${safeCsvValue(d.asOf)}`,
  ];
  return rows.join("\n") + "\n";
}

function formatSalesPerformanceCsv(data: unknown): string {
  const d = data as Record<string, unknown>;
  const rows = [
    "Metric,Value",
    `Total Orders,${safeCsvValue(d.totalOrders)}`,
    `Total Value,${safeCsvValue(d.totalValue)}`,
    `Average Ticket,${safeCsvValue(d.avgTicket)}`,
    `Total Sellers,${safeCsvValue(d.totalSellers)}`,
    `Total Customers,${safeCsvValue(d.totalCustomers)}`,
    `As Of,${safeCsvValue(d.asOf)}`,
  ];
  return rows.join("\n") + "\n";
}

// ── JSON Formatter ───────────────────────────────────────────────────────────

function formatJson(reportType: ReportType, data: unknown): string {
  return JSON.stringify(
    { reportType, data, generatedAt: new Date().toISOString() },
    null,
    2,
  );
}

// ── Validation ───────────────────────────────────────────────────────────────

const VALID_REPORT_TYPES: ReadonlySet<string> = new Set([
  "customer_summary",
  "sales_performance",
  "orders_summary",
]);

export function isValidReportType(value: unknown): value is ReportType {
  return typeof value === "string" && VALID_REPORT_TYPES.has(value);
}

export function isValidReportFormat(value: unknown): value is ReportFormat {
  return value === "csv" || value === "json";
}

/**
 * Map report type to the corresponding capability ID.
 */
export function reportTypeToCapabilityId(reportType: ReportType): string {
  switch (reportType) {
    case "customer_summary":
      return "commercial.customers.summary.read";
    case "orders_summary":
      return "commercial.orders.summary.read";
    case "sales_performance":
      return "commercial.sales.performance.read";
  }
}
