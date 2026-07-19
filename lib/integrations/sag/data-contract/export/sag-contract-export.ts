/**
 * lib/integrations/sag/data-contract/export/sag-contract-export.ts
 *
 * SAG Executive Contract Builder
 *
 * Generates a fully structured, serializable document that answers:
 * "¿Qué necesita exactamente Agentik para integrarse con SAG?"
 *
 * Output is plain data — no UI, no DB, no loaders.
 * Use sag-contract-renderer.ts to convert to text/markdown/email.
 *
 * Sprint: AGENTIK-SAG-DATA-CONTRACT-EXPORT-01
 */

import { SAG_MASTER_CONTRACT, SAG_VIEW_REQUESTS }   from "../sag-domain-contracts";
import { SAG_FIELD_CATALOG, buildKpiTraceabilityMatrix } from "../sag-field-catalog";
import type { SagDomainId, AgentikModule, AgentikKpi } from "../sag-data-contract";

// ── Output types ───────────────────────────────────────────────────────────────

export interface ContractMeta {
  version:              string;
  fechaGeneracion:      string;
  fechaUltimaReunion:   string;
  preparadoPor:         string;
  destinatario:         string;
  tituloDocumento:      string;
  resumenReunion:       string[];   // Bullet list of confirmed meeting conclusions
}

export interface ResumenEjecutivo {
  objetivo:             string;
  contexto:             string;
  dominiosCriticos:     string[];   // P1
  dominiosImportantes:  string[];   // P2
  dominiosDeseados:     string[];   // P3
  arquitecturaRecomendada: string;
  accesoHistorico:      string;
  proximosPasos:        string[];
}

export interface VistaRequerida {
  nombre:               string;     // vw_agentik_*
  dominio:              SagDomainId;
  prioridad:            1 | 2 | 3;
  status:               string;
  proposito:            string;
  tabelasFuente:        string[];
  frecuenciaSugerida:   string;
  camposRequeridos:     CampoRequerido[];
  modulosImpactados:    AgentikModule[];
  kpisHabilitados:      AgentikKpi[];
  notas?:               string;
}

export interface CampoRequerido {
  campo:      string;
  tipo:       string;
  obligatorio: boolean;
  descripcion: string;
  statusAcceso: string;
}

export interface TrazabilidadEntry {
  campo:      string;
  dominio:    SagDomainId;
  vista:      string;
  tipo:       string;
  obligatorio: boolean;
  statusAcceso: string;
  modulosAgentik: AgentikModule[];
  kpisAfectados:  AgentikKpi[];
}

export interface DomainStatusEntry {
  dominio:        SagDomainId;
  nombre:         string;
  prioridad:      1 | 2 | 3;
  status:         string;
  statusLabel:    string;
  accessMethod:   string;
  vistaSolicitada: string;
  totalCampos:    number;
  camposAcordados: number;
  kpisHabilitados: number;
  bloqueadores:   string[];
  notas?:         string;
}

export interface SagExecutiveContract {
  meta:                 ContractMeta;
  resumenEjecutivo:     ResumenEjecutivo;
  vistasRequeridas:     VistaRequerida[];
  matrizTrazabilidad:   TrazabilidadEntry[];
  statusDominios:       DomainStatusEntry[];
}

// ── Human-readable labels ──────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  agreed:          "ACORDADO",
  in_review:       "EN REVISIÓN",
  draft:           "BORRADOR",
  view_requested:  "VISTA SOLICITADA",
  view_created:    "VISTA CREADA",
  integrated:      "INTEGRADO",
  blocked:         "BLOQUEADO",
};

const FREQ_LABELS: Record<string, string> = {
  realtime:        "Tiempo real (<1 min)",
  near_realtime:   "Casi tiempo real (1–15 min)",
  hourly:          "Cada hora",
  daily_eod:       "Diario — fin de día",
  weekly:          "Semanal",
  on_demand:       "Bajo demanda",
};

const ACCESS_LABELS: Record<string, string> = {
  view:            "Vista SQL (vw_agentik_*)",
  direct_query:    "Consulta directa a tablas SAG",
  data_warehouse:  "Data Warehouse SAG",
  batch_export:    "Exportación batch programada",
  api_endpoint:    "Endpoint REST/SOAP",
  manual_upload:   "Carga manual (interino)",
};

