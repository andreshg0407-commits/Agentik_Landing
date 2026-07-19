"use client";

/**
 * components/marketing-studio/shopify/collections-panel.tsx
 *
 * SHOPIFY-COLLECTIONS-03B — Decomposed Collections Panel (within Catálogo Shopify)
 *
 * Compact panel embedded directly in the Shopify Catalog page.
 * NOT a separate route — lives inside the existing catalog surface.
 *
 * Architecture:
 *   CollectionsPanel        — state machine + data fetching
 *   ├── CollectionList      — list view with rows
 *   │   └── CollectionCard  — individual collection row
 *   ├── CollectionCreateForm — create/configure form
 *   ├── CollectionSyncPreview — dry-run summary before executing
 *   ├── CollectionSyncDone  — success summary
 *   └── CollectionEmptyState — empty / disconnected placeholder
 *
 * All language is business-level (no technical terms).
 * All actions use the dryRun → confirm → execute pattern.
 */

import React, { useState, useTransition, useCallback } from "react";
import { C, T, S, R } from "@/lib/ui/tokens";
import type { AgentikCollection } from "@/lib/marketing-studio/commerce/shopify-collections-service";

// ── Props ──────────────────────────────────────────────────────────────────────

export interface CollectionsPanelProps {
  orgSlug:     string;
  categories:  string[];
  /** Currently selected product IDs from the catalog (for "Agregar a colección") */
  selectedIds: string[];
  /** Whether Shopify is connected and the panel can make real API calls */
  isConnected: boolean;
}

// ── Internal types ─────────────────────────────────────────────────────────────

type PanelView = "list" | "create" | "sync_preview" | "syncing" | "done";

interface SyncPreview {
  collectionTitle:  string;
  candidatesCount:  number;
  willAddCount:     number;
  willPublishCount: number;
  blockedCount:     number;
}

interface SyncDoneResult {
  collectionTitle:   string;
  collectionCreated: boolean;
  productsPublished: number;
  productsAdded:     number;
  productsBlocked:   number;
  errors:            Array<{ productId: string; name: string; message: string }>;
}

// ── Shared style tokens ────────────────────────────────────────────────────────

const S_panel: React.CSSProperties = {
  border:       `1px solid ${C.line}`,
  borderRadius: R.lg,
  overflow:     "hidden",
  background:   C.surface,
};

const S_header: React.CSSProperties = {
  display:        "flex",
  alignItems:     "center",
  justifyContent: "space-between",
  padding:        `${S[3]}px ${S[4]}px`,
  borderBottom:   `1px solid ${C.line}`,
  background:     C.surfaceAlt,
};

const S_title: React.CSSProperties = {
  fontFamily: T.mono,
  fontSize:   T.sz.sm,
  color:      C.ink,
  margin:     0,
};

const S_badge: React.CSSProperties = {
  fontFamily:   T.mono,
  fontSize:     T.sz.xs,
  color:        C.inkMid,
  background:   C.line,
  borderRadius: R.pill,
  padding:      `2px ${S[2]}px`,
};

const S_body: React.CSSProperties = {
  padding: S[4],
};

const S_fieldLabel: React.CSSProperties = {
  fontFamily:   T.mono,
  fontSize:     T.sz.xs,
  color:        C.inkMid,
  marginBottom: S[1],
  display:      "block",
};

const S_input: React.CSSProperties = {
  fontFamily:   T.mono,
  fontSize:     T.sz.sm,
  color:        C.ink,
  border:       `1px solid ${C.line}`,
  borderRadius: R.md,
  padding:      `${S[2]}px ${S[3]}px`,
  width:        "100%",
  background:   C.surface,
  outline:      "none",
  boxSizing:    "border-box",
};

const S_select: React.CSSProperties = {
  ...S_input,
  cursor: "pointer",
};

const S_actionRow: React.CSSProperties = {
  display:   "flex",
  gap:       S[2],
  marginTop: S[3],
};

const S_btnPrimary: React.CSSProperties = {
  fontFamily:   T.mono,
  fontSize:     T.sz.sm,
  color:        "#fff",
  background:   C.blueDark,
  border:       "none",
  borderRadius: R.md,
  padding:      `${S[2]}px ${S[3]}px`,
  cursor:       "pointer",
  flexShrink:   0,
};

const S_btnGhost: React.CSSProperties = {
  fontFamily:   T.mono,
  fontSize:     T.sz.sm,
  color:        C.inkMid,
  background:   "transparent",
  border:       `1px solid ${C.line}`,
  borderRadius: R.md,
  padding:      `${S[2]}px ${S[3]}px`,
  cursor:       "pointer",
  flexShrink:   0,
};

