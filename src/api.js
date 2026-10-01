import { safeStorage } from './storage.js';
const localStore=safeStorage('localStorage'),sessionStore=safeStorage('sessionStorage');
let configuration = {}, session = null;
let refreshFlight;
export async function initialize() {
  const stored = JSON.parse(localStore.getItem('howdybiz.connection') || '{}');
  const r = await fetch('./config.json').catch(() => null);
  configuration = { ...(r?.ok ? await r.json() : {}), ...stored };
  session = JSON.parse(localStore.getItem('howdybiz.auth') || sessionStore.getItem('howdybiz.auth') || 'null');
  if(session){localStore.setItem('howdybiz.auth',JSON.stringify(session));sessionStore.removeItem('howdybiz.auth');}
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get('access_token')) {
    session = { access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_at:Date.now()+Number(hash.get('expires_in')||3600)*1000 };
    localStore.setItem('howdybiz.auth', JSON.stringify(session));
    history.replaceState(null,'',location.pathname+location.search);
  }
  return configuration;
}
export function configured() { return Boolean(configuration.supabaseUrl && configuration.publishableKey); }
export function getConfig() { return configuration; }
export function saveConnection(url,key) {
  const parsed=new URL(url);
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.supabase.co')) throw Error('Use an HTTPS Supabase project URL.');
  if (!key.startsWith('sb_publishable_')) { try { const payload=JSON.parse(atob(key.split('.')[1])); if(payload.role!=='anon')throw Error(); } catch { throw Error('Use only a publishable or legacy anon key.'); } }
  configuration={supabaseUrl:parsed.origin,publishableKey:key};localStore.setItem('howdybiz.connection',JSON.stringify(configuration));
}
export async function authenticate(email) {
  if(!configured())throw Error('Configure Supabase first.');
  await request('/auth/v1/otp?redirect_to='+encodeURIComponent(location.origin+location.pathname),{method:'POST',body:{email,create_user:true}},false);
}
export async function logout(){ if(session)await request('/auth/v1/logout',{method:'POST'}).catch(()=>{});session=null;localStore.removeItem('howdybiz.auth');sessionStore.removeItem('howdybiz.auth'); }
async function refresh(){
  if(!session?.refresh_token)throw Error('Sign in to continue.');
  if(!refreshFlight)refreshFlight=request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}},false).then(s=>{session={...s,expires_at:Date.now()+s.expires_in*1000};localStore.setItem('howdybiz.auth',JSON.stringify(session));}).finally(()=>refreshFlight=null);
  return refreshFlight;
}
async function request(path,options={},authorized=true){
  if(!configured())throw Error('Backend not configured. Open Integrations to connect Supabase.');
  if(authorized&&session?.expires_at&&session.expires_at<Date.now()+30000)await refresh();
  const r=await fetch(configuration.supabaseUrl+path,{method:options.method||'GET',headers:{apikey:configuration.publishableKey,'Content-Type':'application/json',...(authorized&&session?{Authorization:`Bearer ${session.access_token}`}:{})},body:options.body?JSON.stringify(options.body):undefined});
  const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error?.message||data.error||data.msg||data.message||`Request failed (${r.status})`);return data;
}
export async function user(){ if(!session)return null;return request('/auth/v1/user'); }
export function api(action,body={}){ if(!session)throw Error('Sign in before using live integrations.');return request('/functions/v1/api',{method:'POST',body:{action,...body}}); }
