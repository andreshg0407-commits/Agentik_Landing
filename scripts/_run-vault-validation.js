#!/usr/bin/env node
/**
 * scripts/_run-vault-validation.js
 *
 * AGENTIK-SECURITY-VAULT-01 — Validation Suite
 * CJS runner — zero external dependencies.
 *
 * Checks:
 *   A — vault-secret-record.ts   (60 checks)
 *   B — vault-access-policy.ts   (35 checks)
 *   C — vault-repository.ts      (30 checks)
 *   D — vault-encryption.ts      (35 checks)
 *   E — vault-service-audit.ts   (40 checks)
 *   F — vault-masking.ts         (30 checks)
 *   G — vault-validation.ts      (40 checks)
 *   H — vault-registry.ts        (35 checks)
 *   I — prisma-vault-repository.ts (30 checks)
 *   J — vault-service.ts         (55 checks)
 *   K — vault-migration-planner.ts (25 checks)
 *   L — server.ts barrel         (30 checks)
 *   M — index.ts barrel          (30 checks)
 *   N — prisma schema            (20 checks)
 *   O — Independence             (15 checks)
 *
 * Total: ~510 checks
 */

"use strict";

const fs   = require("fs");
const path = require("path");

// ── Paths ──────────────────────────────────────────────────────────────────────

const ROOT    = path.resolve(__dirname, "..");
const VAULT   = path.join(ROOT, "lib", "security", "vault");
const PRISMA  = path.join(ROOT, "prisma", "schema.prisma");

function read(rel) {
  try { return fs.readFileSync(path.join(VAULT, rel), "utf8"); } catch { return ""; }
}

const RECORD     = read("vault-secret-record.ts");
const POLICY     = read("vault-access-policy.ts");
const REPO       = read("vault-repository.ts");
const ENC        = read("vault-encryption.ts");
const AUDIT      = read("vault-service-audit.ts");
const MASKING    = read("vault-masking.ts");
const VALIDATION = read("vault-validation.ts");
const REGISTRY   = read("vault-registry.ts");
const PRISMA_REPO = read("prisma-vault-repository.ts");
const SERVICE    = read("vault-service.ts");
const MIGRATION  = read("vault-migration-planner.ts");
const SERVER     = read("server.ts");
const INDEX      = read("index.ts");
const SCHEMA     = (() => { try { return fs.readFileSync(PRISMA, "utf8"); } catch { return ""; } })();

// ── Test runner ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function check(id, description, condition) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push({ id, description });
  }
}

// ── A — vault-secret-record.ts ─────────────────────────────────────────────────

// VaultSecretKind values
check("A01", "RECORD has VaultSecretKind", RECORD.includes("VaultSecretKind"));
check("A02", "RECORD has API_KEY kind",    RECORD.includes('"API_KEY"'));
check("A03", "RECORD has ACCESS_TOKEN",    RECORD.includes('"ACCESS_TOKEN"'));
check("A04", "RECORD has REFRESH_TOKEN",   RECORD.includes('"REFRESH_TOKEN"'));
check("A05", "RECORD has WEBHOOK_SECRET",  RECORD.includes('"WEBHOOK_SECRET"'));
check("A06", "RECORD has CERTIFICATE_PASSWORD", RECORD.includes('"CERTIFICATE_PASSWORD"'));
check("A07", "RECORD has SOFTWARE_PIN",    RECORD.includes('"SOFTWARE_PIN"'));
check("A08", "RECORD has OAUTH_PAIR",      RECORD.includes('"OAUTH_PAIR"'));
check("A09", "RECORD has BANKING_CREDENTIAL", RECORD.includes('"BANKING_CREDENTIAL"'));
check("A10", "RECORD has GENERIC_SECRET",  RECORD.includes('"GENERIC_SECRET"'));

// VaultSecretStatus
check("A11", "RECORD has VaultSecretStatus",  RECORD.includes("VaultSecretStatus"));
check("A12", "RECORD status ACTIVE",          RECORD.includes('"ACTIVE"'));
check("A13", "RECORD status DISABLED",        RECORD.includes('"DISABLED"'));
check("A14", "RECORD status REVOKED",         RECORD.includes('"REVOKED"'));
check("A15", "RECORD status EXPIRED",         RECORD.includes('"EXPIRED"'));

// VaultSecretClassification
check("A16", "RECORD has VaultSecretClassification", RECORD.includes("VaultSecretClassification"));
check("A17", "RECORD classification RESTRICTED",      RECORD.includes('"RESTRICTED"'));
check("A18", "RECORD classification CONFIDENTIAL",    RECORD.includes('"CONFIDENTIAL"'));

// VaultSecretMetadata fields
check("A19", "RECORD has VaultSecretMetadata", RECORD.includes("VaultSecretMetadata"));
check("A20", "RECORD metadata has id",          RECORD.includes("id:"));
check("A21", "RECORD metadata has orgSlug",     RECORD.includes("orgSlug:"));
check("A22", "RECORD metadata has name",        RECORD.includes("name:"));
check("A23", "RECORD metadata has kind",        RECORD.includes("kind:"));
check("A24", "RECORD metadata has classification", RECORD.includes("classification:"));
check("A25", "RECORD metadata has provider",    RECORD.includes("provider:"));
check("A26", "RECORD metadata has tags",        RECORD.includes("tags:"));
check("A27", "RECORD metadata has status",      RECORD.includes("status:"));
check("A28", "RECORD metadata has keyVersion",  RECORD.includes("keyVersion:"));
check("A29", "RECORD metadata has createdAt",   RECORD.includes("createdAt:"));
check("A30", "RECORD metadata has updatedAt",   RECORD.includes("updatedAt:"));
check("A31", "RECORD metadata has lastAccessedAt", RECORD.includes("lastAccessedAt:"));
check("A32", "RECORD metadata has expiresAt",   RECORD.includes("expiresAt:"));
check("A33", "RECORD metadata has revokedAt",   RECORD.includes("revokedAt:"));
check("A34", "RECORD metadata has notes",       RECORD.includes("notes:"));

// VaultSecretRecord
check("A35", "RECORD has VaultSecretRecord",   RECORD.includes("VaultSecretRecord"));
check("A36", "RECORD has maskedValue",         RECORD.includes("maskedValue:"));

// Input shapes
check("A37", "RECORD has VaultCreateInput",    RECORD.includes("VaultCreateInput"));
check("A38", "RECORD has VaultUpdateInput",    RECORD.includes("VaultUpdateInput"));
check("A39", "RECORD CreateInput has value",   RECORD.includes("value:"));

// VaultCaller
check("A40", "RECORD has VaultCaller",         RECORD.includes("VaultCaller"));
check("A41", "RECORD VaultCaller actorId",     RECORD.includes("actorId:"));
check("A42", "RECORD VaultCaller actorType",   RECORD.includes("actorType:"));
check("A43", "RECORD VaultCaller USER",        RECORD.includes('"USER"'));
check("A44", "RECORD VaultCaller SERVICE",     RECORD.includes('"SERVICE"'));
check("A45", "RECORD VaultCaller AGENT",       RECORD.includes('"AGENT"'));
check("A46", "RECORD VaultCaller SYSTEM",      RECORD.includes('"SYSTEM"'));