const S_previewBox: React.CSSProperties = {
  background:   C.surfaceAlt,
  border:       `1px solid ${C.line}`,
  borderRadius: R.md,
  padding:      S[3],
  marginBottom: S[3],
};

const S_previewRow: React.CSSProperties = {
  display:        "flex",
  justifyContent: "space-between",
  marginBottom:   S[1],
};

const S_previewLabel: React.CSSProperties = {
  fontFamily: T.mono,
  fontSize:   T.sz.xs,
  color:      C.inkMid,
};

const S_previewValue: React.CSSProperties = {
  fontFamily: T.mono,
  fontSize:   T.sz.xs,
  color:      C.ink,
};

const S_doneBox: React.CSSProperties = {
  background:   C.greenLight,
  border:       `1px solid ${C.greenBorder}`,
  borderRadius: R.md,
  padding:      S[3],
  marginBottom: S[3],
};

const S_errorBox: React.CSSProperties = {
  background:   C.redLight,
  border:       `1px solid ${C.redBorder}`,
  borderRadius: R.md,
  padding:      S[3],
  marginTop:    S[2],
};

const S_errorText: React.CSSProperties = {
  fontFamily: T.mono,
  fontSize:   T.sz.xs,
  color:      C.red,
};

const S_emptyText: React.CSSProperties = {
  fontFamily: T.mono,
  fontSize:   T.sz.sm,
  color:      C.inkMid,
  textAlign:  "center",
  padding:    `${S[6]}px 0`,
};

const S_collectionRow: React.CSSProperties = {
  display:        "flex",
  alignItems:     "center",
  justifyContent: "space-between",
  padding:        `${S[2]}px ${S[3]}px`,
  borderRadius:   R.md,
  border:         `1px solid ${C.line}`,
  marginBottom:   S[2],
  background:     C.surface,
};

// ── CollectionEmptyState ───────────────────────────────────────────────────────

function CollectionEmptyState({ message }: { message: string }) {
  return <p style={S_emptyText}>{message}</p>;
}

// ── CollectionCard ─────────────────────────────────────────────────────────────

function CollectionCard({ col }: { col: AgentikCollection }) {
  const statusStyle: React.CSSProperties = {
    fontFamily:   T.mono,
    fontSize:     T.sz.xs,
    borderRadius: R.pill,
    padding:      `2px ${S[2]}px`,
    background:   col.isPublished ? C.greenLight  : C.surfaceAlt,
    color:        col.isPublished ? C.green        : C.inkMid,
    border:       `1px solid ${col.isPublished ? C.greenBorder : C.line}`,
  };

  return (
    <div style={S_collectionRow}>
      <div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink }}>
          {col.title}
          {col.managedByAgentik && (
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark, marginLeft: S[2] }}>
              Agentik
            </span>
          )}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
          {col.productCount} producto{col.productCount !== 1 ? "s" : ""}
        </div>
      </div>
      <span style={statusStyle}>
        {col.isPublished ? "Publicada" : "Oculta"}
      </span>
    </div>
  );
}

// ── CollectionList ─────────────────────────────────────────────────────────────

interface CollectionListProps {
  collections:      AgentikCollection[];
  loading:          boolean;
  error:            string | null;
  isConnected:      boolean;
  onNew:            () => void;
  onRefresh:        () => void;
}

function CollectionList({
  collections,
  loading,
  error,
  isConnected,
  onNew,
  onRefresh,
}: CollectionListProps) {
  return (
    <>
      {loading && <CollectionEmptyState message="Cargando colecciones…" />}

      {!loading && collections.length === 0 && (
        <CollectionEmptyState message="Sin colecciones en esta tienda todavía." />
      )}

      {!loading && collections.length > 0 && (
        <div style={{ marginBottom: S[3] }}>
          {collections.map(col => <CollectionCard key={col.id} col={col} />)}
        </div>
      )}

      {error && (
        <div style={S_errorBox}>
          <span style={S_errorText}>{error}</span>
        </div>
      )}

      <div style={S_actionRow}>
        <button style={S_btnPrimary} onClick={onNew} disabled={!isConnected}>
          + Nueva colección
        </button>
        <button style={S_btnGhost} onClick={onRefresh} disabled={loading || !isConnected}>
          Actualizar
        </button>
      </div>
    </>
  );
}

// ── CollectionCreateForm ───────────────────────────────────────────────────────

