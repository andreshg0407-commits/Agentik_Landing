/**
 * lib/integrations/sag/executive-pack/export/view-request-export.ts
 *
 * SAG Executive Pack Export — View Request Document
 *
 * Exporta las 8 vistas solicitadas a SAG en tres formatos:
 * - Markdown   → revisión interna
 * - Plain Text → correo, impresión
 * - PDF-ready  → objeto estructurado para renderer
 *
 * Formato por vista: nombre → propósito → campos requeridos →
 * frecuencia → observaciones
 *
 * NO expone: KPIs internos, trazabilidad, notas Copilot, notas IA.
 *
 * Fuente: sag-view-request-doc.ts
 * Sprint: AGENTIK-SAG-EXECUTIVE-PACK-EXPORT-01
 */

import {
  SAG_VIEW_REQUEST_DOC,
  getViewRequestSummary,
  type SagViewRequestEntry,
} from "../sag-view-request-doc";

// ── Redaction guard ────────────────────────────────────────────────────────────

const INTERNAL_PATTERNS: RegExp[] = [
  /copilot/i,
  /agentik ia/i,
  /roadmap/i,
  /marketing studio/i,
  /cliente 360/i,
  /\bIA\b/,
  /kpi/i,
  /trazabilidad/i,
];

function clean(text: string): string {
  // Returns text if clean, throws if internal content detected
  for (const p of INTERNAL_PATTERNS) {
    if (p.test(text)) {
      // Silently omit this note rather than crashing — view fields can have optional internal notes
      return "";
    }
  }
  return text;
}

function cleanObservaciones(obs: string[]): string[] {
  return obs.map(clean).filter(Boolean);
}

// ── PDF-ready types ────────────────────────────────────────────────────────────

export interface PdfReadyViewColumn {
  campo:        string;
  tipo:         string;
  descripcion:  string;
  obligatorio:  boolean;
}

export interface PdfReadyView {
  nombreVista:      string;
  dominio:          string;
  proposito:        string;
  tablasFuente:     string[];
  camposRequeridos: PdfReadyViewColumn[];
  camposOpcionales: PdfReadyViewColumn[];
  totalCampos:      number;
  frecuencia:       string;
  filtros:          string[];
  observaciones:    string[];
  prioridad:        string;
}

// ── Single view formatter ──────────────────────────────────────────────────────

