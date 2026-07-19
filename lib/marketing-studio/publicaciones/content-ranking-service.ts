/**
 * lib/marketing-studio/publicaciones/content-ranking-service.ts
 *
 * MARKETING-PUBLICACIONES-ARCHITECTURE-02 — ContentRankingService
 *
 * Toda la lógica de negocio para ranking, detección de oportunidades y
 * sugerencias editoriales vive aquí.
 *
 * La interfaz de usuario solo consume resultados — NUNCA calcula rankings
 * inline ni genera recomendaciones directamente.
 *
 * Principios:
 *   - Pura TypeScript. Sin React. Sin Prisma.
 *   - Determinista: misma entrada → mismo resultado.
 *   - Safe para importar en client components (no server-only).
 *   - Analítica podrá reutilizar este módulo directamente.
 */

import { C } from "@/lib/ui/tokens";
import type { PublicacionItem } from "./publicaciones-types";
import { editorialCanales, PUBLICACION_CANAL_LABEL } from "./publicaciones-types";

// ── Tipos públicos ─────────────────────────────────────────────────────────────

export interface LucaRec {
  icon:   string;
  msg:    string;
  acento: string; // hex color token
}

export interface RankingScore {
  item:  PublicacionItem;
  score: number;
}

// ── Scoring interno ────────────────────────────────────────────────────────────

/**
 * Calcula una puntuación de desempeño compuesta.
 * Interacciones pesan más que alcance (son más intencionales).
 * Reproducciones indican consumo activo del contenido.
 */
function computeScore(item: PublicacionItem): number {
  const alcance        = item.alcance       ?? 0;
  const interacciones  = item.interacciones ?? 0;
  const reproducciones = item.reproducciones ?? 0;
  // Weights: interactions×3, reproductions×1.5, reach×1
  return interacciones * 3 + reproducciones * 1.5 + alcance;
}

// ── API pública ────────────────────────────────────────────────────────────────

/**
 * Retorna hasta `limit` publicaciones ordenadas por desempeño descendente.
 * Solo incluye publicaciones con estado "publicada".
 */
export function getContenidoDestacado(
  items: PublicacionItem[],
  limit = 4,
): PublicacionItem[] {
  return items
    .filter(p => p.estado === "publicada")
    .map(p   => ({ item: p, score: computeScore(p) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(r => r.item);
}

/**
 * Retorna publicaciones que requieren atención inmediata.
 * Orden: errores críticos primero, luego revisiones, luego parciales.
 */
export function getRequierenAtencion(items: PublicacionItem[]): PublicacionItem[] {
  const priority = (p: PublicacionItem): number => {
    if (p.estado === "error")       return 3;
    if (p.tieneErrores)             return 3;
    if (p.estado === "en_revision") return 2;
    if (p.estado === "parcial")     return 1;
    return 0;
  };
  return items
    .filter(p => priority(p) > 0)
    .sort((a, b) => priority(b) - priority(a));
}

/**
 * Detecta publicaciones con buen desempeño en un solo canal.
 * Estas son candidatas para ser reutilizadas en otros canales.
 */
export function getOportunidadesReutilizacion(
  items: PublicacionItem[],
): PublicacionItem[] {
  return items.filter(p =>
    p.estado === "publicada"
    && p.alcance != null
    && p.alcance > 0
    && editorialCanales(p.canales).length === 1,
  );
}

/**
 * Detecta publicaciones con alto alcance orgánico que son candidatas
 * para ser promovidas como Anuncios (pauta paga).
 * Solo relevante cuando existen métricas reales.
 */
export function getCandidatosPromocion(
  items: PublicacionItem[],
): PublicacionItem[] {
  const publicadas = items.filter(p => p.estado === "publicada" && p.alcance != null);
  if (publicadas.length === 0) return [];
  const scores       = publicadas.map(p => p.alcance ?? 0);
  const avgAlcance   = scores.reduce((a, b) => a + b, 0) / scores.length;
  // Candidatos: alcance > 1.5× el promedio
  return publicadas.filter(p => (p.alcance ?? 0) > avgAlcance * 1.5);
}

/**
 * No implementable sin datos históricos. Reservado para integración futura.
 * Retorna vacío hasta que el motor de analítica proporcione series temporales.
 */
export function getTendencias(_items: PublicacionItem[]): PublicacionItem[] {
  return [];
}

// ── Sugerencias editoriales de Luca ───────────────────────────────────────────
// SOLO cuando existe una oportunidad real derivada de datos verificables.
// Sin recomendaciones estáticas, decorativas ni permanentes.
// La inteligencia continua vive en Copilot (rail lateral), no aquí.

export function buildLucaRecs(publicaciones: PublicacionItem[]): LucaRec[] {
  const recs: LucaRec[] = [];

  const conErrores  = publicaciones.filter(p => p.tieneErrores || p.estado === "error");
  const enRevision  = publicaciones.filter(p => p.estado === "en_revision");
  const programadas = publicaciones.filter(p => p.estado === "programada");
  const reutilizar  = getOportunidadesReutilizacion(publicaciones);
  const candidatos  = getCandidatosPromocion(publicaciones);

  // 1. Errores activos — siempre accionables
  if (conErrores.length > 0) {
    recs.push({
      icon:   "⚠️",
      msg:    `${conErrores.length} publicación${conErrores.length > 1 ? "es presentan" : " presenta"} errores de canal. Revisa las credenciales en Conexiones antes de reprogramar para no perder la ventana de publicación.`,
      acento: C.red ?? "#dc2626",
    });
  }

  // 2. Publicaciones detenidas en revisión
  if (enRevision.length > 0) {
    recs.push({
      icon:   "🔍",
      msg:    `${enRevision.length} publicación${enRevision.length > 1 ? "es llevan" : " lleva"} tiempo en revisión. Revisa el flujo de aprobación para no perder la relevancia del contenido.`,
      acento: C.amber ?? "#d97706",
    });
  }

  // 3. Programaciones urgentes (menos de 3 h)
  const urgentes = programadas.filter(
    p => p.programadaEn && new Date(p.programadaEn).getTime() - Date.now() < 3 * 60 * 60 * 1000,
  );
  if (urgentes.length > 0) {
    recs.push({
      icon:   "📅",
      msg:    `${urgentes.length} publicación${urgentes.length > 1 ? "es se publican" : " se publica"} en menos de 3 horas. Verifica que los canales estén conectados y activos.`,
      acento: C.blueDark,
    });
  }

  // 4. Contenido con buen alcance en un solo canal → oportunidad de reutilización
  if (reutilizar.length > 0) {
    const ejemplo = reutilizar[0];
    const canal   = PUBLICACION_CANAL_LABEL[editorialCanales(ejemplo.canales)[0] ?? ""] ?? "un canal";
    recs.push({
      icon:   "⭐",
      msg:    `"${ejemplo.titulo}" tiene buen alcance en ${canal}. Considera reutilizarlo en otros canales editoriales para multiplicar el impacto.`,
      acento: C.green ?? "#16a34a",
    });
  }

  // 5. Candidatos para promoción paga (solo si existen métricas reales)
  if (candidatos.length > 0 && recs.length < 3) {
    recs.push({
      icon:   "📢",
      msg:    `${candidatos.length} publicación${candidatos.length > 1 ? "es superan" : " supera"} el alcance promedio. ${candidatos.length > 1 ? "Son candidatas" : "Es candidata"} para potenciarse desde Anuncios y alcanzar nuevas audiencias.`,
      acento: C.blueDark,
    });
  }

  return recs;
}