interface CollectionCreateFormProps {
  createMode:        "blank" | "category";
  createTitle:       string;
  createCategory:    string;
  categories:        string[];
  selectedIds:       string[];
  publishOnSync:     boolean;
  isPending:         boolean;
  error:             string | null;
  onModeChange:      (m: "blank" | "category") => void;
  onTitleChange:     (v: string) => void;
  onCategoryChange:  (v: string) => void;
  onPublishChange:   (v: boolean) => void;
  onPreview:         () => void;
  onCancel:          () => void;
}

function CollectionCreateForm({
  createMode,
  createTitle,
  createCategory,
  categories,
  selectedIds,
  publishOnSync,
  isPending,
  error,
  onModeChange,
  onTitleChange,
  onCategoryChange,
  onPublishChange,
  onPreview,
  onCancel,
}: CollectionCreateFormProps) {
  const activeStyle = (active: boolean): React.CSSProperties => ({
    ...S_btnGhost,
    ...(active ? { borderColor: C.blueDark, color: C.blueDark } : {}),
  });

  const canSubmit =
    !isPending &&
    (createMode === "blank" ? !!createTitle.trim() : !!createCategory);

  return (
    <>
      {/* Mode toggle */}
      <div style={{ marginBottom: S[3], display: "flex", gap: S[2] }}>
        <button style={activeStyle(createMode === "blank")} onClick={() => onModeChange("blank")}>
          Colección en blanco
        </button>
        <button
          style={activeStyle(createMode === "category")}
          onClick={() => onModeChange("category")}
          disabled={categories.length === 0}
        >
          Desde categoría
        </button>
      </div>

      {/* Input */}
      {createMode === "blank" ? (
        <div>
          <label style={S_fieldLabel}>Nombre de la colección</label>
          <input
            style={S_input}
            placeholder="Ej. Ropa para bebé, Navidad, Ofertas…"
            value={createTitle}
            onChange={e => onTitleChange(e.target.value)}
          />
        </div>
      ) : (
        <div>
          <label style={S_fieldLabel}>Categoría Agentik</label>
          <select
            style={S_select}
            value={createCategory}
            onChange={e => onCategoryChange(e.target.value)}
          >
            <option value="">Seleccionar categoría…</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <p style={{ ...S_fieldLabel, marginTop: S[2] }}>
            Se incluirán todos los productos de esa categoría.
            {selectedIds.length > 0 && ` (${selectedIds.length} productos seleccionados tienen prioridad)`}
          </p>
        </div>
      )}

      {/* Publish option */}
      <label style={{ ...S_fieldLabel, marginTop: S[3], display: "flex", alignItems: "center", gap: S[2], cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={publishOnSync}
          onChange={e => onPublishChange(e.target.checked)}
        />
        Publicar productos sin publicar antes de agregar
      </label>

      {error && (
        <div style={{ ...S_errorBox, marginTop: S[2] }}>
          <span style={S_errorText}>{error}</span>
        </div>
      )}

      <div style={{ ...S_actionRow, marginTop: S[3] }}>
        <button style={S_btnPrimary} onClick={onPreview} disabled={!canSubmit}>
          {isPending ? "Analizando…" : "Ver resumen"}
        </button>
        <button style={S_btnGhost} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </>
  );
}

// ── CollectionSyncPreview ──────────────────────────────────────────────────────

interface CollectionSyncPreviewProps {
  preview:     SyncPreview;
  error:       string | null;
  onConfirm:   () => void;
  onBack:      () => void;
}

function CollectionSyncPreview({ preview, error, onConfirm, onBack }: CollectionSyncPreviewProps) {
  // Guard: empty collection — nothing to add
  if (preview.candidatesCount === 0) {
    return (
      <>
        <div style={{ ...S_previewBox, border: `1px solid ${C.amber}` }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.amber, marginBottom: S[1] }}>
            Sin productos disponibles
          </div>
          <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, margin: 0 }}>
            No hay productos disponibles para crear esta colección.
            Verifica que los productos tengan categoría asignada y estén listos para publicar.
          </p>
        </div>
        <div style={S_actionRow}>
          <button style={S_btnGhost} onClick={onBack}>Volver</button>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={S_previewBox}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, marginBottom: S[2] }}>
          Colección: <strong>{preview.collectionTitle}</strong>
        </div>
        <div style={S_previewRow}>
          <span style={S_previewLabel}>Productos candidatos</span>
          <span style={S_previewValue}>{preview.candidatesCount}</span>
        </div>
        <div style={S_previewRow}>
          <span style={S_previewLabel}>Se agregarán a la colección</span>
          <span style={{ ...S_previewValue, color: C.green }}>{preview.willAddCount}</span>
        </div>
        {preview.willPublishCount > 0 && (
          <div style={S_previewRow}>
            <span style={S_previewLabel}>Se publicarán primero</span>
            <span style={{ ...S_previewValue, color: C.blueDark }}>{preview.willPublishCount}</span>
          </div>
        )}
        {preview.blockedCount > 0 && (
          <div style={S_previewRow}>
            <span style={S_previewLabel}>Requieren completar información</span>
            <span style={{ ...S_previewValue, color: C.red }}>{preview.blockedCount}</span>
          </div>
        )}
      </div>

      {error && (
        <div style={S_errorBox}>
          <span style={S_errorText}>{error}</span>
        </div>
      )}

      <div style={S_actionRow}>
        <button style={S_btnPrimary} onClick={onConfirm}>
          Confirmar y publicar colección
        </button>
        <button style={S_btnGhost} onClick={onBack}>
          Volver
        </button>
      </div>
    </>
  );
}

