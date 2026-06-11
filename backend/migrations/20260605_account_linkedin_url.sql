ALTER TABLE accounts
    ADD COLUMN IF NOT EXISTS linkedin_url VARCHAR(500);

ALTER TABLE onboarding_drafts
    ADD COLUMN IF NOT EXISTS linkedin_url VARCHAR(500);
