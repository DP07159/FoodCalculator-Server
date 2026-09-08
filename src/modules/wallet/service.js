const crypto=require("crypto"); const database=require("../../database/database"); const repository=require("./repository"); const validator=require("./validator"); const sourceMetadata=require("./sourceMetadata"); const recipeService=require("../recipes/service");
function detectPlatform(sourceUrl){if(!sourceUrl)return null;try{const host=new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./,"");if(host.endsWith("instagram.com"))return"instagram";if(host.endsWith("tiktok.com"))return"tiktok";if(host.endsWith("youtube.com")||host==="youtu.be")return"youtube";if(host.endsWith("pinterest.com")||host.endsWith("pin.it"))return"pinterest";return host;}catch(_){return null;}}
function mapItem(row,userId){if(!row)return null;return{public_id:row.public_id,source_type:row.source_type,source_url:row.source_url,source_platform:row.source_platform,source_image_url:row.source_image_url||null,source_page_title:row.source_page_title||null,title:row.title,note:row.note,category:row.category||null,status:row.status,saved_at:row.saved_at,created_at:row.created_at,updated_at:row.updated_at,created_by_name:row.created_by_name||null,workspace_assignment_count:Number(row.workspace_assignment_count)||1,recipe_link_count:Number(row.recipe_link_count)||0,food_moment_link_count:Number(row.food_moment_link_count)||0,can_manage:Number(row.created_by_user_id)===Number(userId)};}
async function listItems(workspaceId,status,userId){return (await repository.listItems(workspaceId,status)).map(row=>mapItem(row,userId));}
async function previewSource(payload){const validation=validator.validatePreview(payload);if(validation.error)return validation;return {value:await sourceMetadata.preview(validation.value.source_url)};}
async function createItem({workspaceId,userId,payload}){const validation=validator.validateCreate(payload);if(validation.error)return validation;const value=validation.value;let meta={title:value.source_page_title,image_url:value.source_image_url,final_url:value.source_url};if(value.source_url&&(!meta.title||!meta.image_url))meta=await sourceMetadata.preview(value.source_url);const publicId=crypto.randomUUID();await database.run("BEGIN");try{const walletItemId=await repository.insertItem({public_id:publicId,workspace_id:workspaceId,created_by_user_id:userId,source_type:value.source_type,source_url:meta.final_url||value.source_url,source_platform:detectPlatform(meta.final_url||value.source_url),source_external_id:null,source_image_url:value.source_image_url||meta.image_url||null,source_page_title:value.source_page_title||meta.title||null,title:value.title||meta.title||null,note:value.note,category:value.category});await repository.addWorkspaceAssignment({walletItemId,workspaceId,assignedByUserId:userId});await database.run("COMMIT");return {value:mapItem(await repository.findByPublicId(workspaceId,publicId),userId)};}catch(error){await database.run("ROLLBACK").catch(()=>{});throw error;}}
async function updateItem({workspaceId,userId,publicId,payload}){const validation=validator.validateUpdate(payload);if(validation.error)return validation;const visible=await repository.findByPublicId(workspaceId,publicId);if(!visible)return{notFound:true};if(Number(visible.created_by_user_id)!==Number(userId))return{forbidden:true,error:"Nur der Ersteller kann diese Inspiration bearbeiten."};const fields={...validation.value};if(Object.prototype.hasOwnProperty.call(fields,'source_url'))fields.source_platform=detectPlatform(fields.source_url);const changed=await repository.updateItemByOwner(publicId,userId,fields);if(!changed)return{notFound:true};return{value:mapItem(await repository.findByPublicId(workspaceId,publicId),userId)};}
async function deleteItem(workspaceId,userId,publicId){const visible=await repository.findByPublicId(workspaceId,publicId);if(!visible)return{notFound:true};if(Number(visible.created_by_user_id)!==Number(userId))return{forbidden:true,error:"Nur der Ersteller kann diese Inspiration löschen."};return{deleted:(await repository.deleteItemByOwner(publicId,userId))>0};}