function toMarkdownView(entry: SagViewRequestEntry): string {
  const dominioLabel = DOMINIO_FUNCIONAL[entry.nombreVista] ?? entry.nombreVista;
  const lines: string[] = [
    `### ${dominioLabel}`,
    "",
    `*Nombre técnico sugerido: \`${entry.nombreVista}\`*  `,
    "",
    `**Propósito:** ${entry.proposito}  `,
    `**${entry.fuentesConfirmadas ? "Tablas fuente" : "Posibles fuentes identificadas durante el análisis"}:** \`${entry.tablasFuente.join("`, `")}\`  `,
    ...(!entry.fuentesConfirmadas ? [
      "",
      "*Estas referencias corresponden a hipótesis de trabajo construidas durante el análisis preliminar " +
      "y serán validadas conjuntamente con el equipo SAG durante la revisión técnica.*",
      "",
    ] : [""]),
    `**Frecuencia:** ${entry.frecuenciaRecomendada}  `,
    `**Fase:** ${getFaseLabel(entry.nombreVista)}`,
    "",
  ];

  if (entry.camposRequeridos.length > 0) {
    lines.push("**Campos identificados para la integración:**");
    lines.push("");
    lines.push("| Campo | Tipo | Descripción |");
    lines.push("|---|---|---|");
    for (const c of entry.camposRequeridos) {
      lines.push(`| \`${c.campo}\` | ${c.tipo} | ${c.descripcion} |`);
    }
    lines.push("");
  }

  if (entry.camposOpcionales.length > 0) {
    lines.push("**Campos adicionales identificados:**");
    lines.push("");
    lines.push("| Campo | Tipo | Descripción |");
    lines.push("|---|---|---|");
    for (const c of entry.camposOpcionales) {
      lines.push(`| \`${c.campo}\` | ${c.tipo} | ${c.descripcion} |`);
    }
    lines.push("");
  }

  const filtros = entry.filtrosSugeridos.filter(Boolean);
  if (filtros.length > 0) {
    lines.push("**Filtros sugeridos:**");
    for (const f of filtros) {
      lines.push(`- ${f}`);
    }
    lines.push("");
  }

  const obs = cleanObservaciones(entry.observaciones);
  if (obs.length > 0) {
    lines.push("**Observaciones:**");
    for (const o of obs) {
      lines.push(`- ${o}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function toPlainTextView(entry: SagViewRequestEntry): string {
  const sep = "─".repeat(60);
  const lines: string[] = [
    entry.nombreVista,
    sep,
    `Dominio:   ${entry.dominio}`,
    `Propósito: ${entry.proposito}`,
    `${entry.fuentesConfirmadas ? "Tablas fuente" : "Posibles fuentes identificadas durante el análisis"}:  ${entry.tablasFuente.join(", ")}`,
    `Frecuencia: ${entry.frecuenciaRecomendada}`,
    `Fase:      ${getFaseLabel(entry.nombreVista)}`,
    "",
  ];

  if (entry.camposRequeridos.length > 0) {
    lines.push("CAMPOS IDENTIFICADOS PARA LA INTEGRACIÓN:");
    for (const c of entry.camposRequeridos) {
      lines.push(`  ${c.campo.padEnd(32)} [${c.tipo}]  ${c.descripcion}`);
    }
    lines.push("");
  }

  if (entry.camposOpcionales.length > 0) {
    lines.push("CAMPOS ADICIONALES IDENTIFICADOS:");
    for (const c of entry.camposOpcionales) {
      lines.push(`  ${c.campo.padEnd(32)} [${c.tipo}]  ${c.descripcion}`);
    }
    lines.push("");
  }

  const filtros = entry.filtrosSugeridos.filter(Boolean);
  if (filtros.length > 0) {
    lines.push("FILTROS SUGERIDOS:");
    for (const f of filtros) {
      lines.push(`  ${f}`);
    }
    lines.push("");
  }

  const obs = cleanObservaciones(entry.observaciones);
  if (obs.length > 0) {
    lines.push("OBSERVACIONES:");
    for (const o of obs) {
      lines.push(`  ${o}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function toPdfReadyView(entry: SagViewRequestEntry): PdfReadyView {
  return {
    nombreVista:      entry.nombreVista,
    dominio:          entry.dominio,
    proposito:        entry.proposito,
    tablasFuente:     entry.tablasFuente,
    camposRequeridos: entry.camposRequeridos.map(c => ({
      campo:       c.campo,
      tipo:        c.tipo,
      descripcion: c.descripcion,
      obligatorio: true,
    })),
    camposOpcionales: entry.camposOpcionales.map(c => ({
      campo:       c.campo,
      tipo:        c.tipo,
      descripcion: c.descripcion,
      obligatorio: false,
    })),
    totalCampos:   entry.camposRequeridos.length + entry.camposOpcionales.length,
    frecuencia:    entry.frecuenciaRecomendada,
    filtros:       entry.filtrosSugeridos,
    observaciones: cleanObservaciones(entry.observaciones),
    prioridad:     entry.prioridad,
  };
}

// ── Full document exports ──────────────────────────────────────────────────────

// ── Domain functional name map ─────────────────────────────────────────────────

const DOMINIO_FUNCIONAL: Record<string, string> = {
  vw_agentik_ventas:     "Información de Ventas",
  vw_agentik_pagos:      "Información de Pagos",
  vw_agentik_cartera:    "Información de Cartera",
  vw_agentik_recaudos:   "Información de Recaudos",
  vw_agentik_bancos:     "Información Bancaria",
  vw_agentik_inventario: "Información de Inventario",
  vw_agentik_compras:    "Información de Compras",
  vw_agentik_productos:  "Información de Productos",
};

// ── Phase label helper ─────────────────────────────────────────────────────────

const FASE_1_VISTAS = new Set([
  "vw_agentik_ventas",
  "vw_agentik_pagos",
  "vw_agentik_cartera",
  "vw_agentik_recaudos",
  "vw_agentik_bancos",
]);

function getFaseLabel(nombreVista: string): string {
  return FASE_1_VISTAS.has(nombreVista)
    ? "Fase 1 — Información Financiera y Comercial"
    : "Fase 2 — Información Operacional";
}

// ── Full document exports ──────────────────────────────────────────────────────

export function exportViewRequestMarkdown(): string {
  const summary = getViewRequestSummary();
  const lines: string[] = [
    "# Especificación de Dominios de Información para Integración Operacional",
    "",
    "**Agentik × SAG**",
    "",
    "> Versión 2.6.0 &nbsp;|&nbsp; 2026-05-31 &nbsp;|&nbsp; Externo — Documento técnico-funcional",
    "",
    "---",
    "",
    "## Contexto",
    "",
    "Este documento describe los dominios de información identificados durante el análisis " +
    "funcional y técnico de la integración entre Agentik y SAG. SAG continúa siendo el sistema " +
    "de origen en todos los casos. Agentik opera únicamente como consumidor de información, " +
    "con acceso exclusivamente de consulta (SELECT). El mecanismo definitivo de integración " +
    "será definido conjuntamente con el equipo técnico de SAG.",
    "",
    "---",
    "",
    "## Resumen de Dominios de Información",
    "",
    "| # | Dominio de información | Fase | Información prioritaria | Información complementaria | Frecuencia |",
    "|---|---|---|---|---|---|",
  ];

  summary.forEach((row, i) => {
    const fase = FASE_1_VISTAS.has(row.nombreVista) ? "Fase 1" : "Fase 2";
    const dominioLabel = DOMINIO_FUNCIONAL[row.nombreVista] ?? row.nombreVista;
    lines.push(
      `| ${i + 1} | ${dominioLabel} | ${fase} | ${row.totalRequeridos} | ${row.totalOpcionales} | ${row.frecuencia} |`
    );
  });

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(
    "> Los nombres técnicos utilizados en este documento corresponden a una propuesta de nomenclatura " +
    "elaborada por Agentik para facilitar la discusión técnica. La nomenclatura definitiva podrá ajustarse " +
    "conjuntamente durante la etapa de validación e implementación."
  );
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## FASE 1 — Información Financiera y Comercial");
  lines.push("");
  lines.push("> Ventas · Pagos · Cartera · Recaudos · Bancos");
  lines.push("");

  for (const entry of SAG_VIEW_REQUEST_DOC.filter(e => FASE_1_VISTAS.has(e.nombreVista))) {
    lines.push(toMarkdownView(entry));
    lines.push("---");
    lines.push("");
  }

  lines.push("## FASE 2 — Información Operacional");
  lines.push("");
  lines.push("> Inventario · Compras · Productos");
  lines.push("");

  for (const entry of SAG_VIEW_REQUEST_DOC.filter(e => !FASE_1_VISTAS.has(e.nombreVista))) {
    lines.push(toMarkdownView(entry));
    lines.push("---");
    lines.push("");
  }

  lines.push("## Nota Final");
  lines.push("");
  lines.push(
    "El propósito de este documento es facilitar la validación conjunta de los dominios de información " +
    "identificados durante el análisis funcional y operativo realizado para la integración entre Agentik y SAG."
  );
  lines.push("");
  lines.push(
    "Los campos aquí descritos representan una referencia de trabajo inicial y podrán ajustarse conjuntamente " +
    "durante el proceso de validación técnica, de acuerdo con la disponibilidad de información y las " +
    "recomendaciones del equipo SAG."
  );
  lines.push("");
  lines.push(
    "De acuerdo con la recomendación recibida por el equipo SAG durante las conversaciones preliminares, " +
    "cualquier proceso de consulta, sincronización o extracción de información será programado preferiblemente " +
    "en horarios de baja operación, idealmente durante la noche, con el fin de minimizar cualquier impacto " +
    "sobre el funcionamiento normal del sistema."
  );
  lines.push("");
  lines.push(
    "Agentik permanece abierto a adaptar tanto el mecanismo de integración como el modelo de acceso según " +
    "las mejores prácticas definidas por SAG."
  );
  lines.push("");
  lines.push(
    "El objetivo principal de este documento es servir como base de conversación para la validación conjunta " +
    "de la información requerida, facilitando el análisis técnico y reduciendo iteraciones durante el proceso " +
    "de integración."
  );
  lines.push("");

  return lines.join("\n");
}

export function exportViewRequestText(): string {
  const summary = getViewRequestSummary();
  const sep = "═".repeat(72);

  const lines: string[] = [
    "ESPECIFICACIÓN DE DOMINIOS DE INFORMACIÓN PARA INTEGRACIÓN OPERACIONAL",
    "Agentik × SAG — Especificación técnica campo a campo",
    "",
    sep,
    "",
    "RESUMEN DE DOMINIOS DE INFORMACIÓN",
    "",
  ];

  summary.forEach((row, i) => {
    const fase = FASE_1_VISTAS.has(row.nombreVista) ? "FASE 1" : "FASE 2";
    const dominioLabel = DOMINIO_FUNCIONAL[row.nombreVista] ?? row.nombreVista;
    lines.push(
      `  ${String(i + 1).padEnd(3)} ${dominioLabel.padEnd(34)} ${fase.padEnd(12)}` +
      `  ${row.totalRequeridos} prioritarios / ${row.totalOpcionales} complementarios  ${row.frecuencia}`
    );
  });

  lines.push("");
  lines.push(sep);
  lines.push("");
  lines.push("FASE 1 — INFORMACIÓN FINANCIERA Y COMERCIAL");
  lines.push("");

  for (const entry of SAG_VIEW_REQUEST_DOC.filter(e => FASE_1_VISTAS.has(e.nombreVista))) {
    lines.push(toPlainTextView(entry));
    lines.push(sep);
    lines.push("");
  }

  lines.push("FASE 2 — INFORMACIÓN OPERACIONAL");
  lines.push("");

  for (const entry of SAG_VIEW_REQUEST_DOC.filter(e => !FASE_1_VISTAS.has(e.nombreVista))) {
    lines.push(toPlainTextView(entry));
    lines.push(sep);
    lines.push("");
  }

  lines.push(
    "El propósito de este documento es facilitar la validación conjunta de los dominios de información " +
    "identificados durante el análisis funcional y operativo realizado para la integración entre Agentik y SAG.\n\n" +
    "Los campos aquí descritos representan una referencia de trabajo inicial y podrán ajustarse conjuntamente " +
    "durante el proceso de validación técnica, de acuerdo con la disponibilidad de información y las " +
    "recomendaciones del equipo SAG.\n\n" +
    "Agentik permanece abierto a adaptar tanto el mecanismo de integración como el modelo de acceso según " +
    "las mejores prácticas definidas por SAG."
  );

  return lines.join("\n");
}

export function exportViewRequestPdfReady(): PdfReadyView[] {
  return SAG_VIEW_REQUEST_DOC.map(toPdfReadyView);
}

// ── Single-view exports ────────────────────────────────────────────────────────

export function exportSingleViewMarkdown(nombreVista: string): string | null {
  const entry = SAG_VIEW_REQUEST_DOC.find(v => v.nombreVista === nombreVista);
  if (!entry) return null;
  return toMarkdownView(entry);
}

export function exportSingleViewText(nombreVista: string): string | null {
  const entry = SAG_VIEW_REQUEST_DOC.find(v => v.nombreVista === nombreVista);
  if (!entry) return null;
  return toPlainTextView(entry);
}

export function exportSingleViewPdfReady(nombreVista: string): PdfReadyView | null {
  const entry = SAG_VIEW_REQUEST_DOC.find(v => v.nombreVista === nombreVista);
  if (!entry) return null;
  return toPdfReadyView(entry);
}
