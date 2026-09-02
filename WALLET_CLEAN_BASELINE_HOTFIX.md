# Wallet Clean Baseline Hotfix

## Zweck
Die vor Sprint 9 vorhandenen Wallet-Tabellen stammen aus einem verworfenen Experiment und werden nicht migriert.

## Änderung
Migration `0008_food_moment_wallet.sql` entfernt vor der Neuanlage ausschließlich:

- `wallet_item_relations`
- `wallet_items`

Anschließend wird nur das aktuelle Wallet-MVP-Schema neu angelegt.

## Bewusst entfernt
- Legacy-Spaltenkompatibilität
- `@ensure-column`-Sonderbehandlung für Wallet-Altstrukturen
- zusätzliche Guard-Trigger für unvollständige Legacy-Tabellen
- experimentelle Wallet-Daten

## Beibehalten
- `wallet_items`
- `wallet_item_relations`
- Workspace-Isolation
- User-Referenz
- Status `saved`, `used`, `archived`
- Quellen-/Social-Metadaten
- Relation zu Recipe, Food Moment und Meal-Plan-Eintrag
- Registrierung des Moduls `wallet`

Andere Plattformtabellen und Fachdaten werden von diesem Cleanup nicht gelöscht.
