# Prisma Migration Workflow

**PRISMA-GOVERNANCE-01 — Phase 4**

---

## The Rule

**Never use `prisma db push` on a shared or production database.**

`db push` writes schema changes directly to the database without creating a migration file.
This breaks the Prisma shadow database, which replays all migrations from scratch during
`migrate dev` and `migrate deploy` validation. The result is **P3006 / P1014 failures**
that block all future deployments.

---

## Correct Workflow

### Adding a new model or modifying schema

```bash
# 1. Edit prisma/schema.prisma

# 2. Create the migration
npx prisma migrate dev --name <descriptive_name>
# Example: npx prisma migrate dev --name add_product_entity

# 3. Verify
npx prisma migrate status       # must show "Database schema is up to date!"
npx prisma validate             # must show "The schema is valid"
npx prisma generate             # regenerate the client
```

### Deploying to production (Neon)

```bash
npx prisma migrate deploy
```

This applies any pending migrations in order. Never run `db push` against Neon.

### Checking migration health

```bash
npx prisma migrate status
```

Expected output: `Database schema is up to date!`

If you see pending migrations, apply them with `migrate deploy` (production) or
`migrate dev` (local).

---

## Backfill Pattern (for db push orphans)

If a table was already deployed via `db push` and needs a migration file added retroactively:

1. Create the migration directory with a timestamp BEFORE the first migration that ALTERs
   the orphaned table:
   ```
   prisma/migrations/20260406000000_my_backfill/migration.sql
   ```

2. Write idempotent SQL using `IF NOT EXISTS` and `DO $$ BEGIN ... EXCEPTION WHEN
   duplicate_object THEN NULL; END $$;` guards.

3. Register it as already applied (does NOT run the SQL against the real DB):
   ```bash
   npx prisma migrate resolve --applied 20260406000000_my_backfill
   ```

4. Verify:
   ```bash
   npx prisma migrate status   # must show "Database schema is up to date!"
   ```

---

## What `prisma db push` is for

`db push` is only appropriate for:
- **Local throwaway databases** during initial prototyping
- **Exploring schema ideas** before committing to a migration

It is **never** appropriate for:
- Neon (production or staging)
- Any shared database
- Any database that will be used with `migrate deploy`

---

## Enforcement

`scripts/check-no-db-push.js` scans for `prisma db push` references in scripts and CI config.
Run it before merging:

```bash
node scripts/check-no-db-push.js
```

---

## Historical incident

Between MS-04 and MS-12, 23 models and 8 enums were deployed to Neon via `db push`
without migration files. This caused a P3006 failure on `20260505000000_payment_document_type`.

All orphans were remediated in **PRISMA-GOVERNANCE-01** (2026-05-18) via 7 backfill
migrations with `IF NOT EXISTS` guards + `migrate resolve --applied`.

See `prisma/MIGRATION_AUDIT.md` for the full audit report.

---

## Quick reference

| Task | Command |
|------|---------|
| Create migration | `npx prisma migrate dev --name <name>` |
| Deploy to production | `npx prisma migrate deploy` |
| Check status | `npx prisma migrate status` |
| Validate schema | `npx prisma validate` |
| Regenerate client | `npx prisma generate` |
| Register backfill | `npx prisma migrate resolve --applied <name>` |
| Check enforcement | `node scripts/check-no-db-push.js` |
