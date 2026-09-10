const express=require('express');
const service=require('./service');
const {get}=require('../../database/database');
const {requireAuthentication}=require('../../core/identity/middleware');
const {requireWorkspaceContext}=require('../../core/workspaces/middleware');
const {requirePlatformAdminAfterAuthentication}=require('../../core/platformAdmin/middleware');
const router=express.Router();
const clientEvents=new Map([
 ['page_view','navigation'],['module_view','navigation'],['home_intent','navigation'],['dwell_time','engagement'],['ui_action','interaction'],['search_used','interaction'],['search_empty','friction'],['form_abandoned','friction'],['client_error','friction'],['request_error','friction']
]);
router.post('/events',requireAuthentication,requireWorkspaceContext,async(req,res,next)=>{try{const name=String(req.body?.event_name||'');const category=clientEvents.get(name);if(!category)return res.status(400).json({error:'Event nicht zulässig.'});await service.recordEvent({eventName:name,eventCategory:category,userId:req.auth.user.id,workspaceId:req.workspaceId,sessionId:req.headers['x-product-session-id']||req.body?.session_id||'',path:req.body?.path||'',method:'CLIENT',entityType:req.body?.entity_type||'',entityReference:req.body?.entity_reference||'',properties:req.body?.properties||{}});res.status(202).json({success:true});}catch(e){next(e);}});
const admin=[requireAuthentication,requirePlatformAdminAfterAuthentication];
async function resolveWorkspace(req){const publicId=String(req.query.workspace||'all').trim();if(!publicId||publicId==='all')return null;const row=await get(`SELECT id FROM workspaces WHERE public_id=? AND status='active' LIMIT 1`,[publicId]);if(!row){const e=new Error('Workspace nicht gefunden.');e.status=404;throw e;}return Number(row.id);}
function opts(req){return {days:req.query.days,from:req.query.from,to:req.query.to,limit:req.query.limit};}
router.get('/summary',...admin,async(req,res,next)=>{try{res.json(await service.getSummary(await resolveWorkspace(req),opts(req)));}catch(e){next(e);}});
router.get('/logins',...admin,async(req,res,next)=>{try{res.json({logins:await service.getLogins(await resolveWorkspace(req),opts(req))});}catch(e){next(e);}});
router.get('/journeys',...admin,async(req,res,next)=>{try{res.json({events:await service.getJourneys(await resolveWorkspace(req),opts(req))});}catch(e){next(e);}});
router.get('/funnels',...admin,async(req,res,next)=>{try{res.json({funnels:await service.getFunnels(await resolveWorkspace(req),opts(req))});}catch(e){next(e);}});
router.get('/users/:id',...admin,async(req,res,next)=>{try{const data=await service.getUserDetail(await resolveWorkspace(req),Number(req.params.id),opts(req));if(!data)return res.status(404).json({error:'Nutzer nicht gefunden.'});res.json(data);}catch(e){next(e);}});
module.exports=router;
