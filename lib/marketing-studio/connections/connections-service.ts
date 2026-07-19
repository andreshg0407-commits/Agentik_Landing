/**
 * lib/marketing-studio/connections/connections-service.ts
 *
 * MARKETING-CONNECTIONS-01 — Centro de Integraciones de Marketing y Publicidad
 *
 * SERVER ONLY — nunca importar en client components.
 *
 * Reutiliza la infraestructura existente:
 *   - listConnectionsByProvider()   → lib/integrations/integration-repository.ts
 *   - getAdsAccountsConfig()        → lib/marketing-studio/ads/ads-accounts-config-service.ts
 *
 * Los secretos permanecen exclusivamente en el Vault.
 * Este servicio solo deriva estados, diagnósticos y recursos desde
 * los campos seguros ya almacenados en IntegrationConnection y TenantAdsConfig.
 */

import "server-only";

import { listConnectionsByProvider }         from "@/lib/integrations/integration-repository";
import { getAdsAccountsConfig }              from "@/lib/marketing-studio/ads/ads-accounts-config-service";
import type { IntegrationConnectionSnapshot } from "@/lib/integrations/integration-types";
import type { TenantAdsConfigData }           from "@/lib/marketing-studio/ads/ads-accounts-types";
import type {
  IntegracionCard,
  IntegracionCheck,
  IntegracionEstado,
  IntegracionPermiso,
  IntegracionRecurso,
  ConexionesResumen,
  ConexionesApiResponse,
} from "./connections-types";

// ── Platform group catalog ─────────────────────────────────────────────────────

interface PlatformDef {
  group:        string;
  label:        string;
  description:  string;
  color:        string;
  symbol:       string;
  providers:    string[];         // Which IntegrationProvider keys belong to this group
  adsConfig:    string | null;    // TenantAdsConfig platform key for this group
  connectPath:  string | null;    // OAuth path (null = not yet available)
  proximamente: boolean;
}

const PLATFORM_CATALOG: PlatformDef[] = [
  {
    group:       "meta",
    label:       "Meta",
    description: "Facebook · Instagram · Meta Ads",
    color:       "#1877F2",
    symbol:      "🔵",
    providers:   ["meta", "meta_instagram", "meta_facebook", "meta_ads"],
    adsConfig:   "meta",
    connectPath: "meta/connect",
    proximamente: false,
  },
  {
    group:       "tiktok",
    label:       "TikTok",
    description: "Videos cortos · TikTok Ads",
    color:       "#010101",
    symbol:      "🎵",
    providers:   ["tiktok"],
    adsConfig:   "tiktok",
    connectPath: "tiktok/connect",
    proximamente: false,
  },
  {
    group:       "shopify",
    label:       "Shopify",
    description: "Tienda online · Productos · Inventario",
    color:       "#96BF48",
    symbol:      "🛍️",
    providers:   ["shopify"],
    adsConfig:   null,
    connectPath: null,
    proximamente: false,
  },
  {
    group:       "whatsapp",
    label:       "WhatsApp Business",
    description: "Mensajería · Catálogo · Automatización",
    color:       "#25D366",
    symbol:      "💬",
    providers:   ["meta_whatsapp", "whatsapp"],
    adsConfig:   null,
    connectPath: null,
    proximamente: false,
  },
  {
    group:       "youtube",
    label:       "YouTube",
    description: "Canal de video · Shorts · Analítica",
    color:       "#FF0000",
    symbol:      "▶️",
    providers:   ["youtube"],
    adsConfig:   null,
    connectPath: "google/youtube/connect",
    proximamente: false,
  },
  {
    group:       "google",
    label:       "Google Ads",
    description: "Búsqueda · Display · Shopping",
    color:       "#4285F4",
    symbol:      "🔍",
    providers:   ["google", "google_ads"],
    adsConfig:   "google",
    connectPath: "google/ads/connect",
    proximamente: false,
  },
  // ── Próximamente ──────────────────────────────────────────────────────────────
  {
    group:       "linkedin",
    label:       "LinkedIn",
    description: "Marketing B2B · Contenido profesional",
    color:       "#0A66C2",
    symbol:      "💼",
    providers:   ["linkedin"],
    adsConfig:   null,
    connectPath: null,
    proximamente: true,
  },
  {
    group:       "x",
    label:       "X (Twitter)",
    description: "Comunidad · Trending · Ads",
    color:       "#000000",
    symbol:      "✖️",
    providers:   ["x", "twitter"],
    adsConfig:   null,
    connectPath: null,
    proximamente: true,
  },
  {
    group:       "pinterest",
    label:       "Pinterest",
    description: "Inspiración · Shopping · Ads",
    color:       "#E60023",
    symbol:      "📌",
    providers:   ["pinterest"],
    adsConfig:   null,
    connectPath: null,
    proximamente: true,
  },
];