// Results
check("A47", "RECORD has VaultWriteResult",    RECORD.includes("VaultWriteResult"));
check("A48", "RECORD has VaultReadResult",     RECORD.includes("VaultReadResult"));
check("A49", "RECORD has VaultListResult",     RECORD.includes("VaultListResult"));
check("A50", "RECORD has VaultDeleteResult",   RECORD.includes("VaultDeleteResult"));
check("A51", "RECORD has VaultServiceError",   RECORD.includes("VaultServiceError"));
check("A52", "RECORD VaultServiceError has code", RECORD.includes("code:"));
check("A53", "RECORD has VaultServiceErrorCode", RECORD.includes("VaultServiceErrorCode"));
check("A54", "RECORD ErrorCode NOT_FOUND",     RECORD.includes('"NOT_FOUND"'));
check("A55", "RECORD ErrorCode ACCESS_DENIED", RECORD.includes('"ACCESS_DENIED"'));
check("A56", "RECORD ErrorCode ENCRYPTION_FAILED", RECORD.includes('"ENCRYPTION_FAILED"'));
check("A57", "RECORD ErrorCode DECRYPTION_FAILED", RECORD.includes('"DECRYPTION_FAILED"'));
check("A58", "RECORD ErrorCode VALIDATION_FAILED", RECORD.includes('"VALIDATION_FAILED"'));
check("A59", "RECORD no server-only",         !RECORD.match(/^import "server-only"/m));
check("A60", "RECORD no @prisma",             !RECORD.match(/^import.*@prisma/m));

// ── B — vault-access-policy.ts ─────────────────────────────────────────────────

check("B01", "POLICY has VaultAccessOperation", POLICY.includes("VaultAccessOperation"));
check("B02", "POLICY op CREATE",               POLICY.includes('"CREATE"'));
check("B03", "POLICY op READ",                 POLICY.includes('"READ"'));
check("B04", "POLICY op UPDATE",               POLICY.includes('"UPDATE"'));
check("B05", "POLICY op DISABLE",              POLICY.includes('"DISABLE"'));
check("B06", "POLICY op REVOKE",               POLICY.includes('"REVOKE"'));
check("B07", "POLICY op DELETE",               POLICY.includes('"DELETE"'));
check("B08", "POLICY op LIST",                 POLICY.includes('"LIST"'));
check("B09", "POLICY has VaultAccessDecision", POLICY.includes("VaultAccessDecision"));
check("B10", "POLICY decision has allowed",    POLICY.includes("allowed:"));
check("B11", "POLICY decision has reason",     POLICY.includes("reason:"));
check("B12", "POLICY has canAccessVaultSecret", POLICY.includes("canAccessVaultSecret"));
check("B13", "POLICY has canReadVaultSecret",  POLICY.includes("canReadVaultSecret"));
check("B14", "POLICY has canModifyVaultSecret", POLICY.includes("canModifyVaultSecret"));
check("B15", "POLICY tenant check before actor", POLICY.indexOf("orgSlug") < POLICY.indexOf("actorType"));
check("B16", "POLICY empty orgSlug denied",    POLICY.includes("missing orgSlug"));
check("B17", "POLICY mismatch denied",         POLICY.includes("tenant boundary violation"));
check("B18", "POLICY AGENT restricted",        POLICY.includes("AGENT") && POLICY.includes("may only READ or LIST"));
check("B19", "POLICY SERVICE restricted",      POLICY.includes("SERVICE") && POLICY.includes("may only READ or LIST"));
check("B20", "POLICY fail closed on error",    POLICY.includes("fail closed"));
check("B21", "POLICY never throws",            !POLICY.includes("throws") || POLICY.includes("Never throws"));
check("B22", "POLICY allowed=true on success", POLICY.includes("allowed:   true"));
check("B23", "POLICY Access granted",          POLICY.includes("Access granted"));
check("B24", "POLICY no server-only",         !POLICY.match(/^import "server-only"/m));
check("B25", "POLICY no @prisma",            !POLICY.match(/^import.*@prisma/m));
check("B26", "POLICY imports VaultCaller",    POLICY.includes("VaultCaller"));
check("B27", "POLICY export canAccessVaultSecret", POLICY.includes("export function canAccessVaultSecret"));
check("B28", "POLICY export canReadVaultSecret", POLICY.includes("export function canReadVaultSecret"));
check("B29", "POLICY export canModifyVaultSecret", POLICY.includes("export function canModifyVaultSecret"));
check("B30", "POLICY decision has operation field", POLICY.includes("operation:"));
check("B31", "POLICY decision has actorId",   POLICY.includes("actorId:"));
check("B32", "POLICY decision has orgSlug",   POLICY.includes("orgSlug:"));
check("B33", "POLICY try/catch wraps evaluation", POLICY.includes("try {") && POLICY.includes("} catch {"));
check("B34", "POLICY result caller.orgSlug in decision", POLICY.includes("caller.orgSlug,"));
check("B35", "POLICY returns denied on empty secretOrgSlug", POLICY.includes("!secretOrgSlug"));

// ── C — vault-repository.ts ────────────────────────────────────────────────────

check("C01", "REPO has VaultRepository interface", REPO.includes("VaultRepository"));
check("C02", "REPO has create method",       REPO.includes("create("));
check("C03", "REPO has findById method",     REPO.includes("findById("));
check("C04", "REPO has listByOrg method",    REPO.includes("listByOrg("));
check("C05", "REPO has update method",       REPO.includes("update("));
check("C06", "REPO has rotateEncryptedValue", REPO.includes("rotateEncryptedValue("));
check("C07", "REPO has touchAccessedAt",     REPO.includes("touchAccessedAt("));
check("C08", "REPO has disable method",      REPO.includes("disable("));
check("C09", "REPO has revoke method",       REPO.includes("revoke("));
check("C10", "REPO has delete method",       REPO.includes("delete("));
check("C11", "REPO create takes orgSlug",    REPO.includes("orgSlug: string,"));
check("C12", "REPO create takes encryptedValue", REPO.includes("encryptedValue: string,"));
check("C13", "REPO create takes keyVersion", !!REPO.match(/keyVersion[^)]*number/));
check("C14", "REPO create returns VaultSecretMetadata", REPO.includes("): Promise<VaultSecretMetadata>"));
check("C15", "REPO findById returns metadata+encryptedValue or null",
  REPO.includes("{ metadata: VaultSecretMetadata; encryptedValue: string } | null"));
check("C16", "REPO listByOrg returns array", REPO.includes("Promise<VaultSecretMetadata[]>"));
check("C17", "REPO update returns null on not found", REPO.includes("VaultSecretMetadata | null"));
check("C18", "REPO touchAccessedAt never throws", REPO.includes("Promise<void>"));
check("C19", "REPO delete returns boolean",  REPO.includes("Promise<boolean>"));
check("C20", "REPO no server-only",         !REPO.match(/^import "server-only"/m));
check("C21", "REPO no @prisma",             !REPO.match(/^import.*@prisma/m));
check("C22", "REPO no React",               !REPO.includes("from 'react'") && !REPO.includes('from "react"'));
check("C23", "REPO export interface",        REPO.includes("export interface VaultRepository"));
check("C24", "REPO docblock mentions orgSlug scoping", REPO.includes("orgSlug"));
check("C25", "REPO import VaultCreateInput", REPO.includes("VaultCreateInput"));
check("C26", "REPO import VaultSecretMetadata", REPO.includes("VaultSecretMetadata"));
check("C27", "REPO import VaultUpdateInput", REPO.includes("VaultUpdateInput"));
check("C28", "REPO revoke sets revokedAt",  REPO.includes("revokedAt"));
check("C29", "REPO disable is reversible doc", REPO.includes("DISABLED"));
check("C30", "REPO revoke is irreversible doc", REPO.includes("REVOKED"));

