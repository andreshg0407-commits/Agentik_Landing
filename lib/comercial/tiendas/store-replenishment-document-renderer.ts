/**
 * lib/comercial/tiendas/store-replenishment-document-renderer.ts
 *
 * AGENTIK-STORES-REPLENISHMENT-DOCUMENT-01 — Print-ready HTML renderer.
 *
 * Renders a ReplenishmentDocumentSnapshot as a self-contained HTML string
 * (window.print() en navegador · convertible server-side — mismo patrón de
 * store-guide-pdf-renderer).
 *
 * PURO: solo formatea el snapshot. Las explicaciones se imprimen desde las
 * razones ESTRUCTURADAS del Sprint 6 — cero recalculo, cero texto inventado.
 */

import type { ReplenishmentDocumentSnapshot } from "./store-replenishment-document-types";
import { REPLENISHMENT_DOCUMENT_STATUS_LABEL } from "./store-replenishment-document-types";
import type { ReplenishmentDocumentStatus } from "./store-replenishment-document-types";

// ── HTML escaping ────────────────────────────────────────────────────────────

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const CANDIDATE_TYPE_LABEL: Record<string, string> = {
  REPOSICION_MISMA_REFERENCIA: "Reposición",
  COMPLEMENTO_REFERENCIA_COMPATIBLE: "Complemento",
  REFERENCIA_NUEVA_COMPATIBLE: "Referencia nueva",
};

const UNALLOCATED_REASON_LABEL: Record<string, string> = {
  SIN_DATOS_DISPONIBILIDAD: "Sin datos de disponibilidad",
  SIN_DISPONIBILIDAD: "Sin stock elegible en bodega",
  POOL_AGOTADO: "Stock agotado por asignaciones previas",
};

// ── Renderer ─────────────────────────────────────────────────────────────────

