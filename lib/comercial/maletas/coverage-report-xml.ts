/**
 * lib/comercial/maletas/coverage-report-xml.ts
 *
 * XML serializer for CoverageReportPayload.
 * Schema: maletas-coverage-report.v1
 *
 * MALETAS-COBERTURA-REPORT-08B2R4A
 *
 * Pure function — no Prisma, no IO, no side effects.
 */

import type { CoverageReportPayload, CoverageReportPosition } from "./coverage-report-payload";

// ── XML escaping ─────────────────────────────────────────────────────────────

function esc(value: string | number | boolean | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tag(name: string, value: string | number | boolean | null | undefined): string {
  if (value == null) return `<${name}/>`;
  return `<${name}>${esc(value)}</${name}>`;
}

// ── Serializer ───────────────────────────────────────────────────────────────

export function renderCoverageReportXml(payload: CoverageReportPayload): string {
  const lines: string[] = [];
  const p = (line: string) => lines.push(line);

  p('<?xml version="1.0" encoding="UTF-8"?>');
  p(`<coverageReport schema="${esc(payload.schemaVersion)}">`);

  // Metadata
  p("  <metadata>");
  p(`    ${tag("reportId", payload.reportId)}`);
  p(`    ${tag("generatedAt", payload.generatedAt)}`);
  p(`    ${tag("sourceUpdatedAt", payload.sourceUpdatedAt)}`);
  p(`    ${tag("truthState", payload.truthState)}`);
  p(`    ${tag("derroteroVersion", payload.derroteroVersion)}`);
  p("  </metadata>");

  // Organization
  p("  <organization>");
  p(`    ${tag("id", payload.organization.id)}`);
  p(`    ${tag("name", payload.organization.name)}`);
  p(`    ${tag("slug", payload.organization.slug)}`);
  p("  </organization>");

  // Vendor
  p("  <vendor>");
  p(`    ${tag("id", payload.vendor.id)}`);
  p(`    ${tag("name", payload.vendor.name)}`);
  p(`    ${tag("bodegaKaNl", payload.vendor.bodegaKaNl)}`);
  p("  </vendor>");

  // Thresholds
  p("  <thresholds>");
  p(`    ${tag("castillitos", payload.thresholds.castillitos)}`);
  p(`    ${tag("latinKids", payload.thresholds.latinKids)}`);
  p(`    ${tag("importacion", payload.thresholds.importacion)}`);
  p("  </thresholds>");

  // Summary
  p("  <summary>");
  p(`    ${tag("totalPositions", payload.totalPositions)}`);
  p(`    ${tag("coveredPositions", payload.coveredPositions)}`);
  p(`    ${tag("missingPositions", payload.missingPositions)}`);
  p(`    ${tag("b01Available", payload.b01Available)}`);
  p(`    ${tag("opIncoming", payload.opIncoming)}`);
  p(`    ${tag("productionRequired", payload.productionRequired)}`);
  p(`    ${tag("importUnavailable", payload.importUnavailable)}`);
  p(`    ${tag("dataUnverified", payload.dataUnverified)}`);
  p(`    ${tag("invariantValid", payload.invariantValid)}`);
  p(`    ${tag("hasUnverifiedData", payload.hasUnverifiedData)}`);
  p("  </summary>");

  // Positions
  p("  <positions>");
  for (const pos of payload.positions) {
    p('    <position>');
    p(`      ${tag("positionId", pos.positionId)}`);
    p(`      ${tag("groupName", pos.groupName)}`);
    p(`      ${tag("subgroupName", pos.subgroupName)}`);
    p(`      ${tag("targetReferences", pos.targetReferences)}`);
    p(`      ${tag("currentReferences", pos.currentReferences)}`);
    p(`      ${tag("missingReferences", pos.missingReferences)}`);
    p(`      ${tag("status", pos.status)}`);
    p(`      ${tag("statusExplanation", pos.statusExplanation)}`);
    if (pos.candidate) {
      p("      <candidate>");
      p(`        ${tag("reference", pos.candidate.reference)}`);
      p(`        ${tag("description", pos.candidate.description)}`);
      p(`        ${tag("availableQty", pos.candidate.availableQty)}`);
      p(`        ${tag("pendingQty", pos.candidate.pendingQty)}`);
      p(`        ${tag("source", pos.candidate.source)}`);
      p(`        ${tag("explanation", pos.candidate.explanation)}`);
      p("      </candidate>");
    }
    p("    </position>");
  }
  p("  </positions>");

  p("</coverageReport>");

  return lines.join("\n");
}
