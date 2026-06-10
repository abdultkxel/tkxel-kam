ALTER TABLE accounts
    ADD COLUMN IF NOT EXISTS account_number INTEGER;

WITH numbered_accounts AS (
    SELECT
        id,
        COALESCE((SELECT MAX(account_number) FROM accounts), 100000)
            + ROW_NUMBER() OVER (ORDER BY created_at NULLS LAST, name, id) AS generated_account_number
    FROM accounts
    WHERE account_number IS NULL
)
UPDATE accounts
SET account_number = numbered_accounts.generated_account_number
FROM numbered_accounts
WHERE accounts.id = numbered_accounts.id;

CREATE UNIQUE INDEX IF NOT EXISTS ix_accounts_account_number
    ON accounts(account_number);
