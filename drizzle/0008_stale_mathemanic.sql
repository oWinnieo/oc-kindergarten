CREATE TABLE "agent_moment_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"moment_id" uuid NOT NULL,
	"source_event_log_id" bigint,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"title_snapshot" text NOT NULL,
	"detail_snapshot" text NOT NULL,
	"occurred_at_snapshot" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_moment_items_position_check" CHECK ("agent_moment_items"."position" IN (1, 2)),
	CONSTRAINT "agent_moment_items_kind_check" CHECK ("agent_moment_items"."kind" IN ('task', 'command', 'completion', 'error', 'reply')),
	CONSTRAINT "agent_moment_items_title_length_check" CHECK (char_length("agent_moment_items"."title_snapshot") BETWEEN 1 AND 80),
	CONSTRAINT "agent_moment_items_detail_length_check" CHECK (char_length("agent_moment_items"."detail_snapshot") BETWEEN 1 AND 280)
);
--> statement-breakpoint
CREATE TABLE "agent_moments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"agent_id" text NOT NULL,
	"share_slug" text,
	"title" text NOT NULL,
	"owner_caption" text,
	"template" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_moments_title_length_check" CHECK (char_length("agent_moments"."title") BETWEEN 1 AND 80),
	CONSTRAINT "agent_moments_owner_caption_length_check" CHECK ("agent_moments"."owner_caption" IS NULL OR char_length("agent_moments"."owner_caption") <= 280),
	CONSTRAINT "agent_moments_template_check" CHECK ("agent_moments"."template" IN ('daily', 'quote', 'progress', 'achievement', 'recovery')),
	CONSTRAINT "agent_moments_visibility_check" CHECK ("agent_moments"."visibility" IN ('private', 'unlisted', 'public')),
	CONSTRAINT "agent_moments_status_check" CHECK ("agent_moments"."status" IN ('draft', 'published', 'revoked')),
	CONSTRAINT "agent_moments_share_slug_length_check" CHECK ("agent_moments"."share_slug" IS NULL OR char_length("agent_moments"."share_slug") = 32),
	CONSTRAINT "agent_moments_published_fields_check" CHECK ("agent_moments"."status" <> 'published' OR ("agent_moments"."share_slug" IS NOT NULL AND "agent_moments"."published_at" IS NOT NULL AND "agent_moments"."visibility" IN ('unlisted', 'public'))),
	CONSTRAINT "agent_moments_revoked_fields_check" CHECK ("agent_moments"."status" <> 'revoked' OR "agent_moments"."revoked_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "agent_share_settings" (
	"agent_id" text PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"profile_visibility" text DEFAULT 'private' NOT NULL,
	"allow_reply_excerpt" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_share_settings_profile_visibility_check" CHECK ("agent_share_settings"."profile_visibility" IN ('private', 'public'))
);
--> statement-breakpoint
ALTER TABLE "agent_moment_items" ADD CONSTRAINT "agent_moment_items_moment_id_agent_moments_id_fk" FOREIGN KEY ("moment_id") REFERENCES "public"."agent_moments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_moment_items" ADD CONSTRAINT "agent_moment_items_source_event_log_id_agent_event_log_id_fk" FOREIGN KEY ("source_event_log_id") REFERENCES "public"."agent_event_log"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_moments" ADD CONSTRAINT "agent_moments_owner_id_parent_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."parent_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_moments" ADD CONSTRAINT "agent_moments_agent_id_agent_profiles_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_profiles"("agent_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_share_settings" ADD CONSTRAINT "agent_share_settings_agent_id_agent_profiles_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_profiles"("agent_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_share_settings" ADD CONSTRAINT "agent_share_settings_owner_id_parent_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."parent_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_moment_items_position_uq" ON "agent_moment_items" USING btree ("moment_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_moment_items_source_event_uq" ON "agent_moment_items" USING btree ("moment_id","source_event_log_id");--> statement-breakpoint
CREATE INDEX "agent_moment_items_moment_idx" ON "agent_moment_items" USING btree ("moment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_moments_share_slug_uq" ON "agent_moments" USING btree ("share_slug");--> statement-breakpoint
CREATE INDEX "agent_moments_owner_created_idx" ON "agent_moments" USING btree ("owner_id","created_at","id");--> statement-breakpoint
CREATE INDEX "agent_moments_agent_created_idx" ON "agent_moments" USING btree ("agent_id","created_at","id");--> statement-breakpoint
CREATE INDEX "agent_moments_public_feed_idx" ON "agent_moments" USING btree ("status","visibility","published_at","id");--> statement-breakpoint
CREATE INDEX "agent_share_settings_owner_idx" ON "agent_share_settings" USING btree ("owner_id");