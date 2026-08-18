-- Make reminder_minutes_before nullable and drop the default of 30.
-- NULL means "no pre-alert configured".
-- Existing rows with value 30 (the old default) keep their value;
-- new appointments created without an explicit reminder will have NULL.
ALTER TABLE "appointments" ALTER COLUMN "reminder_minutes_before" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ALTER COLUMN "reminder_minutes_before" DROP DEFAULT;
