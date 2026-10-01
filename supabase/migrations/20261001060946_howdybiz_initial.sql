-- Canonical bootstrap schema. scripts/migration.mjs uses the Supabase CLI
-- to create a correctly named migration from this source.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table public.workspace_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mode text not null default 'demo' check (mode in ('demo','live')),
  revision integer not null default 0,
  updated_at timestamptz not null default now()
);
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id text not null,
  mode text not null check(mode in ('demo','live')),
  data jsonb not null default '{}',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,mode,place_id)
);
create index businesses_owner_mode on public.businesses(user_id,mode);
create table public.activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  label text not null,
  detail text not null default '',
  at timestamptz not null default now()
);
create index activity_owner_business on public.activity(user_id,business_id,at desc);
create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query jsonb not null,
  created_at timestamptz not null default now()
);
create index saved_searches_owner on public.saved_searches(user_id);
create table private.gmail_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  verified boolean not null default false,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);
create table private.oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default now()+interval '10 minutes'
);
create table private.mail_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  envelope jsonb not null,
  mode text not null check (mode in ('demo','live')),
  revision integer not null,
  status text not null default 'preview' check(status in ('preview','sending','sent','failed','unknown')),
  message_id text,
  error text,
  expires_at timestamptz not null default now()+interval '5 minutes',
  created_at timestamptz not null default now()
);
create index mail_tickets_owner_status on private.mail_tickets(user_id,status);
create table private.rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  window_start timestamptz not null default now(),
  count integer not null default 1,
  primary key(user_id,action)
);
create table private.search_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query jsonb not null,
  zone text not null,
  token text not null,
  expires_at timestamptz not null default now()+interval '10 minutes'
);

alter table public.workspace_settings enable row level security;
alter table public.businesses enable row level security;
alter table public.activity enable row level security;
alter table public.saved_searches enable row level security;
alter table private.gmail_accounts enable row level security;
alter table private.oauth_states enable row level security;
alter table private.mail_tickets enable row level security;
alter table private.rate_limits enable row level security;
alter table private.search_pages enable row level security;
create policy owner_settings_read on public.workspace_settings for select to authenticated using ((select auth.uid())=user_id);
create policy owner_business_read on public.businesses for select to authenticated using ((select auth.uid())=user_id and (expires_at is null or expires_at>now()));
create policy owner_activity_read on public.activity for select to authenticated using ((select auth.uid())=user_id);
create policy owner_search_read on public.saved_searches for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.workspace_settings,public.businesses,public.activity,public.saved_searches from anon,authenticated;
grant select on public.workspace_settings,public.businesses,public.activity,public.saved_searches to authenticated;
grant all on all tables in schema public,private to service_role;

