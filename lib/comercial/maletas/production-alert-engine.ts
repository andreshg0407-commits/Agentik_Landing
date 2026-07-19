/**
 * lib/comercial/maletas/production-alert-engine.ts
 *
 * Production Alert Engine — crosses SAG live inventory with configured rules
 * to generate concrete, actionable production alerts.
 *
 * Phase 6: buildProductionAlertsFromRules()
 *
 * Decision rules:
 *   1. availableForCases <= minWarehouseQty → DIRECT shortage → alert
 *   2. netAvailableAfterPD <= minWarehouseQty AND available > min → PREVENTIVE alert
 *   3. AP NEVER triggers an alert (excluded at normalizer level)
 *
 * Severity escalation:
 *   critica    → availableForCases = 0 AND pendingPDQty > 0
 *   urgente    → availableForCases = 0 (no PD pressure needed)
 *   alta       → available <= min AND pendingPDQty > 0
 *   preventiva → available > min BUT netAfterPD <= min (will fall)
 *   normal     → available <= min, no PD pressure
 *
 * Each alert reason follows Phase 9 format:
 * "Producir N uds de [description] — disponible X, mínimo Y[, PD pendiente Z, faltante operativo W]."
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-FUNCTIONAL-REALIGNMENT-01
 */

import type { CommercialCoverageRule, ProductionAlertSeverity } from "./coverage-rule-types";
import type { SagInventoryItem } from "./sag-inventory-adapter";
import type { CommercialCaseLine } from "./maletas-types";

// ─── Production alert ──────────────────────────────────────────────────────────

export interface ProductionAlert {
  id:                     string;
  line:                   CommercialCaseLine;
  category:               string;
  productType:            string;
  reference:              string;
  description:            string;
  size?:                  string;
  color?:                 string;

  // ── Availability snapshot at alert time ──────────────────────────────────
  availableForCases:      number;   // disponible = bodega - reservas
  minWarehouseQty:        number;   // from rule
  pendingPDQty:           number;   // SAG PD demand pressure
  /** disponible - pendingPDQty: what actually remains if all PD orders are fulfilled */
  netAvailableAfterPD:    number;
  /** max(0, minWarehouseQty - availableForCases) */
  operationalShortage:    number;

  suggestedProductionQty: number;
  severity:               ProductionAlertSeverity;
  /** Full causal explanation — Phase 9 format. No AI. */
  reason:                 string;
  ruleId:                 string;
  affectedSalesRepIds:    string[];
  triggeredAt:            string;
}

// ─── Engine ────────────────────────────────────────────────────────────────────

/**
 * Cross SAG live inventory with configured rules to generate production alerts.
 *
 * @param inventory        SagInventoryItem[] — from deriveSagInventoryFromContext() or SAG direct
 * @param rules            CommercialCoverageRule[] — active rules from user config or defaults
 * @param affectedRepsByRef  Optional map: UPPERCASE ref → salesRepId[] (from case assignments)
 */
