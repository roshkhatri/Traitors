-- Run this entire file in the Supabase SQL editor for the project used by
-- Traitors Hall of Fame. Then enable Anonymous Sign-Ins under Authentication.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null check (char_length(title) between 1 and 80),
  host_name text not null default 'The Host'
    check (char_length(host_name) between 1 and 40),
  roster_locked boolean not null default false,
  host_user_id uuid not null references auth.users(id) on delete cascade,
  display_key_hash text,
  current_round smallint not null default 1,
  total_rounds smallint not null default 3,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours'),
  constraint games_rounds_check
    check (
      total_rounds between 1 and 10
      and current_round between 1 and total_rounds
    )
);

alter table public.games
  add column if not exists host_name text not null default 'The Host';
alter table public.games
  add column if not exists roster_locked boolean not null default false;
alter table public.games add column if not exists display_key_hash text;
alter table public.games
  add column if not exists current_round smallint not null default 1;
alter table public.games
  add column if not exists total_rounds smallint not null default 3;
alter table public.games drop constraint if exists games_rounds_check;
alter table public.games
  add constraint games_rounds_check
  check (
    total_rounds between 1 and 10
    and current_round between 1 and total_rounds
  );
alter table public.games drop constraint if exists games_host_name_check;
alter table public.games
  add constraint games_host_name_check
  check (char_length(host_name) between 1 and 40);

create table if not exists public.game_members (
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('host', 'player', 'display')),
  joined_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

alter table public.game_members
  drop constraint if exists game_members_role_check;
alter table public.game_members
  add constraint game_members_role_check
  check (role in ('host', 'player', 'display'));

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  photo_data text check (char_length(photo_data) between 50 and 600000),
  status text not null default 'active'
    check (status in ('active', 'banished', 'murdered', 'departed')),
  elimination_round smallint
    check (elimination_round is null or elimination_round between 1 and 10),
  sort_order smallint not null default 0,
  claimed_at timestamptz,
  joined_at timestamptz not null default now(),
  unique (game_id, user_id)
);

alter table public.players alter column user_id drop not null;
alter table public.players alter column photo_data drop not null;
alter table public.players drop column if exists exit_round;
alter table public.players
  add column if not exists elimination_round smallint;
alter table public.players
  add column if not exists sort_order smallint not null default 0;
alter table public.players
  add column if not exists claimed_at timestamptz;
update public.players
set claimed_at = joined_at
where user_id is not null
  and claimed_at is null;
alter table public.players
  drop constraint if exists players_elimination_round_check;
alter table public.players
  add constraint players_elimination_round_check
  check (elimination_round is null or elimination_round between 1 and 10);

alter table public.games enable row level security;
alter table public.game_members enable row level security;
alter table public.players enable row level security;

drop policy if exists "Members can view their games" on public.games;
create policy "Members can view their games"
on public.games for select
to authenticated
using (
  expires_at > now()
  and exists (
    select 1
    from public.game_members member
    where member.game_id = games.id
      and member.user_id = auth.uid()
  )
);

drop policy if exists "Members can view their membership" on public.game_members;
create policy "Members can view their membership"
on public.game_members for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Members can view game players" on public.players;
create policy "Members can view game players"
on public.players for select
to authenticated
using (
  exists (
    select 1
    from public.game_members member
    join public.games game on game.id = member.game_id
    where member.game_id = players.game_id
      and member.user_id = auth.uid()
      and game.expires_at > now()
  )
);

revoke all on public.games from anon, authenticated;
revoke all on public.game_members from anon, authenticated;
revoke all on public.players from anon, authenticated;
grant select (
  id, code, title, host_name, roster_locked,
  current_round, total_rounds, created_at, expires_at
)
  on public.games to authenticated;
grant select on public.game_members to authenticated;
grant select (
  id, game_id, name, photo_data, status, elimination_round,
  sort_order, claimed_at, joined_at
)
  on public.players to authenticated;

create or replace function public.make_game_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
$$;

drop function if exists public.create_game(text);
drop function if exists public.create_game(text, integer);
drop function if exists public.create_game(text, integer, text, text[]);

