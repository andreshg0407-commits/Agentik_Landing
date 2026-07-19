/**
 * lib/integrations/sag/executive-pack/export/review-dashboard-metadata.ts
 *
 * SAG Executive Pack Export — Review Dashboard Metadata
 *
 * Genera el resumen automático del paquete para uso posterior
 * en la pantalla de revisión interna de Agentik.
 *
 * Estructura de datos únicamente — sin lógica de renderizado.
 *
 * Sprint: AGENTIK-SAG-EXECUTIVE-PACK-EXPORT-01
 */

import { SAG_EXECUTIVE_SUMMARY_META } from "../sag-executive-summary";
import { SAG_VIEW_REQUEST_DOC, getViewRequestSummary } from "../sag-view-request-doc";
import { SAG_OPEN_QUESTIONS, getOpenQuestionsSummary } from "../sag-open-questions";
import { SAG_MASTER_CONTRACT } from "../../data-contract/sag-domain-contracts";

// ── Dashboard types ────────────────────────────────────────────────────────────

export interface DomainSummary {
  id:              string;
  nombre:          string;
  status:          string;
  prioridad:       number;
  totalCampos:     number;
  camposRequeridos: number;
  tieneVista:      boolean;
}

export interface ViewSummary {
  nombreVista:     string;
  prioridad:       string;
  camposRequeridos: number;
  camposOpcionales: number;
  frecuencia:      string;
}

export interface QuestionsSummary {
  total:       number;
  criticas:    number;
  importantes: number;
  informativas: number;
  porDominio:  Record<string, number>;
}

export interface ContractHealthStatus {
  version:            string;
  totalDominios:      number;
  dominiosAcordados:  number;
  dominiosBloqueados: number;
  totalCampos:        number;
  camposConfirmados:  number;
  camposPendientes:   number;
  camposDerivados:    number;
}

export interface ReviewDashboardMetadata {
  // Identity
  version:         string;
  fechaContrato:   string;
  generadoEn:      string;

  // Scope
  totalDominios:   number;
  totalVistas:     number;
  totalCamposRequeridos: number;
  totalCamposOpcionales: number;
  totalCampos:     number;

  // Questions
  preguntasAbiertas: QuestionsSummary;

  // Contract health
  contractHealth:  ContractHealthStatus;

  // Domain breakdown
  dominios:        DomainSummary[];

  // View breakdown
  vistas:          ViewSummary[];

  // Flags for UI rendering
  flags: {
    tieneVistasEnEspera:   boolean;
    tienePreguntasCriticas: boolean;
    hayDominiosBloqueados:  boolean;
    paqueteListo:          boolean;
  };
}

// ── Build metadata ─────────────────────────────────────────────────────────────

export function buildReviewDashboardMetadata(): ReviewDashboardMetadata {
  const viewSummaries = getViewRequestSummary();
  const questionsSummary = getOpenQuestionsSummary();

  // Domain breakdown from master contract
  const dominios: DomainSummary[] = SAG_MASTER_CONTRACT.domains.map(d => {
    const vista = SAG_VIEW_REQUEST_DOC.find(v => v.dominio === d.id || v.nombreVista.includes(d.id));
    const requeridos = d.fields.filter(f => f.obligatorio && f.status !== "derived").length;
    return {
      id:               d.id,
      nombre:           d.nombre,
      status:           d.status,
      prioridad:        d.prioridad,
      totalCampos:      d.fields.length,
      camposRequeridos: requeridos,
      tieneVista:       !!vista,
    };
  });

  // Total field counts across all views
  const totalCamposRequeridos = viewSummaries.reduce((sum, v) => sum + v.totalRequeridos, 0);
  const totalCamposOpcionales = viewSummaries.reduce((sum, v) => sum + v.totalOpcionales, 0);

  // Contract health
  const allFields = SAG_MASTER_CONTRACT.domains.flatMap(d => d.fields);
  const contractHealth: ContractHealthStatus = {
    version:            SAG_MASTER_CONTRACT.version,
    totalDominios:      SAG_MASTER_CONTRACT.domains.length,
    dominiosAcordados:  SAG_MASTER_CONTRACT.domains.filter(
      d => d.status === "agreed" || d.status === "view_requested" || d.status === "integrated"
    ).length,
    dominiosBloqueados: SAG_MASTER_CONTRACT.domains.filter(d => d.status === "blocked").length,
    totalCampos:        allFields.length,
    camposConfirmados:  allFields.filter(f => f.status === "confirmed" || f.status === "agreed").length,
    camposPendientes:   allFields.filter(f => f.status === "unconfirmed" || f.status === "pending_access" || f.status === "pending_view").length,
    camposDerivados:    allFields.filter(f => f.status === "derived").length,
  };

  return {
    version:         SAG_EXECUTIVE_SUMMARY_META.version,
    fechaContrato:   SAG_EXECUTIVE_SUMMARY_META.fecha,
    generadoEn:      new Date().toISOString(),

    totalDominios:   SAG_MASTER_CONTRACT.domains.length,
    totalVistas:     SAG_VIEW_REQUEST_DOC.length,
    totalCamposRequeridos,
    totalCamposOpcionales,
    totalCampos:     totalCamposRequeridos + totalCamposOpcionales,

    preguntasAbiertas: questionsSummary,

    contractHealth,

    dominios,

    vistas: viewSummaries.map(v => ({
      nombreVista:      v.nombreVista,
      prioridad:        v.prioridad,
      camposRequeridos: v.totalRequeridos,
      camposOpcionales: v.totalOpcionales,
      frecuencia:       v.frecuencia,
    })),

    flags: {
      tieneVistasEnEspera:    SAG_MASTER_CONTRACT.viewRequests.some(
        r => r.status === "submitted" || r.status === "in_progress_sag"
      ),
      tienePreguntasCriticas:  questionsSummary.criticas > 0,
      hayDominiosBloqueados:   contractHealth.dominiosBloqueados > 0,
      paqueteListo:            true,  // Updated by presend-validation-runner at runtime
    },
  };
}

// ── Convenience: serialize to JSON ────────────────────────────────────────────

export function serializeReviewDashboardMetadata(): string {
  return JSON.stringify(buildReviewDashboardMetadata(), null, 2);
}
