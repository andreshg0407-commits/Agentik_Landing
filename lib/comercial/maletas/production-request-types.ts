/**
 * lib/comercial/maletas/production-request-types.ts
 *
 * ProductionRequestDraft — pending action model for the Maletas → Production bridge.
 *
 * This type represents a production request assembled from Maletas signals.
 * It is NOT executed yet — it is a draft that will be reviewed and confirmed
 * by the production coordinator before triggering any production workflow.
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-OPS-UI-01
 */

import type { CommercialCaseLine } from "./maletas-types";

/** Priority levels aligned with ProductionUrgency */
export type ProductionRequestPriority =
  | "critica"
  | "urgente"
  | "alta"
  | "importante"
  | "normal";

/**
 * Draft production request assembled from Maletas operational signals.
 *
 * Created when an operator marks a reference for production in the UI.
 * Stored locally in the client until confirmed and sent to production coordinator.
 *
 * Source is always "maletas" — distinguishes from other demand channels
 * (tiendas, exportación, etc.) that may generate production requests in V2.
 */
export interface ProductionRequestDraft {
  /** Internal draft ID (cuid-style, generated client-side) */
  draftId:            string;

  /** Product reference code (uppercase) */
  reference:          string;

  /** Human-readable product description */
  description:        string;

  /** Commercial line: LT (lencería-tejidos) | CS (confección-superior) */
  line:               CommercialCaseLine;

  /** Units to produce — from maletas engine suggestedQty */
  suggestedQty:       number;

  /**
   * Operational reason for the production request.
   * Computed by the engine — not entered by operator.
   */
  reason:             string;

  /** Always "maletas" — origin channel for the production request */
  source:             "maletas";

  /** Urgency level from the production pressure signal */
  priority:           ProductionRequestPriority;

  /** salesRep IDs whose maletas are affected */
  affectedSalesReps:  string[];

  /** SAG PD pending orders for this ref at request time */
  pdPendingQty:       number;

  /** Coverage status at the time the request was created */
  coverageStatus:     string;

  /** ISO timestamp when the draft was created */
  createdAt:          string;
}
