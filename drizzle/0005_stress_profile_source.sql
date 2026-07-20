ALTER TABLE "agent_profiles" ADD COLUMN "source" text DEFAULT 'runtime' NOT NULL;--> statement-breakpoint
CREATE INDEX "agent_profiles_source_idx" ON "agent_profiles" USING btree ("source");