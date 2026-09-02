# Sprint 6A+6B – Route Scope Fix

## Ursache

`inventoryRoutes` und `mealPlanRoutes` sind in `index.js` global gemountet:

```js
app.use(inventoryRoutes);
app.use(mealPlanRoutes);
```

In Sprint 6A+6B wurden in beiden Routern gleichzeitig globale Middleware-Gates
eingebaut:

```js
router.use(requireAuthentication);
router.use(requireWorkspaceContext);
router.use(requireModuleEnabled(...));
```

Damit durchlief auch `/auth/login` diese Middleware und wurde vor dem
Identity-Router blockiert.

## Sicherer Fix

Die bestehenden URLs werden NICHT verändert.

Statt die Router umzuhängen, werden Authentication, Workspace Context und
Module Access ausschließlich an die tatsächlichen Inventory-/MealPlan-Routen
gebunden.

Beispiel:

```js
router.get(
    "/inventory",
    requireAuthentication,
    requireWorkspaceContext,
    requireModuleEnabled("inventory"),
    handler
);
```

Damit bleiben:
- `/inventory/...`
- `/meal_plans/...`

unverändert erreichbar, während `/auth/login` nicht mehr abgefangen wird.

Keine DB-Änderung.
Keine Migration.
Kein Frontend-Deploy erforderlich.

## Regressionstest

```bash
npm run test:route-scope
```
