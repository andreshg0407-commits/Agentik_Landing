/**
 * lib/comercial/pedidos/order-qr-service.ts
 *
 * Generates a QR code PNG for an order.
 * The QR encodes only the internal order URL — no secrets, no org IDs.
 *
 * SERVER ONLY — never import from client components.
 *
 * Sprint: COMERCIAL-PEDIDOS-TEST-DATA-06
 */

import "server-only";
import QRCode from "qrcode";

// ── Constants ────────────────────────────────────────────────────────────────

const QR_SIZE_PX = 200;
const QR_MARGIN  = 1;

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a QR PNG buffer encoding the order URL.
 * Returns a base64 data URI suitable for embedding in @react-pdf/renderer Image.
 */
export async function generateOrderQrDataUri(
  orgSlug:  string,
  orderId:  string,
  baseUrl:  string,
): Promise<string> {
  const orderUrl = `${baseUrl.replace(/\/$/, "")}/${orgSlug}/comercial/pedidos/${orderId}`;
  const dataUri  = await QRCode.toDataURL(orderUrl, {
    width:                QR_SIZE_PX,
    margin:               QR_MARGIN,
    errorCorrectionLevel: "H",
    color: { dark: "#000000", light: "#FFFFFF" },
  });
  return dataUri;
}

/**
 * Build the order URL without generating the QR.
 */
export function buildOrderUrl(
  orgSlug: string,
  orderId: string,
  baseUrl: string,
): string {
  return `${baseUrl.replace(/\/$/, "")}/${orgSlug}/comercial/pedidos/${orderId}`;
}
