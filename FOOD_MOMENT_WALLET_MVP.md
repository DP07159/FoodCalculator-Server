# Food Moment Wallet – MVP

## Fachliche Trennung

- **Wallet-Eintrag:** Inspiration. Niemals automatisch ein Rezept.
- **Rezept:** strukturierte Zubereitungsinformation. Kann später aus einer Inspiration erstellt werden, ist aber ein eigenes Objekt.
- **Food Moment:** konkrete Nutzung im Kontext. Im MVP entsteht ein Food Moment dadurch, dass ein Rezept oder Wallet-Eintrag einem Wochenplan-Slot zugeordnet wird.

## Neu im Backend

Tabelle `wallet_items` mit Titel, Quelle, Plattform, Notiz, Status und Zeitstempeln.

API:
- `GET /wallet`
- `GET /wallet/:id`
- `POST /wallet`
- `PATCH /wallet/:id`
- `DELETE /wallet/:id`

## Neu im Frontend

- `wallet.html` / `wallet.js`: Inspirations-Inbox mit Link, Titel und optionaler Notiz.
- Automatische grobe Erkennung von Instagram, TikTok, Pinterest, YouTube und Web-Links.
- Aktion **„Zum Food Moment machen“** führt zum Wochenplan und lässt Tag + Mahlzeit wählen.
- Wochenplan-Slots unterstützen jetzt typisierte Inhalte (`recipe:<id>` oder `wallet:<id>`).
- Bestehende Pläne mit alter `recipeId` bleiben lesbar.
- Wallet-Einträge werden nicht als Rezeptkalorien gerechnet und tragen nicht zur Einkaufsliste bei.
- PWA-Manifest enthält einen `share_target`, sodass geteilte Links/Text in `wallet.html` vorbefüllt werden können.

## Deployment

Backend zuerst deployen, damit `/wallet` verfügbar ist. Danach Frontend deployen. Der Service-Worker-Cache wurde auf `food-calculator-v11` angehoben.