-- Privileged RPCs are service-role only and SECURITY INVOKER, with fixed search_path.
create function public.howdy_private(p_table text,p_method text,p_user uuid,p_data jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r jsonb; begin
  if p_table='gmail' and p_method='get' then select to_jsonb(a) into r from private.gmail_accounts a where user_id=p_user;
  elsif p_table='gmail' and p_method='put' then
    insert into private.gmail_accounts(user_id,email,verified,refresh_token) values(p_user,p_data->>'email',true,p_data->>'refresh_token')
    on conflict(user_id) do update set email=excluded.email,verified=excluded.verified,refresh_token=excluded.refresh_token,updated_at=now(); r:='{}';
  elsif p_table='gmail' and p_method='delete' then delete from private.gmail_accounts where user_id=p_user; r:='{}';
  elsif p_table='oauth' and p_method='put' then insert into private.oauth_states(state,user_id) values(p_data->>'state',p_user); r:='{}';
  elsif p_table='oauth' and p_method='consume' then delete from private.oauth_states where state=p_data->>'state' and expires_at>now() returning to_jsonb(private.oauth_states.*) into r;
  elsif p_table='ticket' and p_method='put' then
    insert into private.mail_tickets(user_id,business_id,envelope,mode,revision) values(p_user,(p_data->>'business_id')::uuid,p_data->'envelope',p_data->>'mode',(p_data->>'revision')::integer) returning to_jsonb(private.mail_tickets.*) into r;
  elsif p_table='ticket' and p_method='finish' then
    update private.mail_tickets set status=p_data->>'status',message_id=p_data->>'message_id',error=p_data->>'error' where id=(p_data->>'id')::uuid and user_id=p_user and status='sending' returning to_jsonb(private.mail_tickets.*) into r;
  elsif p_table='ticket' and p_method='issues' then
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'error',error,'mode',mode,'created_at',created_at)),'[]') into r from private.mail_tickets where user_id=p_user and status in ('failed','unknown','sending');
  elsif p_table='ticket' and p_method='resolve' then
    perform 1 from public.workspace_settings where user_id=p_user for update;
    if p_data->>'confirmation'<>'checked_gmail_sent' or p_data->>'status' not in ('sent','failed') then raise exception 'Manual Gmail verification is required'; end if;
    update private.mail_tickets set status=p_data->>'status',error='Manually resolved after user checked Gmail Sent' where id=(p_data->>'id')::uuid and user_id=p_user and (status='unknown' or (status='sending' and created_at<now()-interval '5 minutes')) returning to_jsonb(private.mail_tickets.*) into r;
    if r is null then raise exception 'Send is still active or already resolved'; end if;
  elsif p_table='page' and p_method='put' then
    insert into private.search_pages(user_id,query,zone,token) values(p_user,p_data->'query',p_data->>'zone',p_data->>'token') returning to_jsonb(private.search_pages.*) into r;
  elsif p_table='page' and p_method='get' then select to_jsonb(p) into r from private.search_pages p where id=(p_data->>'id')::uuid and user_id=p_user and expires_at>now();
  else raise exception 'Invalid private operation'; end if;
  return coalesce(r,'null'::jsonb);
end $$;

