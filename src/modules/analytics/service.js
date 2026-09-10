const { run, all, get } = require('../../database/database');

function clean(value, max = 255) { return String(value ?? '').trim().slice(0, max); }
function json(value) { try { return JSON.stringify(value && typeof value === 'object' ? value : {}); } catch { return '{}'; } }
function safeDays(days){ return Math.min(365, Math.max(1, Number(days)||28)); }
function parseJson(value){ try{return JSON.parse(value||'{}')||{};}catch{return{};} }
function deviceFromUa(ua=''){
    const s=String(ua||'');
    const device=/iPad|Tablet|Android(?!.*Mobile)/i.test(s)?'Tablet':/Mobi|Android|iPhone|iPod/i.test(s)?'Mobile':'Desktop';
    const browser=/Edg\//.test(s)?'Edge':/Firefox\//.test(s)?'Firefox':/Chrome\//.test(s)?'Chrome':/Safari\//.test(s)&&!/Chrome\//.test(s)?'Safari':'Andere';
    const os=/Windows/i.test(s)?'Windows':/Android/i.test(s)?'Android':/iPhone|iPad|iPod/i.test(s)?'iOS/iPadOS':/Mac OS X|Macintosh/i.test(s)?'macOS':/Linux/i.test(s)?'Linux':'Andere';
    return {device,browser,os};
}

async function recordEvent({ eventName, eventCategory='module', userId=null, workspaceId=null, sessionId='', path='', method='', entityType='', entityReference='', properties={} }) {
    const name = clean(eventName, 80); if (!name) return;
    await run(`INSERT INTO product_events(event_name,event_category,user_id,workspace_id,session_id,path,method,entity_type,entity_reference,properties_json)
               VALUES(?,?,?,?,?,?,?,?,?,?)`, [name, clean(eventCategory,40)||'module', userId||null, workspaceId||null, clean(sessionId,120)||null, clean(path,300)||null, clean(method,12)||null, clean(entityType,50)||null, clean(entityReference,160)||null, json(properties)]);
}

function classifyRequest(method, path) {
    const p = String(path || '').split('?')[0];
    if (method === 'POST' && p === '/recipes') return ['recipe_created','module','recipe'];
    if (method === 'PUT' && /^\/recipes\/\d+$/.test(p)) return ['recipe_updated','module','recipe'];
    if (method === 'POST' && p === '/wallet') return ['wallet_saved','module','wallet'];
    if ((method === 'PUT' || method === 'POST') && /\/wallet\/[^/]+\/recipe-links$/.test(p)) return ['wallet_recipe_connected','connection','wallet_recipe'];
    if (method === 'PUT' && /\/wallet\/[^/]+\/food-moment-links$/.test(p)) return ['wallet_food_moment_connected','connection','wallet_food_moment'];
    if (method === 'POST' && p === '/food-moments') return ['food_moment_created','module','food_moment'];
    if (method === 'PATCH' && /^\/food-moments\/[^/]+$/.test(p)) return ['food_moment_updated','module','food_moment'];
    if (method === 'POST' && /\/food-moments\/[^/]+\/repeat$/.test(p)) return ['food_moment_repeated','connection','food_moment'];
    if (method === 'PUT' && p === '/planning/slot') return ['planning_slot_saved','connection','planning'];
    if (method === 'DELETE' && p === '/planning/slot') return ['planning_slot_removed','connection','planning'];
    if (method === 'POST' && /\/meal_plans\/\d+\/apply$/.test(p)) return ['week_template_applied','connection','planning'];
    if (method === 'POST' && p === '/meal_plans') return ['week_template_created','module','planning_template'];
    if (method === 'POST' && /\/shopping-list\/import\/recipe\/\d+$/.test(p)) return ['recipe_to_shopping','connection','shopping'];
    if (method === 'POST' && /\/shopping-list\/import\/food-moment\/[^/]+$/.test(p)) return ['food_moment_to_shopping','connection','shopping'];
    if (method === 'POST' && p === '/shopping-list/manual') return ['shopping_manual_added','module','shopping'];
    if (method === 'PATCH' && p === '/shopping-list/group') return ['shopping_item_toggled','module','shopping'];
    if (method === 'DELETE' && p === '/shopping-list/completed') return ['shopping_completed_cleared','module','shopping'];
    return null;
}
function trackingMiddleware(req,res,next){
    const started=Date.now();
    res.on('finish',()=>{
        if(res.statusCode>=400||req.path.startsWith('/analytics'))return;
        const match=classifyRequest(req.method,req.path); if(!match)return;
        (async()=>{
            const [eventName,eventCategory,entityType]=match;
            const ref=req.params?.publicId||req.params?.id||req.body?.public_id||req.body?.recipe_id||'';
            let userId=req.auth?.user?.id||null, workspaceId=req.workspaceId||null;
            if(!userId){
                const authHeader=String(req.headers.authorization||'');
                const token=(authHeader.match(/^Bearer\s+(.+)$/i)||[])[1];
                if(token){
                    const identityService=require('../../core/identity/service');
                    const auth=await identityService.authenticateToken(token.trim());
                    userId=auth?.user?.id||null;
                }
            }
            if(userId&&!workspaceId){
                const workspaceService=require('../../core/workspaces/service');
                const requested=String(req.headers['x-workspace-id']||'').trim();
                const ctx=await workspaceService.resolveWorkspaceContextForUser(userId,requested);
                workspaceId=ctx?.workspaceId||null;
            }
            if(!userId||!workspaceId)return;
            await recordEvent({eventName,eventCategory,entityType,entityReference:ref,userId,workspaceId,sessionId:req.headers['x-product-session-id']||'',path:req.path,method:req.method,properties:{duration_ms:Date.now()-started,source:req.body?.source_code||null}});
        })().catch(err=>console.warn('Analytics event konnte nicht gespeichert werden:',err.message));
    }); next();
}

