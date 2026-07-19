/**
 * lib/operational-map/workbook/exporters/export-workbook-markdown.ts
 *
 * Markdown exporter for the validation workbook.
 *
 * Outputs:
 *   - Full workbook by domain
 *   - Meeting checklist (priority-sorted questions)
 *   - Executive report
 *   - Blocker report
 *
 * Sprint: AGENTIK-SAG-VALIDATION-WORKBOOK-01
 */

import type {
  ValidationWorkbook,
  ValidationWorkbookRow,
} from "../operational-validation-workbook-types";

// ─── Priority badge ───────────────────────────────────────────────────────────

function priorityBadge(p: string): string {
  switch (p) {
    case "critical": return "🔴 CRÍTICA";
    case "high":     return "🟠 ALTA";
    case "medium":   return "🟡 MEDIA";
    default:         return "⚪ BAJA";
  }
}

function answerBadge(s: string): string {
  switch (s) {
    case "answered":       return "✅ Respondida";
    case "blocked":        return "🚫 Bloqueada";
    case "not_applicable": return "➖ N/A";
    default:               return "⬜ Pendiente";
  }
}

function blockerBadge(b: string): string {
  if (b === "critical") return " 🚨 BLOQUEADOR";
  if (b === "high")     return " ⚠️ ALTO RIESGO";
  return "";
}

// ─── Meeting checklist ────────────────────────────────────────────────────────

export function exportMeetingChecklistMarkdown(workbook: ValidationWorkbook): string {
  const now = new Date(workbook.generatedAt).toLocaleString("es-CO");
  const rows = workbook.rows
    .filter(r => r.answerState === "pending" || r.answerState === "blocked")
    .sort((a, b) => b.scores.meetingPriorityScore - a.scores.meetingPriorityScore);

  const lines: string[] = [
    `# Checklist Técnico SAG — Reunión de Validación`,
    `**Generado:** ${now}`,
    `**Preguntas pendientes:** ${rows.length}`,
    `**Bloqueadores críticos:** ${workbook.blockers.filter(b => b.blockerLevel === "critical").length}`,
    "",
    "---",
    "",
  ];

  let currentDomain = "";
  for (const row of rows) {
    if (row.domainLabel !== currentDomain) {
      currentDomain = row.domainLabel;
      lines.push(`## ${currentDomain}`, "");
    }

    const sagTable  = row.sagTableCandidate ? `\`${row.sagTableCandidate}\`` : "`SAG_CONFIRMAR`";
    const sagFields = row.sagFieldCandidates.length > 0
      ? row.sagFieldCandidates.map(f => `\`${f}\``).join(", ")
      : "`SAG_CONFIRMAR`";

    lines.push(
      `### ${priorityBadge(row.priority)} ${row.entityLabel}${blockerBadge(row.blockerLevel)}`,
      "",
      `**Pregunta:** ${row.validationQuestion}`,
      "",
      `| Campo | Valor |`,
      `|---|---|`,
      `| Tabla SAG candidata | ${sagTable} |`,
      `| Campos candidatos | ${sagFields} |`,
      `| Impacto si no se responde | ${row.operationalImpact} |`,
      `| Score reunión | ${row.scores.meetingPriorityScore} |`,
      `| Estado | ${answerBadge(row.answerState)} |`,
      "",
      `**Respuesta:** _________________________`,
      "",
      "---",
      "",
    );
  }

  return lines.join("\n");
}

// ─── Executive report ─────────────────────────────────────────────────────────

