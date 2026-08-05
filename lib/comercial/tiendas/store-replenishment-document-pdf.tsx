/**
 * lib/comercial/tiendas/store-replenishment-document-pdf.tsx
 *
 * AGENTIK-STORES-SUPPLY-PLAN-RESERVATION-01 — Server-side PDF renderer.
 *
 * Renders a ReplenishmentDocumentSnapshot as a PDF binary using @react-pdf/renderer.
 * Same data as the HTML renderer — different output format.
 *
 * SERVER ONLY.
 */

import "server-only";

import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { ReplenishmentDocumentSnapshot } from "./store-replenishment-document-types";
import { REPLENISHMENT_DOCUMENT_STATUS_LABEL } from "./store-replenishment-document-types";
import type { ReplenishmentDocumentStatus } from "./store-replenishment-document-types";

// ── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: "Helvetica", color: "#111" },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: "#111", paddingBottom: 8, marginBottom: 12 },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  docNum: { fontSize: 13, fontFamily: "Courier-Bold" },
  meta: { fontSize: 7, color: "#444", marginTop: 3 },
  badge: { borderWidth: 1, borderColor: "#111", paddingHorizontal: 6, paddingVertical: 2, fontSize: 8, fontFamily: "Helvetica-Bold", marginTop: 3, alignSelf: "flex-start" },
  watermark: { position: "absolute", top: 300, left: 120, fontSize: 60, color: "#ddd", fontFamily: "Helvetica-Bold", transform: "rotate(-30deg)", opacity: 0.4 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 4, borderBottomWidth: 0.5, borderBottomColor: "#999", paddingBottom: 2 },
  table: { marginTop: 2 },
  headerRow: { flexDirection: "row", backgroundColor: "#eee", borderBottomWidth: 1, borderBottomColor: "#bbb" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ddd" },
  th: { fontSize: 7, fontFamily: "Helvetica-Bold", padding: 3, textTransform: "uppercase" as const },
  td: { fontSize: 8, padding: 3 },
  tdNum: { fontSize: 8, padding: 3, textAlign: "right", fontVariant: ["tabular-nums"] as any },
  tdMono: { fontSize: 8, padding: 3, fontFamily: "Courier" },
  empty: { color: "#666", fontStyle: "italic", paddingVertical: 4, fontSize: 8 },
  totals: { flexDirection: "row", gap: 14, marginTop: 8, fontSize: 9 },
  totalLabel: { fontSize: 9 },
  totalValue: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  scarcity: { marginTop: 6, fontSize: 8, color: "#7a3b00" },
  firmas: { flexDirection: "row", gap: 30, marginTop: 24 },
  firma: { flex: 1, borderTopWidth: 1, borderTopColor: "#111", paddingTop: 3, textAlign: "center", fontSize: 8 },
  footer: { marginTop: 14, fontSize: 7, color: "#666", borderTopWidth: 0.5, borderTopColor: "#ccc", paddingTop: 4 },
});

const CANDIDATE_TYPE_LABEL: Record<string, string> = {
  REPOSICION_MISMA_REFERENCIA: "Reposicion",
  COMPLEMENTO_REFERENCIA_COMPATIBLE: "Complemento",
  REFERENCIA_NUEVA_COMPATIBLE: "Ref. nueva",
};

const UNALLOCATED_REASON_LABEL: Record<string, string> = {
  SIN_DATOS_DISPONIBILIDAD: "Sin datos disponibilidad",
  SIN_DISPONIBILIDAD: "Sin stock en bodega",
  POOL_AGOTADO: "Pool agotado",
};

// ── Column widths ───────────────────────────────────────────────────────────

const SUGG_COLS = [
  { w: "5%", label: "#" },
  { w: "14%", label: "Referencia" },
  { w: "24%", label: "Producto" },
  { w: "15%", label: "Estructura" },
  { w: "12%", label: "Tipo" },
  { w: "8%", label: "Unds" },
  { w: "22%", label: "Justificacion" },
];

const WITHDRAW_COLS = [
  { w: "5%", label: "#" },
  { w: "25%", label: "Pieza" },
  { w: "20%", label: "Regla" },
  { w: "10%", label: "Unds" },
  { w: "40%", label: "Instruccion" },
];

