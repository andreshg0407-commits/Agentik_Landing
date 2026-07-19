/**
 * lib/integrations/sag/data-contract/export/sag-contract-renderer.ts
 *
 * SAG Contract Text Renderer
 *
 * Converts SagExecutiveContract into shareable text formats:
 * - renderMarkdown()  → paste into Word / Notion / email
 * - renderPlainText() → plain text for SAG ticket / email body
 * - renderJsonBlob()  → raw JSON for internal ticketing systems
 *
 * Sprint: AGENTIK-SAG-DATA-CONTRACT-EXPORT-01
 */

import type { SagExecutiveContract, VistaRequerida, TrazabilidadEntry } from "./sag-contract-export";

// ── Priority label ─────────────────────────────────────────────────────────────

function prioLabel(p: 1 | 2 | 3): string {
  return p === 1 ? "P1 — Crítico" : p === 2 ? "P2 — Importante" : "P3 — Deseado";
}

// ── Markdown renderer ──────────────────────────────────────────────────────────

export function renderMarkdown(contract: SagExecutiveContract): string {
  const { meta, resumenEjecutivo: re, vistasRequeridas, matrizTrazabilidad, statusDominios } = contract;
  const lines: string[] = [];

  // ── Cover ──
  lines.push(`# ${meta.tituloDocumento}`);
  lines.push(``);
  lines.push(`| | |`);
  lines.push(`|---|---|`);
  lines.push(`| **Versión** | ${meta.version} |`);
  lines.push(`| **Fecha de generación** | ${meta.fechaGeneracion} |`);
  lines.push(`| **Fecha última reunión** | ${meta.fechaUltimaReunion} |`);
  lines.push(`| **Preparado por** | ${meta.preparadoPor} |`);
  lines.push(`| **Destinatario** | ${meta.destinatario} |`);
  lines.push(``);

  // ── Meeting conclusions ──
  lines.push(`## Conclusiones confirmadas en reunión SAG × Agentik`);
  lines.push(``);
  for (const item of meta.resumenReunion) {
    lines.push(`- ${item}`);
  }
  lines.push(``);

  // ── Executive summary ──
  lines.push(`## Resumen ejecutivo`);
  lines.push(``);
  lines.push(`### Objetivo`);
  lines.push(``);
  lines.push(re.objetivo);
  lines.push(``);
  lines.push(`### Contexto`);
  lines.push(``);
  lines.push(re.contexto);
  lines.push(``);
  lines.push(`### Arquitectura recomendada`);
  lines.push(``);
  lines.push(re.arquitecturaRecomendada);
  lines.push(``);
  lines.push(`### Acceso histórico`);
  lines.push(``);
  lines.push(re.accesoHistorico);
  lines.push(``);
  lines.push(`### Dominios requeridos`);
  lines.push(``);
  lines.push(`**P1 — Crítico:** ${re.dominiosCriticos.join(", ")}`);
  lines.push(``);
  lines.push(`**P2 — Importante:** ${re.dominiosImportantes.join(", ")}`);
  lines.push(``);
  lines.push(`**P3 — Deseado:** ${re.dominiosDeseados.join(", ")}`);
  lines.push(``);
  lines.push(`### Próximos pasos acordados`);
  lines.push(``);
  re.proximosPasos.forEach((paso, i) => lines.push(`${i + 1}. ${paso}`));
  lines.push(``);

  // ── Domain status ──
  lines.push(`## Estado de dominios`);
  lines.push(``);
  lines.push(`| Dominio | Prioridad | Estado | Vista solicitada | Campos | KPIs habilitados |`);
  lines.push(`|---|---|---|---|---|---|`);
  for (const d of statusDominios) {
    const camposResumen = `${d.camposAcordados}/${d.totalCampos} acordados`;
    lines.push(
      `| **${d.nombre}** | ${prioLabel(d.prioridad)} | ${d.statusLabel} | \`${d.vistaSolicitada}\` | ${camposResumen} | ${d.kpisHabilitados} KPIs |`
    );
  }
  lines.push(``);

  // Blockers
  const conBlockers = statusDominios.filter(d => d.bloqueadores.length > 0);
  if (conBlockers.length > 0) {
    lines.push(`### Bloqueadores activos`);
    lines.push(``);
    for (const d of conBlockers) {
      lines.push(`**${d.nombre}:**`);
      for (const b of d.bloqueadores) lines.push(`- ${b}`);
      lines.push(``);
    }
  }

  // ── Views per domain ──
  lines.push(`## Vistas requeridas — Detalle por dominio`);
  lines.push(``);

  for (const vista of vistasRequeridas) {
    lines.push(`---`);
    lines.push(``);
    lines.push(`### \`${vista.nombre}\``);
    lines.push(``);
    lines.push(`| | |`);
    lines.push(`|---|---|`);
    lines.push(`| **Dominio** | ${vista.dominio} |`);
    lines.push(`| **Prioridad** | ${prioLabel(vista.prioridad)} |`);
    lines.push(`| **Estado** | ${vista.status} |`);
    lines.push(`| **Tablas fuente** | ${vista.tabelasFuente.join(", ")} |`);
    lines.push(`| **Frecuencia sugerida** | ${vista.frecuenciaSugerida} |`);
    lines.push(`| **Módulos Agentik** | ${vista.modulosImpactados.join(", ")} |`);
    lines.push(`| **KPIs habilitados** | ${vista.kpisHabilitados.join(", ")} |`);
    lines.push(``);
    lines.push(`**Propósito:** ${vista.proposito}`);
    lines.push(``);

    if (vista.notas) {
      lines.push(`> **Nota:** ${vista.notas}`);
      lines.push(``);
    }

    lines.push(`**Campos requeridos:**`);
    lines.push(``);
    lines.push(`| Campo | Tipo | Obligatorio | Estado | Descripción |`);
    lines.push(`|---|---|---|---|---|`);
    for (const campo of vista.camposRequeridos) {
      const oblig = campo.obligatorio ? "✓ Sí" : "Opcional";
      lines.push(`| \`${campo.campo}\` | ${campo.tipo} | ${oblig} | ${campo.statusAcceso} | ${campo.descripcion} |`);
    }
    lines.push(``);
  }

  // ── Traceability matrix ──
  lines.push(`## Matriz de trazabilidad`);
  lines.push(``);
  lines.push(`> Cada campo justificado por su uso en módulos y KPIs de Agentik.`);
  lines.push(``);
  lines.push(`| Campo | Dominio | Vista | Tipo | Obligatorio | Estado | Módulos Agentik | KPIs afectados |`);
  lines.push(`|---|---|---|---|---|---|---|---|`);

  for (const row of matrizTrazabilidad) {
    const oblig    = row.obligatorio ? "✓" : "-";
    const modulos  = row.modulosAgentik.join(", ") || "-";
    const kpis     = row.kpisAfectados.join(", ") || "-";
    lines.push(
      `| \`${row.campo}\` | ${row.dominio} | \`${row.vista}\` | ${row.tipo} | ${oblig} | ${row.statusAcceso} | ${modulos} | ${kpis} |`
    );
  }
  lines.push(``);

  // ── Footer ──
  lines.push(`---`);
  lines.push(``);
  lines.push(`*Documento generado automáticamente por Agentik Data Contract Builder v${meta.version}.*`);
  lines.push(`*Para actualizar este documento, modificar los contratos en \`lib/integrations/sag/data-contract/\` y regenerar.*`);
  lines.push(``);

  return lines.join("\n");
}

