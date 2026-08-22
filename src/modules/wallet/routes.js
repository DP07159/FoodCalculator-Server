const express = require("express");
const controller = require("./controller");
const { requireAuthentication } = require("../../core/identity/middleware");
const { requireWorkspaceContext } = require("../../core/workspaces/middleware");
const { requireModuleEnabled } = require("../../core/platformAdmin/moduleAccessMiddleware");

const router = express.Router();
router.use(requireAuthentication);
router.use(requireWorkspaceContext);
router.use(requireModuleEnabled("wallet"));
router.get("/", controller.list);
router.post("/", controller.create);
router.patch("/:publicId", controller.update);
router.delete("/:publicId", controller.remove);

module.exports = router;
