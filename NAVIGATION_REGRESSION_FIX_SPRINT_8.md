# Sprint 8 – Navigation Regression Fix

## Problem
Nach Einführung des serverseitigen Module Registry in Sprint 7 bestand die Frontend-Navigation nur noch aus statischen Einträgen (Home/Administration), wenn `/platform/context` nicht verfügbar war, z. B. bei zeitversetztem Frontend-/Server-Deployment. Dadurch verschwanden Wochenplan, Rezepte, Inventar und Home-Actions vollständig.

## Lösung
- Registry-basierter Pfad bleibt der bevorzugte Standard.
- Fällt `/platform/context` aus oder liefert keine Moduldefinitionen, nutzt das Frontend `/authorization/effective-permissions` als rückwärtskompatiblen Fallback.
- Die bekannten Kernmodule (`meal_plan`, `recipes`, `inventory`) besitzen ausschließlich für diesen Kompatibilitätsfall lokale Metadaten.
- Vorhandene Module-Entitlements und Privileges aus dem älteren Authorization-Endpunkt werden weiterhin berücksichtigt.
- Sind auch diese Informationen temporär nicht verfügbar, fällt die UI nicht mehr leer, sondern zeigt die bekannten Kernmodule; die serverseitige Autorisierung bleibt die Sicherheitsinstanz.
- Der mobile Header/Workspace-Wechsel aus Sprint 7 bleibt unverändert.

## Deployment-Sicherheit
Frontend Sprint 8 kann sowohl mit Server Sprint 7 als auch vorübergehend mit dem vorherigen Serverstand betrieben werden. Sobald `/platform/context` verfügbar ist, wird automatisch wieder die zentrale Registry verwendet.
