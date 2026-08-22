const MODULE_DEFINITIONS = Object.freeze([
    {
        code: "wallet",
        name: "Wallet",
        description: "Food-Inspirationen aus Social Media, Websites und eigenen Notizen",
        navigation: {
            label: "Wallet",
            short_label: "Wallet",
            href: "/wallet.html",
            icon: "wallet",
            primary: true,
            order: 50
        },
        home_actions: [
            {
                code: "save_inspiration",
                label: "Inspiration merken",
                description: "Link oder Idee in der Wallet speichern",
                href: "/wallet.html?capture=1",
                icon: "wallet",
                order: 50,
                intent_keywords: ["merken", "speichern", "inspiration", "instagram", "tiktok", "youtube", "pinterest", "wallet"]
            }
        ]
    },
    {
        code: "meal_plan",
        name: "Wochenplan",
        description: "Wochenplanung und gespeicherte Wochenpläne",
        navigation: {
            label: "Wochenplan",
            short_label: "Plan",
            href: "/mealPlan.html",
            icon: "calendar",
            primary: true,
            order: 20
        },
        home_actions: [
            {
                code: "plan_week",
                label: "Woche planen",
                description: "Mahlzeiten intuitiv platzieren",
                href: "/mealPlan.html",
                icon: "calendar",
                order: 20,
                intent_keywords: ["woche", "wochenplan", "planen", "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag", "sonntag"]
            }
        ]
    },
    {
        code: "recipes",
        name: "Rezepte",
        description: "Rezeptbuch und Rezeptfunktionen",
        navigation: {
            label: "Rezepte",
            short_label: "Rezepte",
            href: "/recipes.html",
            icon: "recipes",
            primary: true,
            order: 30
        },
        secondary_navigation: [
            {
                label: "Rezept anlegen",
                href: "/recipeCreate.html",
                icon: "plus",
                order: 10
            }
        ],
        home_actions: [
            {
                code: "cook_now",
                label: "Jetzt kochen",
                description: "Ein passendes Rezept finden",
                href: "/recipes.html",
                icon: "recipes",
                order: 10,
                intent_keywords: ["rezept", "kochen", "essen", "gericht", "dinner", "mittag", "frühstück", "fruehstueck"]
            },
            {
                code: "create_recipe",
                label: "Rezept anlegen",
                description: "Ein eigenes Rezept erfassen",
                href: "/recipeCreate.html",
                icon: "plus",
                order: 40,
                intent_keywords: ["rezept anlegen", "rezept erfassen", "eigenes rezept"]
            }
        ]
    },
    {
        code: "inventory",
        name: "Inventar",
        description: "Bestände, Lagerorte und Inventarverwaltung",
        required_privilege: "inventory.view",
        navigation: {
            label: "Inventar",
            short_label: "Inventar",
            href: "/inventory.html",
            icon: "inventory",
            primary: true,
            order: 40
        },
        home_actions: [
            {
                code: "maintain_inventory",
                label: "Inventar pflegen",
                description: "Sehen, was da ist",
                href: "/inventory.html",
                icon: "inventory",
                order: 30,
                intent_keywords: ["inventar", "vorrat", "lager", "kühlschrank", "kuehlschrank", "vorhanden"]
            }
        ]
    }
]);

function getModuleDefinitions() {
    return MODULE_DEFINITIONS.map(moduleDefinition => ({
        ...moduleDefinition,
        navigation: moduleDefinition.navigation ? { ...moduleDefinition.navigation } : null,
        secondary_navigation: (moduleDefinition.secondary_navigation || []).map(item => ({ ...item })),
        home_actions: (moduleDefinition.home_actions || []).map(item => ({
            ...item,
            intent_keywords: [...(item.intent_keywords || [])]
        }))
    }));
}

module.exports = { getModuleDefinitions };
