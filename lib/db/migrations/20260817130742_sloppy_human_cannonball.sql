ALTER TABLE "emergency_contacts" ALTER COLUMN "is_primary" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferred_form_of_address" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "device_identifier" text;--> statement-breakpoint
ALTER TABLE "emergency_contacts" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;