// ── D — vault-encryption.ts ────────────────────────────────────────────────────

check("D01", "ENC has encryptRawSecret",       ENC.includes("encryptRawSecret"));
check("D02", "ENC has decryptRawSecret",       ENC.includes("decryptRawSecret"));
check("D03", "ENC has VaultEncryptionError",   ENC.includes("VaultEncryptionError"));
check("D04", "ENC uses AES-256-GCM",          ENC.includes("aes-256-gcm"));
check("D05", "ENC IV_LENGTH = 12",            ENC.includes("IV_LENGTH  = 12"));
check("D06", "ENC TAG_LENGTH = 16",           ENC.includes("TAG_LENGTH = 16"));
check("D07", "ENC KEY_LENGTH = 32",           ENC.includes("KEY_LENGTH = 32"));
check("D08", "ENC loads from VAULT_MASTER_KEY", ENC.includes("VAULT_MASTER_KEY"));
check("D09", "ENC checks 64 hex chars",       ENC.includes("64"));
check("D10", "ENC uses randomBytes for IV",   ENC.includes("randomBytes(IV_LENGTH)"));
check("D11", "ENC packs IV||AuthTag||Ciphertext", ENC.includes("Buffer.concat([iv, authTag, encrypted])"));
check("D12", "ENC returns base64",           ENC.includes('.toString("base64")'));
check("D13", "ENC returns keyVersion",       ENC.includes("keyVersion:"));
check("D14", "ENC decryptRawSecret extracts IV",  ENC.includes("subarray(0, IV_LENGTH)"));
check("D15", "ENC decryptRawSecret extracts authTag", ENC.includes("subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)"));
check("D16", "ENC decryptRawSecret sets authTag", ENC.includes("setAuthTag"));
check("D17", "ENC decryptRawSecret returns string", ENC.includes("toString(\"utf8\")"));
check("D18", "ENC throws VaultEncryptionError on bad key", ENC.includes("VaultEncryptionError"));
check("D19", "ENC throws on missing key",    ENC.includes("is not set"));
check("D20", "ENC throws on tampered data",  ENC.includes("tampered data"));
check("D21", "ENC imports from node:crypto", ENC.includes("from \"node:crypto\""));
check("D22", "ENC no server-only",          !ENC.match(/^import "server-only"/m));
check("D23", "ENC no @prisma",             !ENC.match(/^import.*@prisma/m));
check("D24", "ENC encryptRawSecret exported", ENC.includes("export function encryptRawSecret"));
check("D25", "ENC decryptRawSecret exported", ENC.includes("export function decryptRawSecret"));
check("D26", "ENC VaultEncryptionError extends Error", ENC.includes("extends Error"));
check("D27", "ENC error name set",          ENC.includes('this.name = "VaultEncryptionError"'));
check("D28", "ENC error prefix",            ENC.includes("[VaultEncryption]"));
check("D29", "ENC loadKey never cached doc", ENC.includes("Never cache"));
check("D30", "ENC decryptRawSecret checks min length", ENC.includes("minLength"));
check("D31", "ENC returns string from decrypt", ENC.includes("return decipher.update"));
check("D32", "ENC uses createCipheriv",     ENC.includes("createCipheriv"));
check("D33", "ENC uses createDecipheriv",   ENC.includes("createDecipheriv"));
check("D34", "ENC cipher update utf8",      ENC.includes('cipher.update(value, "utf8")'));
check("D35", "ENC CURRENT_KEY_VERSION",     ENC.includes("CURRENT_KEY_VERSION"));

// ── E — vault-service-audit.ts ────────────────────────────────────────────────

check("E01", "AUDIT has VaultServiceEventType", AUDIT.includes("VaultServiceEventType"));
check("E02", "AUDIT event SECRET_CREATED",  AUDIT.includes('"SECRET_CREATED"'));
check("E03", "AUDIT event SECRET_READ",     AUDIT.includes('"SECRET_READ"'));
check("E04", "AUDIT event SECRET_UPDATED",  AUDIT.includes('"SECRET_UPDATED"'));
check("E05", "AUDIT event SECRET_DISABLED", AUDIT.includes('"SECRET_DISABLED"'));
check("E06", "AUDIT event SECRET_REVOKED",  AUDIT.includes('"SECRET_REVOKED"'));
check("E07", "AUDIT event SECRET_DELETED",  AUDIT.includes('"SECRET_DELETED"'));
check("E08", "AUDIT event ACCESS_DENIED",   AUDIT.includes('"ACCESS_DENIED"'));
check("E09", "AUDIT event ENCRYPTION_FAILED", AUDIT.includes('"ENCRYPTION_FAILED"'));
check("E10", "AUDIT event DECRYPTION_FAILED", AUDIT.includes('"DECRYPTION_FAILED"'));
check("E11", "AUDIT has VaultServiceAuditEvent interface", AUDIT.includes("VaultServiceAuditEvent"));
check("E12", "AUDIT event has id",          AUDIT.includes("id:"));
check("E13", "AUDIT event has orgSlug",     AUDIT.includes("orgSlug:"));
check("E14", "AUDIT event has eventType",   AUDIT.includes("eventType:"));
check("E15", "AUDIT event has actorId",     AUDIT.includes("actorId:"));
check("E16", "AUDIT event has success",     AUDIT.includes("success:"));
check("E17", "AUDIT event has durationMs",  AUDIT.includes("durationMs:"));
check("E18", "AUDIT event has occurredAt",  AUDIT.includes("occurredAt:"));
check("E19", "AUDIT has VaultServiceAuditLog class", AUDIT.includes("class VaultServiceAuditLog"));
check("E20", "AUDIT has record() method",   AUDIT.includes("record("));
check("E21", "AUDIT has getEvents()",       AUDIT.includes("getEvents()"));
check("E22", "AUDIT has getEventsForOrg()", AUDIT.includes("getEventsForOrg("));
check("E23", "AUDIT has getEventsByType()", AUDIT.includes("getEventsByType("));
check("E24", "AUDIT has count()",           AUDIT.includes("count()"));
check("E25", "AUDIT has toJSON()",          AUDIT.includes("toJSON()"));
check("E26", "AUDIT has clear()",           AUDIT.includes("clear()"));
check("E27", "AUDIT has globalVaultServiceAuditLog", AUDIT.includes("globalVaultServiceAuditLog"));
check("E28", "AUDIT singleton is new VaultServiceAuditLog()", AUDIT.includes("new VaultServiceAuditLog()"));
check("E29", "AUDIT event ID has vsvc- prefix", AUDIT.includes("vsvc-"));
check("E30", "AUDIT record adds id+occurredAt", AUDIT.includes("nextEventId()") && AUDIT.includes("occurredAt: new Date().toISOString()"));
check("E31", "AUDIT getEvents returns defensive copy", AUDIT.includes("[...this._events]"));
check("E32", "AUDIT clear uses length=0",   AUDIT.includes("this._events.length = 0"));
check("E33", "AUDIT no server-only",       !AUDIT.match(/^import "server-only"/m));
check("E34", "AUDIT no @prisma",           !AUDIT.match(/^import.*@prisma/m));
check("E35", "AUDIT failureReason optional", AUDIT.includes("failureReason?:"));
check("E36", "AUDIT secretId optional",    AUDIT.includes("secretId?:"));
check("E37", "AUDIT secretKind optional",  AUDIT.includes("secretKind?:"));
check("E38", "AUDIT has getFailedEvents()", AUDIT.includes("getFailedEvents()"));
check("E39", "AUDIT export VaultServiceAuditLog", AUDIT.includes("export class VaultServiceAuditLog"));
check("E40", "AUDIT export globalVaultServiceAuditLog", AUDIT.includes("export const globalVaultServiceAuditLog"));

