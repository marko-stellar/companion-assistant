-- Conversational safety escalation: extend safety_events with category,
-- confidence, reasoning, source, alert/delivery state and bounded retry
-- accounting. Idempotent so already-patched dev DBs re-apply cleanly.
ALTER TABLE "safety_events" ADD COLUMN IF NOT EXISTS "category" text NOT NULL DEFAULT 'OTHER_URGENT';--> statement-breakpoint
ALTER TABLE "safety_events" ADD COLUMN IF NOT EXISTS "confidence" real;--> statement-breakpoint
ALTER TABLE "safety_events" ADD COLUMN IF NOT EXISTS "reasoning" text;--> statement-breakpoint
ALTER TABLE "safety_events" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'CONVERSATION';--> statement-breakpoint
ALTER TABLE "safety_events" ADD COLUMN IF NOT EXISTS "alert_status" text NOT NULL DEFAULT 'NONE';--> statement-breakpoint
ALTER TABLE "safety_events" ADD COLUMN IF NOT EXISTS "recipient_name" text;--> statement-breakpoint
ALTER TABLE "safety_events" ADD COLUMN IF NOT EXISTS "recipient_phone" text;--> statement-breakpoint
ALTER TABLE "safety_events" ADD COLUMN IF NOT EXISTS "provider_message_id" text;--> statement-breakpoint
ALTER TABLE "safety_events" ADD COLUMN IF NOT EXISTS "provider_error" text;--> statement-breakpoint
ALTER TABLE "safety_events" ADD COLUMN IF NOT EXISTS "sms_attempts" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "safety_events" ADD COLUMN IF NOT EXISTS "last_attempt_at" timestamp;
