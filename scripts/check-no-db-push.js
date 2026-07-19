#!/usr/bin/env node
/**
 * scripts/check-no-db-push.js
 *
 * PRISMA-GOVERNANCE-01 — Phase 3 Enforcement
 *
 * Fails CI if `prisma db push` is found in any project script, CI config,
 * or shell script. Run as a pre-commit hook or CI step.
 *
 * Usage:
 *   node scripts/check-no-db-push.js
 *
 * Exit codes:
 *   0 — no db push usage found
 *   1 — db push usage detected (blocks CI)
 */

const fs   = require("fs");
const path = require("path");

const SEARCH_PATTERN = /prisma\s+db\s+push/;

const FILES_TO_CHECK = [
  "package.json",
  "Makefile",
  "Dockerfile",
];

const DIRS_TO_CHECK = [
  ".github",
  "scripts",
  "docs",
];

const ALLOWED_FILES = new Set([
  // This file itself is allowed to reference the pattern
  path.resolve(__dirname, "check-no-db-push.js"),
  // The migration audit documents the historical problem
  path.resolve(__dirname, "../prisma/MIGRATION_AUDIT.md"),
  // The workflow doc explains what NOT to do
  path.resolve(__dirname, "../docs/PRISMA_WORKFLOW.md"),
]);

let violations = [];

function checkFile(filePath) {
  const resolved = path.resolve(filePath);
  if (ALLOWED_FILES.has(resolved)) return;

  let content;
  try {
    content = fs.readFileSync(resolved, "utf8");
  } catch {
    return; // file doesn't exist — skip
  }

  const lines = content.split("\n");
  lines.forEach((line, i) => {
    if (SEARCH_PATTERN.test(line)) {
      violations.push({ file: filePath, line: i + 1, text: line.trim() });
    }
  });
}

function checkDir(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // directory doesn't exist — skip
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      checkDir(full);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if ([".js", ".ts", ".sh", ".yml", ".yaml", ".json", ".md", ""].includes(ext)) {
        checkFile(full);
      }
    }
  }
}

// Check root-level files
for (const f of FILES_TO_CHECK) {
  checkFile(f);
}

// Check directories
for (const d of DIRS_TO_CHECK) {
  checkDir(d);
}

if (violations.length > 0) {
  console.error("\n[PRISMA-GOVERNANCE] ERROR: `prisma db push` usage detected!\n");
  console.error("db push bypasses the migration chain and causes P3006 failures.");
  console.error("Use `prisma migrate dev --name <name>` instead.\n");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  →  ${v.text}`);
  }
  console.error("\nSee docs/PRISMA_WORKFLOW.md for the correct workflow.\n");
  process.exit(1);
} else {
  console.log("[PRISMA-GOVERNANCE] OK — no prisma db push usage found.");
  process.exit(0);
}
