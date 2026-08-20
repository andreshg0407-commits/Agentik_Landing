/**
 * lib/comercial/maletas/coverage-report-pdf-renderer.tsx
 *
 * React PDF component for coverage report.
 * Uses @react-pdf/renderer v4 (server-side rendering via renderToBuffer).
 *
 * NO data fetching. All data arrives pre-resolved via CoverageReportPayload.
 * NO business logic. Pure rendering.
 *
 * SERVER ONLY — import only from API routes or server services.
 *
 * MALETAS-COBERTURA-REPORT-08B2R4A
 */

import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";
import type { CoverageReportPayload, CoverageReportPosition } from "./coverage-report-payload";

// ── Colors ───────────────────────────────────────────────────────────────────

const COLOR = {
  brand: "#004AAD",
  green: "#16a34a",
  amber: "#d97706",
  red: "#dc2626",
  inkDark: "#1a1a2e",
  inkFaint: "#9ca3af",
  line: "#e5e7eb",
  surface: "#f8fafc",
  white: "#ffffff",
  warning: "#fef3c7",
  warningBorder: "#f59e0b",
};

const STATUS_COLOR: Record<string, string> = {
  B01_AVAILABLE: COLOR.green,
  OP_INCOMING: COLOR.brand,
  PRODUCTION_REQUIRED: COLOR.red,
  IMPORT_UNAVAILABLE: COLOR.inkFaint,
  DATA_UNVERIFIED: COLOR.amber,
};

const STATUS_LABEL: Record<string, string> = {
  B01_AVAILABLE: "Disponible B01",
  OP_INCOMING: "OP activa (B04)",
  PRODUCTION_REQUIRED: "Requiere produccion",
  IMPORT_UNAVAILABLE: "Import sin disponib.",
  DATA_UNVERIFIED: "Datos sin verificar",
};

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    padding: 36,
    fontFamily: "Helvetica",
    fontSize: 8,
    color: COLOR.inkDark,
  },
  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    borderBottom: `2px solid ${COLOR.brand}`,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: COLOR.brand,
  },
  headerSub: {
    fontSize: 8,
    color: COLOR.inkFaint,
    marginTop: 2,
  },
  headerRight: {
    alignItems: "flex-end",
  },
  // Warning banner
  warningBanner: {
    backgroundColor: COLOR.warning,
    border: `1px solid ${COLOR.warningBorder}`,
    borderRadius: 3,
    padding: 8,
    marginBottom: 12,
  },
  warningText: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: COLOR.amber,
  },
  // Summary strip
  summaryStrip: {
    flexDirection: "row",
    marginBottom: 14,
    gap: 6,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: COLOR.surface,
    border: `1px solid ${COLOR.line}`,
    borderRadius: 3,
    padding: 8,
    alignItems: "center",
  },
  summaryValue: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
  },
  summaryLabel: {
    fontSize: 7,
    color: COLOR.inkFaint,
    marginTop: 2,
    textAlign: "center",
  },
  // Meta grid
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 14,
    gap: 4,
  },
  metaItem: {
    width: "32%",
    marginBottom: 4,
  },
  metaLabel: {
    fontSize: 7,
    color: COLOR.inkFaint,
  },
  metaValue: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
  // Section header
  sectionHeader: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: COLOR.brand,
    marginTop: 12,
    marginBottom: 6,
    borderBottom: `1px solid ${COLOR.line}`,
    paddingBottom: 3,
  },
  // Table
  tableHeader: {
    flexDirection: "row",
    backgroundColor: COLOR.brand,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 2,
    marginBottom: 2,
  },
  tableHeaderCell: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: COLOR.white,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderBottom: `0.5px solid ${COLOR.line}`,
  },
  tableRowAlt: {
    backgroundColor: COLOR.surface,
  },
  tableCell: {
    fontSize: 7.5,
  },
  tableCellFaint: {
    fontSize: 7,
    color: COLOR.inkFaint,
  },
  statusBadge: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    borderRadius: 2,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: COLOR.inkFaint,
    borderTop: `0.5px solid ${COLOR.line}`,
    paddingTop: 4,
  },
  // Invariant
  invariantOk: {
    backgroundColor: "#dcfce7",
    border: `1px solid ${COLOR.green}`,
    borderRadius: 3,
    padding: 6,
    marginBottom: 10,
  },
  invariantFail: {
    backgroundColor: "#fee2e2",
    border: `1px solid ${COLOR.red}`,
    borderRadius: 3,
    padding: 6,
    marginBottom: 10,
  },
  invariantText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
});