async function getRecipeLinkOptions({workspaceId,userId,publicId}){
    const item=await repository.findByPublicId(workspaceId,publicId);
    if(!item)return{notFound:true};
    const recipes=await recipeService.getAllRecipes(workspaceId);
    const links=await repository.listRecipeLinksForItem(item.id,workspaceId);
    const linked=new Set(links.map(link=>Number(link.recipe_id)));
    return{value:{wallet_public_id:publicId,recipes:recipes.map(recipe=>({id:Number(recipe.id),name:recipe.name||`Rezept ${recipe.id}`,is_linked:linked.has(Number(recipe.id))}))}};
}
async function setRecipeLinks({workspaceId,userId,publicId,recipeIds}){
    const item=await repository.findByPublicId(workspaceId,publicId);
    if(!item)return{notFound:true};
    if(!Array.isArray(recipeIds))return{error:"recipe_ids muss eine Liste sein."};
    const recipes=await recipeService.getAllRecipes(workspaceId);
    const allowed=new Map(recipes.map(recipe=>[Number(recipe.id),recipe]));
    const desired=[...new Set(recipeIds.map(Number).filter(id=>Number.isInteger(id)&&id>0&&allowed.has(id)))];
    if(desired.length!==[...new Set(recipeIds.map(Number).filter(id=>Number.isInteger(id)&&id>0))].length)return{error:"Mindestens ein Rezept ist in diesem Workspace nicht verfügbar."};
    const existing=await repository.listRecipeLinksForItem(item.id,workspaceId);
    const existingIds=new Set(existing.map(link=>Number(link.recipe_id)));
    await database.run("BEGIN");
    try{
        for(const id of desired){if(!existingIds.has(id))await repository.addRecipeLink({walletItemId:item.id,recipeId:id,linkedByUserId:userId});}
        for(const id of existingIds){if(!desired.includes(id))await repository.removeRecipeLink(item.id,id);}
        await database.run("COMMIT");
    }catch(error){await database.run("ROLLBACK").catch(()=>{});throw error;}
    return getRecipeLinkOptions({workspaceId,userId,publicId});
}
async function addRecipeLink({workspaceId,userId,publicId,recipeId}){
    const item=await repository.findByPublicId(workspaceId,publicId);
    if(!item)return{notFound:true};
    const recipe=await recipeService.getRecipeById(recipeId,workspaceId,userId);
    if(!recipe)return{error:"Das Rezept ist in diesem Workspace nicht verfügbar."};
    await repository.addRecipeLink({walletItemId:item.id,recipeId:Number(recipeId),linkedByUserId:userId});
    return{value:{success:true,recipe_id:Number(recipeId)}};
}
async function getItemsForRecipe({workspaceId,userId,recipeId}){
    const recipe=await recipeService.getRecipeById(recipeId,workspaceId,userId);
    if(!recipe)return{notFound:true};
    return{value:(await repository.listItemsForRecipe(Number(recipeId),workspaceId)).map(row=>mapItem(row,userId))};
}

async function getFoodMomentLinkOptions({workspaceId,userId,publicId}){
 const item=await repository.findByPublicId(workspaceId,publicId);if(!item)return{notFound:true};
 const moments=await repository.listFoodMomentLinksForItem(item.id,workspaceId);
 return{value:{wallet_public_id:publicId,food_moments:moments.map(m=>({public_id:m.public_id,title:m.title||'Food Moment',moment_date:m.moment_date||null,moment_time:m.moment_time||null,starts_at:m.starts_at||null,status:m.status||null,is_linked:Number(m.is_linked)===1}))}};
}
async function setFoodMomentLinks({workspaceId,userId,publicId,foodMomentPublicIds}){
 const item=await repository.findByPublicId(workspaceId,publicId);if(!item)return{notFound:true};if(!Array.isArray(foodMomentPublicIds))return{error:'food_moment_public_ids muss eine Liste sein.'};
 const options=await repository.listFoodMomentLinksForItem(item.id,workspaceId),allowed=new Map(options.map(m=>[m.public_id,m]));
 const desired=[...new Set(foodMomentPublicIds.map(String).map(v=>v.trim()).filter(Boolean))];if(desired.some(id=>!allowed.has(id)))return{error:'Mindestens ein Food Moment ist in diesem Workspace nicht verfügbar.'};
 const existingIds=new Set(options.filter(m=>Number(m.is_linked)===1).map(m=>m.public_id));await database.run('BEGIN');try{
  for(const id of desired){if(existingIds.has(id))continue;const m=allowed.get(id);await repository.addFoodMomentLink({walletItemId:item.id,foodMomentId:m.id});await database.run(`INSERT OR IGNORE INTO wallet_item_relations(wallet_item_id,target_type,target_reference,created_by_user_id) VALUES(?,'food_moment',?,?)`,[item.id,id,userId]);}
  for(const id of existingIds){if(desired.includes(id))continue;const m=allowed.get(id);if(m)await repository.removeFoodMomentLink(item.id,m.id);await database.run(`DELETE FROM wallet_item_relations WHERE wallet_item_id=? AND target_type='food_moment' AND target_reference=?`,[item.id,id]);}
  await database.run('COMMIT');
 }catch(error){await database.run('ROLLBACK').catch(()=>{});throw error;}return getFoodMomentLinkOptions({workspaceId,userId,publicId});
}

module.exports={listItems,createItem,updateItem,deleteItem,detectPlatform,previewSource,getRecipeLinkOptions,setRecipeLinks,addRecipeLink,getItemsForRecipe,getFoodMomentLinkOptions,setFoodMomentLinks};
