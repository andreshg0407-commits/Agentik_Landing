/**
 * lib/integrations/sag/executive-pack/sag-validation-checklist.ts
 *
 * SAG Executive Pack — Pre-Send Validation Checklist
 *
 * Lista de verificación que debe completarse antes de enviar
 * el paquete ejecutivo a SAG.
 *
 * Organizada en fases: Contenido → Redacción → Documentos → Envío.
 *
 * Sprint: AGENTIK-SAG-CONTRACT-EXECUTIVE-PACK-01
 */

import { SAG_EXECUTIVE_SUMMARY_META } from "./sag-executive-summary";
import { SAG_OPEN_QUESTIONS, getOpenQuestionsSummary } from "./sag-open-questions";
import { SAG_PDF_DOCUMENTS } from "./sag-pdf-readiness";
import { SAG_VIEW_REQUEST_DOC } from "./sag-view-request-doc";
import { SAG_EMAIL_PACKAGE } from "./sag-email-package";

// ── Checklist types ────────────────────────────────────────────────────────────

export type ChecklistPhase =
  | "contenido"   // Content completeness
  | "redaccion"   // Language and tone
  | "documentos"  // PDF/file readiness
  | "envio";      // Send-action readiness

export type ChecklistStatus = "pending" | "passed" | "failed" | "skipped";

export interface ChecklistItem {
  id:          string;
  fase:        ChecklistPhase;
  descripcion: string;
  verificacion: string;     // How to verify (programmatic or manual)
  status:      ChecklistStatus;
  bloquea:     boolean;     // If true, blocks send until resolved
  resultado?:  string;      // Computed result when auto-verifiable
}

// ── Auto-verifiable checks ─────────────────────────────────────────────────────

function checkViewRequestCount(): ChecklistItem {
  const total = Object.keys(SAG_VIEW_REQUEST_DOC).length;
  const expected = SAG_EXECUTIVE_SUMMARY_META.totalVistas;
  const passed = total === expected;

  return {
    id:          "CONT-01",
    fase:        "contenido",
    descripcion: `Las ${expected} vistas requeridas están documentadas en el View Request Doc`,
    verificacion: `Object.keys(SAG_VIEW_REQUEST_DOC).length === ${expected}`,
    status:      passed ? "passed" : "failed",
    bloquea:     true,
    resultado:   `${total} de ${expected} vistas documentadas`,
  };
}

function checkOpenQuestionsExist(): ChecklistItem {
  const summary = getOpenQuestionsSummary();
  const hasCritical = summary.criticas > 0;

  return {
    id:          "CONT-02",
    fase:        "contenido",
    descripcion: "El registro de preguntas abiertas tiene al menos una pregunta crítica documentada",
    verificacion: "SAG_OPEN_QUESTIONS.some(q => q.prioridad === 'crítica')",
    status:      hasCritical ? "passed" : "failed",
    bloquea:     false,
    resultado:   `${summary.criticas} preguntas críticas, ${summary.total} en total`,
  };
}

function checkPdfDocumentsCount(): ChecklistItem {
  const total = SAG_PDF_DOCUMENTS.length;
  const expected = 3;
  const passed = total === expected;

  return {
    id:          "DOC-01",
    fase:        "documentos",
    descripcion: `Los ${expected} documentos PDF están definidos en el PDF Readiness spec`,
    verificacion: `SAG_PDF_DOCUMENTS.length === ${expected}`,
    status:      passed ? "passed" : "failed",
    bloquea:     true,
    resultado:   `${total} de ${expected} documentos definidos`,
  };
}

function checkEmailDraftsCount(): ChecklistItem {
  const total = SAG_EMAIL_PACKAGE.length;
  const expected = 4; // ti_sag, funcional, gerencia, internal
  const passed = total >= expected;

  return {
    id:          "ENV-01",
    fase:        "envio",
    descripcion: `El paquete de correo contiene ${expected} borradores (TI, Funcional, Gerencia, Interno)`,
    verificacion: `SAG_EMAIL_PACKAGE.length >= ${expected}`,
    status:      passed ? "passed" : "failed",
    bloquea:     false,
    resultado:   `${total} borradores disponibles`,
  };
}

function checkVersionConsistency(): ChecklistItem {
  const version = SAG_EXECUTIVE_SUMMARY_META.version;
  const allFileNames = SAG_PDF_DOCUMENTS.map(d => d.nombreArchivo);
  const allHaveVersion = allFileNames.every(name => name.includes(version));

  return {
    id:          "CONT-03",
    fase:        "contenido",
    descripcion: `La versión ${version} es consistente en el resumen ejecutivo y todos los nombres de archivo PDF`,
    verificacion: "SAG_PDF_DOCUMENTS.every(d => d.nombreArchivo.includes(SAG_EXECUTIVE_SUMMARY_META.version))",
    status:      allHaveVersion ? "passed" : "failed",
    bloquea:     true,
    resultado:   allHaveVersion
      ? `Versión ${version} presente en todos los documentos`
      : `Algunos documentos no contienen la versión ${version}`,
  };
}

