/**
 * XML builder for SAG write type 5 — Crear/Actualizar Artículos.
 *
 * SAG XML contract:
 *
 *   <ARTICULOS>
 *     <ARTICULO>
 *       <CODIGO>PRD001</CODIGO>
 *       <DESCRIPCION>Producto Ejemplo</DESCRIPCION>
 *       <PRECIO>50000</PRECIO>
 *       <IVA>19</IVA>
 *       <UNIDAD>UND</UNIDAD>
 *       <ACTIVO>1</ACTIVO>
 *     </ARTICULO>
 *   </ARTICULOS>
 *
 * SAG upserts on CODIGO — sending an existing code updates the record.
 * Risk: LOW — no financial impact, idempotent.
 */

import type { SagProductInput } from "../types";
import { el, optEl } from "./escaping";

export function buildProductXml(input: SagProductInput): string {
  const inner = [
    // Required
    el("CODIGO",              input.CODIGO),
    el("DESCRIPCION",         input.DESCRIPCION),
    el("PRECIO",              input.PRECIO),
    // Classification
    optEl("GRUPO",            input.GRUPO),
    optEl("SUB_GRUPO",        input.SUB_GRUPO),
    optEl("LINEA",            input.LINEA),
    optEl("MARCA",            input.MARCA),
    optEl("REFERENCIA",       input.REFERENCIA),
    // Logistics
    optEl("UNIDAD",           input.UNIDAD),
    optEl("MANEJA_KARDEX",    input.MANEJA_KARDEX),
    optEl("MANEJA_TALLA_COLOR", input.MANEJA_TALLA_COLOR),
    optEl("TALLA",            input.TALLA),
    optEl("COLOR",            input.COLOR),
    optEl("MANEJA_LOTE",      input.MANEJA_LOTE),
    // Pricing / tax
    optEl("TARIFA_IVA",       input.TARIFA_IVA),
    optEl("IVA",              input.IVA),
    optEl("INCLUIDO_IVA",     input.INCLUIDO_IVA),
    optEl("COSTO",            input.COSTO),
    // Commerce
    optEl("COMPOSICION",      input.COMPOSICION),
    optEl("ADQUISICION",      input.ADQUISICION),
    optEl("TIENDA_VIRTUAL",   input.TIENDA_VIRTUAL),
    // Status
    optEl("ACTIVO",           input.ACTIVO ?? "S"),
    optEl("BLOQUEADO",        input.BLOQUEADO),
  ].filter(Boolean).join("");

  return `<ARTICULOS><ARTICULO>${inner}</ARTICULO></ARTICULOS>`;
}
