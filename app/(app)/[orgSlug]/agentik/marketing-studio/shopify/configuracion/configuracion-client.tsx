"use client";

/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/shopify/configuracion/configuracion-client.tsx
 *
 * SHOPIFY-CONFIGURATION-01 — Centro de Configuración y Diagnóstico
 * Client Component
 *
 * Architecture:
 *   - Receives all data as serializable props from page.tsx (server).
 *   - No Shopify API calls. No Prisma. No secrets.
 *   - All actions route through Copilot → Intent Resolver → Policy → Approval → Runtime.
 *   - Copilot lives in the right rail (right-ops-rail.tsx) — never in this canvas.
 *
 * Layout:
 *   1. ShopifyActivationTimeline    — activation guide (compact when connected)
 *   2. AgModulePrimaryPanel         — Estado de la conexión + info rows + CTA
 *   3. AgKpiGrid (8 cards)          — Conexión / Permisos / Sync / Webhooks /
 *                                     Publicación / Automatizaciones / Seguridad / Diagnóstico
 *   4. AgModuleSecondaryPanel       — Sincronización (job queue + webhook topics)
 *   5. AgModuleSecondaryPanel       — Diagnóstico técnico (signal rows)
 *   6. AgModuleSecondaryPanel       — Políticas del tenant (policy rows)
 *   7. OperationalSideDrawer        — 5 standard sections per card drawer
 */

import { useState }              from "react";
import { C, T, S }               from "@/lib/ui/tokens";
import { OperationalSideDrawer } from "@/components/workspace/operational-side-drawer";
import {
  AgKpiGrid,
  AgModulePrimaryPanel,
  AgModuleSecondaryPanel,
}                                from "@/components/agentik/operational-ux-kit";
import {
  ShopifyConnectCTA,
  ShopifyActivationTimeline,
  ShopifyKpiCard,
  ShopifyDrawerSection,
  ShopifyDrawerAction,
}                                from "@/components/marketing-studio/shopify/shopify-module-primitives";
import type {
  ShopifyConfigSummary,
  DiagnosticSignal,
}                                from "@/lib/marketing-studio/commerce/shopify-config-service";
import {
  CONNECTION_STATUS_LABEL,
  CONNECTION_HEALTH_LABEL,
}                                from "@/lib/integrations/integration-types";

// ── Types ──────────────────────────────────────────────────────────────────────

type CardKey =
  | "conexion"
  | "permisos"
  | "sincronizacion"
  | "webhooks"
  | "publicacion"
  | "automatizaciones"
  | "seguridad"
  | "diagnostico";

type DrawerState = { kind: "card"; key: CardKey } | null;
type ActionSpec  = { label: string; intent: string };

// ── Activation steps ───────────────────────────────────────────────────────────

const ACTIVATION_STEPS = [
  "Conectar Shopify",
  "Validar permisos",
  "Sincronizar productos",
  "Activar webhooks",
  "Habilitar operaciones",
];

// ── Card display config ────────────────────────────────────────────────────────

const CARD_LABELS: Record<CardKey, string> = {
  conexion:         "Estado de conexión",
  permisos:         "Permisos disponibles",
  sincronizacion:   "Sincronización",
  webhooks:         "Integraciones automáticas",
  publicacion:      "Publicación",
  automatizaciones: "Automatizaciones",
  seguridad:        "Seguridad",
  diagnostico:      "Diagnóstico",
};

// ── Pure helpers ───────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return "hace un momento";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} día${d !== 1 ? "s" : ""}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

// ── Local presentational components ───────────────────────────────────────────

function ConfigInfoRow({
  label,
  value,
  accent,
}: {
  label:   string;
  value:   string;
  accent?: string;
}) {
  return (
    <div style={{
      display:        "flex",
      justifyContent: "space-between",
      alignItems:     "center",
      padding:        `${S[2]}px 0`,
      borderBottom:   `1px solid ${C.line}`,
    }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
        {label}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: accent ?? C.ink }}>
        {value}
      </span>
    </div>
  );
}

function SignalRow({ signal }: { signal: DiagnosticSignal }) {
  const dotColor =
    signal.severity === "ok"       ? C.green   :
    signal.severity === "warning"  ? C.amber   :
    signal.severity === "critical" ? C.red     : C.inkFaint;

  const labelColor =
    signal.severity === "critical" ? C.red   :
    signal.severity === "warning"  ? C.amber : C.ink;

  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:          S[3],
      padding:      `${S[2]}px 0`,
      borderBottom: `1px solid ${C.line}`,
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: "50%",
        background: dotColor, flexShrink: 0,
      }} />
      <span style={{ flex: 1, fontFamily: T.mono, fontSize: T.sz.xs, color: labelColor }}>
        {signal.label}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
        {signal.detail}
      </span>
    </div>
  );
}

