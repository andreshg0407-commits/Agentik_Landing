/**
 * lib/copilot/memory/memory-repository-resolver.ts
 *
 * Agentik — Copilot Memory Persistence — Repository Resolver
 * Sprint: AGENTIK-COPILOT-MEMORY-PERSISTENCE-01
 *
 * Returns the appropriate MemoryRepository implementation:
 *   - Production / development:  PrismaMemoryRepository (durable, PostgreSQL)
 *   - Test environment (NODE_ENV=test): InMemoryMemoryRepository (ephemeral, fast)
 *
 * SERVER-ONLY — imports PrismaMemoryRepository which imports Prisma client.
 * Never import this file from client-safe code or pure-domain modules.
 */
import "server-only";

import type { MemoryRepository }                from "./memory-repository";
import { prismaMemoryRepository }               from "./persistence/prisma-memory-repository";
import { InMemoryMemoryRepository }             from "./in-memory-memory-repository";

// ── Test-instance cache ────────────────────────────────────────────────────────

let _testRepository: MemoryRepository | undefined;

// ── Resolver ──────────────────────────────────────────────────────────────────

/**
 * Return the server-side MemoryRepository for the current environment.
 *
 * Call once at the server boundary (intelligence service, API routes).
 * Do NOT call from client components or pure-domain code.
 */
export function getServerMemoryRepository(): MemoryRepository {
  if (process.env.NODE_ENV === "test") {
    // Shared in-memory instance for the test process lifetime.
    // Each test suite should call clearMemories(orgSlug) between test cases.
    _testRepository ??= new InMemoryMemoryRepository();
    return _testRepository;
  }
  return prismaMemoryRepository;
}

/**
 * Reset the test repository singleton.
 * Call only from test teardown — no-op in production.
 */
export function resetTestMemoryRepository(): void {
  if (process.env.NODE_ENV === "test") {
    _testRepository = undefined;
  }
}
