-- Track manual resends from admin (Phase 12)

ALTER TABLE ticket_assignments
  ADD COLUMN IF NOT EXISTS email_resend_count int NOT NULL DEFAULT 0;
