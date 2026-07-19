/**
 * XML escaping utilities for SAG write payloads.
 *
 * SAG does not use CDATA — all values must be entity-escaped.
 * This module is the single point of truth for escaping; every
 * XML builder imports from here rather than inlining replace chains.
 */

/** Escape a string value for embedding inside an XML element. */
export function esc(value: string | number | boolean | null | undefined): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Wrap value in an XML element only when the value is non-empty. */
export function optEl(tag: string, value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  return `<${tag}>${esc(value)}</${tag}>`;
}

/** Wrap value in a required XML element — always emitted. */
export function el(tag: string, value: string | number): string {
  return `<${tag}>${esc(value)}</${tag}>`;
}

/** Format a JS Date or ISO string to SAG date format YYYY-MM-DD. */
export function sagDate(d: Date | string): string {
  const s = typeof d === "string" ? d : d.toISOString();
  return s.slice(0, 10);
}