function PolicyRow({
  label,
  enabled,
  description,
}: {
  label:       string;
  enabled:     boolean;
  description: string;
}) {
  return (
    <div style={{
      display:      "flex",
      alignItems:   "flex-start",
      gap:          S[3],
      padding:      `${S[2]}px 0`,
      borderBottom: `1px solid ${C.line}`,
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: "50%", marginTop: 5,
        background: enabled ? C.green : C.inkFaint, flexShrink: 0,
      }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>
          {label}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2 }}>
          {description}
        </div>
      </div>
      <span style={{
        fontFamily: T.mono, fontSize: T.sz.xs, flexShrink: 0,
        color: enabled ? C.green : C.inkFaint,
      }}>
        {enabled ? "Activa" : "Desactivada"}
      </span>
    </div>
  );
}

// ── Action builders ────────────────────────────────────────────────────────────

function getCardDrawerActions(key: CardKey, summary: ShopifyConfigSummary | null): ActionSpec[] {
  const connected = summary?.connected ?? false;
  switch (key) {
    case "conexion":
      return connected
        ? [
            { label: "Validar conexión",   intent: "shopify.connection.validate"  },
            { label: "Reconectar Shopify", intent: "shopify.connection.reconnect" },
          ]
        : [
            { label: "Conectar Shopify",   intent: "shopify.connection.connect"   },
          ];
    case "permisos":
      return [
        { label: "Revisar permisos disponibles", intent: "shopify.permissions.review"          },
        { label: "Solicitar permisos faltantes", intent: "shopify.permissions.request_missing" },
        { label: "Ver acciones bloqueadas",      intent: "shopify.permissions.view_blocked"    },
      ];
    case "sincronizacion":
      return [
        { label: "Sincronizar productos",            intent: "shopify.sync.products"      },
        { label: "Sincronizar promociones",          intent: "shopify.sync.promotions"    },
        { label: "Sincronizar pedidos",              intent: "shopify.sync.orders"        },
        { label: "Revisar errores de sincronización", intent: "shopify.sync.review_errors" },
      ];
    case "webhooks":
      return [
        { label: "Registrar webhooks",        intent: "shopify.webhooks.register"      },
        { label: "Validar webhooks activos",  intent: "shopify.webhooks.validate"      },
        { label: "Revisar eventos recibidos", intent: "shopify.webhooks.review_events" },
      ];
    case "publicacion":
      return [
        { label: "Ver flujo de publicación",        intent: "shopify.publication.view_flow"         },
        { label: "Revisar aprobaciones pendientes", intent: "shopify.publication.review_approvals"   },
        { label: "Ver historial de publicaciones",  intent: "shopify.publication.view_history"       },
      ];
    case "automatizaciones":
      return [
        { label: "Habilitar automatizaciones",          intent: "shopify.automation.enable"          },
        { label: "Revisar políticas de automatización", intent: "shopify.automation.review_policies" },
        { label: "Ver acciones automáticas recientes",  intent: "shopify.automation.view_recent"     },
      ];
    case "seguridad":
      return [
        { label: "Revisar Vault",        intent: "shopify.security.review_vault"    },
        { label: "Rotar credenciales",   intent: "shopify.security.rotate_creds"    },
        { label: "Validar acceso",       intent: "shopify.security.validate_access" },
      ];
    case "diagnostico":
      return [
        { label: "Ver todas las señales",          intent: "shopify.diagnostics.view_signals"   },
        { label: "Revisar errores recientes",      intent: "shopify.diagnostics.review_errors"  },
        { label: "Validar configuración completa", intent: "shopify.diagnostics.validate_config" },
      ];
  }
}