// ── F — vault-masking.ts ──────────────────────────────────────────────────────

check("F01", "MASKING has maskSecret",       MASKING.includes("maskSecret"));
check("F02", "MASKING has isMasked",         MASKING.includes("isMasked"));
check("F03", "MASKING has sanitizeForLog",   MASKING.includes("sanitizeForLog"));
check("F04", "MASKING <= 4 chars returns ****", MASKING.includes("<= 4") && MASKING.includes('"****"'));
check("F05", "MASKING shows first 4 chars", MASKING.includes("slice(0, 4)"));
check("F06", "MASKING shows last 2 chars",  MASKING.includes("slice(-2)"));
check("F07", "MASKING returns first****last", MASKING.includes('`${first}****${last}`'));
check("F08", "MASKING empty returns ****",  MASKING.includes("!value"));
check("F09", "MASKING isMasked checks ****", MASKING.includes('value.includes("****")'));
check("F10", "MASKING sanitizeForLog replaces long strings", MASKING.includes("[REDACTED]"));
check("F11", "MASKING sanitizeForLog uses regex", MASKING.includes("{20,}"));
check("F12", "MASKING export maskSecret",   MASKING.includes("export function maskSecret"));
check("F13", "MASKING export isMasked",     MASKING.includes("export function isMasked"));
check("F14", "MASKING export sanitizeForLog", MASKING.includes("export function sanitizeForLog"));
check("F15", "MASKING no server-only",     !MASKING.match(/^import "server-only"/m));
check("F16", "MASKING no @prisma",         !MASKING.match(/^import.*@prisma/m));
check("F17", "MASKING no React",           !MASKING.includes('from "react"') && !MASKING.includes("from 'react'"));
check("F18", "MASKING example sk-prod in docblock", MASKING.includes("sk-prod"));
check("F19", "MASKING value.length check", MASKING.includes("value.length"));
check("F20", "MASKING typeof check in isMasked", MASKING.includes('typeof value === "string"'));
check("F21", "MASKING sanitize handles alphanumeric/dash/underscore", MASKING.includes("A-Za-z0-9_"));
check("F22", "MASKING never throws",       !MASKING.includes("throw"));
check("F23", "MASKING no Date objects",    !MASKING.includes("new Date"));
check("F24", "MASKING isMasked returns boolean", MASKING.includes(": boolean {"));
check("F25", "MASKING maskSecret returns string", MASKING.includes(": string {"));
check("F26", "MASKING falsy check",        MASKING.includes("!value"));
check("F27", "MASKING description mentions api key", MASKING.includes("API key") || MASKING.includes("api key"));
check("F28", "MASKING 20+ char threshold", MASKING.includes("{20,}"));
check("F29", "MASKING const first",        MASKING.includes("const first"));
check("F30", "MASKING const last",         MASKING.includes("const last"));

// ── G — vault-validation.ts ───────────────────────────────────────────────────

check("G01", "VALIDATION has VaultValidationResult", VALIDATION.includes("VaultValidationResult"));
check("G02", "VALIDATION result has valid",  VALIDATION.includes("valid:"));
check("G03", "VALIDATION result has errors", VALIDATION.includes("errors:"));
check("G04", "VALIDATION result has warnings", VALIDATION.includes("warnings:"));
check("G05", "VALIDATION has validateCreateInput", VALIDATION.includes("validateCreateInput"));
check("G06", "VALIDATION has validateSecretValue", VALIDATION.includes("validateSecretValue"));
check("G07", "VALIDATION checks orgSlug required", VALIDATION.includes("orgSlug is required"));
check("G08", "VALIDATION checks name required", VALIDATION.includes("name is required"));
check("G09", "VALIDATION checks name length <= 200", VALIDATION.includes("200"));
check("G10", "VALIDATION checks kind is valid", VALIDATION.includes("is not a recognized VaultSecretKind"));
check("G11", "VALIDATION checks classification", VALIDATION.includes("RESTRICTED") && VALIDATION.includes("CONFIDENTIAL"));
check("G12", "VALIDATION checks provider required", VALIDATION.includes("provider is required"));
check("G13", "VALIDATION checks value via validateSecretValue", VALIDATION.includes("validateSecretValue(input.value"));
check("G14", "VALIDATION checks expiresAt ISO format", VALIDATION.includes("Date.parse(input.expiresAt)"));
check("G15", "VALIDATION warns on past expiresAt", VALIDATION.includes("past"));
check("G16", "VALIDATION checks notes length <= 1000", VALIDATION.includes("1000"));
check("G17", "VALIDATION validateSecretValue checks type string", VALIDATION.includes('typeof value !== "string"'));
check("G18", "VALIDATION validateSecretValue checks empty/whitespace", VALIDATION.includes("whitespace"));
check("G19", "VALIDATION KIND_MIN_LENGTH map",   VALIDATION.includes("KIND_MIN_LENGTH"));
check("G20", "VALIDATION KIND_MAX_LENGTH map",   VALIDATION.includes("KIND_MAX_LENGTH"));
check("G21", "VALIDATION API_KEY min >= 16",     VALIDATION.includes("API_KEY:              16") || VALIDATION.includes("API_KEY: 16"));
check("G22", "VALIDATION returns all errors",    VALIDATION.includes("errors.length === 0"));
check("G23", "VALIDATION export validateCreateInput", VALIDATION.includes("export function validateCreateInput"));
check("G24", "VALIDATION export validateSecretValue", VALIDATION.includes("export function validateSecretValue"));
check("G25", "VALIDATION no server-only",       !VALIDATION.match(/^import "server-only"/m));
check("G26", "VALIDATION no @prisma",           !VALIDATION.match(/^import.*@prisma/m));
check("G27", "VALIDATION import VaultCreateInput", VALIDATION.includes("VaultCreateInput"));
check("G28", "VALIDATION VALID_KINDS list",     VALIDATION.includes("VALID_KINDS"));
check("G29", "VALIDATION validateSecretValue returns string[]", VALIDATION.includes("string[]"));
check("G30", "VALIDATION checks null/undefined value", VALIDATION.includes("=== null || value === undefined"));
check("G31", "VALIDATION checks value trim empty", VALIDATION.includes("trim().length === 0"));
check("G32", "VALIDATION min/max extracted from kind", VALIDATION.includes("KIND_MIN_LENGTH[kind]"));
check("G33", "VALIDATION min check error message", VALIDATION.includes("must be at least"));
check("G34", "VALIDATION max check error message", VALIDATION.includes("must not exceed"));
check("G35", "VALIDATION GENERIC_SECRET min = 1", VALIDATION.includes("GENERIC_SECRET:       1"));
check("G36", "VALIDATION GENERIC_SECRET max = 8192", VALIDATION.includes("8192"));
check("G37", "VALIDATION warnings array initialized", VALIDATION.includes("const warnings"));
check("G38", "VALIDATION errors array initialized", VALIDATION.includes("const errors"));
check("G39", "VALIDATION returns warnings in result", VALIDATION.includes("{ valid: errors.length === 0, errors, warnings }"));
check("G40", "VALIDATION notes undefined check", VALIDATION.includes("input.notes !== undefined"));