// ── State derivation ──────────────────────────────────────────────────────────

function deriveEstado(
  conns: IntegrationConnectionSnapshot[],
  adsConfig: TenantAdsConfigData | null,
): IntegracionEstado {
  if (conns.length === 0) {
    return "desconectado";
  }

  const primary = conns.find(c => c.isPrimary) ?? conns[0];

  if (primary.status === "expired" || primary.status === "revoked") {
    return "error_autenticacion";
  }
  if (primary.status === "error") {
    return "requiere_atencion";
  }
  if (primary.status === "not_connected" || primary.status === "disabled") {
    return "desconectado";
  }
  if (primary.health === "critical") {
    return "error_autenticacion";
  }
  if (primary.health === "warning") {
    return "requiere_atencion";
  }
  if (primary.status === "connected" && !primary.externalAccountId) {
    return "configuracion_incompleta";
  }
  if (primary.status === "connected" && adsConfig && !adsConfig.selectedAdAccountId) {
    return "configuracion_incompleta";
  }
  return "conectado";
}

// ── Resources derivation ──────────────────────────────────────────────────────

function deriveRecursos(
  def:       PlatformDef,
  conns:     IntegrationConnectionSnapshot[],
  adsConfig: TenantAdsConfigData | null,
): IntegracionRecurso[] {
  const recursos: IntegracionRecurso[] = [];

  for (const conn of conns) {
    if (conn.status !== "connected") continue;

    if (conn.externalAccountName && !recursos.some(r => r.id === conn.externalAccountId)) {
      recursos.push({ tipo: "Cuenta", nombre: conn.externalAccountName, id: conn.externalAccountId });
    }
    if (conn.externalPageId) {
      recursos.push({ tipo: "Página", nombre: null, id: conn.externalPageId });
    }
    if (conn.externalBusinessId) {
      recursos.push({ tipo: "Business Manager", nombre: null, id: conn.externalBusinessId });
    }
    if (conn.externalAdAccountId) {
      recursos.push({ tipo: "Cuenta publicitaria", nombre: null, id: conn.externalAdAccountId });
    }
    if (conn.shopDomain) {
      recursos.push({ tipo: "Tienda", nombre: conn.shopDomain, id: conn.shopDomain });
    }
  }

  // Enrich with TenantAdsConfig resource names
  if (adsConfig) {
    if (adsConfig.selectedPageId) {
      const existing = recursos.find(r => r.tipo === "Página");
      if (existing) existing.nombre = adsConfig.selectedPageName;
      else recursos.push({ tipo: "Página", nombre: adsConfig.selectedPageName, id: adsConfig.selectedPageId });
    }
    if (adsConfig.selectedAdAccountId) {
      const existing = recursos.find(r => r.tipo === "Cuenta publicitaria");
      if (existing) existing.nombre = adsConfig.selectedAdAccountName;
      else recursos.push({ tipo: "Cuenta publicitaria", nombre: adsConfig.selectedAdAccountName, id: adsConfig.selectedAdAccountId });
    }
    if (adsConfig.selectedInstagramAccountId) {
      recursos.push({ tipo: "Instagram Business", nombre: adsConfig.selectedInstagramAccountName, id: adsConfig.selectedInstagramAccountId });
    }
    if (adsConfig.selectedAdvertiserId) {
      recursos.push({ tipo: "Advertiser", nombre: adsConfig.selectedAdvertiserName, id: adsConfig.selectedAdvertiserId });
    }
    if (adsConfig.selectedBusinessId) {
      const existing = recursos.find(r => r.tipo === "Business Manager");
      if (existing) existing.nombre = adsConfig.selectedBusinessName;
      else recursos.push({ tipo: "Business Manager", nombre: adsConfig.selectedBusinessName, id: adsConfig.selectedBusinessId });
    }
  }

  return recursos;
}

