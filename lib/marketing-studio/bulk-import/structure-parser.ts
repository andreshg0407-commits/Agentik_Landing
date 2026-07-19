/**
 * lib/marketing-studio/bulk-import/structure-parser.ts
 *
 * MARKETING-STUDIO-BULK-IMPORT-01
 *
 * Parses file sources into a normalized ParsedImportStructure.
 *
 * ── Supported sources ─────────────────────────────────────────────────────────
 *   parseFolder(files: FileList)  — webkitdirectory FileList
 *   parseZip(zipFile: File)       — ZIP archive (native DecompressionStream)
 *
 * ── Expected structure ────────────────────────────────────────────────────────
 *   {Category}/{Reference}/{image.jpg}
 *
 *   Depth normalization:
 *   - If all paths share a common root prefix (the selected folder name),
 *     that prefix is stripped: /root/Cat/Ref/img → Cat/Ref/img
 *   - Files at depth 1 (directly under category) are ignored (unknown)
 *   - Files at depth >= 2 are assigned to category[0] / reference[1]
 *
 * ── Zero external dependencies ───────────────────────────────────────────────
 *   ZIP parsing uses native DataView + DecompressionStream (browser built-ins).
 *   No jszip, no fflate, no npm dependency.
 */

import {
  classifyAssetRole,
  isImportableFile,
  mimeFromExtension,
} from "./asset-role-mapper";
import type {
  ParsedImportStructure,
  ParsedCategory,
  ParsedReference,
  ParsedFile,
} from "./import-types";

// ── Types ──────────────────────────────────────────────────────────────────────

interface RawEntry {
  path:  string;   // normalized relative path: "Cat/Ref/file.jpg"
  file?: File;     // from FileList (folder mode)
  data?: Uint8Array; // from ZIP
  name:  string;
}

// ── Folder parser ─────────────────────────────────────────────────────────────

/**
 * parseFolder — converts a webkitdirectory FileList into ParsedImportStructure.
 *
 * Uses `file.webkitRelativePath` to extract structure.
 * The first path segment (selected folder name) is stripped as root.
 */
export function parseFolder(files: FileList): ParsedImportStructure {
  const entries: RawEntry[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? file.name;
    entries.push({ path: relativePath, file, name: file.name });
  }

  return buildStructure(entries, "local_folder");
}

// ── ZIP parser ────────────────────────────────────────────────────────────────

/**
 * parseZip — extracts a ZIP archive client-side using native browser APIs.
 *
 * Supports:
 *   - Stored files (compression method = 0)
 *   - DEFLATE files (compression method = 8) via DecompressionStream('deflate-raw')
 *
 * DecompressionStream availability:
 *   Chrome 80+ / Firefox 102+ / Safari 16.4+
 */
export async function parseZip(zipFile: File): Promise<ParsedImportStructure> {
  const buffer = await zipFile.arrayBuffer();
  const zipEntries = await extractZipEntries(buffer);
  const entries: RawEntry[] = zipEntries.map(e => ({
    path: e.name,
    data: e.data,
    name: e.name.split("/").pop() ?? e.name,
  }));
  return buildStructure(entries, "local_zip");
}

// ── ZIP binary reader (zero external dependencies) ────────────────────────────

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

async function extractZipEntries(buffer: ArrayBuffer): Promise<ZipEntry[]> {
  const bytes = new Uint8Array(buffer);
  const view  = new DataView(buffer);

  // Locate End of Central Directory (EOCD) record: signature PK\x05\x06
  let eocd = -1;
  const maxScan = Math.min(bytes.length - 22, 65535 + 22);
  for (let i = bytes.length - 22; i >= bytes.length - maxScan; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error("No es un archivo ZIP válido");

  const cdOffset = view.getUint32(eocd + 16, true);
  const cdCount  = view.getUint16(eocd + 10, true);

  const results: ZipEntry[] = [];
  let pos = cdOffset;

  for (let i = 0; i < cdCount; i++) {
    if (pos + 46 > buffer.byteLength) break;
    if (view.getUint32(pos, true) !== 0x02014b50) break;  // Central Dir signature

    const method     = view.getUint16(pos + 10, true);
    const compSize   = view.getUint32(pos + 20, true);
    const fnLen      = view.getUint16(pos + 28, true);
    const exLen      = view.getUint16(pos + 30, true);
    const cmLen      = view.getUint16(pos + 32, true);
    const lhOffset   = view.getUint32(pos + 42, true);

    const name = new TextDecoder("utf-8", { fatal: false })
      .decode(bytes.slice(pos + 46, pos + 46 + fnLen));
    pos += 46 + fnLen + exLen + cmLen;

    if (name.endsWith("/")) continue;  // directory entry — skip

    // Read Local File Header to find exact data start
    if (lhOffset + 30 > buffer.byteLength) continue;
    const lhNameLen  = view.getUint16(lhOffset + 26, true);
    const lhExtraLen = view.getUint16(lhOffset + 28, true);
    const dataStart  = lhOffset + 30 + lhNameLen + lhExtraLen;

    if (dataStart + compSize > buffer.byteLength) continue;
    const compData = bytes.slice(dataStart, dataStart + compSize);

    let data: Uint8Array;
    try {
      if (method === 0) {
        // Stored — no compression
        data = compData;
      } else if (method === 8) {
        // DEFLATE — use browser-native DecompressionStream
        data = await inflateRaw(compData);
      } else {
        continue;  // unsupported compression method — skip file
      }
    } catch {
      continue;  // decompression failed — skip file
    }

    results.push({ name, data });
  }

  return results;
}

async function inflateRaw(compressed: Uint8Array): Promise<Uint8Array> {
  // DecompressionStream is available in modern browsers (Chrome 80+, FF 102+, Safari 16.4+)
  if (typeof DecompressionStream === "undefined") {
    throw new Error("DecompressionStream not available in this browser");
  }

  const ds     = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  writer.write(compressed as any).catch(() => {});
  writer.close().catch(() => {});

  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }

  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out   = new Uint8Array(total);
  let offset  = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
}

