import { readFile, access } from "fs/promises";
import { join } from "path";

// ── Public types ──────────────────────────────────────────────────────────────

export type PdfDebugReason =
  | "FILE_NOT_FOUND"              // local path resolved but file does not exist on disk
  | "PDF_PARSE_FAILED"            // all parsers threw — file may be encrypted or corrupted
  | "NO_EMBEDDED_TEXT"            // parser ran successfully but produced no text (image-only)
  | "INVALID_URL"                 // url is empty, not a PDF, or not a recognisable scheme
  | "FETCH_FAILED"                // remote HTTP fetch returned non-2xx or network error
  | "PDF_TIMEOUT";                // parser did not complete within PDF_PARSE_TIMEOUT_MS

/**
 * Milliseconds each parser pass is allowed before it is aborted.
 *
 * 25 seconds covers even large, complex PDFs under normal conditions.
 * Heavy embedded objects (barcodes, QR codes, vector graphics, malformed xref
 * tables) can cause pdfjs-dist or pdf2json to spin indefinitely — this timeout
 * prevents those from blocking the processing pipeline.
 *
 * If pass 1 (pdf-parse) times out we return immediately with PDF_TIMEOUT rather
 * than attempting pass 2, because both parsers load the same byte buffer and a
 * PDF that hangs one is very likely to hang the other as well.
 */
export const PDF_PARSE_TIMEOUT_MS = 25_000;

export type PdfParserUsed = "pdf-parse" | "pdf2json" | null;

/**
 * A single positioned text element from pdf2json.
 *
 * Coordinates are in inches, relative to the top-left corner of the page:
 *   x = distance from the left edge
 *   y = distance from the top edge
 *
 * This matches the pdf2json v4 Text interface (Width/Height on Page are also
 * in inches for a US-Letter page: Width ≈ 8.5, Height ≈ 11).
 *
 * Only populated when pdf2json was the parser (or via extractPdfItems).
 */
export interface PdfTextItem {
  text:      string;
  x:         number;
  y:         number;
  pageIndex: number;
}

export interface PdfExtractResult {
  /** Full joined text from all pages. Empty string when no embedded text or on failure. */
  text:             string;
  hasText:          boolean;
  pageCount?:       number;
  /** Which library successfully extracted text, or null if none ran or all failed. */
  parserUsed:       PdfParserUsed;
  /** Whether the file was resolved locally, fetched remotely, or not attempted. */
  resolvedSource:   "local" | "remote" | "none";
  /** Absolute path (local) or URL (remote) that was actually attempted. */
  resolvedPath?:    string;
  /** Machine-readable reason when hasText is false. Undefined when hasText is true. */
  debugReason?:     PdfDebugReason;
  /**
   * Set to PDF_PARSE_TIMEOUT_MS when debugReason is "PDF_TIMEOUT".
   * Indicates how long the parser was allowed to run before being aborted.
   */
  timeoutMs?:       number;
  /**
   * Position-aware text items from pdf2json (x/y in inches, page-relative).
   * Present only when the pdf2json parser was used.  Used by the FedEx
   * block-aware parser to reconstruct visual rows from positional data.
   */
  items?:           PdfTextItem[];
}

// ── Timeout helper ─────────────────────────────────────────────────────────────

/**
 * Races `promise` against a deadline.
 * Rejects with a sentinel Error("PDF_TIMEOUT") when `ms` elapses first,
 * allowing callers to distinguish a timeout from a genuine parse failure.
 *
 * The original promise is not cancelled (Node.js has no cancellation primitive)
 * but its eventual resolution / rejection is silently ignored once the race
 * has settled, so it cannot affect the returned result.
 */
function withPdfTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("PDF_TIMEOUT")), ms)
    ),
  ]);
}

