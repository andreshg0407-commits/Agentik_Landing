/**
 * lib/integrations/sag/executive-pack/export/executive-summary-export.ts
 *
 * SAG Executive Pack Export — Executive Summary
 *
 * Genera el Resumen Ejecutivo en tres formatos:
 * - Markdown   → revisión interna, GitHub, Notion
 * - Plain Text → correo, impresión, accesibilidad
 * - PDF-ready  → objeto estructurado listo para renderer PDF
 *
 * Fuente: sag-executive-summary.ts
 * Sprint: AGENTIK-SAG-EXECUTIVE-PACK-EXPORT-01
 */

import {
  SAG_EXECUTIVE_SUMMARY,
  SAG_EXECUTIVE_SUMMARY_META,
} from "../sag-executive-summary";

// ── Internal content guard ─────────────────────────────────────────────────────

const BLOCKED_PATTERNS: RegExp[] = [
  /copilot/i,
  /agentik ia/i,
  /agentik\s+ai/i,
  /marketing studio/i,
  /roadmap/i,
  /cliente 360/i,
  /automatizacion/i,
  /inteligencia operacional/i,
  /recomendaciones automáticas/i,
  /capa de inteligencia/i,
  /IA\b/,
];

function hasInternalContent(text: string): boolean {
  return BLOCKED_PATTERNS.some(p => p.test(text));
}

function assertClean(text: string, label: string): void {
  if (hasInternalContent(text)) {
    throw new Error(
      `[executive-summary-export] Internal content detected in "${label}". ` +
      "Strip all Copilot/IA/roadmap references before exporting."
    );
  }
}

// ── PDF-ready document type ────────────────────────────────────────────────────

export interface PdfReadySection {
  heading:    string;
  paragraphs: string[];
}

export interface PdfReadyDocument {
  title:       string;
  subtitle:    string;
  version:     string;
  date:        string;
  preparedBy:  string;
  audience:    string;
  sections:    PdfReadySection[];
}

// ── Markdown export ────────────────────────────────────────────────────────────

export function exportExecutiveSummaryMarkdown(): string {
  const { meta, secciones } = SAG_EXECUTIVE_SUMMARY;

  const lines: string[] = [
    `# ${meta.titulo}`,
    "",
    `**${meta.subtitulo}**`,
    "",
    `> Versión ${meta.version} &nbsp;|&nbsp; ${meta.fecha} &nbsp;|&nbsp; ${meta.clasificacion}`,
    "",
    "---",
    "",
  ];

  for (const sec of secciones) {
    lines.push(`## ${sec.titulo}`);
    lines.push("");
    for (const p of sec.contenido) {
      assertClean(p, sec.titulo);
      lines.push(p);
      lines.push("");
    }
    lines.push("---");
    lines.push("");
  }

  lines.push(`*Preparado por: ${meta.preparadoPor}*`);

  const result = lines.join("\n");
  assertClean(result, "Executive Summary Markdown");
  return result;
}

// ── Plain text export ──────────────────────────────────────────────────────────

export function exportExecutiveSummaryText(): string {
  const { meta, secciones } = SAG_EXECUTIVE_SUMMARY;
  const sep = "─".repeat(72);

  const lines: string[] = [
    meta.titulo.toUpperCase(),
    meta.subtitulo,
    `Versión ${meta.version}  |  Fecha: ${meta.fecha}`,
    meta.clasificacion,
    "",
    sep,
    "",
  ];

  for (const sec of secciones) {
    lines.push(sec.titulo);
    lines.push("");
    for (const p of sec.contenido) {
      assertClean(p, sec.titulo);
      // Wrap at ~72 chars for readability in plain text
      lines.push(p);
      lines.push("");
    }
    lines.push(sep);
    lines.push("");
  }

  lines.push(`Preparado por: ${meta.preparadoPor}`);

  const result = lines.join("\n");
  assertClean(result, "Executive Summary Text");
  return result;
}

// ── PDF-ready export ───────────────────────────────────────────────────────────

export function exportExecutiveSummaryPdfReady(): PdfReadyDocument {
  const { meta, secciones } = SAG_EXECUTIVE_SUMMARY;

  const sections: PdfReadySection[] = secciones.map(sec => {
    for (const p of sec.contenido) {
      assertClean(p, sec.titulo);
    }
    return {
      heading:    sec.titulo,
      paragraphs: sec.contenido,
    };
  });

  return {
    title:      meta.titulo,
    subtitle:   meta.subtitulo,
    version:    meta.version,
    date:       meta.fecha,
    preparedBy: meta.preparadoPor,
    audience:   "Equipo Técnico y Funcional — SAG",
    sections,
  };
}

// ── Validation ─────────────────────────────────────────────────────────────────

export interface ExecutiveSummaryValidationResult {
  valid:       boolean;
  issues:      string[];
  wordCount:   number;
  sectionCount: number;
  readingTimeMinutes: number;
}

export function validateExecutiveSummary(): ExecutiveSummaryValidationResult {
  const { secciones } = SAG_EXECUTIVE_SUMMARY;
  const issues: string[] = [];

  const fullText = secciones.flatMap(s => s.contenido).join(" ");
  const wordCount = fullText.split(/\s+/).length;
  const readingTimeMinutes = Math.ceil(wordCount / 200); // ~200 wpm

  // Check for internal content
  for (const sec of secciones) {
    for (const p of sec.contenido) {
      for (const pat of BLOCKED_PATTERNS) {
        if (pat.test(p)) {
          issues.push(`Internal content in "${sec.titulo}": pattern /${pat.source}/ matched`);
        }
      }
    }
  }

  // Must be readable in <10 minutes
  if (readingTimeMinutes > 10) {
    issues.push(`Reading time ${readingTimeMinutes}min exceeds 10min limit — consider shortening`);
  }

  return {
    valid:       issues.length === 0,
    issues,
    wordCount,
    sectionCount: secciones.length,
    readingTimeMinutes,
  };
}

// ── Convenience: validate metadata ────────────────────────────────────────────

export const EXECUTIVE_SUMMARY_META = SAG_EXECUTIVE_SUMMARY_META;