function checkDomainCoverage(): ChecklistItem {
  const viewDomains = SAG_VIEW_REQUEST_DOC.map(v => v.dominio.toLowerCase());
  const questionDomains = [...new Set(SAG_OPEN_QUESTIONS.map(q => q.dominio))].filter(
    d => d !== "acceso_general"
  );

  const missing = viewDomains.filter(d => !questionDomains.includes(d as any));
  const allCovered = missing.length === 0;

  return {
    id:          "CONT-04",
    fase:        "contenido",
    descripcion: "Todos los dominios del View Request Doc tienen al menos una pregunta abierta documentada",
    verificacion: "Every domain in SAG_VIEW_REQUEST_DOC exists in SAG_OPEN_QUESTIONS",
    status:      allCovered ? "passed" : "failed",
    bloquea:     false,
    resultado:   allCovered
      ? "Todos los dominios cubiertos"
      : `Dominios sin preguntas: ${missing.join(", ")}`,
  };
}

// ── Manual checks (always pending — require human review) ─────────────────────

const manualChecks: ChecklistItem[] = [
  // Contenido
  {
    id:          "CONT-05",
    fase:        "contenido",
    descripcion: "El Resumen Ejecutivo no contiene referencias a Copilot, IA, roadmap, Marketing Studio o Cliente 360",
    verificacion: "Revisión manual del texto generado por renderExecutiveSummaryText()",
    status:      "pending",
    bloquea:     true,
  },
  {
    id:          "CONT-06",
    fase:        "contenido",
    descripcion: "La Solicitud de Vistas no expone campos derivados internos de Agentik sin la anotación correcta",
    verificacion: "Verificar que campos 'esDeriado: true' incluyan la nota 'Calculado por Agentik — SAG no necesita exponer este campo'",
    status:      "pending",
    bloquea:     true,
  },
  {
    id:          "CONT-07",
    fase:        "contenido",
    descripcion: "Las preguntas abiertas están redactadas desde la perspectiva de Agentik hacia SAG (no exponen arquitectura interna)",
    verificacion: "Revisión manual de SAG_OPEN_QUESTIONS completo",
    status:      "pending",
    bloquea:     true,
  },
  // Redacción
  {
    id:          "RED-01",
    fase:        "redaccion",
    descripcion: "El lenguaje del Resumen Ejecutivo es accesible para un gerente de TI sin contexto previo de Agentik",
    verificacion: "Revisión por una persona externa al proyecto",
    status:      "pending",
    bloquea:     false,
  },
  {
    id:          "RED-02",
    fase:        "redaccion",
    descripcion: "No hay uso de siglas o acrónimos internos de Agentik (ej. 'OS', 'copilot rail', 'sprint') en documentos externos",
    verificacion: "Búsqueda manual de términos internos en los textos generados",
    status:      "pending",
    bloquea:     true,
  },
  {
    id:          "RED-03",
    fase:        "redaccion",
    descripcion: "Las prioridades de las vistas (CRÍTICO / IMPORTANTE) reflejan el acuerdo con la organización, no solo el criterio técnico",
    verificacion: "Confirmar con el Product Owner de Agentik antes de enviar",
    status:      "pending",
    bloquea:     false,
  },
  // Documentos
  {
    id:          "DOC-02",
    fase:        "documentos",
    descripcion: "Los tres PDFs han sido generados correctamente y los archivos no están corruptos",
    verificacion: "Abrir cada PDF y verificar que se renderiza correctamente",
    status:      "pending",
    bloquea:     true,
  },
  {
    id:          "DOC-03",
    fase:        "documentos",
    descripcion: "Los nombres de los archivos PDF incluyen la versión correcta: v2.6.0",
    verificacion: `Verificar que los tres archivos se llaman: Agentik-SAG-*-v${SAG_EXECUTIVE_SUMMARY_META.version}.pdf`,
    status:      "pending",
    bloquea:     true,
  },
  {
    id:          "DOC-04",
    fase:        "documentos",
    descripcion: "El PDF de la Solicitud de Vistas es legible en pantalla y en impresión (fuentes no demasiado pequeñas en tablas)",
    verificacion: "Revisar las tablas de campos en escala 100% y en impresión física o vista previa",
    status:      "pending",
    bloquea:     false,
  },
  // Envío
  {
    id:          "ENV-02",
    fase:        "envio",
    descripcion: "El correo electrónico de destino del contacto de TI de SAG ha sido confirmado y está actualizado",
    verificacion: "Verificar contra el directorio de contactos SAG — no usar correo de una reunión anterior",
    status:      "pending",
    bloquea:     true,
  },
  {
    id:          "ENV-03",
    fase:        "envio",
    descripcion: "El correo de envío seleccionado (ti_sag) tiene el asunto correcto y los tres adjuntos referenciados",
    verificacion: "Verificar getEmailDraft('ti_sag').asunto y .adjuntos antes de enviar",
    status:      "pending",
    bloquea:     true,
  },
  {
    id:          "ENV-04",
    fase:        "envio",
    descripcion: "Se ha notificado internamente al equipo de Agentik que el paquete será enviado y la fecha de envío está registrada",
    verificacion: "Ticket de tracking actualizado con fecha de envío programada",
    status:      "pending",
    bloquea:     false,
  },
  {
    id:          "ENV-05",
    fase:        "envio",
    descripcion: "El status de los 8 dominios en SAG_VIEW_REQUESTS será actualizado a 'submitted' inmediatamente después del envío",
    verificacion: "Tarea asignada en el tracker de integraciones",
    status:      "pending",
    bloquea:     false,
  },
];

