CREATE TABLE "agent_action_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_parent_user_id" uuid,
	"action" text NOT NULL,
	"status" text DEFAULT 'accepted' NOT NULL,
	"event_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_action_commands_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "agent_action_commands_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "agent_action_commands" ADD CONSTRAINT "agent_action_commands_agent_id_agent_profiles_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_profiles"("agent_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_action_commands" ADD CONSTRAINT "agent_action_commands_actor_parent_user_id_parent_users_id_fk" FOREIGN KEY ("actor_parent_user_id") REFERENCES "public"."parent_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_action_commands_agent_created_idx" ON "agent_action_commands" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_action_commands_parent_idx" ON "agent_action_commands" USING btree ("actor_parent_user_id");