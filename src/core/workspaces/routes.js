const express = require("express");
const controller = require("./controller");
const { requireAuthentication } = require("../identity/middleware");
const { requireWorkspaceContext } = require("./middleware");

const router = express.Router();

router.get("/", requireAuthentication, controller.list);
router.get("/current", requireAuthentication, requireWorkspaceContext, controller.current);

module.exports = router;