function isPdfTimeout(err: unknown): boolean {
  return err instanceof Error && err.message === "PDF_TIMEOUT";
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Extracts embedded text from a PDF file referenced by a FileObject URL.
 *
 * Two-pass strategy:
 *   Pass 1 — pdf-parse (PDFParse class, wraps pdfjs-dist)
 *             Good default; handles most well-formed PDFs.
 *
 *   Pass 2 — pdf2json (binary PDF structure parser, no canvas, no worker)
 *             Fallback when pdf-parse throws. Uses a completely different
 *             parsing algorithm — no font rendering, raw object traversal —
 *             so it tolerates non-standard encodings, unusual xref tables,
 *             and older PDF versions (1.0–1.7) that pdfjs-dist rejects.
 *
 * Each parser pass is limited to PDF_PARSE_TIMEOUT_MS (25 s).  If pass 1
 * times out we return immediately with debugReason "PDF_TIMEOUT" rather than
 * attempting pass 2 — a PDF that hangs pdfjs-dist will almost certainly hang
 * pdf2json as well (same problematic byte content).
 *
 * Always resolves, never throws. `debugReason` distinguishes storage errors
 * from parser failures from genuinely image-only PDFs.
 */
export async function extractPdfText(
  url:      string,
  mimeType: string | null,
): Promise<PdfExtractResult> {
  // ── Guard: only attempt PDF files ─────────────────────────────────────────
  if (!url || typeof url !== "string") {
    return fail("none", undefined, "INVALID_URL");
  }

  const isPdf =
    mimeType === "application/pdf" ||
    (!mimeType && url.toLowerCase().includes(".pdf"));

  if (!isPdf) {
    return fail("none", undefined, "INVALID_URL");
  }

  // ── Determine source and resolved path ────────────────────────────────────
  const isRemote = url.startsWith("http://") || url.startsWith("https://");
  const isLocal  = !isRemote;

  if (!isRemote && !url.startsWith("/") && !url.match(/^[a-z]:/i)) {
    return fail("none", undefined, "INVALID_URL");
  }

  const source: "local" | "remote" = isRemote ? "remote" : "local";

  const resolvedPath = isRemote
    ? url
    : join(process.cwd(), "public", url.startsWith("/") ? url.slice(1) : url);

  // ── Load bytes ─────────────────────────────────────────────────────────────
  let buffer: Buffer;

  if (isLocal) {
    try {
      await access(resolvedPath);
    } catch {
      return fail(source, resolvedPath, "FILE_NOT_FOUND");
    }
    try {
      buffer = await readFile(resolvedPath);
    } catch {
      return fail(source, resolvedPath, "FILE_NOT_FOUND");
    }
  } else {
    try {
      const res = await fetch(url);
      if (!res.ok) return fail(source, resolvedPath, "FETCH_FAILED");
      buffer = Buffer.from(await res.arrayBuffer());
    } catch {
      return fail(source, resolvedPath, "FETCH_FAILED");
    }
  }

  // ── Pass 1: pdf-parse ──────────────────────────────────────────────────────
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer as unknown as Uint8Array });
    const result = await withPdfTimeout(parser.getText(), PDF_PARSE_TIMEOUT_MS);
    const text   = (result.text ?? "").trim();
    const pages  = result.pages.length || undefined;

    if (!text) {
      return { text: "", hasText: false, pageCount: pages, parserUsed: "pdf-parse", resolvedSource: source, resolvedPath, debugReason: "NO_EMBEDDED_TEXT" };
    }
    return { text, hasText: true, pageCount: pages, parserUsed: "pdf-parse", resolvedSource: source, resolvedPath };
  } catch (err) {
    if (isPdfTimeout(err)) {
      // pdf-parse timed out — the PDF is likely too complex or malformed.
      // Do NOT attempt pass 2: the same byte content would hang pdf2json too.
      return { text: "", hasText: false, parserUsed: "pdf-parse", resolvedSource: source, resolvedPath, debugReason: "PDF_TIMEOUT", timeoutMs: PDF_PARSE_TIMEOUT_MS };
    }
    // pdf-parse threw a genuine error — fall through to pdf2json
  }

  // ── Pass 2: pdf2json ───────────────────────────────────────────────────────
  //
  // pdf2json uses a binary PDF structure traversal rather than a rendering
  // pipeline. It does not use canvas, does not spin up a worker, and does not
  // require font metrics — making it tolerant of PDFs that fail pdfjs-dist's
  // more strict rendering path (unusual xref tables, non-standard encoding,
  // PDF 1.0–1.2, some Latin American e-invoice generators).
  //
  // Unlike pdf-parse, pdf2json also exposes x/y coordinates per text element.
  // These are returned in `items` for use by the FedEx position-aware parser.
  try {
    const { text, pageCount, items } = await withPdfTimeout(
      parseWithPdf2Json(buffer),
      PDF_PARSE_TIMEOUT_MS,
    );

    if (!text) {
      return { text: "", hasText: false, pageCount, parserUsed: "pdf2json", resolvedSource: source, resolvedPath, debugReason: "NO_EMBEDDED_TEXT", items };
    }
    return { text, hasText: true, pageCount, parserUsed: "pdf2json", resolvedSource: source, resolvedPath, items };
  } catch (err) {
    if (isPdfTimeout(err)) {
      return { text: "", hasText: false, parserUsed: "pdf2json", resolvedSource: source, resolvedPath, debugReason: "PDF_TIMEOUT", timeoutMs: PDF_PARSE_TIMEOUT_MS };
    }
    // Both parsers failed with genuine errors
    return fail(source, resolvedPath, "PDF_PARSE_FAILED");
  }
}

// ── Position-aware item extraction ────────────────────────────────────────────

/**
 * Extracts position-aware text items from a PDF using pdf2json directly.
 *
 * This is used as a secondary pass when:
 *  – The primary `extractPdfText` used pdf-parse (no items in the result), AND
 *  – The document is a FedEx/courier invoice that requires position-aware
 *    row reconstruction for reliable block detection.
 *
 * Always uses pdf2json regardless of whether pdf-parse would succeed, because
 * only pdf2json exposes the per-element x/y coordinates needed for row grouping.
 *
 * Always resolves, never throws. Returns [] on any error.
 */