function getCardCopilotAnalysis(key: CardKey, s: ShopifyConfigSummary | null): string {
  const connected = s?.connected ?? false;
  switch (key) {
    case "conexion":
      return connected
        ? "La conexión está activa. Puedo validar el token en Vault, reconectar la tienda o diagnosticar errores de autenticación."
        : "La tienda no está conectada. Para habilitar las operaciones de Shopify necesito el dominio y las credenciales de acceso configuradas.";
    case "permisos":
      return s?.scopesOk
        ? "Los permisos están completos. Todas las operaciones de Agentik tienen los scopes necesarios para ejecutarse."
        : `Hay ${s?.missingScopes.length ?? 0} permiso${(s?.missingScopes.length ?? 0) !== 1 ? "s" : ""} recomendado${(s?.missingScopes.length ?? 0) !== 1 ? "s" : ""} sin configurar. Esto puede bloquear operaciones de sincronización o publicación.`;
    case "sincronizacion":
      return s && s.pendingJobs > 0
        ? `Hay ${s.pendingJobs} trabajo${s.pendingJobs !== 1 ? "s" : ""} en la cola de sincronización. Puedo activar la ejecución o revisar errores si alguno falló.`
        : "La cola de sincronización está al día. No hay trabajos pendientes en este momento.";
    case "webhooks":
      return s?.webhooksConfigured
        ? "Las integraciones automáticas están configuradas. Agentik puede recibir y verificar eventos de Shopify en tiempo real."
        : "Las integraciones automáticas no están configuradas. Sin ellas, Agentik opera solo con sincronización manual y no puede reaccionar a eventos en tiempo real.";
    case "publicacion":
      return s?.policies.publicationRequiresApproval
        ? "La publicación de productos requiere aprobación explícita. Puedo mostrarte las aprobaciones pendientes o revisar el historial."
        : "La publicación está habilitada sin aprobación requerida. Puedo ayudarte a revisar el flujo o activar controles adicionales.";
    case "automatizaciones":
      return s?.policies.automationsEnabled
        ? "Las automatizaciones están habilitadas. Puedo ejecutar acciones automáticas según las políticas configuradas del tenant."
        : "Las automatizaciones están desactivadas. Todas las acciones requieren iniciativa manual o aprobación explícita.";
    case "seguridad":
      return s?.hasToken
        ? "La credencial de acceso está almacenada en Vault. Puedo ayudarte a rotar credenciales, validar el acceso o revisar el estado del Vault."
        : "No se encontró una credencial de acceso en Vault. Este es el bloqueo principal para que Agentik opere con Shopify.";
    case "diagnostico": {
      const criticals = s?.signals.filter(x => x.severity === "critical").length ?? 0;
      const warnings  = s?.signals.filter(x => x.severity === "warning").length  ?? 0;
      if (criticals > 0)
        return `Hay ${criticals} señal${criticals !== 1 ? "es" : ""} crítica${criticals !== 1 ? "s" : ""} que requieren atención inmediata. Puedo guiarte para resolverlas.`;
      if (warnings > 0)
        return `Hay ${warnings} advertencia${warnings !== 1 ? "s" : ""} activa${warnings !== 1 ? "s" : ""}. Son no bloqueantes pero afectan la operación completa.`;
      return "No hay señales críticas ni advertencias activas. La configuración de Shopify está operativa.";
    }
  }
}

function getCardResumen(key: CardKey, s: ShopifyConfigSummary | null): string {
  switch (key) {
    case "conexion":
      return s?.connected
        ? `La tienda ${s.shopDomain ?? "Shopify"} está conectada y la credencial de acceso está disponible en Vault.`
        : "La tienda Shopify no está conectada. Se requiere configurar el dominio y las credenciales de acceso.";
    case "permisos":
      return s?.connected
        ? `Se detectaron ${s.scopes.length} permisos. ${s.missingScopes.length > 0 ? `Faltan ${s.missingScopes.length} permisos recomendados para operación completa.` : "Todos los permisos recomendados están disponibles."}`
        : "Los permisos no pueden verificarse sin conexión activa.";
    case "sincronizacion":
      return s?.connected
        ? s.pendingJobs === 0
          ? "La cola de sincronización está al día."
          : `Hay ${s.pendingJobs} trabajo${s.pendingJobs !== 1 ? "s" : ""} en la cola esperando ejecución.`
        : "La sincronización requiere una conexión activa a Shopify.";
    case "webhooks":
      return s?.webhooksConfigured
        ? `Las integraciones automáticas están configuradas. Agentik puede recibir ${s.webhookTopics.length} tipo${s.webhookTopics.length !== 1 ? "s" : ""} de evento.`
        : "Las integraciones automáticas no están configuradas. La sincronización opera en modo manual únicamente.";
    case "publicacion":
      return `La publicación de productos ${s?.policies.publicationRequiresApproval ? "requiere aprobación explícita antes de activarse en Shopify" : "no requiere aprobación y puede ejecutarse directamente"}.`;
    case "automatizaciones":
      return s?.policies.automationsEnabled
        ? "Las automatizaciones están activas. Los agentes pueden ejecutar acciones según las reglas del tenant."
        : "Las automatizaciones están desactivadas. Todas las acciones requieren iniciativa manual.";
    case "seguridad":
      return s?.hasToken
        ? "La credencial de acceso está almacenada de forma segura en Vault y nunca se expone en registros ni en la interfaz."
        : "No se encontró una credencial de acceso en Vault. Este es el bloqueo principal para las operaciones de Shopify.";
    case "diagnostico": {
      const c = s?.signals.filter(x => x.severity === "critical").length ?? 0;
      const w = s?.signals.filter(x => x.severity === "warning").length  ?? 0;
      return c > 0
        ? `Hay ${c} señal${c !== 1 ? "es" : ""} crítica${c !== 1 ? "s" : ""} activa${c !== 1 ? "s" : ""} que requieren atención inmediata.`
        : w > 0
          ? `Hay ${w} advertencia${w !== 1 ? "s" : ""} en la configuración.`
          : "No se detectaron señales críticas. La configuración está operativa.";
    }
  }
}

