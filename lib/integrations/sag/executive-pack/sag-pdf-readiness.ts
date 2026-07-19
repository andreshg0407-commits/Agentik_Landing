/**
 * lib/integrations/sag/executive-pack/sag-pdf-readiness.ts
 *
 * SAG Executive Pack — PDF Readiness Definitions
 *
 * Define la estructura de los tres documentos PDF que conforman
 * el paquete formal de solicitud a SAG.
 *
 * Este archivo NO genera PDFs — define la estructura de secciones,
 * metadata y orden de contenido para que cualquier renderer
 * (Puppeteer, @react-pdf/renderer, Word export, etc.) pueda
 * construir los documentos correctamente.
 *
 * Sprint: AGENTIK-SAG-CONTRACT-EXECUTIVE-PACK-01
 */

import { SAG_EXECUTIVE_SUMMARY_META } from "./sag-executive-summary";

// ── PDF document types ─────────────────────────────────────────────────────────

export type PdfDocumentId =
  | "resumen_ejecutivo"
  | "solicitud_vistas"
  | "preguntas_abiertas";

export type PdfSectionType =
  | "cover"           // Cover page
  | "index"           // Table of contents
  | "section"         // Standard numbered section
  | "table"           // Structured data table
  | "appendix"        // Appendix (not in main index)
  | "signature";      // Signature / sign-off block

export interface PdfSection {
  id:       string;
  type:     PdfSectionType;
  titulo:   string;
  fuente:   string;       // Which TS export provides the content
  orden:    number;       // Page order (1-based)
  notas?:   string;       // Renderer hints
}

export interface PdfMetadata {
  titulo:        string;
  subtitulo:     string;
  version:       string;
  fecha:         string;
  preparadoPor:  string;
  destinatario:  string;
  clasificacion: string;
  totalPaginas:  string;  // Estimated, e.g. "~8 páginas"
}

export interface PdfDocumentSpec {
  id:         PdfDocumentId;
  nombreArchivo: string;   // e.g. "Agentik-SAG-Resumen-Ejecutivo-v2.6.0.pdf"
  metadata:   PdfMetadata;
  secciones:  PdfSection[];
  estilos:    PdfStyleHints;
}

export interface PdfStyleHints {
  fontFamily:    string;
  primaryColor:  string;  // Brand blue
  accentColor:   string;
  bodyFontSize:  number;  // pt
  headingScale:  number;  // Multiplier vs body
  marginMm:      number;  // Page margin in mm
  showLogoHeader: boolean;
  showPageNumbers: boolean;
  showWatermark:   boolean;
  watermarkText?:  string;
}

// ── Shared style defaults ──────────────────────────────────────────────────────

const SAG_PDF_STYLE_DEFAULTS: PdfStyleHints = {
  fontFamily:     "Inter, Arial, sans-serif",
  primaryColor:   "#004AAD",  // C.blueDark — enterprise brand
  accentColor:    "#1A1A2E",
  bodyFontSize:   10,
  headingScale:   1.4,
  marginMm:       20,
  showLogoHeader: true,
  showPageNumbers: true,
  showWatermark:   false,
};

// ── Document 1: Executive Summary ─────────────────────────────────────────────