export async function extractPdfItems(
  url:      string,
  mimeType: string | null,
): Promise<PdfTextItem[]> {
  if (!url || typeof url !== "string") return [];

  const isPdf =
    mimeType === "application/pdf" ||
    (!mimeType && url.toLowerCase().includes(".pdf"));
  if (!isPdf) return [];

  const isRemote = url.startsWith("http://") || url.startsWith("https://");
  if (!isRemote && !url.startsWith("/") && !url.match(/^[a-z]:/i)) return [];

  const resolvedPath = isRemote
    ? url
    : join(process.cwd(), "public", url.startsWith("/") ? url.slice(1) : url);

  let buffer: Buffer;
  if (!isRemote) {
    try { await access(resolvedPath); } catch { return []; }
    try { buffer = await readFile(resolvedPath); } catch { return []; }
  } else {
    try {
      const res = await fetch(url);
      if (!res.ok) return [];
      buffer = Buffer.from(await res.arrayBuffer());
    } catch { return []; }
  }

  try {
    const { items } = await withPdfTimeout(parseWithPdf2Json(buffer), PDF_PARSE_TIMEOUT_MS);
    return items;
  } catch {
    // Timeout or parse error — return empty; caller treats this as "no items"
    return [];
  }
}

// ── pdf2json helper ───────────────────────────────────────────────────────────

// Matches the pdf2json v4 Text and TextRun interfaces from pdfparser.d.ts
interface Pdf2JsonTextRun {
  T?: string;
  S?: number;
  TS?: [number, number, number, number];
}

interface Pdf2JsonTextItem {
  x?: number;
  y?: number;
  w?: number;
  sw?: number;
  A?: string;
  R?: Pdf2JsonTextRun[];
}

interface Pdf2JsonPage {
  Width?:  number;
  Height?: number;
  Texts?:  Pdf2JsonTextItem[];
}

interface Pdf2JsonData {
  Pages?: Pdf2JsonPage[];
}

/**
 * Decodes a single pdf2json text item into a plain string.
 * Concatenates all runs; handles URI-encoding used by pdf2json internally.
 */
function decodePdf2JsonItem(item: Pdf2JsonTextItem): string {
  return (item.R ?? [])
    .map((run) => {
      const raw = run.T ?? "";
      try { return decodeURIComponent(raw); }
      catch { return raw; }
    })
    .join("");
}

/**
 * Parses a PDF buffer with pdf2json and returns:
 *   text  — joined plain text (pages joined with newlines, items with spaces)
 *   items — position-aware items (x/y in inches, page-relative)
 *
 * pdf2json URI-encodes all text strings internally; we decode them here.
 * Items preserve x/y coordinates for later position-aware row reconstruction.
 */
async function parseWithPdf2Json(
  buffer: Buffer,
): Promise<{ text: string; pageCount: number; items: PdfTextItem[] }> {
  const PDFParser = (await import("pdf2json")).default as unknown as new (
    context: null,
    rawTextMode: number,
  ) => {
    on(event: "pdfParser_dataReady",  handler: (data: Pdf2JsonData) => void): void;
    on(event: "pdfParser_dataError",  handler: (err: { parserError?: string }) => void): void;
    parseBuffer(buf: Buffer): void;
  };

  return new Promise((resolve, reject) => {
    const parser = new PDFParser(null, 1);

    parser.on("pdfParser_dataReady", (data) => {
      const pages      = data.Pages ?? [];
      const allItems:  PdfTextItem[] = [];

      const text = pages
        .map((page, pageIndex) => {
          const pageText = (page.Texts ?? [])
            .map((t) => {
              const decoded = decodePdf2JsonItem(t);
              // Collect position-aware item (skip items with no useful coordinates)
              if (decoded && t.x !== undefined && t.y !== undefined) {
                allItems.push({ text: decoded, x: t.x, y: t.y, pageIndex });
              }
              return decoded;
            })
            .join(" ");
          return pageText;
        })
        .join("\n")
        .trim();

      resolve({ text, pageCount: pages.length, items: allItems });
    });

    parser.on("pdfParser_dataError", (err) => {
      reject(new Error(String((err as { parserError?: unknown })?.parserError ?? "pdf2json parse error")));
    });

    parser.parseBuffer(buffer);
  });
}

// ── Shared failure helper ─────────────────────────────────────────────────────

function fail(
  source:      "local" | "remote" | "none",
  path:        string | undefined,
  debugReason: PdfDebugReason,
): PdfExtractResult {
  return {
    text:           "",
    hasText:        false,
    parserUsed:     null,
    resolvedSource: source,
    resolvedPath:   path,
    debugReason,
  };
}
