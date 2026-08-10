/**
 * lib/connectors/adapters/sag-pya-soap/orders/current-order-cutover-law.ts
 *
 * AGENTIK-CURRENT-SAG-ORDER-INGESTION-01 — LEY PURA del cutover dual-SAG.
 *
 * CONTRATO LOCKED:
 *   HISTORICAL (CASTILLO-ALZATE) válido SOLO hasta 2026-07-20.
 *   CURRENT (LUDISAM) autoritativo DESDE 2026-07-21 (inclusive).
 *   HISTORICAL jamás suple/parchea/une registros >= 2026-07-21.
 *
 * PURA: sin red, sin Prisma, sin envs — importable desde tests y de ambos lados.
 */

/** Primer día autoritativo de CURRENT (inclusive). */
export const CURRENT_CUTOVER_ISO = "2026-07-21";
export const CURRENT_CUTOVER = new Date(`${CURRENT_CUTOVER_ISO}T00:00:00.000Z`);

/**
 * Piso de ingestión CURRENT: JAMÁS por debajo del cutover.
 * (gates A/D: sin fecha, inválida o anterior → cutover; posterior → se respeta)
 */
export function resolveIngestionFloor(sinceDate?: Date | null): Date {
  if (!sinceDate || isNaN(sinceDate.getTime())) return CURRENT_CUTOVER;
  return sinceDate > CURRENT_CUTOVER ? sinceDate : CURRENT_CUTOVER;
}

/** Guardia del contrato: un pedido pre-cutover NUNCA se persiste desde CURRENT. */
export function isCurrentEligible(orderDate: Date | null | undefined): boolean {
  return !!orderDate && !isNaN(orderDate.getTime()) && orderDate >= CURRENT_CUTOVER;
}
