/**
 * lib/copilot-core/copilot-core-report-generator.ts
 *
 * Copilot Core — Report Generator
 * Sprint: COPILOT-CONVERSATIONAL-RUNTIME-01C → COPILOT-DESKTOP-RAIL-UX-01R1
 *
 * Pure function. Formats adapter DTOs as CSV or JSON for download.
 * No storage, no artifact ID, no R2, no persistence.
 * Direct download response with Content-Disposition.
 *
 * R1: Enhanced CSV format with Spanish headers, multi-section layout,
 *     derived metrics (percentages), origin breakdowns, and metadata.
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

function formatNumber(n: number): string {
  return n.toLocaleString("es-CO");
}

function formatCurrency(n: number): string {
  return `$${n.toLocaleString("es-CO")}`;
}

function formatPercent(n: number, total: number): string {
  if (total === 0) return "—";
  return `${((n / total) * 100).toFixed(1)}%`;
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
  const total = Number(d.totalCustomers ?? 0);
  const active = Number(d.activeCustomers ?? 0);
  const inactive = Number(d.inactiveCustomers ?? 0);
  const asOf = safeCsvValue(d.asOf);

  const rows = [
    `Informe de Clientes,Copilot Preview`,
    `Generado,${asOf}`,
    ``,
    `Categoría,Total,Porcentaje`,
    `Clientes Totales,${safeCsvValue(formatNumber(total))},100%`,
    `Clientes Activos,${safeCsvValue(formatNumber(active))},${safeCsvValue(formatPercent(active, total))}`,
    `Clientes Inactivos,${safeCsvValue(formatNumber(inactive))},${safeCsvValue(formatPercent(inactive, total))}`,
  ];

  // Source breakdown if available
  const sources = d.sourceBreakdown as Array<{ source: string; count: number }> | undefined;
  if (sources && sources.length > 0) {
    rows.push(``);
    rows.push(`Fuente,Cantidad`);
    for (const s of sources) {
      rows.push(`${safeCsvValue(s.source)},${safeCsvValue(formatNumber(s.count))}`);
    }
  }

  rows.push(``);
  rows.push(`Nota: Datos agregados sin información personal identificable.`);
  return rows.join("\n") + "\n";
}

function formatOrdersSummaryCsv(data: unknown): string {
  const d = data as Record<string, unknown>;
  const today = Number(d.totalOrdersToday ?? 0);
  const synced = Number(d.synced ?? 0);
  const pending = Number(d.pendingSag ?? 0);
  const conflicts = Number(d.conflicts ?? 0);
  const asOf = safeCsvValue(d.asOf);

  const rows = [
    `Informe de Pedidos,Copilot Preview`,
    `Generado,${asOf}`,
    ``,
    `Resumen del Día,Cantidad`,
    `Pedidos Hoy,${safeCsvValue(formatNumber(today))}`,
    `Sincronizados,${safeCsvValue(formatNumber(synced))}`,
    `Pendientes SAG,${safeCsvValue(formatNumber(pending))}`,
    `Conflictos,${safeCsvValue(formatNumber(conflicts))}`,
  ];

  // Origin breakdown
  const origin = d.originBreakdown as Record<string, number> | undefined;
  if (origin) {
    rows.push(``);
    rows.push(`Origen,Cantidad,Porcentaje`);
    const totalOrigin = Object.values(origin).reduce((a, b) => a + b, 0);
    const labels: Record<string, string> = {
      fromAgentik:   "Agentik",
      fromSag:       "SAG",
      fromImport:    "Importación",
      fromMigration: "Migración",
    };
    for (const [key, count] of Object.entries(origin)) {
      if (count > 0) {
        rows.push(`${safeCsvValue(labels[key] ?? key)},${safeCsvValue(formatNumber(count))},${safeCsvValue(formatPercent(count, totalOrigin))}`);
      }
    }
  }

  rows.push(``);
  rows.push(`Nota: Datos agregados sin información personal identificable.`);
  return rows.join("\n") + "\n";
}

function formatSalesPerformanceCsv(data: unknown): string {
  const d = data as Record<string, unknown>;
  const orders = Number(d.totalOrders ?? 0);
  const value = Number(d.totalValue ?? 0);
  const avg = Number(d.avgTicket ?? 0);
  const sellers = Number(d.totalSellers ?? 0);
  const customers = Number(d.totalCustomers ?? 0);
  const asOf = safeCsvValue(d.asOf);

  const rows = [
    `Informe de Desempeño Comercial,Copilot Preview`,
    `Generado,${asOf}`,
    ``,
    `KPI,Valor`,
    `Total Pedidos,${safeCsvValue(formatNumber(orders))}`,
    `Valor Total,${safeCsvValue(formatCurrency(value))}`,
    `Ticket Promedio,${safeCsvValue(formatCurrency(avg))}`,
    `Vendedores Activos,${safeCsvValue(formatNumber(sellers))}`,
    `Clientes Atendidos,${safeCsvValue(formatNumber(customers))}`,
  ];

  // Derived metrics
  if (sellers > 0) {
    rows.push(``);
    rows.push(`Métrica Derivada,Valor`);
    rows.push(`Pedidos por Vendedor,${safeCsvValue(formatNumber(Math.round(orders / sellers)))}`);
    rows.push(`Valor por Vendedor,${safeCsvValue(formatCurrency(Math.round(value / sellers)))}`);
    if (customers > 0) {
      rows.push(`Clientes por Vendedor,${safeCsvValue(formatNumber(Math.round(customers / sellers)))}`);
    }
  }

  rows.push(``);
  rows.push(`Nota: Datos agregados sin información personal identificable.`);
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
