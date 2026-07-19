/**
 * lib/copilot/playbooks/playbook-summary.ts
 *
 * Agentik — Copilot Playbooks — Summary Builders
 * Sprint: AGENTIK-COPILOT-PLAYBOOKS-01
 *
 * Deterministic, rule-based summary builders for playbook contexts.
 * No AI. No LLM. No external calls. Pure text composition.
 *
 * Generates compact context text for injection into Copilot pipeline.
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

import type { PlaybookRepository }   from "./playbook-repository";
import type { Playbook, PlaybookContext } from "./playbook-types";
import { defaultPlaybookRepository } from "./in-memory-playbook-repository";

// ── Summary types ─────────────────────────────────────────────────────────────

export interface PlaybookSummary {
  orgSlug:     string;
  totalCount:  number;
  summaryText: string;
  playbooks:   Playbook[];
  generatedAt: string;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function formatPlaybook(p: Playbook): string {
  const stepCount = p.steps.length > 0 ? ` (${p.steps.length} pasos)` : "";
  return `• [${p.priority}] ${p.title}${stepCount} — ${p.description}`;
}

function formatPlaybookCompact(p: Playbook): string {
  return `• [${p.category}/${p.priority}] ${p.title}`;
}

function buildBlock(label: string, playbooks: Playbook[]): string {
  if (playbooks.length === 0) return "";
  return `${label}:\n${playbooks.map(formatPlaybook).join("\n")}`;
}

// ── Summary builders ──────────────────────────────────────────────────────────

/**
 * Build a summary from an already-retrieved PlaybookContext.
 * No DB call — pure transformation.
 */
export function buildPlaybookContextSummary(ctx: PlaybookContext): PlaybookSummary {
  const label       = "Playbooks operativos activos";
  const summaryText = ctx.playbooks.length > 0
    ? buildBlock(label, ctx.playbooks)
    : "No hay playbooks operativos registrados para este tenant.";

  return {
    orgSlug:     ctx.orgSlug,
    totalCount:  ctx.playbooks.length,
    summaryText,
    playbooks:   ctx.playbooks,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Build a full playbook summary for a tenant.
 * Fetches all ACTIVE playbooks from the repository.
 */
export async function buildPlaybookSummary(
  orgSlug: string,
  repo:    PlaybookRepository = defaultPlaybookRepository,
): Promise<PlaybookSummary> {
  const playbooks = await repo.listPlaybooks(orgSlug, { limit: 20 });

  const summaryText = playbooks.length > 0
    ? buildBlock("Playbooks del tenant", playbooks)
    : "No hay playbooks registrados para este tenant.";

  return {
    orgSlug,
    totalCount:  playbooks.length,
    summaryText,
    playbooks,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Build a summary focused on executive-level playbooks (EXECUTIVE + CRITICAL).
 */
export async function buildExecutivePlaybookSummary(
  orgSlug: string,
  repo:    PlaybookRepository = defaultPlaybookRepository,
): Promise<PlaybookSummary> {
  const [execPlaybooks, criticalPlaybooks] = await Promise.all([
    repo.findByCategory(orgSlug, "EXECUTIVE", 10),
    repo.searchPlaybooks(orgSlug, { priority: "CRITICAL", status: "ACTIVE", limit: 5 }),
  ]);

  // Deduplicate
  const seen    = new Set<string>();
  const merged: Playbook[] = [];
  for (const p of [...execPlaybooks, ...criticalPlaybooks]) {
    if (!seen.has(p.id)) { seen.add(p.id); merged.push(p); }
  }

  const blocks: string[] = [];
  const execBlock     = buildBlock("Playbooks ejecutivos", execPlaybooks);
  const criticalBlock = buildBlock("Playbooks críticos",  criticalPlaybooks.filter(p => !seen.has(p.id + "_exec")));

  if (execBlock)     blocks.push(execBlock);
  if (criticalBlock) blocks.push(criticalBlock);

  const summaryText = merged.length > 0
    ? `${merged.map(formatPlaybook).join("\n")}`
    : "No hay playbooks ejecutivos registrados.";

  return {
    orgSlug,
    totalCount:  merged.length,
    summaryText,
    playbooks:   merged,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Build a summary focused on operational playbooks (OPERATIONS + COLLECTIONS + FINANCE).
 */
export async function buildOperationalPlaybookSummary(
  orgSlug: string,
  repo:    PlaybookRepository = defaultPlaybookRepository,
): Promise<PlaybookSummary> {
  const [ops, collections, finance] = await Promise.all([
    repo.findByCategory(orgSlug, "OPERATIONS",  5),
    repo.findByCategory(orgSlug, "COLLECTIONS", 5),
    repo.findByCategory(orgSlug, "FINANCE",     5),
  ]);

  const seen    = new Set<string>();
  const merged: Playbook[] = [];
  for (const p of [...ops, ...collections, ...finance]) {
    if (!seen.has(p.id)) { seen.add(p.id); merged.push(p); }
  }

  const summaryText = merged.length > 0
    ? `Playbooks operacionales activos:\n${merged.map(formatPlaybookCompact).join("\n")}`
    : "No hay playbooks operacionales registrados.";

  return {
    orgSlug,
    totalCount:  merged.length,
    summaryText,
    playbooks:   merged,
    generatedAt: new Date().toISOString(),
  };
}
