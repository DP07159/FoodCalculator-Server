const express = require("express");
const controller = require("./controller");
const {
    requireAuthentication,
    requirePlatformAdminAfterAuthentication
} = require("./middleware");

const router = express.Router();

router.use(requireAuthentication);
router.use(requirePlatformAdminAfterAuthentication);

router.get("/users", controller.listUsers);
router.post("/users", controller.createUser);
router.get("/users/:publicId", controller.getUser);
router.patch("/users/:publicId/status", controller.patchUserStatus);
router.post("/users/:publicId/revoke-sessions", controller.revokeSessions);
router.get("/workspaces", controller.listWorkspaces);
router.post("/users/:publicId/memberships", controller.addMembership);
router.delete("/users/:publicId/memberships/:membershipId", controller.removeMembership);

router.get("/catalog", controller.getCatalog);

router.put(
    "/memberships/:membershipId/role",
    controller.setRole
);

router.put(
    "/memberships/:membershipId/capabilities/:capabilityCode",
    controller.setCapability
);

router.put(
    "/memberships/:membershipId/modules/:moduleCode",
    controller.setModule
);

module.exports = router;
