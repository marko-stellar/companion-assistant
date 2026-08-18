ALTER TABLE "conversations" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "message_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "latency_ms" integer;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "provider_meta" jsonb;