export function renderReplenishmentDocumentHtml(
  snapshot: ReplenishmentDocumentSnapshot,
  status: ReplenishmentDocumentStatus = "BORRADOR",
): string {
  const s = snapshot;
  const fechaDoc = s.documentGeneratedAt.slice(0, 10);
  const fechaPlan = s.planGeneratedAt.slice(0, 16).replace("T", " ");

  const suggestionRows = s.suggestions.map((sg, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="mono">${escapeHtml(sg.referenceCode)}</td>
        <td>${escapeHtml(sg.productName)}</td>
        <td>${escapeHtml(sg.structureKey)}</td>
        <td>${escapeHtml(CANDIDATE_TYPE_LABEL[sg.candidateType] ?? sg.candidateType)}</td>
        <td class="num">${sg.units}</td>
        <td class="reasons">${sg.reasons.map(r => escapeHtml(r.detail)).join("<br>")}</td>
      </tr>`).join("");

  const withdrawalRows = s.withdrawals.map((w, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(w.label)}</td>
        <td>${escapeHtml(w.structureKey)}</td>
        <td class="num">${w.requiredUnits}</td>
        <td>Presencia no autorizada — retirar y devolver a bodega principal</td>
      </tr>`).join("");

  const unallocatedRows = s.unallocated.map((u, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(u.structureKey)}</td>
        <td class="num">${u.requiredUnits}</td>
        <td class="num">${u.executableUnits}</td>
        <td class="num">${u.allocatedUnits}</td>
        <td class="num">${u.totalPendingUnits}</td>
        <td>${escapeHtml(UNALLOCATED_REASON_LABEL[u.reason] ?? u.reason)}</td>
      </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(s.documentNumber)} — Surtido ${escapeHtml(s.storeName)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;padding:24px}
  header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px}
  h1{font-size:18px}
  .docnum{font-size:16px;font-weight:bold;font-family:monospace}
  .meta{font-size:10px;color:#444;margin-top:4px}
  .badge{display:inline-block;border:1px solid #111;padding:2px 8px;font-weight:bold;font-size:10px;margin-top:4px}
  h2{font-size:13px;margin:16px 0 6px;border-bottom:1px solid #999;padding-bottom:2px}
  table{width:100%;border-collapse:collapse;font-size:10px}
  th{background:#eee;text-align:left;padding:4px 6px;border:1px solid #bbb;font-size:9px;text-transform:uppercase}
  td{padding:4px 6px;border:1px solid #ccc;vertical-align:top}
  td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  td.mono{font-family:monospace;white-space:nowrap}
  td.reasons{font-size:9px;color:#333}
  .totals{margin-top:10px;display:flex;gap:18px;font-size:11px}
  .totals b{font-size:13px}
  .empty{color:#666;font-style:italic;padding:6px 0}
  .scarcity{margin-top:8px;font-size:10px;color:#7a3b00}
  footer{margin-top:18px;font-size:9px;color:#666;border-top:1px solid #ccc;padding-top:6px}
  .firmas{display:flex;gap:40px;margin-top:28px}
  .firma{flex:1;border-top:1px solid #111;padding-top:4px;font-size:10px;text-align:center}
  @media print { body{padding:0} }
</style>
</head>
<body>
  <header>
    <div>
      <h1>Documento de Surtido — ${escapeHtml(s.storeName)}</h1>
      <div class="meta">Documento generado: ${escapeHtml(fechaDoc)} · Plan calculado: ${escapeHtml(fechaPlan)} · Por: ${escapeHtml(s.generatedBy)} · Corrida: ${escapeHtml(s.batchId)}</div>
      <div class="badge">${escapeHtml(REPLENISHMENT_DOCUMENT_STATUS_LABEL[status])}</div>
    </div>
    <div class="docnum">${escapeHtml(s.documentNumber)}</div>
  </header>

  <h2>1. Reposiciones (${s.suggestions.length} sugerencias · ${s.summary.allocatedUnits} unidades)</h2>
  ${s.suggestions.length > 0 ? `
  <table>
    <thead><tr><th>#</th><th>Referencia</th><th>Producto</th><th>Estructura</th><th>Tipo</th><th>Unds</th><th>Justificación</th></tr></thead>
    <tbody>${suggestionRows}</tbody>
  </table>` : `<div class="empty">Sin reposiciones para esta tienda en esta corrida.</div>`}

  <h2>2. Retiros (${s.withdrawals.length} · ${s.summary.withdrawalUnits} unidades) — NO suman al surtido</h2>
  ${s.withdrawals.length > 0 ? `
  <table>
    <thead><tr><th>#</th><th>Pieza</th><th>Regla</th><th>Unds a retirar</th><th>Instrucción</th></tr></thead>
    <tbody>${withdrawalRows}</tbody>
  </table>` : `<div class="empty">Sin retiros pendientes.</div>`}

  <h2>3. Necesidades no asignadas (transparencia del faltante)</h2>
  ${s.unallocated.length > 0 ? `
  <table>
    <thead><tr><th>#</th><th>Estructura</th><th>Requerido</th><th>Ejecutable</th><th>Asignado</th><th>Pendiente negocio</th><th>Causa</th></tr></thead>
    <tbody>${unallocatedRows}</tbody>
  </table>` : `<div class="empty">Todas las necesidades ejecutables quedaron asignadas.</div>`}

  <div class="totals">
    <div>Requerido: <b>${s.summary.requiredUnits}</b> unds</div>
    <div>Ejecutable: <b>${s.summary.executableUnits}</b> unds</div>
    <div>Asignado: <b>${s.summary.allocatedUnits}</b> unds</div>
    <div>Pendiente asignación: <b>${s.summary.allocationPendingUnits}</b></div>
    <div>Pendiente negocio: <b>${s.summary.totalBusinessPendingUnits}</b></div>
    <div>Retiros: <b>${s.summary.withdrawalUnits}</b> unds</div>
  </div>
  ${s.scarcityAffectedThisStore
    ? `<div class="scarcity">⚠ Esta tienda quedó con necesidades sin asignar por escasez del pool compartido (prioridad Centro/Caldas, Regla 36).</div>`
    : s.scarcityMaterializedGlobal
      ? `<div class="scarcity">Nota: la corrida tuvo escasez de pool en otras tiendas; esta tienda no resultó afectada.</div>`
      : ""}

  <div class="firmas">
    <div class="firma">Preparó (Bodega)</div>
    <div class="firma">Despachó</div>
    <div class="firma">Recibió (Tienda)</div>
  </div>

  <footer>
    ${escapeHtml(s.documentNumber)} · Documento generado por Agentik desde el plan certificado de surtido.
    El contenido es un snapshot inmutable: cualquier ajuste requiere generar un documento nuevo.
  </footer>
</body>
</html>`;
}
