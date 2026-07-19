"use client";
/**
 * components/marketing-studio/catalogs/catalog-detail-client.tsx
 *
 * MARKETING-STUDIO-CATALOG-LAYOUTS-01 — Catalog Detail (with Layout Engine)
 *
 * Shows the resolved products for a saved CatalogDefinition.
 * Uses CatalogLayoutRenderer for category-grouped visual display.
 * Config panel: layout, groupByCategory, categorySort — all persisted.
 */

import { useState, useCallback }         from "react";
import { useRouter }                     from "next/navigation";
import { C, T, S, R, E }                 from "@/lib/ui/tokens";
import {
  CATALOG_STATUS_LABELS,
  PRICING_MODE_LABELS,
  CTA_MODE_LABELS,
  CATALOG_LAYOUT_LABELS,
  CATEGORY_SORT_LABELS,
  CATALOG_TEMPLATE_KEY_LABELS,
}                                        from "@/lib/marketing-studio/catalogs/catalog-definition-types";
import type {
  CatalogDefinitionStatus,
  CatalogFilterRule,
  CatalogGroupBy,
  CatalogLayout,
  CatalogSortField,
  CatalogTemplateKey,
  CategorySortMode,
  CtaMode,
  PricingMode,
  SortDirection,
}                                        from "@/lib/marketing-studio/catalogs/catalog-definition-types";
import {
  CATALOG_TEMPLATES,
  CATALOG_TEMPLATE_KEYS,
  getCatalogTemplate,
}                                        from "@/lib/marketing-studio/catalogs/catalog-template-definitions";
import type { CatalogProductItem, CatalogProductGroup } from "@/lib/marketing-studio/catalogs/catalog-query-service";
import type { CatalogLayoutResult }      from "@/lib/marketing-studio/catalogs/catalog-layout-engine";
import { CatalogLayoutRenderer }         from "./catalog-layout-renderer";
import { CatalogSharePanel }            from "./catalog-share-panel";
import { CatalogQrPanel }              from "./catalog-qr-panel";
import type { CatalogPublicLinkRecord } from "@/lib/marketing-studio/catalogs/catalog-public-link-types";

// ── Props ─────────────────────────────────────────────────────────────────────

interface CatalogDefinitionProps {
  id:              string;
  name:            string;
  description:     string | null;
  status:          CatalogDefinitionStatus;
  filters:         CatalogFilterRule[];
  sortField:       CatalogSortField;
  sortDirection:   SortDirection;
  groupBy:         CatalogGroupBy;
  pricingMode:     PricingMode;
  ctaMode:         CtaMode;
  whatsAppPhone:   string | null;
  layout:          CatalogLayout;
  groupByCategory: boolean;
  categorySort:    CategorySortMode;
  categoryOrder:   string[];
  templateKey:     CatalogTemplateKey;
}

interface InitialResolved {
  items:           CatalogProductItem[];
  groups:          CatalogProductGroup[];
  totalCount:      number;
  pricingMode:     PricingMode;
  layoutResult:    CatalogLayoutResult;
}

interface Props {
  orgSlug:          string;
  definition:       CatalogDefinitionProps;
  initialResolved:  InitialResolved;
  initialPublicLink: CatalogPublicLinkRecord | null;
}

// ── Config Panel ──────────────────────────────────────────────────────────────

