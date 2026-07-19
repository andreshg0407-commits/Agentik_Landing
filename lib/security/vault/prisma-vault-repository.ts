/**
 * lib/security/vault/prisma-vault-repository.ts
 *
 * AGENTIK-SECURITY-VAULT-01
 * Standalone Org-Scoped Secret Vault — Prisma Repository Implementation
 *
 * Concrete implementation of VaultRepository backed by the VaultSecret Prisma model.
 *
 * Tenant isolation: ALL queries filter by orgSlug.
 * Encryption: VaultService encrypts before calling create/rotateEncryptedValue.
 *             This repository stores and retrieves the ciphertext as-is.
 *
 * IMPORTANT: server-side only — imports Prisma.
 */

import { prisma } from "@/lib/prisma";
import type { VaultRepository } from "./vault-repository";
import type {
  VaultCreateInput,
  VaultSecretMetadata,
  VaultSecretStatus,
  VaultUpdateInput,
} from "./vault-secret-record";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toPrismaDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function toIso(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date instanceof Date ? date.toISOString() : null;
}

type VaultSecretRow = {
  id:             string;
  orgSlug:        string;
  name:           string;
  kind:           string;
  classification: string;
  provider:       string;
  tags:           string[];
  status:         string;
  keyVersion:     number;
  createdAt:      Date;
  updatedAt:      Date;
  lastAccessedAt: Date | null;
  expiresAt:      Date | null;
  revokedAt:      Date | null;
  notes:          string | null;
};

function toMetadata(row: VaultSecretRow): VaultSecretMetadata {
  return {
    id:             row.id,
    orgSlug:        row.orgSlug,
    name:           row.name,
    kind:           row.kind as VaultSecretMetadata["kind"],
    classification: row.classification as VaultSecretMetadata["classification"],
    provider:       row.provider,
    tags:           row.tags,
    status:         row.status as VaultSecretStatus,
    keyVersion:     row.keyVersion,
    createdAt:      row.createdAt.toISOString(),
    updatedAt:      row.updatedAt.toISOString(),
    lastAccessedAt: toIso(row.lastAccessedAt),
    expiresAt:      toIso(row.expiresAt),
    revokedAt:      toIso(row.revokedAt),
    notes:          row.notes,
  };
}

// ── Repository ────────────────────────────────────────────────────────────────

export class PrismaVaultRepository implements VaultRepository {
  async create(
    orgSlug:        string,
    input:          VaultCreateInput,
    encryptedValue: string,
    keyVersion:     number,
  ): Promise<VaultSecretMetadata> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma as any).vaultSecret.create({
      data: {
        orgSlug,
        name:           input.name,
        kind:           input.kind,
        classification: input.classification,
        provider:       input.provider,
        encryptedValue,
        keyVersion,
        tags:           input.tags ?? [],
        status:         "ACTIVE",
        expiresAt:      toPrismaDate(input.expiresAt),
        notes:          input.notes ?? null,
      },
    });
    return toMetadata(row as VaultSecretRow);
  }

  async findById(
    id:      string,
    orgSlug: string,
  ): Promise<{ metadata: VaultSecretMetadata; encryptedValue: string } | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma as any).vaultSecret.findFirst({
      where: { id, orgSlug },
    });
    if (!row) return null;
    const typedRow = row as VaultSecretRow & { encryptedValue: string };
    return {
      metadata:       toMetadata(typedRow),
      encryptedValue: typedRow.encryptedValue,
    };
  }

  async listByOrg(orgSlug: string): Promise<VaultSecretMetadata[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma as any).vaultSecret.findMany({
      where:   { orgSlug },
      orderBy: { createdAt: "desc" },
    });
    return (rows as VaultSecretRow[]).map(toMetadata);
  }

  async update(
    id:      string,
    orgSlug: string,
    input:   VaultUpdateInput,
  ): Promise<VaultSecretMetadata | null> {
    try {
      const data: Record<string, unknown> = {};
      if (input.name      !== undefined) data["name"]      = input.name;
      if (input.tags      !== undefined) data["tags"]      = input.tags;
      if (input.expiresAt !== undefined) data["expiresAt"] = toPrismaDate(input.expiresAt ?? null);
      if (input.notes     !== undefined) data["notes"]     = input.notes;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = await (prisma as any).vaultSecret.update({
        where: { id, orgSlug },
        data,
      });
      return toMetadata(row as VaultSecretRow);
    } catch {
      return null;
    }
  }

  async rotateEncryptedValue(
    id:             string,
    orgSlug:        string,
    encryptedValue: string,
    keyVersion:     number,
  ): Promise<VaultSecretMetadata | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = await (prisma as any).vaultSecret.update({
        where: { id, orgSlug },
        data:  { encryptedValue, keyVersion },
      });
      return toMetadata(row as VaultSecretRow);
    } catch {
      return null;
    }
  }

  async touchAccessedAt(id: string, orgSlug: string): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any).vaultSecret.update({
        where: { id, orgSlug },
        data:  { lastAccessedAt: new Date() },
      });
    } catch {
      // Never throws — audit update must not interrupt the caller
    }
  }

  async disable(id: string, orgSlug: string): Promise<VaultSecretMetadata | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = await (prisma as any).vaultSecret.update({
        where: { id, orgSlug },
        data:  { status: "DISABLED" },
      });
      return toMetadata(row as VaultSecretRow);
    } catch {
      return null;
    }
  }

  async revoke(id: string, orgSlug: string): Promise<VaultSecretMetadata | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = await (prisma as any).vaultSecret.update({
        where: { id, orgSlug },
        data:  { status: "REVOKED", revokedAt: new Date() },
      });
      return toMetadata(row as VaultSecretRow);
    } catch {
      return null;
    }
  }

  async delete(id: string, orgSlug: string): Promise<boolean> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any).vaultSecret.delete({
        where: { id, orgSlug },
      });
      return true;
    } catch {
      return false;
    }
  }
}
