/**
 * lib/integrations/sag/executive-pack/export/presend-validation-runner.ts
 *
 * SAG Executive Pack Export — Pre-Send Validation Runner
 *
 * Ejecuta automáticamente:
 * - Validation checklist (checks automáticos)
 * - Redaction layer (escanea contenido interno)
 * - Open questions review (preguntas críticas pendientes)
 * - View request review (campos requeridos)
 *
 * Produce: READY_TO_SEND = true | false
 *
 * Si existe contenido interno filtrado → READY_TO_SEND = false
 *
 * Sprint: AGENTIK-SAG-EXECUTIVE-PACK-EXPORT-01
 */

import {
  buildValidationChecklist,
  getChecklistSummary,
} from "../sag-validation-checklist";

import {
  SAG_OPEN_QUESTIONS,
  getOpenQuestionsSummary,
} from "../sag-open-questions";

import {
  SAG_VIEW_REQUEST_DOC,
} from "../sag-view-request-doc";

import {
  redactDomainsForExternal,
} from "../sag-redaction-layer";

import { SAG_MASTER_CONTRACT } from "../../data-contract/sag-domain-contracts";

import { SAG_EXECUTIVE_SUMMARY_META } from "../sag-executive-summary";

// ── Internal content scanner ───────────────────────────────────────────────────

const INTERNAL_PATTERNS: RegExp[] = [
  /copilot/i,
  /agentik ia/i,
  /agentik\s+ai/i,
  /marketing studio/i,
  /roadmap/i,
  /cliente 360/i,
  /inteligencia operacional/i,
  /recomendaciones automáticas/i,
  /capa de inteligencia/i,
];

function scanForInternalContent(text: string): string[] {
  const found: string[] = [];
  for (const p of INTERNAL_PATTERNS) {
    if (p.test(text)) {
      found.push(`/${p.source}/${p.flags}`);
    }
  }
  return found;
}

// ── Runner result types ────────────────────────────────────────────────────────

export interface ChecklistRunResult {
  passed:         boolean;
  total:          number;
  autoPassedCount:  number;
  blockersRemaining: number;
  issues:         string[];
}

export interface RedactionRunResult {
  passed:              boolean;
  internalPatternsFound: string[];
  affectedFields:      number;
}

export interface QuestionsRunResult {
  passed:          boolean;
  criticalPending: number;
  totalPending:    number;
  warning:         string | null;
}

export interface ViewsRunResult {
  passed:          boolean;
  totalViews:      number;
  viewsWithIssues: string[];
}

export interface ValidationRunSummary {
  readyToSend:        boolean;
  version:            string;
  fecha:              string;
  generadoEn:         string;
  checklist:          ChecklistRunResult;
  redaction:          RedactionRunResult;
  questions:          QuestionsRunResult;
  views:              ViewsRunResult;
  blockers:           string[];
  warnings:           string[];
}

// ── Individual runners ─────────────────────────────────────────────────────────

function runChecklist(): ChecklistRunResult {
  const items = buildValidationChecklist();
  const summary = getChecklistSummary(items);
  const issues: string[] = [];

  // Collect failing auto-checks
  for (const item of items) {
    if (item.status === "failed") {
      issues.push(`[${item.id}] FAILED — ${item.descripcion}. Resultado: ${item.resultado ?? "N/A"}`);
    }
  }

  return {
    passed:            summary.bloqueantes === 0,
    total:             summary.total,
    autoPassedCount:   summary.passed,
    blockersRemaining: summary.bloqueantes,
    issues,
  };
}

function runRedactionCheck(): RedactionRunResult {
  const internalPatternsFound: string[] = [];
  let affectedFields = 0;

  // Run the redaction layer over all domains
  const redacted = redactDomainsForExternal(SAG_MASTER_CONTRACT.domains);

  // Scan all external-facing text in the redacted output
  for (const domain of redacted) {
    const scanTargets = [
      domain.descripcion,
      ...domain.campos.map(c => c.descripcion),
      ...domain.campos.map(c => c.notas ?? ""),
      ...domain.bloqueadores,
    ];

    for (const text of scanTargets) {
      const found = scanForInternalContent(text);
      if (found.length > 0) {
        internalPatternsFound.push(...found.map(p => `${domain.id}: ${p}`));
        affectedFields++;
      }
    }
  }

  // Also scan view request doc
  for (const view of SAG_VIEW_REQUEST_DOC) {
    const scanTargets = [
      view.proposito,
      ...view.observaciones,
      ...view.filtrosSugeridos,
      ...view.camposRequeridos.map(c => c.descripcion),
      ...view.camposOpcionales.map(c => c.descripcion),
    ];

    for (const text of scanTargets) {
      const found = scanForInternalContent(text);
      if (found.length > 0) {
        internalPatternsFound.push(...found.map(p => `${view.nombreVista}: ${p}`));
        affectedFields++;
      }
    }
  }

  return {
    passed:                internalPatternsFound.length === 0,
    internalPatternsFound: [...new Set(internalPatternsFound)],
    affectedFields,
  };
}