// ── Permissions derivation ────────────────────────────────────────────────────

const SCOPE_LABELS: Record<string, string> = {
  "pages_read_engagement":              "Leer páginas",
  "pages_manage_posts":                 "Publicar en páginas",
  "ads_management":                     "Administrar anuncios",
  "ads_read":                           "Leer anuncios",
  "business_management":                "Gestión empresarial",
  "instagram_basic":                    "Perfil de Instagram",
  "instagram_content_publish":          "Publicar en Instagram",
  "instagram_manage_insights":          "Analítica de Instagram",
  "catalog_management":                 "Catálogo de productos",
  "read_insights":                      "Leer estadísticas",
  "write:posts":                        "Publicar posts",
  "read:inventory":                     "Leer inventario",
  "write:inventory":                    "Modificar inventario",
  "read:orders":                        "Leer órdenes",
  "write:products":                     "Modificar productos",
};

function derivePermisos(conns: IntegrationConnectionSnapshot[]): IntegracionPermiso[] {
  const seen  = new Set<string>();
  const perms: IntegracionPermiso[] = [];
  for (const conn of conns) {
    for (const scope of conn.scopes) {
      if (!seen.has(scope)) {
        seen.add(scope);
        perms.push({ scope, label: SCOPE_LABELS[scope] ?? scope });
      }
    }
  }
  return perms;
}

// ── Diagnostic checks derivation ──────────────────────────────────────────────

function deriveChecks(
  def:       PlatformDef,
  conns:     IntegrationConnectionSnapshot[],
  adsConfig: TenantAdsConfigData | null,
): IntegracionCheck[] {
  const primary = conns.find(c => c.isPrimary) ?? conns[0] ?? null;

  const hasConnection = conns.length > 0;
  const isConnected   = primary?.status === "connected";
  const isHealthy     = primary?.health === "healthy";

  const checks: IntegracionCheck[] = [
    { label: "Conexión establecida",       passed: hasConnection },
    { label: "Token válido",               passed: isConnected && isHealthy,
      detail: primary?.errorMessage ?? undefined },
    { label: "Cuenta detectada",           passed: isConnected && !!primary?.externalAccountId },
  ];

  // Platform-specific checks
  if (def.group === "meta") {
    checks.push(
      { label: "Página encontrada",            passed: isConnected && !!(conns.some(c => c.externalPageId) || adsConfig?.selectedPageId) },
      { label: "Cuenta publicitaria asignada", passed: isConnected && !!adsConfig?.selectedAdAccountId },
    );
  }
  if (def.group === "tiktok") {
    checks.push(
      { label: "Advertiser encontrado", passed: isConnected && !!adsConfig?.selectedAdvertiserId },
    );
  }
  if (def.group === "shopify") {
    checks.push(
      { label: "Tienda accesible", passed: isConnected && !!primary?.shopDomain },
      { label: "Permisos correctos", passed: isConnected && conns.some(c => c.scopes.length > 0) },
    );
  }
  if (def.group === "whatsapp") {
    checks.push(
      { label: "Número conectado",   passed: isConnected && !!primary?.externalAccountId },
      { label: "Permisos activos",   passed: isConnected && conns.some(c => c.scopes.length > 0) },
    );
  }
  if (def.group === "google") {
    checks.push(
      { label: "Cuenta disponible", passed: isConnected && !!primary?.externalAccountId },
      { label: "Permisos mínimos",  passed: isConnected && conns.some(c => c.scopes.length > 0) },
    );
  }

  return checks;
}

