// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Integration: Strategic Memory ↔ Playbooks

import type { StrategicMemoryEntry } from "../strategic-memory-types";
import type { StrategicMemoryInput } from "../strategic-memory-builder";

// Minimal playbook interfaces
export interface PlaybookHint {
  readonly id: string;
  readonly orgSlug: string;
  readonly name: string;
  readonly description: string;
  readonly domain: string;
  readonly priority: string;
  readonly status: string;
  readonly triggerCount: number;
  readonly effective: boolean;
  readonly createdAt: string;
}

// ── Adapters ──────────────────────────────────────────────────────────────────

export function playbookToStrategicInput(
  playbook: PlaybookHint,
  expectedOrgSlug: string
): StrategicMemoryInput | null {
  if (playbook.orgSlug !== expectedOrgSlug) return null;
  if (playbook.status === "INACTIVE") return null;
  if (playbook.priority === "LOW" && !playbook.effective) return null;

  const priority: StrategicMemoryInput["priority"] =
    playbook.priority === "CRITICAL" ? "CRITICAL" :
    playbook.priority === "HIGH" ? "HIGH" :
    "MEDIUM";

  return {
    orgSlug: playbook.orgSlug,
    type: "PLAYBOOK",
    priority,
    domain: mapPlaybookDomainToStrategic(playbook.domain),
    title: `Playbook: ${playbook.name}`,
    description: playbook.description.slice(0, 500),
    rationale: `Active playbook ${playbook.id} with ${playbook.triggerCount} trigger(s) — effective: ${playbook.effective}`,
    confidenceScore: playbook.effective ? 0.8 : 0.5,
    source: "PLAYBOOK",
    evidenceIds: [playbook.id],
  };
}

export function buildPlaybookStrategicInputs(
  playbooks: PlaybookHint[],
  orgSlug: string
): StrategicMemoryInput[] {
  return playbooks
    .filter((p) => p.orgSlug === orgSlug)
    .map((p) => playbookToStrategicInput(p, orgSlug))
    .filter((i): i is StrategicMemoryInput => i !== null);
}

export function findStrategicPlaybookCandidates(
  entries: StrategicMemoryEntry[],
  orgSlug: string
): StrategicMemoryEntry[] {
  return entries.filter(
    (e) =>
      e.orgSlug === orgSlug &&
      e.status === "ACTIVE" &&
      (e.type === "POLICY" || e.type === "PLAYBOOK" || e.type === "COMMITMENT") &&
      e.strategicScore >= 0.6
  );
}

export function detectObsoleteStrategicPlaybooks(
  entries: StrategicMemoryEntry[],
  playbooks: PlaybookHint[],
  orgSlug: string
): { entryId: string; playbookId: string; reason: string }[] {
  const results: { entryId: string; playbookId: string; reason: string }[] = [];
  const playbookEntries = entries.filter(
    (e) => e.orgSlug === orgSlug && e.type === "PLAYBOOK" && e.status === "ACTIVE"
  );

  for (const entry of playbookEntries) {
    const sourceId = entry.evidenceIds[0];
    if (!sourceId) continue;
    const playbook = playbooks.find((p) => p.id === sourceId);
    if (!playbook) {
      results.push({ entryId: entry.id, playbookId: sourceId, reason: "PLAYBOOK_NOT_FOUND" });
    } else if (playbook.status === "INACTIVE") {
      results.push({ entryId: entry.id, playbookId: playbook.id, reason: "PLAYBOOK_INACTIVE" });
    }
  }

  return results;
}

// ── Helper ────────────────────────────────────────────────────────────────────

function mapPlaybookDomainToStrategic(domain: string): StrategicMemoryInput["domain"] {
  switch (domain.toUpperCase()) {
    case "FINANCE": return "FINANCE";
    case "COMMERCIAL": return "COMMERCIAL";
    case "MARKETING": return "MARKETING";
    case "OPERATIONS": return "OPERATIONS";
    case "EXECUTIVE": return "EXECUTIVE";
    case "COMPLIANCE": return "COMPLIANCE";
    default: return "CROSS_DOMAIN";
  }
}
