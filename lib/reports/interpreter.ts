/**
 * Mobile Report Copilot — Pattern-based natural-language interpreter.
 *
 * Converts a Spanish free-text query into a structured QuerySpec that the
 * runners module can execute. No LLM required for v1 — pure regex + keyword
 * matching against Spanish vocabulary that Castillitos staff actually uses.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type QueryFamily =
  | "cartera_vencida"
  | "pedidos"
  | "cotizaciones"
  | "clientes"
  | "clientes_inactivos"
  | "top_clientes"
  | "sin_facturar"
  | "alertas_criticas";

export interface DateRange {
  from: Date;
  to:   Date;
}

export interface QuerySpec {
  family:       QueryFamily;
  rawQuery:     string;
  normalised:   string;

  /** Seller name fragment to filter by (case-insensitive contains) */
  sellerQuery?: string;

  /** City name fragment to filter by */
  cityQuery?: string;

  /** Quote/pedido status values (CRMQuote.status enum: DRAFT|SENT|ACCEPTED|REJECTED|EXPIRED) */
  statusFilter?: string[];

  /** Days of inactivity for clientes_inactivos queries */
  daysInactive?: number;

  /** Explicit date range extracted from query */
  dateRange?: DateRange;

  /** Risk level filter (CustomerProfile.churnRisk) */
  riskFilter?: string[];

  /** Max rows to return (default 100) */
  limit: number;
}

// ── Normalise helpers ─────────────────────────────────────────────────────────

const ACCENTS: Record<string, string> = {
  á: "a", é: "e", í: "i", ó: "o", ú: "u",
  à: "a", è: "e", ì: "i", ò: "o", ù: "u",
  ä: "a", ë: "e", ï: "i", ö: "o", ü: "u",
  ñ: "n",
};

function stripAccents(s: string): string {
  return s.replace(/[áéíóúàèìòùäëïöüñÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÑ]/g, c => ACCENTS[c] ?? c);
}

function norm(s: string): string {
  return stripAccents(s.toLowerCase()).replace(/\s+/g, " ").trim();
}

// ── Keyword tables ─────────────────────────────────────────────────────────────

const FAMILY_KEYWORDS: Array<[RegExp, QueryFamily]> = [
  // Must test most-specific first
  [/alerta[s]?\s+critica[s]?|alertas\s+abiertas|alertas\s+comerciales/, "alertas_criticas"],
  [/sin\s+factur/,                               "sin_facturar"],
  [/sin\s+(comprar|pedidos|compras)|inactiv/,    "clientes_inactivos"],
  [/top\s+clientes|mejores\s+clientes|ranking|mas\s+ventas|mayor\s+venta/, "top_clientes"],
  [/cartera|mora|vencid[ao]s?|cobro\s+pendiente/, "cartera_vencida"],
  [/cotizaci[oó]n|cotizaciones|presupuesto/,     "cotizaciones"],
  [/pedidos|pedido|orden(es)?/,                  "pedidos"],
  [/clientes|cliente/,                           "clientes"],
];

// Status mapping: Spanish keyword → CRMQuote.status enum values
const STATUS_KEYWORDS: Array<[RegExp, string[]]> = [
  [/confirmad[ao]s?/,           ["ACCEPTED"]],
  [/facturad[ao]s?/,            ["ACCEPTED"]],
  [/anulad[ao]s?|rechazad[ao]s?/, ["REJECTED"]],
  [/vencid[ao]s?|expirad[ao]s?/, ["EXPIRED"]],
  [/enviad[ao]s?/,              ["SENT"]],
  [/borrador|borradores/,       ["DRAFT"]],
  [/abiertos?/,                 ["DRAFT", "SENT"]],
  [/cerrad[ao]s?/,              ["ACCEPTED", "REJECTED", "EXPIRED"]],
];

// Risk keywords → CustomerProfile.churnRisk values
const RISK_KEYWORDS: Array<[RegExp, string[]]> = [
  [/critico|riesgo\s+critico|criticos/,  ["CRITICAL"]],
  [/alto\s+riesgo|riesgo\s+alto|alto/,   ["HIGH", "CRITICAL"]],
  [/medio\s+riesgo|riesgo\s+medio/,      ["MEDIUM"]],
  [/bajo\s+riesgo|riesgo\s+bajo/,        ["LOW"]],
];

// ── Date extraction ───────────────────────────────────────────────────────────

function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(n: number): Date {
  const d = today();
  d.setDate(d.getDate() - n);
  return d;
}

function startOfMonth(): Date {
  const d = today();
  d.setDate(1);
  return d;
}

