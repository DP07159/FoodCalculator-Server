-- Wallet visual capture extension. Additive only; preserves repaired 0008/0009 history.
ALTER TABLE wallet_items ADD COLUMN source_image_url TEXT;
ALTER TABLE wallet_items ADD COLUMN source_page_title TEXT;
CREATE INDEX IF NOT EXISTS idx_wallet_items_workspace_source_platform
    ON wallet_items(workspace_id, source_platform);
INSERT INTO platform_system_state (state_key, state_value, updated_at)
VALUES ('migration_phase', '10-wallet-visual-capture', CURRENT_TIMESTAMP)
ON CONFLICT(state_key)
DO UPDATE SET state_value = excluded.state_value, updated_at = CURRENT_TIMESTAMP;