async function getSummary(workspaceId, days=28){
    const d=safeDays(days), since=`-${d} days`;
    const [totals,events,daily,users,moduleRows,dwellRows,friction,userSignals,sessionRows] = await Promise.all([
        get(`SELECT COUNT(*) total_events,COUNT(DISTINCT user_id) active_users,COUNT(DISTINCT session_id) sessions,SUM(CASE WHEN event_category='connection' THEN 1 ELSE 0 END) connection_events FROM product_events WHERE workspace_id=? AND created_at>=datetime('now',?)`,[workspaceId,since]),
        all(`SELECT event_name,event_category,COUNT(*) count,COUNT(DISTINCT user_id) users FROM product_events WHERE workspace_id=? AND created_at>=datetime('now',?) GROUP BY event_name,event_category ORDER BY count DESC,event_name`,[workspaceId,since]),
        all(`SELECT date(created_at) day,COUNT(*) events,COUNT(DISTINCT user_id) users,SUM(CASE WHEN event_category='connection' THEN 1 ELSE 0 END) connections FROM product_events WHERE workspace_id=? AND created_at>=datetime('now',?) GROUP BY date(created_at) ORDER BY day`,[workspaceId,since]),
        all(`SELECT pe.user_id,u.display_name,u.email,COUNT(*) events,COUNT(DISTINCT pe.session_id) sessions,SUM(CASE WHEN pe.event_category='connection' THEN 1 ELSE 0 END) connections,MIN(pe.created_at) first_seen,MAX(pe.created_at) last_seen FROM product_events pe LEFT JOIN users u ON u.id=pe.user_id WHERE pe.workspace_id=? AND pe.created_at>=datetime('now',?) AND pe.user_id IS NOT NULL GROUP BY pe.user_id,u.display_name,u.email ORDER BY events DESC,last_seen DESC`,[workspaceId,since]),
        all(`SELECT path,COUNT(*) views,COUNT(DISTINCT user_id) users FROM product_events WHERE workspace_id=? AND created_at>=datetime('now',?) AND event_name='page_view' GROUP BY path ORDER BY views DESC`,[workspaceId,since]),
        all(`SELECT path,properties_json FROM product_events WHERE workspace_id=? AND created_at>=datetime('now',?) AND event_name='dwell_time'`,[workspaceId,since]),
        all(`SELECT event_name,COUNT(*) count,COUNT(DISTINCT user_id) users FROM product_events WHERE workspace_id=? AND created_at>=datetime('now',?) AND event_category='friction' GROUP BY event_name ORDER BY count DESC`,[workspaceId,since]),
        all(`SELECT user_id,event_name,event_category FROM product_events WHERE workspace_id=? AND created_at>=datetime('now',?) AND user_id IS NOT NULL`,[workspaceId,since]),
        all(`SELECT s.user_id,s.created_at FROM user_sessions s JOIN workspace_memberships wm ON wm.user_id=s.user_id AND wm.workspace_id=? ORDER BY s.user_id,s.created_at`,[workspaceId])
    ]);
    const eventMap=Object.fromEntries(events.map(e=>[e.event_name,Number(e.count)]));
    const dwellByPath={}; for(const r of dwellRows){const ms=Number(parseJson(r.properties_json).duration_ms||0); if(ms>0&&ms<3600000){const k=r.path||'(unbekannt)'; (dwellByPath[k]??=[]).push(ms);}}
    const modules=moduleRows.map(r=>{const vals=dwellByPath[r.path]||[]; return {...r,views:Number(r.views),users:Number(r.users),avg_dwell_ms:vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):0};});
    const perUser=new Map(); for(const e of userSignals){if(!perUser.has(e.user_id))perUser.set(e.user_id,{events:new Set(),categories:new Set()});const x=perUser.get(e.user_id);x.events.add(e.event_name);x.categories.add(e.event_category);}
    const activeCount=perUser.size||0; const metricCount=fn=>[...perUser.values()].filter(fn).length;
    const conceptMetrics={food_moment_users:metricCount(x=>x.events.has('food_moment_created')),connection_users:metricCount(x=>x.categories.has('connection')),planning_users:metricCount(x=>x.events.has('planning_slot_saved')||x.events.has('week_template_applied')),cross_module_users:metricCount(x=>x.events.size>=4),food_moment_rate:activeCount?Math.round(metricCount(x=>x.events.has('food_moment_created'))/activeCount*100):0,connection_rate:activeCount?Math.round(metricCount(x=>x.categories.has('connection'))/activeCount*100):0};
    const sessionsByUser=new Map(); for(const r of sessionRows){if(!sessionsByUser.has(r.user_id))sessionsByUser.set(r.user_id,[]);sessionsByUser.get(r.user_id).push(new Date(String(r.created_at).replace(' ','T')+'Z'));}
    const retention={}; for(const day of [1,7,14,30]){let eligible=0,returned=0;for(const arr of sessionsByUser.values()){if(!arr.length)continue;const first=arr[0];const age=(Date.now()-first.getTime())/86400000;if(age<day)continue;eligible++;if(arr.some(dt=>{const delta=(dt-first)/86400000;return delta>=day&&delta<day+1;}))returned++;}retention[`d${day}`]={eligible,returned,rate:eligible?Math.round(returned/eligible*100):0};}
    return {range_days:d,totals:{...totals,total_events:Number(totals?.total_events||0),active_users:Number(totals?.active_users||0),sessions:Number(totals?.sessions||0),connection_events:Number(totals?.connection_events||0)},events:events.map(e=>({...e,count:Number(e.count),users:Number(e.users)})),daily:daily.map(x=>({...x,events:Number(x.events),users:Number(x.users),connections:Number(x.connections||0)})),users:users.map(u=>({...u,events:Number(u.events),sessions:Number(u.sessions),connections:Number(u.connections||0)})),modules,friction:friction.map(x=>({...x,count:Number(x.count),users:Number(x.users)})),concept_metrics:conceptMetrics,retention,journey_signals:{inspiration:(eventMap.wallet_saved||0)+(eventMap.wallet_recipe_connected||0)+(eventMap.wallet_food_moment_connected||0),recipe_planning:(eventMap.planning_slot_saved||0)+(eventMap.food_moment_created||0),occasion:(eventMap.food_moment_created||0)+(eventMap.food_moment_updated||0),weekly_planning:(eventMap.planning_slot_saved||0)+(eventMap.week_template_applied||0),shopping:(eventMap.recipe_to_shopping||0)+(eventMap.food_moment_to_shopping||0)+(eventMap.shopping_item_toggled||0)}};
}

