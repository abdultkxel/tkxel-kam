-- Store raw/detailed AI KYC provider and research output for review.

ALTER TABLE kyc_agent_runs
  ADD COLUMN IF NOT EXISTS detailed_description TEXT NOT NULL DEFAULT '';

ALTER TABLE kyc_drafts
  ADD COLUMN IF NOT EXISTS detailed_description TEXT NOT NULL DEFAULT '';

ALTER TABLE kyc_snapshots
  ADD COLUMN IF NOT EXISTS detailed_description TEXT NOT NULL DEFAULT '';