export const PDF_RESUMEN_EJECUTIVO: PdfDocumentSpec = {
  id:            "resumen_ejecutivo",
  nombreArchivo: `Agentik-SAG-Resumen-Ejecutivo-v${SAG_EXECUTIVE_SUMMARY_META.version}.pdf`,
  metadata: {
    titulo:        "Requerimientos de Integración — Agentik × SAG",
    subtitulo:     "Resumen Ejecutivo",
    version:       SAG_EXECUTIVE_SUMMARY_META.version,
    fecha:         SAG_EXECUTIVE_SUMMARY_META.fecha,
    preparadoPor:  SAG_EXECUTIVE_SUMMARY_META.preparadoPor,
    destinatario:  "Equipo Técnico y Funcional — SAG",
    clasificacion: SAG_EXECUTIVE_SUMMARY_META.clasificacion,
    totalPaginas:  "~6 páginas",
  },
  secciones: [
    {
      id:     "portada",
      type:   "cover",
      titulo: "Portada",
      fuente: "SAG_EXECUTIVE_SUMMARY_META",
      orden:  1,
      notas:  "Incluir logo Agentik, nombre del documento, versión, fecha y clasificación.",
    },
    {
      id:     "indice",
      type:   "index",
      titulo: "Índice",
      fuente: "SAG_EXECUTIVE_SUMMARY.secciones",
      orden:  2,
      notas:  "Lista numerada con los 6 títulos de sección y número de página.",
    },
    {
      id:     "objetivo",
      type:   "section",
      titulo: "1. Objetivo de la Integración",
      fuente: "SAG_EXECUTIVE_SUMMARY.secciones[0]",
      orden:  3,
    },
    {
      id:     "alcance",
      type:   "section",
      titulo: "2. Alcance Actual de la Integración",
      fuente: "SAG_EXECUTIVE_SUMMARY.secciones[1]",
      orden:  4,
    },
    {
      id:     "metodo",
      type:   "section",
      titulo: "3. Método de Acceso Propuesto",
      fuente: "SAG_EXECUTIVE_SUMMARY.secciones[2]",
      orden:  4,
    },
    {
      id:     "beneficios",
      type:   "section",
      titulo: "4. Beneficios Operativos",
      fuente: "SAG_EXECUTIVE_SUMMARY.secciones[3]",
      orden:  5,
    },
    {
      id:     "dominios",
      type:   "section",
      titulo: "5. Dominios de Información Requeridos",
      fuente: "SAG_EXECUTIVE_SUMMARY.secciones[4]",
      orden:  5,
      notas:  "Puede renderizarse como tabla: # | Vista | Propósito | Prioridad.",
    },
    {
      id:     "siguiente_paso",
      type:   "section",
      titulo: "6. Siguiente Paso Propuesto",
      fuente: "SAG_EXECUTIVE_SUMMARY.secciones[5]",
      orden:  6,
    },
  ],
  estilos: SAG_PDF_STYLE_DEFAULTS,
};

// ── Document 2: View Request Specification ────────────────────────────────────