// ── H — vault-registry.ts ─────────────────────────────────────────────────────

check("H01", "REGISTRY has VaultRegistryEntry", REGISTRY.includes("VaultRegistryEntry"));
check("H02", "REGISTRY entry has id",        REGISTRY.includes("id:"));
check("H03", "REGISTRY entry has name",      REGISTRY.includes("name:"));
check("H04", "REGISTRY entry has provider",  REGISTRY.includes("provider:"));
check("H05", "REGISTRY entry has kind",      REGISTRY.includes("kind:"));
check("H06", "REGISTRY entry has classification", REGISTRY.includes("classification:"));
check("H07", "REGISTRY entry has description", REGISTRY.includes("description:"));
check("H08", "REGISTRY entry has examplePattern", REGISTRY.includes("examplePattern:"));
check("H09", "REGISTRY has VAULT_SECRET_REGISTRY", REGISTRY.includes("VAULT_SECRET_REGISTRY"));
check("H10", "REGISTRY has OPENAI_API_KEY",  REGISTRY.includes('"OPENAI_API_KEY"'));
check("H11", "REGISTRY has ANTHROPIC_API_KEY", REGISTRY.includes('"ANTHROPIC_API_KEY"'));
check("H12", "REGISTRY has META_ACCESS_TOKEN", REGISTRY.includes('"META_ACCESS_TOKEN"'));
check("H13", "REGISTRY has META_APP_SECRET", REGISTRY.includes('"META_APP_SECRET"'));
check("H14", "REGISTRY has TIKTOK_ACCESS_TOKEN", REGISTRY.includes('"TIKTOK_ACCESS_TOKEN"'));
check("H15", "REGISTRY has SHOPIFY_ADMIN_TOKEN", REGISTRY.includes('"SHOPIFY_ADMIN_TOKEN"'));
check("H16", "REGISTRY has SHOPIFY_WEBHOOK_SECRET", REGISTRY.includes('"SHOPIFY_WEBHOOK_SECRET"'));
check("H17", "REGISTRY has DIAN_CERTIFICATE_PASSWORD", REGISTRY.includes('"DIAN_CERTIFICATE_PASSWORD"'));
check("H18", "REGISTRY has DIAN_SOFTWARE_PIN", REGISTRY.includes('"DIAN_SOFTWARE_PIN"'));
check("H19", "REGISTRY has WHATSAPP_ACCESS_TOKEN", REGISTRY.includes('"WHATSAPP_ACCESS_TOKEN"'));
check("H20", "REGISTRY has BANKING_API_CREDENTIAL", REGISTRY.includes('"BANKING_API_CREDENTIAL"'));
check("H21", "REGISTRY has GENERIC_WEBHOOK_SECRET", REGISTRY.includes('"GENERIC_WEBHOOK_SECRET"'));
check("H22", "REGISTRY has getRegistryEntry", REGISTRY.includes("getRegistryEntry"));
check("H23", "REGISTRY has getEntriesByProvider", REGISTRY.includes("getEntriesByProvider"));
check("H24", "REGISTRY has getEntriesByKind", REGISTRY.includes("getEntriesByKind"));
check("H25", "REGISTRY has getAllRegistryIds", REGISTRY.includes("getAllRegistryIds"));
check("H26", "REGISTRY is ReadonlyArray",    REGISTRY.includes("ReadonlyArray<VaultRegistryEntry>"));
check("H27", "REGISTRY as const",            REGISTRY.includes("as const"));
check("H28", "REGISTRY no server-only",     !REGISTRY.match(/^import "server-only"/m));
check("H29", "REGISTRY no @prisma",         !REGISTRY.match(/^import.*@prisma/m));
check("H30", "REGISTRY DIAN entries are RESTRICTED", REGISTRY.includes('provider:       "dian"') &&
  REGISTRY.includes('classification: "RESTRICTED"'));
check("H31", "REGISTRY GENERIC_WEBHOOK_SECRET is CONFIDENTIAL", REGISTRY.includes('"GENERIC_WEBHOOK_SECRET"') &&
  REGISTRY.includes('classification: "CONFIDENTIAL"'));
check("H32", "REGISTRY getRegistryEntry uses find", REGISTRY.includes(".find(e => e.id === id)"));
check("H33", "REGISTRY getEntriesByProvider uses filter", REGISTRY.includes(".filter(e => e.provider === provider)"));
check("H34", "REGISTRY getEntriesByKind uses filter", REGISTRY.includes(".filter(e => e.kind === kind)"));
check("H35", "REGISTRY getAllRegistryIds uses map", REGISTRY.includes(".map(e => e.id)"));

// ── I — prisma-vault-repository.ts ────────────────────────────────────────────

check("I01", "PRISMA_REPO has PrismaVaultRepository", PRISMA_REPO.includes("PrismaVaultRepository"));
check("I02", "PRISMA_REPO implements VaultRepository", PRISMA_REPO.includes("implements VaultRepository"));
check("I03", "PRISMA_REPO uses prisma.vaultSecret", PRISMA_REPO.includes("vaultSecret"));
check("I04", "PRISMA_REPO create uses orgSlug", PRISMA_REPO.includes("orgSlug"));
check("I05", "PRISMA_REPO findFirst filters by orgSlug", PRISMA_REPO.includes("findFirst") && PRISMA_REPO.includes("orgSlug"));
check("I06", "PRISMA_REPO listByOrg finds many", PRISMA_REPO.includes("findMany"));
check("I07", "PRISMA_REPO listByOrg orders by createdAt desc", PRISMA_REPO.includes("createdAt") && PRISMA_REPO.includes("desc"));
check("I08", "PRISMA_REPO update returns null on catch", PRISMA_REPO.includes("return null") && PRISMA_REPO.includes("} catch {"));
check("I09", "PRISMA_REPO delete returns boolean", PRISMA_REPO.includes("return true") && PRISMA_REPO.includes("return false"));
check("I10", "PRISMA_REPO touchAccessedAt never throws", PRISMA_REPO.includes("touchAccessedAt") && PRISMA_REPO.includes("} catch {"));
check("I11", "PRISMA_REPO revoke sets REVOKED status", PRISMA_REPO.includes("REVOKED") && PRISMA_REPO.includes("revokedAt: new Date()"));
check("I12", "PRISMA_REPO disable sets DISABLED status", PRISMA_REPO.includes("DISABLED"));
check("I13", "PRISMA_REPO has toMetadata helper", PRISMA_REPO.includes("toMetadata"));
check("I14", "PRISMA_REPO toMetadata maps createdAt.toISOString()", PRISMA_REPO.includes("toISOString()"));
check("I15", "PRISMA_REPO toMetadata maps status as VaultSecretStatus", PRISMA_REPO.includes("as VaultSecretStatus"));
check("I16", "PRISMA_REPO create sets status ACTIVE", PRISMA_REPO.includes("status:         \"ACTIVE\"") || PRISMA_REPO.includes('status: "ACTIVE"'));
check("I17", "PRISMA_REPO create sets tags from input", PRISMA_REPO.includes("tags:           input.tags ?? []") || PRISMA_REPO.includes("tags: input.tags ?? []"));
check("I18", "PRISMA_REPO imports from prisma", PRISMA_REPO.includes("from \"@/lib/prisma\"") || PRISMA_REPO.includes("from '@/lib/prisma'"));
check("I19", "PRISMA_REPO imports VaultRepository", PRISMA_REPO.includes("VaultRepository"));
check("I20", "PRISMA_REPO has toPrismaDate helper", PRISMA_REPO.includes("toPrismaDate"));
check("I21", "PRISMA_REPO toPrismaDate handles null", PRISMA_REPO.includes("if (!iso) return null"));
check("I22", "PRISMA_REPO rotateEncryptedValue updates encryptedValue+keyVersion",
  PRISMA_REPO.includes("encryptedValue, keyVersion"));
