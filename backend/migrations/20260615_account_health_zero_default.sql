ALTER TABLE accounts
    ALTER COLUMN health_overall SET DEFAULT 0,
    ALTER COLUMN health_relationship SET DEFAULT 0,
    ALTER COLUMN health_usage SET DEFAULT 0,
    ALTER COLUMN health_delivery SET DEFAULT 0,
    ALTER COLUMN health_commercial SET DEFAULT 0;

UPDATE accounts
SET
    health_overall = 0,
    health_relationship = 0,
    health_usage = 0,
    health_delivery = 0,
    health_commercial = 0
WHERE created_from_draft_id IS NOT NULL
  AND health_overall = 45
  AND health_relationship = 45
  AND health_usage = 45
  AND health_delivery = 45
  AND health_commercial = 45
  AND NOT EXISTS (
      SELECT 1
      FROM score_snapshots
      WHERE score_snapshots.account_id = accounts.id
        AND score_snapshots.scope = 'account'
  );
