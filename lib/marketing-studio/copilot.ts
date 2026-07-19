/**
 * lib/marketing-studio/copilot.ts
 *
 * Marketing Copilot — Castillitos Growth Engine (Sprint M1).
 *
 * Converts natural-language campaign intents into structured campaign strategies:
 * preset selection, prompt generation, hashtags, copy, and publishing plan.
 *
 * ── Intent parsing ────────────────────────────────────────────────────────────
 *
 *   parseCopilotIntent("quiero campaña regreso a clases para Latin Kids en Gran Plaza")
 *   → CopilotRequest {
 *       season:       "regreso_clases",
 *       businessLine: "latin_kids",
 *       channel:      "tiendas",
 *       operatingUnit:"GRAN_PLAZA",
 *     }
 *
 * ── Strategy building ─────────────────────────────────────────────────────────
 *
 *   buildCampaignStrategy(request, fingerprint, config)
 *   → CopilotStrategy {
 *       presets:   PhotoPreset[],   — recommended presets, ranked
 *       prompts:   string[],        — one prompt per recommended preset
 *       hashtags:  string[],
 *       copy:      string,
 *       plan:      CampaignPlan,    — structured tactical plan
 *     }
 *
 * ── Architecture notes ────────────────────────────────────────────────────────
 *
 *   - All parsing is keyword-based (no ML, no HTTP calls).
 *   - All output is deterministic given the same inputs.
 *   - Intent parser normalizes accented characters for robust matching.
 *   - Copilot does NOT execute anything — callers dispatch presets/prompts.
 *   - Future: replace parseCopilotIntent() with an LLM call to this module's
 *     structured output schema (CopilotRequest) as a tool call result.
 */

import type {
  CopilotRequest,
  RetailSeason,
  CampaignChannel,
  MarketingBusinessLine,
  GarmentFingerprint,
  TenantMarketingConfig,
  SocialPlatform,
} from "./types";
import type { PhotoPreset } from "./types";
import {
  ALL_PRESETS,
  getTenantPresets,
  getPresetsForSeason,
  getPresetsForChannel,
} from "./preset-registry";
import {
  buildCastillitosPrompt,
  buildCastillitosHashtags,
  buildCastillitosCopy,
} from "./castillitos-prompts";

// ── Output types ───────────────────────────────────────────────────────────────

export interface CampaignPlan {
  /** One-line campaign brief */
  brief:           string;
  /** Recommended preset IDs in priority order */
  presetIds:       string[];
  /** Suggested content formats (tiktok reel, instagram feed, etc.) */
  contentFormats:  string[];
  /** Suggested publishing timeline */
  timeline:        string;
  /** Key messaging points */
  keyMessages:     string[];
  /** Calls to action */
  callsToAction:   string[];
}

export interface CopilotStrategy {
  /** The resolved request (parsed + defaults applied) */
  resolvedRequest:  CopilotRequest;
  /** Recommended presets in priority order (max 5) */
  presets:          PhotoPreset[];
  /** One generative prompt per recommended preset */
  prompts:          string[];
  /** Hashtag list for this campaign */
  hashtags:         string[];
  /** Primary copy suggestion */
  copy:             string;
  /** Tactical campaign plan */
  plan:             CampaignPlan;
}

// ── Intent parser ─────────────────────────────────────────────────────────────

/**
 * Normalizes a string for keyword matching:
 * lowercase + remove accents + collapse whitespace.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // strip diacritics
    .replace(/[^a-z0-9\s]/g, " ")      // strip punctuation
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Keyword → RetailSeason mapping.
 * Order matters — longer/more-specific phrases matched first.
 */
const SEASON_KEYWORDS: Array<{ keywords: string[]; season: RetailSeason }> = [
  { keywords: ["regreso a clases", "back to school", "vuelta al colegio", "regreso escolar", "inicio de clases"], season: "regreso_clases" },
  { keywords: ["navidad", "christmas", "noche buena", "diciembre", "fin de año", "fin de ano"],                   season: "navidad" },
  { keywords: ["dia del nino", "dia de los ninos", "children s day", "ninos"],                                    season: "dia_nino" },
  { keywords: ["halloween", "trick or treat", "disfraces"],                                                       season: "halloween" },
  { keywords: ["san valentin", "dia del amor", "valentines", "14 de febrero"],                                    season: "san_valentin" },
  { keywords: ["dia de la madre", "dia de la mama", "mothers day", "mama"],                                       season: "dia_madre" },
];

/**
 * Keyword → CampaignChannel mapping.
 */
const CHANNEL_KEYWORDS: Array<{ keywords: string[]; channel: CampaignChannel }> = [
  { keywords: ["mayoristas", "distribuidor", "distribuidores", "al por mayor", "wholesale", "b2b"], channel: "mayoristas" },
  { keywords: ["empresa", "institucional", "colegio", "colegios", "uniforme", "uniformes"],         channel: "empresa" },
  { keywords: ["web", "online", "ecommerce", "e commerce", "tienda online", "tienda virtual"],      channel: "web" },
  { keywords: ["tienda", "tiendas", "almacen", "almacenes", "punto de venta", "local"],             channel: "tiendas" },
];