export function exportExecutiveReportMarkdown(workbook: ValidationWorkbook): string {
  const now = new Date(workbook.generatedAt).toLocaleString("es-CO");
  const s   = workbook.executiveSummary;

  const lines: string[] = [
    `# Reporte Ejecutivo — Operational Source Map`,
    `**Generado:** ${now}`,
    "",
    `## Estado de Integración SAG`,
    "",
    `| Métrica | Valor |`,
    `|---|---|`,
    `| Total entidades operacionales | ${s.totalEntities} |`,
    `| Preguntas de validación | ${s.totalQuestions} |`,
    `| Readiness de integración | ${s.readinessScore}% |`,
    `| Bloqueadores críticos abiertos | ${s.criticalBlockers} |`,
    `| Bloqueadores altos abiertos | ${s.highBlockers} |`,
    "",
    `## Entidades por Estado`,
    "",
    `| Estado | Cantidad |`,
    `|---|---|`,
    `| ✅ Confirmadas | ${s.byStatus.confirmed} |`,
    `| ⏳ Pendiente SAG | ${s.byStatus.pending_sag} |`,
    `| 🤖 Interno Agentik | ${s.byStatus.interno_agentik} |`,
    `| 🔗 CRM | ${s.byStatus.crm} |`,
    `| 🔮 Futuro | ${s.byStatus.futuro} |`,
    "",
    `## Dominios con Más Preguntas Abiertas`,
    "",
    `| Dominio | Preguntas Abiertas |`,
    `|---|---|`,
    ...s.topBlockingDomains.map(d => `| ${d.label} | ${d.openCount} |`),
    "",
    `## Top 10 Preguntas Críticas para la Reunión`,
    "",
  ];

  for (const row of s.criticalQuestions) {
    lines.push(
      `### ${row.domainLabel} — ${row.entityLabel}`,
      `> ${row.validationQuestion}`,
      `**Impacto:** ${row.operationalImpact}`,
      "",
    );
  }

  return lines.join("\n");
}

// ─── Full workbook by domain ──────────────────────────────────────────────────

export function exportWorkbookToMarkdown(workbook: ValidationWorkbook): string {
  const now = new Date(workbook.generatedAt).toLocaleString("es-CO");

  const lines: string[] = [
    `# Agentik — Workbook de Validación Operacional SAG`,
    `**Generado:** ${now}`,
    `**Org:** ${workbook.organizationId ?? "Sistema"}`,
    "",
  ];

  for (const domain of workbook.byDomain) {
    lines.push(
      `## ${domain.label}`,
      `_${domain.description}_`,
      "",
      `**Pendientes:** ${domain.stats.pending} | **Respondidas:** ${domain.stats.answered} | **Críticas abiertas:** ${domain.stats.criticalOpen}`,
      "",
      `| Prioridad | Entidad | Tabla SAG | Pregunta | Estado |`,
      `|---|---|---|---|---|`,
    );

    for (const row of domain.rows) {
      const table = row.sagTableCandidate ?? "SAG_CONFIRMAR";
      const q     = row.validationQuestion.length > 80
        ? row.validationQuestion.substring(0, 80) + "…"
        : row.validationQuestion;
      lines.push(
        `| ${priorityBadge(row.priority)} | ${row.entityLabel}${blockerBadge(row.blockerLevel)} | \`${table}\` | ${q} | ${answerBadge(row.answerState)} |`,
      );
    }
    lines.push("");
  }

  // Blockers section
  if (workbook.blockers.length > 0) {
    lines.push(`## 🚨 Bloqueadores Operacionales`, "");
    for (const b of workbook.blockers) {
      lines.push(
        `### ${b.blockerLevel === "critical" ? "🔴" : "🟠"} ${b.entityLabel} (${b.domainLabel})`,
        `**Razón:** ${b.reason}`,
        `**Flujos degradados:** ${b.degradedFlows.join(", ")}`,
        "",
      );
    }
  }

  return lines.join("\n");
}

// ─── Row detail card (single-row Markdown, for copy-to-meeting) ───────────────

export function exportRowDetailMarkdown(row: ValidationWorkbookRow): string {
  return [
    `**[${row.priority.toUpperCase()}] ${row.domainLabel} › ${row.entityLabel}**`,
    ``,
    `> ${row.validationQuestion}`,
    ``,
    `- **Tabla SAG:** ${row.sagTableCandidate ?? "SAG_CONFIRMAR"}`,
    `- **Campos:** ${row.sagFieldCandidates.length > 0 ? row.sagFieldCandidates.join(", ") : "SAG_CONFIRMAR"}`,
    `- **Impacto:** ${row.operationalImpact}`,
    `- **Score reunión:** ${row.scores.meetingPriorityScore}`,
    ``,
    `Respuesta: ___________`,
  ].join("\n");
}