// ── Column widths (percentages) ──────────────────────────────────────────────

const COL = {
  grupo: "14%",
  subgrupo: "16%",
  ideal: "6%",
  actual: "6%",
  faltante: "7%",
  status: "13%",
  referencia: "10%",
  descripcion: "14%",
  cantidad: "6%",
  explicacion: "8%",
} as const;

// ── Helper: format Bogota date ───────────────────────────────────────────────

function formatBogotaDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-CO", { timeZone: "America/Bogota" });
  } catch {
    return iso;
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function CoverageReportPdfDocument({ payload }: { payload: CoverageReportPayload }) {
  const byStatus = (status: string) =>
    payload.positions.filter((p) => p.status === status);

  const sections: { status: string; label: string; color: string; positions: CoverageReportPosition[] }[] = [
    { status: "B01_AVAILABLE", label: "Disponibles en Bodega Principal (B01)", color: COLOR.green, positions: byStatus("B01_AVAILABLE") },
    { status: "OP_INCOMING", label: "En camino por OP activa (B04)", color: COLOR.brand, positions: byStatus("OP_INCOMING") },
    { status: "PRODUCTION_REQUIRED", label: "Requieren produccion", color: COLOR.red, positions: byStatus("PRODUCTION_REQUIRED") },
    { status: "IMPORT_UNAVAILABLE", label: "Importacion sin disponibilidad", color: COLOR.inkFaint, positions: byStatus("IMPORT_UNAVAILABLE") },
    { status: "DATA_UNVERIFIED", label: "Datos sin verificar", color: COLOR.amber, positions: byStatus("DATA_UNVERIFIED") },
  ].filter((sec) => sec.positions.length > 0);

  return (
    <Document>
      <Page size="LETTER" orientation="landscape" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>Informe de Cobertura de Mostrario</Text>
            <Text style={s.headerSub}>
              {payload.organization.name} — {payload.vendor.name} — Bodega {payload.vendor.bodegaKaNl}
            </Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.headerSub}>Generado: {formatBogotaDate(payload.generatedAt)}</Text>
            <Text style={s.headerSub}>Datos SAG: {formatBogotaDate(payload.sourceUpdatedAt)}</Text>
            <Text style={s.headerSub}>ID: {payload.reportId}</Text>
          </View>
        </View>

        {/* Warning */}
        {payload.hasUnverifiedData && (
          <View style={s.warningBanner}>
            <Text style={s.warningText}>
              Informe contiene datos no verificados ({payload.dataUnverified} posicion{payload.dataUnverified !== 1 ? "es" : ""})
            </Text>
          </View>
        )}

        {/* Summary KPIs */}
        <View style={s.summaryStrip}>
          {[
            { label: "Posiciones totales", value: payload.totalPositions, color: COLOR.inkDark },
            { label: "Cubiertas", value: payload.coveredPositions, color: COLOR.green },
            { label: "Faltantes", value: payload.missingPositions, color: payload.missingPositions > 0 ? COLOR.red : COLOR.green },
            { label: "Disponibles B01", value: payload.b01Available, color: COLOR.green },
            { label: "OP activa (B04)", value: payload.opIncoming, color: COLOR.brand },
            { label: "Requieren produccion", value: payload.productionRequired, color: COLOR.red },
          ].map((kpi) => (
            <View key={kpi.label} style={s.summaryCard}>
              <Text style={[s.summaryValue, { color: kpi.color }]}>{kpi.value}</Text>
              <Text style={s.summaryLabel}>{kpi.label}</Text>
            </View>
          ))}
        </View>

        {/* Meta grid */}
        <View style={s.metaGrid}>
          <View style={s.metaItem}>
            <Text style={s.metaLabel}>Derrotero</Text>
            <Text style={s.metaValue}>{payload.derroteroVersion}</Text>
          </View>
          <View style={s.metaItem}>
            <Text style={s.metaLabel}>Umbrales</Text>
            <Text style={s.metaValue}>CS:{payload.thresholds.castillitos} / LT:{payload.thresholds.latinKids} / IMP:{payload.thresholds.importacion}</Text>
          </View>
          <View style={s.metaItem}>
            <Text style={s.metaLabel}>Estado de verdad</Text>
            <Text style={s.metaValue}>{payload.truthState}</Text>
          </View>
        </View>

        {/* Invariant */}
        <View style={payload.invariantValid ? s.invariantOk : s.invariantFail}>
          <Text style={s.invariantText}>
            Invariante: B01({payload.b01Available}) + OP({payload.opIncoming}) + PROD({payload.productionRequired}) + IMP({payload.importUnavailable}) + UNVER({payload.dataUnverified}) = {payload.b01Available + payload.opIncoming + payload.productionRequired + payload.importUnavailable + payload.dataUnverified} {payload.invariantValid ? "= " : "!= "}{payload.missingPositions} faltantes {payload.invariantValid ? "OK" : "FALLO"}
          </Text>
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text>{payload.organization.name} — Cobertura de mostrario</Text>
          <Text render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>

      {/* Detail pages — one per section */}
      {sections.map((section) => (
        <Page key={section.status} size="LETTER" orientation="landscape" style={s.page}>
          <Text style={[s.sectionHeader, { color: section.color }]}>
            {section.label} ({section.positions.length})
          </Text>

          {/* Table header */}
          <View style={s.tableHeader}>
            <Text style={[s.tableHeaderCell, { width: COL.grupo }]}>Grupo</Text>
            <Text style={[s.tableHeaderCell, { width: COL.subgrupo }]}>Subgrupo</Text>
            <Text style={[s.tableHeaderCell, { width: COL.ideal }]}>Ideal</Text>
            <Text style={[s.tableHeaderCell, { width: COL.actual }]}>Actual</Text>
            <Text style={[s.tableHeaderCell, { width: COL.faltante }]}>Faltante</Text>
            <Text style={[s.tableHeaderCell, { width: COL.status }]}>Estado</Text>
            <Text style={[s.tableHeaderCell, { width: COL.referencia }]}>Referencia</Text>
            <Text style={[s.tableHeaderCell, { width: COL.descripcion }]}>Descripcion</Text>
            <Text style={[s.tableHeaderCell, { width: COL.cantidad }]}>Cant.</Text>
            <Text style={[s.tableHeaderCell, { width: COL.explicacion }]}>Decision</Text>
          </View>

          {/* Table rows */}
          {section.positions.map((pos, i) => (
            <View
              key={pos.positionId}
              style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}
              wrap={false}
            >
              <Text style={[s.tableCell, { width: COL.grupo }]}>{pos.groupName}</Text>
              <Text style={[s.tableCell, { width: COL.subgrupo }]}>{pos.subgroupName}</Text>
              <Text style={[s.tableCell, { width: COL.ideal }]}>{pos.targetReferences}</Text>
              <Text style={[s.tableCell, { width: COL.actual }]}>{pos.currentReferences}</Text>
              <Text style={[s.tableCell, { width: COL.faltante }]}>{pos.missingReferences}</Text>
              <Text style={[s.statusBadge, { color: STATUS_COLOR[pos.status] || COLOR.inkDark }]}>
                {STATUS_LABEL[pos.status] || pos.status}
              </Text>
              <Text style={[s.tableCell, { width: COL.referencia }]}>
                {pos.candidate?.reference ?? "\u2014"}
              </Text>
              <Text style={[s.tableCellFaint, { width: COL.descripcion }]}>
                {pos.candidate?.description ?? "\u2014"}
              </Text>
              <Text style={[s.tableCell, { width: COL.cantidad }]}>
                {pos.candidate?.availableQty ?? pos.candidate?.pendingQty ?? "\u2014"}
              </Text>
              <Text style={[s.tableCellFaint, { width: COL.explicacion }]}>
                {pos.statusExplanation}
              </Text>
            </View>
          ))}

          {/* Footer */}
          <View style={s.footer} fixed>
            <Text>{payload.organization.name} — {payload.vendor.name} — {section.label}</Text>
            <Text render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} de ${totalPages}`} />
          </View>
        </Page>
      ))}
    </Document>
  );
}