/**
 * Keyword → MarketingBusinessLine mapping.
 */
const BUSINESS_LINE_KEYWORDS: Array<{ keywords: string[]; line: MarketingBusinessLine }> = [
  { keywords: ["latin kids", "latinkids", "lk"],                            line: "latin_kids" },
  { keywords: ["importacion", "importado", "importados", "importada"],      line: "importacion" },
  { keywords: ["pets", "mascotas", "mascota", "perro", "gato"],             line: "pets" },
  { keywords: ["castillitos"],                                               line: "castillitos" },
];

/**
 * Keyword → OperatingUnit mapping.
 */
const UNIT_KEYWORDS: Array<{ keywords: string[]; unit: string }> = [
  { keywords: ["gran plaza", "granplaza"],         unit: "GRAN_PLAZA" },
  { keywords: ["san diego", "sandiego"],           unit: "SAN_DIEGO" },
  { keywords: ["caldas"],                          unit: "CALDAS" },
  { keywords: ["centro"],                          unit: "CENTRO" },
  { keywords: ["web", "online", "virtual"],        unit: "WEB" },
];

/**
 * Parses a free-text marketing intent into a structured CopilotRequest.
 *
 * This is a keyword-based parser — no ML, no external calls.
 * Future: replace with a Claude tool-use call that returns this schema.
 */
export function parseCopilotIntent(rawIntent: string): CopilotRequest {
  const n = normalize(rawIntent);
  const result: CopilotRequest = { rawIntent };

  // Season
  for (const { keywords, season } of SEASON_KEYWORDS) {
    if (keywords.some(k => n.includes(k))) {
      result.season = season;
      break;
    }
  }

  // Business line
  for (const { keywords, line } of BUSINESS_LINE_KEYWORDS) {
    if (keywords.some(k => n.includes(k))) {
      result.businessLine = line;
      break;
    }
  }

  // Channel
  for (const { keywords, channel } of CHANNEL_KEYWORDS) {
    if (keywords.some(k => n.includes(k))) {
      result.channel = channel;
      break;
    }
  }

  // Operating unit
  for (const { keywords, unit } of UNIT_KEYWORDS) {
    if (keywords.some(k => n.includes(k))) {
      result.operatingUnit = unit;
      break;
    }
  }

  // Budget tier hints
  if (n.includes("full") || n.includes("completa") || n.includes("gran campaña")) {
    result.budgetTier = "full";
  } else if (n.includes("mini") || n.includes("pequeña") || n.includes("rapida") || n.includes("flash")) {
    result.budgetTier = "mini";
  } else {
    result.budgetTier = "standard";
  }

  return result;
}

// ── Preset ranker ─────────────────────────────────────────────────────────────

/**
 * Scores a preset for a given CopilotRequest.
 * Higher score = better match.
 */
function scorePreset(preset: PhotoPreset, req: CopilotRequest): number {
  let score = 0;

  // Season match
  if (req.season && preset.recommendedSeasons?.includes(req.season)) score += 3;
  if (req.season && req.season !== "normal" && !preset.recommendedSeasons?.length) score -= 1;

  // Channel match
  if (req.channel && (
    preset.recommendedChannels?.includes(req.channel) ||
    preset.recommendedChannels?.includes("all")
  )) score += 2;

  // Category match
  if (req.productCategory && (
    preset.applicableTo.length === 0 ||
    preset.applicableTo.includes(req.productCategory)
  )) score += 1;

  // Budget tier preference
  const isHighProduction = preset.presetCategory === "campanas";
  if (req.budgetTier === "full" && isHighProduction) score += 2;
  if (req.budgetTier === "mini" && preset.presetCategory === "redes") score += 1;
  if (req.budgetTier === "standard" && preset.presetCategory === "catalogo") score += 1;

  return score;
}

/**
 * Ranks tenant-allowed presets for a given request.
 * Returns top N presets in ranked order.
 */
