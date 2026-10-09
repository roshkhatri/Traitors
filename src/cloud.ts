import { createClient, RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

export type CloudGame = {
  id: string;
  code: string;
  title: string;
  hostName: string;
  rosterLocked: boolean;
  status: "lobby" | "active";
  startedAt?: string;
  expiresAt: string;
  currentRound: number;
  totalRounds: number;
};

export type CloudPlayer = {
  id: string;
  name: string;
  photo: string;
  claimed: boolean;
  status: "active" | "banished" | "murdered" | "departed";
  eliminationRound?: number;
};

export type JoinableCloudGame = {
  title: string;
  hostName: string;
  rosterLocked: boolean;
  availableNames: string[];
  status: "lobby" | "active";
  startedAt?: string;
  expiresAt: string;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isCloudConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const supabase: SupabaseClient | null = isCloudConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;

function client(): SupabaseClient {
  if (!supabase) {
    throw new Error("The shared game database has not been configured.");
  }
  return supabase;
}

export async function ensureAnonymousSession() {
  const activeClient = client();
  const {
    data: { session },
    error: sessionError,
  } = await activeClient.auth.getSession();

  if (sessionError) throw sessionError;
  if (session) return session.user;

  const { data, error } = await activeClient.auth.signInAnonymously();
  if (error) throw error;
  if (!data.user) throw new Error("Could not create a game session.");
  return data.user;
}

export async function createCloudGame(input: {
  title: string;
  hostName: string;
  totalRounds: number;
  roster: string[];
}): Promise<CloudGame & { displayKey: string; hostKey: string }> {
  await ensureAnonymousSession();
  const { data, error } = await client().rpc("create_game", {
    p_title: input.title.trim() || "The Traitors",
    p_host_name: input.hostName.trim() || "The Host",
    p_total_rounds: input.totalRounds,
    p_roster: input.roster,
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("The game could not be created.");
  return {
    id: row.game_id,
    code: row.game_code,
    title: row.game_title,
    hostName: input.hostName.trim() || "The Host",
    rosterLocked: input.roster.length > 0,
    status: "lobby",
    startedAt: undefined,
    expiresAt: row.game_expires_at,
    currentRound: row.current_round,
    totalRounds: row.total_rounds,
    displayKey: row.display_key,
    hostKey: row.host_key,
  };
}

export async function loadJoinableCloudGame(
  code: string,
): Promise<JoinableCloudGame> {
  await ensureAnonymousSession();
  const { data, error } = await client().rpc("get_joinable_game", {
    p_code: normalizeGameCode(code),
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("This game code is invalid or has expired.");
  return {
    title: row.game_title,
    hostName: row.game_host_name,
    rosterLocked: row.roster_locked,
    availableNames: row.available_names ?? [],
    status: row.game_status,
    startedAt: row.game_started_at ?? undefined,
    expiresAt: row.game_expires_at,
  };
}

export async function joinCloudHost(input: {
  code: string;
  hostKey: string;
}): Promise<CloudGame> {
  await ensureAnonymousSession();
  const { data, error } = await client().rpc("join_host", {
    p_code: normalizeGameCode(input.code),
    p_host_key: normalizeHostKey(input.hostKey),
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.game_id) {
    throw new Error("That host access link could not be used.");
  }
  const sharedGame = await loadCloudGame(row.game_id);
  if (!sharedGame) throw new Error("That game has expired.");
  return sharedGame;
}

export async function startCloudGame(gameId: string): Promise<CloudGame> {
  const { error } = await client().rpc("host_start_game", {
    p_game_id: gameId,
  });
  if (error) throw error;

  const sharedGame = await loadCloudGame(gameId);
  if (!sharedGame) throw new Error("That game has expired.");
  return sharedGame;
}

export async function joinCloudGame(input: {
  code: string;
  name: string;
  photo: string;
}): Promise<{ game: CloudGame; playerId: string }> {
  await ensureAnonymousSession();
  const { data, error } = await client().rpc("join_game", {
    p_code: normalizeGameCode(input.code),
    p_name: input.name.trim(),
    p_photo_data: input.photo,
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("That game could not be joined.");
  const sharedGame = await loadCloudGame(row.game_id);
  if (!sharedGame) throw new Error("That game has expired.");
  return {
    game: sharedGame,
    playerId: row.player_id,
  };
}

export async function joinCloudDisplay(input: {
  code: string;
  displayKey: string;
}): Promise<CloudGame> {
  await ensureAnonymousSession();
  const { data, error } = await client().rpc("join_display", {
    p_code: normalizeGameCode(input.code),
    p_display_key: normalizeDisplayKey(input.displayKey),
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("That TV pairing code could not be used.");
  const sharedGame = await loadCloudGame(row.game_id);
  if (!sharedGame) throw new Error("That game has expired.");
  return sharedGame;
}

export async function loadCloudGame(gameId: string): Promise<CloudGame | null> {
  await ensureAnonymousSession();
  const { data, error } = await client()
    .from("games")
    .select(
      "id, code, title, host_name, roster_locked, status, started_at, expires_at, current_round, total_rounds",
    )
    .eq("id", gameId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    code: data.code,
    title: data.title,
    hostName: data.host_name,
    rosterLocked: data.roster_locked,
    status: data.status,
    startedAt: data.started_at ?? undefined,
    expiresAt: data.expires_at,
    currentRound: data.current_round,
    totalRounds: data.total_rounds,
  };
}

export async function loadCloudPlayers(gameId: string): Promise<CloudPlayer[]> {
  const { data, error } = await client()
    .from("players")
    .select(
      "id, name, photo_data, status, elimination_round, sort_order, claimed_at, joined_at",
    )
    .eq("game_id", gameId)
    .order("sort_order", { ascending: true })
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    photo: row.photo_data ?? "",
    claimed: Boolean(row.claimed_at),
    status: row.status,
    eliminationRound: row.elimination_round ?? undefined,
  }));
}

export async function updateMyCloudPortrait(
  playerId: string,
  photo: string,
): Promise<void> {
  const { error } = await client().rpc("update_my_portrait", {
    p_player_id: playerId,
    p_photo_data: photo,
  });
  if (error) throw error;
}

export async function updateCloudFate(input: {
  playerId: string;
  status: CloudPlayer["status"];
}): Promise<void> {
  const { error } = await client().rpc("host_update_fate", {
    p_player_id: input.playerId,
    p_status: input.status,
  });
  if (error) throw error;
}

export async function updateCloudRound(
  gameId: string,
  round: number,
): Promise<void> {
  const { error } = await client().rpc("host_set_round", {
    p_game_id: gameId,
    p_round: round,
  });
  if (error) throw error;
}

export async function updateHostCloudPortrait(
  playerId: string,
  photo: string,
): Promise<void> {
  const { error } = await client().rpc("host_update_portrait", {
    p_player_id: playerId,
    p_photo_data: photo,
  });
  if (error) throw error;
}

export function subscribeToCloudPlayers(
  gameId: string,
  onChange: () => void,
): () => void {
  let channel: RealtimeChannel | null = client()
    .channel(`game-${gameId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "players",
        filter: `game_id=eq.${gameId}`,
      },
      onChange,
    )
    .subscribe();

  return () => {
    if (channel) {
      void client().removeChannel(channel);
      channel = null;
    }
  };
}

export function normalizeGameCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

export function normalizeDisplayKey(key: string) {
  return key.toUpperCase().replace(/[^A-F0-9]/g, "").slice(0, 12);
}

export function normalizeHostKey(key: string) {
  return key.toUpperCase().replace(/[^A-F0-9]/g, "").slice(0, 16);
}
