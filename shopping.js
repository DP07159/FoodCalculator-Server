const SHOPPING_API_URL = "https://foodcalculator-server.onrender.com";
let shoppingState = { active: [], completed: [] };
let shoppingSetupDone = false;
let shoppingShareOptions = [];
const $ = id => document.getElementById(id);
function esc(v){const d=document.createElement('div');d.textContent=v??'';return d.innerHTML;}
function toast(message){const t=$('app-toast');if(!t)return alert(message);t.textContent=message;t.classList.remove('is-hidden');t.classList.add('is-visible');clearTimeout(toast.t);toast.t=setTimeout(()=>{t.classList.add('is-hidden');t.classList.remove('is-visible');},2200);}
async function api(path,options={}){const headers=new Headers(options.headers||{});if(options.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');const r=await AuthShell.request(`${SHOPPING_API_URL}${path}`,{...options,headers});const p=await r.json().catch(()=>null);if(!r.ok)throw new Error(p?.error||'Serverfehler');return p;}
function fmtAmount(item){if(item.amount===null||item.amount===undefined)return '';const n=Number(item.amount);return `${new Intl.NumberFormat('de-DE',{maximumFractionDigits:2}).format(n)}${item.unit?` ${esc(item.unit)}`:''}`;}
function sourceSummary(item){const count=Number(item.source_count)||0;if(!count)return '';if(count===1)return esc(item.sources?.[0]?.label||'1 Quelle');return `${count} Quellen`;}
function row(item){const data=`data-key="${esc(item.canonical_key)}" data-unit="${esc(item.unit||'')}"`;return `<article class="shopping-row ${item.completed?'is-completed':''}" ${data}><button class="shopping-check" type="button" aria-label="${item.completed?'Zurück auf die Liste':'Abhaken'}" data-shopping-toggle><span>✓</span></button><div class="shopping-row-main"><strong>${esc(item.name)}</strong><div class="shopping-row-meta">${fmtAmount(item)?`<span>${fmtAmount(item)}</span>`:''}${item.unspecified_count>0?`<span>${item.unspecified_count}× ohne Mengenangabe</span>`:''}${item.source_count?`<button type="button" data-shopping-sources>${sourceSummary(item)}</button>`:''}</div></div><button class="shopping-row-menu" type="button" data-shopping-delete aria-label="Eintrag entfernen">×</button></article>`;}
function render(){const active=shoppingState.active||[],done=shoppingState.completed||[];$('shopping-active').innerHTML=active.map(row).join('');$('shopping-completed').innerHTML=done.map(row).join('');const empty=$('shopping-empty'); const hasItems=active.length>0||done.length>0; empty.classList.toggle('is-hidden',hasItems); empty.hidden=hasItems;$('shopping-completed-section').classList.toggle('is-hidden',done.length===0);bindRows();}
function bindRows(){document.querySelectorAll('[data-shopping-toggle]').forEach(b=>b.onclick=()=>toggleGroup(b.closest('.shopping-row')));document.querySelectorAll('[data-shopping-delete]').forEach(b=>b.onclick=()=>deleteGroup(b.closest('.shopping-row')));document.querySelectorAll('[data-shopping-sources]').forEach(b=>b.onclick=()=>openSources(b.closest('.shopping-row')));}
function findItem(rowEl){const key=rowEl?.dataset.key,unit=rowEl?.dataset.unit||'';return [...(shoppingState.active||[]),...(shoppingState.completed||[])].find(x=>x.canonical_key===key&&(x.unit||'')===unit);}
async function load(){try{shoppingState=await api('/shopping-list');render();}catch(e){toast(e.message);}}
async function toggleGroup(el){const item=findItem(el);if(!item)return;try{shoppingState=await api('/shopping-list/group',{method:'PATCH',body:JSON.stringify({canonical_key:item.canonical_key,unit:item.unit,completed:!item.completed})});render();}catch(e){toast(e.message);}}
async function deleteGroup(el){const item=findItem(el);if(!item)return;try{shoppingState=await api('/shopping-list/group',{method:'DELETE',body:JSON.stringify({canonical_key:item.canonical_key,unit:item.unit})});render();}catch(e){toast(e.message);}}
function openSources(el){const item=findItem(el);if(!item)return;const sources=[]; const seen=new Set(); for(const src of (item.sources||[])){const key=[src.type,src.recipe_id||'',src.food_moment_public_id||'',src.label||''].join('|');if(seen.has(key))continue;seen.add(key);sources.push(src);} $('shopping-source-list').innerHTML=sources.map(s=>{const type=s.type==='manual'?'Manuell':s.type==='food_moment'?'Food Moment':s.type==='workspace_share'?'Geteilt':'Rezept';const href=s.recipe_id?`/recipeInstructions.html?id=${Number(s.recipe_id)}`:(s.food_moment_public_id?`/foodMoment.html?id=${encodeURIComponent(s.food_moment_public_id)}`:'');return `<div class="shopping-source-entry"><span>${type}</span>${href?`<a class="shopping-source-link" href="${href}"><strong>${esc(s.label)}</strong><svg class="fc-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></a>`:`<strong>${esc(s.label)}</strong>`}</div>`;}).join('');$('shopping-source-popover').classList.remove('is-hidden');}
function closeSources(){$('shopping-source-popover').classList.add('is-hidden');}

function renderShoppingShareOptions(){
    const list=$('shopping-share-list'); if(!list)return;
    const query=String($('shopping-share-search')?.value||'').trim().toLocaleLowerCase('de');
    const options=shoppingShareOptions.filter(workspace=>`${workspace.name} ${workspace.workspace_type||''}`.toLocaleLowerCase('de').includes(query));
    list.innerHTML=options.length?options.map(workspace=>`<label class="selection-option"><span class="selection-option-leading"><span class="selection-option-icon">${workspace.workspace_type==='personal'?'⌂':'♟'}</span><span class="selection-option-copy"><strong>${esc(workspace.name)}</strong><small>${workspace.workspace_type==='personal'?'Persönlicher Workspace':'Gemeinsamer Workspace'}</small></span></span><input class="shopping-share-checkbox" type="checkbox" value="${esc(workspace.public_id)}" ${workspace.is_assigned?'checked':''}><span class="selection-check" aria-hidden="true">✓</span></label>`).join(''):'<p class="selection-empty">Kein weiterer Workspace verfügbar.</p>';
}
async function openShoppingShare(){
    const dialog=$('shopping-share-dialog'); if(!dialog)return;
    try{
        const payload=await api('/shopping-list/workspace-shares');
        shoppingShareOptions=Array.isArray(payload?.workspaces)?payload.workspaces:[];
        if($('shopping-share-search')) $('shopping-share-search').value='';
        if($('shopping-share-state')) $('shopping-share-state').textContent='';
        renderShoppingShareOptions();
        dialog.showModal();
    }catch(error){toast(error.message);}
}
function closeShoppingShare(){const dialog=$('shopping-share-dialog');if(dialog?.open)dialog.close();}
async function saveShoppingShare(){
    const state=$('shopping-share-state');
    const selected=[...document.querySelectorAll('.shopping-share-checkbox:checked')].map(input=>input.value);
    try{
        if(state) state.textContent='Wird geteilt …';
        const payload=await api('/shopping-list/workspace-shares',{method:'PUT',body:JSON.stringify({workspace_public_ids:selected})});
        shoppingShareOptions=Array.isArray(payload?.workspaces)?payload.workspaces:shoppingShareOptions;
        if(state) state.textContent='Gespeichert.';
        toast(selected.length?`Einkaufsliste mit ${selected.length} Workspace${selected.length===1?'':'s'} geteilt.`:'Freigaben entfernt.');
        setTimeout(closeShoppingShare,180);
    }catch(error){if(state)state.textContent=error.message;else toast(error.message);}
}
function setup(){if(shoppingSetupDone)return;shoppingSetupDone=true;document.getElementById('burger-button')?.addEventListener('click',()=>window.PlatformNavigation?.toggleMenu?.());$('shopping-share-toggle').onclick=openShoppingShare;$('shopping-share-close').onclick=closeShoppingShare;$('shopping-share-done').onclick=saveShoppingShare;$('shopping-share-search').addEventListener('input',renderShoppingShareOptions);$('shopping-share-dialog').addEventListener('click',e=>{if(e.target===$('shopping-share-dialog'))closeShoppingShare();});$('shopping-add-toggle').onclick=()=>$('shopping-add-panel').classList.toggle('is-hidden');$('shopping-add-form').onsubmit=async e=>{e.preventDefault();const body={name:$('shopping-name').value,amount:$('shopping-amount').value||null,unit:$('shopping-unit').value};try{shoppingState=await api('/shopping-list/manual',{method:'POST',body:JSON.stringify(body)});e.target.reset();$('shopping-add-panel').classList.add('is-hidden');render();toast('Zur Einkaufsliste hinzugefügt.');}catch(err){toast(err.message);}};$('shopping-clear-completed').onclick=async()=>{try{const r=await api('/shopping-list/completed',{method:'DELETE'});shoppingState=r.list;render();toast('Erledigte entfernt.');}catch(e){toast(e.message);}};$('shopping-source-close').onclick=closeSources;$('shopping-source-popover').onclick=e=>{if(e.target===$('shopping-source-popover'))closeSources();};}
document.addEventListener('auth:ready',()=>{setup();load();});if(window.AuthShell?.isReady?.()){setup();load();}