function rankPresets(
  req:     CopilotRequest,
  config:  TenantMarketingConfig,
  limit    = 5,
): PhotoPreset[] {
  const tenantPresets = getTenantPresets(config.allowedPresets);
  return tenantPresets
    .map(p => ({ preset: p, score: scorePreset(p, req) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.preset);
}

// ── Plan builder ──────────────────────────────────────────────────────────────

const SEASON_BRIEFS: Record<RetailSeason, string> = {
  regreso_clases: "Campaña regreso a clases — activar ventas de ropa escolar, útiles y uniformes para el inicio del año lectivo.",
  navidad:        "Campaña Navidad — posicionar Castillitos como la opción de regalo infantil #1 de la temporada.",
  dia_nino:       "Campaña Día del Niño — celebración emocional con productos protagonistas y llamada a la compra festiva.",
  halloween:      "Campaña Halloween — disfraces y artículos de temporada para los más creativos.",
  san_valentin:   "Campaña San Valentín — regalos con emoción, amor y estilo para los pequeños.",
  dia_madre:      "Campaña Día de la Madre — regalos para mamás y sus niños.",
  normal:         "Campaña comercial — activación de ventas con enfoque en producto y marca.",
};

const SEASON_FORMATS: Record<RetailSeason, string[]> = {
  regreso_clases: ["Reel TikTok 9:16 — niño listo para el colegio", "Instagram feed 4:5 — combo escolar", "Stories — cuenta regresiva / oferta"],
  navidad:        ["Reel TikTok 9:16 — unboxing regalo", "Instagram feed — flat lay navideño", "Stories — countdown Navidad"],
  dia_nino:       ["TikTok — niños en celebración", "Instagram feed — producto festivo", "Stories — oferta del día"],
  halloween:      ["Reel — disfraz en acción", "Stories — sticker / encuesta"],
  san_valentin:   ["Instagram feed — producto con lazo", "Stories — corazones"],
  dia_madre:      ["Instagram feed — madre e hijo", "Reel — regalo sorpresa"],
  normal:         ["Reel TikTok 9:16 — producto hero", "Instagram feed — catálogo", "Stories — oferta"],
};

const CHANNEL_TIMELINES: Record<CampaignChannel, string> = {
  empresa:    "Lanzar con 3 semanas de anticipación — enviar catálogo a compradores institucionales.",
  mayoristas: "Lanzar con 4 semanas de anticipación — enviar material a distribuidores por email/WhatsApp.",
  tiendas:    "Lanzar con 2 semanas de anticipación — activar señalización in-store 1 semana antes.",
  web:        "Lanzar con 2 semanas — subir catálogo web, activar banners 10 días antes.",
  all:        "Lanzar con 3 semanas de anticipación en todos los canales.",
};

const CHANNEL_CTAS: Record<CampaignChannel, string[]> = {
  empresa:    ["Solicita tu cotización institucional", "Haz tu pedido anticipado", "Contáctanos para pedidos de uniformes"],
  mayoristas: ["Pide tu catálogo de mayoristas", "Whatsapp para pedidos al por mayor", "Solicita condiciones especiales"],
  tiendas:    ["Visítanos en nuestros puntos", "Encuéntralo en tienda", "Ve a tu Castillitos más cercano"],
  web:        ["Compra en línea ahora", "Envío a domicilio disponible", "Agota antes que se acabe"],
  all:        ["Compra en línea o visítanos", "Pide ya — stock limitado", "Disponible en tienda y online"],
};

function buildCampaignPlan(req: CopilotRequest, topPresets: PhotoPreset[]): CampaignPlan {
  const season  = req.season  ?? "normal";
  const channel = req.channel ?? "all";

  const brief   = SEASON_BRIEFS[season];
  const formats = SEASON_FORMATS[season].slice(0, req.budgetTier === "mini" ? 2 : 3);
  const timeline = CHANNEL_TIMELINES[channel];
  const ctas    = CHANNEL_CTAS[channel].slice(0, 2);

  const keyMessages: string[] = [];
  if (req.businessLine === "latin_kids") keyMessages.push("Colección Latin Kids — exclusivo para los más pequeños de casa.");
  if (req.businessLine === "importacion") keyMessages.push("Colección importada — diseños únicos, calidad internacional.");
  if (req.operatingUnit) keyMessages.push(`Disponible en ${req.operatingUnit.replace("_", " ").toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}.`);
  keyMessages.push("Castillitos — calidad colombiana para niños.");

  return {
    brief,
    presetIds: topPresets.map(p => p.id),
    contentFormats: formats,
    timeline,
    keyMessages,
    callsToAction: ctas,
  };
}

// ── Main strategy builder ─────────────────────────────────────────────────────

/**
 * Builds a complete campaign strategy from a CopilotRequest.
 *
 * @param request     Structured request (from parseCopilotIntent or wizard).
 * @param fingerprint Product fingerprint for the campaign hero product.
 * @param config      Castillitos tenant marketing config.
 * @returns           Full CopilotStrategy ready for the wizard UI.
 */
export function buildCampaignStrategy(
  request:     CopilotRequest,
  fingerprint: GarmentFingerprint,
  config:      TenantMarketingConfig,
): CopilotStrategy {
  // Apply defaults
  const resolved: CopilotRequest = {
    season:      "normal",
    channel:     "all",
    businessLine:"castillitos",
    budgetTier:  "standard",
    ...request,
  };

  // Rank and select presets
  const topPresets = rankPresets(resolved, config, 5);

  // Build prompts — one per preset
  const prompts = topPresets.map(preset =>
    buildCastillitosPrompt({
      fingerprint,
      preset,
      config,
      season:       resolved.season,
      channel:      resolved.channel,
      businessLine: resolved.businessLine,
    }),
  );

  // Hashtags
  const hashtags = buildCastillitosHashtags(
    fingerprint,
    config,
    resolved.season,
    resolved.channel,
    resolved.businessLine,
  );

  // Copy
  const copy = buildCastillitosCopy(
    fingerprint,
    config,
    resolved.season,
    resolved.channel,
    resolved.businessLine,
  );

  // Campaign plan
  const plan = buildCampaignPlan(resolved, topPresets);

  return { resolvedRequest: resolved, presets: topPresets, prompts, hashtags, copy, plan };
}
