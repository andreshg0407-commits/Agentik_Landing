/**
 * XML builder for SAG write type 6 — Recibos de caja / Egresos / Movimientos contables.
 *
 * SAG XML contract:
 *
 *   <MOVIMIENTOS>
 *     <MOVIMIENTO>
 *       <TIPO>RC</TIPO>          <!-- RC=Recibo de caja, EG=Egreso -->
 *       <NUMERO>0001</NUMERO>    <!-- optional; SAG auto-assigns -->
 *       <NIT>900123456</NIT>
 *       <FECHA>2024-01-15</FECHA>
 *       <VALOR>100000</VALOR>
 *       <CONCEPTO>Pago factura FV-001</CONCEPTO>
 *       <CUENTA>111005</CUENTA>
 *       <BANCO>BANCOLOMBIA</BANCO>
 *       <CHEQUE>12345</CHEQUE>
 *     </MOVIMIENTO>
 *   </MOVIMIENTOS>
 *
 * Risk: HIGH — creates a financial cash/payment movement in SAG.
 * BLOCKED in v1 — exposed here for architecture completeness only.
 * Activate only after reconciliation tooling is validated.
 */

import type { SagReceiptInput } from "../types";
import { el, optEl, sagDate } from "./escaping";

export function buildReceiptXml(input: SagReceiptInput): string {
  const inner = [
    el("TIPO",       input.TIPO),
    optEl("NUMERO",  input.NUMERO),
    el("NIT",        input.NIT),
    el("FECHA",      sagDate(input.FECHA)),
    el("VALOR",      input.VALOR),
    el("CONCEPTO",   input.CONCEPTO),
    optEl("CUENTA",  input.CUENTA),
    optEl("BANCO",   input.BANCO),
    optEl("CHEQUE",  input.CHEQUE),
  ].filter(Boolean).join("");

  return `<MOVIMIENTOS><MOVIMIENTO>${inner}</MOVIMIENTO></MOVIMIENTOS>`;
}
