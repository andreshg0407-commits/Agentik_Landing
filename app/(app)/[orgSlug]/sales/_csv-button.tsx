"use client";

/**
 * Client-side CSV export button.
 * Receives column headers + rows as plain data; generates a BOM-prefixed
 * CSV blob and triggers a browser download.
 */

export function DownloadCsvButton({
  filename,
  columns,
  rows,
}: {
  filename: string;
  columns:  string[];
  rows:     (string | number | null | undefined)[][];
}) {
  function handleDownload() {
    const BOM  = "\uFEFF";
    const head = columns.map(escapeCell).join(",");
    const body = rows.map(row =>
      row.map(v => escapeCell(v == null ? "" : String(v))).join(",")
    ).join("\r\n");
    const csv  = BOM + head + "\r\n" + body;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={handleDownload}
      style={{
        fontSize: 11, fontWeight: 600, color: "#6d28d9",
        background: "transparent", border: "1px solid #c4b5fd",
        borderRadius: 4, padding: "3px 10px", cursor: "pointer",
      }}
    >
      ↓ CSV
    </button>
  );
}

function escapeCell(v: string): string {
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
