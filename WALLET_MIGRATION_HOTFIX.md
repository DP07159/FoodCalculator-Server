# Wallet Migration Hotfix

Render-Fehler: `Migration 0008_food_moment_wallet.sql fehlgeschlagen: SQLITE_ERROR: no such column: workspace_id`.

## Ursache

`CREATE TABLE IF NOT EXISTS wallet_items (...)` ist bei einer bereits vorhandenen Tabelle ein No-op. Existierte auf der produktiven Datenbank bereits eine ältere/experimentelle `wallet_items`-Tabelle ohne `workspace_id`, lief die Migration anschließend beim Index `idx_wallet_items_workspace_saved` in den Fehler.

## Fix

Migration 0008 nutzt jetzt die bereits vom Migration Runner unterstützten `@ensure-column`-Direktiven und ergänzt fehlende Wallet-Spalten vor Index-/Trigger-Erstellung. Legacy-Zeilen erhalten technische Defaults, aber ausdrücklich **keine automatisch erfundene Workspace-Zuordnung**. Für neue/aktualisierte Wallet-Einträge erzwingen Trigger die V2-Regeln.

Da Migration 0008 laut Render-Log fehlgeschlagen ist, wurde sie vom Runner nicht in `schema_migrations` eingetragen; die korrigierte 0008 darf daher beim nächsten Start erneut ausgeführt werden.