// ── Plain text renderer (for email / SAG ticket body) ─────────────────────────

export function renderPlainText(contract: SagExecutiveContract): string {
  const { meta, resumenEjecutivo: re, vistasRequeridas, statusDominios } = contract;
  const lines: string[] = [];

  lines.push(meta.tituloDocumento.toUpperCase());
  lines.push("=".repeat(meta.tituloDocumento.length));
  lines.push(`Versión: ${meta.version}  |  Fecha: ${meta.fechaGeneracion}  |  Última reunión: ${meta.fechaUltimaReunion}`);
  lines.push(`Preparado por: ${meta.preparadoPor}`);
  lines.push(`Para: ${meta.destinatario}`);
  lines.push("");

  lines.push("CONCLUSIONES CONFIRMADAS EN REUNIÓN");
  lines.push("-".repeat(40));
  meta.resumenReunion.forEach((c, i) => lines.push(`${i + 1}. ${c}`));
  lines.push("");

  lines.push("OBJETIVO");
  lines.push("-".repeat(40));
  lines.push(re.objetivo);
  lines.push("");

  lines.push("CONTEXTO");
  lines.push("-".repeat(40));
  lines.push(re.contexto);
  lines.push("");

  lines.push("DOMINIOS REQUERIDOS");
  lines.push("-".repeat(40));
  lines.push(`P1 — CRÍTICO:    ${re.dominiosCriticos.join(", ")}`);
  lines.push(`P2 — IMPORTANTE: ${re.dominiosImportantes.join(", ")}`);
  lines.push(`P3 — DESEADO:    ${re.dominiosDeseados.join(", ")}`);
  lines.push("");

  lines.push("PRÓXIMOS PASOS ACORDADOS");
  lines.push("-".repeat(40));
  re.proximosPasos.forEach((paso, i) => lines.push(`${i + 1}. ${paso}`));
  lines.push("");

  lines.push("ESTADO DE DOMINIOS");
  lines.push("-".repeat(40));
  for (const d of statusDominios) {
    const prio = d.prioridad === 1 ? "P1" : d.prioridad === 2 ? "P2" : "P3";
    lines.push(`[${prio}] ${d.nombre.padEnd(14)} ${d.statusLabel.padEnd(18)} Vista: ${d.vistaSolicitada}`);
    if (d.bloqueadores.length > 0) {
      d.bloqueadores.forEach(b => lines.push(`       ⚠ ${b}`));
    }
  }
  lines.push("");

  lines.push("VISTAS SOLICITADAS A SAG");
  lines.push("-".repeat(40));
  for (const vista of vistasRequeridas) {
    const prio = vista.prioridad === 1 ? "P1" : vista.prioridad === 2 ? "P2" : "P3";
    lines.push("");
    lines.push(`[${prio}] ${vista.nombre}`);
    lines.push(`    Propósito: ${vista.proposito}`);
    lines.push(`    Tablas fuente: ${vista.tabelasFuente.join(", ")}`);
    lines.push(`    Frecuencia: ${vista.frecuenciaSugerida}`);
    lines.push(`    Módulos: ${vista.modulosImpactados.join(", ")}`);
    lines.push(`    Campos requeridos:`);
    const oblig = vista.camposRequeridos.filter(c => c.obligatorio);
    const opt   = vista.camposRequeridos.filter(c => !c.obligatorio);
    lines.push(`      Obligatorios: ${oblig.map(c => c.campo).join(", ")}`);
    if (opt.length > 0) {
      lines.push(`      Opcionales:   ${opt.map(c => c.campo).join(", ")}`);
    }
    if (vista.notas) {
      lines.push(`    Nota: ${vista.notas}`);
    }
  }
  lines.push("");

  lines.push("-".repeat(60));
  lines.push(`Documento generado por Agentik Data Contract Builder v${meta.version}`);
  lines.push("");

  return lines.join("\n");
}

