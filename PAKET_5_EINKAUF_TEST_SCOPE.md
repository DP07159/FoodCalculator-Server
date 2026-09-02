# Paket 5 · Einkauf + Test-Scope-Härtung
Stand: 02.09.2026

## Umgesetzt
- Eine gemeinsame Einkaufsliste je Workspace.
- Manuelle Einträge und Bedarfsübernahme aus Rezepten bzw. Food Moments.
- Aggregation gleicher Zutaten nach kanonischem Namen und Einheit.
- Herkunft bleibt pro aggregiertem Bedarf einsehbar.
- Wiederholter Import derselben Quelle aktualisiert statt zu duplizieren.
- Mobile-first Abhak-UX; Erledigtes wandert in einen eigenen Bereich und kann zurückgeholt werden.
- Bewusste Aktion „Erledigte entfernen“.
- Rezeptdetail: Zutaten für die aktuell angezeigte Portionszahl zur Einkaufsliste übernehmen.
- Food-Moment-Detail: Bedarfe aus verknüpften Rezepten zur Einkaufsliste übernehmen.
- Home: „Was muss ich einkaufen?“ führt in das neue Einkaufsmodul.
- Inventar aus Modulregistry, Navigation und Home für Testphase 1 ausgeblendet.
- Sichtbare Inventar-Bestandsprüfung in der Rezeptansicht für Testphase 1 entfernt.

## Bewusst nicht umgesetzt
- Automatische Inventaraktualisierung beim Abhaken.
- Einkauf abschließen / Einkaufshistorie.
- Inventar-Löschung: Code und Daten bleiben für Testphase 2 erhalten.
- KI- oder Recommendation-Logik.

## Datenmodell
Migration 0016 führt `shopping_list_entries` ein. Einzelne Herkunftsbedarfe werden gespeichert; die API aggregiert sie für die Nutzeransicht. Dadurch bleibt Herkunft nachvollziehbar, ohne mehrere sichtbare Listen je Food Moment/Rezept zu erzeugen.
