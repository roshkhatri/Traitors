import { createClient, RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

export type CloudGame = {
  id: string;
  code: string;
  title: string;
  expiresAt: string;
};

export type CloudPlayer = {
  id: string;
  name: string;
  photo: string;
  status: "active" | "banished" | "murdered" | "departed";
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

export async function createCloudGame(title: string): Promise<CloudGame> {
  await ensureAnonymousSession();
  const { data, error } = await client().rpc("create_game", {
    p_title: title.trim() || "The Traitors",
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("The game could not be created.");
  return {
    id: row.game_id,
    code: row.game_code,
    title: row.game_title,
    expiresAt: row.game_expires_at,
  };
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
  return {
    game: {
      id: row.game_id,
      code: row.game_code,
      title: row.game_title,
      expiresAt: row.game_expires_at,
    },
    playerId: row.player_id,
  };
}

export async function loadCloudGame(gameId: string): Promise<CloudGame | null> {
  await ensureAnonymousSession();
  const { data, error } = await client()
    .from("games")
    .select("id, code, title, expires_at")
    .eq("id", gameId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    code: data.code,
    title: data.title,
    expiresAt: data.expires_at,
  };
}

export async function loadCloudPlayers(gameId: string): Promise<CloudPlayer[]> {
  const { data, error } = await client()
    .from("players")
    .select("id, name, photo_data, status, joined_at")
    .eq("game_id", gameId)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    photo: row.photo_data,
    status: row.status,
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
