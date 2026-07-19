/**
 * lib/integrations/sag/executive-pack/sag-redaction-layer.ts
 *
 * SAG Executive Pack — Internal Redaction Layer
 *
 * Filters contract data to produce an external-safe representation
 * suitable for SAG without exposing internal platform details.
 *
 * Rule: SAG receives only what SAG needs to define views.
 * Rule: Internal modules, KPI names, and strategic notes are stripped.
 *
 * Sprint: AGENTIK-SAG-CONTRACT-EXECUTIVE-PACK-01
 */

import type { SagDomainContract, SagField, AgentikModule } from "../data-contract/sag-data-contract";

// ── Export target ──────────────────────────────────────────────────────────────

export type ExportTarget = "external" | "internal";

// ── Internal modules — never exposed to SAG ───────────────────────────────────

const INTERNAL_MODULES: AgentikModule[] = [
  "copilot",
  "marketing_studio",
  "cliente_360",
  "automatizaciones",
  "ecommerce",
];

// ── Internal keyword patterns in notas — redacted in external exports ─────────

const INTERNAL_NOTA_PATTERNS: RegExp[] = [
  /copilot/i,
  /agentik ia/i,
  /marketing studio/i,
  /roadmap/i,
  /cliente 360/i,
  /automatizacion/i,
  /inteligencia operacional/i,
  /recomendaciones automáticas/i,
  /capa de inteligencia/i,
];

// ── Field statuses that should be annotated but not omitted ───────────────────

const DERIVED_STATUS_LABEL = "Calculado por Agentik";

// ── External field shape ───────────────────────────────────────────────────────

export interface ExternalSagField {
  campo:          string;
  tipo:           string;
  obligatorio:    boolean;
  descripcion:    string;
  fuenteSag:      string;
  esDeriado:      boolean;
  /** Shown only if SAG needs to know how to structure the field */
  notas?:         string;
}

// ── External domain view ───────────────────────────────────────────────────────

export interface ExternalDomainView {
  id:             string;
  nombre:         string;
  descripcion:    string;
  suggestedView:  string;
  primaryTables:  string[];
  syncFrequency:  string;
  campos:         ExternalSagField[];
  camposRequeridos:  string[];
  camposOpcionales:  string[];
  bloqueadores:   string[];
  totalCampos:    number;
  totalRequeridos: number;
}

// ── Redact a single field for external use ────────────────────────────────────

export function redactFieldForExternal(field: SagField): ExternalSagField | null {
  // Omit fields that Agentik derives internally (SAG cannot provide them)
  if (field.status === "derived") {
    return {
      campo:       field.campo,
      tipo:        field.tipo,
      obligatorio: false,
      descripcion: field.descripcion.split(".")[0] + ".", // First sentence only
      fuenteSag:   "Calculado por Agentik",
      esDeriado:   true,
      notas:       DERIVED_STATUS_LABEL + " — SAG no necesita exponer este campo.",
    };
  }

  // Strip internal Copilot/AI references from notas
  let notasExternal: string | undefined = field.notas;
  if (notasExternal) {
    const isInternalNota = INTERNAL_NOTA_PATTERNS.some(p => p.test(notasExternal!));
    if (isInternalNota) {
      notasExternal = undefined;
    }
  }

  // Truncate description at first sentence if it references internal systems.
  // If the first sentence itself is contaminated, fall back to a generic label.
  let descripcionExternal = field.descripcion;
  if (INTERNAL_NOTA_PATTERNS.some(p => p.test(descripcionExternal))) {
    const sentences = descripcionExternal.split(/\.\s+/);
    const firstSentence = sentences[0] + ".";
    descripcionExternal = INTERNAL_NOTA_PATTERNS.some(p => p.test(firstSentence))
      ? `Campo ${field.campo} de tipo ${field.tipo}.`
      : firstSentence;
  }

  return {
    campo:       field.campo,
    tipo:        field.tipo,
    obligatorio: field.obligatorio,
    descripcion: descripcionExternal,
    fuenteSag:   field.fuenteSag,
    esDeriado:   false,
    notas:       notasExternal,
  };
}

// ── Redact a full domain contract for external use ────────────────────────────

export function redactDomainForExternal(contract: SagDomainContract): ExternalDomainView {
  const allCampos = contract.fields.map(redactFieldForExternal).filter(Boolean) as ExternalSagField[];
  const camposReales = allCampos.filter(f => !f.esDeriado);
  const camposRequeridos = camposReales.filter(f => f.obligatorio).map(f => f.campo);
  const camposOpcionales = camposReales.filter(f => !f.obligatorio).map(f => f.campo);

  // Strip internal blockers that reference Copilot/AI
  const bloqueadoresExternal = (contract.bloqueadores ?? []).filter(b =>
    !INTERNAL_NOTA_PATTERNS.some(p => p.test(b))
  );

  // Sanitize domain description: take first sentence; if still contaminated, use generic label
  const rawDesc = contract.descripcion.split(". ")[0] + ".";
  const domainDescripcion = INTERNAL_NOTA_PATTERNS.some(p => p.test(rawDesc))
    ? `Dominio ${contract.nombre} — datos operacionales para consulta de solo lectura.`
    : rawDesc;

  return {
    id:             contract.id,
    nombre:         contract.nombre,
    descripcion:    domainDescripcion,
    suggestedView:  contract.suggestedView ?? `vw_agentik_${contract.id}`,
    primaryTables:  contract.primaryTables,
    syncFrequency:  contract.syncFrequency,
    campos:         allCampos,
    camposRequeridos,
    camposOpcionales,
    bloqueadores:   bloqueadoresExternal,
    totalCampos:    camposReales.length,
    totalRequeridos: camposRequeridos.length,
  };
}

// ── Redact multiple domains ───────────────────────────────────────────────────

export function redactDomainsForExternal(contracts: SagDomainContract[]): ExternalDomainView[] {
  return contracts.map(redactDomainForExternal);
}

// ── Utility: get external-safe field count label ──────────────────────────────

export function getExternalFieldSummary(view: ExternalDomainView): string {
  return `${view.totalCampos} campos (${view.totalRequeridos} requeridos, ${view.totalCampos - view.totalRequeridos} opcionales)`;
}
