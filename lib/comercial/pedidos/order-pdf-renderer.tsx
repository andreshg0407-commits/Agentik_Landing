/**
 * lib/comercial/pedidos/order-pdf-renderer.tsx
 *
 * React PDF component tree for order document export.
 * Uses @react-pdf/renderer v4 (server-side rendering via renderToBuffer).
 *
 * NO data fetching here. All data arrives pre-resolved.
 * NO business logic. Pure rendering.
 *
 * SERVER ONLY — import only from API routes or server services.
 *
 * Sprint: COMERCIAL-PEDIDOS-DOCUMENTO-HISTORIAL-03
 * Sprint: COMERCIAL-PEDIDOS-TEST-DATA-06
 * Sprint: ORDER-PDF-BRANDING-01
 */

import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { OrderDraft, OrderLine, OrderStatus } from "./order-types";
import type { OrganizationBrandingData } from "@/lib/tenant/branding";

// ── Props ────────────────────────────────────────────────────────────────────

export interface OrderPdfRenderProps {
  order:            OrderDraft;
  orgDisplayName:   string;
  generatedAt:      Date;
  /** QR code as data URI (base64 PNG) — null if not available */
  qrDataUri?:       string | null;
  /** Discount info — optional */
  discount?:        {
    enabled:    boolean;
    type:       "porcentaje" | "valor_fijo";
    value:      number;
    amount:     number;
    motivo:     string;
    totalFinal: number;
  } | null;
  /** Tenant branding — never null (service provides fallback) */
  branding?:        OrganizationBrandingData;
}

// ── Status label ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<OrderStatus, string> = {
  borrador:          "BORRADOR",
  listo_para_enviar: "LISTO PARA ENVIAR",
  pendiente_sag:     "PENDIENTE SAG",
  sincronizado:      "SINCRONIZADO",
  conflicto:         "CONFLICTO",
  cancelado:         "CANCELADO",
};

// ── Default brand color ──────────────────────────────────────────────────────

const FALLBACK_PRIMARY = "#004AAD";

// ── Styles factory ───────────────────────────────────────────────────────────