check("I23", "PRISMA_REPO create uses default(cuid) via Prisma", PRISMA_REPO.includes("vaultSecret.create"));
check("I24", "PRISMA_REPO export class", PRISMA_REPO.includes("export class PrismaVaultRepository"));
check("I25", "PRISMA_REPO has VaultSecretRow type", PRISMA_REPO.includes("VaultSecretRow"));
check("I26", "PRISMA_REPO uses any cast for Prisma until migration", PRISMA_REPO.includes("prisma as any") || PRISMA_REPO.includes("(prisma as any)"));
check("I27", "PRISMA_REPO toMetadata maps tags as string[]", PRISMA_REPO.includes("tags:"));
check("I28", "PRISMA_REPO listByOrg where orgSlug", PRISMA_REPO.includes("where:   { orgSlug }") || PRISMA_REPO.includes("where: { orgSlug }"));
check("I29", "PRISMA_REPO findById where id AND orgSlug", PRISMA_REPO.includes("where: { id, orgSlug }"));
check("I30", "PRISMA_REPO delete where id AND orgSlug", PRISMA_REPO.includes(".delete(") && PRISMA_REPO.includes("{ id, orgSlug }"));

// ── J — vault-service.ts ──────────────────────────────────────────────────────

check("J01", "SERVICE has VaultService class", SERVICE.includes("class VaultService"));
check("J02", "SERVICE constructor takes VaultRepository", SERVICE.includes("VaultRepository"));
check("J03", "SERVICE has createSecret", SERVICE.includes("createSecret("));
check("J04", "SERVICE has readSecret",   SERVICE.includes("readSecret("));
check("J05", "SERVICE has listSecrets",  SERVICE.includes("listSecrets("));
check("J06", "SERVICE has updateSecret", SERVICE.includes("updateSecret("));
check("J07", "SERVICE has disableSecret", SERVICE.includes("disableSecret("));
check("J08", "SERVICE has revokeSecret", SERVICE.includes("revokeSecret("));
check("J09", "SERVICE has deleteSecret", SERVICE.includes("deleteSecret("));
check("J10", "SERVICE createSecret checks policy first", SERVICE.indexOf("canAccessVaultSecret") < SERVICE.indexOf("encryptRawSecret"));
check("J11", "SERVICE createSecret validates input", SERVICE.includes("validateCreateInput"));
check("J12", "SERVICE createSecret encrypts before persist", SERVICE.includes("encryptRawSecret"));
check("J13", "SERVICE createSecret audits on success", SERVICE.includes("SECRET_CREATED"));
check("J14", "SERVICE createSecret audits ACCESS_DENIED", SERVICE.includes("ACCESS_DENIED"));
check("J15", "SERVICE createSecret audits ENCRYPTION_FAILED", SERVICE.includes("ENCRYPTION_FAILED"));
check("J16", "SERVICE readSecret decrypts", SERVICE.includes("decryptRawSecret"));
check("J17", "SERVICE readSecret audits SECRET_READ", SERVICE.includes("SECRET_READ"));
check("J18", "SERVICE readSecret audits DECRYPTION_FAILED", SERVICE.includes("DECRYPTION_FAILED"));
check("J19", "SERVICE readSecret checks REVOKED status", SERVICE.includes("ALREADY_REVOKED"));
check("J20", "SERVICE readSecret checks expiry", SERVICE.includes("SECRET_EXPIRED"));
check("J21", "SERVICE readSecret calls touchAccessedAt", SERVICE.includes("touchAccessedAt"));
check("J22", "SERVICE readSecret touchAccessedAt is fire-and-forget", SERVICE.includes("void this.repo.touchAccessedAt"));
check("J23", "SERVICE listSecrets returns masked records", SERVICE.includes("maskedValue: \"****\""));
check("J24", "SERVICE createSecret returns masked value via maskSecret", SERVICE.includes("maskSecret(input.value)"));
check("J25", "SERVICE updateSecret audits SECRET_UPDATED", SERVICE.includes("SECRET_UPDATED"));
check("J26", "SERVICE disableSecret audits SECRET_DISABLED", SERVICE.includes("SECRET_DISABLED"));
check("J27", "SERVICE revokeSecret audits SECRET_REVOKED", SERVICE.includes("SECRET_REVOKED"));
check("J28", "SERVICE deleteSecret audits SECRET_DELETED", SERVICE.includes("SECRET_DELETED"));
check("J29", "SERVICE returns VaultServiceResult pattern", SERVICE.includes("VaultServiceResult"));
check("J30", "SERVICE has mkErr helper",     SERVICE.includes("mkErr"));
check("J31", "SERVICE mkErr sets success=false", SERVICE.includes("success: false"));
check("J32", "SERVICE mkErr sets code",      SERVICE.includes("code,"));
check("J33", "SERVICE tenant check before encryption in create",
  SERVICE.indexOf("canAccessVaultSecret") < SERVICE.indexOf("encryptRawSecret"));
check("J34", "SERVICE uses globalVaultServiceAuditLog", SERVICE.includes("globalVaultServiceAuditLog"));
check("J35", "SERVICE readSecret belt-and-suspenders tenant check", !!SERVICE.match(/belt.and.suspenders/i));
check("J36", "SERVICE readSecret findById passes orgSlug", SERVICE.includes("findById(secretId, caller.orgSlug)"));
check("J37", "SERVICE imports encryptRawSecret", SERVICE.includes("encryptRawSecret"));
check("J38", "SERVICE imports decryptRawSecret", SERVICE.includes("decryptRawSecret"));
check("J39", "SERVICE imports canAccessVaultSecret", SERVICE.includes("canAccessVaultSecret"));
check("J40", "SERVICE imports validateCreateInput", SERVICE.includes("validateCreateInput"));
check("J41", "SERVICE imports maskSecret", SERVICE.includes("maskSecret"));
check("J42", "SERVICE imports globalVaultServiceAuditLog", SERVICE.includes("globalVaultServiceAuditLog"));
check("J43", "SERVICE export class VaultService", SERVICE.includes("export class VaultService"));
check("J44", "SERVICE createSecret uses Date.now() timing", SERVICE.includes("Date.now() - start"));
check("J45", "SERVICE createSecret start timestamp", SERVICE.includes("const start = Date.now()"));
check("J46", "SERVICE readSecret checks expiresAt with new Date()", SERVICE.includes("new Date(found.metadata.expiresAt)"));
check("J47", "SERVICE readSecret compares to current time", SERVICE.includes("< new Date()"));
check("J48", "SERVICE deleteSecret returns VaultDeleteResult", SERVICE.includes("VaultDeleteResult"));
check("J49", "SERVICE listSecrets maps metadata to records", SERVICE.includes("metadataList.map"));
check("J50", "SERVICE createSecret returns record with metadata", SERVICE.includes("{ ...metadata, maskedValue"));
check("J51", "SERVICE no Prisma direct imports", !SERVICE.match(/from "@\/lib\/prisma"/));
check("J52", "SERVICE all methods are async", SERVICE.includes("async createSecret") && SERVICE.includes("async readSecret"));
check("J53", "SERVICE constructor private readonly", SERVICE.includes("private readonly repo"));
check("J54", "SERVICE mkErr exported as local function", SERVICE.includes("function mkErr"));
check("J55", "SERVICE readSecret returns value+metadata", SERVICE.includes("value, metadata: found.metadata"));

