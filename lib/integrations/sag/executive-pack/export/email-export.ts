/**
 * lib/integrations/sag/executive-pack/export/email-export.ts
 *
 * SAG Executive Pack Export — Email Templates
 *
 * Exporta los borradores de correo para tres audiencias:
 * - TI SAG        → destinatario técnico
 * - Funcional SAG → destinatario mixto
 * - Gerencia SAG  → destinatario dirección
 *
 * Agrega helper getRecommendedEmailVersion() con regla de selección.
 *
 * Fuente: sag-email-package.ts
 * Sprint: AGENTIK-SAG-EXECUTIVE-PACK-EXPORT-01
 */

import {
  SAG_EMAIL_PACKAGE,
  getEmailDraft,
  getPrimaryEmailDraft,
  renderEmailText,
  type EmailAudience,
  type EmailDraft,
} from "../sag-email-package";

// ── Recipient type for routing ─────────────────────────────────────────────────

export type RecipientType =
  | "tecnico"     // DBA, dev, TI — use ti_sag version
  | "mixto"       // Combined technical + operational — use funcional_sag version
  | "direccion";  // C-level, manager — use gerencia_sag version

const RECIPIENT_AUDIENCE_MAP: Record<RecipientType, EmailAudience> = {
  tecnico:   "ti_sag",
  mixto:     "funcional_sag",
  direccion: "gerencia_sag",
};

// ── Recommended version selector ──────────────────────────────────────────────

/**
 * Returns the recommended email draft based on recipient type.
 *
 * Rule:
 * - tecnico   → versión TI (técnica, campo a campo)
 * - mixto     → versión funcional (operacional, sin tablas)
 * - direccion → versión gerencial (ejecutiva, muy breve)
 */
export function getRecommendedEmailVersion(recipient: RecipientType): EmailDraft {
  const audience = RECIPIENT_AUDIENCE_MAP[recipient];
  const draft = getEmailDraft(audience);
  if (!draft) {
    // Fallback to primary (ti_sag)
    return getPrimaryEmailDraft();
  }
  return draft;
}

// ── Individual version exports ─────────────────────────────────────────────────

export function exportEmailTiText(): string {
  const draft = getEmailDraft("ti_sag");
  if (!draft) return "ERROR: Email draft 'ti_sag' not found.";
  return renderEmailText(draft);
}

export function exportEmailFuncionalText(): string {
  const draft = getEmailDraft("funcional_sag");
  if (!draft) return "ERROR: Email draft 'funcional_sag' not found.";
  return renderEmailText(draft);
}

export function exportEmailGerenciaText(): string {
  const draft = getEmailDraft("gerencia_sag");
  if (!draft) return "ERROR: Email draft 'gerencia_sag' not found.";
  return renderEmailText(draft);
}

// ── Markdown preview ───────────────────────────────────────────────────────────

export function exportEmailMarkdown(audience: EmailAudience): string {
  const draft = getEmailDraft(audience);
  if (!draft) return `> ERROR: Borrador para audiencia '${audience}' no encontrado.`;

  const lines: string[] = [
    `## Correo — ${audienceLabel(audience)}`,
    "",
    `**Asunto:** ${draft.asunto}`,
    `**Para:** ${draft.para}`,
    `**CC:** ${draft.cc.join(", ")}`,
    "",
    "---",
    "",
    "```",
    draft.cuerpo.trim(),
    "```",
    "",
  ];

  if (draft.adjuntos.length > 0) {
    lines.push("**Adjuntos:**");
    lines.push("");
    for (const adj of draft.adjuntos) {
      const flag = adj.obligatorio ? "✓" : "○";
      lines.push(`- [${flag}] **${adj.nombreDocumento}** (${adj.formato})`);
      lines.push(`  ${adj.descripcion}`);
    }
    lines.push("");
  }

  if (draft.notas.length > 0) {
    lines.push("> **Notas internas:**");
    for (const nota of draft.notas) {
      lines.push(`> - ${nota}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function audienceLabel(audience: EmailAudience): string {
  const labels: Record<EmailAudience, string> = {
    ti_sag:                 "TI / DBA — SAG",
    funcional_sag:          "Analista Funcional — SAG",
    gerencia_sag:           "Gerencia — SAG",
    equipo_tecnico_agentik: "Equipo Interno — Agentik",
  };
  return labels[audience] ?? audience;
}

// ── Full email preview document ────────────────────────────────────────────────

export function exportAllEmailsMarkdown(): string {
  const audiences: EmailAudience[] = ["ti_sag", "funcional_sag", "gerencia_sag"];

  const lines: string[] = [
    "# Borradores de Correo — SAG Executive Pack",
    "",
    "> Seleccionar el borrador según el destinatario de SAG.",
    "",
    "| Tipo de Destinatario | Versión Recomendada |",
    "|---|---|",
    "| Técnico (DBA, TI) | Versión TI |",
    "| Mixto (técnico + operativo) | Versión Funcional |",
    "| Dirección (gerencia) | Versión Gerencial |",
    "",
    "---",
    "",
  ];

  for (const audience of audiences) {
    lines.push(exportEmailMarkdown(audience));
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

// ── Re-exports for convenience ─────────────────────────────────────────────────

export { SAG_EMAIL_PACKAGE, getPrimaryEmailDraft, renderEmailText };
export type { EmailAudience, EmailDraft };
