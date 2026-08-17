CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"companion_id" uuid,
	"tablet_pin_hash" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"setup_completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"gender" text NOT NULL,
	"tagline" text,
	"personality_config" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emergency_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"relationship" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"summary" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"audio_object_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"source_conversation_id" uuid,
	"importance" integer DEFAULT 5 NOT NULL,
	"tags" text[],
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"remind_at_utc" timestamp NOT NULL,
	"recurrence_rule" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reminder_id" uuid NOT NULL,
	"scheduled_for_utc" timestamp NOT NULL,
	"fired_at_utc" timestamp,
	"acknowledged_at" timestamp,
	"skipped" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"starts_at_utc" timestamp NOT NULL,
	"ends_at_utc" timestamp,
	"reminder_minutes_before" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dnd_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"recurrence_days" text[] DEFAULT '{}' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"metadata" jsonb,
	"occurred_at_utc" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"expected_time" text,
	"expected_days" text[] DEFAULT '{}' NOT NULL,
	"detection_window_minutes" integer DEFAULT 60 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routine_deviations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"routine_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"detected_at_utc" timestamp NOT NULL,
	"resolved_at_utc" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"filename" text,
	"content_type" text,
	"size_bytes" integer,
	"description" text,
	"conversation_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"photo_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"memory_content" text NOT NULL,
	"extracted_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safety_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid,
	"classification" text NOT NULL,
	"severity" text NOT NULL,
	"trigger_text" text,
	"sms_sent" boolean DEFAULT false NOT NULL,
	"sms_sent_at" timestamp,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"category" text,
	"language" text DEFAULT 'en' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"trust_score" integer DEFAULT 5 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_companion_id_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_contacts" ADD CONSTRAINT "emergency_contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_source_conversation_id_conversations_id_fk" FOREIGN KEY ("source_conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_occurrences" ADD CONSTRAINT "reminder_occurrences_reminder_id_reminders_id_fk" FOREIGN KEY ("reminder_id") REFERENCES "public"."reminders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dnd_periods" ADD CONSTRAINT "dnd_periods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_deviations" ADD CONSTRAINT "routine_deviations_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_deviations" ADD CONSTRAINT "routine_deviations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_memories" ADD CONSTRAINT "photo_memories_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_memories" ADD CONSTRAINT "photo_memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_events" ADD CONSTRAINT "safety_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_events" ADD CONSTRAINT "safety_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_companion_id_idx" ON "users" USING btree ("companion_id");--> statement-breakpoint
CREATE INDEX "emergency_contacts_user_id_idx" ON "emergency_contacts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conversations_user_id_idx" ON "conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conversations_started_at_idx" ON "conversations" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "conversation_messages_conversation_id_idx" ON "conversation_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_messages_created_at_idx" ON "conversation_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "memories_user_id_idx" ON "memories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memories_created_at_idx" ON "memories" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "reminders_user_id_idx" ON "reminders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reminders_remind_at_utc_idx" ON "reminders" USING btree ("remind_at_utc");--> statement-breakpoint
CREATE INDEX "reminder_occurrences_reminder_id_idx" ON "reminder_occurrences" USING btree ("reminder_id");--> statement-breakpoint
CREATE INDEX "reminder_occurrences_scheduled_for_utc_idx" ON "reminder_occurrences" USING btree ("scheduled_for_utc");--> statement-breakpoint
CREATE INDEX "appointments_user_id_idx" ON "appointments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "appointments_starts_at_utc_idx" ON "appointments" USING btree ("starts_at_utc");--> statement-breakpoint
CREATE INDEX "dnd_periods_user_id_idx" ON "dnd_periods" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_events_user_id_idx" ON "activity_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_events_occurred_at_utc_idx" ON "activity_events" USING btree ("occurred_at_utc");--> statement-breakpoint
CREATE INDEX "activity_events_event_type_idx" ON "activity_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "routines_user_id_idx" ON "routines" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "routine_deviations_routine_id_idx" ON "routine_deviations" USING btree ("routine_id");--> statement-breakpoint
CREATE INDEX "routine_deviations_user_id_idx" ON "routine_deviations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "routine_deviations_detected_at_utc_idx" ON "routine_deviations" USING btree ("detected_at_utc");--> statement-breakpoint
CREATE INDEX "photos_user_id_idx" ON "photos" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "photos_created_at_idx" ON "photos" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "photo_memories_photo_id_idx" ON "photo_memories" USING btree ("photo_id");--> statement-breakpoint
CREATE INDEX "photo_memories_user_id_idx" ON "photo_memories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "safety_events_user_id_idx" ON "safety_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "safety_events_created_at_idx" ON "safety_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "safety_events_severity_idx" ON "safety_events" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_id_idx" ON "audit_logs" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");