ALTER TABLE "agent_enrollments" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "agent_enrollments" ADD COLUMN "native_agent_id" text;--> statement-breakpoint
CREATE INDEX "agent_enrollments_provider_native_idx" ON "agent_enrollments" USING btree ("provider","native_agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_enrollments_pairing_hash_uq" ON "agent_enrollments" USING btree ("pairing_code_hash");