// ── Drawer detail renderers ────────────────────────────────────────────────────

function DrawerStateDetail({ cardKey, s }: { cardKey: CardKey; s: ShopifyConfigSummary | null }) {
  if (!s) {
    return (
      <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, margin: 0 }}>
        Sin datos disponibles.
      </p>
    );
  }
  switch (cardKey) {
    case "conexion":
      return (
        <div>
          <ConfigInfoRow label="Estado"         value={CONNECTION_STATUS_LABEL[s.connectionStatus] ?? s.connectionStatus} accent={s.connected ? C.green : C.amber} />
          <ConfigInfoRow label="Salud"          value={CONNECTION_HEALTH_LABEL[s.connectionHealth] ?? s.connectionHealth} />
          <ConfigInfoRow label="Token en Vault" value={s.hasToken ? "Disponible" : "No encontrado"} accent={s.hasToken ? C.green : C.red} />
          <ConfigInfoRow label="Fuente"         value={s.source === "vault" ? "Vault (Producción)" : s.source === "env_dev" ? ".env (Desarrollo)" : "Sin configurar"} />
        </div>
      );
    case "permisos":
      return (
        <div>
          <ConfigInfoRow label="Scopes activos"   value={`${s.scopes.length}`} />
          <ConfigInfoRow
            label="Scopes faltantes"
            value={
              s.missingScopes.length === 0
                ? "Ninguno"
                : s.missingScopes.slice(0, 3).join(", ") +
                  (s.missingScopes.length > 3 ? ` +${s.missingScopes.length - 3}` : "")
            }
            accent={s.missingScopes.length > 0 ? C.amber : C.green}
          />
          <ConfigInfoRow label="Estado general" value={s.scopesOk ? "Completo" : "Incompleto"} accent={s.scopesOk ? C.green : C.amber} />
        </div>
      );
    case "sincronizacion":
      return (
        <div>
          <ConfigInfoRow label="Trabajos pendientes" value={`${s.pendingJobs}`} accent={s.pendingJobs > 10 ? C.amber : C.green} />
          <ConfigInfoRow label="Integraciones auto."  value={s.webhooksConfigured ? "Configuradas" : "No configuradas"} />
          <ConfigInfoRow label="Sync automático"     value={s.policies.autoSyncEnabled ? "Activo" : "Manual"} />
        </div>
      );
    case "webhooks":
      return (
        <div>
          <ConfigInfoRow label="Configurados"  value={s.webhooksConfigured ? "Sí" : "No"} accent={s.webhooksConfigured ? C.green : C.amber} />
          <ConfigInfoRow label="Temas activos" value={s.webhookTopics.length > 0 ? `${s.webhookTopics.length} temas` : "Ninguno"} />
        </div>
      );
    case "publicacion":
      return (
        <div>
          <ConfigInfoRow label="Requiere aprobación" value={s.policies.publicationRequiresApproval ? "Sí" : "No"} />
          <ConfigInfoRow label="Conexión"            value={s.connected ? "Activa" : "Sin conexión"} accent={s.connected ? C.green : C.amber} />
        </div>
      );
    case "automatizaciones":
      return (
        <div>
          <ConfigInfoRow label="Automatizaciones"   value={s.policies.automationsEnabled      ? "Habilitadas" : "Desactivadas"} accent={s.policies.automationsEnabled ? C.green : C.inkFaint} />
          <ConfigInfoRow label="Acciones sensibles" value={s.policies.sensitiveActionsBlocked ? "Bloqueadas"  : "Sin bloqueo"} accent={s.policies.sensitiveActionsBlocked ? C.amber : C.inkFaint} />
          <ConfigInfoRow label="Sync automático"    value={s.policies.autoSyncEnabled         ? "Habilitado"  : "Manual"} />
        </div>
      );
    case "seguridad":
      return (
        <div>
          <ConfigInfoRow label="Token de acceso"           value={s.hasToken ? "Disponible en Vault" : "No encontrado"} accent={s.hasToken ? C.green : C.red} />
          <ConfigInfoRow label="Fuente"                    value={s.source === "vault" ? "Vault" : s.source === "env_dev" ? ".env" : "—"} />
          <ConfigInfoRow label="Acciones sensibles"        value={s.policies.sensitiveActionsBlocked ? "Bloqueadas" : "Sin bloqueo"} />
        </div>
      );
    case "diagnostico":
      return (
        <div>
          {s.signals.map(sig => (
            <SignalRow key={sig.id} signal={sig} />
          ))}
        </div>
      );
  }
}

