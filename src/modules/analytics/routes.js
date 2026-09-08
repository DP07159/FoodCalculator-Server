const express=require('express');
const service=require('./service');
const {requireAuthentication}=require('../../core/identity/middleware');
const {requireWorkspaceContext}=require('../../core/workspaces/middleware');
const {requirePlatformAdminAfterAuthentication}=require('../../core/platformAdmin/middleware');
const router=express.Router();
router.post('/events',requireAuthentication,requireWorkspaceContext,async(req,res,next)=>{try{const allowed=new Set(['page_view','home_intent','module_view']);const name=String(req.body?.event_name||'');if(!allowed.has(name))return res.status(400).json({error:'Event nicht zulässig.'});await service.recordEvent({eventName:name,eventCategory:'navigation',userId:req.auth.user.id,workspaceId:req.workspaceId,sessionId:req.headers['x-product-session-id']||req.body?.session_id||'',path:req.body?.path||'',method:'CLIENT',entityType:req.body?.entity_type||'',entityReference:req.body?.entity_reference||'',properties:req.body?.properties||{}});res.status(202).json({success:true});}catch(e){next(e);}});
router.get('/summary',requireAuthentication,requirePlatformAdminAfterAuthentication,requireWorkspaceContext,async(req,res,next)=>{try{res.json(await service.getSummary(req.workspaceId,req.query.days));}catch(e){next(e);}});
module.exports=router;
