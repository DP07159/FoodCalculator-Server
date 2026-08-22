# Sprint 6 · Workspace-/rollenadaptive Experience

## Ziel
Navigation und Home werden aus aktivem Workspace, Membership-Berechtigungen und effektiver Modulfreischaltung abgeleitet.

## Änderungen
- `GET /authorization/effective-permissions` liefert zusätzlich effektive Module der Membership.
- Navigation blendet deaktivierte Module vollständig aus.
- Home-Schnelleinstiege folgen derselben Modulauflösung.
- Freitext-Intent navigiert nicht mehr in ein deaktiviertes Modul.
- Experience-Dichte: `medic` = High Precision; `restaurant`-Workspace = High Working; sonst Balanced.
- Kein Kind-Modus: `family_user` wird bewusst nicht als Kind interpretiert.

## Unverändert
- Keine Migration.
- Keine Änderung fachlicher Modul-APIs.
- Kein Food-Moment-Datenmodell.
- Capability Discovery bleibt getrennt von regulärer Navigation.
