Food Moment – Debug/UX Fixes R2 – Server Delta – 10.09.2026

Diese ZIP enthält nur die geänderte Serverdatei. Datei am identischen Pfad ersetzen:
src/modules/foodMoments/routes.js

Neu:
- atomare PUT-Route /food-moments/recipe/:recipeId/links
- synchronisiert Rezept↔große-Food-Moment-Verknüpfungen zuverlässig
- schließt recipe/planning_slot-Moments als Ziel aus

Keine Datenbankmigration erforderlich.
Server nach Deployment neu starten.