// ── Build one card ────────────────────────────────────────────────────────────

function buildCard(
  def:              PlatformDef,
  byProvider:       Record<string, IntegrationConnectionSnapshot[]>,
  adsConfigByPlatform: Record<string, TenantAdsConfigData>,
): IntegracionCard {
  // Collect all connections for this platform group
  const conns: IntegrationConnectionSnapshot[] = [];
  for (const provider of def.providers) {
    const group = byProvider[provider] ?? [];
    conns.push(...group);
  }

  const adsConfig = def.adsConfig ? (adsConfigByPlatform[def.adsConfig] ?? null) : null;

  const primary = conns.find(c => c.isPrimary) ?? conns[0] ?? null;

  const ultimaSincronizacion = adsConfig?.lastDiscoveredAt
    ?? primary?.connectedAt
    ?? null;

  const ultimaComprobacion = primary?.lastHealthCheckAt ?? null;

  return {
    platformGroup:        def.group,
    label:                def.label,
    description:          def.description,
    color:                def.color,
    symbol:               def.symbol,
    estado:               def.proximamente ? "desconectado" : deriveEstado(conns, adsConfig),
    cuentaConectada:      primary?.externalAccountName ?? primary?.accountHandle ?? primary?.shopDomain ?? null,
    ultimaSincronizacion,
    ultimaComprobacion,
    recursos:             deriveRecursos(def, conns, adsConfig),
    permisos:             derivePermisos(conns),
    checks:               deriveChecks(def, conns, adsConfig),
    cantidadConexiones:   conns.length,
    connectPath:          def.connectPath,
    proximamente:         def.proximamente,
  };
}

// ── Summary ───────────────────────────────────────────────────────────────────

function buildResumen(cards: IntegracionCard[], syncedAt: string): ConexionesResumen {
  const v1Cards = cards.filter(c => !c.proximamente);
  return {
    activas:            v1Cards.filter(c => c.estado === "conectado").length,
    requierenAtencion:  v1Cards.filter(c => c.estado === "requiere_atencion" || c.estado === "error_autenticacion").length,
    pendientes:         v1Cards.filter(c => c.estado === "desconectado" || c.estado === "configuracion_incompleta").length,
    total:              v1Cards.length,
    ultimaComprobacion: syncedAt,
  };
}

// ── Public exports ────────────────────────────────────────────────────────────

export async function getConnectionsSummary(
  organizationId: string,
): Promise<ConexionesApiResponse> {
  const [byProvider, adsConfigs] = await Promise.all([
    listConnectionsByProvider(organizationId),
    getAdsAccountsConfig(organizationId),
  ]);

  const adsConfigByPlatform: Record<string, TenantAdsConfigData> = {};
  for (const config of adsConfigs) {
    adsConfigByPlatform[config.platform] = config;
  }

  const syncedAt     = new Date().toISOString();
  const integraciones = PLATFORM_CATALOG.map(def =>
    buildCard(def, byProvider, adsConfigByPlatform),
  );
  const resumen      = buildResumen(integraciones, syncedAt);

  return { resumen, integraciones, syncedAt };
}

export async function getConnectionDetails(
  organizationId: string,
  platformGroup:  string,
): Promise<IntegracionCard | null> {
  const def = PLATFORM_CATALOG.find(d => d.group === platformGroup);
  if (!def) return null;

  const [byProvider, adsConfigs] = await Promise.all([
    listConnectionsByProvider(organizationId),
    getAdsAccountsConfig(organizationId),
  ]);

  const adsConfigByPlatform: Record<string, TenantAdsConfigData> = {};
  for (const config of adsConfigs) {
    adsConfigByPlatform[config.platform] = config;
  }

  return buildCard(def, byProvider, adsConfigByPlatform);
}