function startOfWeek(): Date {
  const d = today();
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function extractDateRange(n: string): DateRange | undefined {
  const end = new Date(); // now

  if (/\bhoy\b/.test(n))        return { from: today(),        to: end };
  if (/\bayer\b/.test(n))       return { from: daysAgo(1),     to: today() };
  if (/esta\s+semana/.test(n))  return { from: startOfWeek(),  to: end };
  if (/este\s+mes/.test(n))     return { from: startOfMonth(), to: end };
  if (/este\s+a[nñ]o/.test(n)) {
    const s = new Date(new Date().getFullYear(), 0, 1);
    return { from: s, to: end };
  }

  // "últimos N días" / "hace N días" / "en los últimos N días"
  const mDays = n.match(/(?:ultimos|hace|en\s+los\s+ultimos)\s+(\d+)\s+d[ií]as?/);
  if (mDays) return { from: daysAgo(Number(mDays[1])), to: end };

  // "últimas N semanas"
  const mWeeks = n.match(/(?:ultimas|hace)\s+(\d+)\s+semanas?/);
  if (mWeeks) return { from: daysAgo(Number(mWeeks[1]) * 7), to: end };

  return undefined;
}

// ── Inactivity days ───────────────────────────────────────────────────────────

function extractDaysInactive(n: string): number {
  const m = n.match(/(\d+)\s*d[ií]as?/);
  if (m) return Number(m[1]);
  if (/dos\s+mes(es)?|2\s+mes(es)?/.test(n)) return 60;
  if (/tres\s+mes(es)?|3\s+mes(es)?/.test(n)) return 90;
  if (/un\s+mes|1\s+mes/.test(n)) return 30;
  return 60; // default
}

// ── Seller extraction ─────────────────────────────────────────────────────────

/**
 * Attempts to extract a seller name from the query using common Spanish
 * patterns: "de Luis", "de Néstor", "vendedor Carlos", "por María", etc.
 *
 * Returns the raw (accent-preserved) fragment for case-insensitive DB match.
 */
function extractSeller(original: string): string | undefined {
  // "de [CapitalLetter...]" — handles first names that start with a capital
  const mDe = original.match(
    /\bde\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)\b/,
  );
  if (mDe) return mDe[1];

  // "vendedor [Name]" / "vendedora [Name]"
  const mVend = original.match(/\bvendedor[a]?\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/);
  if (mVend) return mVend[1];

  // "por [Name]"
  const mPor = original.match(
    /\bpor\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)\b/,
  );
  if (mPor) return mPor[1];

  return undefined;
}

// ── City extraction ────────────────────────────────────────────────────────────

const KNOWN_CITIES = [
  "Cali", "Bogotá", "Bogota", "Medellín", "Medellin", "Barranquilla",
  "Cartagena", "Bucaramanga", "Pereira", "Manizales", "Ibagué", "Ibague",
  "Santa Marta", "Cucuta", "Cúcuta", "Armenia", "Palmira", "Bello",
  "Montería", "Monteria", "Neiva", "Villavicencio", "Pasto",
];

function extractCity(original: string): string | undefined {
  // "en [City]"
  const mEn = original.match(/\ben\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)\b/);
  if (mEn) {
    const candidate = mEn[1];
    // If it's a known city, return it — otherwise skip (might be "en SAG" etc.)
    const normCand = norm(candidate);
    const isCity = KNOWN_CITIES.some(c => norm(c) === normCand) || /^[A-ZÁÉÍÓÚ]/.test(candidate);
    if (isCity) return candidate;
  }

  // Direct city name in query (any known city)
  for (const city of KNOWN_CITIES) {
    if (norm(original).includes(norm(city))) return city;
  }

  return undefined;
}

// ── Main interpreter ──────────────────────────────────────────────────────────

export function interpret(rawQuery: string): QuerySpec {
  const n = norm(rawQuery);

  // ── Family detection (order matters — most specific first) ─────────────────
  let family: QueryFamily = "pedidos";
  for (const [re, fam] of FAMILY_KEYWORDS) {
    if (re.test(n)) { family = fam; break; }
  }

  // ── Status filter ──────────────────────────────────────────────────────────
  let statusFilter: string[] | undefined;
  for (const [re, values] of STATUS_KEYWORDS) {
    if (re.test(n)) { statusFilter = values; break; }
  }

  // ── Risk filter ────────────────────────────────────────────────────────────
  let riskFilter: string[] | undefined;
  for (const [re, values] of RISK_KEYWORDS) {
    if (re.test(n)) { riskFilter = values; break; }
  }

  // ── Entity extraction ──────────────────────────────────────────────────────
  const sellerQuery = extractSeller(rawQuery);
  const cityQuery   = extractCity(rawQuery);
  const dateRange   = extractDateRange(n);
  const daysInactive = family === "clientes_inactivos" ? extractDaysInactive(n) : undefined;

  // ── Limit ──────────────────────────────────────────────────────────────────
  const mLimit = n.match(/(?:top|primeros?|mejores?)\s+(\d+)/);
  const limit  = mLimit ? Number(mLimit[1]) : 100;

  return {
    family,
    rawQuery,
    normalised: n,
    sellerQuery,
    cityQuery,
    statusFilter,
    riskFilter,
    daysInactive,
    dateRange,
    limit,
  };
}