export function buildProductionAlertsFromRules(
  inventory:          SagInventoryItem[],
  rules:              CommercialCoverageRule[],
  affectedRepsByRef?: Map<string, string[]>,
): ProductionAlert[] {
  const alerts: ProductionAlert[] = [];
  const alertedKeys = new Set<string>(); // deduplicate rule × reference

  // Index inventory for fast lookup
  const invByRef = new Map<string, SagInventoryItem>();
  for (const item of inventory) {
    invByRef.set(item.reference.toUpperCase(), item);
  }

  const activeRules = rules.filter(r => r.active);

  for (const rule of activeRules) {
    // ── Find matching inventory items ──────────────────────────────────────
    let candidates: SagInventoryItem[];

    if (rule.reference) {
      // Exact reference match
      const item = invByRef.get(rule.reference.toUpperCase());
      candidates = item ? [item] : [];
    } else {
      // Line + category match (category normalized to uppercase for comparison)
      const ruleCategory = rule.category.toUpperCase();
      candidates = inventory.filter(item => {
        if (item.line !== rule.line) return false;
        return item.category.toUpperCase().includes(ruleCategory)
          || ruleCategory.includes(item.category.toUpperCase());
      });
    }

    for (const item of candidates) {
      const key = `${rule.id}:${item.reference}`;
      if (alertedKeys.has(key)) continue;

      const netAvailableAfterPD = item.availableForCases - item.pendingPDQty;
      const operationalShortage = Math.max(0, rule.minWarehouseQty - item.availableForCases);

      const hasDirectShortage    = item.availableForCases <= rule.minWarehouseQty;
      const hasPreventiveShortage = !hasDirectShortage && netAvailableAfterPD <= rule.minWarehouseQty;

      if (!hasDirectShortage && !hasPreventiveShortage) continue;

      alertedKeys.add(key);

      // ── Severity ──────────────────────────────────────────────────────────
      let severity: ProductionAlertSeverity;
      if (item.availableForCases <= 0 && item.pendingPDQty > 0) {
        severity = "critica";
      } else if (item.availableForCases <= 0) {
        severity = "urgente";
      } else if (item.availableForCases <= Math.floor(rule.minWarehouseQty * 0.5) && item.pendingPDQty > 0) {
        severity = "urgente";
      } else if (item.availableForCases <= rule.minWarehouseQty && item.pendingPDQty > 0) {
        severity = "alta";
      } else if (hasPreventiveShortage) {
        severity = "preventiva";
      } else {
        severity = "normal";
      }

      // ── Reason — Phase 9 format ─────────────────────────────────────────
      // "Producir 24 uds de Pijama niña bebé — disponible 4, mínimo 12, PD pendiente 8, faltante operativo 16."
      const reasonParts: string[] = [
        `disponible ${item.availableForCases}`,
        `mínimo ${rule.minWarehouseQty}`,
      ];
      if (item.pendingPDQty > 0) {
        reasonParts.push(`PD pendiente ${item.pendingPDQty}`);
      }
      if (operationalShortage > 0) {
        reasonParts.push(`faltante operativo ${operationalShortage}`);
      }
      if (hasPreventiveShortage && !hasDirectShortage) {
        reasonParts.push(`disponible neto post-PD ${netAvailableAfterPD} (caerá bajo mínimo)`);
      }

      const reason = `Producir ${rule.suggestedProductionQty} uds de ${item.description} — ${reasonParts.join(", ")}.`;

      alerts.push({
        id:                     `alert_${rule.id}_${item.reference}`,
        line:                   item.line,
        category:               item.category,
        productType:            item.productType,
        reference:              item.reference,
        description:            item.description,
        size:                   item.size ?? rule.size,
        color:                  item.color ?? rule.color,
        availableForCases:      item.availableForCases,
        minWarehouseQty:        rule.minWarehouseQty,
        pendingPDQty:           item.pendingPDQty,
        netAvailableAfterPD,
        operationalShortage,
        suggestedProductionQty: rule.suggestedProductionQty,
        severity,
        reason,
        ruleId:                 rule.id,
        affectedSalesRepIds:    affectedRepsByRef?.get(item.reference.toUpperCase()) ?? [],
        triggeredAt:            new Date().toISOString(),
      });
    }
  }

  // Sort: severity priority → operationalShortage desc
  const SEV_ORDER: Record<ProductionAlertSeverity, number> = {
    critica: 0, urgente: 1, alta: 2, preventiva: 3, normal: 4,
  };

  return alerts.sort(
    (a, b) =>
      SEV_ORDER[a.severity] - SEV_ORDER[b.severity] ||
      b.operationalShortage - a.operationalShortage,
  );
}

/**
 * Build a map: UPPERCASE reference → ProductionAlert.
 * Used by case status engine to check production path for each assignment.
 */
export function buildAlertsByRef(
  alerts: ProductionAlert[],
): Map<string, ProductionAlert> {
  const map = new Map<string, ProductionAlert>();
  for (const alert of alerts) {
    map.set(alert.reference.toUpperCase(), alert);
  }
  return map;
}
