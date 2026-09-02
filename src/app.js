const recipeRoutes = require("./modules/recipes/routes");
const analytics = require("./modules/analytics/service");
const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());
app.use(analytics.trackingMiddleware);

app.use("/recipes", recipeRoutes);
module.exports = app;