const FIELD_STATUS_LABELS: Record<string, string> = {
  confirmed:      "Confirmado",
  agreed:         "Acordado en reunión",
  pending_access: "Pendiente acceso",
  pending_view:   "Pendiente creación de vista",
  unconfirmed:    "Sin confirmar",
  deprecated:     "Obsoleto",
  unavailable:    "No disponible",
};

// ── Phase 1 — Meta ─────────────────────────────────────────────────────────────

function buildMeta(): ContractMeta {
  return {
    version:            SAG_MASTER_CONTRACT.version,
    fechaGeneracion:    new Date().toISOString().slice(0, 10),
    fechaUltimaReunion: SAG_MASTER_CONTRACT.lastReviewedDate,
    preparadoPor:       "Agentik — Equipo de Integración de Datos",
    destinatario:       "Equipo SAG — Administración de Sistemas",
    tituloDocumento:    "Requerimientos de Integración Agentik × SAG — Documento Formal de Datos",
    resumenReunion: [
      "pagosnew contiene histórico completo sin restricciones de acceso.",
      "SAG recomienda consultas por rangos de fechas y procesos batch para historiales grandes.",
      "SAG confirma disponibilidad de vistas existentes para ventas, pagos, recaudos, cartera e inventario.",
      "SAG puede agregar campos adicionales a las vistas existentes según necesidad.",
      "SAG puede crear vistas nuevas nombradas según los requerimientos de Agentik.",
      "SAG recomienda arquitectura basada en Data Warehouse para lecturas de alto volumen.",
    ],
  };
}

// ── Phase 2 — Resumen ejecutivo ────────────────────────────────────────────────

function buildResumenEjecutivo(): ResumenEjecutivo {
  const p1 = SAG_MASTER_CONTRACT.domains
    .filter(d => d.prioridad === 1)
    .map(d => d.nombre);
  const p2 = SAG_MASTER_CONTRACT.domains
    .filter(d => d.prioridad === 2)
    .map(d => d.nombre);
  const p3 = SAG_MASTER_CONTRACT.domains
    .filter(d => d.prioridad === 3)
    .map(d => d.nombre);

  return {
    objetivo:
      "Establecer las vistas de datos y campos específicos que Agentik requiere de SAG para operar " +
      "los módulos de Conciliación, Tesorería, Cierre, Planeación, Cartera e Inventario. " +
      "Este documento define el contrato técnico formal entre ambos sistemas.",

    contexto:
      "Agentik es el sistema operacional de inteligencia de negocio de Castillitos. " +
      "Para operar con datos reales, Agentik necesita acceso de lectura a los datos transaccionales " +
      "que actualmente viven en SAG. El modelo acordado es: SAG crea vistas nombradas " +
      "(vw_agentik_*) y Agentik las consulta mediante sincronización diaria batch.",

    dominiosCriticos:    p1,
    dominiosImportantes: p2,
    dominiosDeseados:    p3,

    arquitecturaRecomendada:
      "Data Warehouse con sincronización batch diaria (fin de día). " +
      "Para dominios de alta frecuencia (pagos, recaudos, bancos) se propone sincronización " +
      "cada hora en fase 2. El acceso inicial es mediante vistas SQL nombradas vw_agentik_* " +
      "creadas por SAG sobre sus tablas transaccionales.",

    accesoHistorico:
      "SAG confirmó acceso histórico completo sin restricciones. " +
      "pagosnew contiene el historial de pagos desde el inicio de operaciones. " +
      "La consulta inicial de carga histórica se realizará por rangos de fechas " +
      "en procesos batch coordinados con el equipo SAG.",

    proximosPasos: [
      "SAG crea vista vw_agentik_pagos sobre tabla pagosnew (prioridad inmediata).",
      "SAG confirma nombres exactos de tablas fuente para dominio ventas.",
      "Agentik y SAG acuerdan esquema de autenticación para lectura de vistas.",
      "SAG habilita acceso a las 8 vistas listadas en este documento.",
      "Agentik ejecuta carga histórica inicial por rangos de fecha.",
      "Validación conjunta de totales: ventas + pagos + cartera para el período acordado.",
    ],
  };
}

