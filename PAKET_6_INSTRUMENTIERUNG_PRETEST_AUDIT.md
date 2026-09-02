# Paket 6 – Instrumentierung + Pre-Test Audit

## Implementiert
- Persistente Product-Events (`product_events`) mit User, Workspace und Session.
- Serverseitige automatische Instrumentierung zentraler Modul- und Connection-Aktionen.
- Clientseitige Page-View-/Session-Erfassung über `AuthShell`.
- Platform-Admin-Auswertung unter `/adminAnalytics.html` mit 28-Tage-Sicht.
- Getrennte Kennzeichnung `module`, `connection`, `navigation`.
- Journey-Signale für Inspiration, konkretes Einplanen, Anlass, Wochenplanung und Einkauf.

## Interpretationsregel
Einzelmodul-Nutzung validiert zunächst das Modul. Für die Plattformthese sind Connection-Layer-Aktionen der zentrale Verhaltensindikator.

## Pre-Test Audit nach Fixing-Sprint
Vor externem Test müssen die fünf Kern-Journeys ohne Erklärung manuell durchlaufen werden. Probleme werden in Blocker, testverfälschende Friction und spätere Optimierung klassifiziert.
