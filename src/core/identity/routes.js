const express = require("express");
const controller = require("./controller");
const { requireAuthentication } = require("./middleware");

const router = express.Router();

router.post("/login", controller.login);
router.post("/change-password", requireAuthentication, controller.changePassword);
router.post("/logout", requireAuthentication, controller.logout);
router.get("/me", requireAuthentication, controller.me);
router.get("/sessions", requireAuthentication, controller.sessions);
router.delete("/sessions/:id", requireAuthentication, controller.revokeSession);

module.exports = router;
