CREATE TABLE "runtime_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"binding_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"runtime_instance_id" text,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "runtime_credentials" ADD CONSTRAINT "runtime_credentials_binding_id_provider_agent_bindings_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."provider_agent_bindings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_credentials_token_hash_uq" ON "runtime_credentials" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "runtime_credentials_binding_idx" ON "runtime_credentials" USING btree ("binding_id");--> statement-breakpoint
CREATE INDEX "runtime_credentials_status_idx" ON "runtime_credentials" USING btree ("status");