ALTER TABLE "agent_latest_states" ADD COLUMN "presence_log_id" bigint;--> statement-breakpoint
ALTER TABLE "agent_latest_states" ADD COLUMN "presence_payload" jsonb;--> statement-breakpoint
ALTER TABLE "agent_latest_states" ADD COLUMN "state_log_id" bigint;--> statement-breakpoint
ALTER TABLE "agent_latest_states" ADD COLUMN "state_payload" jsonb;