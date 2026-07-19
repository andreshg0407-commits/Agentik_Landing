/**
 * lib/integrations/sag/executive-pack/sag-email-package.ts
 *
 * SAG Executive Pack — Email Package
 *
 * Borrador profesional del correo formal de solicitud de vistas a SAG.
 * Incluye cuerpo del correo, asunto, adjuntos referenciados, y variantes
 * según el destinatario (TI, Funcional, Gerencia).
 *
 * Lenguaje: formal, técnico-operativo, sin terminología interna de Agentik.
 *
 * Sprint: AGENTIK-SAG-CONTRACT-EXECUTIVE-PACK-01
 */

import { SAG_EXECUTIVE_SUMMARY_META } from "./sag-executive-summary";

// ── Email types ────────────────────────────────────────────────────────────────

export type EmailAudience = "ti_sag" | "funcional_sag" | "gerencia_sag" | "equipo_tecnico_agentik";
export type EmailTone    = "formal" | "tecnico" | "ejecutivo";

export interface EmailAttachment {
  nombreDocumento: string;
  descripcion:     string;
  formato:         "PDF" | "Word" | "Excel" | "CSV";
  obligatorio:     boolean;
}

export interface EmailDraft {
  id:          string;
  audiencia:   EmailAudience;
  tono:        EmailTone;
  asunto:      string;
  para:        string;        // Placeholder role
  cc:          string[];      // Placeholder roles
  cuerpo:      string;
  adjuntos:    EmailAttachment[];
  notas:       string[];
}

// ── Standard attachments ───────────────────────────────────────────────────────

export const SAG_EMAIL_ATTACHMENTS: EmailAttachment[] = [
  {
    nombreDocumento: "Agentik × SAG — Resumen Ejecutivo de Integración",
    descripcion:     "Descripción del objetivo, alcance, método de acceso, beneficios y dominios requeridos.",
    formato:         "PDF",
    obligatorio:     true,
  },
  {
    nombreDocumento: "Agentik × SAG — Solicitud Formal de Vistas de Base de Datos",
    descripcion:     "Especificación técnica de las 8 vistas requeridas con campos, filtros y frecuencia.",
    formato:         "PDF",
    obligatorio:     true,
  },
  {
    nombreDocumento: "Agentik × SAG — Registro de Preguntas Abiertas",
    descripcion:     "Listado de preguntas técnicas y funcionales pendientes de respuesta por dominio.",
    formato:         "PDF",
    obligatorio:     true,
  },
];

// ── Email draft: TI SAG (primary technical contact) ───────────────────────────

const emailTiSag: EmailDraft = {
  id:        "EMAIL-TI-SAG-01",
  audiencia: "ti_sag",
  tono:      "tecnico",
  asunto:    `Validación de Fuentes de Información para Integración Operacional — Agentik × SAG`,
  para:      "[Jefe de TI / DBA — SAG]",
  cc:        [
    "[Analista Funcional — SAG]",
    "[Gerente de Proyecto — Agentik]",
  ],
  cuerpo: `Estimado equipo de Tecnología SAG,

Agradecemos el tiempo dedicado a la reunión técnica de mayo de 2026 y la disposición confirmada para apoyar esta integración.

Con base en lo discutido durante la reunión técnica, compartimos el resultado de nuestro análisis interno de requerimientos de información con el objetivo de validar conjuntamente las fuentes de datos más adecuadas para la integración entre Agentik y SAG.

OBJETIVO DE LA SOLICITUD

Para soportar procesos de análisis, seguimiento y gestión definidos por la organización, se requiere acceso de consulta (solo lectura) a información operacional registrada en SAG. En ningún caso Agentik realizará operaciones de escritura (INSERT, UPDATE, DELETE) sobre datos de SAG.

DOMINIOS DE INFORMACIÓN REQUERIDOS

Durante el análisis funcional se identificaron los siguientes ocho dominios de información relevantes para la integración. Como propuesta inicial se plantea exponerlos mediante vistas de solo lectura, aunque quedamos abiertos a la recomendación técnica que el equipo SAG considere más apropiada.

  1. vw_agentik_ventas       — Documentos de venta por línea de detalle
  2. vw_agentik_pagos        — Pagos asociados a documentos de cartera
  3. vw_agentik_cartera      — Documentos pendientes de cobro por cliente
  4. vw_agentik_recaudos     — Ingresos registrados en el sistema de cartera
  5. vw_agentik_bancos       — Movimientos del extracto bancario
  6. vw_agentik_inventario   — Saldos por referencia, talla y bodega
  7. vw_agentik_compras      — Órdenes de compra y recepciones
  8. vw_agentik_productos    — Maestro de artículos con atributos operativos

La especificación técnica detallada de campos requeridos y opcionales para cada vista se encuentra en el documento adjunto "Solicitud Formal de Vistas de Base de Datos".

DOCUMENTACIÓN ADJUNTA

El propósito de la documentación adjunta es facilitar la revisión técnica y reducir iteraciones posteriores, permitiendo validar desde el inicio qué información ya se encuentra disponible, qué información requiere ajustes y cuáles son las mejores alternativas de integración.

Se adjuntan tres documentos:
  • Resumen Ejecutivo — Contexto general de la integración.
  • Solicitud Formal de Vistas — Especificación técnica campo a campo.
  • Registro de Preguntas Abiertas — Consultas técnicas pendientes de validación.

PRÓXIMOS PASOS

Como siguiente paso proponemos una sesión conjunta de validación funcional y técnica para revisar:
  1. Disponibilidad de cada campo solicitado en las tablas fuente.
  2. Mecanismo de acceso más conveniente para SAG (vistas directas, conexión por VPN, etc.).
  3. Resolución de las preguntas técnicas incluidas en el registro adjunto.
  4. Cronograma de creación de las primeras vistas prioritarias.

Nuestro objetivo es construir una integración sostenible, simple de mantener y alineada con las mejores prácticas recomendadas por el equipo SAG. Estamos completamente abiertos a ajustar el enfoque técnico según sus recomendaciones.

Agradecemos su colaboración.

Atentamente,
Equipo de Integraciones — Agentik
`,
  adjuntos: SAG_EMAIL_ATTACHMENTS,
  notas: [
    "Reemplazar '[Jefe de TI / DBA — SAG]' con el nombre y correo real del contacto de SAG.",
    "Confirmar la versión del documento antes de enviar (actualmente v2.6.0).",
    "Adjuntar los tres PDFs generados desde los documentos del Executive Pack.",
  ],
};

