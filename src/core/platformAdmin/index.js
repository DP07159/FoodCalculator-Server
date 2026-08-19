const routes = require("./routes");
const service = require("./service");
const repository = require("./repository");
const moduleAccessService = require("./moduleAccessService");
const { requireModuleEnabled } = require("./moduleAccessMiddleware");

module.exports = {
    routes,
    service,
    repository,
    moduleAccessService,
    requireModuleEnabled
};