function DrawerDataDetail({ cardKey, s }: { cardKey: CardKey; s: ShopifyConfigSummary | null }) {
  if (!s) {
    return (
      <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, margin: 0 }}>
        Sin datos relevantes.
      </p>
    );
  }
  switch (cardKey) {
    case "conexion":
      return (
        <div>
          <ConfigInfoRow label="Dominio"           value={s.shopDomain ?? "—"} />
          <ConfigInfoRow label="Tienda"            value={s.storeName  ?? "—"} />
          <ConfigInfoRow label="Conectado desde"   value={fmtDate(s.connectedAt)} />
          <ConfigInfoRow label="Última validación" value={relativeTime(s.lastHealthCheckAt)} />
          {s.errorMessage && (
            <ConfigInfoRow label="Último error" value={s.errorMessage} accent={C.red} />
          )}
        </div>
      );
    case "permisos":
      return (
        <div>
          {s.scopes.length > 0 ? (
            <>
              {s.scopes.slice(0, 6).map(scope => (
                <ConfigInfoRow key={scope} label={scope} value="Activo" accent={C.green} />
              ))}
              {s.scopes.length > 6 && (
                <p style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, margin: `${S[2]}px 0 0` }}>
                  + {s.scopes.length - 6} permisos adicionales
                </p>
              )}
            </>
          ) : (
            <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, margin: 0 }}>
              Sin permisos registrados.
            </p>
          )}
        </div>
      );
    case "sincronizacion":
      return (
        <div>
          <ConfigInfoRow label="Proveedor"        value="Shopify" />
          <ConfigInfoRow label="Trabajos en cola" value={`${s.pendingJobs}`} />
          <ConfigInfoRow label="Modo"             value={s.policies.autoSyncEnabled ? "Automático" : "Manual"} />
        </div>
      );
    case "webhooks":
      return (
        <div>
          {s.webhookTopics.length > 0 ? (
            s.webhookTopics.map(topic => (
              <ConfigInfoRow key={topic} label={topic} value="Subscrito" accent={C.green} />
            ))
          ) : (
            <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, margin: 0 }}>
              Sin temas de webhook configurados.
            </p>
          )}
        </div>
      );
    case "publicacion":
      return (
        <div>
          <ConfigInfoRow label="Flujo de aprobación" value={s.policies.publicationRequiresApproval ? "Requerido" : "No requerido"} />
          <ConfigInfoRow label="Dominio destino"     value={s.shopDomain ?? "—"} />
          <ConfigInfoRow label="Estado de la tienda" value={s.connected ? "Disponible" : "No disponible"} accent={s.connected ? C.green : C.amber} />
        </div>
      );
    case "automatizaciones":
      return (
        <div>
          <ConfigInfoRow label="Publicaciones automáticas"  value={!s.policies.publicationRequiresApproval ? "Habilitadas" : "Requieren aprobación"} />
          <ConfigInfoRow label="Sincronización automática"  value={s.policies.autoSyncEnabled ? "Activa" : "Manual"} />
          <ConfigInfoRow label="Automatizaciones de agente" value={s.policies.automationsEnabled ? "Activas" : "Desactivadas"} />
        </div>
      );
    case "seguridad":
      return (
        <div>
          <ConfigInfoRow label="Almacenamiento"       value="Vault (AES-256-GCM)" />
          <ConfigInfoRow label="Rotación"             value="Manual — requiere solicitud explícita" />
          <ConfigInfoRow label="Exposición del token" value="Nunca — exclusivo en servidor" accent={C.green} />
        </div>
      );
    case "diagnostico": {
      const okCount   = s.signals.filter(x => x.severity === "ok").length;
      const warnCount = s.signals.filter(x => x.severity === "warning").length;
      const critCount = s.signals.filter(x => x.severity === "critical").length;
      return (
        <div>
          <ConfigInfoRow label="Total de señales" value={`${s.signals.length}`} />
          <ConfigInfoRow label="Sin problemas"    value={`${okCount}`}    accent={C.green} />
          <ConfigInfoRow label="Advertencias"     value={`${warnCount}`}  accent={warnCount > 0 ? C.amber : C.green} />
          <ConfigInfoRow label="Críticas"         value={`${critCount}`}  accent={critCount > 0 ? C.red   : C.green} />
        </div>
      );
    }
  }
}