// ── Email draft: Functional SAG (operational / business analyst) ──────────────

const emailFuncionalSag: EmailDraft = {
  id:        "EMAIL-FUNC-SAG-01",
  audiencia: "funcional_sag",
  tono:      "formal",
  asunto:    `Solicitud de Información Operacional — Integración Agentik × SAG`,
  para:      "[Analista Funcional / Coordinador Operativo — SAG]",
  cc:        [
    "[Jefe de TI — SAG]",
    "[Gerente de Proyecto — Agentik]",
  ],
  cuerpo: `Estimado(a) [Nombre],

Junto con saludar, enviamos la solicitud formal de acceso a información operacional del sistema SAG para la integración con Agentik.

RESUMEN DE LA SOLICITUD

Agentik requiere acceso de consulta (solo lectura) a la siguiente información:

  • Ventas: documentos de venta con detalle por producto, cliente y condiciones comerciales.
  • Cartera: documentos pendientes de cobro y estado de vencimiento por cliente.
  • Pagos y Recaudos: registros de pago e ingresos de cartera.
  • Bancos: movimientos del extracto bancario.
  • Inventario: saldos por referencia, talla y bodega.
  • Compras: órdenes de compra y recepciones de mercancía.
  • Productos: maestro de artículos con atributos comerciales.

El objetivo es consolidar esta información en reportes de gestión que faciliten el seguimiento operativo de la organización. En ningún caso Agentik modificará datos en SAG.

PREGUNTAS FUNCIONALES PENDIENTES

Incluimos un registro de preguntas funcionales que requieren su validación, relacionadas con la disponibilidad de ciertos campos y la forma en que SAG registra la información. Este registro está incluido en el documento adjunto.

Le agradecemos coordinar con el equipo de TI de SAG la revisión técnica correspondiente.

Quedamos atentos a cualquier consulta o aclaración.

Atentamente,
Equipo de Integraciones — Agentik
`,
  adjuntos: SAG_EMAIL_ATTACHMENTS,
  notas: [
    "Esta variante es más adecuada para enviar al analista funcional antes de la reunión técnica.",
    "El tono es menos técnico y hace énfasis en el propósito operacional, no en la arquitectura.",
  ],
};

// ── Email draft: Gerencia SAG ──────────────────────────────────────────────────