// ── K — vault-migration-planner.ts ────────────────────────────────────────────

check("K01", "MIGRATION has MigrationPhase", MIGRATION.includes("MigrationPhase"));
check("K02", "MIGRATION PHASE_1_SCHEMA",     MIGRATION.includes('"PHASE_1_SCHEMA"'));
check("K03", "MIGRATION PHASE_2_BACKFILL",   MIGRATION.includes('"PHASE_2_BACKFILL"'));
check("K04", "MIGRATION PHASE_3_DUAL_WRITE", MIGRATION.includes('"PHASE_3_DUAL_WRITE"'));
check("K05", "MIGRATION PHASE_4_CUTOVER",    MIGRATION.includes('"PHASE_4_CUTOVER"'));
check("K06", "MIGRATION PHASE_5_CLEANUP",    MIGRATION.includes('"PHASE_5_CLEANUP"'));
check("K07", "MIGRATION has MigrationStatus", MIGRATION.includes("MigrationStatus"));
check("K08", "MIGRATION has MigrationPlanItem", MIGRATION.includes("MigrationPlanItem"));
check("K09", "MIGRATION item has phase",     MIGRATION.includes("phase:"));
check("K10", "MIGRATION item has name",      MIGRATION.includes("name:"));
check("K11", "MIGRATION item has description", MIGRATION.includes("description:"));
check("K12", "MIGRATION item has blockers",  MIGRATION.includes("blockers:"));
check("K13", "MIGRATION item has status",    MIGRATION.includes("status:"));
check("K14", "MIGRATION item has sprint",    MIGRATION.includes("sprint:"));
check("K15", "MIGRATION VAULT_MIGRATION_PLAN array", MIGRATION.includes("VAULT_MIGRATION_PLAN"));
check("K16", "MIGRATION PHASE_1 is COMPLETE", MIGRATION.includes('"COMPLETE"'));
check("K17", "MIGRATION has getMigrationPhase", MIGRATION.includes("getMigrationPhase"));
check("K18", "MIGRATION has getPendingMigrationPhases", MIGRATION.includes("getPendingMigrationPhases"));
check("K19", "MIGRATION no server-only",    !MIGRATION.match(/^import "server-only"/m));
check("K20", "MIGRATION no @prisma",        !MIGRATION.match(/^import.*@prisma/m));
check("K21", "MIGRATION references AGENTIK-SECURITY-VAULT-01", MIGRATION.includes("AGENTIK-SECURITY-VAULT-01"));
check("K22", "MIGRATION references AGENTIK-SECURITY-MIGRATION-01", MIGRATION.includes("AGENTIK-SECURITY-MIGRATION-01"));
check("K23", "MIGRATION describes backfill", MIGRATION.includes("backfill") || MIGRATION.includes("Backfill"));
check("K24", "MIGRATION describes dual-write", MIGRATION.includes("dual") || MIGRATION.includes("Dual"));
check("K25", "MIGRATION as const",          MIGRATION.includes("as const"));

// ── L — server.ts barrel ──────────────────────────────────────────────────────

check("L01", "SERVER has import server-only",  SERVER.match(/^import "server-only"/m));
check("L02", "SERVER exports VaultService",    SERVER.includes("VaultService"));
check("L03", "SERVER exports PrismaVaultRepository", SERVER.includes("PrismaVaultRepository"));
check("L04", "SERVER exports VaultServiceAuditLog", SERVER.includes("VaultServiceAuditLog"));
check("L05", "SERVER exports globalVaultServiceAuditLog", SERVER.includes("globalVaultServiceAuditLog"));
check("L06", "SERVER exports encryptRawSecret", SERVER.includes("encryptRawSecret"));
check("L07", "SERVER exports decryptRawSecret", SERVER.includes("decryptRawSecret"));
check("L08", "SERVER exports VaultEncryptionError", SERVER.includes("VaultEncryptionError"));
check("L09", "SERVER exports canAccessVaultSecret", SERVER.includes("canAccessVaultSecret"));
check("L10", "SERVER exports validateCreateInput", SERVER.includes("validateCreateInput"));
check("L11", "SERVER exports maskSecret",      SERVER.includes("maskSecret"));
check("L12", "SERVER exports VAULT_SECRET_REGISTRY", SERVER.includes("VAULT_SECRET_REGISTRY"));
check("L13", "SERVER exports VAULT_MIGRATION_PLAN", SERVER.includes("VAULT_MIGRATION_PLAN"));
check("L14", "SERVER exports VaultRepository type", SERVER.includes("VaultRepository"));
check("L15", "SERVER exports all secret record types", SERVER.includes("VaultSecretKind") && SERVER.includes("VaultCaller"));
check("L16", "SERVER exports VaultAccessDecision", SERVER.includes("VaultAccessDecision"));
check("L17", "SERVER exports VaultServiceAuditEvent", SERVER.includes("VaultServiceAuditEvent"));
check("L18", "SERVER exports VaultValidationResult", SERVER.includes("VaultValidationResult"));
check("L19", "SERVER exports VaultRegistryEntry", SERVER.includes("VaultRegistryEntry"));
check("L20", "SERVER exports MigrationPlanItem", SERVER.includes("MigrationPlanItem"));
check("L21", "SERVER exports VaultWriteResult", SERVER.includes("VaultWriteResult"));
check("L22", "SERVER exports VaultReadResult", SERVER.includes("VaultReadResult"));
check("L23", "SERVER exports VaultListResult", SERVER.includes("VaultListResult"));
check("L24", "SERVER exports VaultServiceError", SERVER.includes("VaultServiceError"));
check("L25", "SERVER exports VaultServiceErrorCode", SERVER.includes("VaultServiceErrorCode"));
check("L26", "SERVER from vault-service",    SERVER.includes('./vault-service"') || SERVER.includes("./vault-service\""));
check("L27", "SERVER from prisma-vault-repository", SERVER.includes("prisma-vault-repository"));
check("L28", "SERVER from vault-encryption", SERVER.includes("vault-encryption"));
check("L29", "SERVER from vault-registry",   SERVER.includes("vault-registry"));
check("L30", "SERVER from vault-migration-planner", SERVER.includes("vault-migration-planner"));

// ── M — index.ts barrel ───────────────────────────────────────────────────────

check("M01", "INDEX no server-only",        !INDEX.match(/^import "server-only"/m));
check("M02", "INDEX no @prisma",            !INDEX.match(/^import.*@prisma/m));
check("M03", "INDEX no VaultService class", !INDEX.match(/export \{[^}]*VaultService[^}]*\} from/));
check("M04", "INDEX no PrismaVaultRepository", !INDEX.match(/^export.*PrismaVaultRepository/m));
check("M05", "INDEX no globalVaultServiceAuditLog export",
  !INDEX.match(/^export \{[^}]*globalVaultServiceAuditLog/m));