function runQuestionsReview(): QuestionsRunResult {
  const summary = getOpenQuestionsSummary();
  const criticalPending = SAG_OPEN_QUESTIONS.filter(
    q => q.prioridad === "crítica" && q.status === "pendiente"
  ).length;

  const warning = criticalPending > 0
    ? `${criticalPending} preguntas críticas pendientes de respuesta de SAG — la integración no puede iniciar sin ellas`
    : null;

  return {
    passed:          true,  // Questions don't block sending — they ARE the document
    criticalPending,
    totalPending:    summary.total,
    warning,
  };
}

function runViewsReview(): ViewsRunResult {
  const viewsWithIssues: string[] = [];

  for (const view of SAG_VIEW_REQUEST_DOC) {
    if (view.camposRequeridos.length === 0) {
      viewsWithIssues.push(`${view.nombreVista}: no tiene campos requeridos definidos`);
    }
    if (!view.proposito || view.proposito.trim().length < 10) {
      viewsWithIssues.push(`${view.nombreVista}: propósito demasiado corto o vacío`);
    }
  }

  const expectedViews = SAG_EXECUTIVE_SUMMARY_META.totalVistas;
  if (SAG_VIEW_REQUEST_DOC.length !== expectedViews) {
    viewsWithIssues.push(
      `Se esperaban ${expectedViews} vistas, se encontraron ${SAG_VIEW_REQUEST_DOC.length}`
    );
  }

  return {
    passed:          viewsWithIssues.length === 0,
    totalViews:      SAG_VIEW_REQUEST_DOC.length,
    viewsWithIssues,
  };
}

// ── Master runner ──────────────────────────────────────────────────────────────

export function runPreSendValidation(): ValidationRunSummary {
  const checklist  = runChecklist();
  const redaction  = runRedactionCheck();
  const questions  = runQuestionsReview();
  const views      = runViewsReview();

  const blockers: string[] = [
    ...checklist.issues,
    ...(redaction.passed ? [] : [`Contenido interno detectado en ${redaction.affectedFields} campo(s). Patrones: ${redaction.internalPatternsFound.join("; ")}`]),
    ...(views.passed ? [] : views.viewsWithIssues),
  ];

  const warnings: string[] = [
    ...(questions.warning ? [questions.warning] : []),
  ];

  const readyToSend =
    checklist.passed &&
    redaction.passed &&
    views.passed;

  return {
    readyToSend,
    version:    SAG_EXECUTIVE_SUMMARY_META.version,
    fecha:      SAG_EXECUTIVE_SUMMARY_META.fecha,
    generadoEn: new Date().toISOString(),
    checklist,
    redaction,
    questions,
    views,
    blockers,
    warnings,
  };
}

// ── Render as text ─────────────────────────────────────────────────────────────

export function renderValidationRunText(summary: ValidationRunSummary): string {
  const sep = "═".repeat(72);
  const lines: string[] = [
    sep,
    "VALIDACIÓN PRE-ENVÍO — SAG Executive Pack",
    `Versión ${summary.version}  |  Generado: ${summary.generadoEn}`,
    sep,
    "",
    `RESULTADO: ${summary.readyToSend ? "✓ LISTO PARA ENVIAR" : "✗ NO LISTO — Resolver bloqueantes"}`,
    "",
    "─".repeat(72),
    "",
    `[1] Checklist automático`,
    `    Checks automáticos pasados: ${summary.checklist.autoPassedCount}/${summary.checklist.total}`,
    `    Bloqueantes restantes:      ${summary.checklist.blockersRemaining}`,
    `    Resultado: ${summary.checklist.passed ? "PASS" : "FAIL"}`,
    "",
    `[2] Escaneo de contenido interno (redaction layer)`,
    `    Patrones internos encontrados: ${summary.redaction.internalPatternsFound.length}`,
    `    Campos afectados:              ${summary.redaction.affectedFields}`,
    `    Resultado: ${summary.redaction.passed ? "PASS" : "FAIL"}`,
    "",
    `[3] Revisión de preguntas abiertas`,
    `    Preguntas críticas pendientes: ${summary.questions.criticalPending}`,
    `    Total preguntas:               ${summary.questions.totalPending}`,
    `    Resultado: PASS (las preguntas son el documento — no bloquean el envío)`,
    "",
    `[4] Revisión de solicitud de vistas`,
    `    Vistas revisadas: ${summary.views.totalViews}`,
    `    Vistas con issues: ${summary.views.viewsWithIssues.length}`,
    `    Resultado: ${summary.views.passed ? "PASS" : "FAIL"}`,
    "",
  ];

  if (summary.blockers.length > 0) {
    lines.push("BLOQUEANTES:");
    for (const b of summary.blockers) {
      lines.push(`  ✗ ${b}`);
    }
    lines.push("");
  }

  if (summary.warnings.length > 0) {
    lines.push("ADVERTENCIAS:");
    for (const w of summary.warnings) {
      lines.push(`  ⚠ ${w}`);
    }
    lines.push("");
  }

  lines.push(sep);

  return lines.join("\n");
}
