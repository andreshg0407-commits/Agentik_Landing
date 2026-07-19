/**
 * lib/copilot/session-cooldown.ts
 *
 * Session-level signal cooldown — in-memory, no Redis.
 *
 * Prevents the same signal rule from being surfaced repeatedly within one
 * server process session. Resets on server restart (acceptable for V1).
 *
 * Cooldown window: 30 minutes per org+rule combination.
 *
 * NOT used for: signal persistence, cross-session suppression, user preferences.
 * Those are handled by CopilotSignalRecord (Prisma) in a future sprint.
 */

// Module-level map — lives for the duration of the server process.
// Key: `${orgId}:${ruleId}`   Value: timestamp (ms) when last shown
const cooldownMap = new Map<string, number>();

const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

export function isInCooldown(orgId: string, ruleId: string): boolean {
  const key = `${orgId}:${ruleId}`;
  const last = cooldownMap.get(key);
  if (last === undefined) return false;
  return Date.now() - last < COOLDOWN_MS;
}

export function markShown(orgId: string, ruleId: string): void {
  cooldownMap.set(`${orgId}:${ruleId}`, Date.now());
}

export function resetCooldown(orgId: string, ruleId: string): void {
  cooldownMap.delete(`${orgId}:${ruleId}`);
}

/** Clear all cooldowns for an org — used when user explicitly dismisses all. */
export function clearOrgCooldowns(orgId: string): void {
  for (const key of cooldownMap.keys()) {
    if (key.startsWith(`${orgId}:`)) {
      cooldownMap.delete(key);
    }
  }
}