create or replace function public.create_game(
  p_title text,
  p_total_rounds integer,
  p_host_name text,
  p_roster text[]
)
returns table (
  game_id uuid,
  game_code text,
  game_title text,
  game_expires_at timestamptz,
  current_round integer,
  total_rounds integer,
  display_key text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_game public.games;
  next_code text;
  next_display_key text;
  cleaned_roster text[];
begin
  if auth.uid() is null then
    raise exception 'A valid session is required';
  end if;

  -- Expired games are inaccessible immediately and are removed when the next
  -- game starts, keeping small installations tidy without a paid scheduler.
  delete from public.games where expires_at <= now();

  if char_length(trim(p_title)) not between 1 and 80 then
    raise exception 'Game title must be between 1 and 80 characters';
  end if;
  if p_total_rounds not between 1 and 10 then
    raise exception 'The number of elimination rounds must be between 1 and 10';
  end if;
  if char_length(trim(p_host_name)) not between 1 and 40 then
    raise exception 'Host name must be between 1 and 40 characters';
  end if;

  select coalesce(
    array_agg(trim(item.guest_name) order by item.position),
    array[]::text[]
  )
  into cleaned_roster
  from unnest(coalesce(p_roster, array[]::text[]))
    with ordinality as item(guest_name, position)
  where trim(item.guest_name) <> '';

  if cardinality(cleaned_roster) > 40 then
    raise exception 'A game can have at most 40 invited contestants';
  end if;
  if exists (
    select 1
    from unnest(cleaned_roster) as guest(guest_name)
    where char_length(guest.guest_name) not between 1 and 40
  ) then
    raise exception 'Every contestant name must be between 1 and 40 characters';
  end if;
  if exists (
    select lower(guest.guest_name)
    from unnest(cleaned_roster) as guest(guest_name)
    group by lower(guest.guest_name)
    having count(*) > 1
  ) then
    raise exception 'Contestant names must be unique';
  end if;

  loop
    next_code := public.make_game_code();
    next_display_key := upper(
      substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 12)
    );
    begin
      insert into public.games (
        code,
        title,
        host_name,
        roster_locked,
        host_user_id,
        display_key_hash,
        current_round,
        total_rounds
      )
      values (
        next_code,
        trim(p_title),
        trim(p_host_name),
        cardinality(cleaned_roster) > 0,
        auth.uid(),
        encode(extensions.digest(next_display_key, 'sha256'), 'hex'),
        1,
        p_total_rounds
      )
      returning * into created_game;
      exit;
    exception when unique_violation then
      -- A code collision is extraordinarily unlikely; generate another.
    end;
  end loop;

  insert into public.game_members (game_id, user_id, role)
  values (created_game.id, auth.uid(), 'host');

  insert into public.players (game_id, name, sort_order)
  select
    created_game.id,
    guest.guest_name,
    guest.position::smallint
  from unnest(cleaned_roster)
    with ordinality as guest(guest_name, position);

  return query
  select
    created_game.id,
    created_game.code,
    created_game.title,
    created_game.expires_at,
    created_game.current_round::integer,
    created_game.total_rounds::integer,
    next_display_key;
end;
$$;

create or replace function public.create_game(
  p_title text,
  p_total_rounds integer
)
returns table (
  game_id uuid,
  game_code text,
  game_title text,
  game_expires_at timestamptz,
  current_round integer,
  total_rounds integer,
  display_key text
)
language sql
security definer
set search_path = ''
as $$
  select *
  from public.create_game(
    p_title,
    p_total_rounds,
    'The Host',
    array[]::text[]
  );
$$;

drop function if exists public.get_joinable_game(text);

