/**
 * XML builders for SAG write types 1 (Cliente) and 3 (Tercero).
 *
 * SAG XML contract (tipo=1 and tipo=3):
 *
 *   <CLIENTES>
 *     <CLIENTE>
 *       <NIT>900123456</NIT>
 *       <NOMBRE>EMPRESA ABC SAS</NOMBRE>
 *       <CIUDAD>BOGOTA</CIUDAD>
 *       ...
 *     </CLIENTE>
 *   </CLIENTES>
 *
 * Both types share the same field set; the container tag differs:
 *   tipo=1 → <CLIENTES> / <CLIENTE>
 *   tipo=3 → <TERCEROS> / <TERCERO>
 *
 * Multiple records can be batched in one call by adding more <CLIENTE> children,
 * but in v1 we always send exactly one record per operation for auditability.
 */

import type { SagCustomerInput, SagTerceroInput } from "../types";
import { el, optEl } from "./escaping";

// ── Type 1: Cliente ───────────────────────────────────────────────────────────

export function buildCustomerXml(input: SagCustomerInput): string {
  const inner = [
    // Required
    el("NIT",                    input.NIT),
    el("NOMBRE",                 input.NOMBRE),
    // Identity
    optEl("TIPO_DOC",            input.TIPO_DOC),
    optEl("DIGITO_VERIFICACION", input.DIGITO_VERIFICACION),
    optEl("NATURALEZA",          input.NATURALEZA),
    // Contact
    optEl("DIRECCION",           input.DIRECCION),
    optEl("CODIGO_DANE_CIUDAD",  input.CODIGO_DANE_CIUDAD),
    optEl("CIUDAD",              input.CIUDAD),
    optEl("DEPARTAMENTO",        input.DEPARTAMENTO),
    optEl("TELEFONO",            input.TELEFONO),
    optEl("EMAIL",               input.EMAIL),
    optEl("EMAIL_FAC_ELECTRONICA", input.EMAIL_FAC_ELECTRONICA),
    // Commercial
    optEl("NIT_VENDEDOR",        input.NIT_VENDEDOR),
    optEl("VENDEDOR",            input.VENDEDOR),
    optEl("TIPO_TERCERO",        input.TIPO_TERCERO),
    optEl("TIPO_CLIENTE",        input.TIPO_CLIENTE),
    optEl("ZONA",                input.ZONA),
    optEl("FORMA_PAGO",          input.FORMA_PAGO),
    optEl("PRECIO_VENTA",        input.PRECIO_VENTA),
    optEl("CREDITO",             input.CREDITO),
    optEl("DIAS_CREDITO",        input.DIAS_CREDITO),
    // Fiscal
    optEl("RETENEDOR",           input.RETENEDOR),
    optEl("IVA",                 input.IVA),
    optEl("RESPONSABILIDAD_FISCAL", input.RESPONSABILIDAD_FISCAL),
    // Status
    optEl("ACTIVO",              input.ACTIVO ?? "S"),
    optEl("ACTIVO_COMERCIAL",    input.ACTIVO_COMERCIAL),
    optEl("ACTIVO_FIJO",         input.ACTIVO_FIJO),
    // Financial defaults
    optEl("COMISION_VENTAS",     input.COMISION_VENTAS),
    optEl("COMISION_COBROS",     input.COMISION_COBROS),
    optEl("DESCUENTO",           input.DESCUENTO),
    optEl("DESCUENTO_PP",        input.DESCUENTO_PP),
  ].filter(Boolean).join("");

  return `<CLIENTES><CLIENTE>${inner}</CLIENTE></CLIENTES>`;
}

// ── Type 3: Tercero ───────────────────────────────────────────────────────────

export function buildTerceroXml(input: SagTerceroInput): string {
  const inner = [
    el("NIT",            input.NIT),
    el("NOMBRE",         input.NOMBRE),
    optEl("CIUDAD",      input.CIUDAD),
    optEl("DEPARTAMENTO",input.DEPARTAMENTO),
    optEl("TELEFONO",    input.TELEFONO),
    optEl("EMAIL",       input.EMAIL),
    optEl("VENDEDOR",    input.VENDEDOR),
    optEl("CREDITO",     input.CREDITO),
    optEl("DIAS_CREDITO",input.DIAS_CREDITO),
    optEl("TIPO_PERSONA",input.TIPO_PERSONA),
    optEl("REGIMEN",     input.REGIMEN),
    optEl("ACTIVO",      input.ACTIVO ?? 1),
  ].filter(Boolean).join("");

  return `<TERCEROS><TERCERO>${inner}</TERCERO></TERCEROS>`;
}
