/**
 * lib/comercial/pedidos/order-pdf-service.ts
 *
 * Orchestrates order PDF generation:
 *   1. Load order from DB
 *   2. Resolve org display name
 *   3. Render via OrderPdfDocument + renderToBuffer
 *   4. Return Buffer (no persistence — generated on demand)
 *
 * SERVER ONLY — never import from client components.
 *
 * Sprint: COMERCIAL-PEDIDOS-DOCUMENTO-HISTORIAL-03
 * Sprint: COMERCIAL-PEDIDOS-TEST-DATA-06
 * Sprint: ORDER-PDF-BRANDING-01
 */

import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { getOrder } from "./order-service";
import { OrderPdfDocument } from "./order-pdf-renderer";
import type { OrderPdfRenderProps } from "./order-pdf-renderer";
import { generateOrderQrDataUri } from "./order-qr-service";
import { getOrganizationBranding } from "@/lib/tenant/branding";

// ── Result type ──────────────────────────────────────────────────────────────

export interface OrderPdfExportResult {
  buffer:       Buffer;
  fileName:     string;
  orderNumber:  number;
  generatedAt:  Date;
}

// ── Main export function ─────────────────────────────────────────────────────

export async function exportOrderPdf(
  orgId:   string,
  orderId: string,
  opts?: {
    orgSlug?: string;
    baseUrl?: string;
    discount?: OrderPdfRenderProps["discount"];
  },
): Promise<OrderPdfExportResult | null> {
  // 1. Load order
  const order = await getOrder(orgId, orderId);
  if (!order) return null;

  // 2. Resolve org display name + slug + branding
  let orgDisplayName = "Agentik";
  let orgSlug = opts?.orgSlug ?? "";
  try {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true, slug: true },
    });
    if (org?.name) orgDisplayName = org.name;
    if (!orgSlug && org?.slug) orgSlug = org.slug;
  } catch {
    // Fall back to "Agentik"
  }

  // 2b. Load tenant branding (never null — falls back to defaults)
  const branding = await getOrganizationBranding(orgId);

  // 3. Generate QR code data URI
  let qrDataUri: string | null = null;
  if (orgSlug) {
    const baseUrl = opts?.baseUrl || process.env.NEXT_PUBLIC_APP_URL || "https://app.agentik.co";
    try {
      qrDataUri = await generateOrderQrDataUri(orgSlug, orderId, baseUrl);
    } catch {
      // QR generation is non-critical — degrade silently
    }
  }

  // 4. Render PDF
  const generatedAt = new Date();
  const props: OrderPdfRenderProps = {
    order,
    orgDisplayName,
    generatedAt,
    qrDataUri,
    discount: opts?.discount ?? null,
    branding,
  };

  const element = React.createElement(OrderPdfDocument, props);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(element as any);

  // 5. Return result
  const statusSuffix = order.status === "borrador" ? "_borrador" : "";
  const fileName = `pedido_${order.consecutivo}${statusSuffix}.pdf`;

  return {
    buffer: Buffer.from(buffer),
    fileName,
    orderNumber: order.consecutivo,
    generatedAt,
  };
}

// ── WhatsApp share text builder ──────────────────────────────────────────────

export function buildWhatsAppShareText(
  orgDisplayName: string,
  orderNumber:    number,
  customerName:   string,
  totalUnits:     number,
  totalValue:     number,
  status:         string,
): string {
  const statusLabel = status === "borrador" ? " (Borrador)" : "";
  return [
    `${orgDisplayName} - Pedido #${orderNumber}${statusLabel}`,
    `Cliente: ${customerName}`,
    `${totalUnits} unidades · $${totalValue.toLocaleString()}`,
    ``,
    `Generado desde Agentik.`,
  ].join("\n");
}
