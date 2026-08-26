const service = require("./service");


async function createUser(req, res) {
    try {
        const result = await service.createManagedUser(req.body, req.auth.user);
        if (result.error) return res.status(400).json({ error: result.error });
        res.status(201).json(result.value);
    } catch (error) {
        console.error("Fehler bei POST /platform-admin/users:", error.message);
        res.status(500).json({ error: "Benutzer konnte nicht angelegt werden." });
    }
}

async function listWorkspaces(req, res) {
    try {
        res.json({ workspaces: await service.listWorkspaces() });
    } catch (error) {
        console.error("Fehler bei GET /platform-admin/workspaces:", error.message);
        res.status(500).json({ error: "Workspaces konnten nicht geladen werden." });
    }
}

async function addMembership(req, res) {
    try {
        const result = await service.addUserMembership({
            publicId: req.params.publicId,
            workspacePublicId: req.body?.workspace_public_id,
            roleCode: req.body?.role_code,
            actorUser: req.auth.user
        });
        if (result.notFound) return res.status(404).json({ error: "Benutzer wurde nicht gefunden." });
        if (result.error) return res.status(400).json({ error: result.error });
        res.status(201).json(result.value);
    } catch (error) {
        console.error("Fehler beim Zuweisen eines Workspace:", error.message);
        res.status(500).json({ error: "Workspace konnte nicht zugewiesen werden." });
    }
}

async function removeMembership(req, res) {
    try {
        const result = await service.removeUserMembership({
            publicId: req.params.publicId,
            membershipId: Number(req.params.membershipId)
        });
        if (result.notFound) return res.status(404).json({ error: "Membership wurde nicht gefunden." });
        if (result.error) return res.status(400).json({ error: result.error });
        res.json(result.value);
    } catch (error) {
        console.error("Fehler beim Entfernen eines Workspace:", error.message);
        res.status(500).json({ error: "Workspace-Zuweisung konnte nicht entfernt werden." });
    }
}


async function listUsers(req, res) {
    try {
        res.json({
            users: await service.listUsers(req.query)
        });
    } catch (error) {
        console.error("Fehler bei GET /platform-admin/users:", error.message);
        res.status(500).json({ error: "Benutzer konnten nicht geladen werden." });
    }
}

async function getUser(req, res) {
    try {
        const detail = await service.getUserDetail(req.params.publicId);
        if (!detail) {
            return res.status(404).json({ error: "Benutzer wurde nicht gefunden." });
        }
        res.json(detail);
    } catch (error) {
        console.error("Fehler bei GET /platform-admin/users/:publicId:", error.message);
        res.status(500).json({ error: "Benutzer konnte nicht geladen werden." });
    }
}

async function patchUserStatus(req, res) {
    try {
        const result = await service.setUserStatus(
            req.params.publicId,
            req.body?.status
        );

        if (result.notFound) {
            return res.status(404).json({ error: "Benutzer wurde nicht gefunden." });
        }
        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        res.json(result.value);
    } catch (error) {
        console.error("Fehler bei PATCH User-Status:", error.message);
        res.status(500).json({ error: "User-Status konnte nicht geändert werden." });
    }
}

async function revokeSessions(req, res) {
    try {
        const result = await service.revokeUserSessions(
            req.params.publicId
        );

        if (result.notFound) {
            return res.status(404).json({ error: "Benutzer wurde nicht gefunden." });
        }

        res.json(result.value);
    } catch (error) {
        console.error("Fehler beim Session-Revoke:", error.message);
        res.status(500).json({ error: "Sessions konnten nicht widerrufen werden." });
    }
}

async function getCatalog(req, res) {
    try {
        res.json(await service.getCatalog());
    } catch (error) {
        console.error("Fehler bei GET /platform-admin/catalog:", error.message);
        res.status(500).json({ error: "Admin-Katalog konnte nicht geladen werden." });
    }
}

async function setRole(req, res) {
    try {
        const result = await service.setMembershipRole({
            membershipId: req.params.membershipId,
            roleCode: req.body?.role_code,
            actorUser: req.auth.user
        });

        if (result.notFound) {
            return res.status(404).json({ error: "Membership wurde nicht gefunden." });
        }
        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        res.json(result.value);
    } catch (error) {
        console.error("Fehler beim Ändern der Rolle:", error.message);
        res.status(500).json({ error: "Rolle konnte nicht geändert werden." });
    }
}

async function setCapability(req, res) {
    try {
        const result = await service.setMembershipCapability({
            membershipId: req.params.membershipId,
            capabilityCode: req.params.capabilityCode,
            enabled: req.body?.enabled,
            actorUser: req.auth.user
        });

        if (result.notFound) {
            return res.status(404).json({ error: "Membership wurde nicht gefunden." });
        }
        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        res.json(result.value);
    } catch (error) {
        console.error("Fehler beim Ändern der Capability:", error.message);
        res.status(500).json({ error: "Capability konnte nicht geändert werden." });
    }
}

async function setModule(req, res) {
    try {
        const result = await service.setMembershipModule({
            membershipId: req.params.membershipId,
            moduleCode: req.params.moduleCode,
            enabled: req.body?.enabled,
            actorUser: req.auth.user
        });

        if (result.notFound) {
            return res.status(404).json({ error: "Membership wurde nicht gefunden." });
        }
        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        res.json(result.value);
    } catch (error) {
        console.error("Fehler beim Ändern des Modulzugriffs:", error.message);
        res.status(500).json({ error: "Modulzugriff konnte nicht geändert werden." });
    }
}

module.exports = {
    listUsers,
    getUser,
    patchUserStatus,
    revokeSessions,
    getCatalog,
    setRole,
    setCapability,
    setModule,
    createUser,
    listWorkspaces,
    addMembership,
    removeMembership
};
