const assert = require("assert");

const {
    parseFraction,
    normalizeIngredientUnit,
    unitForInventory,
    convertIngredientAmount,
    normalizeIngredientText,
    normalizeVisibleFoodName,
    buildFoodIdentity,
    parseIngredientLine,
    parseIngredientsText
} = require("../src/shared/ingredients");

assert.strictEqual(parseFraction("½"), 0.5);
assert.strictEqual(parseFraction("1/2"), 0.5);
assert.strictEqual(parseFraction("1 1/2"), 1.5);

assert.strictEqual(normalizeIngredientUnit("Gr."), "g");
assert.strictEqual(normalizeIngredientUnit("Esslöffel"), "EL");
assert.strictEqual(unitForInventory("kg"), "g");
assert.strictEqual(unitForInventory("ml"), "ml");
assert.strictEqual(convertIngredientAmount(1, "kg"), 1000);
assert.strictEqual(convertIngredientAmount(2, "EL"), 30);

assert.strictEqual(
    normalizeIngredientText("*  200 g Tomaten"),
    "200 g Tomaten"
);

assert.strictEqual(
    normalizeVisibleFoodName("Tomaten (frisch),"),
    "Tomaten"
);

assert.strictEqual(
    buildFoodIdentity("Rote Paprikaschoten").canonical_key,
    "paprika__rot"
);

assert.deepStrictEqual(
    parseIngredientLine("Tomaten, 200 g"),
    {
        raw_text: "Tomaten, 200 g",
        food_name: "Tomaten",
        amount: 200,
        unit: "g",
        original_unit: "g"
    }
);

assert.strictEqual(
    parseIngredientsText("Tomaten, 200 g\nZwiebel, 1").length,
    2
);

console.log("Ingredient module tests passed.");