create function public.howdy_mode(p_user uuid,p_mode text,p_revision integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.workspace_settings; begin
  insert into public.workspace_settings(user_id) values(p_user) on conflict do nothing;
  select * into s from public.workspace_settings where user_id=p_user for update;
  if s.revision<>p_revision then raise exception 'Mode changed. Reload workspace.'; end if;
  if exists(select 1 from private.mail_tickets where user_id=p_user and status in ('sending','unknown')) then raise exception 'A send is running or its outcome is unknown. Resolve the mail ticket before switching modes.'; end if;
  update public.workspace_settings set mode=p_mode,revision=revision+1,updated_at=now() where user_id=p_user returning * into s;
  delete from private.mail_tickets where user_id=p_user and status='preview';
  return to_jsonb(s);
end $$;

create function public.howdy_claim_send(p_user uuid,p_ticket uuid,p_revision integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.workspace_settings; t private.mail_tickets; b public.businesses; begin
  select * into s from public.workspace_settings where user_id=p_user for update;
  if s.user_id is null or s.revision<>p_revision then raise exception 'Mode changed. Prepare a new preview.'; end if;
  select * into t from private.mail_tickets where id=p_ticket and user_id=p_user for update;
  if t.id is null or t.status<>'preview' or t.expires_at<=now() or t.mode<>s.mode or t.revision<>s.revision then raise exception 'Preview expired, mode changed, or email already submitted.'; end if;
  select * into b from public.businesses where id=t.business_id and user_id=p_user for update;
  if b.id is null or b.data->>'stage'='Do Not Contact' then raise exception 'Business is unavailable or Do Not Contact.'; end if;
  if b.mode<>s.mode then raise exception 'Business belongs to a different workspace.'; end if;
  if not exists(select 1 from private.gmail_accounts where user_id=p_user and verified=true and (s.mode<>'demo' or email=t.envelope->>'to')) then raise exception 'Verified Gmail routing changed.'; end if;
  if s.mode='live' and (b.data->>'email' is distinct from t.envelope->>'to' or coalesce((b.data->>'sample')::boolean,false) or b.data->>'email' like '%.invalid' or length(coalesce(b.data->>'phone',''))=0) then raise exception 'Live contact changed. Prepare a new preview.'; end if;
  if s.mode='demo' and t.envelope->>'subject'<>'TEST' then raise exception 'Invalid demo subject'; end if;
  if exists(select 1 from private.mail_tickets where user_id=p_user and business_id=t.business_id and id<>t.id and envelope=t.envelope and status in ('sending','sent','unknown')) then raise exception 'This exact email has already been submitted. Duplicate send blocked.'; end if;
  update private.mail_tickets set status='sending' where id=t.id;
  return to_jsonb(t);
end $$;

create function public.howdy_rate(p_user uuid,p_action text,p_limit integer) returns boolean
language plpgsql security invoker set search_path='' as $$
declare n integer; begin
  insert into private.rate_limits(user_id,action) values(p_user,p_action)
  on conflict(user_id,action) do update set count=case when private.rate_limits.window_start<now()-interval '1 minute' then 1 else private.rate_limits.count+1 end,window_start=case when private.rate_limits.window_start<now()-interval '1 minute' then now() else private.rate_limits.window_start end returning count into n;
  return n<=p_limit;
end $$;

create function public.howdy_update(p_user uuid,p_id uuid,p_revision integer,p_changes jsonb,p_label text,p_detail text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.workspace_settings; b public.businesses; begin
  select * into s from public.workspace_settings where user_id=p_user for update;
  if s.revision<>p_revision or s.mode<>'live' then raise exception 'Mode changed.'; end if;
  select * into b from public.businesses where id=p_id and user_id=p_user and mode=s.mode for update;
  if b.id is null then raise exception 'Business unavailable'; end if;
  update public.businesses set data=data||p_changes,updated_at=now() where id=p_id returning * into b;
  insert into public.activity(user_id,business_id,label,detail) values(p_user,p_id,p_label,p_detail);
  return to_jsonb(b);
end $$;

create function public.howdy_store_business(p_user uuid,p_place text,p_mode text,p_revision integer,p_data jsonb,p_import boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.workspace_settings; b public.businesses; d jsonb; k text; begin
  select * into s from public.workspace_settings where user_id=p_user for update;
  if s.user_id is null or s.revision<>p_revision then raise exception 'Workspace mode changed. Restart the operation.'; end if;
  if p_import then
    if s.mode<>'demo' or p_mode<>'live' or coalesce((p_data->>'sample')::boolean,false) then raise exception 'Invalid demo import'; end if;
  elsif s.mode<>p_mode then raise exception 'Workspace mode changed.';
  end if;
  select * into b from public.businesses where user_id=p_user and place_id=p_place and mode=p_mode for update;
  d:=p_data;
  if b.id is not null then
    foreach k in array array['notes','tasks','proposals','payments','draft','stage','score','explanation','followup','analysis'] loop
      if b.data ? k then d:=jsonb_set(d,array[k],b.data->k); end if;
    end loop;
    update public.businesses set data=d,updated_at=now(),expires_at=case when p_mode='demo' then now()+interval '24 hours' else null end where id=b.id returning * into b;
  else
    insert into public.businesses(user_id,place_id,mode,data,expires_at) values(p_user,p_place,p_mode,d,case when p_mode='demo' then now()+interval '24 hours' else null end) returning * into b;
  end if;
  return to_jsonb(b);
end $$;

create function public.howdy_clear_demo(p_user uuid) returns boolean
language plpgsql security invoker set search_path='' as $$ begin
  perform 1 from public.workspace_settings where user_id=p_user for update;
  if exists(select 1 from private.mail_tickets where user_id=p_user and mode='demo' and status in ('sending','unknown')) then raise exception 'Resolve pending demo sends before clearing data'; end if;
  delete from public.businesses where user_id=p_user and mode='demo';
  delete from private.search_pages where user_id=p_user;
  return true;
end $$;

revoke execute on function public.howdy_private(text,text,uuid,jsonb),public.howdy_mode(uuid,text,integer),public.howdy_claim_send(uuid,uuid,integer),public.howdy_rate(uuid,text,integer),public.howdy_update(uuid,uuid,integer,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.howdy_private(text,text,uuid,jsonb),public.howdy_mode(uuid,text,integer),public.howdy_claim_send(uuid,uuid,integer),public.howdy_rate(uuid,text,integer),public.howdy_update(uuid,uuid,integer,jsonb,text,text) to service_role;
revoke execute on function public.howdy_store_business(uuid,text,text,integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.howdy_store_business(uuid,text,text,integer,jsonb,boolean) to service_role;
revoke execute on function public.howdy_clear_demo(uuid) from public,anon,authenticated;
grant execute on function public.howdy_clear_demo(uuid) to service_role;
commit;
