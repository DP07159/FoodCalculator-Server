# Sprint 9 – Food Moment Wallet MVP

## Umgesetzt
- Navigation: `Home` bleibt durch null-sichere Sortierung (`order: 0`) verbindlich an erster Stelle.
- Neues Capability Module `Wallet` in der zentralen Module Registry.
- Neuer Screen `wallet.html` mit Capture und Library.
- Capture: Link, optionaler Titel, optionale Notiz.
- Status: gemerkt, verwendet, archiviert.
- Quellen werden serverseitig u. a. als Instagram, TikTok, YouTube oder Pinterest erkannt.
- PWA `share_target`: Auf unterstützten Geräten können Links direkt an die Wallet geteilt und vorausgefüllt werden.
- Mobile Bottom Navigation bleibt bewusst auf vier primäre Ziele fokussiert; Wallet ist zusätzlich über Burger-Menü und Home-Action erreichbar.
- Service-Worker Cache auf Sprint 9 angehoben.

## Bewusst noch nicht umgesetzt
- Kein Scraping oder Kopieren kompletter Social-Media-Inhalte.
- Keine automatische Rezept-Extraktion.
- Noch keine Food-Moment-Erzeugung aus Wallet-Einträgen.
- `wallet_item_relations` ist als saubere Architekturgrundlage bereits vorhanden, die Conversion-/Connect-Flows folgen separat.