export const PDF_SOLICITUD_VISTAS: PdfDocumentSpec = {
  id:            "solicitud_vistas",
  nombreArchivo: `Agentik-SAG-Solicitud-Vistas-v${SAG_EXECUTIVE_SUMMARY_META.version}.pdf`,
  metadata: {
    titulo:        "Solicitud Formal de Vistas de Base de Datos",
    subtitulo:     "Especificación técnica campo a campo",
    version:       SAG_EXECUTIVE_SUMMARY_META.version,
    fecha:         SAG_EXECUTIVE_SUMMARY_META.fecha,
    preparadoPor:  SAG_EXECUTIVE_SUMMARY_META.preparadoPor,
    destinatario:  "Equipo de TI / DBA — SAG",
    clasificacion: SAG_EXECUTIVE_SUMMARY_META.clasificacion,
    totalPaginas:  "~24 páginas",
  },
  secciones: [
    {
      id:     "portada",
      type:   "cover",
      titulo: "Portada",
      fuente: "SAG_VIEW_REQUEST_DOC (metadata)",
      orden:  1,
      notas:  "Incluir logo Agentik, nombre del documento, versión, fecha y clasificación.",
    },
    {
      id:     "indice",
      type:   "index",
      titulo: "Índice de Vistas",
      fuente: "SAG_VIEW_REQUEST_DOC",
      orden:  2,
      notas:  "Lista de las 8 vistas con número de página de cada sección.",
    },
    {
      id:     "resumen_vistas",
      type:   "table",
      titulo: "Resumen de Vistas Solicitadas",
      fuente: "SAG_VIEW_REQUEST_DOC — getViewRequestSummary()",
      orden:  3,
      notas:  "Tabla: # | Vista | Propósito | Total campos | Campos requeridos | Prioridad.",
    },
    {
      id:     "vista_ventas",
      type:   "table",
      titulo: "vw_agentik_ventas",
      fuente: "SAG_VIEW_REQUEST_DOC['ventas']",
      orden:  4,
      notas:  "Tabla con columnas: campo | tipo | obligatorio | fuente SAG | descripción. Separar requeridos de opcionales.",
    },
    {
      id:     "vista_pagos",
      type:   "table",
      titulo: "vw_agentik_pagos",
      fuente: "SAG_VIEW_REQUEST_DOC['pagos']",
      orden:  6,
    },
    {
      id:     "vista_cartera",
      type:   "table",
      titulo: "vw_agentik_cartera",
      fuente: "SAG_VIEW_REQUEST_DOC['cartera']",
      orden:  8,
    },
    {
      id:     "vista_recaudos",
      type:   "table",
      titulo: "vw_agentik_recaudos",
      fuente: "SAG_VIEW_REQUEST_DOC['recaudos']",
      orden:  10,
    },
    {
      id:     "vista_bancos",
      type:   "table",
      titulo: "vw_agentik_bancos",
      fuente: "SAG_VIEW_REQUEST_DOC['bancos']",
      orden:  12,
    },
    {
      id:     "vista_inventario",
      type:   "table",
      titulo: "vw_agentik_inventario",
      fuente: "SAG_VIEW_REQUEST_DOC['inventario']",
      orden:  14,
    },
    {
      id:     "vista_compras",
      type:   "table",
      titulo: "vw_agentik_compras",
      fuente: "SAG_VIEW_REQUEST_DOC['compras']",
      orden:  18,
    },
    {
      id:     "vista_productos",
      type:   "table",
      titulo: "vw_agentik_productos",
      fuente: "SAG_VIEW_REQUEST_DOC['productos']",
      orden:  21,
    },
    {
      id:     "firma",
      type:   "signature",
      titulo: "Firma y Aprobación",
      fuente: "SAG_EXECUTIVE_SUMMARY_META.preparadoPor",
      orden:  24,
      notas:  "Bloque de firma: preparado por Agentik, fecha, espacio para firma de recibido SAG.",
    },
  ],
  estilos: SAG_PDF_STYLE_DEFAULTS,
};

// ── Document 3: Open Questions Register ───────────────────────────────────────

