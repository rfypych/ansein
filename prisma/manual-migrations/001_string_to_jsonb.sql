-- Manual migration: String (TEXT) JSON blobs -> native JSONB.
-- All application code writes valid JSON to these columns, so the USING
-- cast is safe. Postgres cannot auto-cast the old TEXT defaults, hence the
-- DROP DEFAULT / SET DEFAULT dance per column. Each statement is atomic and
-- re-runnable (casting jsonb to jsonb is a no-op; defaults are idempotent).
-- Run with: node apply-jsonb.cjs <env-file> prisma/manual-migrations/001_string_to_jsonb.sql
-- Applied to Neon dev + prod on 2026-09-16.

ALTER TABLE "investigations" ALTER COLUMN "tags" DROP DEFAULT;
ALTER TABLE "investigations" ALTER COLUMN "tags" TYPE JSONB USING "tags"::jsonb;
ALTER TABLE "investigations" ALTER COLUMN "tags" SET DEFAULT '[]'::jsonb;

ALTER TABLE "entities" ALTER COLUMN "enrichment" DROP DEFAULT;
ALTER TABLE "entities" ALTER COLUMN "enrichment" TYPE JSONB USING "enrichment"::jsonb;
ALTER TABLE "entities" ALTER COLUMN "enrichment" SET DEFAULT '{}'::jsonb;

ALTER TABLE "analysis_runs" ALTER COLUMN "actor_hypothesis" DROP DEFAULT;
ALTER TABLE "analysis_runs" ALTER COLUMN "actor_hypothesis" TYPE JSONB USING "actor_hypothesis"::jsonb;
ALTER TABLE "analysis_runs" ALTER COLUMN "actor_hypothesis" SET DEFAULT '{}'::jsonb;

ALTER TABLE "analysis_runs" ALTER COLUMN "recommendations" DROP DEFAULT;
ALTER TABLE "analysis_runs" ALTER COLUMN "recommendations" TYPE JSONB USING "recommendations"::jsonb;
ALTER TABLE "analysis_runs" ALTER COLUMN "recommendations" SET DEFAULT '[]'::jsonb;

ALTER TABLE "analysis_runs" ALTER COLUMN "hypotheses" DROP DEFAULT;
ALTER TABLE "analysis_runs" ALTER COLUMN "hypotheses" TYPE JSONB USING "hypotheses"::jsonb;
ALTER TABLE "analysis_runs" ALTER COLUMN "hypotheses" SET DEFAULT '[]'::jsonb;

ALTER TABLE "chat_messages" ALTER COLUMN "citations" DROP DEFAULT;
ALTER TABLE "chat_messages" ALTER COLUMN "citations" TYPE JSONB USING "citations"::jsonb;
ALTER TABLE "chat_messages" ALTER COLUMN "citations" SET DEFAULT '[]'::jsonb;

ALTER TABLE "audit_logs" ALTER COLUMN "extra_metadata" DROP DEFAULT;
ALTER TABLE "audit_logs" ALTER COLUMN "extra_metadata" TYPE JSONB USING "extra_metadata"::jsonb;
ALTER TABLE "audit_logs" ALTER COLUMN "extra_metadata" SET DEFAULT '{}'::jsonb;

ALTER TABLE "playbooks" ALTER COLUMN "actions" DROP DEFAULT;
ALTER TABLE "playbooks" ALTER COLUMN "actions" TYPE JSONB USING "actions"::jsonb;
ALTER TABLE "playbooks" ALTER COLUMN "actions" SET DEFAULT '[]'::jsonb;