create or replace function public.get_joinable_game(p_code text)
returns table (
  game_title text,
  game_host_name text,
  roster_locked boolean,
  available_names text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_game public.games;
begin
  if auth.uid() is null then
    raise exception 'A valid session is required';
  end if;

  select *
  into target_game
  from public.games
  where code = upper(regexp_replace(p_code, '[^A-Z0-9]', '', 'g'))
    and expires_at > now();

  if target_game.id is null then
    raise exception 'This game code is invalid or has expired';
  end if;

  return query
  select
    target_game.title,
    target_game.host_name,
    target_game.roster_locked,
    coalesce(
      array_agg(player.name order by player.sort_order, player.joined_at)
        filter (
          where player.user_id is null
             or player.user_id = auth.uid()
        ),
      array[]::text[]
    )
  from public.players player
  where player.game_id = target_game.id;
end;
$$;

drop function if exists public.join_game(text, text, text);

create or replace function public.join_game(
  p_code text,
  p_name text,
  p_photo_data text
)
returns table (
  game_id uuid,
  game_code text,
  game_title text,
  game_expires_at timestamptz,
  current_round integer,
  total_rounds integer,
  player_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_game public.games;
  joined_player public.players;
  next_sort_order smallint;
begin
  if auth.uid() is null then
    raise exception 'A valid session is required';
  end if;

  if char_length(trim(p_name)) not between 1 and 40 then
    raise exception 'Name must be between 1 and 40 characters';
  end if;
  if p_photo_data not like 'data:image/jpeg;base64,%'
     or char_length(p_photo_data) not between 50 and 600000 then
    raise exception 'A valid compressed portrait is required';
  end if;

  select *
  into target_game
  from public.games
  where code = upper(regexp_replace(p_code, '[^A-Z0-9]', '', 'g'))
    and expires_at > now();

  if target_game.id is null then
    raise exception 'This game code is invalid or has expired';
  end if;

  if exists (
    select 1
    from public.game_members member
    where member.game_id = target_game.id
      and member.user_id = auth.uid()
      and member.role <> 'player'
  ) then
    raise exception 'Use a separate contestant device to claim a portrait';
  end if;

  select *
  into joined_player
  from public.players player
  where player.game_id = target_game.id
    and player.user_id = auth.uid()
  for update;

  if found then
    update public.players
    set
      photo_data = p_photo_data,
      claimed_at = coalesce(claimed_at, now())
    where id = joined_player.id
    returning * into joined_player;
  else
    select *
    into joined_player
    from public.players player
    where player.game_id = target_game.id
      and lower(player.name) = lower(trim(p_name))
    order by player.sort_order, player.joined_at
    limit 1
    for update;

    if found then
      if joined_player.user_id is not null then
        raise exception 'That contestant has already claimed their portrait';
      end if;

      update public.players
      set
        user_id = auth.uid(),
        photo_data = p_photo_data,
        claimed_at = now()
      where id = joined_player.id
      returning * into joined_player;
    else
      if target_game.roster_locked then
        raise exception 'Choose an available name from the guest list';
      end if;

      select (coalesce(max(player.sort_order), 0) + 1)::smallint
      into next_sort_order
      from public.players player
      where player.game_id = target_game.id;

      insert into public.players (
        game_id,
        user_id,
        name,
        photo_data,
        sort_order,
        claimed_at
      )
      values (
        target_game.id,
        auth.uid(),
        trim(p_name),
        p_photo_data,
        next_sort_order,
        now()
      )
      returning * into joined_player;
    end if;
  end if;

  insert into public.game_members (game_id, user_id, role)
  values (target_game.id, auth.uid(), 'player')
  on conflict on constraint game_members_pkey do nothing;

  return query
  select
    target_game.id,
    target_game.code,
    target_game.title,
    target_game.expires_at,
    target_game.current_round::integer,
    target_game.total_rounds::integer,
    joined_player.id;
end;
$$;

drop function if exists public.join_display(text, text);

create or replace function public.join_display(
  p_code text,
  p_display_key text
)
returns table (
  game_id uuid,
  game_code text,
  game_title text,
  game_expires_at timestamptz,
  current_round integer,
  total_rounds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_game public.games;
  normalized_key text;
begin
  if auth.uid() is null then
    raise exception 'A valid session is required';
  end if;

  normalized_key := upper(
    regexp_replace(p_display_key, '[^A-F0-9]', '', 'g')
  );
  if char_length(normalized_key) <> 12 then
    raise exception 'The TV pairing key is invalid';
  end if;

  select *
  into target_game
  from public.games
  where code = upper(regexp_replace(p_code, '[^A-Z0-9]', '', 'g'))
    and display_key_hash = encode(
      extensions.digest(normalized_key, 'sha256'),
      'hex'
    )
    and expires_at > now();

  if target_game.id is null then
    raise exception 'The game code or TV pairing key is invalid or expired';
  end if;

  insert into public.game_members (game_id, user_id, role)
  values (target_game.id, auth.uid(), 'display')
  on conflict on constraint game_members_pkey
  do update set role = excluded.role;

  return query
  select
    target_game.id,
    target_game.code,
    target_game.title,
    target_game.expires_at,
    target_game.current_round::integer,
    target_game.total_rounds::integer;
end;
$$;

create or replace function public.update_my_portrait(
  p_player_id uuid,
  p_photo_data text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'A valid session is required';
  end if;
  if p_photo_data not like 'data:image/jpeg;base64,%'
     or char_length(p_photo_data) not between 50 and 600000 then
    raise exception 'A valid compressed portrait is required';
  end if;

  update public.players player
  set photo_data = p_photo_data
  from public.games game
  where player.id = p_player_id
    and player.user_id = auth.uid()
    and game.id = player.game_id
    and game.expires_at > now();

  if not found then
    raise exception 'Portrait not found or permission denied';
  end if;
end;
$$;

create or replace function public.host_update_portrait(
  p_player_id uuid,
  p_photo_data text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'A valid session is required';
  end if;
  if p_photo_data not like 'data:image/jpeg;base64,%'
     or char_length(p_photo_data) not between 50 and 600000 then
    raise exception 'A valid compressed portrait is required';
  end if;

  update public.players player
  set photo_data = p_photo_data
  from public.games game
  where player.id = p_player_id
    and game.id = player.game_id
    and game.host_user_id = auth.uid()
    and game.expires_at > now();

  if not found then
    raise exception 'Portrait not found or host permission denied';
  end if;
end;
$$;

drop function if exists public.host_update_fate(uuid, text, text);

create or replace function public.host_update_fate(
  p_player_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'A valid session is required';
  end if;
  if p_status not in ('active', 'banished', 'murdered', 'departed') then
    raise exception 'Invalid contestant status';
  end if;
  update public.players player
  set
    status = p_status,
    elimination_round = case
      when p_status = 'active' then null
      else game.current_round
    end
  from public.games game
  where player.id = p_player_id
    and game.id = player.game_id
    and game.host_user_id = auth.uid()
    and game.expires_at > now();

  if not found then
    raise exception 'Contestant not found or host permission denied';
  end if;
end;
$$;

create or replace function public.host_set_round(
  p_game_id uuid,
  p_round integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'A valid session is required';
  end if;

  update public.games game
  set current_round = p_round
  where game.id = p_game_id
    and game.host_user_id = auth.uid()
    and game.expires_at > now()
    and p_round between 1 and game.total_rounds;

  if not found then
    raise exception 'Round is invalid or host permission was denied';
  end if;
end;
$$;

revoke all on function public.make_game_code() from public;
revoke all on function public.create_game(text, integer) from public;
revoke all on function public.create_game(text, integer, text, text[]) from public;
revoke all on function public.get_joinable_game(text) from public;
revoke all on function public.join_game(text, text, text) from public;
revoke all on function public.join_display(text, text) from public;
revoke all on function public.update_my_portrait(uuid, text) from public;
revoke all on function public.host_update_portrait(uuid, text) from public;
revoke all on function public.host_update_fate(uuid, text) from public;
revoke all on function public.host_set_round(uuid, integer) from public;

grant execute on function public.create_game(text, integer) to authenticated;
grant execute on function public.create_game(text, integer, text, text[])
  to authenticated;
grant execute on function public.get_joinable_game(text) to authenticated;
grant execute on function public.join_game(text, text, text) to authenticated;
grant execute on function public.join_display(text, text) to authenticated;
grant execute on function public.update_my_portrait(uuid, text) to authenticated;
grant execute on function public.host_update_portrait(uuid, text) to authenticated;
grant execute on function public.host_update_fate(uuid, text) to authenticated;
grant execute on function public.host_set_round(uuid, integer) to authenticated;

-- Remove expired games and their short-lived anonymous identities. An older
-- anonymous identity is retained while it still belongs to an active game,
-- allowing the same host phone to safely start another game later.
create or replace function public.cleanup_expired_games_and_sessions()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.games
  where expires_at <= now();

  delete from auth.users as user_row
  where user_row.is_anonymous is true
    and user_row.created_at <= now() - interval '48 hours'
    and not exists (
      select 1
      from public.game_members member
      join public.games game on game.id = member.game_id
      where member.user_id = user_row.id
        and game.expires_at > now()
    );
end;
$$;

revoke all on function public.cleanup_expired_games_and_sessions() from public;

-- Calling cron.schedule again with the same name updates the existing job,
-- which keeps this schema safe to rerun.
select cron.schedule(
  'traitors-expired-session-cleanup',
  '17 * * * *',
  $cleanup$
    select public.cleanup_expired_games_and_sessions();
  $cleanup$
);

-- Realtime listens only return rows allowed by the SELECT policies above.
do $$
begin
  alter publication supabase_realtime add table public.players;
exception
  when duplicate_object then null;
end
$$;
