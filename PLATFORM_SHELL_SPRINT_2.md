# Platform Shell Sprint 2

Stand: 22.08.2026

## Ziel
Die gemeinsame Platform Shell wird über die Kernmodule fortgeführt. Wochenplanung und Recipes werden aus der Übergangsseite `tools.html` in autonome Modul-Screens getrennt.

## Umgesetzt
- `mealPlan.html` als eigenständiger Wochenplan-Screen.
- `recipes.html` als eigenständiger Rezept-Screen.
- Home-Intent und Navigation verweisen direkt auf die autonomen Module.
- `script.js` lädt Daten abhängig vom tatsächlich geöffneten Modul und koppelt die UI-Initialisierung nicht mehr unnötig.
- `tools.html` bleibt als rückwärtskompatible Weiterleitung erhalten.
- Admin Studio nutzt ebenfalls den Food-Moment-Wordmark der gemeinsamen Shell.
- PWA-Manifest auf Food Moment Platform umbenannt.
- Service-Worker-Cache aktualisiert und neue Modulseiten aufgenommen.
- Aktiver Navigationspunkt wird in der Shell markiert.

## Bewusst nicht verändert
- Keine Datenbankmigration.
- Keine Änderung bestehender Fach-APIs.
- Kein Food-Moment-Datenmodell oder CRUD.
- Keine fachliche Shopping-Implementierung.

## Architekturbezug
Der Schnitt stärkt die Modulautonomie: Recipes und Meal Planning bleiben unabhängig nutzbar, können später aber über einen Food-Moment-Kontext orchestriert werden.

## Nächster sinnvoller Schnitt
1. Platform Shell von Burger-Menü auf responsive Desktop-Sidebar + Mobile-Bottom-Navigation weiterentwickeln.
2. Navigation serverseitig aus Workspace-Modulen + Effective Permissions ableiten.
3. Inventory als nächstes Fachmodul visuell und strukturell auf dieselbe Modulshell migrieren.
