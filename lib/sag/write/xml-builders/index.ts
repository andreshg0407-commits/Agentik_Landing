/**
 * XML builder registry.
 *
 * Maps each SagWriteType to its builder function.
 * Called by queue.ts when an operation is queued — the generated XML is
 * stored immediately so reviewers can inspect what will be sent to SAG.
 */

import { SAG_WRITE_TYPE }         from "../types";
import type { SagWriteInput }     from "../types";
import { buildCustomerXml, buildTerceroXml } from "./customer";
import { buildProductXml }        from "./product";
import { buildDocumentXml, buildGenericDocumentXml } from "./document";
import { buildReceiptXml }        from "./receipt";

export function buildXml(input: SagWriteInput): string {
  switch (input.type) {
    case SAG_WRITE_TYPE.UPSERT_CUSTOMER:    return buildCustomerXml(input.payload);
    case SAG_WRITE_TYPE.UPSERT_TERCERO:     return buildTerceroXml(input.payload);
    case SAG_WRITE_TYPE.UPSERT_PRODUCT:     return buildProductXml(input.payload);
    case SAG_WRITE_TYPE.CREATE_DOCUMENT:    return buildDocumentXml(input.payload);
    case SAG_WRITE_TYPE.CREATE_GENERIC_DOC: return buildGenericDocumentXml(input.payload);
    case SAG_WRITE_TYPE.CREATE_RECEIPT:     return buildReceiptXml(input.payload);
    default:
      throw new Error(`SAG_XML_BUILDER: unknown write type "${(input as { type: number }).type}"`);
  }
}

// Re-export individual builders for direct use in tests
export {
  buildCustomerXml,
  buildTerceroXml,
  buildProductXml,
  buildDocumentXml,
  buildGenericDocumentXml,
  buildReceiptXml,
};
