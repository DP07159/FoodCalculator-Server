# Paket 2 – Planung 2.0: Woche + Kalender

- Konkrete Wochenplanung wird als `food_moments` mit `source_code=planning_slot` persistiert.
- Slot-Identität: `planning_slot|YYYY-MM-DD|meal_type`.
- Neue Endpunkte: `GET /planning/week`, `PUT/DELETE /planning/slot`, `POST /meal_plans/:id/apply`.
- `meal_plans` bleiben Wochenvorlagen; beim Anwenden werden konkrete Food Moments erzeugt/aktualisiert.
- Keine neue Datenbankmigration nötig; Paket 2 nutzt das in Migration 0015 geschaffene Zeitmodell.