// ── Build full checklist ───────────────────────────────────────────────────────

export function buildValidationChecklist(): ChecklistItem[] {
  const autoChecks: ChecklistItem[] = [
    checkViewRequestCount(),
    checkOpenQuestionsExist(),
    checkVersionConsistency(),
    checkDomainCoverage(),
    checkPdfDocumentsCount(),
    checkEmailDraftsCount(),
  ];

  return [...autoChecks, ...manualChecks].sort((a, b) => {
    const phaseOrder: ChecklistPhase[] = ["contenido", "redaccion", "documentos", "envio"];
    const phaseA = phaseOrder.indexOf(a.fase);
    const phaseB = phaseOrder.indexOf(b.fase);
    if (phaseA !== phaseB) return phaseA - phaseB;
    return a.id.localeCompare(b.id);
  });
}

// ── Summary ────────────────────────────────────────────────────────────────────

export function getChecklistSummary(items: ChecklistItem[]): {
  total:      number;
  passed:     number;
  failed:     number;
  pending:    number;
  bloqueantes: number;
  listoParaEnviar: boolean;
} {
  const passed   = items.filter(i => i.status === "passed").length;
  const failed   = items.filter(i => i.status === "failed").length;
  const pending  = items.filter(i => i.status === "pending").length;
  const blockers = items.filter(i => i.bloquea && i.status !== "passed").length;

  return {
    total:           items.length,
    passed,
    failed,
    pending,
    bloqueantes:     blockers,
    listoParaEnviar: blockers === 0,
  };
}

// ── Convenience: render as plain text ─────────────────────────────────────────

export function renderChecklistText(): string {
  const items = buildValidationChecklist();
  const summary = getChecklistSummary(items);
  const lines: string[] = [
    "Checklist de Validación — SAG Executive Pack",
    `Versión ${SAG_EXECUTIVE_SUMMARY_META.version}  |  Fecha: ${SAG_EXECUTIVE_SUMMARY_META.fecha}`,
    "",
    "─".repeat(80),
    "",
  ];

  const phases: ChecklistPhase[] = ["contenido", "redaccion", "documentos", "envio"];
  const phaseLabels: Record<ChecklistPhase, string> = {
    contenido:  "FASE 1 — Completitud de Contenido",
    redaccion:  "FASE 2 — Revisión de Redacción",
    documentos: "FASE 3 — Preparación de Documentos",
    envio:      "FASE 4 — Preparación de Envío",
  };

  for (const phase of phases) {
    const phaseItems = items.filter(i => i.fase === phase);
    lines.push(phaseLabels[phase]);
    lines.push("");

    for (const item of phaseItems) {
      const statusIcon = item.status === "passed" ? "[✓]" : item.status === "failed" ? "[✗]" : "[ ]";
      const blocker    = item.bloquea ? " [BLOQUEANTE]" : "";
      lines.push(`  ${statusIcon}${blocker} ${item.id} — ${item.descripcion}`);
      if (item.resultado) {
        lines.push(`       Resultado: ${item.resultado}`);
      }
    }

    lines.push("");
  }

  lines.push("─".repeat(80));
  lines.push(`Total: ${summary.total} items | Pasados: ${summary.passed} | Pendientes: ${summary.pending} | Fallidos: ${summary.failed}`);
  lines.push(`Bloqueantes sin resolver: ${summary.bloqueantes}`);
  lines.push(summary.listoParaEnviar
    ? "ESTADO: LISTO PARA ENVIAR"
    : "ESTADO: NO LISTO — Resolver los items bloqueantes antes de enviar"
  );

  return lines.join("\n");
}
