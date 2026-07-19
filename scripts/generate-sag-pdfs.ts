/**
 * scripts/generate-sag-pdfs.ts
 *
 * SAG Executive Pack — PDF Generator
 *
 * Generates professional corporate PDFs for Fase 1 delivery to SAG:
 *   Agentik-SAG-Resumen-Ejecutivo-v2.6.0.pdf
 *   Agentik-SAG-Preguntas-Abiertas-v2.6.0.pdf
 *
 * Source: exports/sag-review/
 * Output: exports/sag-review/pdf/
 */

import * as fs from "fs";
import * as path from "path";
import { mdToPdf } from "md-to-pdf";

// ── Paths ─────────────────────────────────────────────────────────────────────

const ROOT       = process.cwd();
const SOURCE_DIR = path.join(ROOT, "exports/sag-review");
const OUTPUT_DIR = path.join(ROOT, "exports/sag-review/pdf");

const DOCUMENTS = [
  {
    source: "executive-summary.md",
    output: "Agentik-SAG-Resumen-Ejecutivo-v2.6.0.pdf",
    label:  "Resumen Ejecutivo",
  },
  {
    source: "open-questions.md",
    output: "Agentik-SAG-Preguntas-Abiertas-v2.6.0.pdf",
    label:  "Preguntas Abiertas",
  },
  {
    source: "view-request.md",
    output: "Agentik-SAG-Solicitud-Formal-Informacion-v2.6.0.pdf",
    label:  "Solicitud Formal de Información",
  },
];

// ── Corporate CSS ─────────────────────────────────────────────────────────────