async function getLogins(workspaceId,days=28){
    const d=safeDays(days), since=`-${d} days`;
    const rows=await all(`SELECT s.id,s.user_id,u.display_name,u.email,s.created_at login_at,s.last_seen_at,s.expires_at,s.revoked_at,s.user_agent FROM user_sessions s JOIN users u ON u.id=s.user_id JOIN workspace_memberships wm ON wm.user_id=u.id AND wm.workspace_id=? WHERE s.created_at>=datetime('now',?) GROUP BY s.id ORDER BY s.created_at DESC LIMIT 1000`,[workspaceId,since]);
    return rows.map(r=>({...r,...deviceFromUa(r.user_agent)}));
}

async function getJourneys(workspaceId,days=28,limit=80){
    const d=safeDays(days), since=`-${d} days`, lim=Math.min(300,Math.max(10,Number(limit)||80));
    const rows=await all(`SELECT pe.id,pe.user_id,u.display_name,u.email,pe.session_id,pe.event_name,pe.event_category,pe.path,pe.entity_type,pe.entity_reference,pe.properties_json,pe.created_at FROM product_events pe LEFT JOIN users u ON u.id=pe.user_id WHERE pe.workspace_id=? AND pe.created_at>=datetime('now',?) ORDER BY pe.created_at DESC,pe.id DESC LIMIT ?`,[workspaceId,since,lim]);
    return rows.map(r=>({...r,properties:parseJson(r.properties_json)}));
}
async function getUserDetail(workspaceId,userId,days=28){
    const d=safeDays(days), since=`-${d} days`;
    const user=await get(`SELECT u.id,u.public_id,u.display_name,u.email FROM users u JOIN workspace_memberships wm ON wm.user_id=u.id AND wm.workspace_id=? WHERE u.id=? LIMIT 1`,[workspaceId,userId]); if(!user)return null;
    const [events,sessions]=await Promise.all([
        all(`SELECT id,event_name,event_category,path,entity_type,entity_reference,properties_json,created_at,session_id FROM product_events WHERE workspace_id=? AND user_id=? AND created_at>=datetime('now',?) ORDER BY created_at DESC,id DESC LIMIT 500`,[workspaceId,userId,since]),
        all(`SELECT id,created_at,last_seen_at,expires_at,revoked_at,user_agent FROM user_sessions WHERE user_id=? AND created_at>=datetime('now',?) ORDER BY created_at DESC LIMIT 200`,[userId,since])
    ]);
    return {user,events:events.map(r=>({...r,properties:parseJson(r.properties_json)})),sessions:sessions.map(r=>({...r,...deviceFromUa(r.user_agent)}))};
}
function stepMatches(e,step){return e.event_name===step.event && (!step.path||String(e.path||'').includes(step.path));}
function funnelCounts(events,steps){
    const bySession=new Map(); for(const e of events){if(!e.session_id)continue;if(!bySession.has(e.session_id))bySession.set(e.session_id,[]);bySession.get(e.session_id).push(e);} const out=[];
    for(let i=0;i<steps.length;i++){let count=0;for(const list of bySession.values()){let pos=-1,ok=true;for(let s=0;s<=i;s++){let found=-1;for(let k=pos+1;k<list.length;k++){if(stepMatches(list[k],steps[s])){found=k;break;}}if(found<0){ok=false;break;}pos=found;}if(ok)count++;}out.push({step:steps[i].label||steps[i].event,event_name:steps[i].event,sessions:count});}return out;
}
async function getFunnels(workspaceId,days=28){
    const d=safeDays(days), since=`-${d} days`; const events=await all(`SELECT session_id,event_name,path,created_at FROM product_events WHERE workspace_id=? AND created_at>=datetime('now',?) ORDER BY session_id,created_at,id`,[workspaceId,since]);
    return [
        {key:'food_moment',label:'Food Moment erstellen',steps:funnelCounts(events,[{event:'page_view',path:'foodMomentCreate',label:'Erstellung geöffnet'},{event:'food_moment_created',label:'Food Moment gespeichert'}])},
        {key:'inspiration_to_recipe',label:'Inspiration → Rezept',steps:funnelCounts(events,[{event:'wallet_saved',label:'Inspiration gespeichert'},{event:'wallet_recipe_connected',label:'Mit Rezept verknüpft'}])},
        {key:'planning',label:'Wochenplanung',steps:funnelCounts(events,[{event:'page_view',path:'mealPlan',label:'Planung geöffnet'},{event:'planning_slot_saved',label:'Planung gespeichert'}])},
        {key:'shopping',label:'Inhalt → Einkauf',steps:funnelCounts(events,[{event:'page_view',path:'shopping',label:'Einkaufen geöffnet'},{event:'shopping_item_toggled',label:'Einkauf aktiv genutzt'}])}
    ];
}
module.exports={recordEvent,trackingMiddleware,getSummary,getLogins,getJourneys,getUserDetail,getFunnels};
