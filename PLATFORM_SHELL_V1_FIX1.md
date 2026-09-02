# Platform Shell V1 – Fix 1

Korrigiert:
- rekursive Initialisierung zwischen `navigation.js` und `platform.js`
- flackerndes Burger-Menü / nicht klickbaren Logout-Button
- Inventory-Link wird erst nach Permission-Auflösung korrekt ein-/ausgeblendet
- Platform-Kontext wird pro Seite nur einmal initialisiert
- temporäre API-/Kontextfehler löschen nicht mehr automatisch die Session
- Service-Worker-Cache-Version erhöht

Regressionstest:
1. Login
2. Reload -> eingeloggt bleiben
3. Burger-Menü stabil, Logout klickbar
4. Inventar sichtbar und aufrufbar
5. Rezeptdetail aufrufbar
6. Admin aufrufbar
7. Logout -> Login
