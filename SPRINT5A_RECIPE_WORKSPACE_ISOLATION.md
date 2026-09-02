# Sprint 5A – Recipe Workspace Isolation + Family Workspace

## Ziel
Rezepte gehören ab diesem Sprint genau zu einem Workspace.

- persönlicher Workspace -> private Rezepte
- Family-Workspace -> gemeinsam sicht- und bearbeitbare Rezepte für aktive Mitglieder
- Reads/Writes/Delete/Favorit/Stock-Check sind workspacegebunden
- bestehende Rezepte werden explizit dem bisherigen Owner-Workspace zugeordnet

## Neue CLI-Befehle

`npm run recipes:assign-legacy`
- erwartet `FC_OWNER_EMAIL`
- weist nur Rezepte mit `workspace_id IS NULL` dem persönlichen Workspace dieses Users zu

`npm run workspaces:create-family`
- erwartet `FC_FAMILY_WORKSPACE_NAME`
- erwartet `FC_OWNER_EMAIL`

`npm run workspaces:add-family-member`
- erwartet `FC_WORKSPACE_ID`
- erwartet `FC_MEMBER_EMAIL`
- erwartet `FC_ACTOR_EMAIL`
- optional `FC_ROLE_CODE`, Default `family_user`

## Sicherheitsmodell
Ein User sieht ein Workspace-Rezept nur, wenn:
1. Bearer-Session gültig ist,
2. eine aktive Membership zum angeforderten Workspace existiert,
3. die Recipe-Query exakt auf `workspace_id` begrenzt ist.

Recipe-Capabilities werden in einem späteren Authorization-Schritt ergänzt.
