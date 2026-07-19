/**
 * lib/integrations/sag/executive-pack/export/open-questions-export.ts
 *
 * SAG Executive Pack Export — Open Questions Register
 *
 * Exporta el registro de preguntas abiertas agrupadas por dominio.
 * Las preguntas críticas aparecen primero dentro de cada dominio.
 *
 * Formatos: Markdown | Plain Text | PDF-ready
 *
 * Fuente: sag-open-questions.ts
 * Sprint: AGENTIK-SAG-EXECUTIVE-PACK-EXPORT-01
 */

import {
  SAG_OPEN_QUESTIONS,
  getQuestionsByDomain,
  getOpenQuestionsSummary,
  type OpenQuestion,
  type QuestionDomain,
} from "../sag-open-questions";
import { SAG_EXECUTIVE_SUMMARY_META } from "../sag-executive-summary";

// ── Domain order and labels ────────────────────────────────────────────────────

const DOMAIN_ORDER: QuestionDomain[] = [
  "acceso_general",
  "ventas",
  "pagos",
  "cartera",
  "recaudos",
  "bancos",
  "inventario",
  "compras",
  "productos",
];

const DOMAIN_LABELS: Record<QuestionDomain, string> = {
  acceso_general: "Acceso General",
  ventas:         "Ventas",
  pagos:          "Pagos",
  cartera:        "Cartera",
  recaudos:       "Recaudos",
  bancos:         "Bancos",
  inventario:     "Inventario",
  compras:        "Compras",
  productos:      "Productos",
};

// Sort: crítica first, then importante, then informativa
const PRIORITY_ORDER: Record<string, number> = {
  "crítica":    0,
  "importante": 1,
  "informativa": 2,
};

function sortedQuestions(questions: OpenQuestion[]): OpenQuestion[] {
  return [...questions].sort(
    (a, b) => (PRIORITY_ORDER[a.prioridad] ?? 99) - (PRIORITY_ORDER[b.prioridad] ?? 99)
  );
}

// ── PDF-ready types ────────────────────────────────────────────────────────────

export interface PdfReadyQuestion {
  id:         string;
  dominio:    string;
  prioridad:  string;
  pregunta:   string;
  contexto?:  string;
  impacto:    string;
  respuesta?: string;
}

export interface PdfReadyQuestionsSection {
  dominio:    string;
  etiqueta:   string;
  preguntas:  PdfReadyQuestion[];
}

export interface PdfReadyQuestionsDocument {
  title:       string;
  version:     string;
  date:        string;
  totalCount:  number;
  criticalCount: number;
  secciones:   PdfReadyQuestionsSection[];
}

// ── Priority badge helpers ─────────────────────────────────────────────────────

function priorityBadgeMd(p: string): string {
  if (p === "crítica")    return "🔴 **Prioridad Alta**";
  if (p === "importante") return "🟡 **Prioridad Media**";
  return "⚪ Prioridad Baja";
}

function priorityBadgeTxt(p: string): string {
  if (p === "crítica")    return "[PRIORIDAD ALTA] ";
  if (p === "importante") return "[PRIORIDAD MEDIA]";
  return "[PRIORIDAD BAJA] ";
}

// ── Markdown export ────────────────────────────────────────────────────────────

