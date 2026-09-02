# Paket 1 – Food Moment Core & Zeitmodell

Stand: 2026-09-02

## Ziel
Food Moment wird technisch zur zentralen zeitbezogenen Entität. Das Paket bleibt abwärtskompatibel mit bestehenden Clients und bereitet Paket 2 (Woche + Kalender) vor.

## Änderungen
- Migration `0015_food_moment_central_time_model.sql`
- Zentrales Zeitmodell: `starts_at`, `ends_at`, `is_all_day`
- Bestehende `moment_date` / `moment_time` bleiben erhalten und werden synchron bedient.
- Herkunft: `source_code`, `source_reference`
- Wiederholungshistorie: `repeated_from_food_moment_id`
- Bestehende Wochenpläne werden semantisch als `plan_kind = template` markiert; ihre Daten bleiben unverändert.
- Food-Moment-API akzeptiert altes und neues Zeitformat.
- `GET /food-moments` unterstützt `view=open|upcoming|past` sowie `from` / `to` für Kalender-Zeitfenster.
- `POST /food-moments/:publicId/repeat` erzeugt einen neuen, standardmäßig offenen Food Moment und übernimmt Rezept-/Wallet-Verbindungen.
- Response enthält `repeated_from` und einen booleschen `is_all_day`-Wert.

## Quellen für `source_code`
`manual`, `home`, `recipe`, `wallet`, `planning_slot`, `repeat`, `import`.

## Bewusste Grenze dieses Pakets
Das Belegen eines Wochen-Slots erzeugt noch nicht automatisch Food Moments. Das ist Paket 2. Paket 1 stellt dafür das Datenmodell und die APIs bereit, ohne die vorhandene Wochenplan-UX zu destabilisieren.
