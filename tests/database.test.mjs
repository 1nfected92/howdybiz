import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const modulePath=process.env.HOWDY_PGLITE_MODULE||'@electric-sql/pglite';
const {PGlite}=await import(modulePath);
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
async function setup(){
  const db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
  await db.query('insert into auth.users(id) values($1),($2)',[owner,other]);
  await db.query('insert into public.workspace_settings(user_id) values($1),($2)',[owner,other]);
  const data={name:'Private business',email:'business@example.com',phone:'123',stage:'New',sample:false};
  const b=(await db.query("insert into public.businesses(user_id,place_id,mode,data) values($1,'google-place','demo',$2) returning id",[owner,data])).rows[0].id;
  await db.query("insert into private.gmail_accounts(user_id,email,verified,refresh_token) values($1,'owner@example.com',true,'encrypted-token')",[owner]);
  return {db,b};
}
async function ticket(db,b,revision=0,body='Hello'){
  const envelope={mode:'demo',revision,to:'owner@example.com',subject:'TEST',body,cc:[],bcc:[]};
  const data={business_id:b,envelope,mode:'demo',revision};
  return (await db.query("select public.howdy_private('ticket','put',$1,$2) as ticket",[owner,data])).rows[0].ticket;
}
test('PostgreSQL RLS hides other-user records and forbids direct writes and privileged RPCs',async()=>{
  const {db,b}=await setup();
  try{
    await db.exec('set role authenticated');
    assert.equal((await db.query('select * from public.businesses')).rows.length,0);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
    assert.equal((await db.query('select * from public.businesses')).rows.length,0);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
    assert.equal((await db.query('select * from public.businesses')).rows.length,1);
    await assert.rejects(db.query('update public.businesses set data=$1 where id=$2',[{},b]),/permission denied/);
    await assert.rejects(db.query("select public.howdy_mode($1,'live',0)",[owner]),/permission denied/);
    await assert.rejects(db.query('select * from private.gmail_accounts'),/permission denied/);
  }finally{await db.close();}
});
test('send tickets are single-use and mode switches block while a send is active',async()=>{
  const {db,b}=await setup();
  try{
    const t=await ticket(db,b);
    await db.query('select public.howdy_claim_send($1,$2,0)',[owner,t.id]);
    await assert.rejects(db.query('select public.howdy_claim_send($1,$2,0)',[owner,t.id]),/already submitted/);
    await assert.rejects(db.query("select public.howdy_mode($1,'live',0)",[owner]),/send is running/);
    await db.query("select public.howdy_private('ticket','finish',$1,$2)",[owner,{id:t.id,status:'sent',message_id:'gmail-accepted'}]);
    const duplicate=await ticket(db,b);
    await assert.rejects(db.query('select public.howdy_claim_send($1,$2,0)',[owner,duplicate.id]),/Duplicate send blocked/);
  }finally{await db.close();}
});
test('mode revisions invalidate previews, expiry and Do Not Contact block claims',async()=>{
  const {db,b}=await setup();
  try{
    const first=await ticket(db,b);
    await db.query("update private.mail_tickets set expires_at=now()-interval '1 second' where id=$1",[first.id]);
    await assert.rejects(db.query('select public.howdy_claim_send($1,$2,0)',[owner,first.id]),/Preview expired/);
    const second=await ticket(db,b,0,'Second');
    await db.query("update public.businesses set data=jsonb_set(data,'{stage}','\"Do Not Contact\"') where id=$1",[b]);
    await assert.rejects(db.query('select public.howdy_claim_send($1,$2,0)',[owner,second.id]),/Do Not Contact/);
    await db.query("select public.howdy_mode($1,'live',0)",[owner]);
    await assert.rejects(db.query('select public.howdy_claim_send($1,$2,0)',[owner,second.id]),/Mode changed/);
    assert.equal((await db.query("select * from private.mail_tickets where status='preview'")).rows.length,0);
  }finally{await db.close();}
});
test('claim rechecks verified demo recipient and live business ownership',async()=>{
  const {db,b}=await setup();
  try{
    const t=await ticket(db,b);
    await db.query("update private.mail_tickets set envelope=jsonb_set(envelope,'{to}','\"attacker@example.com\"') where id=$1",[t.id]);
    await assert.rejects(db.query('select public.howdy_claim_send($1,$2,0)',[owner,t.id]),/Verified Gmail routing changed/);
    await assert.rejects(db.query('select public.howdy_claim_send($1,$2,0)',[other,t.id]),/Preview expired/);
  }finally{await db.close();}
});
test('discovery deduplicates and preserves CRM while mode changes block late writes',async()=>{
  const {db}=await setup();
  try{
    const data={name:'Discovered',stage:'New',notes:'',proposals:[],payments:[]};
    const first=(await db.query("select public.howdy_store_business($1,'new-place','demo',0,$2,false) as b",[owner,data])).rows[0].b;
    await db.query('update public.businesses set data=data||$1 where id=$2',[{stage:'Contacted',notes:'Keep this note',proposals:[{title:'Original quote',amount:100}]},first.id]);
    const second=(await db.query("select public.howdy_store_business($1,'new-place','demo',0,$2,false) as b",[owner,{...data,name:'Refreshed'}])).rows[0].b;
    assert.equal(second.id,first.id);assert.equal(second.data.notes,'Keep this note');assert.equal(second.data.stage,'Contacted');assert.equal(second.data.proposals[0].amount,100);assert.equal(second.data.name,'Refreshed');
    await db.query("select public.howdy_mode($1,'live',0)",[owner]);
    await assert.rejects(db.query("select public.howdy_store_business($1,'late-result','demo',0,$2,false)",[owner,data]),/mode changed/);
  }finally{await db.close();}
});
test('unknown outcomes block mode/clear and require explicit manual resolution',async()=>{
  const {db,b}=await setup();
  try{
    const t=await ticket(db,b);await db.query('select public.howdy_claim_send($1,$2,0)',[owner,t.id]);
    await db.query("select public.howdy_private('ticket','finish',$1,$2)",[owner,{id:t.id,status:'unknown',error:'Timeout'}]);
    await assert.rejects(db.query("select public.howdy_mode($1,'live',0)",[owner]),/send is running/);
    await assert.rejects(db.query('select public.howdy_clear_demo($1)',[owner]),/Resolve pending/);
    await assert.rejects(db.query("select public.howdy_private('ticket','resolve',$1,$2)",[owner,{id:t.id,status:'failed',confirmation:'wrong'}]),/Manual Gmail/);
    await db.query("select public.howdy_private('ticket','resolve',$1,$2)",[owner,{id:t.id,status:'failed',confirmation:'checked_gmail_sent'}]);
    await db.query('select public.howdy_clear_demo($1)',[owner]);
    assert.equal((await db.query('select * from public.businesses where mode=\'demo\'')).rows.length,0);
  }finally{await db.close();}
});
