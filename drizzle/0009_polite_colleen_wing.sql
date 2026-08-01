ALTER TABLE "agent_enrollments" ADD COLUMN "runtime_instance_id" text;--> statement-breakpoint

-- Preserve every known runtime namespace. Legacy bindings that never reported
-- one receive an explicit, stable compatibility namespace derived from their
-- immutable binding UUID; we do not guess which external Gateway they belong to.
UPDATE "provider_agent_bindings"
SET "runtime_instance_id" = 'legacy:binding:' || "id"::text
WHERE "runtime_instance_id" IS NULL OR btrim("runtime_instance_id") = '';--> statement-breakpoint

-- The former two-column unique index guarantees this join resolves to at most
-- one binding. Enrollment rows without a binding receive their own explicit
-- compatibility namespace and cannot collide with an external runtime.
UPDATE "agent_enrollments" AS enrollment
SET "runtime_instance_id" = binding."runtime_instance_id"
FROM "provider_agent_bindings" AS binding
WHERE enrollment."runtime_instance_id" IS NULL
  AND enrollment."provider" = binding."provider"
  AND enrollment."native_agent_id" = binding."native_agent_id";--> statement-breakpoint

UPDATE "agent_enrollments"
SET "runtime_instance_id" = 'legacy:enrollment:' || "id"::text
WHERE "runtime_instance_id" IS NULL
  AND "provider" IS NOT NULL
  AND "native_agent_id" IS NOT NULL;--> statement-breakpoint

UPDATE "runtime_credentials" AS credential
SET "runtime_instance_id" = binding."runtime_instance_id"
FROM "provider_agent_bindings" AS binding
WHERE credential."binding_id" = binding."id"
  AND credential."runtime_instance_id" IS DISTINCT FROM binding."runtime_instance_id";--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "provider_agent_bindings"
    WHERE "runtime_instance_id" IS NULL OR btrim("runtime_instance_id") = ''
  ) THEN
    RAISE EXCEPTION 'runtime identity migration left an empty binding namespace';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "runtime_credentials" AS credential
    JOIN "provider_agent_bindings" AS binding
      ON binding."id" = credential."binding_id"
    WHERE credential."runtime_instance_id" IS NULL
       OR credential."runtime_instance_id" <> binding."runtime_instance_id"
  ) THEN
    RAISE EXCEPTION 'runtime identity migration left a mismatched credential namespace';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "agent_enrollments"
    WHERE "status" IN ('pending_parent_confirmation', 'active', 'suspended')
      AND (
        "provider" IS NULL
        OR "runtime_instance_id" IS NULL
        OR "native_agent_id" IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'runtime identity migration left a claimed enrollment incomplete';
  END IF;
END $$;--> statement-breakpoint

DROP INDEX "agent_enrollments_provider_native_idx";--> statement-breakpoint
DROP INDEX "provider_agent_bindings_native_uq";--> statement-breakpoint
ALTER TABLE "provider_agent_bindings" ALTER COLUMN "runtime_instance_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "runtime_credentials" ALTER COLUMN "runtime_instance_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "agent_enrollments_runtime_identity_idx" ON "agent_enrollments" USING btree ("provider","runtime_instance_id","native_agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_agent_bindings_runtime_identity_uq" ON "provider_agent_bindings" USING btree ("provider","runtime_instance_id","native_agent_id");
