Food Moment Platform – Server Delta 2026-09-10

Dieses Paket enthält nur geänderte Server-Dateien. Dateien im Zielprojekt mit gleichem Pfad ersetzen.

Enthaltene Änderungen:
- Food-Moment-Link-Synchronisation aktualisiert nur den tatsächlich gesendeten Link-Typ
- neuer Endpoint POST /shopping-list/import/week
- Wochenplan->Einkauf ist idempotent/synchronisierend statt additiv
- Einkaufslistenquellen liefern Rezept-/Food-Moment-Referenzen für klickbare Herkunft

Keine Datenbankdatei und keine neue Migration erforderlich.
