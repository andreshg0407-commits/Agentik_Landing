/**
 * scripts/export-sag-executive-pack.ts
 *
 * SAG Executive Pack — Export Script
 *
 * Genera los cuatro archivos Markdown del paquete ejecutivo SAG:
 *   executive-summary.md
 *   view-request.md
 *   open-questions.md
 *   email-preview.md
 *
 * Y muestra al finalizar:
 *   - Versión del contrato
 *   - Vistas incluidas
 *   - Preguntas abiertas
 *   - Estado READY_TO_SEND
 *
 * Uso:
 *   npx ts-node scripts/export-sag-executive-pack.ts
 *
 * Sprint: AGENTIK-SAG-EXECUTIVE-PACK-EXPORT-01
 */

import * as fs from "fs";
import * as path from "path";

// Dynamic imports to keep the script self-contained
import { exportExecutiveSummaryMarkdown } from "../lib/integrations/sag/executive-pack/export/executive-summary-export";
import { exportViewRequestMarkdown } from "../lib/integrations/sag/executive-pack/export/view-request-export";
import { exportOpenQuestionsMarkdown } from "../lib/integrations/sag/executive-pack/export/open-questions-export";
import { exportAllEmailsMarkdown } from "../lib/integrations/sag/executive-pack/export/email-export";
import { runPreSendValidation, renderValidationRunText } from "../lib/integrations/sag/executive-pack/export/presend-validation-runner";
import { buildReviewDashboardMetadata } from "../lib/integrations/sag/executive-pack/export/review-dashboard-metadata";
import { SAG_EXECUTIVE_SUMMARY_META } from "../lib/integrations/sag/executive-pack/sag-executive-summary";
import { getOpenQuestionsSummary } from "../lib/integrations/sag/executive-pack/sag-open-questions";
import { SAG_VIEW_REQUEST_DOC } from "../lib/integrations/sag/executive-pack/sag-view-request-doc";

// ── Output directory ───────────────────────────────────────────────────────────

const OUTPUT_DIR = path.join(process.cwd(), "lib/integrations/sag/executive-pack/export/generated");

function ensureOutputDir(): void {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

function write(filename: string, content: string): void {
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, content, "utf-8");
  const kb = (Buffer.byteLength(content, "utf-8") / 1024).toFixed(1);
  console.log(`  ✓ ${filename}  (${kb} KB)`);
}

// ── Main ───────────────────────────────────────────────────────────────────────

function main(): void {
  const sep = "═".repeat(60);

  console.log("");
  console.log(sep);
  console.log("  SAG Executive Pack — Export");
  console.log(`  Versión: ${SAG_EXECUTIVE_SUMMARY_META.version}  |  ${SAG_EXECUTIVE_SUMMARY_META.fecha}`);
  console.log(sep);
  console.log("");

  // Ensure output dir
  ensureOutputDir();

  // Generate files
  console.log("Generando documentos...");
  console.log("");

  write("executive-summary.md", exportExecutiveSummaryMarkdown());
  write("view-request.md",      exportViewRequestMarkdown());
  write("open-questions.md",    exportOpenQuestionsMarkdown());
  write("email-preview.md",     exportAllEmailsMarkdown());

  console.log("");
  console.log(`  Directorio: ${OUTPUT_DIR}`);
  console.log("");

  // Run validation
  console.log("Ejecutando validación pre-envío...");
  console.log("");
  const validation = runPreSendValidation();
  const validationText = renderValidationRunText(validation);

  write("validation-report.txt", validationText);

  // Print summary
  const meta     = buildReviewDashboardMetadata();
  const qSummary = getOpenQuestionsSummary();

  console.log(sep);
  console.log("  RESUMEN DEL PAQUETE");
  console.log(sep);
  console.log("");
  console.log(`  Versión del contrato:  ${SAG_EXECUTIVE_SUMMARY_META.version}`);
  console.log(`  Fecha:                 ${SAG_EXECUTIVE_SUMMARY_META.fecha}`);
  console.log("");
  console.log("  Vistas incluidas:");
  for (const v of SAG_VIEW_REQUEST_DOC) {
    const prio = v.prioridad.toUpperCase().padEnd(10);
    const req  = String(v.camposRequeridos.length).padStart(2);
    const opc  = String(v.camposOpcionales.length).padStart(2);
    console.log(`    ${prio}  ${v.nombreVista.padEnd(30)}  ${req} req / ${opc} opc`);
  }
  console.log("");
  console.log(`  Preguntas abiertas:    ${qSummary.total} total`);
  console.log(`    Críticas:            ${qSummary.criticas}`);
  console.log(`    Importantes:         ${qSummary.importantes}`);
  console.log(`    Informativas:        ${qSummary.informativas}`);
  console.log("");
  console.log(`  Dominios en contrato:  ${meta.totalDominios}`);
  console.log(`  Campos totales (vistas): ${meta.totalCampos} (${meta.totalCamposRequeridos} req / ${meta.totalCamposOpcionales} opc)`);
  console.log("");

  // READY_TO_SEND
  const ready = validation.readyToSend;
  console.log(sep);
  if (ready) {
    console.log("  READY_TO_SEND = true");
    console.log("  El paquete está listo para revisión interna y envío a SAG.");
  } else {
    console.log("  READY_TO_SEND = false");
    console.log("  Resolver los siguientes bloqueantes antes de enviar:");
    for (const b of validation.blockers) {
      console.log(`    ✗ ${b}`);
    }
  }

  if (validation.warnings.length > 0) {
    console.log("");
    console.log("  Advertencias:");
    for (const w of validation.warnings) {
      console.log(`    ⚠ ${w}`);
    }
  }

  console.log(sep);
  console.log("");

  // Exit code
  process.exit(ready ? 0 : 1);
}

main();
