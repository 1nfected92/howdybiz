import {prepareEnvelope,mime,publicUrl,isPublicAddress,extractEmail,websiteAssessment,combineQuery,distanceMiles,cleanText,validEmail,VALID_STAGES} from '../_shared/safety.js';
const env=name=>Deno.env.get(name)||'';
const origin=()=>new URL(env('APP_URL')).origin;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':origin(),'Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store','Vary':'Origin'}});
async function db(path,method='GET',body){
  const r=await fetch(env('SUPABASE_URL')+'/rest/v1/'+path,{method,headers:{apikey:env('SUPABASE_SERVICE_ROLE_KEY'),Authorization:'Bearer '+env('SUPABASE_SERVICE_ROLE_KEY'),'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
  const data=await r.json().catch(()=>null);if(!r.ok)throw Error(data?.message||'Database request failed.');return data;
}
const rpc=(name,args)=>db('rpc/'+name,'POST',args);
const privateData=(table,method,user,data={})=>rpc('howdy_private',{p_table:table,p_method:method,p_user:user,p_data:data});
async function auth(req){const header=req.headers.get('Authorization');if(!header?.startsWith('Bearer '))throw Error('Sign in to continue.');const r=await fetch(env('SUPABASE_URL')+'/auth/v1/user',{headers:{apikey:env('SUPABASE_ANON_KEY'),Authorization:header},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Invalid or expired session.');const u=await r.json();if(!u.email_confirmed_at||!env('OWNER_EMAIL')||u.email?.toLowerCase()!==env('OWNER_EMAIL').toLowerCase())throw Error('Only the verified workspace owner can access this application.');return u;}
async function settings(user){let s=(await db('workspace_settings?user_id=eq.'+user))[0];if(!s)s=(await db('workspace_settings','POST',{user_id:user}))[0];return s;}
function assertRevision(s,revision){if(s.revision!==revision)throw Error('Workspace mode changed. Reload and try again.');}
async function records(user){const [businesses,activity]=await Promise.all([db('businesses?user_id=eq.'+user+'&or=(expires_at.is.null,expires_at.gt.'+encodeURIComponent(new Date().toISOString())+')&order=created_at.desc'),db('activity?user_id=eq.'+user+'&order=at.desc&limit=1000')]);return businesses.map(b=>({...b.data,id:b.id,place_id:b.place_id,mode:b.mode,activity:activity.filter(a=>a.business_id===b.id).map(({id,at,label,detail})=>({id,at,label,detail}))}));}
function cleanBusiness(b){
  if(!b||typeof b!=='object')throw Error('Invalid business.');
  const r={name:cleanText(b.name,200),category:cleanText(b.category||'',120),address:cleanText(b.address||'',500),zip:cleanText(b.zip||'',30),phone:cleanText(b.phone||'',60),email:cleanText(b.email||'',254),website:cleanText(b.website||'',2000),website_status:['Working','Missing','Unavailable','Unchecked'].includes(b.website_status)?b.website_status:'Unchecked',score:['Potential','Possible','Not Needed'].includes(b.score)?b.score:'Possible',explanation:cleanText(b.explanation||'Further review required.',2000),stage:VALID_STAGES.includes(b.stage)?b.stage:'New',source:cleanText(b.source||'Unverified',1000),contact_source:cleanText(b.contact_source||'',2000),sample:b.sample===true,last_checked:new Date().toISOString(),notes:'',proposals:[],payments:[],tasks:[]};
  if(r.email&&!validEmail(r.email))throw Error('Invalid public email.');if(r.contact_source)publicUrl(r.contact_source);if(r.website&&!r.sample)publicUrl(r.website);return r;
}
async function saveBusiness(user,b,mode,revision,importing=false){
  const place_id=cleanText(b.place_id||'',200);if(!place_id)throw Error('A source identifier is required.');
  const data=cleanBusiness(b);
  // Google content is transient: persist independently sourced contacts, the place
  // identifier and CRM fields. Listing name/address/category are refetched later.
  if(!b.sample&&b.source==='Google Maps'){data.name=b.independent_name||'Business '+place_id.slice(-8);data.address='';data.category='';data.zip='';data.source=b.contact_source?'Public business website':'Google place identifier; contact enrichment required';}
  return rpc('howdy_store_business',{p_user:user,p_place:place_id,p_mode:mode,p_revision:revision,p_data:data,p_import:importing});
}
async function addActivity(user,id,label,detail){await db('activity','POST',{user_id:user,business_id:id,label,detail});}
async function encryptedToken(token,decrypt=false){
  const raw=Uint8Array.from(atob(env('GMAIL_TOKEN_KEY')),c=>c.charCodeAt(0));if(raw.length!==32)throw Error('Configure a 32-byte GMAIL_TOKEN_KEY.');const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
  if(decrypt){const data=JSON.parse(token);const bytes=Uint8Array.from(atob(data.ciphertext),c=>c.charCodeAt(0));return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:Uint8Array.from(atob(data.iv),c=>c.charCodeAt(0))},key,bytes));}
  const iv=crypto.getRandomValues(new Uint8Array(12));const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(token)));return JSON.stringify({iv:btoa(String.fromCharCode(...iv)),ciphertext:btoa(String.fromCharCode(...ciphertext))});
}
async function googleToken(account){
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env('GOOGLE_CLIENT_ID'),client_secret:env('GOOGLE_CLIENT_SECRET'),grant_type:'refresh_token',refresh_token:await encryptedToken(account.refresh_token,true)}),signal:AbortSignal.timeout(12000)});const data=await r.json();if(!r.ok||!data.access_token)throw Error('Gmail authorization expired. Reconnect Gmail.');return data.access_token;
}
async function googleIdentity(token){const r=await fetch('https://www.googleapis.com/oauth2/v2/userinfo',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Could not verify the Google account.');const p=await r.json();if(!p.verified_email||!validEmail(p.email))throw Error('Google account email is not verified.');return p;}
async function callback(url){
  const code=url.searchParams.get('code'),state=url.searchParams.get('state');if(!state||!code)throw Error('Google authorization was not completed.');
  const saved=await privateData('oauth','consume',null,{state});if(!saved)throw Error('OAuth state expired or already used.');
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env('GOOGLE_CLIENT_ID'),client_secret:env('GOOGLE_CLIENT_SECRET'),code,grant_type:'authorization_code',redirect_uri:env('SUPABASE_URL')+'/functions/v1/api'}),signal:AbortSignal.timeout(15000)});
  const tokens=await r.json();if(!r.ok||!tokens.refresh_token)throw Error('Google did not return offline authorization. Reconnect with consent.');
  const profile=await googleIdentity(tokens.access_token);if(profile.email.toLowerCase()!==env('OWNER_EMAIL').toLowerCase())throw Error('Connect the workspace owner Gmail account.');
  const ur=await fetch(env('SUPABASE_URL')+'/auth/v1/admin/users/'+saved.user_id,{headers:{apikey:env('SUPABASE_SERVICE_ROLE_KEY'),Authorization:'Bearer '+env('SUPABASE_SERVICE_ROLE_KEY')}});const user=await ur.json();if(!ur.ok||user.email?.toLowerCase()!==profile.email.toLowerCase())throw Error('Google and workspace accounts must match.');
  if(!tokens.scope?.split(' ').includes('https://www.googleapis.com/auth/gmail.send'))throw Error('Gmail send authorization was not granted.');
  await privateData('gmail','put',saved.user_id,{email:profile.email,refresh_token:await encryptedToken(tokens.refresh_token)});
  return Response.redirect(env('APP_URL')+'?gmail=connected',303);
}
async function websiteFetch(value){
  let u=publicUrl(value);
  for(let hops=0;hops<4;hops++){
    const addresses=await Promise.allSettled([Deno.resolveDns(u.hostname,'A'),Deno.resolveDns(u.hostname,'AAAA')]);
    const ips=addresses.filter(r=>r.status==='fulfilled').flatMap(r=>r.value);
    if(!ips.length||ips.some(ip=>!isPublicAddress(ip)))throw Error('Website DNS could not be safely verified.');
    const r=await fetch(u,{redirect:'manual',headers:{'User-Agent':'HowdyBiz/1.0 public website contact check'},signal:AbortSignal.timeout(6000)});
    if(r.status>=300&&r.status<400&&r.headers.get('Location')){await r.body?.cancel();u=publicUrl(new URL(r.headers.get('Location'),u).href);continue;}
    if(!r.headers.get('Content-Type')?.includes('text/html')){await r.body?.cancel();return {status:r.status,html:'',url:u.href};}
    const reader=r.body?.getReader();let total=0,parts=[];if(reader){while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>500000){await reader.cancel();break;}parts.push(value);} }
    const bytes=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
    return {status:r.status,html:new TextDecoder().decode(bytes),url:u.href};
  }throw Error('Too many website redirects.');
}
async function enrich(website){
  if(!website)return {email:'',phone:'',contact_source:'',independent_name:''};
  try{const page=await websiteFetch(website);const name=page.html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i)?.[1]||page.html.match(/<title[^>]*>([^<]+)/i)?.[1]||'';let email=extractEmail(page.html);const phone=page.html.match(/href=["']tel:([^"']+)/i)?.[1]?.replace(/[^+\d() .-]/g,'')||'';let source=page.url;
    if(!email){const link=page.html.match(/href=["']([^"']*(?:contact|about)[^"']*)["']/i)?.[1];if(link){const target=new URL(link,page.url);if(target.hostname===new URL(page.url).hostname){const contact=await websiteFetch(target.href);email=extractEmail(contact.html);if(email)source=contact.url;}}}
    return {email,phone,contact_source:email||phone?source:'',independent_name:name.slice(0,200)};
  }catch{return {email:'',phone:'',contact_source:'',independent_name:''};}
}
async function placesCall(path,body,mask){
  if(!env('GOOGLE_PLACES_KEY'))throw Error('Configure GOOGLE_PLACES_KEY for real searches.');
  for(let n=0;n<2;n++){const r=await fetch('https://places.googleapis.com/v1/'+path,{method:body?'POST':'GET',headers:{'X-Goog-Api-Key':env('GOOGLE_PLACES_KEY'),...(mask?{'X-Goog-FieldMask':mask}:{}),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});const data=await r.json();if(r.ok)return data;if(n===0&&[429,500,502,503].includes(r.status)){await new Promise(resolve=>setTimeout(resolve,600));continue;}throw Error(data.error?.message||'Google Places request failed.');}
}
async function center(zone){const url=new URL('https://maps.googleapis.com/maps/api/geocode/json');url.searchParams.set('address',zone);url.searchParams.set('key',env('GOOGLE_PLACES_KEY'));const r=await fetch(url,{signal:AbortSignal.timeout(10000)});const data=await r.json();if(!r.ok||data.status!=='OK')throw Error('Radius search requires Geocoding API access and a resolvable location.');return {latitude:data.results[0].geometry.location.lat,longitude:data.results[0].geometry.location.lng};}
async function discovery(user,input,s){
  assertRevision(s,input.revision);if(!env('GOOGLE_PLACES_KEY'))throw Error('Google Places API key is not configured. Open Integrations.');
  const query={keyword:cleanText(input.query?.keyword||'',120),zones:cleanText(input.query?.zones||'',250),radius:String(input.query?.radius||'')};if(!query.keyword.trim()||!query.zones.trim())throw Error('Keyword and location are required.');
  const radius=query.radius?Number(query.radius):0;if(query.radius&&(!Number.isFinite(radius)||radius<1||radius>50))throw Error('Radius must be between 1 and 50 miles.');
  const zones=query.zones.split(';').map(v=>v.trim()).filter(Boolean);
  // Comma-separated ZIPs are supported; city/state commas remain intact.
  const actualZones=/^\d{5}(?:\s*,\s*\d{5})+$/.test(query.zones.trim())?query.zones.split(',').map(v=>v.trim()):zones;
  if(actualZones.length>5)throw Error('Search up to five zones per request. Separate cities with semicolons.');
  const pages=input.next?.length?await Promise.all(input.next.map(id=>privateData('page','get',user.id,{id}))):actualZones.map(zone=>({zone,query,token:null}));
  if(pages.some(p=>!p||JSON.stringify(p.query)!==JSON.stringify(query)))throw Error('Pagination expired or search criteria changed. Start a new search.');
  const businesses=[],next=[],errors=[];let fetched=0;
  for(const page of pages){try{const c=radius?await center(page.zone):null;const body={textQuery:combineQuery(query,page.zone),pageSize:20,...(page.token?{pageToken:page.token}:{}),...(c?{locationBias:{circle:{center:c,radius:Math.min(radius*1609.344,50000)}}}:{})};const response=await placesCall('places:searchText',body,'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.googleMapsUri,places.primaryTypeDisplayName,places.location,nextPageToken');
    fetched+=response.places?.length||0;
    for(let i=0;i<(response.places||[]).length;i+=4){const rows=await Promise.all(response.places.slice(i,i+4).map(async p=>{if(c&&distanceMiles(c,p.location)>radius)return null;const contact=await enrich(p.websiteUri);const b={id:crypto.randomUUID(),place_id:p.id,name:p.displayName?.text||'Business',category:p.primaryTypeDisplayName?.text||query.keyword,address:p.formattedAddress||'',zip:p.formattedAddress?.match(/\b\d{5}\b/)?.[0]||'',phone:contact.phone||p.nationalPhoneNumber||'',email:contact.email,website:p.websiteUri||'',website_status:p.websiteUri?'Unchecked':'Missing',rating:p.rating,review_count:p.userRatingCount,google_url:p.googleMapsUri,score:p.websiteUri?'Possible':'Potential',explanation:p.websiteUri?'Listed website requires further review.':'No website is listed in the current Google source; verify with the owner.',stage:'New',source:'Google Maps',mode:s.mode,sample:false,...contact,phone:contact.phone||p.nationalPhoneNumber||'',export_record:{name:contact.independent_name||'Business '+p.id.slice(-8),phone:contact.phone||'',category:'',address:'',zip:''},notes:'',proposals:[],payments:[],tasks:[],activity:[],last_checked:new Date().toISOString()};
      if(s.mode==='live'){const independentlySourced={...b,phone:contact.phone||'',name:contact.independent_name||b.name};const saved=await saveBusiness(user.id,independentlySourced,'live',s.revision);b.id=saved.id;}
      return b;}));businesses.push(...rows.filter(Boolean));}
    if(response.nextPageToken){const saved=await privateData('page','put',user.id,{query,zone:page.zone,token:response.nextPageToken});next.push(saved.id);}
  }catch(err){errors.push(page.zone+': '+err.message);}}
  const good=businesses.filter(b=>b.phone&&b.email).length;
  return {businesses,records:s.mode==='live'?await records(user.id):undefined,next,errors,message:`Fetched ${fetched} Google listings across ${pages.length} zone(s). ${good} have both contacts in this page. Results are limited to provider coverage; not an exhaustive business directory. Production retains only independently sourced contacts and CRM data.`,partial:errors.length>0||next.length>0};
}
function changes(body){
  if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Invalid update.');const out={};
  for(const k of ['stage','score','explanation','phone','email','followup','contact_source','notes','website_status','analysis','proposals','payments','draft'])if(k in body)out[k]=body[k];
  if(out.stage&&!VALID_STAGES.includes(out.stage))throw Error('Invalid stage.');if(out.score&&!['Potential','Possible','Not Needed'].includes(out.score))throw Error('Invalid opportunity.');
  if(out.score&&!out.explanation?.trim())throw Error('A scoring reason is required.');if(out.email&&!validEmail(out.email))throw Error('Invalid contact email.');
  for(const [key,max] of [['explanation',2000],['phone',60],['notes',10000],['contact_source',2000],['followup',10]])if(key in out)cleanText(out[key],max);
  if(out.contact_source)publicUrl(out.contact_source);
  if(out.followup&&!/^\d{4}-\d{2}-\d{2}$/.test(out.followup))throw Error('Invalid follow-up date.');
  for(const key of ['proposals','payments'])if(key in out){if(!Array.isArray(out[key])||out[key].length>200)throw Error('Invalid CRM collection.');for(const item of out[key]){if(!Number.isFinite(item.amount)||item.amount<0||item.amount>1000000)throw Error('Invalid USD amount.');const statuses=key==='proposals'?['Draft','Sent','Accepted','Rejected','Expired']:['Unpaid','Deposit Paid','Partially Paid','Paid','Overdue','Refunded'];if(!statuses.includes(item.status))throw Error('Invalid CRM status.');if(key==='proposals'){for(const field of ['title','scope','deliverables','timeline','terms'])cleanText(item[field]||'',10000);if(!Number.isInteger(item.version)||item.version<1)throw Error('Invalid proposal version.');cleanText(item.documents||'',5000);for(const link of (item.documents||'').split('\n').filter(Boolean))publicUrl(link.trim());}else{if(item.source!=='manual')throw Error('Only manual payments are supported.');if(!/^\d{4}-\d{2}-\d{2}$/.test(item.date))throw Error('Invalid payment date.');}}}
  if(out.draft){cleanText(out.draft.subject,180);cleanText(out.draft.body,20000);}
  if(JSON.stringify(out).length>100000)throw Error('Update is too large.');return out;
}

Deno.serve(async req=>{
  try{
    if(!env('APP_URL'))return new Response('APP_URL is not configured.',{status:503});
    if(req.method==='OPTIONS')return json({});
    const url=new URL(req.url);
    if(req.method==='GET'){try{return await callback(url);}catch{return Response.redirect(env('APP_URL')+'?gmail=failed',303);}}
    if(req.method!=='POST')return json({error:'Method not allowed'},405);
    const requester=req.headers.get('Origin');if(requester&&requester!==origin())return json({error:'Origin not allowed'},403);
    const user=await auth(req);const raw=await req.text();if(raw.length>150000)return json({error:'Request too large'},413);const input=JSON.parse(raw),action=input.action;
    if(!(await rpc('howdy_rate',{p_user:user.id,p_action:action,p_limit:action==='search'?3:action==='send'?5:30})))return json({error:'Rate limit reached. Try again in a minute.'},429);
    const s=await settings(user.id);
    if(action==='workspace'){const gmail=await privateData('gmail','get',user.id);return json({settings:s,records:await records(user.id),integrations:{places:Boolean(env('GOOGLE_PLACES_KEY')),gmail:Boolean(gmail?.verified),gmail_email:gmail?.email||null,send_issues:await privateData('ticket','issues',user.id)}});}
    if(action==='mode')return json(await rpc('howdy_mode',{p_user:user.id,p_mode:input.mode,p_revision:input.revision}));
    if(action==='clear_demo'){await rpc('howdy_clear_demo',{p_user:user.id});return json({cleared:true});}
    if(action==='resolve_send'){const ticket=await privateData('ticket','resolve',user.id,{id:input.id,status:input.status,confirmation:input.confirmation});await addActivity(user.id,ticket.business_id,'Email outcome manually resolved','Owner checked Gmail Sent and marked '+input.status+'. This is a manual record.');return json({resolved:true});}
    if(action==='search')return json(await discovery(user,input,s));
    if(action==='save_search'){if(s.mode!=='live')throw Error('Save demo searches in session storage.');return json(await db('saved_searches','POST',{user_id:user.id,query:input.query}));}
    if(action==='saved_searches')return json({searches:await db('saved_searches?user_id=eq.'+user.id+'&order=created_at.desc')});
    if(action==='update'){const row=await rpc('howdy_update',{p_user:user.id,p_id:input.id,p_revision:input.revision,p_changes:changes(input.changes),p_label:cleanText(input.label,120),p_detail:cleanText(input.detail||'',2000)});const result=(await records(user.id)).find(b=>b.id===row.id);return json({business:result});}
    if(action==='import'){assertRevision(s,input.revision);if(s.mode!=='demo'||input.business?.sample)throw Error('Only non-sample demo discoveries can be imported.');const saved=await saveBusiness(user.id,input.business,'live',s.revision,true);await addActivity(user.id,saved.id,'Lead imported','Explicit import from demo; Google listing content remains transient.');return json({id:saved.id});}
    if(action==='analyze'){assertRevision(s,input.revision);const b=cleanBusiness(input.business);if(!b.website)return json({analysis:{website_status:'Missing',analysis:{summary:'No website is listed; confirm with the owner.',findings:[],checked_at:new Date().toISOString()}}});const checks=[];let html='';for(let n=0;n<2;n++){try{const r=await websiteFetch(b.website);checks.push({status:r.status});html=r.html;if(r.status>=200&&r.status<400)break;}catch{checks.push({status:0});}}const result=websiteAssessment(checks,html);return json({analysis:{website_status:result.website_status,analysis:{...result,checks,checked_at:new Date().toISOString()}}});}
    if(action==='photo'){const id=cleanText(input.place_id,200);if(!/^[A-Za-z0-9_-]+$/.test(id))throw Error('Invalid Google place ID.');const p=await placesCall('places/'+id,null,'photos');const photo=p.photos?.[0];if(!photo)return json({url:null,attributions:[]});const result=await placesCall(photo.name+'/media?maxWidthPx=600&skipHttpRedirect=true',null,null);return json({url:result.photoUri,attributions:photo.authorAttributions||[]});}
    if(action==='listing'){const id=cleanText(input.place_id,200);if(!/^[A-Za-z0-9_-]+$/.test(id))throw Error('Invalid Google place ID.');const p=await placesCall('places/'+id,null,'displayName,formattedAddress,rating,userRatingCount,googleMapsUri,primaryTypeDisplayName');return json({name:p.displayName?.text,address:p.formattedAddress,category:p.primaryTypeDisplayName?.text,rating:p.rating,review_count:p.userRatingCount,google_url:p.googleMapsUri});}
    if(action==='oauth_start'){if(!env('GOOGLE_CLIENT_ID')||!env('GOOGLE_CLIENT_SECRET')||!env('GMAIL_TOKEN_KEY'))throw Error('Configure Google OAuth credentials and token encryption first.');const token=crypto.randomUUID()+crypto.randomUUID();await privateData('oauth','put',user.id,{state:token});const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');for(const [k,v]of Object.entries({client_id:env('GOOGLE_CLIENT_ID'),redirect_uri:env('SUPABASE_URL')+'/functions/v1/api',response_type:'code',scope:'openid email https://www.googleapis.com/auth/gmail.send',access_type:'offline',prompt:'consent',state:token,login_hint:user.email}))u.searchParams.set(k,v);return json({url:u.href});}
    if(action==='oauth_disconnect'){const account=await privateData('gmail','get',user.id);if(account){const token=await encryptedToken(account.refresh_token,true);await fetch('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token}),signal:AbortSignal.timeout(10000)});}await privateData('gmail','delete',user.id);return json({disconnected:true});}
    if(action==='preview'){
      assertRevision(s,input.revision);const account=await privateData('gmail','get',user.id);let b,row;
      if(s.mode==='live'){row=(await db('businesses?id=eq.'+input.business.id+'&user_id=eq.'+user.id+'&mode=eq.live'))[0];if(!row)throw Error('Production business not found.');b={...row.data,mode:'live'};}
      else{row=await saveBusiness(user.id,input.business,'demo',s.revision);b={...row.data,mode:'demo'};}
      const envelope=prepareEnvelope(s,account,b,input.draft,input.revision);const ticket=await privateData('ticket','put',user.id,{business_id:row.id,envelope,mode:s.mode,revision:s.revision});return json({...envelope,id:ticket.id,expires_at:ticket.expires_at});
    }
    if(action==='send'){
      const ticket=await rpc('howdy_claim_send',{p_user:user.id,p_ticket:input.ticket_id,p_revision:input.revision});const account=await privateData('gmail','get',user.id);let attempted=false;
      try{
        const access=await googleToken(account),identity=await googleIdentity(access);if(identity.email.toLowerCase()!==account.email.toLowerCase())throw Error('Authorized Gmail identity changed. Reconnect.');
        const body={raw:mime(ticket.envelope,account.email)};attempted=true;
        const r=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});const response=await r.json();
        if(!r.ok){attempted=false;throw Error(response.error?.message||'Gmail rejected this send.');}if(!response.id)throw Error('Gmail response did not confirm acceptance.');
        await privateData('ticket','finish',user.id,{id:ticket.id,status:'sent',message_id:response.id});await addActivity(user.id,ticket.business_id,'Gmail accepted email',`${ticket.mode==='demo'?'TEST to verified owner':'Reviewed outreach'} · Message ID: ${response.id}`);
        return json({message_id:response.id,status:'sent'});
      }catch(err){await privateData('ticket','finish',user.id,{id:ticket.id,status:attempted?'unknown':'failed',error:attempted?'Outcome unknown. Check Gmail Sent before any retry.':err.message});await addActivity(user.id,ticket.business_id,attempted?'Email outcome unknown':'Email send failed',attempted?'Check Gmail Sent. Automatic retry is blocked to prevent duplicates.':err.message);throw err;}
    }
    return json({error:'Unknown action'},400);
  }catch(err){return json({error:err.message},400);}
});