// ── Structure builder (shared for folder + zip) ───────────────────────────────

function buildStructure(
  entries: RawEntry[],
  source:  ParsedImportStructure["source"],
): ParsedImportStructure {
  // Normalize paths — strip common root prefix
  const paths      = entries.map(e => e.path);
  const normalized = normalizeRootPrefix(paths);

  const categoryMap = new Map<string, Map<string, ParsedFile[]>>();
  const unknownFiles: ParsedFile[] = [];
  let totalFiles  = 0;
  let totalImages = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry   = entries[i];
    const normPath = normalized[i];
    const segments = normPath.split("/").filter(Boolean);

    // Must be at least Cat/Ref/file
    if (segments.length < 3) {
      // Could be an image directly under a category (no reference folder) — skip
      continue;
    }

    const [catName, refName, ...rest] = segments;
    const fileName = rest[rest.length - 1] ?? refName;

    if (!isImportableFile(fileName)) continue;

    totalFiles++;
    const mime   = entry.file ? (entry.file.type || mimeFromExtension(fileName)) : mimeFromExtension(fileName);
    const role   = classifyAssetRole(fileName);
    const isImage = mime.startsWith("image/");
    if (isImage) totalImages++;

    // Reconstruct File object for ZIP entries
    let file: File;
    if (entry.file) {
      file = entry.file;
    } else if (entry.data) {
      file = new File([entry.data as BlobPart], fileName, { type: mime });
    } else {
      continue;
    }

    const parsedFile: ParsedFile = {
      name:     fileName,
      path:     normPath,
      file,
      mimeType: mime,
      role,
    };

    if (!categoryMap.has(catName)) categoryMap.set(catName, new Map());
    const refMap = categoryMap.get(catName)!;
    if (!refMap.has(refName)) refMap.set(refName, []);
    refMap.get(refName)!.push(parsedFile);
  }

  const categories: ParsedCategory[] = [];
  for (const [catName, refMap] of categoryMap) {
    const references: ParsedReference[] = [];
    for (const [refName, files] of refMap) {
      references.push({
        name:  refName,
        sku:   tryExtractSku(refName),
        files,
      });
    }
    // Sort references alphabetically
    references.sort((a, b) => a.name.localeCompare(b.name, "es"));
    categories.push({ name: catName, references });
  }
  // Sort categories alphabetically
  categories.sort((a, b) => a.name.localeCompare(b.name, "es"));

  return { source, categories, unknownFiles, totalFiles, totalImages };
}

/**
 * normalizeRootPrefix — if all paths share the same first segment
 * (the selected folder name in webkitdirectory mode), strip it.
 *
 * Example: ["Catalog/Niño/Dino/front.jpg", "Catalog/Niña/Vestido/det.jpg"]
 *       → ["Niño/Dino/front.jpg", "Niña/Vestido/det.jpg"]
 */
function normalizeRootPrefix(paths: string[]): string[] {
  if (paths.length === 0) return [];

  const firstSegments = paths.map(p => p.split("/")[0]);
  const allSame       = firstSegments.every(s => s === firstSegments[0]);

  if (allSame && firstSegments[0]) {
    return paths.map(p => p.slice(firstSegments[0].length + 1));
  }
  return paths;
}

/**
 * tryExtractSku — attempts to extract a SKU from a reference folder name.
 *
 * Patterns recognized:
 *   "SKU-1234 Conjunto Dino" → "SKU-1234"
 *   "Pijama Estrellas [PJ-001]" → "PJ-001"
 *   "CON-042 - Niño Azul" → "CON-042"
 */
function tryExtractSku(name: string): string | undefined {
  // Pattern: alphanumeric-dash code at start of string
  const startMatch = name.match(/^([A-Za-z]{2,5}-\d{3,6})\s/);
  if (startMatch) return startMatch[1].toUpperCase();

  // Pattern: code in brackets
  const bracketMatch = name.match(/\[([A-Za-z0-9-]+)\]/);
  if (bracketMatch) return bracketMatch[1].toUpperCase();

  return undefined;
}
