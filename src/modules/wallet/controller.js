const service = require("./service");
const workspaceAssignmentService = require("./workspaceAssignmentService");

async function list(req, res, next) {
    try {
        const items = await service.listItems(req.workspaceId, String(req.query.status || "saved"), req.auth.user.id);
        res.json(items);
    } catch (error) { next(error); }
}

async function preview(req, res, next) {
    try {
        const result = await service.previewSource(req.body || {});
        if (result.error) return res.status(400).json({ error: result.error });
        res.json(result.value);
    } catch (error) { next(error); }
}

async function create(req, res, next) {
    try {
        const result = await service.createItem({workspaceId: req.workspaceId,userId: req.auth.user.id,payload: req.body || {}});
        if (result.error) return res.status(400).json({ error: result.error });
        res.status(201).json(result.value);
    } catch (error) { next(error); }
}

async function update(req, res, next) {
    try {
        const result = await service.updateItem({workspaceId: req.workspaceId,userId: req.auth.user.id,publicId: req.params.publicId,payload: req.body || {}});
        if (result.notFound) return res.status(404).json({ error: "Wallet-Eintrag nicht gefunden." });
        if (result.forbidden) return res.status(403).json({ error: result.error });
        if (result.error) return res.status(400).json({ error: result.error });
        res.json(result.value);
    } catch (error) { next(error); }
}

async function remove(req, res, next) {
    try {
        const result = await service.deleteItem(req.workspaceId, req.auth.user.id, req.params.publicId);
        if (result.notFound) return res.status(404).json({ error: "Wallet-Eintrag nicht gefunden." });
        if (result.forbidden) return res.status(403).json({ error: result.error });
        if (!result.deleted) return res.status(404).json({ error: "Wallet-Eintrag nicht gefunden." });
        res.json({ success: true });
    } catch (error) { next(error); }
}

async function getWorkspaceAssignments(req, res, next) {
    try {
        const result = await workspaceAssignmentService.getAssignmentOptions({publicId:req.params.publicId,userId:req.auth.user.id});
        if (result.forbidden) return res.status(403).json({error:result.error});
        res.json(result.value);
    } catch (error) { next(error); }
}

async function updateWorkspaceAssignments(req, res, next) {
    try {
        const result = await workspaceAssignmentService.setAssignments({publicId:req.params.publicId,currentWorkspaceId:req.workspaceId,userId:req.auth.user.id,workspacePublicIds:req.body.workspace_public_ids});
        if (result.forbidden) return res.status(403).json({error:result.error});
        if (result.error) return res.status(400).json({error:result.error});
        res.json(result.value);
    } catch (error) { next(error); }
}

async function getRecipeLinks(req,res,next){try{const result=await service.getRecipeLinkOptions({workspaceId:req.workspaceId,userId:req.auth.user.id,publicId:req.params.publicId});if(result.notFound)return res.status(404).json({error:"Wallet-Eintrag nicht gefunden."});res.json(result.value);}catch(error){next(error);}}
async function updateRecipeLinks(req,res,next){try{const result=await service.setRecipeLinks({workspaceId:req.workspaceId,userId:req.auth.user.id,publicId:req.params.publicId,recipeIds:req.body.recipe_ids});if(result.notFound)return res.status(404).json({error:"Wallet-Eintrag nicht gefunden."});if(result.error)return res.status(400).json({error:result.error});res.json(result.value);}catch(error){next(error);}}
async function addRecipeLink(req,res,next){try{const result=await service.addRecipeLink({workspaceId:req.workspaceId,userId:req.auth.user.id,publicId:req.params.publicId,recipeId:req.body.recipe_id});if(result.notFound)return res.status(404).json({error:"Wallet-Eintrag nicht gefunden."});if(result.error)return res.status(400).json({error:result.error});res.status(201).json(result.value);}catch(error){next(error);}}
async function getItemsForRecipe(req,res,next){try{const result=await service.getItemsForRecipe({workspaceId:req.workspaceId,userId:req.auth.user.id,recipeId:req.params.recipeId});if(result.notFound)return res.status(404).json({error:"Rezept nicht gefunden."});res.json(result.value);}catch(error){next(error);}}

module.exports = { list, preview, create, update, remove, getWorkspaceAssignments, updateWorkspaceAssignments, getRecipeLinks, updateRecipeLinks, addRecipeLink, getItemsForRecipe };