const UNALLOC_COLS = [
  { w: "5%", label: "#" },
  { w: "20%", label: "Estructura" },
  { w: "12%", label: "Requerido" },
  { w: "12%", label: "Ejecutable" },
  { w: "12%", label: "Asignado" },
  { w: "12%", label: "Pendiente" },
  { w: "27%", label: "Causa" },
];

// ── PDF Document ────────────────────────────────────────────────────────────

function ReplenishmentPdfDocument({
  snapshot,
  status,
}: {
  snapshot: ReplenishmentDocumentSnapshot;
  status: ReplenishmentDocumentStatus;
}) {
  const fechaDoc = snapshot.documentGeneratedAt.slice(0, 10);
  const fechaPlan = snapshot.planGeneratedAt.slice(0, 16).replace("T", " ");
  const isDraft = status === "BORRADOR";

  return (
    <Document>
      <Page size="LETTER" style={s.page} wrap>
        {isDraft && <Text style={s.watermark}>BORRADOR</Text>}

        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.title}>Documento de Surtido — {snapshot.storeName}</Text>
            <Text style={s.meta}>
              Documento: {fechaDoc} | Plan: {fechaPlan} | Por: {snapshot.generatedBy} | Corrida: {snapshot.batchId}
            </Text>
            <Text style={s.badge}>{REPLENISHMENT_DOCUMENT_STATUS_LABEL[status]}</Text>
          </View>
          <Text style={s.docNum}>{snapshot.documentNumber}</Text>
        </View>

        {/* 1. Suggestions */}
        <Text style={s.sectionTitle}>
          1. Reposiciones ({snapshot.suggestions.length} sugerencias · {snapshot.summary.allocatedUnits} unidades)
        </Text>
        {snapshot.suggestions.length > 0 ? (
          <View style={s.table}>
            <View style={s.headerRow}>
              {SUGG_COLS.map(c => (
                <Text key={c.label} style={{ ...s.th, width: c.w }}>{c.label}</Text>
              ))}
            </View>
            {snapshot.suggestions.map((sg, i) => (
              <View key={i} style={s.row} wrap={false}>
                <Text style={{ ...s.td, width: SUGG_COLS[0].w }}>{i + 1}</Text>
                <Text style={{ ...s.tdMono, width: SUGG_COLS[1].w }}>{sg.referenceCode}</Text>
                <Text style={{ ...s.td, width: SUGG_COLS[2].w }}>{sg.productName}</Text>
                <Text style={{ ...s.td, width: SUGG_COLS[3].w }}>{sg.structureKey}</Text>
                <Text style={{ ...s.td, width: SUGG_COLS[4].w }}>
                  {CANDIDATE_TYPE_LABEL[sg.candidateType] ?? sg.candidateType}
                </Text>
                <Text style={{ ...s.tdNum, width: SUGG_COLS[5].w }}>{sg.units}</Text>
                <Text style={{ ...s.td, width: SUGG_COLS[6].w, fontSize: 7 }}>
                  {sg.reasons.map(r => r.detail).join("; ")}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={s.empty}>Sin reposiciones para esta tienda en esta corrida.</Text>
        )}

        {/* 2. Withdrawals */}
        <Text style={s.sectionTitle}>
          2. Retiros ({snapshot.withdrawals.length} · {snapshot.summary.withdrawalUnits} unidades)
        </Text>
        {snapshot.withdrawals.length > 0 ? (
          <View style={s.table}>
            <View style={s.headerRow}>
              {WITHDRAW_COLS.map(c => (
                <Text key={c.label} style={{ ...s.th, width: c.w }}>{c.label}</Text>
              ))}
            </View>
            {snapshot.withdrawals.map((w, i) => (
              <View key={i} style={s.row} wrap={false}>
                <Text style={{ ...s.td, width: WITHDRAW_COLS[0].w }}>{i + 1}</Text>
                <Text style={{ ...s.td, width: WITHDRAW_COLS[1].w }}>{w.label}</Text>
                <Text style={{ ...s.td, width: WITHDRAW_COLS[2].w }}>{w.structureKey}</Text>
                <Text style={{ ...s.tdNum, width: WITHDRAW_COLS[3].w }}>{w.requiredUnits}</Text>
                <Text style={{ ...s.td, width: WITHDRAW_COLS[4].w }}>
                  Presencia no autorizada — retirar y devolver a bodega principal
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={s.empty}>Sin retiros pendientes.</Text>
        )}

        {/* 3. Unallocated */}
        <Text style={s.sectionTitle}>3. Necesidades no asignadas (transparencia del faltante)</Text>
        {snapshot.unallocated.length > 0 ? (
          <View style={s.table}>
            <View style={s.headerRow}>
              {UNALLOC_COLS.map(c => (
                <Text key={c.label} style={{ ...s.th, width: c.w }}>{c.label}</Text>
              ))}
            </View>
            {snapshot.unallocated.map((u, i) => (
              <View key={i} style={s.row} wrap={false}>
                <Text style={{ ...s.td, width: UNALLOC_COLS[0].w }}>{i + 1}</Text>
                <Text style={{ ...s.td, width: UNALLOC_COLS[1].w }}>{u.structureKey}</Text>
                <Text style={{ ...s.tdNum, width: UNALLOC_COLS[2].w }}>{u.requiredUnits}</Text>
                <Text style={{ ...s.tdNum, width: UNALLOC_COLS[3].w }}>{u.executableUnits}</Text>
                <Text style={{ ...s.tdNum, width: UNALLOC_COLS[4].w }}>{u.allocatedUnits}</Text>
                <Text style={{ ...s.tdNum, width: UNALLOC_COLS[5].w }}>{u.totalPendingUnits}</Text>
                <Text style={{ ...s.td, width: UNALLOC_COLS[6].w }}>
                  {UNALLOCATED_REASON_LABEL[u.reason] ?? u.reason}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={s.empty}>Todas las necesidades ejecutables quedaron asignadas.</Text>
        )}

        {/* Totals */}
        <View style={s.totals}>
          <View>
            <Text style={s.totalLabel}>Requerido</Text>
            <Text style={s.totalValue}>{snapshot.summary.requiredUnits}</Text>
          </View>
          <View>
            <Text style={s.totalLabel}>Ejecutable</Text>
            <Text style={s.totalValue}>{snapshot.summary.executableUnits}</Text>
          </View>
          <View>
            <Text style={s.totalLabel}>Asignado</Text>
            <Text style={s.totalValue}>{snapshot.summary.allocatedUnits}</Text>
          </View>
          <View>
            <Text style={s.totalLabel}>Pendiente</Text>
            <Text style={s.totalValue}>{snapshot.summary.allocationPendingUnits}</Text>
          </View>
          <View>
            <Text style={s.totalLabel}>Retiros</Text>
            <Text style={s.totalValue}>{snapshot.summary.withdrawalUnits}</Text>
          </View>
        </View>

        {snapshot.scarcityAffectedThisStore && (
          <Text style={s.scarcity}>
            Esta tienda quedo con necesidades sin asignar por escasez del pool compartido.
          </Text>
        )}

        {/* Signatures */}
        <View style={s.firmas}>
          <View style={s.firma}><Text>Preparo (Bodega)</Text></View>
          <View style={s.firma}><Text>Despacho</Text></View>
          <View style={s.firma}><Text>Recibio (Tienda)</Text></View>
        </View>

        {/* Footer */}
        <Text style={s.footer}>
          {snapshot.documentNumber} — Documento generado por Agentik desde el plan certificado de surtido.
        </Text>
      </Page>
    </Document>
  );
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Renders a ReplenishmentDocumentSnapshot as a PDF buffer.
 * Uses the persisted snapshot exclusively — no live data.
 */
export async function renderReplenishmentDocumentPdf(
  snapshot: ReplenishmentDocumentSnapshot,
  status: ReplenishmentDocumentStatus,
): Promise<Buffer> {
  const buffer = await renderToBuffer(
    <ReplenishmentPdfDocument snapshot={snapshot} status={status} />,
  );
  return Buffer.from(buffer);
}
