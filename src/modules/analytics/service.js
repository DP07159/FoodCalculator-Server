const { run, all, get } = require('../../database/database');

function clean(value, max = 255) { return String(value ?? '').trim().slice(0, max); }
function json(value) { try { return JSON.stringify(value && typeof value === 'object' ? value : {}); } catch { return '{}'; } }

async function recordEvent({ eventName, eventCategory='module', userId=null, workspaceId=null, sessionId='', path='', method='', entityType='', entityReference='', properties={} }) {
    const name = clean(eventName, 80);
    if (!name) return;
    await run(`INSERT INTO product_events(event_name,event_category,user_id,workspace_id,session_id,path,method,entity_type,entity_reference,properties_json)
               VALUES(?,?,?,?,?,?,?,?,?,?)`, [name, clean(eventCategory,40)||'module', userId||null, workspaceId||null, clean(sessionId,120)||null, clean(path,300)||null, clean(method,12)||null, clean(entityType,50)||null, clean(entityReference,160)||null, json(properties)]);
}

function classifyRequest(method, path) {
    const p = String(path || '').split('?')[0];
    if (method === 'POST' && p === '/recipes') return ['recipe_created','module','recipe'];
    if (method === 'PUT' && /^\/recipes\/\d+$/.test(p)) return ['recipe_updated','module','recipe'];
    if (method === 'POST' && p === '/wallet') return ['wallet_saved','module','wallet'];
    if (method === 'PUT' && /\/wallet\/[^/]+\/recipe-links$/.test(p)) return ['wallet_recipe_connected','connection','wallet_recipe'];
    if (method === 'POST' && /\/wallet\/[^/]+\/recipe-links$/.test(p)) return ['wallet_recipe_connected','connection','wallet_recipe'];
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

function trackingMiddleware(req, res, next) {
    const started = Date.now();
    res.on('finish', () => {
        if (res.statusCode >= 400 || req.path.startsWith('/analytics')) return;
        const match = classifyRequest(req.method, req.path);
        if (!match) return;
        const [eventName,eventCategory,entityType] = match;
        const ref = req.params?.publicId || req.params?.id || req.body?.public_id || req.body?.recipe_id || '';
        recordEvent({
            eventName,eventCategory,entityType,entityReference: ref,
            userId:req.auth?.user?.id, workspaceId:req.workspaceId,
            sessionId:req.headers['x-product-session-id'] || '', path:req.path, method:req.method,
            properties:{ duration_ms: Date.now()-started, source:req.body?.source_code || null }
        }).catch(err => console.warn('Analytics event konnte nicht gespeichert werden:', err.message));
    });
    next();
}

async function getSummary(workspaceId, days=28) {
    const safeDays = Math.min(365, Math.max(1, Number(days)||28));
    const since = `-${safeDays} days`;
    const [totals, events, daily, users] = await Promise.all([
        get(`SELECT COUNT(*) total_events, COUNT(DISTINCT user_id) active_users, COUNT(DISTINCT session_id) sessions,
             SUM(CASE WHEN event_category='connection' THEN 1 ELSE 0 END) connection_events
             FROM product_events WHERE workspace_id=? AND created_at>=datetime('now',?)`, [workspaceId,since]),
        all(`SELECT event_name,event_category,COUNT(*) count,COUNT(DISTINCT user_id) users FROM product_events WHERE workspace_id=? AND created_at>=datetime('now',?) GROUP BY event_name,event_category ORDER BY count DESC,event_name`, [workspaceId,since]),
        all(`SELECT date(created_at) day, COUNT(*) events, COUNT(DISTINCT user_id) users, SUM(CASE WHEN event_category='connection' THEN 1 ELSE 0 END) connections FROM product_events WHERE workspace_id=? AND created_at>=datetime('now',?) GROUP BY date(created_at) ORDER BY day`, [workspaceId,since]),
        all(`SELECT user_id, COUNT(*) events, COUNT(DISTINCT session_id) sessions, SUM(CASE WHEN event_category='connection' THEN 1 ELSE 0 END) connections, MIN(created_at) first_seen, MAX(created_at) last_seen FROM product_events WHERE workspace_id=? AND created_at>=datetime('now',?) AND user_id IS NOT NULL GROUP BY user_id ORDER BY events DESC`, [workspaceId,since])
    ]);
    const eventMap = Object.fromEntries(events.map(e=>[e.event_name,Number(e.count)]));
    const journeySignals = {
        inspiration: (eventMap.wallet_saved||0) + (eventMap.wallet_recipe_connected||0) + (eventMap.wallet_food_moment_connected||0),
        recipe_planning: (eventMap.planning_slot_saved||0) + (eventMap.food_moment_created||0),
        occasion: (eventMap.food_moment_created||0) + (eventMap.food_moment_updated||0),
        weekly_planning: (eventMap.planning_slot_saved||0) + (eventMap.week_template_applied||0),
        shopping: (eventMap.recipe_to_shopping||0) + (eventMap.food_moment_to_shopping||0) + (eventMap.shopping_item_toggled||0)
    };
    return { range_days:safeDays, totals:{...totals, total_events:Number(totals?.total_events||0), active_users:Number(totals?.active_users||0), sessions:Number(totals?.sessions||0), connection_events:Number(totals?.connection_events||0)}, events:events.map(e=>({...e,count:Number(e.count),users:Number(e.users)})), daily:daily.map(d=>({...d,events:Number(d.events),users:Number(d.users),connections:Number(d.connections||0)})), users:users.map(u=>({...u,events:Number(u.events),sessions:Number(u.sessions),connections:Number(u.connections||0)})), journey_signals:journeySignals };
}
module.exports={recordEvent,trackingMiddleware,getSummary};
