/**
 * lib/integrations/vault/vault-service.ts
 *
 * MS-10 — Vault Service (V1: AES-256-GCM with env key)
 *
 * Implements the IVaultBackend interface using AES-256-GCM encryption.
 * Encrypted values are stored in IntegrationSecret.encryptedValue.
 *
 * ── V1 IMPLEMENTATION ─────────────────────────────────────────────────────────
 *   Key source: VAULT_ENCRYPTION_KEY env var (must be 64-char hex = 32 bytes)
 *   Algorithm:  AES-256-GCM with random 12-byte IV per encryption
 *   Storage:    Base64(iv:authTag:ciphertext) in IntegrationSecret.encryptedValue
 *
 * ── PRODUCTION UPGRADE PATH ───────────────────────────────────────────────────
 *   V2: AWS KMS / GCP KMS — swap encrypt/decrypt functions only
 *   V3: Vercel KV + envelope encryption
 *   V4: Per-tenant key derivation
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   SERVER ONLY — never import from client components.
 *   Plain values exist in memory only during store/get operations.
 *   No logging of plain values anywhere in this file.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHmac } from "crypto";
import type {
  IVaultBackend,
  VaultStoreInput,
  VaultGetInput,
  VaultRotateInput,
  VaultRevokeInput,
  VaultRetrievedSecret,
  VaultSecretMetadata,
} from "./vault-types";
import {
  VaultKeyMissingError,
  VaultEncryptionError,
  VaultSecretNotFoundError,
  VaultSecretRevokedError,
  VaultSecretExpiredError,
  VaultTenantIsolationError,
} from "./vault-errors";
import { prisma } from "@/lib/prisma";

// ── Key management ────────────────────────────────────────────────────────────

const ALGORITHM  = "aes-256-gcm";
const IV_LENGTH  = 12;   // 96-bit IV for GCM
const TAG_LENGTH = 16;   // 128-bit auth tag
const KEY_VERSION = "v1";

function getEncryptionKey(): Buffer {
  const hex = process.env.VAULT_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) throw new VaultKeyMissingError();
  return Buffer.from(hex, "hex");
}

// ── Crypto helpers ────────────────────────────────────────────────────────────

function encrypt(plainValue: string): string {
  try {
    const key = getEncryptionKey();
    const iv  = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    const encrypted = Buffer.concat([cipher.update(plainValue, "utf8"), cipher.final()]);
    const authTag   = cipher.getAuthTag();
    // Format: base64(iv):base64(authTag):base64(ciphertext)
    return [
      iv.toString("base64"),
      authTag.toString("base64"),
      encrypted.toString("base64"),
    ].join(":");
  } catch (err) {
    if (err instanceof VaultKeyMissingError) throw err;
    throw new VaultEncryptionError();
  }
}

function decrypt(encryptedValue: string): string {
  try {
    const key  = getEncryptionKey();
    const [ivB64, tagB64, dataB64] = encryptedValue.split(":");
    if (!ivB64 || !tagB64 || !dataB64) throw new VaultEncryptionError();
    const iv         = Buffer.from(ivB64,  "base64");
    const authTag    = Buffer.from(tagB64, "base64");
    const ciphertext = Buffer.from(dataB64, "base64");
    const decipher   = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(authTag);
    return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
  } catch (err) {
    if (err instanceof VaultKeyMissingError) throw err;
    throw new VaultEncryptionError();
  }
}

// ── DB → metadata mapper ──────────────────────────────────────────────────────

function toMetadata(record: {
  id:           string;
  connectionId: string;
  secretType:   string;
  keyVersion:   string;
  expiresAt:    Date | null;
  revokedAt:    Date | null;
}): VaultSecretMetadata {
  const now = new Date();
  return {
    id:           record.id,
    connectionId: record.connectionId,
    secretType:   record.secretType as VaultSecretMetadata["secretType"],
    keyVersion:   record.keyVersion,
    expiresAt:    record.expiresAt?.toISOString() ?? null,
    isExpired:    record.expiresAt !== null && record.expiresAt < now,
    revokedAt:    record.revokedAt?.toISOString() ?? null,
    isRevoked:    record.revokedAt !== null,
  };
}

// ── Vault service ─────────────────────────────────────────────────────────────

class PrismaVaultBackend implements IVaultBackend {

  async store(input: VaultStoreInput): Promise<VaultSecretMetadata> {
    const encryptedValue = encrypt(input.plainValue);

    // Upsert: replace existing secret of same type for this connection
    const existing = await prisma.integrationSecret.findFirst({
      where: {
        organizationId: input.organizationId,
        connectionId:   input.connectionId,
        secretType:     input.secretType,
        revokedAt:      null,
      },
    });

    if (existing) {
      const updated = await prisma.integrationSecret.update({
        where: { id: existing.id },
        data: {
          encryptedValue,
          keyVersion: KEY_VERSION,
          expiresAt:  input.expiresAt ?? null,
        },
      });
      return toMetadata(updated);
    }

    const created = await prisma.integrationSecret.create({
      data: {
        organizationId: input.organizationId,
        connectionId:   input.connectionId,
        secretType:     input.secretType,
        encryptedValue,
        keyVersion:     KEY_VERSION,
        expiresAt:      input.expiresAt ?? null,
      },
    });
    return toMetadata(created);
  }

  async get(input: VaultGetInput): Promise<VaultRetrievedSecret | null> {
    const record = await prisma.integrationSecret.findFirst({
      where: {
        organizationId: input.organizationId,
        connectionId:   input.connectionId,
        secretType:     input.secretType,
        revokedAt:      null,
      },
    });

    if (!record) return null;

    // Enforce tenant isolation
    if (record.organizationId !== input.organizationId) {
      throw new VaultTenantIsolationError();
    }

    const now = new Date();
    if (record.revokedAt) throw new VaultSecretRevokedError(input.connectionId, input.secretType);
    if (record.expiresAt && record.expiresAt < now) throw new VaultSecretExpiredError(input.connectionId, input.secretType);

    const plainValue = decrypt(record.encryptedValue);

    return {
      id:           record.id,
      connectionId: record.connectionId,
      secretType:   record.secretType as VaultRetrievedSecret["secretType"],
      plainValue,   // ⚠ server-only — never serialize to client
      expiresAt:    record.expiresAt,
      isExpired:    false,
    };
  }

  async rotate(input: VaultRotateInput): Promise<VaultSecretMetadata> {
    const record = await prisma.integrationSecret.findFirst({
      where: {
        organizationId: input.organizationId,
        connectionId:   input.connectionId,
        secretType:     input.secretType,
      },
    });
    if (!record) throw new VaultSecretNotFoundError(input.connectionId, input.secretType);
    if (record.organizationId !== input.organizationId) throw new VaultTenantIsolationError();

    const encryptedValue = encrypt(input.newPlainValue);
    const updated = await prisma.integrationSecret.update({
      where: { id: record.id },
      data: {
        encryptedValue,
        keyVersion: KEY_VERSION,
        expiresAt:  input.expiresAt ?? null,
        revokedAt:  null,   // Un-revoke on rotation
      },
    });
    return toMetadata(updated);
  }

  async revoke(input: VaultRevokeInput): Promise<void> {
    const where = input.secretType
      ? {
          organizationId: input.organizationId,
          connectionId:   input.connectionId,
          secretType:     input.secretType,
          revokedAt:      null,
        }
      : {
          organizationId: input.organizationId,
          connectionId:   input.connectionId,
          revokedAt:      null,
        };

    await prisma.integrationSecret.updateMany({
      where,
      data: { revokedAt: new Date() },
    });
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────

export const vaultService: IVaultBackend = new PrismaVaultBackend();

// ── Convenience helpers ───────────────────────────────────────────────────────

export const storeIntegrationSecret   = (i: VaultStoreInput)  => vaultService.store(i);
export const getIntegrationSecret     = (i: VaultGetInput)    => vaultService.get(i);
export const rotateIntegrationSecret  = (i: VaultRotateInput) => vaultService.rotate(i);
export const revokeIntegrationSecret  = (i: VaultRevokeInput) => vaultService.revoke(i);