// ── JSON blob renderer (for ticketing systems) ─────────────────────────────────

export function renderJsonBlob(contract: SagExecutiveContract): string {
  return JSON.stringify(contract, null, 2);
}

// ── Email body renderer ────────────────────────────────────────────────────────

export function renderEmailBody(contract: SagExecutiveContract): string {
  const { meta, resumenEjecutivo: re, vistasRequeridas } = contract;

  const p1Views = vistasRequeridas
    .filter(v => v.prioridad === 1)
    .map(v => `- ${v.nombre}: ${v.tabelasFuente.join(", ")}`)
    .join("\n");

  return `Estimado equipo SAG,

Adjunto el documento formal de requerimientos de integración Agentik × SAG, generado a partir de los acuerdos de nuestra reunión del ${meta.fechaUltimaReunion}.

RESUMEN EJECUTIVO
${re.objetivo}

CONCLUSIONES DE LA REUNIÓN
${meta.resumenReunion.map((c, i) => `${i + 1}. ${c}`).join("\n")}

VISTAS PRIORITARIAS (P1 — Acción inmediata)
${p1Views}

PRÓXIMOS PASOS
${re.proximosPasos.slice(0, 3).map((p, i) => `${i + 1}. ${p}`).join("\n")}

El documento completo (con matriz de campos, módulos impactados y KPIs por dominio) está disponible en el archivo adjunto.

Quedamos atentos a confirmar la disponibilidad de las vistas para iniciar la carga histórica.

Saludos,
${meta.preparadoPor}
`;
}

// ── Convenience: generate all formats at once ──────────────────────────────────

export interface ContractExportBundle {
  markdown:  string;
  plainText: string;
  json:      string;
  email:     string;
}

export function exportAll(contract: SagExecutiveContract): ContractExportBundle {
  return {
    markdown:  renderMarkdown(contract),
    plainText: renderPlainText(contract),
    json:      renderJsonBlob(contract),
    email:     renderEmailBody(contract),
  };
}
