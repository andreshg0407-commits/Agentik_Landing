/**
 * lib/marketing-studio/bulk-import/folder-dedup.ts
 *
 * MARKETING-DRIVE-CONNECTION-FOLDER-PICKER-04A-F-R2 — Hierarchical Folder Deduplication
 *
 * Pure functions for deduplicating a set of selected folders:
 *   - same ID twice → one
 *   - parent + child → only parent (BFS from parent covers child)
 *   - two siblings → both
 *   - root + descendants → only root
 *
 * Ancestry is resolved via a caller-provided async function.
 */

export interface FolderEntry {
  id:   string;
  name: string;
}

export interface AncestryResult {
  folderId: string;
  valid:    boolean;
  /** Ancestor IDs from folder up to tenant root (ordered child→parent) */
  ancestors: string[];
}

export interface DeduplicationResult {
  folders:  FolderEntry[];
  rejected: string[];
  pruned:   string[];
}

/**
 * Deduplicates folders by removing:
 * 1. Exact ID duplicates
 * 2. External folders (not valid within tenant root)
 * 3. Child folders when a parent folder is also selected
 *
 * @param folders - Selected folders
 * @param resolveAncestry - Async function that returns ancestry for each folder
 */
export async function deduplicateFolderSelection(
  folders: FolderEntry[],
  resolveAncestry: (folderIds: string[]) => Promise<AncestryResult[]>,
): Promise<DeduplicationResult> {
  // 1. Remove exact ID duplicates
  const unique = new Map<string, string>();
  for (const f of folders) {
    if (!unique.has(f.id)) unique.set(f.id, f.name);
  }

  const ids = Array.from(unique.keys());
  if (ids.length <= 1) {
    return {
      folders:  Array.from(unique.entries()).map(([id, name]) => ({ id, name })),
      rejected: [],
      pruned:   [],
    };
  }

  // 2. Resolve ancestry for all folders
  const ancestryResults = await resolveAncestry(ids);
  const ancestryMap = new Map<string, AncestryResult>();
  for (const r of ancestryResults) {
    ancestryMap.set(r.folderId, r);
  }

  // 3. Reject external folders
  const rejected: string[] = [];
  for (const id of ids) {
    const result = ancestryMap.get(id);
    if (result && !result.valid) {
      rejected.push(id);
      unique.delete(id);
    }
  }

  // 4. Parent/child pruning: if folder A is an ancestor of folder B,
  // and both are selected, remove B (parent A covers it via BFS)
  const selectedSet = new Set(unique.keys());
  const pruned: string[] = [];

  for (const id of [...selectedSet]) {
    const ancestry = ancestryMap.get(id);
    if (!ancestry) continue;

    // Walk up the ancestor chain — if ANY ancestor is also selected, prune this folder
    for (const ancestorId of ancestry.ancestors) {
      if (ancestorId !== id && selectedSet.has(ancestorId)) {
        pruned.push(id);
        unique.delete(id);
        selectedSet.delete(id);
        break;
      }
    }
  }

  return {
    folders:  Array.from(unique.entries()).map(([id, name]) => ({ id, name })),
    rejected,
    pruned,
  };
}