// ── Main component ─────────────────────────────────────────────────────────────

interface ConfiguracionClientProps {
  orgSlug:    string;
  connected:  boolean;
  shopDomain: string;
  summary:    ShopifyConfigSummary | null;
}

export function ConfiguracionClient({
  orgSlug,
  connected,
  shopDomain,
  summary,
}: ConfiguracionClientProps) {
  const [drawer, setDrawer]          = useState<DrawerState>(null);
  const [executing, setExecuting]    = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ status: string; message: string } | null>(null);

  // ── Action handler → Copilot pipeline ─────────────────────────────────────

  async function handleAction(intent: string) {
    setExecuting(intent);
    setActionResult(null);
    try {
      const resp = await fetch(
        `/api/orgs/${orgSlug}/marketing-studio/shopify/execute`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ intent }),
        },
      );
      const data = await resp.json();
      setActionResult({
        status:  data.ok ? "ok" : "error",
        message: (data.summary as string | undefined) ?? (data.error as string | undefined) ?? "Acción procesada",
      });
    } catch {
      setActionResult({ status: "error", message: "Error al procesar la acción" });
    } finally {
      setExecuting(null);
    }
  }

  // ── Derived display values ─────────────────────────────────────────────────

  const s             = summary;
  const criticalCount = s?.signals.filter(sig => sig.severity === "critical").length ?? 0;
  const warningCount  = s?.signals.filter(sig => sig.severity === "warning").length  ?? 0;
  const syncOk        = !s || s.pendingJobs === 0;
  const permissionsOk = s?.scopesOk ?? false;

  // ── Drawer helpers ─────────────────────────────────────────────────────────

  function openCard(key: CardKey) {
    setDrawer({ kind: "card", key });
    setActionResult(null);
  }

  function closeDrawer() {
    setDrawer(null);
    setActionResult(null);
  }

  const activeCardKey = drawer?.kind === "card" ? drawer.key : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* 1. Activation timeline */}
      <div style={{ marginBottom: S[3] }}>
        <ShopifyActivationTimeline
          steps={ACTIVATION_STEPS}
          connected={connected}
          orgSlug={orgSlug}
          compactText={
            connected
              ? `Shopify conectado · ${shopDomain}`
              : "Completa los pasos para habilitar las operaciones de Shopify"
          }
          criticalCount={criticalCount}
        />
      </div>

      {/* 2. Primary panel: Estado de la conexión */}
      <div style={{ marginBottom: S[4] }}>
        <AgModulePrimaryPanel
          moduleLabel="Estado de la conexión"
          headline={connected ? (shopDomain || "Tienda conectada") : "Sin conexión a Shopify"}
          headlineSub={
            connected && s
              ? CONNECTION_HEALTH_LABEL[s.connectionHealth] ?? null
              : null
          }
          action={
            connected
              ? { label: "Reconectar", onClick: () => handleAction("shopify.connection.reconnect") }
              : undefined
          }
          accent={connected ? undefined : "#d97706"}
        >
          {s ? (
            <div>
              <ConfigInfoRow label="Dominio"             value={s.shopDomain ?? "—"} />
              <ConfigInfoRow label="Nombre de la tienda" value={s.storeName  ?? "—"} />
              <ConfigInfoRow
                label="Estado"
                value={CONNECTION_STATUS_LABEL[s.connectionStatus] ?? s.connectionStatus}
                accent={connected ? C.green : C.amber}
              />
              <ConfigInfoRow
                label="Token de acceso"
                value={s.hasToken ? "Disponible en Vault" : "No encontrado"}
                accent={s.hasToken ? C.green : C.red}
              />
              <ConfigInfoRow label="Última validación"  value={relativeTime(s.lastHealthCheckAt)} />
              <ConfigInfoRow
                label="Permisos configurados"
                value={`${s.scopes.length} scopes`}
                accent={s.scopesOk ? C.green : C.amber}
              />
              <ConfigInfoRow
                label="Entorno"
                value={
                  s.source === "vault"   ? "Producción (Vault)"  :
                  s.source === "env_dev" ? "Desarrollo (.env)"   : "Sin configurar"
                }
              />
              <ConfigInfoRow label="Conectado desde" value={fmtDate(s.connectedAt)} />
            </div>
          ) : (
            <div>
              <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, margin: `0 0 ${S[3]}px` }}>
                Conecta tu tienda Shopify para habilitar publicación de productos,
                sincronización automática, webhooks y gestión de promociones desde Agentik.
              </p>
              <ShopifyConnectCTA orgSlug={orgSlug} label="Conectar tienda Shopify" />
            </div>
          )}
        </AgModulePrimaryPanel>
      </div>

      {/* 3. KpiGrid — 8 indicator cards */}
      <div style={{ marginBottom: S[4] }}>
        <AgKpiGrid>
          <ShopifyKpiCard
            icon="⚡"
            label="Conexión"
            value={connected ? "Activa" : "Sin conexión"}
            sub={connected && s ? CONNECTION_STATUS_LABEL[s.connectionStatus] : null}
            noDataHint="Requiere integración con Shopify."
            variant={connected ? "ok" : "critical"}
            onClick={() => openCard("conexion")}
          />
          <ShopifyKpiCard
            icon="🔑"
            label="Permisos"
            value={s ? `${s.scopes.length} activos` : null}
            sub={s?.missingScopes.length ? `${s.missingScopes.length} faltantes` : "Completos"}
            noDataHint="Configura la conexión para ver permisos."
            variant={!s ? "neutral" : permissionsOk ? "ok" : "warning"}
            onClick={() => openCard("permisos")}
          />
          <ShopifyKpiCard
            icon="🔄"
            label="Sincronización"
            value={s ? (s.pendingJobs === 0 ? "Al día" : `${s.pendingJobs} pendientes`) : null}
            sub={s ? (s.pendingJobs > 0 ? "Trabajos en cola" : "Sin trabajos") : null}
            noDataHint="Requiere conexión activa."
            variant={!s ? "neutral" : syncOk ? "ok" : "warning"}
            onClick={() => openCard("sincronizacion")}
          />
          <ShopifyKpiCard
            icon="📡"
            label="Integraciones automáticas"
            value={s ? (s.webhooksConfigured ? "Configuradas" : "No configuradas") : null}
            sub={s ? `${s.webhookTopics.length} temas` : null}
            noDataHint="Requiere conexión activa."
            variant={!s ? "neutral" : s.webhooksConfigured ? "ok" : "warning"}
            onClick={() => openCard("webhooks")}
          />
          <ShopifyKpiCard
            icon="📤"
            label="Publicación"
            value={connected ? "Disponible" : "Bloqueada"}
            sub={s?.policies.publicationRequiresApproval ? "Requiere aprobación" : "Sin aprobación requerida"}
            noDataHint="Requiere conexión activa."
            variant={connected ? "ok" : "neutral"}
            onClick={() => openCard("publicacion")}
          />
          <ShopifyKpiCard
            icon="⚙"
            label="Automatizaciones"
            value={s ? (s.policies.automationsEnabled ? "Habilitadas" : "Desactivadas") : null}
            sub={s?.policies.sensitiveActionsBlocked ? "Acciones sensibles bloqueadas" : null}
            noDataHint="Requiere conexión activa."
            variant={!s ? "neutral" : s.policies.automationsEnabled ? "ok" : "neutral"}
            onClick={() => openCard("automatizaciones")}
          />
          <ShopifyKpiCard
            icon="🔒"
            label="Seguridad"
            value={s ? (s.hasToken ? "Token activo" : "Sin token") : null}
            sub={
              s
                ? `Vault · ${s.source === "vault" ? "Producción" : s.source === "env_dev" ? "Desarrollo" : "—"}`
                : null
            }
            noDataHint="Estado de credenciales no disponible."
            variant={!s ? "neutral" : s.hasToken ? "ok" : "critical"}
            onClick={() => openCard("seguridad")}
          />
          <ShopifyKpiCard
            icon="🩺"
            label="Diagnóstico"
            value={
              criticalCount > 0
                ? `${criticalCount} crítico${criticalCount !== 1 ? "s" : ""}`
                : warningCount > 0
                  ? `${warningCount} advertencia${warningCount !== 1 ? "s" : ""}`
                  : "Sin alertas"
            }
            sub={s ? `${s.signals.length} señales totales` : null}
            noDataHint="Diagnóstico no disponible sin conexión."
            variant={criticalCount > 0 ? "critical" : warningCount > 0 ? "warning" : "ok"}
            onClick={() => openCard("diagnostico")}
          />
        </AgKpiGrid>
      </div>

      {/* 4. Secondary panel: Sincronización */}
      <div style={{ marginBottom: S[4] }}>
        <AgModuleSecondaryPanel label="Sincronización">
          {s ? (
            <div>
              <ConfigInfoRow
                label="Trabajos pendientes"
                value={`${s.pendingJobs}`}
                accent={s.pendingJobs > 10 ? C.amber : C.green}
              />
              <ConfigInfoRow
                label="Webhooks configurados"
                value={s.webhooksConfigured ? "Sí" : "No"}
                accent={s.webhooksConfigured ? C.green : C.amber}
              />
              <ConfigInfoRow
                label="Modo de sincronización"
                value={s.policies.autoSyncEnabled ? "Automático" : "Manual"}
              />
              <ConfigInfoRow
                label="Temas de webhook"
                value={s.webhookTopics.length > 0 ? s.webhookTopics.join(" · ") : "Sin temas configurados"}
              />
            </div>
          ) : (
            <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, margin: 0 }}>
              La sincronización estará disponible una vez que la tienda esté conectada.
            </p>
          )}
        </AgModuleSecondaryPanel>
      </div>

      {/* 5. Diagnostic signals panel */}
      <div style={{ marginBottom: S[4] }}>
        <AgModuleSecondaryPanel label="Diagnóstico técnico">
          {s && s.signals.length > 0 ? (
            <div>
              {s.signals.map(signal => (
                <SignalRow key={signal.id} signal={signal} />
              ))}
            </div>
          ) : (
            <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, margin: 0 }}>
              {connected
                ? "No hay señales de diagnóstico disponibles."
                : "El diagnóstico técnico estará disponible una vez que la tienda esté conectada."}
            </p>
          )}
        </AgModuleSecondaryPanel>
      </div>

      {/* 6. Policies panel */}
      <div style={{ marginBottom: S[4] }}>
        <AgModuleSecondaryPanel label="Políticas del tenant">
          {s ? (
            <div>
              <PolicyRow
                label="Publicación requiere aprobación"
                enabled={s.policies.publicationRequiresApproval}
                description="Toda publicación en Shopify pasa por el flujo de aprobación de Agentik."
              />
              <PolicyRow
                label="Promociones requieren aprobación"
                enabled={s.policies.promotionsRequireApproval}
                description="La creación y activación de descuentos requiere aprobación explícita."
              />
              <PolicyRow
                label="Sincronización automática"
                enabled={s.policies.autoSyncEnabled}
                description="Agentik sincroniza productos y precios automáticamente sin intervención manual."
              />
              <PolicyRow
                label="Automatizaciones habilitadas"
                enabled={s.policies.automationsEnabled}
                description="Los agentes pueden ejecutar acciones automáticas según las reglas del tenant."
              />
              <PolicyRow
                label="Acciones sensibles bloqueadas"
                enabled={s.policies.sensitiveActionsBlocked}
                description="Eliminaciones, desconexiones y cambios de credenciales requieren confirmación manual."
              />
            </div>
          ) : (
            <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, margin: 0 }}>
              Las políticas del tenant estarán disponibles una vez que la tienda esté conectada.
            </p>
          )}
        </AgModuleSecondaryPanel>
      </div>

      {/* 7. Drawer */}
      <OperationalSideDrawer
        open={drawer !== null}
        onClose={closeDrawer}
        title={activeCardKey ? CARD_LABELS[activeCardKey] : ""}
        subtitle="Configuración Shopify"
      >
        {activeCardKey && (() => {
          const actions = getCardDrawerActions(activeCardKey, summary);
          const copilot = getCardCopilotAnalysis(activeCardKey, summary);
          return (
            <>
              <ShopifyDrawerSection title="Resumen">
                <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, lineHeight: 1.6, margin: 0 }}>
                  {getCardResumen(activeCardKey, summary)}
                </p>
              </ShopifyDrawerSection>

              <ShopifyDrawerSection title="Estado actual">
                <DrawerStateDetail cardKey={activeCardKey} s={summary} />
              </ShopifyDrawerSection>

              <ShopifyDrawerSection title="Datos relevantes">
                <DrawerDataDetail cardKey={activeCardKey} s={summary} />
              </ShopifyDrawerSection>

              <ShopifyDrawerSection title="Análisis de Copilot">
                <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, lineHeight: 1.6, margin: 0 }}>
                  {copilot}
                </p>
              </ShopifyDrawerSection>

              <ShopifyDrawerSection title="Acciones sugeridas">
                {actions.map(a => (
                  <ShopifyDrawerAction
                    key={a.intent}
                    label={a.label}
                    intent={a.intent}
                    executing={executing}
                    result={actionResult && !executing ? actionResult : undefined}
                    onExecute={handleAction}
                  />
                ))}
              </ShopifyDrawerSection>
            </>
          );
        })()}
      </OperationalSideDrawer>
    </>
  );
}
