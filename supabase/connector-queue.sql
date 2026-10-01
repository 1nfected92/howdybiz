-- Additive connector transport. Executed only by the authenticated API or the
-- owner's connected Supabase worker; browser roles cannot call these routines.
begin;
alter table private.gmail_accounts add column transport text not null default 'oauth' check (transport in ('oauth','connector'));
alter table private.mail_tickets drop constraint mail_tickets_status_check;
alter table private.mail_tickets add constraint mail_tickets_status_check check(status in ('preview','queued','sending','sent','failed','unknown'));

create table private.connector_config (
  id integer primary key check(id=1),
  owner_id uuid not null references auth.users(id),
  owner_email text not null,
  enabled boolean not null default false,
  automation_id text,
  last_check timestamptz
);
create table private.connector_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check(kind in ('search','email')),
  mode text not null check(mode in ('demo','live')),
  revision integer not null,
  query jsonb,
  ticket_id uuid unique references private.mail_tickets(id) on delete cascade,
  status text not null default 'queued' check(status in ('queued','running','completed','failed','cancelled','unknown')),
  result jsonb not null default '{}',
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  expires_at timestamptz not null default now()+interval '24 hours'
);
create index connector_jobs_owner_status on private.connector_jobs(user_id,status,created_at);
alter table private.connector_config enable row level security;
alter table private.connector_jobs enable row level security;
grant all on private.connector_config,private.connector_jobs to service_role;

create function public.howdy_connector_state(p_user uuid) returns jsonb
language sql security invoker set search_path='' as $$
  select coalesce((select jsonb_build_object('enabled',enabled,'last_check',last_check,'cadence','hourly')
  from private.connector_config where id=1 and owner_id=p_user),'{"enabled":false}'::jsonb)
$$;

create function public.howdy_connector_jobs(p_user uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(j)),'[]'::jsonb) from (
 select id,kind,mode,revision,status,query,result,error,created_at,finished_at
 from private.connector_jobs where user_id=p_user and expires_at>now() order by created_at desc limit 30) j
$$;

create function public.howdy_connector_search(p_user uuid,p_revision integer,p_query jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.workspace_settings; j private.connector_jobs; begin
 select * into s from public.workspace_settings where user_id=p_user for update;
 if s.user_id is null or s.revision<>p_revision then raise exception 'Mode changed. Reload and search again.'; end if;
 if not exists(select 1 from private.connector_config where id=1 and owner_id=p_user and enabled) then raise exception 'Connected worker is not enabled.'; end if;
 if length(trim(coalesce(p_query->>'keyword','')))=0 or length(trim(coalesce(p_query->>'zones','')))=0 or length(p_query::text)>1000 then raise exception 'Enter a business keyword and location.'; end if;
 select * into j from private.connector_jobs where user_id=p_user and kind='search' and status in ('queued','running') and query=p_query and mode=s.mode and revision=s.revision and expires_at>now() limit 1;
 if j.id is not null then return to_jsonb(j); end if;
 if (select count(*) from private.connector_jobs where user_id=p_user and status in ('queued','running'))>=20 then raise exception 'Twenty requests are already pending. Wait for completion.'; end if;
 insert into private.connector_jobs(user_id,kind,mode,revision,query) values(p_user,'search',s.mode,s.revision,p_query) returning * into j;
 return to_jsonb(j);
end $$;

create function public.howdy_connector_submit(p_user uuid,p_ticket uuid,p_revision integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare t jsonb; j private.connector_jobs; begin
 perform 1 from public.workspace_settings where user_id=p_user for update;
 if not exists(select 1 from private.connector_config c join private.gmail_accounts a on a.user_id=c.owner_id where c.id=1 and c.owner_id=p_user and c.enabled and a.transport='connector' and a.verified and lower(a.email)=lower(c.owner_email)) then raise exception 'Connected Gmail is not verified.'; end if;
 if exists(select 1 from private.mail_tickets a join private.mail_tickets b on b.id=p_ticket where a.user_id=p_user and a.business_id=b.business_id and a.envelope=b.envelope and a.status='queued') then raise exception 'Duplicate queued send blocked.'; end if;
 if (select count(*) from private.connector_jobs where user_id=p_user and status in ('queued','running'))>=20 then raise exception 'Twenty requests are already pending.'; end if;
 t:=public.howdy_claim_send(p_user,p_ticket,p_revision);
 update private.mail_tickets set status='queued' where id=p_ticket;
 insert into private.connector_jobs(user_id,kind,mode,revision,ticket_id) values(p_user,'email',t->>'mode',p_revision,p_ticket) returning * into j;
 insert into public.activity(user_id,business_id,label,detail) values(p_user,(t->>'business_id')::uuid,'Reviewed email queued','Explicit Send clicked. The connected Gmail worker will process this request; no acceptance claimed yet.');
 return to_jsonb(j);
end $$;

create function public.howdy_connector_tick() returns jsonb
language plpgsql security invoker set search_path='' as $$ begin
 update private.connector_config set last_check=now() where id=1;
 update private.mail_tickets t set status='unknown',error='Worker stopped after claiming the send. Check Gmail Sent before retrying.' from private.connector_jobs j where j.ticket_id=t.id and j.status='running' and j.started_at<now()-interval '15 minutes';
 update private.connector_jobs set status=case when kind='email' then 'unknown' else 'failed' end,error='Worker execution interrupted; no automatic retry.',finished_at=now() where status='running' and started_at<now()-interval '15 minutes';
 update private.mail_tickets t set status='failed',error='Queued request expired.' from private.connector_jobs j where j.ticket_id=t.id and j.status='queued' and j.expires_at<=now();
 update private.connector_jobs set status='cancelled',error='Queued request expired.',finished_at=now() where status='queued' and expires_at<=now();
 return coalesce((select jsonb_build_object('owner_email',c.owner_email,'jobs',coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'kind',j.kind)) from (select id,kind from private.connector_jobs where user_id=c.owner_id and status='queued' and expires_at>now() order by created_at limit 10) j),'[]'::jsonb)) from private.connector_config c where id=1 and enabled),'{}'::jsonb);