// ── CollectionSyncDone ─────────────────────────────────────────────────────────

interface CollectionSyncDoneProps {
  result:    SyncDoneResult;
  onReset:   () => void;
}

function CollectionSyncDone({ result, onReset }: CollectionSyncDoneProps) {
  return (
    <>
      <div style={S_doneBox}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.green, marginBottom: S[2] }}>
          {result.collectionCreated
            ? `Colección "${result.collectionTitle}" creada`
            : `Colección "${result.collectionTitle}" actualizada`}
        </div>
        <div style={S_previewRow}>
          <span style={S_previewLabel}>Productos agregados</span>
          <span style={S_previewValue}>{result.productsAdded}</span>
        </div>
        {result.productsPublished > 0 && (
          <div style={S_previewRow}>
            <span style={S_previewLabel}>Productos publicados</span>
            <span style={S_previewValue}>{result.productsPublished}</span>
          </div>
        )}
        {result.productsBlocked > 0 && (
          <div style={S_previewRow}>
            <span style={{ ...S_previewLabel, color: C.amber }}>Sin completar</span>
            <span style={{ ...S_previewValue, color: C.amber }}>{result.productsBlocked}</span>
          </div>
        )}
      </div>

      {result.errors.length > 0 && (
        <div style={S_errorBox}>
          {result.errors.slice(0, 3).map((e, i) => (
            <div key={i} style={S_errorText}>{e.name}: {e.message}</div>
          ))}
          {result.errors.length > 3 && (
            <div style={S_errorText}>y {result.errors.length - 3} errores más…</div>
          )}
        </div>
      )}

      <div style={S_actionRow}>
        <button style={S_btnPrimary} onClick={onReset}>
          Volver a colecciones
        </button>
      </div>
    </>
  );
}

// ── CollectionsPanel ───────────────────────────────────────────────────────────

