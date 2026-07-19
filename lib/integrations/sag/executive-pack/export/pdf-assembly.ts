/**
 * lib/integrations/sag/executive-pack/export/pdf-assembly.ts
 *
 * SAG Executive Pack Export — PDF Assembly Layer
 *
 * Ensambla el paquete completo de 3 documentos PDF sin duplicar contenido.
 * Permite exportación individual o completa.
 *
 * Documentos:
 *   1. Resumen Ejecutivo
 *   2. Solicitud de Vistas
 *   3. Preguntas Abiertas
 *
 * Sprint: AGENTIK-SAG-EXECUTIVE-PACK-EXPORT-01
 */

import {
  exportExecutiveSummaryPdfReady,
  exportExecutiveSummaryMarkdown,
  exportExecutiveSummaryText,
  validateExecutiveSummary,
  type PdfReadyDocument,
} from "./executive-summary-export";

import {
  exportViewRequestPdfReady,
  exportViewRequestMarkdown,
  exportViewRequestText,
  type PdfReadyView,
} from "./view-request-export";

import {
  exportOpenQuestionsPdfReady,
  exportOpenQuestionsMarkdown,
  exportOpenQuestionsText,
  type PdfReadyQuestionsDocument,
} from "./open-questions-export";

import { SAG_EXECUTIVE_SUMMARY_META } from "../sag-executive-summary";

// ── Package types ──────────────────────────────────────────────────────────────

export type PackageDocumentId =
  | "resumen_ejecutivo"
  | "solicitud_vistas"
  | "preguntas_abiertas";

export type ExportFormat = "markdown" | "text" | "pdf_ready";

export interface PackageDocument<T> {
  id:            PackageDocumentId;
  nombreArchivo: string;
  contenido:     T;
}

export interface AssembledPackage<T> {
  version:      string;
  fecha:        string;
  generadoEn:   string;
  documentos:   PackageDocument<T>[];
}

// ── Individual exports ─────────────────────────────────────────────────────────

export function assembleDocument(
  id: PackageDocumentId,
  format: "markdown"
): PackageDocument<string>;
export function assembleDocument(
  id: PackageDocumentId,
  format: "text"
): PackageDocument<string>;
export function assembleDocument(
  id: PackageDocumentId,
  format: "pdf_ready"
): PackageDocument<PdfReadyDocument | PdfReadyView[] | PdfReadyQuestionsDocument>;
export function assembleDocument(
  id: PackageDocumentId,
  format: ExportFormat
): PackageDocument<unknown> {
  const version = SAG_EXECUTIVE_SUMMARY_META.version;

  switch (id) {
    case "resumen_ejecutivo":
      return {
        id,
        nombreArchivo: `Agentik-SAG-Resumen-Ejecutivo-v${version}.${format === "markdown" ? "md" : format === "text" ? "txt" : "json"}`,
        contenido: format === "markdown"
          ? exportExecutiveSummaryMarkdown()
          : format === "text"
          ? exportExecutiveSummaryText()
          : exportExecutiveSummaryPdfReady(),
      };

    case "solicitud_vistas":
      return {
        id,
        nombreArchivo: `Agentik-SAG-Solicitud-Vistas-v${version}.${format === "markdown" ? "md" : format === "text" ? "txt" : "json"}`,
        contenido: format === "markdown"
          ? exportViewRequestMarkdown()
          : format === "text"
          ? exportViewRequestText()
          : exportViewRequestPdfReady(),
      };

    case "preguntas_abiertas":
      return {
        id,
        nombreArchivo: `Agentik-SAG-Preguntas-Abiertas-v${version}.${format === "markdown" ? "md" : format === "text" ? "txt" : "json"}`,
        contenido: format === "markdown"
          ? exportOpenQuestionsMarkdown()
          : format === "text"
          ? exportOpenQuestionsText()
          : exportOpenQuestionsPdfReady(),
      };
  }
}

// ── Full package assembly ──────────────────────────────────────────────────────

const ALL_DOCUMENT_IDS: PackageDocumentId[] = [
  "resumen_ejecutivo",
  "solicitud_vistas",
  "preguntas_abiertas",
];

export function assembleFullPackageMarkdown(): AssembledPackage<string> {
  return {
    version:    SAG_EXECUTIVE_SUMMARY_META.version,
    fecha:      SAG_EXECUTIVE_SUMMARY_META.fecha,
    generadoEn: new Date().toISOString(),
    documentos: ALL_DOCUMENT_IDS.map(id => assembleDocument(id, "markdown")),
  };
}

export function assembleFullPackageText(): AssembledPackage<string> {
  return {
    version:    SAG_EXECUTIVE_SUMMARY_META.version,
    fecha:      SAG_EXECUTIVE_SUMMARY_META.fecha,
    generadoEn: new Date().toISOString(),
    documentos: ALL_DOCUMENT_IDS.map(id => assembleDocument(id, "text")),
  };
}

export function assembleFullPackagePdfReady(): AssembledPackage<
  PdfReadyDocument | PdfReadyView[] | PdfReadyQuestionsDocument
> {
  return {
    version:    SAG_EXECUTIVE_SUMMARY_META.version,
    fecha:      SAG_EXECUTIVE_SUMMARY_META.fecha,
    generadoEn: new Date().toISOString(),
    documentos: ALL_DOCUMENT_IDS.map(id => assembleDocument(id, "pdf_ready")),
  };
}

// ── Validation summary ─────────────────────────────────────────────────────────

export interface PackageValidationResult {
  valid:        boolean;
  executiveSummaryValid: boolean;
  issues:       string[];
}

export function validatePackage(): PackageValidationResult {
  const execValidation = validateExecutiveSummary();
  const issues: string[] = [...execValidation.issues];

  // Validate views can be assembled without errors
  try {
    exportViewRequestMarkdown();
  } catch (e) {
    issues.push(`View request export failed: ${String(e)}`);
  }

  try {
    exportOpenQuestionsMarkdown();
  } catch (e) {
    issues.push(`Open questions export failed: ${String(e)}`);
  }

  return {
    valid:                issues.length === 0,
    executiveSummaryValid: execValidation.valid,
    issues,
  };
}
