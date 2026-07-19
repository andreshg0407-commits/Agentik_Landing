// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 24 — Executive Brain Repository Contract

import type {
  ExecutiveBriefing,
  ExecutiveDigest,
  ExecutivePriority,
  ExecutiveFocusArea,
  ExecutiveConflict,
  ExecutiveSnapshot,
} from "./executive-brain-types";

// ── Repository Interface ──────────────────────────────────────────────────────

export interface ExecutiveBrainRepository {
  // Briefings
  saveBriefing(briefing: ExecutiveBriefing): Promise<void>;
  getBriefingById(id: string, orgSlug: string): Promise<ExecutiveBriefing | null>;
  getLatestBriefing(orgSlug: string, type: ExecutiveBriefing["type"]): Promise<ExecutiveBriefing | null>;
  listBriefings(orgSlug: string, limit?: number): Promise<ExecutiveBriefing[]>;

  // Digests
  saveDigest(digest: ExecutiveDigest): Promise<void>;
  getDigestById(id: string, orgSlug: string): Promise<ExecutiveDigest | null>;
  getLatestDigest(orgSlug: string, period: ExecutiveDigest["period"]): Promise<ExecutiveDigest | null>;
  listDigests(orgSlug: string, limit?: number): Promise<ExecutiveDigest[]>;

  // Priorities
  savePriority(priority: ExecutivePriority): Promise<void>;
  listPriorities(orgSlug: string, limit?: number): Promise<ExecutivePriority[]>;
  getTopPriorities(orgSlug: string, n: number): Promise<ExecutivePriority[]>;

  // Focus Areas
  saveFocusArea(area: ExecutiveFocusArea): Promise<void>;
  listFocusAreas(orgSlug: string, limit?: number): Promise<ExecutiveFocusArea[]>;

  // Conflicts
  saveConflict(conflict: ExecutiveConflict): Promise<void>;
  listConflicts(orgSlug: string, limit?: number): Promise<ExecutiveConflict[]>;
  resolveConflict(id: string, orgSlug: string): Promise<void>;

  // Snapshots
  saveSnapshot(snapshot: ExecutiveSnapshot): Promise<void>;
  getLatestSnapshot(orgSlug: string): Promise<ExecutiveSnapshot | null>;
}
