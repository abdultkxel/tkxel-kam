-- Add field-level confidence to source citations for SOW/charter review and KYC evidence.
-- Local development initializes through SQLAlchemy create_all; apply this script for
-- persistent PostgreSQL environments that do not recreate metadata.

ALTER TABLE source_citations
  ADD COLUMN IF NOT EXISTS confidence INTEGER NOT NULL DEFAULT 75;

UPDATE source_citations
SET confidence = 75
WHERE confidence IS NULL;
