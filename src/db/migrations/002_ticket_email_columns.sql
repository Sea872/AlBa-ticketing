-- Email delivery tracking for ticket_assignments (Resend)

ALTER TABLE ticket_assignments
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_last_error text,
  ADD COLUMN IF NOT EXISTS email_provider_id text;