// ── Phase 3 — Vistas requeridas ────────────────────────────────────────────────

function buildVistasRequeridas(): VistaRequerida[] {
  return SAG_MASTER_CONTRACT.domains
    .sort((a, b) => a.prioridad - b.prioridad)
    .map(domain => {
      const viewRequest = SAG_VIEW_REQUESTS.find(v => v.domain === domain.id);

      const camposRequeridos: CampoRequerido[] = domain.fields.map(f => ({
        campo:        f.campo,
        tipo:         f.tipo,
        obligatorio:  f.obligatorio,
        descripcion:  f.descripcion,
        statusAcceso: FIELD_STATUS_LABELS[f.status] ?? f.status,
      }));

      return {
        nombre:             domain.suggestedView ?? `vw_agentik_${domain.id}`,
        dominio:            domain.id,
        prioridad:          domain.prioridad,
        status:             STATUS_LABELS[domain.status] ?? domain.status,
        proposito:          domain.descripcion,
        tabelasFuente:      domain.primaryTables,
        frecuenciaSugerida: FREQ_LABELS[domain.syncFrequency] ?? domain.syncFrequency,
        camposRequeridos,
        modulosImpactados:  domain.modulosEnabled,
        kpisHabilitados:    domain.kpisEnabled,
        notas:              viewRequest?.notas ?? domain.notas,
      };
    });
}

// ── Phase 4 — Matriz de trazabilidad ──────────────────────────────────────────

function buildMatrizTrazabilidad(): TrazabilidadEntry[] {
  return SAG_FIELD_CATALOG
    .sort((a, b) => {
      // Sort by domain priority first, then by mandatory status
      const domainA = SAG_MASTER_CONTRACT.domains.find(d => d.id === a.domain);
      const domainB = SAG_MASTER_CONTRACT.domains.find(d => d.id === b.domain);
      const pA = domainA?.prioridad ?? 3;
      const pB = domainB?.prioridad ?? 3;
      if (pA !== pB) return pA - pB;
      if (a.obligatorio !== b.obligatorio) return a.obligatorio ? -1 : 1;
      return a.campo.localeCompare(b.campo);
    })
    .map(entry => ({
      campo:          entry.campo,
      dominio:        entry.domain,
      vista:          entry.viewName,
      tipo:           entry.tipo,
      obligatorio:    entry.obligatorio,
      statusAcceso:   FIELD_STATUS_LABELS[entry.status] ?? entry.status,
      modulosAgentik: entry.modulosImpactados,
      kpisAfectados:  entry.kpiTraceability,
    }));
}

// ── Phase 6 — Status de dominios ──────────────────────────────────────────────

function buildStatusDominios(): DomainStatusEntry[] {
  return SAG_MASTER_CONTRACT.domains
    .sort((a, b) => a.prioridad - b.prioridad)
    .map(domain => {
      const fields         = domain.fields;
      const acordados      = fields.filter(f =>
        f.status === "confirmed" || f.status === "agreed"
      ).length;

      return {
        dominio:          domain.id,
        nombre:           domain.nombre,
        prioridad:        domain.prioridad,
        status:           domain.status,
        statusLabel:      STATUS_LABELS[domain.status] ?? domain.status,
        accessMethod:     ACCESS_LABELS[domain.accessMethod] ?? domain.accessMethod,
        vistaSolicitada:  domain.suggestedView ?? `vw_agentik_${domain.id}`,
        totalCampos:      fields.length,
        camposAcordados:  acordados,
        kpisHabilitados:  domain.kpisEnabled.length,
        bloqueadores:     domain.bloqueadores ?? [],
        notas:            domain.notas,
      };
    });
}

// ── Main builder ───────────────────────────────────────────────────────────────

export function buildSagExecutiveContract(): SagExecutiveContract {
  return {
    meta:               buildMeta(),
    resumenEjecutivo:   buildResumenEjecutivo(),
    vistasRequeridas:   buildVistasRequeridas(),
    matrizTrazabilidad: buildMatrizTrazabilidad(),
    statusDominios:     buildStatusDominios(),
  };
}