function buildStyles(primary: string) {
  return StyleSheet.create({
    page: {
      padding: 40,
      fontFamily: "Helvetica",
      fontSize: 9,
      color: "#1a1a2e",
    },
    // Header
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 20,
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "flex-start",
      maxWidth: "55%",
    },
    logo: {
      width: 60,
      height: 60,
      marginRight: 10,
      objectFit: "contain" as any,
    },
    orgIdentity: {
      flexDirection: "column",
      justifyContent: "flex-start",
    },
    orgName: {
      fontSize: 14,
      fontFamily: "Helvetica-Bold",
      color: primary,
    },
    orgDetail: {
      fontSize: 7,
      color: "#6b7280",
      marginTop: 1,
    },
    orderTitle: {
      fontSize: 16,
      fontFamily: "Helvetica-Bold",
      textAlign: "right",
      color: primary,
    },
    orderMeta: {
      fontSize: 8,
      color: "#6b7280",
      textAlign: "right",
      marginTop: 2,
    },
    // Status badge
    statusBadge: {
      fontSize: 8,
      fontFamily: "Helvetica-Bold",
      padding: "3 8",
      borderRadius: 3,
      textAlign: "right",
      alignSelf: "flex-end",
      marginTop: 4,
    },
    statusBorrador: {
      backgroundColor: "#f3f4f6",
      color: "#6b7280",
    },
    statusSynced: {
      backgroundColor: "#dcfce7",
      color: "#16a34a",
    },
    statusPending: {
      backgroundColor: "#fef3c7",
      color: "#d97706",
    },
    statusConflict: {
      backgroundColor: "#fee2e2",
      color: "#dc2626",
    },
    // Divider
    divider: {
      borderBottom: `2 solid ${primary}`,
      marginBottom: 16,
    },
    // Customer section
    section: {
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 10,
      fontFamily: "Helvetica-Bold",
      color: primary,
      marginBottom: 6,
      borderBottom: "1 solid #e5e7eb",
      paddingBottom: 3,
    },
    clientGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    clientCell: {
      width: "50%",
      marginBottom: 4,
    },
    infoRow: {
      flexDirection: "row",
      marginBottom: 2,
    },
    infoLabel: {
      fontSize: 7,
      color: "#6b7280",
      width: 80,
    },
    infoValue: {
      fontSize: 9,
      fontFamily: "Helvetica-Bold",
    },
    // Lines table
    tableHeader: {
      flexDirection: "row",
      backgroundColor: "#f8fafc",
      borderBottom: `1 solid ${primary}`,
      paddingVertical: 4,
      paddingHorizontal: 4,
    },
    tableRow: {
      flexDirection: "row",
      borderBottom: "1 solid #f1f5f9",
      paddingVertical: 3,
      paddingHorizontal: 4,
    },
    colRef:   { width: "15%" },
    colName:  { width: "23%" },
    colColor: { width: "12%", textAlign: "center" },
    colSize:  { width: "10%", textAlign: "center" },
    colQty:   { width: "10%", textAlign: "right" },
    colPrice: { width: "15%", textAlign: "right" },
    colTotal: { width: "15%", textAlign: "right" },
    headerText: {
      fontSize: 7,
      fontFamily: "Helvetica-Bold",
      color: "#6b7280",
      textTransform: "uppercase",
    },
    cellText: {
      fontSize: 8,
    },
    cellBold: {
      fontSize: 8,
      fontFamily: "Helvetica-Bold",
    },
    // Summary strip
    summaryStrip: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 16,
      marginTop: 6,
      paddingVertical: 4,
      paddingHorizontal: 4,
      backgroundColor: "#f8fafc",
      borderRadius: 3,
    },
    summaryItem: {
      fontSize: 8,
      color: "#6b7280",
    },
    summaryValue: {
      fontSize: 8,
      fontFamily: "Helvetica-Bold",
      color: "#1a1a2e",
    },
    // Totals
    totalsRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginTop: 8,
      paddingTop: 6,
      borderTop: `2 solid ${primary}`,
    },
    totalLabel: {
      fontSize: 10,
      fontFamily: "Helvetica-Bold",
      color: "#6b7280",
      marginRight: 16,
    },
    totalValue: {
      fontSize: 12,
      fontFamily: "Helvetica-Bold",
      color: primary,
    },
    // Discount
    discountRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginTop: 4,
    },
    discountLabel: {
      fontSize: 9,
      color: "#dc2626",
      marginRight: 16,
    },
    discountValue: {
      fontSize: 10,
      fontFamily: "Helvetica-Bold",
      color: "#dc2626",
    },
    finalRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginTop: 4,
      paddingTop: 4,
      borderTop: "1 solid #e5e7eb",
    },
    finalLabel: {
      fontSize: 11,
      fontFamily: "Helvetica-Bold",
      color: "#1a1a2e",
      marginRight: 16,
    },
    finalValue: {
      fontSize: 14,
      fontFamily: "Helvetica-Bold",
      color: "#16a34a",
    },
    // Future totals (subtotal, descuento, IVA, total final)
    futureTotalRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginTop: 2,
    },
    futureTotalLabel: {
      fontSize: 9,
      color: "#9ca3af",
      marginRight: 16,
      width: 100,
      textAlign: "right",
    },
    futureTotalValue: {
      fontSize: 9,
      color: "#9ca3af",
      width: 80,
      textAlign: "right",
    },
    // Notes
    notes: {
      fontSize: 8,
      color: "#6b7280",
      fontStyle: "italic",
      marginTop: 4,
    },
    // QR + Journey footer
    qrSection: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      marginTop: 20,
      paddingTop: 10,
      borderTop: "1 solid #e5e7eb",
    },
    qrImage: {
      width: 80,
      height: 80,
    },
    journeyId: {
      fontSize: 7,
      color: "#9ca3af",
      marginTop: 4,
    },
    // Footer
    footer: {
      position: "absolute",
      bottom: 30,
      left: 40,
      right: 40,
      fontSize: 7,
      color: "#9ca3af",
      borderTop: `1 solid ${primary}`,
      paddingTop: 6,
    },
    footerLine: {
      fontSize: 7,
      color: "#9ca3af",
      marginBottom: 1,
    },
    footerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 2,
    },
    // Watermark for drafts
    watermark: {
      position: "absolute",
      top: "40%",
      left: "15%",
      fontSize: 60,
      fontFamily: "Helvetica-Bold",
      color: "#e5e7eb",
      opacity: 0.3,
      transform: "rotate(-30deg)",
    },
  });
}