export function CollectionsPanel({
  orgSlug,
  categories,
  selectedIds,
  isConnected,
}: CollectionsPanelProps) {
  const [view,        setView]        = useState<PanelView>("list");
  const [collections, setCollections] = useState<AgentikCollection[] | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [preview,     setPreview]     = useState<SyncPreview | null>(null);
  const [doneResult,  setDoneResult]  = useState<SyncDoneResult | null>(null);
  const [isPending,   startTransition] = useTransition();
  const [expanded,    setExpanded]    = useState(false);

  // Create form state
  const [createTitle,    setCreateTitle]    = useState("");
  const [createCategory, setCreateCategory] = useState("");
  const [createMode,     setCreateMode]     = useState<"blank" | "category">("blank");
  const [publishOnSync,  setPublishOnSync]  = useState(false);

  const baseUrl = `/api/orgs/${orgSlug}/marketing-studio/shopify/catalog/collections`;

  // ── Data ───────────────────────────────────────────────────────────────────

  const fetchCollections = useCallback(async () => {
    if (!isConnected) { setCollections([]); return; }
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(baseUrl);
      const data = await res.json() as { ok?: boolean; collections?: AgentikCollection[]; error?: string };
      if (data.ok) {
        setCollections(data.collections ?? []);
      } else {
        setError(data.error ?? "Error al cargar colecciones");
        setCollections([]);
      }
    } catch {
      setError("Error de conexión");
      setCollections([]);
    } finally {
      setLoading(false);
    }
  }, [baseUrl, isConnected]);

  const handleExpand = () => {
    setExpanded(e => {
      if (!e && collections === null) fetchCollections();
      return !e;
    });
  };

  // ── dryRun preview ─────────────────────────────────────────────────────────

  const handlePreview = () => {
    const title = createMode === "category" && createCategory ? createCategory : createTitle.trim();
    if (!title) return;
    setError(null);
    startTransition(async () => {
      try {
        const res  = await fetch(`${baseUrl}/sync`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            dryRun:     true,
            category:   createMode === "category" ? createCategory : undefined,
            productIds: selectedIds.length > 0 ? selectedIds : undefined,
          }),
        });
        const data = await res.json() as {
          ok?:              boolean;
          collectionTitle?: string;
          candidatesCount?: number;
          willAddCount?:    number;
          willPublishCount?:number;
          blockedCount?:    number;
          error?:           string;
        };
        if (data.ok) {
          setPreview({
            collectionTitle:  data.collectionTitle  ?? title,
            candidatesCount:  data.candidatesCount  ?? 0,
            willAddCount:     data.willAddCount      ?? 0,
            willPublishCount: data.willPublishCount  ?? 0,
            blockedCount:     data.blockedCount      ?? 0,
          });
          setView("sync_preview");
        } else {
          setError(data.error ?? "Error en previsualización");
        }
      } catch {
        setError("Error de conexión");
      }
    });
  };

  // ── Execute ────────────────────────────────────────────────────────────────

  const handleExecute = async () => {
    if (!preview) return;
    const title = preview.collectionTitle;
    setView("syncing");
    setError(null);

    try {
      const res  = await fetch(`${baseUrl}/sync`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          dryRun:     false,
          category:   createMode === "category" ? createCategory : undefined,
          productIds: selectedIds.length > 0 ? selectedIds : undefined,
        }),
      });
      const data = await res.json() as {
        ok?:                boolean;
        collectionTitle?:   string;
        collectionCreated?: boolean;
        productsPublished?: number;
        productsAdded?:     number;
        productsBlocked?:   number;
        errors?:            Array<{ productId: string; name: string; message: string }>;
        error?:             string;
      };

      if (data.ok) {
        setDoneResult({
          collectionTitle:   data.collectionTitle   ?? title,
          collectionCreated: data.collectionCreated ?? false,
          productsPublished: data.productsPublished ?? 0,
          productsAdded:     data.productsAdded     ?? 0,
          productsBlocked:   data.productsBlocked   ?? 0,
          errors:            data.errors            ?? [],
        });
        setView("done");
        fetchCollections();
      } else {
        setError(data.error ?? "Error al sincronizar colección");
        setView("sync_preview");
      }
    } catch {
      setError("Error de conexión");
      setView("sync_preview");
    }
  };

  const handleReset = () => {
    setView("list");
    setPreview(null);
    setDoneResult(null);
    setError(null);
    setCreateTitle("");
    setCreateCategory("");
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const collectionCount = collections?.length ?? 0;

  return (
    <div style={S_panel}>
      {/* Panel header — acts as expand/collapse toggle */}
      <div
        style={{ ...S_header, cursor: "pointer" }}
        onClick={handleExpand}
        role="button"
        aria-expanded={expanded}
      >
        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
          <span style={S_title}>Colecciones</span>
          {collections !== null && (
            <span style={S_badge}>{collectionCount}</span>
          )}
          {!isConnected && (
            <span style={{ ...S_badge, color: C.red }}>Sin conexión</span>
          )}
        </div>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {expanded && (
        <div style={S_body}>
          {view === "list" && (
            <CollectionList
              collections={collections ?? []}
              loading={loading}
              error={error}
              isConnected={isConnected}
              onNew={() => setView("create")}
              onRefresh={fetchCollections}
            />
          )}

          {view === "create" && (
            <CollectionCreateForm
              createMode={createMode}
              createTitle={createTitle}
              createCategory={createCategory}
              categories={categories}
              selectedIds={selectedIds}
              publishOnSync={publishOnSync}
              isPending={isPending}
              error={error}
              onModeChange={setCreateMode}
              onTitleChange={setCreateTitle}
              onCategoryChange={setCreateCategory}
              onPublishChange={setPublishOnSync}
              onPreview={handlePreview}
              onCancel={handleReset}
            />
          )}

          {view === "sync_preview" && preview && (
            <CollectionSyncPreview
              preview={preview}
              error={error}
              onConfirm={handleExecute}
              onBack={() => setView("create")}
            />
          )}

          {view === "syncing" && (
            <CollectionEmptyState message="Publicando colección…" />
          )}

          {view === "done" && doneResult && (
            <CollectionSyncDone result={doneResult} onReset={handleReset} />
          )}
        </div>
      )}
    </div>
  );
}