export function exportOpenQuestionsMarkdown(): string {
  const summary = getOpenQuestionsSummary();

  const lines: string[] = [
    "# Registro de Preguntas Abiertas",
    "",
    `**Agentik × SAG — Preguntas pendientes de validación**`,
    "",
    `> Versión ${SAG_EXECUTIVE_SUMMARY_META.version} &nbsp;|&nbsp; ${SAG_EXECUTIVE_SUMMARY_META.fecha}`,
    "",
    "---",
    "",
    "## Resumen",
    "",
    `| Total | Prioridad Alta | Prioridad Media | Prioridad Baja |`,
    `|---|---|---|---|`,
    `| ${summary.total} | ${summary.criticas} | ${summary.importantes} | ${summary.informativas} |`,
    "",
    "---",
    "",
  ];

  for (const domain of DOMAIN_ORDER) {
    const questions = sortedQuestions(getQuestionsByDomain(domain));
    if (questions.length === 0) continue;

    lines.push(`## ${DOMAIN_LABELS[domain]}`);
    lines.push("");

    for (const q of questions) {
      lines.push(`### ${q.id} — ${priorityBadgeMd(q.prioridad)}`);
      lines.push("");
      lines.push(`**Pregunta:** ${q.pregunta}`);
      lines.push("");
      if (q.contexto) {
        lines.push(`**Contexto:** ${q.contexto}`);
        lines.push("");
      }
      lines.push(`**Impacto si no se responde:** ${q.impacto}`);
      lines.push("");
      if (q.respuesta) {
        lines.push(`**Respuesta SAG:** ${q.respuesta}`);
      } else {
        lines.push(`**Respuesta SAG:** _Pendiente_`);
      }
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  lines.push(
    "> **Nota sobre horarios:** Las consultas y procesos de extracción de información deberán " +
    "programarse preferiblemente en horarios de baja operación, idealmente durante la noche, " +
    "siguiendo la recomendación del equipo SAG para minimizar cualquier impacto sobre el " +
    "funcionamiento normal del sistema."
  );
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("*Favor completar la columna \"Respuesta SAG\" y devolver a: integraciones@agentik.co*");

  return lines.join("\n");
}

// ── Plain text export ──────────────────────────────────────────────────────────

export function exportOpenQuestionsText(): string {
  const summary = getOpenQuestionsSummary();
  const sep = "─".repeat(72);
  const sep2 = "═".repeat(72);

  const lines: string[] = [
    "REGISTRO DE PREGUNTAS ABIERTAS",
    "Agentik × SAG — Preguntas pendientes de validación",
    `Versión ${SAG_EXECUTIVE_SUMMARY_META.version}  |  ${SAG_EXECUTIVE_SUMMARY_META.fecha}`,
    "",
    sep2,
    "",
    `Total: ${summary.total}  |  Prioridad Alta: ${summary.criticas}  |  Prioridad Media: ${summary.importantes}  |  Prioridad Baja: ${summary.informativas}`,
    "",
    sep2,
    "",
  ];

  for (const domain of DOMAIN_ORDER) {
    const questions = sortedQuestions(getQuestionsByDomain(domain));
    if (questions.length === 0) continue;

    lines.push(`DOMINIO: ${DOMAIN_LABELS[domain].toUpperCase()}`);
    lines.push(sep);
    lines.push("");

    for (const q of questions) {
      lines.push(`${q.id}  ${priorityBadgeTxt(q.prioridad)}`);
      lines.push(`Pregunta: ${q.pregunta}`);
      if (q.contexto) {
        lines.push(`Contexto: ${q.contexto}`);
      }
      lines.push(`Impacto:  ${q.impacto}`);
      lines.push(`Respuesta SAG: ${q.respuesta ?? "(pendiente)"}`);
      lines.push("");
    }
  }

  lines.push(sep2);
  lines.push("Completar la columna \"Respuesta SAG\" y devolver a: integraciones@agentik.co");

  return lines.join("\n");
}

// ── PDF-ready export ───────────────────────────────────────────────────────────

export function exportOpenQuestionsPdfReady(): PdfReadyQuestionsDocument {
  const summary = getOpenQuestionsSummary();

  const secciones: PdfReadyQuestionsSection[] = DOMAIN_ORDER
    .map(domain => {
      const questions = sortedQuestions(getQuestionsByDomain(domain));
      return {
        dominio:  domain,
        etiqueta: DOMAIN_LABELS[domain],
        preguntas: questions.map(q => ({
          id:        q.id,
          dominio:   DOMAIN_LABELS[domain],
          prioridad: q.prioridad,
          pregunta:  q.pregunta,
          contexto:  q.contexto,
          impacto:   q.impacto,
          respuesta: q.respuesta,
        })),
      };
    })
    .filter(s => s.preguntas.length > 0);

  return {
    title:         "Registro de Preguntas Abiertas — Agentik × SAG",
    version:       SAG_EXECUTIVE_SUMMARY_META.version,
    date:          SAG_EXECUTIVE_SUMMARY_META.fecha,
    totalCount:    summary.total,
    criticalCount: summary.criticas,
    secciones,
  };
}

// ── Critical-only export ───────────────────────────────────────────────────────

export function exportCriticalQuestionsMarkdown(): string {
  const critical = SAG_OPEN_QUESTIONS.filter(q => q.prioridad === "crítica");

  const lines: string[] = [
    "# Preguntas de Prioridad Alta — Agentik × SAG",
    "",
    "> Estas preguntas requieren validación conjunta con SAG antes de iniciar la implementación técnica.",
    "",
    "---",
    "",
  ];

  for (const q of critical) {
    lines.push(`**[${q.id}] ${DOMAIN_LABELS[q.dominio]}**`);
    lines.push("");
    lines.push(q.pregunta);
    lines.push("");
    lines.push(`*Impacto:* ${q.impacto}`);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}
