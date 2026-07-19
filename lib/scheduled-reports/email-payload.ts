/**
 * lib/scheduled-reports/email-payload.ts
 *
 * Converts a ReportResult into HTML + plain-text email bodies.
 * Called by executeScheduledReport() after a successful run.
 * No business logic — pure presentation.
 */

import type { ReportResult } from "@/lib/reports/runners";

// ── Helpers ───────────────────────────────────────────────────────────────────

const FREQ_LABEL: Record<string, string> = {
  WEEKLY:  "Semanal",
  MONTHLY: "Mensual",
  ONCE:    "Una vez",
};

function fmtCell(v: string | number | null, isCurrency: boolean): string {
  if (v == null) return "—";
  if (isCurrency && typeof v === "number") {
    return new Intl.NumberFormat("es-CO", {
      style: "currency", currency: "COP", maximumFractionDigits: 0,
    }).format(v);
  }
  return String(v);
}

// ── HTML ──────────────────────────────────────────────────────────────────────

export function buildReportEmailHtml(
  meta:   { title: string; frequency: string },
  result: ReportResult,
): string {
  const kpiRows = result.kpis
    .map(k => `
      <tr>
        <td style="padding:6px 12px;font-size:12px;color:#555;border-bottom:1px solid #f3f4f6;">${k.label}</td>
        <td style="padding:6px 12px;font-size:13px;font-weight:700;border-bottom:1px solid #f3f4f6;${
          k.highlight ? "color:#dc2626;" : k.positive ? "color:#16a34a;" : "color:#111;"
        }">${k.value}</td>
      </tr>`)
    .join("");

  const colHeaders = result.columns
    .map(c => `<th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;background:#f5f5f5;border-bottom:2px solid #e5e7eb;white-space:nowrap;">${c.label}</th>`)
    .join("");

  const dataRows = result.rows.slice(0, 30).map((row, i) =>
    `<tr style="background:${i % 2 === 0 ? "#fff" : "#fafafa"};">
      ${result.columns.map(c =>
        `<td style="padding:7px 10px;font-size:12px;border-bottom:1px solid #f3f4f6;">${fmtCell(row[c.key] as string | number | null, !!c.currency)}</td>`,
      ).join("")}
    </tr>`,
  ).join("");

  const truncNote = result.totalRows > 30
    ? `<p style="margin:8px 0 0;font-size:11px;color:#9ca3af;">Mostrando 30 de ${result.totalRows} resultados.</p>`
    : "";

  const generatedDate = new Date().toLocaleDateString("es-CO", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:24px;background:#f9fafb;font-family:monospace;">
<div style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">

  <!-- Header -->
  <div style="background:#111;padding:20px 24px;">
    <p style="margin:0 0 4px;font-size:10px;font-weight:700;letter-spacing:0.08em;color:#666;text-transform:uppercase;">
      Agentik · Informe programado · ${FREQ_LABEL[meta.frequency] ?? meta.frequency}
    </p>
    <h1 style="margin:0;font-size:20px;font-weight:900;color:#fff;letter-spacing:-0.01em;">${result.title}</h1>
    <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;">${result.subtitle}</p>
  </div>

  ${result.kpis.length > 0 ? `
  <!-- KPI summary -->
  <div style="padding:20px 24px 12px;">
    <p style="margin:0 0 8px;font-size:10px;font-weight:700;letter-spacing:0.06em;color:#9ca3af;text-transform:uppercase;">Resumen</p>
    <table style="border-collapse:collapse;width:100%;">${kpiRows}</table>
  </div>` : ""}

  ${result.rows.length > 0 ? `
  <!-- Data table -->
  <div style="padding:16px 24px 20px;overflow-x:auto;">
    <p style="margin:0 0 8px;font-size:10px;font-weight:700;letter-spacing:0.06em;color:#9ca3af;text-transform:uppercase;">
      Detalle · ${result.totalRows} resultado${result.totalRows !== 1 ? "s" : ""}
    </p>
    <table style="border-collapse:collapse;width:100%;min-width:400px;">
      <thead><tr>${colHeaders}</tr></thead>
      <tbody>${dataRows}</tbody>
    </table>
    ${truncNote}
  </div>
  ` : `
  <div style="padding:24px;text-align:center;color:#9ca3af;font-size:13px;">
    Sin resultados para este período.
  </div>`}

  <!-- Footer -->
  <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:14px 24px;">
    <p style="margin:0;font-size:11px;color:#9ca3af;">
      Generado por Agentik el ${generatedDate}
    </p>
  </div>

</div>
</body>
</html>`;
}

// ── Plain text ────────────────────────────────────────────────────────────────

export function buildReportEmailText(result: ReportResult): string {
  const kpis = result.kpis.map(k => `${k.label}: ${k.value}`).join(" | ");
  return [
    result.title,
    result.subtitle,
    "─".repeat(40),
    kpis || "(Sin KPIs)",
    "",
    `${result.totalRows} resultado${result.totalRows !== 1 ? "s" : ""}.`,
  ].join("\n");
}
