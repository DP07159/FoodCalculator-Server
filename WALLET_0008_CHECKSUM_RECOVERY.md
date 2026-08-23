# Wallet 0008 Checksum Recovery

## Ausgangslage

Migration `0008_food_moment_wallet.sql` wurde auf der produktiven Render-Datenbank nach einem ersten Hotfix erfolgreich angewendet und damit einschließlich SHA-256-Prüfsumme in `schema_migrations` gespeichert.

Danach wurde dieselbe Datei nochmals zur „Clean Baseline“-Variante geändert. Der Migration Runner hat diese nachträgliche Änderung korrekt erkannt und den Start mit `Migration 0008 wurde nachträglich verändert` abgebrochen.

## Reparatur

- `0008` wird **nicht erneut ausgeführt** und der in der Datenbank gespeicherte historische Checksum wird **nicht überschrieben**.
- `0009_wallet_clean_baseline.sql` enthält den gewünschten Cleanup der verworfenen Wallet-Experimenttabellen und legt ausschließlich das aktuelle Wallet-MVP-Schema neu an.
- `0009` deklariert mit `-- @supersedes-checksum 0008` ausdrücklich, dass sie die bekannte Checksum-Abweichung von `0008` repariert.
- Der Migration Runner toleriert eine Checksum-Abweichung nur dann, wenn eine **spätere** Migration sie explizit per `@supersedes-checksum` übernimmt. Alle anderen nachträglich veränderten Migrationen bleiben weiterhin harte Fehler.

## Erwartetes Render-Log beim ersten Deployment

Sinngemäß:

```text
Migration 0008 hat eine abweichende Prüfsumme; 0009_wallet_clean_baseline.sql übernimmt die explizite Reparatur. Historische Prüfsumme bleibt unverändert.
Migrationen angewendet: 0009_wallet_clean_baseline.sql
Food Calculator API läuft auf Port 10000
SQLite verbunden: /var/data/food_calculator.sqlite
```

Bei weiteren Starts bleibt die historische 0008-Prüfsumme unverändert; `0009` ist dann bereits angewendet und wird nicht erneut ausgeführt.

## Datenwirkung

Destruktiv entfernt werden nur die verworfenen Wallet-Experimenttabellen:

- `wallet_item_relations`
- `wallet_items`

Danach werden beide Tabellen im aktuellen Wallet-MVP-Schema neu angelegt. Andere Plattform-, Benutzer-, Workspace-, Rezept-, Inventar- oder Wochenplandaten werden nicht gelöscht.
