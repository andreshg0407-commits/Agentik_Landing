/**
 * lib/comercial/maletas/maleta-surtido-types.ts
 *
 * Domain types for maleta surtido operations:
 * - Operational reservations (pending warehouse actions)
 * - Surtido guide documents (warehouse pick/pack instructions)
 *
 * Sprint: MALETAS-ACTIONS-AND-GUIDES-01
 */

// ── Reservation states ──────────────────────────────────────────────────────

export type MaletaReservationStatus =
  | "pendiente_bodega"
  | "preparado"
  | "enviado"
  | "recibido"
  | "cancelado";

export const RESERVATION_STATUS_LABEL: Record<MaletaReservationStatus, string> = {
  pendiente_bodega: "Pendiente bodega",
  preparado:        "Preparado",
  enviado:          "Enviado",
  recibido:         "Recibido",
  cancelado:        "Cancelado",
};

// ── Reservation (one swap: ref-in → ref-out for a specific maleta) ──────────

export interface MaletaReservation {
  id: string;
  guideId: string;
  vendorId: string;
  vendorName: string;
  warehouseCode: string;
  /** Reference entering the maleta */
  refIn: string;
  refInDescription: string;
  refInQty: number;
  /** Reference leaving the maleta (may be empty for pure additions) */
  refOut: string | null;
  refOutDescription: string | null;
  refOutQty: number;
  /** Why this swap is happening */
  reason: string;
  status: MaletaReservationStatus;
  createdAt: string;
}

// ── Surtido Guide (warehouse document grouping reservations) ────────────────

export interface MaletaSurtidoGuide {
  id: string;
  /** Sequential document number: GS-YYYYMMDD-NNN */
  documentNumber: string;
  date: string;
  vendorId: string;
  vendorName: string;
  warehouseCode: string;
  warehouseName: string;
  city: string;
  reservations: MaletaReservation[];
  observations: string;
  status: MaletaReservationStatus;
  createdAt: string;
}

// ── Production detail (enriched production suggestion for drawer) ───────────

export interface ProductionDetail {
  reference: string;
  description: string;
  line: string;
  subgrupoSag: string;
  centralAvailable: number;
  minimumRequired: number;
  shortfall: number;
  suggestedQty: number;
  urgency: "alta" | "media" | "baja";
  /** How many maletas lack coverage for this subgroup */
  affectedMaletasCount: number;
  affectedVendorNames: string[];
  /** What subgroup is uncovered */
  uncoveredSubgroup: string;
  /** Available inventory context */
  inventoryContext: string;
  /** Sales/commitment context */
  salesContext: string;
  /** Operational gap explanation */
  gapExplanation: string;
  /** Full reason sentence */
  productionReason: string;
}

// ── Coverage opportunity detail (for "Agregar a maleta" flow) ───────────────

export interface MaletaCandidate {
  vendorId: string;
  vendorName: string;
  warehouseCode: string;
  city: string;
  currentCoverage: number;
  refsAtRisk: number;
  /** References in the vendor's bag eligible for replacement */
  replaceableRefs: Array<{
    reference: string;
    description: string;
    reason: string;
  }>;
}

// ── Helper to generate IDs and document numbers ─────────────────────────────

export function generateReservationId(): string {
  return `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateGuideId(): string {
  return `gs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateDocumentNumber(): string {
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, "0");
  return `GS-${ymd}-${seq}`;
}