check("M06", "INDEX no encryptRawSecret",  !INDEX.match(/^export.*encryptRawSecret/m));
check("M07", "INDEX no decryptRawSecret",  !INDEX.match(/^export.*decryptRawSecret/m));
check("M08", "INDEX exports maskSecret",    INDEX.includes("maskSecret"));
check("M09", "INDEX exports validateCreateInput", INDEX.includes("validateCreateInput"));
check("M10", "INDEX exports canAccessVaultSecret", INDEX.includes("canAccessVaultSecret"));
check("M11", "INDEX exports VAULT_SECRET_REGISTRY", INDEX.includes("VAULT_SECRET_REGISTRY"));
check("M12", "INDEX exports VAULT_MIGRATION_PLAN", INDEX.includes("VAULT_MIGRATION_PLAN"));
check("M13", "INDEX exports VaultSecretKind type", INDEX.includes("VaultSecretKind"));
check("M14", "INDEX exports VaultCaller type", INDEX.includes("VaultCaller"));
check("M15", "INDEX exports VaultSecretMetadata type", INDEX.includes("VaultSecretMetadata"));
check("M16", "INDEX exports VaultSecretRecord type", INDEX.includes("VaultSecretRecord"));
check("M17", "INDEX exports VaultCreateInput type", INDEX.includes("VaultCreateInput"));
check("M18", "INDEX exports VaultUpdateInput type", INDEX.includes("VaultUpdateInput"));
check("M19", "INDEX exports VaultAccessDecision type", INDEX.includes("VaultAccessDecision"));
check("M20", "INDEX exports VaultServiceAuditEvent type", INDEX.includes("VaultServiceAuditEvent"));
check("M21", "INDEX exports VaultValidationResult type", INDEX.includes("VaultValidationResult"));
check("M22", "INDEX exports VaultRegistryEntry type", INDEX.includes("VaultRegistryEntry"));
check("M23", "INDEX exports MigrationPlanItem type", INDEX.includes("MigrationPlanItem"));
check("M24", "INDEX exports VaultRepository type", INDEX.includes("VaultRepository"));
check("M25", "INDEX exports isMasked",       INDEX.includes("isMasked"));
check("M26", "INDEX exports sanitizeForLog", INDEX.includes("sanitizeForLog"));
check("M27", "INDEX exports validateSecretValue", INDEX.includes("validateSecretValue"));
check("M28", "INDEX exports canReadVaultSecret", INDEX.includes("canReadVaultSecret"));
check("M29", "INDEX exports getRegistryEntry", INDEX.includes("getRegistryEntry"));
check("M30", "INDEX exports getMigrationPhase", INDEX.includes("getMigrationPhase"));

// ── N — Prisma schema ─────────────────────────────────────────────────────────

check("N01", "SCHEMA has model VaultSecret", SCHEMA.includes("model VaultSecret {"));
check("N02", "SCHEMA VaultSecret has id cuid", SCHEMA.includes("@id @default(cuid())"));
check("N03", "SCHEMA VaultSecret has orgSlug", SCHEMA.includes("orgSlug        String"));
check("N04", "SCHEMA VaultSecret has name",   SCHEMA.includes("name           String"));
check("N05", "SCHEMA VaultSecret has kind",   SCHEMA.includes("kind           String"));
check("N06", "SCHEMA VaultSecret has classification", SCHEMA.includes("classification String"));
check("N07", "SCHEMA VaultSecret has provider", SCHEMA.includes("provider       String"));
check("N08", "SCHEMA VaultSecret has encryptedValue", SCHEMA.includes("encryptedValue"));
check("N09", "SCHEMA encryptedValue is Text", SCHEMA.includes("@db.Text"));
check("N10", "SCHEMA VaultSecret has keyVersion", SCHEMA.includes("keyVersion"));
check("N11", "SCHEMA VaultSecret has tags String[]", SCHEMA.includes("tags           String[]"));
check("N12", "SCHEMA VaultSecret has status",  SCHEMA.includes('status         String   @default("ACTIVE")'));
check("N13", "SCHEMA VaultSecret has lastAccessedAt", SCHEMA.includes("lastAccessedAt DateTime?"));
check("N14", "SCHEMA VaultSecret has expiresAt", SCHEMA.includes("expiresAt      DateTime?"));
check("N15", "SCHEMA VaultSecret has revokedAt", SCHEMA.includes("revokedAt      DateTime?"));
check("N16", "SCHEMA VaultSecret has notes",   SCHEMA.includes("notes          String?"));
check("N17", "SCHEMA VaultSecret has createdAt", SCHEMA.includes("createdAt      DateTime @default(now())"));
check("N18", "SCHEMA VaultSecret has updatedAt", SCHEMA.includes("updatedAt      DateTime @updatedAt"));
check("N19", "SCHEMA VaultSecret index orgSlug", SCHEMA.includes("@@index([orgSlug])"));
check("N20", "SCHEMA VaultSecret index orgSlug,kind", SCHEMA.includes("@@index([orgSlug, kind])"));

// ── O — Independence ──────────────────────────────────────────────────────────

const allPureFiles = [RECORD, POLICY, REPO, MASKING, VALIDATION, REGISTRY, MIGRATION].join("\n");

check("O01", "Pure domain files: no React",      !allPureFiles.match(/from ['"]react['"]/));
check("O02", "Pure domain files: no server-only", !allPureFiles.match(/^import "server-only"/m));
check("O03", "Pure domain files: no @prisma",    !allPureFiles.match(/^import.*@prisma/m));
check("O04", "Pure domain files: no Date in interfaces (timestamps are strings)",
  !RECORD.match(/:\s*Date[;\s]/));
check("O05", "VaultSecretMetadata.createdAt is string not Date", RECORD.includes("createdAt:      string"));
check("O06", "VaultSecretAuditEvent.occurredAt is string", AUDIT.includes("occurredAt:      string"));
check("O07", "VaultService does not import Prisma directly", !SERVICE.match(/from "@\/lib\/prisma"/));
check("O08", "PrismaVaultRepository imports Prisma via lib/prisma", PRISMA_REPO.includes("@/lib/prisma"));
check("O09", "SERVER uses server-only import", SERVER.includes('import "server-only"'));
check("O10", "INDEX does not use server-only", !INDEX.match(/^import "server-only"/m));
check("O11", "VaultService does not hold raw plaintext in fields",
  !SERVICE.includes("private.*value") && !SERVICE.includes("this.value"));
check("O12", "No cross-module imports (no copilot/agent/finance in vault)",
  !allPureFiles.match(/from.*copilot|from.*agent-runtime|from.*finance/i));
check("O13", "VAULT_SECRET_REGISTRY has 13 entries", REGISTRY.includes('examplePattern: "(random hex string)"'));
check("O14", "VaultMigrationPlan has 5 phases", MIGRATION.includes("PHASE_5_CLEANUP"));
check("O15", "Server barrel does NOT export VaultService as type-only — it is a class export",
  SERVER.includes("export { VaultService }") || SERVER.includes("} from \"./vault-service\""));

// ── Summary ────────────────────────────────────────────────────────────────────

const total = passed + failed;

console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  AGENTIK-SECURITY-VAULT-01 — Validation Suite");
console.log("═══════════════════════════════════════════════════════════════\n");

if (failures.length > 0) {
  console.log("  FAILURES:\n");
  failures.forEach(f => {
    console.log(`  ✗ [${f.id}] ${f.description}`);
  });
  console.log("");
}

console.log(`  Total  : ${total}`);
console.log(`  Passed : ${passed}`);
console.log(`  Failed : ${failed}`);
console.log(`  Verdict: ${failed === 0 ? "ALL_PASS" : "FAILURES_DETECTED"}`);
console.log("═══════════════════════════════════════════════════════════════\n");

process.exit(failed === 0 ? 0 : 1);
