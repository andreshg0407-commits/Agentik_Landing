/**
 * lib/comercial/tiendas/store-guide-pdf-renderer.tsx
 *
 * FASE 16 — Print-ready HTML renderer for warehouse guides.
 *
 * Generates a self-contained HTML string suitable for:
 *   - window.print() in the browser
 *   - Server-side PDF generation via puppeteer/playwright (future)
 *
 * Sprint: TIENDAS-WAREHOUSE-GUIDE-01
 */

import type { StoreWarehouseGuide } from "./store-guide-types";

const GUIDE_STATUS_LABEL: Record<string, string> = {
  draft: "BORRADOR", approved: "APROBADA", executed: "EJECUTADA", cancelled: "CANCELADA",
};

const PRIORITY_LABEL: Record<string, string> = {
  critica: "CRITICA", alta: "ALTA", media: "MEDIA", baja: "BAJA",
};

/**
 * Render a warehouse guide as a print-ready HTML string.
 */
export function renderGuideHtml(
  guide:      StoreWarehouseGuide,
  tenantName: string = "Agentik",
): string {
  const lines = guide.lines.map((l, i) => `
    <tr>
      <td style="text-align:center">${i + 1}</td>
      <td><strong>${esc(l.referenceCode)}</strong></td>
      <td>${esc(l.productName)}</td>
      <td style="text-align:center">${l.size || "—"}</td>
      <td style="text-align:center">${l.color || "—"}</td>
      <td style="text-align:center;font-weight:bold">${l.requestedQty > 0 ? l.requestedQty : "—"}</td>
      <td style="text-align:center">${l.availableMainWarehouseQty}</td>
      <td>${l.replacementReferenceCode ? `→ ${esc(l.replacementReferenceCode)}` : "—"}</td>
      <td style="font-size:10px">${esc(l.reason)}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${esc(guide.guideNumber)} — Guia de Surtido</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; font-size: 12px; color: #111; padding: 24px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; border-bottom: 2px solid #004AAD; padding-bottom: 12px; }
    .header h1 { font-size: 18px; color: #004AAD; }
    .header .meta { text-align: right; font-size: 11px; color: #666; }
    .summary { background: #f0f7ff; border: 1px solid #cce0ff; padding: 12px; margin-bottom: 16px; border-radius: 4px; }
    .summary p { margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #f5f5f5; border: 1px solid #ddd; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; }
    td { border: 1px solid #ddd; padding: 5px 8px; font-size: 11px; }
    tr:nth-child(even) { background: #fafafa; }
    .footer { margin-top: 24px; border-top: 1px solid #ddd; padding-top: 12px; font-size: 10px; color: #999; display: flex; justify-content: space-between; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: bold; }
    .badge-draft { background: #fef3c7; color: #92400e; }
    .badge-approved { background: #dbeafe; color: #1e40af; }
    .badge-executed { background: #d1fae5; color: #065f46; }
    .badge-cancelled { background: #f3f4f6; color: #6b7280; }
    @media print { body { padding: 0; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>GUIA DE SURTIDO ${esc(guide.guideNumber)}</h1>
      <div style="font-size:14px;margin-top:4px"><strong>Destino:</strong> ${esc(guide.storeName)}</div>
    </div>
    <div class="meta">
      <div><strong>${esc(tenantName)}</strong></div>
      <div>Fecha: ${guide.generatedAt.split("T")[0]}</div>
      <div>Prioridad: <strong>${PRIORITY_LABEL[guide.priority] ?? guide.priority}</strong></div>
      <div><span class="badge badge-${guide.status}">${GUIDE_STATUS_LABEL[guide.status] ?? guide.status}</span></div>
    </div>
  </div>

  <div class="summary">
    <p><strong>Resumen:</strong></p>
    <p>${esc(guide.summary.executiveSummary)}</p>
    <p style="margin-top:8px"><strong>${guide.totalLines}</strong> referencias · <strong>${guide.totalUnits}</strong> unidades</p>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:30px">#</th>
        <th>Ref</th>
        <th>Producto</th>
        <th style="width:50px">Talla</th>
        <th style="width:50px">Color</th>
        <th style="width:50px">Cant.</th>
        <th style="width:50px">Disp.</th>
        <th>Reemplazo</th>
        <th>Motivo</th>
      </tr>
    </thead>
    <tbody>
      ${lines}
    </tbody>
  </table>

  <div class="footer">
    <div>Generada por Agentik · ${guide.generatedAt.split("T")[0]}</div>
    <div>${esc(guide.guideNumber)} · ${esc(guide.storeName)}</div>
  </div>
</body>
</html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
