-- SkillMarket schema: profiles, skills, exchange requests and reviews, with row level security.
-- Run in the Supabase SQL editor, or with the Supabase CLI: `supabase db push`.

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '' check (char_length(full_name) <= 80),
  university  text not null default '' check (char_length(university) <= 120),
  bio         text not null default '' check (char_length(bio) <= 500),
  created_at  timestamptz not null default now()
);

create table public.skills (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles (id) on delete cascade,
  title           text not null check (char_length(title) between 3 and 80),
  description     text not null check (char_length(description) between 10 and 1000),
  category        text not null,
  level           text not null check (level in ('beginner', 'intermediate', 'advanced')),
  mode            text not null check (mode in ('online', 'in-person', 'both')),
  kind            text not null check (kind in ('offer', 'want')),
  hours_estimate  integer check (hours_estimate between 1 and 200),
  tags            text[] not null default '{}',
  created_at      timestamptz not null default now()
);
create index skills_owner_idx on public.skills (owner_id);
create index skills_category_idx on public.skills (category);

create table public.exchange_requests (
  id                 uuid primary key default gen_random_uuid(),
  skill_id           uuid not null references public.skills (id) on delete cascade,
  requester_id       uuid not null references public.profiles (id) on delete cascade,
  owner_id           uuid not null references public.profiles (id) on delete cascade,
  message            text not null check (char_length(message) between 5 and 500),
  offered_in_return  text not null default '' check (char_length(offered_in_return) <= 200),
  status             text not null default 'pending'
                     check (status in ('pending', 'accepted', 'declined', 'completed', 'cancelled')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint no_self_request check (requester_id <> owner_id)
);
create index requests_requester_idx on public.exchange_requests (requester_id);
create index requests_owner_idx on public.exchange_requests (owner_id);
-- A person can have only one pending request per skill.
create unique index one_pending_request_per_skill
  on public.exchange_requests (requester_id, skill_id) where status = 'pending';

create table public.reviews (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.exchange_requests (id) on delete cascade,
  reviewer_id  uuid not null references public.profiles (id) on delete cascade,
  reviewee_id  uuid not null references public.profiles (id) on delete cascade,
  rating       integer not null check (rating between 1 and 5),
  comment      text not null default '' check (char_length(comment) <= 500),
  created_at   timestamptz not null default now(),
  unique (request_id, reviewer_id),
  constraint no_self_review check (reviewer_id <> reviewee_id)
);

create view public.profile_ratings with (security_invoker = true) as
  select reviewee_id, round(avg(rating)::numeric, 2) as avg_rating, count(*)::int as review_count
  from public.reviews
  group by reviewee_id;

-- ---------------------------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------------------------
-- Create a profile automatically when someone signs up.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 80));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- The owner of a request is always the owner of the skill, and requests start as 'pending'.
create function public.prepare_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare skill_owner uuid;
begin
  select owner_id into skill_owner from public.skills where id = new.skill_id;
  if skill_owner is null then
    raise exception 'skill not found';
  end if;
  new.owner_id := skill_owner;
  new.status := 'pending';
  return new;
end;
$$;

create trigger request_before_insert
  before insert on public.exchange_requests
  for each row execute function public.prepare_request();

-- Only the status may change, and only along allowed transitions by the right person:
--   pending  -> accepted | declined   (skill owner)
--   pending  -> cancelled             (requester)
--   accepted -> completed | cancelled (either party)
create function public.enforce_request_transition() returns trigger
language plpgsql as $$
declare actor uuid := auth.uid();
begin
  if new.skill_id <> old.skill_id or new.requester_id <> old.requester_id or new.owner_id <> old.owner_id
     or new.message <> old.message or new.offered_in_return <> old.offered_in_return
     or new.created_at <> old.created_at then
    raise exception 'only the status of a request can be changed';
  end if;

  if new.status <> old.status then
    if old.status = 'pending' and new.status in ('accepted', 'declined') and actor = old.owner_id then
      null;
    elsif old.status = 'pending' and new.status = 'cancelled' and actor = old.requester_id then
      null;
    elsif old.status = 'accepted' and new.status in ('completed', 'cancelled')
          and actor in (old.requester_id, old.owner_id) then
      null;
    else
      raise exception 'invalid status change from % to %', old.status, new.status;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger request_before_update
  before update on public.exchange_requests
  for each row execute function public.enforce_request_transition();

-- ---------------------------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.skills enable row level security;
alter table public.exchange_requests enable row level security;
alter table public.reviews enable row level security;

-- Public marketplace: anyone can browse profiles, skills and reviews.
create policy "profiles are public"  on public.profiles for select using (true);
create policy "reviews are public"   on public.reviews  for select using (true);
create policy "skills are public"    on public.skills   for select using (true);

create policy "edit own profile" on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

create policy "create own skills" on public.skills for insert
  with check (auth.uid() = owner_id);
create policy "update own skills" on public.skills for update
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "delete own skills" on public.skills for delete
  using (auth.uid() = owner_id);

-- Requests are private to the two people involved.
create policy "see own requests" on public.exchange_requests for select
  using (auth.uid() in (requester_id, owner_id));
create policy "create own requests" on public.exchange_requests for insert
  with check (auth.uid() = requester_id);
create policy "update own requests" on public.exchange_requests for update
  using (auth.uid() in (requester_id, owner_id));

-- Reviews: only after a completed exchange, only by a participant, only about the other participant.
create policy "review completed exchanges" on public.reviews for insert
  with check (
    auth.uid() = reviewer_id
    and exists (
      select 1 from public.exchange_requests r
      where r.id = request_id
        and r.status = 'completed'
        and auth.uid() in (r.requester_id, r.owner_id)
        and reviewee_id = case when r.requester_id = auth.uid() then r.owner_id else r.requester_id end
    )
  );

grant select on public.profile_ratings to anon, authenticated;