const CORPORATE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  * { box-sizing: border-box; }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.65;
    color: #1a1a2e;
    margin: 0;
    padding: 0;
  }

  h1 {
    font-size: 18pt;
    font-weight: 700;
    color: #004AAD;
    border-bottom: 2.5px solid #004AAD;
    padding-bottom: 8px;
    margin-top: 0;
    margin-bottom: 20px;
  }

  h2 {
    font-size: 12.5pt;
    font-weight: 600;
    color: #004AAD;
    border-bottom: 1px solid #d0dff5;
    padding-bottom: 5px;
    margin-top: 28px;
    margin-bottom: 12px;
  }

  h3 {
    font-size: 10.5pt;
    font-weight: 600;
    color: #1a1a2e;
    margin-top: 18px;
    margin-bottom: 6px;
  }

  p {
    margin: 0 0 10px 0;
  }

  blockquote {
    border-left: 3px solid #004AAD;
    background: #f0f5ff;
    margin: 12px 0;
    padding: 10px 16px;
    border-radius: 0 4px 4px 0;
    font-size: 10pt;
    color: #1a3a6b;
  }

  blockquote p { margin: 0; }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0;
    font-size: 9.5pt;
    page-break-inside: avoid;
  }

  thead tr {
    background-color: #004AAD;
    color: #ffffff;
  }

  thead th {
    padding: 7px 10px;
    text-align: left;
    font-weight: 600;
    border: 1px solid #003a8c;
  }

  tbody tr:nth-child(even) {
    background-color: #f5f8ff;
  }

  tbody tr:nth-child(odd) {
    background-color: #ffffff;
  }

  tbody td {
    padding: 6px 10px;
    border: 1px solid #d8e4f7;
    vertical-align: top;
  }

  code {
    font-family: 'SFMono-Regular', 'Consolas', 'Liberation Mono', monospace;
    font-size: 8.5pt;
    background: #f0f4fb;
    padding: 1px 4px;
    border-radius: 3px;
    color: #1a3a6b;
  }

  pre {
    background: #f0f4fb;
    border: 1px solid #d0dff5;
    border-radius: 4px;
    padding: 12px 14px;
    font-size: 8.5pt;
    overflow-x: auto;
    page-break-inside: avoid;
  }

  hr {
    border: none;
    border-top: 1px solid #d0dff5;
    margin: 20px 0;
  }

  ul, ol {
    margin: 8px 0;
    padding-left: 20px;
  }

  li {
    margin-bottom: 4px;
  }

  em {
    color: #555;
  }

  strong {
    font-weight: 600;
    color: #1a1a2e;
  }

  /* Prevent orphaned headers */
  h2, h3 { page-break-after: avoid; }
  h2 + p, h3 + p { page-break-before: avoid; }

  /* Question blocks */
  h3 + p { margin-top: 4px; }

  /* Footer signature */
  em:last-child { color: #888; font-size: 9pt; }
`;

// ── Header / Footer templates ─────────────────────────────────────────────────

const HEADER_TEMPLATE = `
  <div style="
    width: 100%;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    font-size: 7.5pt;
    color: #888;
    padding: 6px 36px 4px 36px;
    border-bottom: 1px solid #d0dff5;
    display: flex;
    justify-content: space-between;
    align-items: center;
  ">
    <span style="color: #004AAD; font-weight: 600;">Agentik × SAG</span>
    <span>Versión 2.6.0 &nbsp;|&nbsp; Externo — Documento técnico-funcional</span>
  </div>
`;

const FOOTER_TEMPLATE = `
  <div style="
    width: 100%;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    font-size: 7.5pt;
    color: #aaa;
    padding: 4px 36px 6px 36px;
    border-top: 1px solid #d0dff5;
    display: flex;
    justify-content: space-between;
    align-items: center;
  ">
    <span>Preparado por: Equipo de Integraciones — Agentik &nbsp;|&nbsp; 2026-05-31</span>
    <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
  </div>
`;

// ── PDF options ───────────────────────────────────────────────────────────────

const PDF_OPTIONS = {
  format:                "A4" as const,
  margin: {
    top:    "2.8cm",
    right:  "2.2cm",
    bottom: "2.8cm",
    left:   "2.2cm",
  },
  printBackground:       true,
  displayHeaderFooter:   true,
  headerTemplate:        HEADER_TEMPLATE,
  footerTemplate:        FOOTER_TEMPLATE,
};

// ── Generator ─────────────────────────────────────────────────────────────────

async function generatePdf(
  sourceFile: string,
  outputFile: string,
  label: string,
): Promise<{ pages: number; sizeKb: number }> {
  const sourcePath = path.join(SOURCE_DIR, sourceFile);
  const outputPath = path.join(OUTPUT_DIR, outputFile);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source not found: ${sourcePath}`);
  }

  const content = fs.readFileSync(sourcePath, "utf-8");

  const pdf = await mdToPdf(
    { content },
    {
      dest:       outputPath,
      css:        CORPORATE_CSS,
      pdf_options: PDF_OPTIONS,
      launch_options: {
        executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
    },
  );

  if (!pdf || !pdf.filename) {
    throw new Error(`PDF generation failed for ${label}`);
  }

  const stat  = fs.statSync(outputPath);
  const sizeKb = Math.round(stat.size / 1024);

  // Rough page estimate: ~3000 chars per page
  const pages = Math.max(1, Math.round(content.length / 3200));

  return { pages, sizeKb };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const sep = "═".repeat(60);

  console.log("");
  console.log(sep);
  console.log("  SAG Executive Pack — PDF Generator");
  console.log("  Fase 1 — Primer contacto con SAG");
  console.log(sep);
  console.log("");

  // Ensure output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const results: Array<{ label: string; output: string; pages: number; sizeKb: number }> = [];

  for (const doc of DOCUMENTS) {
    process.stdout.write(`  Generando: ${doc.label} ... `);
    try {
      const { pages, sizeKb } = await generatePdf(doc.source, doc.output, doc.label);
      results.push({ label: doc.label, output: doc.output, pages, sizeKb });
      console.log(`✓  (${sizeKb} KB, ~${pages} páginas)`);
    } catch (err) {
      console.log(`✗  ERROR`);
      console.error(`     ${err}`);
      process.exit(1);
    }
  }

  console.log("");
  console.log(sep);
  console.log("  PDFs GENERADOS");
  console.log(sep);
  console.log("");

  for (const r of results) {
    const fullPath = path.join(OUTPUT_DIR, r.output);
    console.log(`  ${r.output}`);
    console.log(`    Ruta:    ${fullPath}`);
    console.log(`    Tamaño:  ${r.sizeKb} KB`);
    console.log(`    Páginas: ~${r.pages}`);
    console.log("");
  }

  // Final file listing
  console.log("  Archivos en exports/sag-review/pdf/:");
  const files = fs.readdirSync(OUTPUT_DIR);
  for (const f of files) {
    const stat = fs.statSync(path.join(OUTPUT_DIR, f));
    console.log(`    ${f}  (${Math.round(stat.size / 1024)} KB)`);
  }

  console.log("");
  console.log(sep);
  console.log("  FASE 1 — Lista para envío a SAG");
  console.log(sep);
  console.log("");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
