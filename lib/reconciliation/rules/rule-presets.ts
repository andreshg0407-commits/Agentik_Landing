/**
 * lib/reconciliation/rules/rule-presets.ts
 *
 * AGENTIK-RECON-RULES-WIRING-01
 * Default rule presets derived from source contract fields.
 *
 * These are NOT mocks. They are starting-point rules for each canonical field
 * available across the source registry. Operators can clone, modify, and disable them.
 *
 * Preset IDs are stable slugs — safe to persist in governance snapshots.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 * Client-safe version: import RULE_PRESET_STUBS from ./rule-preset-stubs (serializable).
 */

import type { ReconciliationRule } from "./rule-types";

// ── Canonical field presets ────────────────────────────────────────────────────
//
// Each preset maps a canonical CanonicalReconRecord field to itself (source → target).
// Operators pick source/target from their actual source A/B `availableFields` in the UI.
// For sag_orders vs sag_sales, the fields resolve through normalizeReconSideToCanonical().

export const RULE_PRESETS: ReconciliationRule[] = [

  // ── IDENTITY GROUP ──────────────────────────────────────────────────────────

  {
    ruleId:      "preset_doc_exact",
    label:       "Número de documento — exacto",
    description: "Los números de documento (comprobante) deben coincidir exactamente.",
    group:       "identity",
    priority:    1,
    enabled:     true,
    weight:      { maxPoints: 40 },
    conditions: [{
      sourceField: "documentNumber",
      targetField: "documentNumber",
      operator:    "exact_match",
      normalize:   true,
    }],
  },

  {
    ruleId:      "preset_external_id_exact",
    label:       "ID externo / clave de fuente — exacto",
    description: "El ID externo de la fuente A debe coincidir con el de la fuente B.",
    group:       "identity",
    priority:    2,
    enabled:     false,
    weight:      { maxPoints: 35 },
    conditions: [{
      sourceField: "externalId",
      targetField: "externalId",
      operator:    "exact_match",
      normalize:   true,
    }],
  },

  {
    ruleId:      "preset_reference_exact",
    label:       "Referencia — exacto",
    description: "El campo referencia debe coincidir exactamente entre fuentes.",
    group:       "identity",
    priority:    3,
    enabled:     false,
    weight:      { maxPoints: 15, partial: 0.5 },
    conditions: [{
      sourceField: "reference",
      targetField: "reference",
      operator:    "exact_match",
      normalize:   true,
    }],
  },

  // ── FINANCIAL GROUP ─────────────────────────────────────────────────────────

  {
    ruleId:      "preset_amount_exact",
    label:       "Valor — exacto (0.1% tolerancia)",
    description: "Los valores monetarios deben coincidir dentro de 0.1% de tolerancia.",
    group:       "financial",
    priority:    1,
    enabled:     true,
    weight:      { maxPoints: 30 },
    conditions: [{
      sourceField: "amount",
      targetField: "amount",
      operator:    "numeric_tolerance",
      tolerance:   0.001,
    }],
  },

  {
    ruleId:      "preset_amount_2pct",
    label:       "Valor — tolerancia 2%",
    description: "Los valores monetarios deben coincidir dentro de 2% de tolerancia.",
    group:       "financial",
    priority:    2,
    enabled:     false,
    weight:      { maxPoints: 20, partial: 0.4 },
    conditions: [{
      sourceField: "amount",
      targetField: "amount",
      operator:    "numeric_tolerance",
      tolerance:   0.02,
    }],
  },

  {
    ruleId:      "preset_amount_5pct",
    label:       "Valor — tolerancia 5%",
    description: "Tolerancia amplia para depósitos sin referencia o con comisiones.",
    group:       "financial",
    priority:    3,
    enabled:     false,
    weight:      { maxPoints: 12, partial: 0.3 },
    conditions: [{
      sourceField: "amount",
      targetField: "amount",
      operator:    "numeric_tolerance",
      tolerance:   0.05,
    }],
  },

  // ── TEMPORAL GROUP ──────────────────────────────────────────────────────────

  {
    ruleId:      "preset_date_same_day",
    label:       "Fecha — mismo día",
    description: "Las fechas de documento deben ser el mismo día calendario.",
    group:       "temporal",
    priority:    1,
    enabled:     true,
    weight:      { maxPoints: 10 },
    conditions: [{
      sourceField: "date",
      targetField: "date",
      operator:    "date_window",
      windowDays:  0,
    }],
  },

  {
    ruleId:      "preset_date_3days",
    label:       "Fecha — ventana ±3 días",
    description: "Las fechas de documento deben estar dentro de 3 días calendario.",
    group:       "temporal",
    priority:    2,
    enabled:     false,
    weight:      { maxPoints: 5 },
    conditions: [{
      sourceField: "date",
      targetField: "date",
      operator:    "date_window",
      windowDays:  3,
    }],
  },

  {
    ruleId:      "preset_date_7days",
    label:       "Fecha — ventana ±7 días",
    description: "Ventana de 7 días para fuentes con diferencias de corte de período.",
    group:       "temporal",
    priority:    3,
    enabled:     false,
    weight:      { maxPoints: 3 },
    conditions: [{
      sourceField: "date",
      targetField: "date",
      operator:    "date_window",
      windowDays:  7,
    }],
  },

  // ── COUNTERPART GROUP ───────────────────────────────────────────────────────

  {
    ruleId:      "preset_nit_exact",
    label:       "NIT / Tercero — exacto",
    description: "El NIT o ID de tercero debe coincidir exactamente.",
    group:       "counterpart",
    priority:    1,
    enabled:     true,
    weight:      { maxPoints: 20 },
    conditions: [{
      sourceField: "thirdPartyId",
      targetField: "thirdPartyId",
      operator:    "exact_match",
      normalize:   true,
    }],
  },

  {
    ruleId:      "preset_name_exact",
    label:       "Nombre de tercero — normalizado",
    description: "El nombre de tercero coincide después de normalización (sin tildes, minúsculas).",
    group:       "counterpart",
    priority:    2,
    enabled:     false,
    weight:      { maxPoints: 5 },
    conditions: [{
      sourceField: "thirdPartyName",
      targetField: "thirdPartyName",
      operator:    "equals",
      normalize:   true,
    }],
  },

];

// ── Lookup by preset ID ────────────────────────────────────────────────────────

export function getPresetById(presetId: string): ReconciliationRule | undefined {
  return RULE_PRESETS.find(r => r.ruleId === presetId);
}

/**
 * Return the default active rules for a new session.
 * These are the rules enabled=true in RULE_PRESETS.
 */
export function getDefaultActiveRules(): ReconciliationRule[] {
  return RULE_PRESETS.filter(r => r.enabled);
}