export const PDF_PREGUNTAS_ABIERTAS: PdfDocumentSpec = {
  id:            "preguntas_abiertas",
  nombreArchivo: `Agentik-SAG-Preguntas-Abiertas-v${SAG_EXECUTIVE_SUMMARY_META.version}.pdf`,
  metadata: {
    titulo:        "Registro de Preguntas Abiertas",
    subtitulo:     "Preguntas técnicas y funcionales pendientes de validación",
    version:       SAG_EXECUTIVE_SUMMARY_META.version,
    fecha:         SAG_EXECUTIVE_SUMMARY_META.fecha,
    preparadoPor:  SAG_EXECUTIVE_SUMMARY_META.preparadoPor,
    destinatario:  "Equipo Técnico y Funcional — SAG",
    clasificacion: SAG_EXECUTIVE_SUMMARY_META.clasificacion,
    totalPaginas:  "~8 páginas",
  },
  secciones: [
    {
      id:     "portada",
      type:   "cover",
      titulo: "Portada",
      fuente: "SAG_OPEN_QUESTIONS (metadata)",
      orden:  1,
    },
    {
      id:     "resumen_preguntas",
      type:   "table",
      titulo: "Resumen por Dominio",
      fuente: "getOpenQuestionsSummary()",
      orden:  2,
      notas:  "Tabla: dominio | total | críticas | importantes | informativas.",
    },
    {
      id:     "preguntas_acceso",
      type:   "table",
      titulo: "Acceso General",
      fuente: "getQuestionsByDomain('acceso_general')",
      orden:  3,
      notas:  "Tabla con columnas: ID | Prioridad | Pregunta | Impacto | Respuesta (vacío para SAG completar).",
    },
    {
      id:     "preguntas_ventas",
      type:   "table",
      titulo: "Dominio: Ventas",
      fuente: "getQuestionsByDomain('ventas')",
      orden:  4,
    },
    {
      id:     "preguntas_pagos",
      type:   "table",
      titulo: "Dominio: Pagos",
      fuente: "getQuestionsByDomain('pagos')",
      orden:  4,
    },
    {
      id:     "preguntas_cartera",
      type:   "table",
      titulo: "Dominio: Cartera",
      fuente: "getQuestionsByDomain('cartera')",
      orden:  5,
    },
    {
      id:     "preguntas_recaudos",
      type:   "table",
      titulo: "Dominio: Recaudos",
      fuente: "getQuestionsByDomain('recaudos')",
      orden:  5,
    },
    {
      id:     "preguntas_bancos",
      type:   "table",
      titulo: "Dominio: Bancos",
      fuente: "getQuestionsByDomain('bancos')",
      orden:  6,
    },
    {
      id:     "preguntas_inventario",
      type:   "table",
      titulo: "Dominio: Inventario",
      fuente: "getQuestionsByDomain('inventario')",
      orden:  6,
    },
    {
      id:     "preguntas_compras",
      type:   "table",
      titulo: "Dominio: Compras",
      fuente: "getQuestionsByDomain('compras')",
      orden:  7,
    },
    {
      id:     "preguntas_productos",
      type:   "table",
      titulo: "Dominio: Productos",
      fuente: "getQuestionsByDomain('productos')",
      orden:  7,
    },
    {
      id:     "instrucciones_respuesta",
      type:   "appendix",
      titulo: "Instrucciones para Responder",
      fuente: "STATIC",
      orden:  8,
      notas: [
        "Este documento puede editarse directamente completando la columna 'Respuesta'.",
        "Para preguntas marcadas como CRÍTICA, la respuesta es necesaria antes de iniciar la implementación.",
        "Enviar el documento completado a: integraciones@agentik.co",
      ].join(" | "),
    },
  ],
  estilos: SAG_PDF_STYLE_DEFAULTS,
};

// ── Document registry ──────────────────────────────────────────────────────────

export const SAG_PDF_DOCUMENTS: PdfDocumentSpec[] = [
  PDF_RESUMEN_EJECUTIVO,
  PDF_SOLICITUD_VISTAS,
  PDF_PREGUNTAS_ABIERTAS,
];

// ── Query helpers ──────────────────────────────────────────────────────────────

export function getPdfSpec(id: PdfDocumentId): PdfDocumentSpec | undefined {
  return SAG_PDF_DOCUMENTS.find(d => d.id === id);
}

export function getPdfReadinessSummary(): {
  totalDocumentos: number;
  totalSeccionesEstimadas: number;
  paginasTotalesEstimadas: string;
  documentos: { id: PdfDocumentId; nombreArchivo: string; secciones: number; paginas: string }[];
} {
  return {
    totalDocumentos: SAG_PDF_DOCUMENTS.length,
    totalSeccionesEstimadas: SAG_PDF_DOCUMENTS.reduce((sum, d) => sum + d.secciones.length, 0),
    paginasTotalesEstimadas: "~38 páginas",
    documentos: SAG_PDF_DOCUMENTS.map(d => ({
      id:            d.id,
      nombreArchivo: d.nombreArchivo,
      secciones:     d.secciones.length,
      paginas:       d.metadata.totalPaginas,
    })),
  };
}
