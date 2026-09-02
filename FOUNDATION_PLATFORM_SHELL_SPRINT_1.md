# Food Moment Platform – Foundation / Platform Shell Sprint 1

Stand: 22.08.2026

## Ziel
Erster vertikaler Umbau des bestehenden Food Calculators zur Food Moment Platform, ohne Big-Bang-Refactoring und ohne Änderung der Fachdaten.

## Konsolidierter Ausgangsstand
- Backend-Basis: `FoodCalculator-Server-sprint-0-migrationsgrundlage_260822.zip`
- Frontend-Basis: aktuelle UI-Dateien aus `FoodCalculator-main_260822.zip`
- Datenbank und vorhandene Migrationen des Serverstands wurden unverändert übernommen.

## Umgesetzt
1. Neue Home-/Intent-Fläche `Dein Food Moment.` als `/index.html`.
2. Bestehende kombinierte Wochenplan-/Rezeptansicht als Übergangsfläche `/tools.html` erhalten.
3. Design Foundation v0.1 additiv auf das bestehende Stylesheet gelegt:
   - warmes Canvas `#F8F7F3`
   - weiße funktionale Flächen
   - Charcoal-Text
   - Olive Accent
   - 4/8/12-orientierte Radien und ruhigere Schatten
   - Serif-Familie nur für den emotionalen Home-Einstieg
4. Navigation auf Plattformlogik vorbereitet:
   - Home, Wochenplan, Rezepte, Inventar, Rezept anlegen, Administration
   - Inventar wird bei geladenen Effective Permissions nur mit `inventory.view` gezeigt.
   - Administration wird nur für `platform_admin` gezeigt.
   - Workspace und Benutzer werden im Menü als Kontext dargestellt.
5. Freier Intent wird lokal als Entwurf gespeichert und für bereits abbildbare Vorhaben in bestehende Module geroutet.
6. Keine vollständige Food-Moment-Erfassung implementiert; sie bleibt bis zur separaten Fach-/UX-Spezifikation bewusst offen.
7. Manifest, Theme Color und Service-Worker-Cache auf den neuen Plattformstand aktualisiert.

## Bewusst noch nicht umgesetzt
- Persistentes Food-Moment-Datenmodell oder Food-Moment-CRUD
- Shopping-Modul
- Vollständige Workspace-Module-/Entitlement-Auflösung für alle Navigationseinträge
- Trennung der Übergangsseite `/tools.html` in vollständig eigenständige Recipe- und Meal-Planning-Screens
- Vollständiges Backend-Refactoring von Inventory, Meal Plans und Admin in Controller/Service/Repository

## Tests
Erfolgreich:
- `test:route-scope`
- `test:platform-admin`
- JavaScript-Syntaxprüfung für `navigation.js`, `home.js`, `index.js`

Nicht ausführbar in der isolierten Arbeitskopie:
- `test:recipe-multi-workspace`, da `sqlite3` in der lokalen Tool-Laufzeit nicht installiert werden konnte. Der Test scheiterte vor Ausführung der Testlogik am fehlenden Node-Modul, nicht an einer Assertion.

## Nächster empfohlener Schnitt
1. Platform Shell als gemeinsame Komponente über alle Frontend-Seiten ziehen.
2. Recipe und Meal Planning aus `/tools.html` in autonome Modul-Screens aufteilen.
3. Navigation/Intent-Actions vollständig aus Module Registry + Effective Permissions + Policies ableiten.
4. Danach Inventory und Meal Planning backendseitig auf die Handbook-Modulstruktur vervollständigen.