const emailGerenciaSag: EmailDraft = {
  id:        "EMAIL-GER-SAG-01",
  audiencia: "gerencia_sag",
  tono:      "ejecutivo",
  asunto:    `Integración Agentik × SAG — Documentación Formal de Requerimientos`,
  para:      "[Gerente de TI / Director Técnico — SAG]",
  cc:        [
    "[Jefe de TI — SAG]",
    "[Director de Proyecto — Agentik]",
  ],
  cuerpo: `Estimado(a) [Nombre],

En seguimiento a las conversaciones sostenidas con el equipo de SAG, Agentik formaliza por este medio la solicitud de acceso de consulta a información operacional del sistema SAG.

La integración propuesta tiene como objetivo consolidar en la plataforma Agentik los datos de ventas, cartera, pagos, bancos, inventario, compras y productos de la organización, sin generar impacto en los procesos operativos ni en el rendimiento del sistema SAG.

El método propuesto es la creación de ocho vistas de base de datos de solo lectura por parte del equipo técnico de SAG, con nomenclatura vw_agentik_[dominio], tal como fue discutido en la reunión de mayo de 2026.

Se adjunta la documentación técnica y funcional completa que incluye:
  • Resumen ejecutivo de la integración.
  • Especificación detallada de las ocho vistas solicitadas.
  • Registro de preguntas técnicas pendientes de validación.

El equipo de integraciones de Agentik está disponible para una reunión de alineación con el equipo técnico de SAG en la fecha que sea conveniente.

Agradecemos el apoyo brindado.

Atentamente,
[Nombre del Director de Proyecto — Agentik]
Agentik
`,
  adjuntos: SAG_EMAIL_ATTACHMENTS,
  notas: [
    "Esta variante es para comunicación a nivel gerencial. Es breve y hace énfasis en el acuerdo previo.",
    "Reemplazar el firmante con el nombre real del director o gerente de Agentik.",
  ],
};

// ── Internal coordination email (Agentik team) ────────────────────────────────

const emailInternoAgentik: EmailDraft = {
  id:        "EMAIL-INT-AGENTIK-01",
  audiencia: "equipo_tecnico_agentik",
  tono:      "tecnico",
  asunto:    `[INTERNAL] SAG Executive Pack — Checklist de Envío v${SAG_EXECUTIVE_SUMMARY_META.version}`,
  para:      "[Equipo de Integraciones — Agentik]",
  cc:        ["[Product Owner — Agentik]"],
  cuerpo: `Equipo,

Antes de enviar el paquete a SAG, verificar:

PRE-ENVÍO

  [ ] Los tres PDFs están generados y nombrados correctamente:
      - Agentik-SAG-Resumen-Ejecutivo-v2.6.0.pdf
      - Agentik-SAG-Solicitud-Vistas-v2.6.0.pdf
      - Agentik-SAG-Preguntas-Abiertas-v2.6.0.pdf

  [ ] El correo de destino del contacto de TI SAG está confirmado.
  [ ] El correo ha sido revisado por al menos dos personas del equipo.
  [ ] No hay referencias a Copilot, IA, roadmap ni módulos internos en ningún adjunto.
  [ ] La versión del documento (v2.6.0) es la versión final acordada.

POST-ENVÍO

  [ ] Registrar la fecha de envío en el tracker de la integración SAG.
  [ ] Crear ticket de seguimiento para la reunión de validación técnica.
  [ ] Actualizar el status de SAG_VIEW_REQUESTS a "submitted" para los 8 dominios.

`,
  adjuntos: [],
  notas: [
    "Este correo es solo para uso interno del equipo de Agentik.",
    "No enviar a SAG.",
  ],
};

// ── Email package ──────────────────────────────────────────────────────────────

export const SAG_EMAIL_PACKAGE: EmailDraft[] = [
  emailTiSag,
  emailFuncionalSag,
  emailGerenciaSag,
  emailInternoAgentik,
];

// ── Query helpers ──────────────────────────────────────────────────────────────

export function getEmailDraft(audiencia: EmailAudience): EmailDraft | undefined {
  return SAG_EMAIL_PACKAGE.find(e => e.audiencia === audiencia);
}

export function getPrimaryEmailDraft(): EmailDraft {
  return emailTiSag;
}

export function renderEmailText(draft: EmailDraft): string {
  const lines: string[] = [
    `ASUNTO: ${draft.asunto}`,
    `PARA:   ${draft.para}`,
    `CC:     ${draft.cc.join(", ")}`,
    "",
    "─".repeat(80),
    "",
    draft.cuerpo,
    "",
    "─".repeat(80),
    "",
    "ADJUNTOS:",
  ];

  for (const adj of draft.adjuntos) {
    const flag = adj.obligatorio ? "[OBLIGATORIO]" : "[OPCIONAL]";
    lines.push(`  ${flag} ${adj.nombreDocumento} (${adj.formato})`);
    lines.push(`           ${adj.descripcion}`);
  }

  if (draft.notas.length > 0) {
    lines.push("");
    lines.push("NOTAS INTERNAS:");
    for (const nota of draft.notas) {
      lines.push(`  • ${nota}`);
    }
  }

  return lines.join("\n");
}
