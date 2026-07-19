/**
 * castillitos-bodega-mapping.ts
 *
 * INVENTORY-F34-TRANSFER-SYNC-01 — SAG internal ka_nl_bodega → external ss_codigo mapping.
 *
 * SAG's bodegas table has two identifiers:
 *   - ka_nl_bodega: internal auto-increment PK (10, 11, 12...)
 *   - ss_codigo: external business code ("01", "02", "03"...)
 *
 * All Agentik systems (castillitos-locations.ts, PIL, SaleRecord) use ss_codigo.
 * Transfer lines (movimientos_traslados) store ka_nl_bodega.
 * This mapping bridges the two.
 *
 * Source: SELECT ka_nl_bodega, ss_codigo, ss_nombre FROM bodegas (queried 2026-06-30)
 */

export interface BodegaMapping {
  internalId: number;   // ka_nl_bodega (SAG PK)
  externalCode: string; // ss_codigo (business code)
  name: string;
}

/** Complete Castillitos bodega mapping from SAG bodegas table. */
export const CASTILLITOS_BODEGA_MAP: BodegaMapping[] = [
  { internalId: 10, externalCode: "01", name: "BODEGA PRINCIPAL" },
  { internalId: 11, externalCode: "02", name: "BODEGA SANDIEGO" },
  { internalId: 12, externalCode: "03", name: "BODEGA MAYORCA" },
  { internalId: 13, externalCode: "04", name: "PRODUCTO EN PROCESO" },
  { internalId: 14, externalCode: "05", name: "MATERIA PRIMA" },
  { internalId: 15, externalCode: "06", name: "TELAS" },
  { internalId: 16, externalCode: "07", name: "RETAZOS" },
  { internalId: 17, externalCode: "08", name: "F1 - PAQUE BERRIO" },
  { internalId: 18, externalCode: "10", name: "F6 - BELLO" },
  { internalId: 19, externalCode: "09", name: "F3 - BOLIVAR" },
  { internalId: 20, externalCode: "11", name: "F7 - ARMENIA" },
  { internalId: 21, externalCode: "12", name: "F9 - PEREIRA" },
  { internalId: 22, externalCode: "13", name: "F16 - CENT MAY BOGOT" },
  { internalId: 23, externalCode: "14", name: "F17 - MAYORCA" },
  { internalId: 24, externalCode: "15", name: "F10 - IBAGUE" },
  { internalId: 25, externalCode: "16", name: "MUESTRAS" },
  { internalId: 26, externalCode: "18", name: "ARREGLOS" },
  { internalId: 27, externalCode: "19", name: "SEGUNDAS Y SALDOS" },
  { internalId: 28, externalCode: "20", name: "TEMPORAL FLAMINGO" },
  { internalId: 29, externalCode: "21", name: "F19 - MONTERIA" },
  { internalId: 30, externalCode: "22", name: "PAGINA WEB" },
  { internalId: 31, externalCode: "00", name: "BODEGA CENTRO" },
  { internalId: 32, externalCode: "23", name: "GRAN PLAZA" },
  { internalId: 33, externalCode: "24", name: "IMPORTACION" },
  { internalId: 34, externalCode: "25", name: "NO USAR" },
  { internalId: 36, externalCode: "26", name: "IMPORTACION PARTE 2" },
  { internalId: 37, externalCode: "27", name: "IMPORTACION PARTE 1" },
  { internalId: 38, externalCode: "28", name: "PLAN SEPARE" },
  { internalId: 39, externalCode: "29", name: "BODEGA CALDAS" },
  { internalId: 41, externalCode: "30", name: "IMPO CONTENEDOR 2" },
  { internalId: 42, externalCode: "31", name: "IMPO CONTENEDOR 2-1" },
  { internalId: 43, externalCode: "32", name: "IMPO CONTENEDOR 3" },
  { internalId: 44, externalCode: "33", name: "IMPO CONTENEDOR 4" },
  { internalId: 45, externalCode: "35", name: "VEND ORLANDO" },
  { internalId: 46, externalCode: "36", name: "VEND CARLOS LEON" },
  { internalId: 47, externalCode: "37", name: "VEND LUIS" },
  { internalId: 48, externalCode: "38", name: "VEND NESTOR" },
  { internalId: 49, externalCode: "39", name: "VEND CARLOS VILLA" },
  { internalId: 50, externalCode: "40", name: "VEND FREDY" },
  { internalId: 51, externalCode: "34", name: "IMPO CONTENEDOR 5" },
  { internalId: 52, externalCode: "41", name: "DEXCATO. MC" },
  { internalId: 53, externalCode: "42", name: "IMPO CONTENEDOR 6" },
  { internalId: 54, externalCode: "43", name: "IMPO CONTENEDOR 7" },
  { internalId: 55, externalCode: "44", name: "IMPO CONTENEDOR 7-1" },
  { internalId: 56, externalCode: "45", name: "IMPO CONTENEDOR 7-2" },
  { internalId: 57, externalCode: "46", name: "IMPO CONETNEDOR 7-3" },
  { internalId: 58, externalCode: "47", name: "MARCA SAMUEL" },
  { internalId: 59, externalCode: "48", name: "IMPO CONTENEDOR 9-1" },
  { internalId: 60, externalCode: "49", name: "IMPO CONTENEDOR 10-1" },
];

// ── Lookup helpers ──────────────────────────────────────────────────────────

const _byInternal = new Map<number, BodegaMapping>();
const _byExternal = new Map<string, BodegaMapping>();

for (const m of CASTILLITOS_BODEGA_MAP) {
  _byInternal.set(m.internalId, m);
  _byExternal.set(m.externalCode, m);
}

/** Convert SAG internal ka_nl_bodega to external ss_codigo. Returns null if unknown. */
export function internalToExternal(internalId: number | string | null): string | null {
  if (internalId === null || internalId === undefined) return null;
  const id = typeof internalId === "string" ? parseInt(internalId, 10) : internalId;
  if (isNaN(id)) return null;
  return _byInternal.get(id)?.externalCode ?? null;
}

/** Convert external ss_codigo to SAG internal ka_nl_bodega. Returns null if unknown. */
export function externalToInternal(externalCode: string | null): number | null {
  if (externalCode === null || externalCode === undefined) return null;
  return _byExternal.get(externalCode)?.internalId ?? null;
}

/** Get bodega name by internal ID. */
export function bodegaName(internalId: number | string | null): string | null {
  if (internalId === null || internalId === undefined) return null;
  const id = typeof internalId === "string" ? parseInt(internalId, 10) : internalId;
  if (isNaN(id)) return null;
  return _byInternal.get(id)?.name ?? null;
}
