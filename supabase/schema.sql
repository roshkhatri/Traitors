-- Run this entire file in the Supabase SQL editor for the project used by
-- Traitors Hall of Fame. Then enable Anonymous Sign-Ins under Authentication.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null check (char_length(title) between 1 and 80),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours')
);

create table if not exists public.game_members (
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('host', 'player')),
  joined_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  photo_data text not null check (char_length(photo_data) between 50 and 600000),
  status text not null default 'active'
    check (status in ('active', 'banished', 'murdered', 'departed')),
  exit_round text check (exit_round is null or char_length(exit_round) <= 40),
  joined_at timestamptz not null default now(),
  unique (game_id, user_id)
);

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
grant select on public.games to authenticated;
grant select on public.game_members to authenticated;
grant select on public.players to authenticated;

create or replace function public.make_game_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
$$;

create or replace function public.create_game(p_title text)
returns table (
  game_id uuid,
  game_code text,
  game_title text,
  game_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_game public.games;
  next_code text;
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

  loop
    next_code := public.make_game_code();
    begin
      insert into public.games (code, title, host_user_id)
      values (next_code, trim(p_title), auth.uid())
      returning * into created_game;
      exit;
    exception when unique_violation then
      -- A code collision is extraordinarily unlikely; generate another.
    end;
  end loop;

  insert into public.game_members (game_id, user_id, role)
  values (created_game.id, auth.uid(), 'host');

  return query
  select created_game.id, created_game.code, created_game.title, created_game.expires_at;
end;
$$;

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
  player_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_game public.games;
  joined_player public.players;
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

  insert into public.game_members (game_id, user_id, role)
  values (target_game.id, auth.uid(), 'player')
  on conflict (game_id, user_id)
  do update set role = excluded.role;

  insert into public.players (
    game_id, user_id, name, photo_data
  )
  values (
    target_game.id,
    auth.uid(),
    trim(p_name),
    p_photo_data
  )
  on conflict (game_id, user_id)
  do update set
    name = excluded.name,
    photo_data = excluded.photo_data
  returning * into joined_player;

  return query
  select
    target_game.id,
    target_game.code,
    target_game.title,
    target_game.expires_at,
    joined_player.id;
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

create or replace function public.host_update_fate(
  p_player_id uuid,
  p_status text,
  p_exit_round text default null
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
  if p_exit_round is not null and char_length(p_exit_round) > 40 then
    raise exception 'Round label is too long';
  end if;

  update public.players player
  set
    status = p_status,
    exit_round = case when p_status = 'active' then null else nullif(trim(p_exit_round), '') end
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

revoke all on function public.make_game_code() from public;
revoke all on function public.create_game(text) from public;
revoke all on function public.join_game(text, text, text) from public;
revoke all on function public.update_my_portrait(uuid, text) from public;
revoke all on function public.host_update_portrait(uuid, text) from public;
revoke all on function public.host_update_fate(uuid, text, text) from public;

grant execute on function public.create_game(text) to authenticated;
grant execute on function public.join_game(text, text, text) to authenticated;
grant execute on function public.update_my_portrait(uuid, text) to authenticated;
grant execute on function public.host_update_portrait(uuid, text) to authenticated;
grant execute on function public.host_update_fate(uuid, text, text) to authenticated;

-- Realtime listens only return rows allowed by the SELECT policies above.
do $$
begin
  alter publication supabase_realtime add table public.players;
exception
  when duplicate_object then null;
end
$$;
