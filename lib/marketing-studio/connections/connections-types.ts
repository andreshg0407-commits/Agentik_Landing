/**
 * lib/marketing-studio/connections/connections-types.ts
 *
 * MARKETING-CONNECTIONS-01 — Centro de Integraciones de Marketing y Publicidad
 *
 * Tipos serializables para el módulo Conexiones.
 * Sin tipos de Prisma. Sin secretos. Safe para RSC → client boundary.
 */

// ── Estado normalizado de integración ─────────────────────────────────────────

export type IntegracionEstado =
  | "conectado"
  | "requiere_atencion"
  | "desconectado"
  | "configuracion_incompleta"
  | "error_autenticacion";

export const INTEGRACION_ESTADO_LABEL: Record<IntegracionEstado, string> = {
  conectado:                "Conectado",
  requiere_atencion:        "Requiere atención",
  desconectado:             "Desconectado",
  configuracion_incompleta: "Configuración incompleta",
  error_autenticacion:      "Error de autenticación",
};

// ── Verificación de diagnóstico ────────────────────────────────────────────────

export interface IntegracionCheck {
  label:   string;
  passed:  boolean;
  detail?: string;
}

// ── Recurso descubierto ────────────────────────────────────────────────────────

export interface IntegracionRecurso {
  tipo:    string;   // "Página", "Cuenta publicitaria", "Tienda", etc.
  nombre:  string | null;
  id:      string | null;
}

// ── Permiso ───────────────────────────────────────────────────────────────────

export interface IntegracionPermiso {
  scope:  string;
  label:  string;
}

// ── Tarjeta de integración ────────────────────────────────────────────────────

export interface IntegracionCard {
  // Identity
  platformGroup: string;               // "meta" | "tiktok" | "google" | "youtube" | "shopify" | "whatsapp"
  label:         string;               // "Meta" | "TikTok" | ...
  description:   string;               // Short description
  color:         string;               // Brand color
  symbol:        string;               // Emoji / icon shortcode

  // State
  estado:        IntegracionEstado;
  cuentaConectada: string | null;      // Display name — no secrets
  ultimaSincronizacion: string | null; // ISO
  ultimaComprobacion:   string | null; // ISO

  // Discovered resources
  recursos:   IntegracionRecurso[];

  // Permissions
  permisos:   IntegracionPermiso[];

  // Diagnostics
  checks:     IntegracionCheck[];

  // Available connections count
  cantidadConexiones: number;

  // OAuth path for reconnecting (safe — just a route path)
  connectPath: string | null;

  // Future-flag: coming soon platforms
  proximamente: boolean;
}

// ── Resumen operativo ─────────────────────────────────────────────────────────

export interface ConexionesResumen {
  activas:             number;
  requierenAtencion:   number;
  pendientes:          number;
  total:               number;
  ultimaComprobacion:  string;
}

// ── API response ──────────────────────────────────────────────────────────────

export interface ConexionesApiResponse {
  resumen:      ConexionesResumen;
  integraciones: IntegracionCard[];
  syncedAt:     string;
}
