CREATE TABLE "beta_participants" (
	"parent_user_id" uuid PRIMARY KEY NOT NULL,
	"cohort" text NOT NULL,
	"migration_eligible" boolean DEFAULT false NOT NULL,
	"notice_version" text NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "beta_participants_cohort_length" CHECK (char_length("beta_participants"."cohort") BETWEEN 3 AND 64),
	CONSTRAINT "beta_participants_notice_version_length" CHECK (char_length("beta_participants"."notice_version") BETWEEN 3 AND 64),
	CONSTRAINT "beta_participants_ack_required_when_eligible" CHECK (NOT "beta_participants"."migration_eligible" OR "beta_participants"."acknowledged_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "beta_participants" ADD CONSTRAINT "beta_participants_parent_user_id_parent_users_id_fk" FOREIGN KEY ("parent_user_id") REFERENCES "public"."parent_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "beta_participants_cohort_eligible_idx" ON "beta_participants" USING btree ("cohort","migration_eligible");