// ── Status badge style resolver ──────────────────────────────────────────────

function getStatusStyle(
  status: OrderStatus,
  s: ReturnType<typeof buildStyles>,
) {
  switch (status) {
    case "sincronizado":      return s.statusSynced;
    case "pendiente_sag":
    case "listo_para_enviar": return s.statusPending;
    case "conflicto":         return s.statusConflict;
    default:                  return s.statusBorrador;
  }
}

// ── Currency formatter ───────────────────────────────────────────────────────

function money(v: number): string {
  return "$" + v.toLocaleString("es-CO");
}

// ── Document component ───────────────────────────────────────────────────────

export function OrderPdfDocument({
  order,
  orgDisplayName,
  generatedAt,
  qrDataUri,
  discount,
  branding,
}: OrderPdfRenderProps) {
  const b = branding;
  const primary = b?.primaryColor || FALLBACK_PRIMARY;
  const s = buildStyles(primary);

  const activeLines = order.lines.filter(l => !l.removed);
  const isDraft = order.status === "borrador";
  const dateStr = generatedAt.toLocaleDateString("es-CO", {
    year: "numeric", month: "long", day: "numeric",
  });
  const timeStr = generatedAt.toLocaleTimeString("es-CO", {
    hour: "2-digit", minute: "2-digit",
  });

  const hasExternalDiscount = discount?.enabled && discount.amount > 0;
  const hasOrderDiscount = (order.summary.discountAmount ?? 0) > 0;
  const hasDiscount = hasExternalDiscount || hasOrderDiscount;

  // Compute unique references
  const uniqueRefs = new Set(activeLines.map(l => l.referenceCode)).size;

  // Branding fields with fallbacks
  const commercialName = b?.commercialName || orgDisplayName;
  const legalName      = b?.legalName || "";
  const taxId          = b?.taxId || "";
  const city           = b?.city || "";
  const phone          = b?.phone || "";
  const website        = b?.website || "";
  const logoUrl        = b?.logoUrl || "";
  const documentFooter = b?.documentFooter || `Documento generado por Agentik para ${orgDisplayName}.`;

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        {/* Draft watermark */}
        {isDraft && (
          <Text style={s.watermark}>BORRADOR</Text>
        )}

        {/* ── Header ─────────────────────────────────────────── */}
        <View style={s.headerRow}>
          <View style={s.headerLeft}>
            {logoUrl ? (
              <Image src={logoUrl} style={s.logo} />
            ) : null}
            <View style={s.orgIdentity}>
              <Text style={s.orgName}>{commercialName}</Text>
              {legalName && legalName !== commercialName && (
                <Text style={s.orgDetail}>{legalName}</Text>
              )}
              {taxId ? <Text style={s.orgDetail}>NIT: {taxId}</Text> : null}
              {city ? <Text style={s.orgDetail}>{city}</Text> : null}
              {phone ? <Text style={s.orgDetail}>Tel: {phone}</Text> : null}
              {website ? <Text style={s.orgDetail}>{website}</Text> : null}
            </View>
          </View>
          <View>
            <Text style={s.orderTitle}>PEDIDO COMERCIAL</Text>
            <Text style={s.orderMeta}>#{order.consecutivo}</Text>
            <Text style={s.orderMeta}>{dateStr}</Text>
            {order.sagOrderId && (
              <Text style={s.orderMeta}>SAG: {order.sagOrderId}</Text>
            )}
            <View style={[s.statusBadge, getStatusStyle(order.status, s)]}>
              <Text>{STATUS_LABEL[order.status]}</Text>
            </View>
          </View>
        </View>

        {/* Brand divider */}
        <View style={s.divider} />

        {/* ── Customer info ──────────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Cliente</Text>
          <View style={s.clientGrid}>
            <View style={s.clientCell}>
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Nombre</Text>
                <Text style={s.infoValue}>{order.header.customerName || "\u2014"}</Text>
              </View>
            </View>
            <View style={s.clientCell}>
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>NIT</Text>
                <Text style={s.infoValue}>{order.header.customerCode || "\u2014"}</Text>
              </View>
            </View>
            <View style={s.clientCell}>
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Vendedor</Text>
                <Text style={s.infoValue}>{order.header.sellerName || "\u2014"}</Text>
              </View>
            </View>
            <View style={s.clientCell}>
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Canal</Text>
                <Text style={s.infoValue}>{order.header.channel || "\u2014"}</Text>
              </View>
            </View>
            {(order.header as any).customerCity && (
              <View style={s.clientCell}>
                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>Ciudad</Text>
                  <Text style={s.infoValue}>{(order.header as any).customerCity}</Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* ── Lines table ────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>
            Detalle ({activeLines.length} {activeLines.length === 1 ? "linea" : "lineas"})
          </Text>

          {/* Table header */}
          <View style={s.tableHeader}>
            <Text style={[s.headerText, s.colRef]}>Referencia</Text>
            <Text style={[s.headerText, s.colName]}>Descripcion</Text>
            <Text style={[s.headerText, s.colColor]}>Color</Text>
            <Text style={[s.headerText, s.colSize]}>Talla</Text>
            <Text style={[s.headerText, s.colQty]}>Cant.</Text>
            <Text style={[s.headerText, s.colPrice]}>P. Unit.</Text>
            <Text style={[s.headerText, s.colTotal]}>Total</Text>
          </View>

          {/* Table rows */}
          {activeLines.map((line: OrderLine) => (
            <View key={line.id} style={s.tableRow}>
              <Text style={[s.cellBold, s.colRef]}>{line.referenceCode}</Text>
              <Text style={[s.cellText, s.colName]}>{line.productName}</Text>
              <Text style={[s.cellText, s.colColor]}>{line.color}</Text>
              <Text style={[s.cellText, s.colSize]}>{line.size}</Text>
              <Text style={[s.cellBold, s.colQty]}>{line.quantity}</Text>
              <Text style={[s.cellText, s.colPrice]}>{money(line.unitPrice)}</Text>
              <Text style={[s.cellBold, s.colTotal]}>{money(line.lineTotal)}</Text>
            </View>
          ))}
        </View>

        {/* ── Summary strip ──────────────────────────────────── */}
        <View style={s.summaryStrip}>
          <Text style={s.summaryItem}>
            Referencias: <Text style={s.summaryValue}>{uniqueRefs}</Text>
          </Text>
          <Text style={s.summaryItem}>
            Variantes: <Text style={s.summaryValue}>{activeLines.length}</Text>
          </Text>
          <Text style={s.summaryItem}>
            Unidades: <Text style={s.summaryValue}>{order.summary.totalUnits}</Text>
          </Text>
        </View>

        {/* ── Totals ─────────────────────────────────────────── */}
        <View style={s.totalsRow}>
          <Text style={s.totalLabel}>
            {hasDiscount ? "Subtotal" : "Total"}
          </Text>
          <Text style={s.totalValue}>
            {money(order.summary.totalValue)}
          </Text>
        </View>

        {/* Discount (if applicable) */}
        {hasDiscount && (
          <>
            <View style={s.discountRow}>
              <Text style={s.discountLabel}>
                {hasExternalDiscount && discount
                  ? `Descuento${discount.type === "porcentaje" ? ` (${discount.value}%)` : ""}${discount.motivo ? ` — ${discount.motivo}` : ""}`
                  : `Descuento${order.header.discountType === "percentage" ? ` (${order.header.discountValue}%)` : ""}`
                }
              </Text>
              <Text style={s.discountValue}>
                -{money(hasExternalDiscount && discount ? discount.amount : (order.summary.discountAmount ?? 0))}
              </Text>
            </View>
            <View style={s.finalRow}>
              <Text style={s.finalLabel}>Total final</Text>
              <Text style={s.finalValue}>
                {money(hasExternalDiscount && discount ? discount.totalFinal : (order.summary.totalFinal ?? order.summary.totalValue))}
              </Text>
            </View>
          </>
        )}

        {/* Future-ready totals (show zeros for IVA placeholders) */}
        {!hasDiscount && (
          <>
            <View style={s.futureTotalRow}>
              <Text style={s.futureTotalLabel}>Descuento</Text>
              <Text style={s.futureTotalValue}>{money(0)}</Text>
            </View>
            <View style={s.futureTotalRow}>
              <Text style={s.futureTotalLabel}>IVA</Text>
              <Text style={s.futureTotalValue}>{money(0)}</Text>
            </View>
            <View style={s.futureTotalRow}>
              <Text style={s.futureTotalLabel}>Total final</Text>
              <Text style={{
                ...s.futureTotalValue,
                fontFamily: "Helvetica-Bold",
                color: "#1a1a2e",
                fontSize: 10,
              }}>
                {money(order.summary.totalValue)}
              </Text>
            </View>
          </>
        )}

        {/* Commercial conditions (ORDER-CREATION-POLISH-01) */}
        {(order.header.deliveryMode === "scheduled" || (order.header.discountValue ?? 0) > 0 || order.header.customerNotes) && (
          <View style={[s.section, { marginTop: 12 }]}>
            <Text style={s.sectionTitle}>Condiciones comerciales</Text>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Entrega</Text>
              <Text style={s.infoValue}>
                {order.header.deliveryMode === "scheduled" ? "Programada" : "Inmediata"}
              </Text>
            </View>
            {order.header.deliveryMode === "scheduled" && order.header.deliveryDate && (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Fecha compromiso</Text>
                <Text style={s.infoValue}>{order.header.deliveryDate}</Text>
              </View>
            )}
            {(order.header.discountValue ?? 0) > 0 && (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Descuento</Text>
                <Text style={s.infoValue}>
                  {order.header.discountType === "percentage"
                    ? `${order.header.discountValue}%`
                    : money(order.header.discountValue ?? 0)}
                </Text>
              </View>
            )}
            {order.header.customerNotes && (
              <>
                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>Observaciones</Text>
                  <Text style={s.infoValue}>{order.header.customerNotes}</Text>
                </View>
              </>
            )}
          </View>
        )}

        {/* Legacy notes field (backward compat) */}
        {order.header.notes && !order.header.customerNotes && (
          <View style={[s.section, { marginTop: 12 }]}>
            <Text style={s.sectionTitle}>Observaciones</Text>
            <Text style={s.notes}>{order.header.notes}</Text>
          </View>
        )}

        {/* QR code + Commercial Journey ID */}
        <View style={s.qrSection}>
          <View>
            {order.commercialJourneyId && (
              <Text style={s.journeyId}>
                Ref. comercial: {order.commercialJourneyId}
              </Text>
            )}
            {order.externalSyncKey && (
              <Text style={s.journeyId}>
                Clave sync: {order.externalSyncKey}
              </Text>
            )}
          </View>
          {qrDataUri && (
            <Image src={qrDataUri} style={s.qrImage} />
          )}
        </View>

        {/* ── Footer ─────────────────────────────────────────── */}
        <View style={s.footer} fixed>
          <Text style={s.footerLine}>{documentFooter}</Text>
          <View style={s.footerRow}>
            <Text>Generado por Agentik · {dateStr} {timeStr}</Text>
            <Text>Pedido #{order.consecutivo}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
