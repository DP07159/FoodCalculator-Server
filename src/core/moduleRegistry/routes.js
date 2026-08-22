const express = require("express");
const controller = require("./controller");
const { requireAuthentication } = require("../identity/middleware");
const { requireWorkspaceContext } = require("../workspaces/middleware");

const router = express.Router();

router.get(
    "/context",
    requireAuthentication,
    requireWorkspaceContext,
    controller.platformContext
);

module.exports = router;