function ConfigPanel({
  layout,          groupByCategory, categorySort, templateKey,
  onLayout,        onGroupByCategory, onCategorySort, onTemplateKey,
  saving,
}: {
  layout:            CatalogLayout;
  groupByCategory:   boolean;
  categorySort:      CategorySortMode;
  templateKey:       CatalogTemplateKey;
  onLayout:          (v: CatalogLayout) => void;
  onGroupByCategory: (v: boolean) => void;
  onCategorySort:    (v: CategorySortMode) => void;
  onTemplateKey:     (v: CatalogTemplateKey) => void;
  saving:            boolean;
}) {
  const labelStyle: React.CSSProperties = {
    fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
    color: C.inkMid, display: "block", marginBottom: 4,
  };
  const selectStyle: React.CSSProperties = {
    fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink,
    background: C.white, border: `1px solid ${C.line}`,
    borderRadius: R.sm, padding: "3px 6px", cursor: saving ? "not-allowed" : "pointer",
  };

  const activeTemplate = getCatalogTemplate(templateKey);

  return (
    <div style={{
      display:     "flex",
      alignItems:  "flex-end",
      gap:         S[4],
      flexWrap:    "wrap" as const,
      padding:     `${S[2]}px ${S[3]}px`,
      background:  C.surface,
      border:      `1px solid ${C.line}`,
      borderRadius: R.md,
      marginBottom: S[4],
      boxShadow:   E.xs,
    }}>
      {/* Template selector */}
      <div style={{ minWidth: 200 }}>
        <label style={labelStyle}>Plantilla comercial</label>
        <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" as const }}>
          {CATALOG_TEMPLATE_KEYS.map(k => {
            const isActive = templateKey === k;
            return (
              <button
                key={k}
                onClick={() => onTemplateKey(k)}
                disabled={saving}
                title={CATALOG_TEMPLATES[k].useCase}
                style={{
                  fontFamily:   T.mono,
                  fontSize:     T.sz["2xs"],
                  fontWeight:   isActive ? T.wt.bold : T.wt.normal,
                  padding:      "3px 10px",
                  borderRadius: R.sm,
                  border:       `1px solid ${isActive ? C.blueDark : C.line}`,
                  background:   isActive ? C.blueDark : C.white,
                  color:        isActive ? C.white : C.inkMid,
                  cursor:       saving ? "not-allowed" : "pointer",
                }}
              >
                {CATALOG_TEMPLATE_KEY_LABELS[k]}
              </button>
            );
          })}
        </div>
        <div style={{
          fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
          marginTop: 4, maxWidth: 280,
        }}>
          {activeTemplate.description}
        </div>
      </div>

      {/* Layout toggle */}
      <div>
        <label style={labelStyle}>Layout</label>
        <div style={{ display: "flex", gap: S[1] }}>
          {(["GRID_STANDARD", "LIST_STANDARD"] as CatalogLayout[]).map(v => (
            <button
              key={v}
              onClick={() => onLayout(v)}
              disabled={saving}
              style={{
                fontFamily:  T.mono,
                fontSize:    T.sz["2xs"],
                fontWeight:  layout === v ? T.wt.bold : T.wt.normal,
                padding:     "3px 10px",
                borderRadius: R.sm,
                border:      `1px solid ${layout === v ? C.blueDark : C.line}`,
                background:  layout === v ? C.blueDark : C.white,
                color:       layout === v ? C.white : C.inkMid,
                cursor:      saving ? "not-allowed" : "pointer",
              }}
            >
              {CATALOG_LAYOUT_LABELS[v]}
            </button>
          ))}
        </div>
      </div>

      {/* Group by category */}
      <div>
        <label style={labelStyle}>Organización</label>
        <div style={{ display: "flex", alignItems: "center", gap: S[1] }}>
          <input
            type="checkbox"
            checked={groupByCategory}
            onChange={e => onGroupByCategory(e.target.checked)}
            disabled={saving}
            style={{ cursor: saving ? "not-allowed" : "pointer" }}
          />
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink }}>
            Agrupar por categoría
          </span>
        </div>
      </div>

      {/* Category sort (only when groupByCategory) */}
      {groupByCategory && (
        <div>
          <label style={labelStyle}>Orden de categorías</label>
          <select
            style={selectStyle}
            value={categorySort}
            disabled={saving}
            onChange={e => onCategorySort(e.target.value as CategorySortMode)}
          >
            {(Object.entries(CATEGORY_SORT_LABELS) as [CategorySortMode, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CatalogDetailClient({ orgSlug, definition, initialResolved, initialPublicLink }: Props) {
  const router = useRouter();

  const [status,          setStatusState]      = useState<CatalogDefinitionStatus>(definition.status);
  const [layout,          setLayout]           = useState<CatalogLayout>(definition.layout);
  const [groupByCategory, setGroupByCategory]  = useState<boolean>(definition.groupByCategory);
  const [categorySort,    setCategorySort]     = useState<CategorySortMode>(definition.categorySort);
  const [templateKey,     setTemplateKey]      = useState<CatalogTemplateKey>(definition.templateKey);
  const [working,         setWorking]          = useState(false);
  const [error,           setError]            = useState<string | null>(null);
  const [exporting,       setExporting]        = useState(false);

  // Recompute layout result client-side when config changes
  const [layoutResult, setLayoutResult] = useState<CatalogLayoutResult>(initialResolved.layoutResult);

  const statusColor =
    status === "active" ? C.green :
    status === "draft"  ? C.amber  :
    C.inkFaint;

  // ── Generic PATCH helper ─────────────────────────────────────────────────────

  const patch = useCallback(async (body: Record<string, unknown>) => {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/orgs/${orgSlug}/marketing-studio/catalog-definitions/${definition.id}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      if (!res.ok) { setError("Error al guardar cambios"); }
    } catch {
      setError("Error de red");
    } finally {
      setWorking(false);
    }
  }, [orgSlug, definition.id]);

  // ── Config handlers (persist immediately) ────────────────────────────────────

  const handleLayoutChange = useCallback(async (v: CatalogLayout) => {
    setLayout(v);
    await patch({ layout: v });
  }, [patch]);

  const handleGroupByCategoryChange = useCallback(async (v: boolean) => {
    setGroupByCategory(v);
    // Recompute layout result client-side from existing items
    // (full re-resolve would require a server round-trip; items are already loaded)
    const { buildCatalogLayout, buildFlatLayout } = await import("@/lib/marketing-studio/catalogs/catalog-layout-engine");
    const newResult = v
      ? buildCatalogLayout(initialResolved.items, categorySort, definition.categoryOrder)
      : buildFlatLayout(initialResolved.items, definition.name);
    setLayoutResult(newResult);
    await patch({ groupByCategory: v });
  }, [patch, categorySort, definition.categoryOrder, definition.name, initialResolved.items]);

  const handleCategorySortChange = useCallback(async (v: CategorySortMode) => {
    setCategorySort(v);
    const { buildCatalogLayout } = await import("@/lib/marketing-studio/catalogs/catalog-layout-engine");
    const newResult = buildCatalogLayout(initialResolved.items, v, definition.categoryOrder);
    setLayoutResult(newResult);
    await patch({ categorySort: v });
  }, [patch, definition.categoryOrder, initialResolved.items]);

  const handleTemplateKeyChange = useCallback(async (v: CatalogTemplateKey) => {
    setTemplateKey(v);
    await patch({ templateKey: v });
  }, [patch]);

  // ── Status change ────────────────────────────────────────────────────────────

  const handleStatusChange = useCallback(async (newStatus: CatalogDefinitionStatus) => {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/orgs/${orgSlug}/marketing-studio/catalog-definitions/${definition.id}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }) },
      );
      if (!res.ok) { setError("Error al cambiar estado"); return; }
      setStatusState(newStatus);
    } catch {
      setError("Error de red");
    } finally {
      setWorking(false);
    }
  }, [orgSlug, definition.id]);

  // ── Export PDF ───────────────────────────────────────────────────────────────

  const handleExportPdf = useCallback(async () => {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/orgs/${orgSlug}/marketing-studio/catalog-definitions/${definition.id}/export/pdf`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "Error al generar PDF");
        return;
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `${definition.name}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError("Error de red al exportar PDF");
    } finally {
      setExporting(false);
    }
  }, [orgSlug, definition.id, definition.name]);

  // ── Duplicate ────────────────────────────────────────────────────────────────

  const handleDuplicate = useCallback(async () => {
    const newName = prompt(`Nombre para la copia de "${definition.name}":`, `Copia de ${definition.name}`);
    if (!newName?.trim()) return;
    setWorking(true);
    try {
      const res = await fetch(
        `/api/orgs/${orgSlug}/marketing-studio/catalog-definitions/${definition.id}/duplicate`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName.trim() }) },
      );
      if (!res.ok) { setError("Error al duplicar"); return; }
      const data = await res.json() as { definition: { id: string } };
      router.push(`/${orgSlug}/agentik/marketing-studio/catalogos/${data.definition.id}`);
    } catch {
      setError("Error de red");
    } finally {
      setWorking(false);
    }
  }, [orgSlug, definition.id, definition.name, router]);

  // ── Delete ────────────────────────────────────────────────────────────────────

  const handleDelete = useCallback(async () => {
    if (!confirm(`¿Eliminar el catálogo "${definition.name}"? Esta acción no se puede deshacer.`)) return;
    setWorking(true);
    try {
      const res = await fetch(
        `/api/orgs/${orgSlug}/marketing-studio/catalog-definitions/${definition.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) { setError("Error al eliminar"); return; }
      router.push(`/${orgSlug}/agentik/marketing-studio/catalogos`);
    } catch {
      setError("Error de red");
    } finally {
      setWorking(false);
    }
  }, [orgSlug, definition.id, definition.name, router]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: T.mono }}>

      {/* ── Meta bar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: S[3], flexWrap: "wrap" as const,
        padding: `${S[2]}px ${S[3]}px`,
        background: C.surface, border: `1px solid ${C.line}`,
        borderRadius: R.md, marginBottom: S[3], boxShadow: E.xs,
      }}>
        <span style={{
          fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold,
          padding: "2px 8px", borderRadius: R.pill,
          background: statusColor + "20", color: statusColor,
          border: `1px solid ${statusColor}40`,
          textTransform: "uppercase" as const, letterSpacing: "0.06em",
        }}>
          {CATALOG_STATUS_LABELS[status]}
        </span>

        <span style={{
          fontFamily: T.mono, fontSize: T.sz["2xs"],
          color: C.blueDark, fontWeight: T.wt.semibold,
        }}>
          {CATALOG_TEMPLATE_KEY_LABELS[templateKey]}
        </span>

        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
          {PRICING_MODE_LABELS[definition.pricingMode]}
        </span>

        {definition.ctaMode !== "none" && (
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.green }}>
            {CTA_MODE_LABELS[definition.ctaMode]}
            {definition.whatsAppPhone ? ` · ${definition.whatsAppPhone}` : ""}
          </span>
        )}

        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
          {layoutResult.totalCount} productos · {layoutResult.sections.length} secciones
        </span>

        <div style={{ marginLeft: "auto", display: "flex", gap: S[2], flexWrap: "wrap" as const }}>
          {status === "draft" && (
            <button onClick={() => handleStatusChange("active")} disabled={working} style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
              padding: "2px 8px", borderRadius: R.sm, cursor: working ? "not-allowed" : "pointer",
              background: C.green, color: C.white, border: "none",
            }}>Activar</button>
          )}
          {status === "active" && (
            <button onClick={() => handleStatusChange("archived")} disabled={working} style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
              padding: "2px 8px", borderRadius: R.sm, cursor: working ? "not-allowed" : "pointer",
              background: C.inkFaint, color: C.white, border: "none",
            }}>Archivar</button>
          )}
          <button
            onClick={() => void handleExportPdf()}
            disabled={working || exporting}
            style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
              padding: "2px 8px", borderRadius: R.sm,
              cursor: (working || exporting) ? "not-allowed" : "pointer",
              background: exporting ? C.inkFaint : C.blueDark,
              border: "none", color: C.white,
            }}
          >
            {exporting ? "Generando PDF…" : "Exportar PDF"}
          </button>
          <button onClick={handleDuplicate} disabled={working} style={{
            fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "2px 8px", borderRadius: R.sm,
            cursor: working ? "not-allowed" : "pointer",
            background: "transparent", border: `1px solid ${C.line}`, color: C.inkMid,
          }}>Duplicar</button>
          <button onClick={handleDelete} disabled={working} style={{
            fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "2px 8px", borderRadius: R.sm,
            cursor: working ? "not-allowed" : "pointer",
            background: "transparent", border: `1px solid ${C.red}40`, color: C.red,
          }}>Eliminar</button>
        </div>
      </div>

      {/* ── Share panel ── */}
      <CatalogSharePanel
        orgSlug={orgSlug}
        catalogId={definition.id}
        initialLink={initialPublicLink}
      />

      {/* ── QR panel ── */}
      <CatalogQrPanel
        orgSlug={orgSlug}
        catalogId={definition.id}
        catalogName={definition.name}
        initialLink={initialPublicLink}
      />

      {/* ── Config panel ── */}
      <ConfigPanel
        layout={layout}
        groupByCategory={groupByCategory}
        categorySort={categorySort}
        templateKey={templateKey}
        onLayout={handleLayoutChange}
        onGroupByCategory={handleGroupByCategoryChange}
        onCategorySort={handleCategorySortChange}
        onTemplateKey={handleTemplateKeyChange}
        saving={working}
      />

      {/* ── Error ── */}
      {error && (
        <div style={{
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.red,
          background: "#fff1f0", border: `1px solid ${C.red}40`,
          borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`,
          marginBottom: S[3],
        }}>
          {error}
        </div>
      )}

      {/* ── Layout renderer ── */}
      <CatalogLayoutRenderer
        layoutResult={layoutResult}
        layout={layout}
        pricingMode={definition.pricingMode}
        ctaMode={definition.ctaMode}
        whatsAppPhone={definition.whatsAppPhone}
        catalogName={definition.name}
        templateKey={templateKey}
      />

    </div>
  );
}
