/**
 * XML builders for SAG write types 2 (Documento) and 28 (Documento genérico).
 *
 * SAG XML contract:
 *
 *   <DOCUMENTOS>
 *     <DOCUMENTO>
 *       <TIPO_DOC>FV</TIPO_DOC>
 *       <NUMERO_DOC>0001</NUMERO_DOC>     <!-- optional; SAG auto-assigns if absent -->
 *       <NIT>900123456</NIT>
 *       <FECHA>2024-01-15</FECHA>
 *       <VENDEDOR>CARLOS GARCIA</VENDEDOR>
 *       <BODEGA>001</BODEGA>
 *       <OBSERVACION>Nota interna</OBSERVACION>
 *       <DETALLE>
 *         <ITEM>
 *           <CODIGO>PRD001</CODIGO>
 *           <CANTIDAD>2</CANTIDAD>
 *           <PRECIO>50000</PRECIO>
 *           <DESCUENTO>0</DESCUENTO>
 *           <BODEGA>001</BODEGA>
 *         </ITEM>
 *       </DETALLE>
 *     </DOCUMENTO>
 *   </DOCUMENTOS>
 *
 * Common TIPO_DOC values:
 *   FV  = Factura de venta
 *   CO  = Cotización
 *   PE  = Pedido
 *   NC  = Nota crédito
 *   ND  = Nota débito
 *   RE  = Remisión
 *
 * Risk: HIGH — creates a financial document in SAG; requires human approval.
 * Not reversible without a credit note (NC) on the SAG side.
 */

import type { SagDocumentInput, SagDocumentLine } from "../types";
import { el, optEl, sagDate } from "./escaping";

function buildLineXml(line: SagDocumentLine): string {
  return [
    "<ITEM>",
    el("CODIGO",        line.CODIGO),
    el("CANTIDAD",      line.CANTIDAD),
    el("PRECIO",        line.PRECIO),
    optEl("DESCUENTO",  line.DESCUENTO ?? 0),
    optEl("IVA",        line.IVA),
    optEl("BODEGA",     line.BODEGA),
    "</ITEM>",
  ].join("");
}

export function buildDocumentXml(input: SagDocumentInput): string {
  if (input.LINEAS.length === 0) {
    throw new Error("SAG_XML_BUILDER: Document must have at least one LINEA.");
  }

  const detalle = `<DETALLE>${input.LINEAS.map(buildLineXml).join("")}</DETALLE>`;

  const header = [
    el("TIPO_DOC",        input.TIPO_DOC),
    optEl("NUMERO_DOC",   input.NUMERO_DOC),
    el("NIT",             input.NIT),
    el("FECHA",           sagDate(input.FECHA)),
    optEl("VENDEDOR",     input.VENDEDOR),
    optEl("BODEGA",       input.BODEGA),
    optEl("OBSERVACION",  input.OBSERVACION),
  ].filter(Boolean).join("");

  return `<DOCUMENTOS><DOCUMENTO>${header}${detalle}</DOCUMENTO></DOCUMENTOS>`;
}

// Type 28 uses the same XML shape — SAG handles the routing internally.
export const buildGenericDocumentXml = buildDocumentXml;
