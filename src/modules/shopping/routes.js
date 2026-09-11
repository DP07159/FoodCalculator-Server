const express = require("express");
const service = require("./service");
const { requireAuthentication } = require("../../core/identity/middleware");
const { requireWorkspaceContext } = require("../../core/workspaces/middleware");
const { requireModuleEnabled } = require("../../core/platformAdmin/moduleAccessMiddleware");

const router = express.Router();
router.use(requireAuthentication, requireWorkspaceContext, requireModuleEnabled("shopping"));

router.get("/shopping-list", async (req,res,next)=>{ try { res.json(await service.getList(req.workspaceId)); } catch(e){ next(e); } });
router.post("/shopping-list/manual", async (req,res,next)=>{ try { const r=await service.addManual(req.body||{},req.workspaceId,req.auth.user.id); if(r.error)return res.status(400).json({error:r.error}); await service.syncAllShoppingShares(req.workspaceId,req.auth.user.id); res.status(201).json(await service.getList(req.workspaceId)); } catch(e){ next(e); } });
router.post("/shopping-list/import/recipe/:id", async (req,res,next)=>{ try { const r=await service.importRecipe(req.params.id,req.body||{},req.workspaceId,req.auth.user.id); if(r.notFound)return res.status(404).json({error:"Rezept nicht gefunden."}); if(r.error)return res.status(400).json({error:r.error}); await service.syncAllShoppingShares(req.workspaceId,req.auth.user.id); res.json(r.value); } catch(e){ next(e); } });
router.post("/shopping-list/import/food-moment/:publicId", async (req,res,next)=>{ try { const r=await service.importFoodMoment(req.params.publicId,req.workspaceId,req.auth.user.id); if(r.notFound)return res.status(404).json({error:"Food Moment nicht gefunden."}); if(r.error)return res.status(400).json({error:r.error}); await service.syncAllShoppingShares(req.workspaceId,req.auth.user.id); res.json(r.value); } catch(e){ next(e); } });
router.post("/shopping-list/import/week", async (req,res,next)=>{ try { const r=await service.importWeek(req.body?.start_date,req.workspaceId,req.auth.user.id); if(r.error)return res.status(400).json({error:r.error}); await service.syncAllShoppingShares(req.workspaceId,req.auth.user.id); res.json(r.value); } catch(e){ next(e); } });
router.patch("/shopping-list/group", async (req,res,next)=>{ try { const r=await service.setGroupCompleted(req.body||{},req.workspaceId,req.auth.user.id); if(r.error)return res.status(400).json({error:r.error}); await service.syncAllShoppingShares(req.workspaceId,req.auth.user.id); res.json(r.value); } catch(e){ next(e); } });
router.delete("/shopping-list/group", async (req,res,next)=>{ try { const r=await service.deleteGroup(req.body||{},req.workspaceId,req.auth.user.id); if(r.error)return res.status(400).json({error:r.error}); await service.syncAllShoppingShares(req.workspaceId,req.auth.user.id); res.json(r.value); } catch(e){ next(e); } });
router.delete("/shopping-list/completed", async (req,res,next)=>{ try { const result=await service.clearCompleted(req.workspaceId,req.auth.user.id); await service.syncAllShoppingShares(req.workspaceId,req.auth.user.id); res.json(result); } catch(e){ next(e); } });
router.get("/shopping-list/workspace-shares", async (req,res,next)=>{ try { res.json(await service.getShareOptions(req.workspaceId,req.auth.user.id)); } catch(e){ next(e); } });
router.put("/shopping-list/workspace-shares", async (req,res,next)=>{ try { const result=await service.setShareOptions(req.workspaceId,req.auth.user.id,req.body?.workspace_public_ids); if(result.forbidden)return res.status(403).json({error:result.error}); if(result.error)return res.status(400).json({error:result.error}); res.json(result.value); } catch(e){ next(e); } });

module.exports = router;