end $$;

create function public.howdy_connector_claim(p_job uuid,p_gmail_email text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j private.connector_jobs; s public.workspace_settings; t private.mail_tickets; b public.businesses; c private.connector_config; reason text; begin
 select * into j from private.connector_jobs where id=p_job;
 if j.id is null then return null; end if;
 select * into s from public.workspace_settings where user_id=j.user_id for update;
 select * into j from private.connector_jobs where id=p_job for update;
 select * into c from private.connector_config where id=1 and owner_id=j.user_id;
 if j.status<>'queued' then return null; end if;
 if not coalesce(c.enabled,false) or j.expires_at<=now() or s.mode<>j.mode or s.revision<>j.revision then
   update private.connector_jobs set status='cancelled',error='Request expired or workspace changed.',finished_at=now() where id=p_job;
   update private.mail_tickets set status='failed',error='Workspace changed before worker send.' where id=j.ticket_id and status='queued';
   return null;
 end if;
 if j.kind='email' then
  select * into t from private.mail_tickets where id=j.ticket_id for update;
  select * into b from public.businesses where id=t.business_id and user_id=j.user_id for update;
  if t.status<>'queued' or b.id is null or b.mode<>s.mode or b.data->>'stage'='Do Not Contact' then reason:='Business is unavailable or Do Not Contact.';
  elsif lower(p_gmail_email) is distinct from lower(c.owner_email) or not exists(select 1 from private.gmail_accounts where user_id=j.user_id and transport='connector' and verified and lower(email)=lower(p_gmail_email)) then reason:='Connected Gmail identity changed.';
  elsif t.mode<>s.mode or t.revision<>s.revision or t.envelope->'cc' is distinct from '[]'::jsonb or t.envelope->'bcc' is distinct from '[]'::jsonb then reason:='Invalid envelope or workspace revision.';
  elsif s.mode='demo' and (lower(t.envelope->>'to') is distinct from lower(c.owner_email) or t.envelope->>'subject' is distinct from 'TEST') then reason:='Invalid demo routing.';
  elsif s.mode='live' and (b.data->>'email' is distinct from t.envelope->>'to' or coalesce((b.data->>'sample')::boolean,false) or b.data->>'email' like '%.invalid' or length(coalesce(b.data->>'phone',''))=0 or length(coalesce(b.data->>'email',''))=0) then reason:='Live contact changed. Prepare a new preview.';
  end if;
  if reason is not null then
   update private.connector_jobs set status='failed',error=reason,finished_at=now() where id=p_job;
   update private.mail_tickets set status='failed',error=reason where id=t.id;
   return null;
  end if;
  update private.mail_tickets set status='sending' where id=t.id;
 end if;
 update private.connector_jobs set status='running',started_at=now() where id=p_job returning * into j;
 return to_jsonb(j)||jsonb_build_object('envelope',t.envelope,'owner_email',c.owner_email);
end $$;

create function public.howdy_connector_finish_email(p_job uuid,p_status text,p_message text default null,p_error text default null) returns boolean
language plpgsql security invoker set search_path='' as $$
declare j private.connector_jobs; t private.mail_tickets; begin
 select * into j from private.connector_jobs where id=p_job for update;
 if j.kind is distinct from 'email' or j.status<>'running' or p_status not in ('sent','failed','unknown') then raise exception 'Invalid email completion.'; end if;
 if p_status='sent' and length(coalesce(p_message,''))=0 then raise exception 'Gmail message evidence required.'; end if;
 update private.connector_jobs set status=case when p_status='sent' then 'completed' else p_status end,result=jsonb_build_object('message_id',p_message),error=left(p_error,2000),finished_at=now() where id=p_job;
 update private.mail_tickets set status=p_status,message_id=p_message,error=left(p_error,2000) where id=j.ticket_id returning * into t;
 insert into public.activity(user_id,business_id,label,detail) values(j.user_id,t.business_id,case when p_status='sent' then 'Connected Gmail accepted email' else 'Connected email '||p_status end,case when p_status='sent' then 'Gmail message ID: '||p_message else coalesce(left(p_error,2000),'No provider acceptance confirmed.') end);
 if p_status='sent' and j.mode='live' then update public.businesses set data=jsonb_set(data,'{stage}','"Contacted"'),updated_at=now() where id=t.business_id; end if;
 return true;
end $$;

create function public.howdy_connector_finish_search(p_job uuid,p_businesses jsonb,p_report text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j private.connector_jobs; s public.workspace_settings; d jsonb; b jsonb; ids jsonb:='[]'; identity text; begin
 select * into j from private.connector_jobs where id=p_job;
 select * into s from public.workspace_settings where user_id=j.user_id for update;
 select * into j from private.connector_jobs where id=p_job for update;
 if j.kind is distinct from 'search' or j.status<>'running' then raise exception 'Search is not running.'; end if;
 if s.mode<>j.mode or s.revision<>j.revision then
   update private.connector_jobs set status='cancelled',error='Mode changed during search.',finished_at=now() where id=p_job;
   return '[]';
 end if;
 if jsonb_typeof(p_businesses) is distinct from 'array' or jsonb_array_length(p_businesses)>100 then raise exception 'Invalid result batch.'; end if;
 for d in select value from jsonb_array_elements(p_businesses) loop
   if length(coalesce(d->>'name',''))=0 or length(d->>'name')>200 or length(d::text)>12000 or coalesce(d->>'contact_source','') !~ '^https?://[^/[:space:]]+\.[^/[:space:]]+' then raise exception 'A public contact source and name are required.'; end if;
   if length(coalesce(d->>'email',''))>0 and (d->>'email' !~ '^[^[:space:]@<>,;]+@[^[:space:]@<>,;]+\.[^[:space:]@<>,;]+$' or d->>'email' like '%.invalid') then raise exception 'Invalid public email.'; end if;
   if length(coalesce(d->>'phone',''))>60 then raise exception 'Invalid phone.'; end if;
   identity:='web:'||md5(lower(regexp_replace(coalesce(nullif(d->>'website',''),d->>'contact_source'),'^https?://(www\.)?([^/]+).*','\2'))||'|'||lower(coalesce(d->>'address',d->>'name')));
   d:=jsonb_build_object('name',d->>'name','category',left(coalesce(d->>'category',''),120),'address',left(coalesce(d->>'address',''),500),'zip',left(coalesce(d->>'zip',''),30),'phone',coalesce(d->>'phone',''),'email',coalesce(d->>'email',''),'website',coalesce(d->>'website',''),'contact_source',d->>'contact_source','source','Public business website','contact_verification','Published on cited business page','last_checked',now(),'website_status','Unchecked','score','Possible','explanation','Public contact information found. Website and automation needs require analysis.','stage','New','sample',false,'notes','','proposals','[]'::jsonb,'payments','[]'::jsonb,'tasks','[]'::jsonb);
   b:=public.howdy_store_business(j.user_id,identity,j.mode,j.revision,d,false);
   ids:=ids||jsonb_build_array(b->>'id');
   insert into public.activity(user_id,business_id,label,detail) values(j.user_id,(b->>'id')::uuid,'Public search result verified',d->>'contact_source');
 end loop;
 update private.connector_jobs set status='completed',result=jsonb_build_object('record_ids',ids,'report',left(p_report,3000),'coverage','partial public-web search'),finished_at=now() where id=p_job;
 return ids;
end $$;

create function public.howdy_connector_fail_search(p_job uuid,p_error text) returns boolean
language sql security invoker set search_path='' as $$
 update private.connector_jobs set status='failed',error=left(p_error,2000),finished_at=now() where id=p_job and kind='search' and status='running' returning true
$$;

create function public.howdy_connector_cancel(p_user uuid,p_job uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare j private.connector_jobs; begin
 perform 1 from public.workspace_settings where user_id=p_user for update;
 select * into j from private.connector_jobs where id=p_job and user_id=p_user for update;
 if j.status is distinct from 'queued' then raise exception 'Only waiting requests can be cancelled.'; end if;
 update private.connector_jobs set status='cancelled',error='Cancelled by owner.',finished_at=now() where id=p_job;
 update private.mail_tickets set status='failed',error='Cancelled by owner.' where id=j.ticket_id;
 return true;
end $$;

create or replace function public.howdy_mode(p_user uuid,p_mode text,p_revision integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.workspace_settings; begin
 insert into public.workspace_settings(user_id) values(p_user) on conflict do nothing;
 select * into s from public.workspace_settings where user_id=p_user for update;
 if s.revision<>p_revision then raise exception 'Mode changed. Reload workspace.'; end if;
 if exists(select 1 from private.mail_tickets where user_id=p_user and status in ('sending','unknown')) then raise exception 'A send is running or its outcome is unknown. Resolve the mail ticket before switching modes.'; end if;
 update public.workspace_settings set mode=p_mode,revision=revision+1,updated_at=now() where user_id=p_user returning * into s;
 update private.connector_jobs set status='cancelled',error='Workspace mode changed.',finished_at=now() where user_id=p_user and status='queued';
 update private.mail_tickets set status='failed',error='Workspace mode changed.' where user_id=p_user and status='queued';
 delete from private.mail_tickets where user_id=p_user and status='preview';
 return to_jsonb(s);
end $$;

create or replace function public.howdy_clear_demo(p_user uuid) returns boolean
language plpgsql security invoker set search_path='' as $$ begin
 perform 1 from public.workspace_settings where user_id=p_user for update;
 if exists(select 1 from private.mail_tickets where user_id=p_user and mode='demo' and status in ('sending','unknown')) then raise exception 'Resolve pending demo sends before clearing data'; end if;
 update private.connector_jobs set status='cancelled',error='Demo workspace cleared.',finished_at=now() where user_id=p_user and mode='demo' and status in ('queued','running');
 delete from public.businesses where user_id=p_user and mode='demo';
 delete from private.search_pages where user_id=p_user;
 return true;
end $$;

create function public.howdy_connector_use_oauth(p_user uuid) returns boolean
language sql security invoker set search_path='' as $$
 update private.gmail_accounts set transport='oauth' where user_id=p_user and refresh_token like '{%' and verified returning true
$$;
revoke execute on function public.howdy_connector_use_oauth(uuid) from public,anon,authenticated;
grant execute on function public.howdy_connector_use_oauth(uuid) to service_role;

-- Explicitly revoke PostgreSQL's default PUBLIC execute permission.
revoke execute on function public.howdy_connector_state(uuid),public.howdy_connector_jobs(uuid),public.howdy_connector_search(uuid,integer,jsonb),public.howdy_connector_submit(uuid,uuid,integer),public.howdy_connector_tick(),public.howdy_connector_claim(uuid,text),public.howdy_connector_finish_email(uuid,text,text,text),public.howdy_connector_finish_search(uuid,jsonb,text),public.howdy_connector_fail_search(uuid,text),public.howdy_connector_cancel(uuid,uuid) from public,anon,authenticated;
grant execute on function public.howdy_connector_state(uuid),public.howdy_connector_jobs(uuid),public.howdy_connector_search(uuid,integer,jsonb),public.howdy_connector_submit(uuid,uuid,integer),public.howdy_connector_tick(),public.howdy_connector_claim(uuid,text),public.howdy_connector_finish_email(uuid,text,text,text),public.howdy_connector_finish_search(uuid,jsonb,text),public.howdy_connector_fail_search(uuid,text),public.howdy_connector_cancel(uuid,uuid) to service_role;
commit;
