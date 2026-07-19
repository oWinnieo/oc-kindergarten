ALTER TABLE "provider_agent_bindings" ADD COLUMN "adapter_version" text;--> statement-breakpoint
ALTER TABLE "provider_agent_bindings" ADD COLUMN "discovery_draft" jsonb;--> statement-breakpoint
ALTER TABLE "provider_agent_bindings" ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
INSERT INTO "provider_agent_bindings" (
	"provider", "native_agent_id", "agent_id", "status", "adapter_version"
) VALUES (
	'openclaw', 'main', 'agent-scout', 'active', 'bridge-v1-migration'
)
ON CONFLICT ("provider", "native_agent_id") DO UPDATE SET
	"agent_id" = EXCLUDED."agent_id",
	"status" = 'active',
	"adapter_version" = EXCLUDED."adapter_version",
	"updated_at" = now(),
	"last_seen_at" = now();
