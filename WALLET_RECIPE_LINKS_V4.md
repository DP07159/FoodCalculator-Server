# Wallet v4 – Kategorien & Rezept-Verknüpfungen

## Umfang
- Optionale Wallet-Kategorie: recipe, restaurant, product, technique, presentation, shop, other.
- Neue additive Migration `0012_wallet_categories_recipe_links.sql`.
- Many-to-many Relation `wallet_recipe_links` zwischen Wallet-Inspirationen und Rezepten.
- Wallet-Endpunkte zum Anzeigen/Aktualisieren von Rezept-Verknüpfungen sowie zum Laden verknüpfter Inspirationen je Rezept.
- Rezept-Erstellung aus dem Wallet verknüpft die neue Recipe-ID anschließend automatisch über die Wallet-Schnittstelle.

## Architektur
Die Wallet bleibt Eigentümerin ihrer Capture-/Kontextdaten. Recipe-Daten werden nicht in die Wallet kopiert und die Wallet schreibt keine Recipe-Fachdaten. Die Relation speichert nur Referenzen. Sichtbarkeit wird weiterhin über den aktiven Workspace geprüft.
