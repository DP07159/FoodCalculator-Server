const express = require("express");
const controller = require("./controller");
const { requireAuthentication } = require("../identity/middleware");
const { requireWorkspaceContext } = require("../workspaces/middleware");

const router = express.Router();

router.get(
    "/effective-permissions",
    requireAuthentication,
    requireWorkspaceContext,
    controller.effectivePermissions
);

module.exports = router;
