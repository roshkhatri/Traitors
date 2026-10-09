import {
  Camera,
  Check,
  ChevronDown,
  Clock3,
  CircleHelp,
  Copy,
  Crown,
  Flame,
  LogOut,
  Mail,
  Maximize2,
  Minimize2,
  Plus,
  QrCode,
  RotateCcw,
  Shield,
  Skull,
  Sparkles,
  Trash2,
  UserRound,
  UsersRound,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  ChangeEvent,
  FormEvent,
  MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CloudGame,
  JoinableCloudGame,
  createCloudGame,
  endCloudGame,
  ensureAnonymousSession,
  isCloudConfigured,
  joinCloudGame,
  joinCloudDisplay,
  joinCloudHost,
  loadCloudGame,
  loadJoinableCloudGame,
  loadCloudPlayers,
  normalizeDisplayKey,
  normalizeGameCode,
  normalizeHostKey,
  startCloudGame,
  subscribeToCloudPlayers,
  updateCloudFate,
  updateCloudRound,
  updateHostCloudPortrait,
  updateMyCloudPortrait,
} from "./cloud";

type PlayerStatus = "active" | "banished" | "murdered" | "departed";
type Role = "host" | "player" | "display";
type Filter = "all" | "active" | "fallen";

type Player = {
  id: string;
  name: string;
  photo: string;
  claimed?: boolean;
  status: PlayerStatus;
  eliminationRound?: number;
};

type Session = {
  role: Role;
  playerId?: string;
};

type OnlineSession = {
  role: Role;
  gameId: string;
  playerId?: string;
  displayKey?: string;
  hostKey?: string;
  hostEmail?: string;
};

type StartGameInput = {
  hostName: string;
  hostEmail: string;
  eventName: string;
  honoree: string;
  totalRounds: number;
  roster: string[];
};

const PLAYER_STORAGE_KEY = "traitors-hall-players-v1";
const SESSION_STORAGE_KEY = "traitors-hall-session-v1";
const ONLINE_SESSION_STORAGE_KEY = "traitors-online-session-v1";
const HOST_PIN = "2026";
const DEFAULT_HOST_NAME = "Nishika";
const DEFAULT_EVENT = "Birthday Party";
const DEFAULT_HONOREE = "Anmol";
const DEFAULT_ROSTER = [
  "Anmol",
  "Aryaman",
  "Roshan",
  "Sanski",
  "Veenu",
  "Gati",
  "Mayank",
  "Samiksha",
  "Shreyansh",
  "Aditi",
  "Atharva",
  "Utkarsha",
  "Nikita",
  "Siddhant",
  "Yash",
  "Viram",
  "Jainam",
  "Shwetanshu",
  "Sabarni",
  "Ayushi",
  "Gunika",
];

function TraitorsMark({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M14 25 18.5 11 32 21.5 45.5 11 50 25H14Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M18 29H46"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M10.5 42C16.2 34.9 23.3 31.5 32 31.5S47.8 34.9 53.5 42C47.8 49.1 40.7 52.5 32 52.5S16.2 49.1 10.5 42Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="m32 35.5 6.5 6.5-6.5 6.5-6.5-6.5 6.5-6.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="42" r="2.2" fill="currentColor" />
    </svg>
  );
}

function devLog(event: string, details?: unknown) {
  if (import.meta.env.DEV) {
    console.debug(`[Traitors Hall] ${event}`, details ?? "");
  }
}

const portrait = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=720&q=82`;

const seedPlayers: Player[] = [
  {
    id: "mara",
    name: "Mara",
    photo: portrait("photo-1494790108377-be9c29b29330"),
    status: "active",
  },
  {
    id: "theo",
    name: "Theo",
    photo: portrait("photo-1500648767791-00dcc994a43e"),
    status: "banished",
    eliminationRound: 1,
  },
  {
    id: "celeste",
    name: "Celeste",
    photo: portrait("photo-1534528741775-53994a69daeb"),
    status: "active",
  },
  {
    id: "jasper",
    name: "Jasper",
    photo: portrait("photo-1507003211169-0a1dd7228f2d"),
    status: "active",
  },
  {
    id: "imani",
    name: "Imani",
    photo: portrait("photo-1531123897727-8f129e1688ce"),
    status: "murdered",
    eliminationRound: 1,
  },
  {
    id: "finn",
    name: "Finn",
    photo: portrait("photo-1506794778202-cad84cf45f1d"),
    status: "active",
  },
  {
    id: "vivienne",
    name: "Vivienne",
    photo: portrait("photo-1517841905240-472988babdf9"),
    status: "active",
  },
  {
    id: "arjun",
    name: "Arjun",
    photo: portrait("photo-1504593811423-6dd665756598"),
    status: "banished",
    eliminationRound: 2,
  },
  {
    id: "rowan",
    name: "Rowan",
    photo: portrait("photo-1524504388940-b1c1722653e1"),
    status: "active",
  },
  {
    id: "noah",
    name: "Noah",
    photo: portrait("photo-1527980965255-d3b416303d12"),
    status: "active",
  },
  {
    id: "sabine",
    name: "Sabine",
    photo: portrait("photo-1524250502761-1ac6f2e30d43"),
    status: "departed",
    eliminationRound: 3,
  },
  {
    id: "gabriel",
    name: "Gabriel",
    photo: portrait("photo-1539571696357-5a69c17a67c6"),
    status: "active",
  },
];

const statusLabels: Record<PlayerStatus, string> = {
  active: "Still in the game",
  banished: "Banished",
  murdered: "Murdered",
  departed: "Left the game",
};

function readStored<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function compressPhoto(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Please choose a JPG, PNG, or WebP image.");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Please choose a photo smaller than 8 MB.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = objectUrl;
    });

    const maxSide = 640;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo processing is unavailable.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const compressed = canvas.toDataURL("image/jpeg", 0.7);
    if (compressed.length > 600000) {
      throw new Error("That photo is still too large after compression.");
    }
    return compressed;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function buildJoinUrl(code: string) {
  const url = new URL(import.meta.env.BASE_URL, window.location.origin);
  url.searchParams.set("game", code);
  return url.toString();
}

function buildDisplayUrl(code: string, displayKey: string) {
  const url = new URL(import.meta.env.BASE_URL, window.location.origin);
  url.searchParams.set("display", code);
  url.searchParams.set("key", displayKey);
  return url.toString();
}

function buildHostUrl(code: string, hostKey: string) {
  const url = new URL(import.meta.env.BASE_URL, window.location.origin);
  url.searchParams.set("host", code);
  url.searchParams.set("hostKey", hostKey);
  return url.toString();
}

function buildHostAccessEmailUrl(
  game: CloudGame & {
    joinUrl: string;
    hostUrl: string;
    hostKey: string;
    hostEmail?: string;
  },
) {
  const subject = `Your private Traitors host access — ${game.title}`;
  const expiry = new Date(game.expiresAt).toLocaleString();
  const timing =
    game.status === "lobby"
      ? "The contestant invitation remains open for up to 72 hours. Starting the game begins its 48-hour window."
      : "The game is live and remains available until its 48-hour window ends.";
  const body = [
    `Hi ${game.hostName},`,
    "",
    "Your Traitors Hall of Fame game is ready.",
    "",
    "HOST CONTROLS — KEEP PRIVATE",
    game.hostUrl,
    "",
    `Game code: ${displayGameCode(game.code)}`,
    `Private host code: ${displayHostKey(game.hostKey)}`,
    "",
    "PLAYER INVITATION — SHARE WITH CONTESTANTS",
    game.joinUrl,
    "",
    "Contestants can use the player link to choose their name and upload a photo.",
    "",
    timing,
    `Current expiry: ${expiry}`,
    "",
    "Anyone with the private host link can control or delete the game. Do not share it with contestants.",
    "",
    "The Traitors Hall of Fame",
  ].join("\n");
  const recipient = game.hostEmail?.trim() ?? "";

  return `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}

function friendlyCloudError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/Game not found or host permission denied/i.test(message)) {
    return "This game could not be ended. It may have expired or your host access is no longer valid.";
  }
  if (/invalid or has expired/i.test(message)) {
    return "That game code is invalid or the session has expired.";
  }
  if (/pairing key|TV pairing/i.test(message)) {
    return "The game code or private TV pairing key is incorrect or expired.";
  }
  if (/host access|host permission/i.test(message)) {
    return "The game code or private host code is incorrect or expired.";
  }
  if (/anonymous sign-ins/i.test(message)) {
    return "Anonymous game access is not enabled in Supabase yet.";
  }
  if (/failed to fetch|network/i.test(message)) {
    return "The game could not reach its shared database. Check the connection.";
  }
  if (/photo|portrait|image/i.test(message)) {
    return message;
  }
  if (/already claimed|guest list|separate contestant device/i.test(message)) {
    return message;
  }
  devLog("Cloud error", message);
  return "Something interrupted the game session. Please try again.";
}

function displayGameCode(code: string) {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

function displayPairingKey(key: string) {
  return key.length === 12
    ? `${key.slice(0, 4)}-${key.slice(4, 8)}-${key.slice(8)}`
    : key;
}

function displayHostKey(key: string) {
  return key.length === 16
    ? `${key.slice(0, 4)}-${key.slice(4, 8)}-${key.slice(8, 12)}-${key.slice(12)}`
    : key;
}

function parseRoster(value: string) {
  return value
    .split(/[\n,]+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function buildEventTitle(eventName: string, honoree: string) {
  const event = eventName.trim();
  const forName = honoree.trim();
  if (event && forName) return `${event} for ${forName}`;
  return event || forName || "The Traitors";
}

function App() {
  const [showOfflinePreview, setShowOfflinePreview] = useState(false);

  if (showOfflinePreview) {
    return <DemoApp />;
  }

  return <OnlineApp onPreview={() => setShowOfflinePreview(true)} />;
}

function OnlineApp({ onPreview }: { onPreview: () => void }) {
  const initialCode = normalizeGameCode(
    new URLSearchParams(window.location.search).get("game") ?? "",
  );
  const initialDisplayCode = normalizeGameCode(
    new URLSearchParams(window.location.search).get("display") ?? "",
  );
  const initialDisplayKey = normalizeDisplayKey(
    new URLSearchParams(window.location.search).get("key") ?? "",
  );
  const initialHostCode = normalizeGameCode(
    new URLSearchParams(window.location.search).get("host") ?? "",
  );
  const initialHostKey = normalizeHostKey(
    new URLSearchParams(window.location.search).get("hostKey") ?? "",
  );
  const [stage, setStage] = useState<
    "loading" | "setup" | "entry" | "join" | "host" | "display" | "game"
  >(isCloudConfigured ? "loading" : "setup");
  const [game, setGame] = useState<CloudGame | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [session, setSession] = useState<OnlineSession | null>(null);
  const [joinCode, setJoinCode] = useState(initialCode);
  const [error, setError] = useState("");
  const [syncError, setSyncError] = useState("");

  const clearOnlineGame = (message = "") => {
    localStorage.removeItem(ONLINE_SESSION_STORAGE_KEY);
    const url = new URL(window.location.href);
    url.searchParams.delete("game");
    url.searchParams.delete("display");
    url.searchParams.delete("key");
    url.searchParams.delete("host");
    url.searchParams.delete("hostKey");
    window.history.replaceState({}, "", url);
    setGame(null);
    setPlayers([]);
    setSession(null);
    setError(message);
    setSyncError("");
    setStage("entry");
  };

  const refreshPlayers = async (gameId: string) => {
    const nextPlayers = await loadCloudPlayers(gameId);
    setPlayers(nextPlayers);
  };

  const refreshSharedGame = async (gameId: string) => {
    const [nextGame, nextPlayers] = await Promise.all([
      loadCloudGame(gameId),
      loadCloudPlayers(gameId),
    ]);
    if (!nextGame) {
      clearOnlineGame("This game has ended and is no longer available.");
      return;
    }
    setGame(nextGame);
    setPlayers(nextPlayers);
  };

  useEffect(() => {
    if (!isCloudConfigured) return;

    let cancelled = false;
    const boot = async () => {
      try {
        await ensureAnonymousSession();
        if (initialHostCode && initialHostKey) {
          const hostGame = await joinCloudHost({
            code: initialHostCode,
            hostKey: initialHostKey,
          });
          if (!cancelled) {
            const hostSession: OnlineSession = {
              role: "host",
              gameId: hostGame.id,
              hostKey: initialHostKey,
            };
            localStorage.setItem(
              ONLINE_SESSION_STORAGE_KEY,
              JSON.stringify(hostSession),
            );
            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete("hostKey");
            window.history.replaceState({}, "", cleanUrl);
            setGame(hostGame);
            setSession(hostSession);
            await refreshPlayers(hostGame.id);
            if (!cancelled) setStage("game");
          }
          return;
        }
        if (initialDisplayCode && initialDisplayKey) {
          const displayGame = await joinCloudDisplay({
            code: initialDisplayCode,
            displayKey: initialDisplayKey,
          });
          if (!cancelled) {
            const displaySession: OnlineSession = {
              role: "display",
              gameId: displayGame.id,
            };
            localStorage.setItem(
              ONLINE_SESSION_STORAGE_KEY,
              JSON.stringify(displaySession),
            );
            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete("key");
            window.history.replaceState({}, "", cleanUrl);
            setGame(displayGame);
            setSession(displaySession);
            await refreshPlayers(displayGame.id);
            if (!cancelled) setStage("game");
          }
          return;
        }
        const saved = readStored<OnlineSession | null>(
          ONLINE_SESSION_STORAGE_KEY,
          null,
        );
        if (saved) {
          const savedGame = await loadCloudGame(saved.gameId);
          if (savedGame && !cancelled) {
            setGame(savedGame);
            setSession(saved);
            await refreshPlayers(savedGame.id);
            if (!cancelled) setStage("game");
            return;
          }
          localStorage.removeItem(ONLINE_SESSION_STORAGE_KEY);
        }
        if (!cancelled) {
          setStage(
            initialCode
              ? "join"
              : initialHostCode
                ? "host"
                : initialDisplayCode
                  ? "display"
                  : "entry",
          );
        }
      } catch (bootError) {
        if (!cancelled) {
          setError(friendlyCloudError(bootError));
          setStage(
            initialCode
              ? "join"
              : initialHostCode
                ? "host"
                : initialDisplayCode
                  ? "display"
                  : "entry",
          );
        }
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (stage !== "game" || !game) return;
    const unsubscribe = subscribeToCloudPlayers(game.id, () => {
      void refreshSharedGame(game.id).catch((refreshError) =>
        setSyncError(friendlyCloudError(refreshError)),
      );
    });
    const roundPoll = window.setInterval(() => {
      void loadCloudGame(game.id)
        .then((nextGame) => {
          if (nextGame) {
            setGame(nextGame);
          } else {
            clearOnlineGame("This game has ended and is no longer available.");
          }
        })
        .catch((refreshError) =>
          setSyncError(friendlyCloudError(refreshError)),
        );
    }, 3000);

    return () => {
      unsubscribe();
      window.clearInterval(roundPoll);
    };
  }, [game?.id, stage]);

  const startGame = async (input: StartGameInput) => {
    setError("");
    try {
      const created = await createCloudGame({
        title: buildEventTitle(input.eventName, input.honoree),
        hostName: input.hostName,
        totalRounds: input.totalRounds,
        roster: input.roster,
      });
      const nextSession: OnlineSession = {
        role: "host",
        gameId: created.id,
        displayKey: created.displayKey,
        hostKey: created.hostKey,
        hostEmail: input.hostEmail.trim() || undefined,
      };
      localStorage.setItem(
        ONLINE_SESSION_STORAGE_KEY,
        JSON.stringify(nextSession),
      );
      setGame(created);
      setSession(nextSession);
      await refreshPlayers(created.id);
      setStage("game");
      devLog("Shared game created", { gameId: created.id });
    } catch (startError) {
      setError(friendlyCloudError(startError));
    }
  };

  const joinGame = async (input: {
    name: string;
    photo: string;
  }) => {
    setError("");
    try {
      const joined = await joinCloudGame({
        code: joinCode,
        ...input,
      });
      const nextSession: OnlineSession = {
        role: "player",
        gameId: joined.game.id,
        playerId: joined.playerId,
      };
      localStorage.setItem(
        ONLINE_SESSION_STORAGE_KEY,
        JSON.stringify(nextSession),
      );
      setGame(joined.game);
      setSession(nextSession);
      await refreshPlayers(joined.game.id);
      setStage("game");
      devLog("Contestant joined shared game", {
        gameId: joined.game.id,
        playerId: joined.playerId,
      });
    } catch (joinError) {
      setError(friendlyCloudError(joinError));
    }
  };

  const openJoin = (code: string) => {
    const normalized = normalizeGameCode(code);
    if (!normalized) {
      setError("Enter the game code shown on the host screen.");
      return;
    }
    setError("");
    setJoinCode(normalized);
    const url = new URL(window.location.href);
    url.searchParams.set("game", normalized);
    window.history.replaceState({}, "", url);
    setStage("join");
  };

  const connectDisplay = async (code: string, displayKey: string) => {
    setError("");
    try {
      const connectedGame = await joinCloudDisplay({ code, displayKey });
      const displaySession: OnlineSession = {
        role: "display",
        gameId: connectedGame.id,
      };
      localStorage.setItem(
        ONLINE_SESSION_STORAGE_KEY,
        JSON.stringify(displaySession),
      );
      setGame(connectedGame);
      setSession(displaySession);
      await refreshPlayers(connectedGame.id);
      setStage("game");
      devLog("TV display paired", { gameId: connectedGame.id });
    } catch (displayError) {
      setError(friendlyCloudError(displayError));
    }
  };

  const connectHost = async (code: string, hostKey: string) => {
    setError("");
    try {
      const connectedGame = await joinCloudHost({ code, hostKey });
      const hostSession: OnlineSession = {
        role: "host",
        gameId: connectedGame.id,
        hostKey: normalizeHostKey(hostKey),
      };
      localStorage.setItem(
        ONLINE_SESSION_STORAGE_KEY,
        JSON.stringify(hostSession),
      );
      setGame(connectedGame);
      setSession(hostSession);
      await refreshPlayers(connectedGame.id);
      setStage("game");
      devLog("Host controls paired", { gameId: connectedGame.id });
    } catch (hostError) {
      setError(friendlyCloudError(hostError));
    }
  };

  const beginGame = async () => {
    if (!game || session?.role !== "host") return;
    setSyncError("");
    try {
      const startedGame = await startCloudGame(game.id);
      setGame(startedGame);
      devLog("Shared game started", { gameId: game.id });
    } catch (startError) {
      setSyncError(friendlyCloudError(startError));
      throw startError;
    }
  };

  const leaveGame = () => {
    clearOnlineGame();
  };

  const endGame = async () => {
    if (!game || session?.role !== "host") return;
    setSyncError("");
    try {
      await endCloudGame(game.id);
      devLog("Shared game ended and deleted", { gameId: game.id });
      clearOnlineGame();
    } catch (endError) {
      setSyncError(friendlyCloudError(endError));
      throw endError;
    }
  };

  const syncPlayers = (nextPlayers: Player[]) => {
    if (!session) return;
    const changes = nextPlayers.filter((next) => {
      const previous = players.find((player) => player.id === next.id);
      return (
        previous &&
        (previous.photo !== next.photo ||
          previous.status !== next.status ||
          previous.eliminationRound !== next.eliminationRound)
      );
    });

    setPlayers(nextPlayers);
    setSyncError("");

    const updates = changes.flatMap((next) => {
      const previous = players.find((player) => player.id === next.id);
      if (!previous) return [];
      const tasks: Promise<void>[] = [];

      if (previous.photo !== next.photo) {
        tasks.push(
          session.role === "host"
            ? updateHostCloudPortrait(next.id, next.photo)
            : updateMyCloudPortrait(next.id, next.photo),
        );
      }
      if (
        session.role === "host" &&
        (previous.status !== next.status ||
          previous.eliminationRound !== next.eliminationRound)
      ) {
        tasks.push(
          updateCloudFate({
            playerId: next.id,
            status: next.status,
          }),
        );
      }
      return tasks;
    });

    void Promise.all(updates).catch(async (updateError) => {
      setSyncError(friendlyCloudError(updateError));
      if (game) await refreshPlayers(game.id);
    });
  };

  const changeRound = async (round: number) => {
    if (!game || session?.role !== "host") return;
    const previousRound = game.currentRound;
    setGame({ ...game, currentRound: round });
    setSyncError("");
    try {
      await updateCloudRound(game.id, round);
    } catch (roundError) {
      setGame({ ...game, currentRound: previousRound });
      setSyncError(friendlyCloudError(roundError));
    }
  };

  if (stage === "setup") {
    return <CloudSetupScreen onPreview={onPreview} />;
  }

  if (stage === "loading") {
    return <LoadingScreen />;
  }

  if (stage === "entry") {
    return (
      <GameEntryScreen
        error={error}
        onStart={startGame}
        onJoin={openJoin}
        onHost={() => {
          setError("");
          setStage("host");
        }}
        onDisplay={() => {
          setError("");
          setStage("display");
        }}
      />
    );
  }

  if (stage === "join") {
    return (
      <JoinGameScreen
        code={joinCode}
        error={error}
        onJoin={joinGame}
        onBack={() => {
          setError("");
          setStage("entry");
        }}
      />
    );
  }

  if (stage === "display") {
    return (
      <DisplayConnectScreen
        initialCode={initialDisplayCode}
        error={error}
        onConnect={connectDisplay}
        onBack={() => {
          setError("");
          setStage("entry");
        }}
      />
    );
  }

  if (stage === "host") {
    return (
      <HostConnectScreen
        initialCode={initialHostCode}
        error={error}
        onConnect={connectHost}
        onBack={() => {
          setError("");
          setStage("entry");
        }}
      />
    );
  }

  if (!game || !session) {
    return <LoadingScreen />;
  }

  return (
    <Hall
      players={players}
      session={{ role: session.role, playerId: session.playerId }}
      onPlayersChange={syncPlayers}
      onLogout={leaveGame}
      onlineGame={{
        ...game,
        joinUrl: buildJoinUrl(game.code),
        displayUrl:
          session.role === "host" && session.displayKey
            ? buildDisplayUrl(game.code, session.displayKey)
            : undefined,
        displayKey:
          session.role === "host" ? session.displayKey : undefined,
        hostUrl:
          session.role === "host" && session.hostKey
            ? buildHostUrl(game.code, session.hostKey)
            : undefined,
        hostKey: session.role === "host" ? session.hostKey : undefined,
        hostEmail: session.role === "host" ? session.hostEmail : undefined,
      }}
      onRoundChange={session.role === "host" ? changeRound : undefined}
      onGameStart={session.role === "host" ? beginGame : undefined}
      onGameEnd={session.role === "host" ? endGame : undefined}
      syncError={syncError}
    />
  );
}

function DemoApp() {
  const [players, setPlayers] = useState<Player[]>(() =>
    readStored(PLAYER_STORAGE_KEY, seedPlayers),
  );
  const [session, setSession] = useState<Session | null>(() =>
    readStored<Session | null>(SESSION_STORAGE_KEY, null),
  );

  useEffect(() => {
    localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(players));
    devLog("Gallery saved", {
      contestants: players.length,
      remaining: players.filter((player) => player.status === "active").length,
    });
  }, [players]);

  useEffect(() => {
    if (session) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      devLog("Session started", session);
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      devLog("Session ended");
    }
  }, [session]);

  if (!session) {
    return <LoginScreen players={players} onLogin={setSession} />;
  }

  return (
    <Hall
      players={players}
      session={session}
      onPlayersChange={setPlayers}
      onLogout={() => setSession(null)}
    />
  );
}

function LoadingScreen() {
  return (
    <main className="loading-page">
      <div className="loading-crest">
        <Flame size={24} fill="currentColor" />
      </div>
      <p className="eyebrow">Opening the manor</p>
      <h1>Preparing the hall…</h1>
    </main>
  );
}

function CloudSetupScreen({ onPreview }: { onPreview: () => void }) {
  return (
    <main className="login-page setup-page">
      <section className="login-story">
        <div className="season-kicker">
          <span />
          Shared party mode
        </div>
        <div className="crest crest-large" aria-label="Traitors crest">
          <WifiOff size={29} strokeWidth={1.5} />
        </div>
        <p className="eyebrow">One final connection</p>
        <h1>
          The Hall
          <br />
          <em>goes live</em>
        </h1>
        <p className="login-intro">
          The QR game is built and ready. Connect a free Supabase project so
          phones and the host screen can share portraits in real time.
        </p>
      </section>
      <section className="login-panel-wrap">
        <div className="login-panel setup-panel">
          <div className="panel-flame">
            <Wifi size={19} />
          </div>
          <p className="eyebrow">Cloud setup required</p>
          <h2>Connect the game</h2>
          <div className="setup-steps">
            <div>
              <span>1</span>
              <p>
                Create a free Supabase project and run{" "}
                <code>supabase/schema.sql</code>.
              </p>
            </div>
            <div>
              <span>2</span>
              <p>
                Add its URL and publishable key as GitHub repository variables.
              </p>
            </div>
          </div>
          <button className="primary-button full-button" onClick={onPreview}>
            Open the offline preview
          </button>
          <p className="privacy-note">
            <Shield size={13} />
            The offline preview remains limited to this browser.
          </p>
        </div>
      </section>
    </main>
  );
}

function GameEntryScreen({
  error,
  onStart,
  onJoin,
  onHost,
  onDisplay,
}: {
  error: string;
  onStart: (input: StartGameInput) => Promise<void>;
  onJoin: (code: string) => void;
  onHost: () => void;
  onDisplay: () => void;
}) {
  const [hostName, setHostName] = useState(DEFAULT_HOST_NAME);
  const [hostEmail, setHostEmail] = useState("");
  const [eventName, setEventName] = useState(DEFAULT_EVENT);
  const [honoree, setHonoree] = useState(DEFAULT_HONOREE);
  const [rosterText, setRosterText] = useState(DEFAULT_ROSTER.join("\n"));
  const [totalRounds, setTotalRounds] = useState(3);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const start = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await onStart({
        hostName,
        hostEmail,
        eventName,
        honoree,
        totalRounds,
        roster: parseRoster(rosterText),
      });
    } finally {
      setBusy(false);
    }
  };

  const join = (event: FormEvent) => {
    event.preventDefault();
    onJoin(code);
  };

  return (
    <main className="login-page">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <section className="login-story">
        <div className="season-kicker">
          <span />
          Live game · No accounts required
        </div>
        <div className="crest crest-large" aria-label="Traitors crest">
          <TraitorsMark size={43} />
        </div>
        <p className="eyebrow">Welcome to</p>
        <h1>
          The Hall
          <br />
          <em>of Fame</em>
        </h1>
        <p className="login-intro">
          Start a short-lived game, put the hall on the big screen, and let
          contestants join by scanning one QR code.
        </p>
        <div className="live-feature-row">
          <span>
            <Clock3 size={15} /> 72-hour invite
          </span>
          <span>
            <QrCode size={15} /> QR entry
          </span>
          <span>
            <Wifi size={15} /> Live updates
          </span>
        </div>
      </section>

      <section className="login-panel-wrap">
        <div className="login-panel game-entry-panel">
          <div className="panel-flame">
            <Flame size={21} fill="currentColor" />
          </div>
          <p className="eyebrow">Begin tonight’s game</p>
          <h2>Start or join</h2>
          <p className="panel-copy">
            Hosts create an invitation. Contestants enter its public game code.
          </p>

          <form onSubmit={start}>
            <div className="start-game-fields event-fields">
              <label className="field">
                <span>Event</span>
                <input
                  value={eventName}
                  maxLength={35}
                  onChange={(event) => setEventName(event.target.value)}
                  placeholder="Birthday Party"
                  required
                />
              </label>
              <label className="field">
                <span>For</span>
                <input
                  value={honoree}
                  maxLength={40}
                  onChange={(event) => setHonoree(event.target.value)}
                  placeholder="Anmol"
                  required
                />
              </label>
            </div>
            <div className="start-game-fields host-fields">
              <label className="field">
                <span>Host</span>
                <input
                  value={hostName}
                  maxLength={40}
                  onChange={(event) => setHostName(event.target.value)}
                  placeholder="Nishika"
                  required
                />
              </label>
              <label className="field round-count-field">
                <span>Elimination rounds</span>
                <div className="select-wrap">
                  <select
                    value={totalRounds}
                    onChange={(event) =>
                      setTotalRounds(Number(event.target.value))
                    }
                  >
                    {Array.from({ length: 10 }, (_, index) => index + 1).map(
                      (rounds) => (
                        <option key={rounds} value={rounds}>
                          {rounds}
                        </option>
                      ),
                    )}
                  </select>
                  <ChevronDown size={17} />
                </div>
              </label>
            </div>
            <label className="field host-email-field">
              <span>
                Host email <small>Optional</small>
              </span>
              <input
                type="email"
                value={hostEmail}
                maxLength={254}
                onChange={(event) => setHostEmail(event.target.value)}
                placeholder="host@example.com"
              />
              <small>
                Used only on this device to address the host-access email.
              </small>
            </label>
            <label className="field roster-field">
              <span>
                Guest list <small>{parseRoster(rosterText).length} names</small>
              </span>
              <textarea
                value={rosterText}
                onChange={(event) => setRosterText(event.target.value)}
                placeholder="One name per line"
                rows={5}
              />
              <small>
                Guests will select their name after scanning the join QR code.
              </small>
            </label>
            <button
              className="primary-button login-button"
              type="submit"
              disabled={busy}
            >
              {busy ? "Creating invitation…" : "Create 72-hour invitation"}
              <Crown size={16} />
            </button>
          </form>

          <div className="entry-divider">
            <span>or join a game</span>
          </div>

          <form className="join-code-form" onSubmit={join}>
            <label className="field">
              <span>Game code</span>
              <input
                value={code}
                maxLength={9}
                onChange={(event) =>
                  setCode(normalizeGameCode(event.target.value))
                }
                placeholder="ABCD-1234"
              />
            </label>
            <button className="secondary-button" type="submit">
              Join
            </button>
          </form>
          <p className="returning-player-note">
            Returning on the same phone? Open this page again to reconnect
            automatically.
          </p>

          {error && <p className="form-error entry-error">{error}</p>}
          <button className="display-entry-link" onClick={onHost}>
            <Crown size={14} />
            Rejoin with a private host code
          </button>
          <button className="display-entry-link" onClick={onDisplay}>
            <Maximize2 size={14} />
            Connect this screen as the TV display
          </button>
        </div>
      </section>
    </main>
  );
}

function HostConnectScreen({
  initialCode,
  error,
  onConnect,
  onBack,
}: {
  initialCode: string;
  error: string;
  onConnect: (code: string, hostKey: string) => Promise<void>;
  onBack: () => void;
}) {
  const [code, setCode] = useState(initialCode);
  const [hostKey, setHostKey] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await onConnect(code, hostKey);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="join-page display-connect-page">
      <div className="join-card display-connect-card">
        <button className="join-back" onClick={onBack}>
          ← Back to game options
        </button>
        <div className="join-mark">
          <Crown size={20} />
        </div>
        <p className="eyebrow">Private host access</p>
        <h1>Rejoin your game</h1>
        <p className="display-connect-copy">
          Open the private host link or enter the game code and host code. This
          device will receive full host controls for the same game.
        </p>
        <form onSubmit={submit}>
          <div className="join-fields">
            <label className="field compact">
              <span>Game code</span>
              <input
                value={displayGameCode(code)}
                maxLength={9}
                onChange={(event) =>
                  setCode(normalizeGameCode(event.target.value))
                }
                placeholder="ABCD-1234"
                required
              />
            </label>
            <label className="field compact">
              <span>Private host code</span>
              <input
                value={displayHostKey(hostKey)}
                maxLength={19}
                onChange={(event) =>
                  setHostKey(normalizeHostKey(event.target.value))
                }
                placeholder="A1B2-C3D4-E5F6-7890"
                required
              />
            </label>
          </div>
          {error && <p className="form-error join-error">{error}</p>}
          <button
            className="primary-button full-button join-submit"
            type="submit"
            disabled={busy}
          >
            {busy ? "Opening host controls…" : "Open host controls"}
            {!busy && <Crown size={15} />}
          </button>
        </form>
        <p className="privacy-note">
          <Shield size={13} />
          Keep the host code private—it can control rounds and eliminations.
        </p>
      </div>
    </main>
  );
}

function DisplayConnectScreen({
  initialCode,
  error,
  onConnect,
  onBack,
}: {
  initialCode: string;
  error: string;
  onConnect: (code: string, displayKey: string) => Promise<void>;
  onBack: () => void;
}) {
  const [code, setCode] = useState(initialCode);
  const [displayKey, setDisplayKey] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await onConnect(code, displayKey);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="join-page display-connect-page">
      <div className="join-card display-connect-card">
        <button className="join-back" onClick={onBack}>
          ← Back to game options
        </button>
        <div className="join-mark">
          <Maximize2 size={20} />
        </div>
        <p className="eyebrow">Read-only screen</p>
        <h1>Connect the TV</h1>
        <p className="display-connect-copy">
          Enter the private pairing details shown on the host’s phone. This
          screen will display live portraits and status changes without host
          controls.
        </p>
        <form onSubmit={submit}>
          <div className="join-fields">
            <label className="field compact">
              <span>Game code</span>
              <input
                value={displayGameCode(code)}
                maxLength={9}
                onChange={(event) =>
                  setCode(normalizeGameCode(event.target.value))
                }
                placeholder="ABCD-1234"
                required
              />
            </label>
            <label className="field compact">
              <span>TV pairing key</span>
              <input
                value={displayPairingKey(displayKey)}
                maxLength={14}
                onChange={(event) =>
                  setDisplayKey(normalizeDisplayKey(event.target.value))
                }
                placeholder="A1B2-C3D4-E5F6"
                required
              />
            </label>
          </div>
          {error && <p className="form-error join-error">{error}</p>}
          <button
            className="primary-button full-button join-submit"
            type="submit"
            disabled={busy}
          >
            {busy ? "Pairing display…" : "Open the TV display"}
            {!busy && <Maximize2 size={15} />}
          </button>
        </form>
        <p className="privacy-note">
          <Shield size={13} />
          The TV can view the game but cannot change anyone’s fate.
        </p>
      </div>
    </main>
  );
}

function JoinGameScreen({
  code,
  error,
  onJoin,
  onBack,
}: {
  code: string;
  error: string;
  onJoin: (input: {
    name: string;
    photo: string;
  }) => Promise<void>;
  onBack: () => void;
}) {
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [joinableGame, setJoinableGame] =
    useState<JoinableCloudGame | null>(null);
  const [rosterError, setRosterError] = useState("");
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingRoster(true);
    setRosterError("");
    void loadJoinableCloudGame(code)
      .then((nextGame) => {
        if (cancelled) return;
        setJoinableGame(nextGame);
        setName((current) =>
          nextGame.availableNames.includes(current) ? current : "",
        );
      })
      .catch((lookupIssue) => {
        if (!cancelled) setRosterError(friendlyCloudError(lookupIssue));
      })
      .finally(() => {
        if (!cancelled) setLoadingRoster(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code, error]);

  const choosePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPhotoError("");
    try {
      setPhoto(await compressPhoto(file));
    } catch (photoIssue) {
      setPhotoError(friendlyCloudError(photoIssue));
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setRosterError("Choose your name from the guest list.");
      return;
    }
    if (!photo) {
      setPhotoError("Add a portrait before entering the hall.");
      return;
    }
    setBusy(true);
    try {
      await onJoin({ name, photo });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="join-page">
      <div className="join-card">
        <button className="join-back" onClick={onBack}>
          ← Enter a different code
        </button>
        <div className="join-mark">
          <Crown size={21} />
        </div>
        <p className="eyebrow">You have been summoned</p>
        <h1>Claim your portrait</h1>
        <p className="join-code-label">
          Game <strong>{displayGameCode(code)}</strong>
        </p>
        {joinableGame && (
          <p className="join-event-label">
            <strong>{joinableGame.title}</strong>
            <span>Hosted by {joinableGame.hostName}</span>
            <span>
              {joinableGame.status === "lobby"
                ? "Photo invitation open · stored for up to 72 hours"
                : "Game live · data expires within 48 hours"}
            </span>
          </p>
        )}

        <form onSubmit={submit}>
          <button
            type="button"
            className={`portrait-picker ${photo ? "has-photo" : ""}`}
            onClick={() => inputRef.current?.click()}
          >
            {photo ? (
              <img src={photo} alt="Your portrait preview" />
            ) : (
              <>
                <Camera size={25} />
                <strong>Add your photo</strong>
                <span>JPG, PNG, or WebP · up to 8 MB</span>
              </>
            )}
            {photo && (
              <span className="portrait-picker-edit">
                <Camera size={14} /> Change
              </span>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={choosePhoto}
            hidden
          />
          {photoError && <p className="form-error">{photoError}</p>}

          <div className="join-fields">
            <label className="field compact">
              <span>Your name</span>
              {loadingRoster ? (
                <div className="select-wrap">
                  <select disabled>
                    <option>Loading guest list…</option>
                  </select>
                  <ChevronDown size={17} />
                </div>
              ) : joinableGame?.rosterLocked ? (
                <div className="select-wrap">
                  <select
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    disabled={
                      loadingRoster ||
                      joinableGame.availableNames.length === 0
                    }
                    required
                  >
                    <option value="">
                      {joinableGame.availableNames.length
                        ? "Choose your name"
                        : "All guest names are claimed"}
                    </option>
                    {joinableGame.availableNames.map((guestName) => (
                      <option key={guestName} value={guestName}>
                        {guestName}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={17} />
                </div>
              ) : (
                <input
                  value={name}
                  maxLength={40}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="How should the hall remember you?"
                  required
                />
              )}
            </label>
          </div>

          {rosterError && <p className="form-error join-error">{rosterError}</p>}
          {error && <p className="form-error join-error">{error}</p>}
          <button
            className="primary-button full-button join-submit"
            type="submit"
            disabled={
              busy ||
              loadingRoster ||
              Boolean(
                joinableGame?.rosterLocked &&
                  joinableGame.availableNames.length === 0,
              )
            }
          >
            {busy ? "Entering the manor…" : "Enter the hall"}
            {!busy && <span>→</span>}
          </button>
        </form>
        <p className="privacy-note">
          <Shield size={13} />
          No email or password. Your portrait is removed when this game expires.
        </p>
      </div>
    </main>
  );
}

function LoginScreen({
  players,
  onLogin,
}: {
  players: Player[];
  onLogin: (session: Session) => void;
}) {
  const [role, setRole] = useState<Role>("player");
  const [playerId, setPlayerId] = useState(players[0]?.id ?? "");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (role === "host") {
      if (pin !== HOST_PIN) {
        setError("That host key does not open this castle.");
        return;
      }
      onLogin({ role: "host" });
      return;
    }

    if (!playerId) {
      setError("Choose your portrait to enter.");
      return;
    }
    onLogin({ role: "player", playerId });
  };

  return (
    <main className="login-page">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <section className="login-story">
        <div className="season-kicker">
          <span />
          Blackthorne Manor · Season One
        </div>
        <div className="crest crest-large" aria-label="Traitors crest">
          <TraitorsMark size={43} />
        </div>
        <p className="eyebrow">Welcome to</p>
        <h1>
          The Hall
          <br />
          <em>of Fame</em>
        </h1>
        <p className="login-intro">
          Every face tells a story. Every cross seals a fate. Enter the manor
          to claim your portrait—or preside over the game.
        </p>
        <div className="login-stats">
          <div>
            <strong>{players.length}</strong>
            <span>Invited</span>
          </div>
          <div>
            <strong>{players.filter((player) => player.status === "active").length}</strong>
            <span>Remain</span>
          </div>
          <div>
            <strong>{players.filter((player) => player.status !== "active").length}</strong>
            <span>Fallen</span>
          </div>
        </div>
      </section>

      <section className="login-panel-wrap">
        <form className="login-panel" onSubmit={submit}>
          <div className="panel-flame">
            <Flame size={21} fill="currentColor" />
          </div>
          <p className="eyebrow">Identity required</p>
          <h2>Enter the manor</h2>
          <p className="panel-copy">
            Choose how you are joining tonight’s game.
          </p>

          <div className="role-tabs" role="tablist" aria-label="Choose a role">
            <button
              type="button"
              className={role === "player" ? "active" : ""}
              onClick={() => {
                setRole("player");
                setError("");
              }}
            >
              <UserRound size={17} />
              Contestant
            </button>
            <button
              type="button"
              className={role === "host" ? "active" : ""}
              onClick={() => {
                setRole("host");
                setError("");
              }}
            >
              <Crown size={17} />
              Host
            </button>
          </div>

          {role === "player" ? (
            <label className="field">
              <span>Your name</span>
              <div className="select-wrap">
                <select
                  value={playerId}
                  onChange={(event) => setPlayerId(event.target.value)}
                >
                  {players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={17} />
              </div>
              <small>You’ll be able to update your own portrait.</small>
            </label>
          ) : (
            <label className="field">
              <span>Host key</span>
              <input
                type="password"
                inputMode="numeric"
                placeholder="Enter the four-digit key"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                autoFocus
              />
              <small>Demo key: 2026</small>
            </label>
          )}

          {error && <p className="form-error">{error}</p>}

          <button className="primary-button login-button" type="submit">
            Enter the hall
            <span>→</span>
          </button>
          <p className="privacy-note">
            <Shield size={13} />
            Portraits are kept on this device in this demo.
          </p>
        </form>
      </section>
    </main>
  );
}

function Hall({
  players,
  session,
  onPlayersChange,
  onLogout,
  onlineGame,
  onRoundChange,
  onGameStart,
  onGameEnd,
  syncError,
}: {
  players: Player[];
  session: Session;
  onPlayersChange: (players: Player[]) => void;
  onLogout: () => void;
  onlineGame?: CloudGame & {
    joinUrl: string;
    displayUrl?: string;
    displayKey?: string;
    hostUrl?: string;
    hostKey?: string;
    hostEmail?: string;
  };
  onRoundChange?: (round: number) => void;
  onGameStart?: () => Promise<void>;
  onGameEnd?: () => Promise<void>;
  syncError?: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Player | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [tvMode, setTvMode] = useState(session.role === "display");
  const [localRound, setLocalRound] = useState(1);
  const [toast, setToast] = useState("");
  const [startingGame, setStartingGame] = useState(false);
  const [endingGame, setEndingGame] = useState(false);
  const isHost = session.role === "host";
  const isDisplay = session.role === "display";
  const isGameStarted = !onlineGame || onlineGame.status === "active";
  const currentPlayer = players.find((player) => player.id === session.playerId);
  const currentRound = onlineGame?.currentRound ?? localRound;
  const totalRounds = onlineGame?.totalRounds ?? 3;

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const beginOnlineGame = async () => {
    if (!onGameStart || startingGame) return;
    const confirmed = window.confirm(
      "Start the game now? The invitation window will close and all game data will be deleted 48 hours from now.",
    );
    if (!confirmed) return;

    setStartingGame(true);
    try {
      await onGameStart();
      setToast("The game is live. The 48-hour countdown has started.");
    } catch {
      setToast("The game could not be started. Please try again.");
    } finally {
      setStartingGame(false);
    }
  };

  const endOnlineGame = async () => {
    if (!onGameEnd || endingGame) return;
    const confirmed = window.confirm(
      "End this game now? This permanently deletes every portrait, contestant, host connection, and TV connection. This cannot be undone.",
    );
    if (!confirmed) return;

    setEndingGame(true);
    try {
      await onGameEnd();
    } catch {
      setToast("The game could not be ended. Nothing was deleted.");
      setEndingGame(false);
    }
  };

  const activeCount = players.filter((player) => player.status === "active").length;
  const fallenCount = players.length - activeCount;
  const filteredPlayers = useMemo(() => {
    if (filter === "active") {
      return players.filter((player) => player.status === "active");
    }
    if (filter === "fallen") {
      return players.filter((player) => player.status !== "active");
    }
    return players;
  }, [filter, players]);

  const updatePlayer = (updated: Player) => {
    onPlayersChange(
      players.map((player) => (player.id === updated.id ? updated : player)),
    );
    setSelected(updated);
  };

  const updatePhoto = async (player: Player, file: File) => {
    try {
      const photo = await compressPhoto(file);
      const updated = { ...player, photo };
      onPlayersChange(
        players.map((item) => (item.id === player.id ? updated : item)),
      );
      devLog("Portrait updated", { playerId: player.id });
      if (selected?.id === player.id) setSelected(updated);
      setToast(`${player.name}'s portrait has been updated.`);
    } catch {
      setToast("That photo could not be used. Please try another.");
    }
  };

  const addPlayer = (name: string) => {
    const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
    onPlayersChange([
      ...players,
      {
        id,
        name,
        photo: "",
        status: "active",
      },
    ]);
    devLog("Contestant added", { id, name });
    setShowAdd(false);
    setToast(`${name} has entered the manor.`);
  };

  const resetHall = () => {
    if (!window.confirm("Reset the entire hall to its original demo cast?")) return;
    onPlayersChange(seedPlayers);
    devLog("Demo cast reset");
    setToast("The original cast has been restored.");
  };

  const toggleTvMode = async () => {
    if (tvMode) {
      setTvMode(false);
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => undefined);
      }
      return;
    }

    setFilter("all");
    setTvMode(true);
    await document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  const tvColumns =
    players.length <= 2
      ? Math.max(players.length, 1)
      : players.length <= 4
        ? 4
        : players.length <= 8
          ? 4
          : players.length <= 12
            ? 6
            : players.length <= 16
              ? 8
              : players.length <= 18
                ? 6
                : players.length <= 24
                  ? 8
                  : 10;
  const tvRows = Math.max(1, Math.ceil(players.length / tvColumns));
  const tvGap = 10;
  const tvCardWidth = `calc(${100 / tvColumns}% - ${
    ((tvColumns - 1) * tvGap) / tvColumns
  }px)`;
  const tvCardHeight = `calc(${100 / tvRows}% - ${
    ((tvRows - 1) * tvGap) / tvRows
  }px)`;

  return (
    <main className={`hall-page ${tvMode ? "tv-mode" : ""}`}>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Traitors Hall of Fame">
          <span className="mini-crest">
            <TraitorsMark size={22} />
          </span>
          <span>
            Traitors
            <small>Hall of Fame</small>
          </span>
        </a>
        <nav>
          {(isHost || isDisplay) && (
            <button className="nav-button tv-mode-button" onClick={toggleTvMode}>
              {tvMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              {tvMode ? "Exit TV mode" : "TV mode"}
            </button>
          )}
          <button className="nav-button" onClick={() => setShowRules(true)}>
            <CircleHelp size={16} />
            Rules
          </button>
          <div className="identity-pill">
            {isHost ? (
              <Crown size={15} />
            ) : isDisplay ? (
              <Maximize2 size={15} />
            ) : (
              <UserRound size={15} />
            )}
            <span>
              <small>
                {isHost
                  ? "Signed in as"
                  : isDisplay
                    ? "Connected as"
                    : "Playing as"}
              </small>
              {isHost
                ? onlineGame?.hostName ?? "The Host"
                : isDisplay
                  ? "TV Display"
                  : currentPlayer?.name ?? "Contestant"}
            </span>
          </div>
          <button className="icon-button" onClick={onLogout} aria-label="Sign out">
            <LogOut size={18} />
          </button>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-glow" />
        <div className="hero-content">
          <div className="season-kicker centered">
            <span />
            {onlineGame?.title ?? "Blackthorne Manor · Season One"}
            <span />
          </div>
          <p className="eyebrow">The official</p>
          <h1>
            Hall <em>of</em> Fame
          </h1>
          <p className="hero-copy">
            Some came to deceive. Others came to survive.
            <br />
            All of them earned their place on these walls.
          </p>
          <div className="hero-summary">
            <div>
              <UsersRound size={17} />
              <strong>{players.length}</strong>
              <span>Portraits</span>
            </div>
            <i />
            <div>
              <Sparkles size={17} />
              <strong>{activeCount}</strong>
              <span>Still standing</span>
            </div>
            <i />
            <div>
              <Skull size={17} />
              <strong>{fallenCount}</strong>
              <span>Fallen</span>
            </div>
          </div>
        </div>
      </section>

      {syncError && (
        <section className="sync-error" role="alert">
          <WifiOff size={16} />
          {syncError} Your latest view has been restored from the shared game.
        </section>
      )}

      {onlineGame && isHost && (
        <OnlineLobby
          game={onlineGame}
          playerCount={players.length}
          claimedCount={
            players.filter((player) => player.claimed !== false).length
          }
        />
      )}

      {isHost ? (
        <section className="host-bar">
          <div className="host-bar-label">
            <span className="host-live-dot" />
            <div>
              <strong>
                {isGameStarted
                  ? "Host controls are live"
                  : "Photo collection is open"}
              </strong>
              <small>
                {isGameStarted
                  ? "Select a portrait to record their fate"
                  : "Start the game when everyone is ready"}
              </small>
            </div>
          </div>
          {isGameStarted ? (
            <RoundSelector
              currentRound={currentRound}
              totalRounds={totalRounds}
              onChange={(round) => {
                if (onRoundChange) {
                  onRoundChange(round);
                } else {
                  setLocalRound(round);
                }
              }}
            />
          ) : (
            <button
              className="primary-button start-game-button"
              onClick={beginOnlineGame}
              disabled={startingGame}
            >
              <Flame size={16} />
              {startingGame ? "Starting…" : "Start game · begin 48 hours"}
            </button>
          )}
          <div className="host-actions">
            {onlineGame ? (
              <>
                <span className="live-sync-label">
                  <Wifi size={15} />
                  {isGameStarted ? "Live on every screen" : "Invitation open"}
                </span>
                <button
                  className="end-game-button"
                  onClick={endOnlineGame}
                  disabled={endingGame}
                >
                  <Trash2 size={14} />
                  {endingGame ? "Ending…" : "End game"}
                </button>
              </>
            ) : (
              <>
                <button className="text-button" onClick={resetHall}>
                  <RotateCcw size={15} />
                  Reset demo
                </button>
                <button
                  className="secondary-button"
                  onClick={() => setShowAdd(true)}
                >
                  <Plus size={16} />
                  Add contestant
                </button>
              </>
            )}
          </div>
        </section>
      ) : !isDisplay ? (
        <section className="player-notice">
          <Camera size={17} />
          <span>
            Want a different portrait? Find your card and choose{" "}
            <strong>Update my photo</strong>.
            {onlineGame && (
              <>
                {" "}
                You’re connected to game{" "}
                <strong>{displayGameCode(onlineGame.code)}</strong>.
              </>
            )}
          </span>
        </section>
      ) : null}

      <section className="gallery-section">
        <div className="gallery-heading">
          <div>
            <p className="eyebrow">
              {!isGameStarted
                ? `Photo collection · ${
                    onlineGame?.title ?? "Season portrait gallery"
                  }`
                : tvMode
                ? `Elimination round ${currentRound} of ${totalRounds} · ${
                    onlineGame?.title ?? "Season portrait gallery"
                  }`
                : `Elimination round ${currentRound} of ${totalRounds}`}
            </p>
            <h2>
              {!isGameStarted
                ? "The guest portraits are gathering"
                : tvMode
                  ? "Hall of Fame"
                  : "The castle remembers everyone"}
            </h2>
          </div>
          <div className="filter-tabs" aria-label="Filter contestants">
            {(["all", "active", "fallen"] as Filter[]).map((option) => (
              <button
                key={option}
                className={filter === option ? "active" : ""}
                onClick={() => setFilter(option)}
              >
                {option === "all"
                  ? `All ${players.length}`
                  : option === "active"
                    ? `Remaining ${activeCount}`
                    : `Fallen ${fallenCount}`}
              </button>
            ))}
          </div>
        </div>

        <div
          className="portrait-grid"
          style={
            {
              "--tv-columns": tvColumns,
              "--tv-rows": tvRows,
              "--tv-card-width": tvCardWidth,
              "--tv-card-height": tvCardHeight,
            } as React.CSSProperties
          }
        >
          {filteredPlayers.map((player, index) => {
            const canEdit = isHost || session.playerId === player.id;
            return (
              <PortraitCard
                key={player.id}
                player={player}
                index={index}
                isHost={isHost && isGameStarted}
                canEdit={canEdit}
                onHostSelect={() => setSelected(player)}
                onPhoto={(file) => updatePhoto(player, file)}
              />
            );
          })}
        </div>

        {filteredPlayers.length === 0 && (
          <div className="empty-state">
            {onlineGame && isHost ? <QrCode size={25} /> : <Flame size={25} />}
            <h3>
              {onlineGame && isHost
                ? "Waiting for the first arrival"
                : "No portraits in this wing"}
            </h3>
            <p>
              {onlineGame && isHost
                ? "Keep the QR code on screen while contestants join."
                : "Choose another filter to return to the gallery."}
            </p>
          </div>
        )}
      </section>

      <footer>
        <div className="footer-crest">
          <TraitorsMark size={25} />
        </div>
        <p>The truth always comes out in the end.</p>
        <span>
          {onlineGame
            ? `Hosted by ${onlineGame.hostName}`
            : "Blackthorne Manor · MMXXVI"}
        </span>
      </footer>

      {selected && isHost && isGameStarted && (
        <FateModal
          player={selected}
          currentRound={currentRound}
          onClose={() => setSelected(null)}
          onUpdate={(updated) => {
            devLog("Fate updated", {
              playerId: updated.id,
              status: updated.status,
              eliminationRound: updated.eliminationRound,
            });
            updatePlayer(updated);
            setSelected(null);
            setToast(
              updated.status === "active"
                ? `${updated.name} has returned to the game.`
                : `${updated.name} has been marked ${statusLabels[
                    updated.status
                  ].toLowerCase()}.`,
            );
          }}
          onPhoto={(file) => updatePhoto(selected, file)}
        />
      )}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
      {showAdd && !onlineGame && (
        <AddPlayerModal
          onClose={() => setShowAdd(false)}
          onAdd={addPlayer}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
    </main>
  );
}

function RoundSelector({
  currentRound,
  totalRounds,
  onChange,
}: {
  currentRound: number;
  totalRounds: number;
  onChange: (round: number) => void;
}) {
  return (
    <div className="round-selector" aria-label="Choose elimination round">
      <span>Elimination round</span>
      <div>
        {Array.from({ length: totalRounds }, (_, index) => index + 1).map(
          (round) => (
            <button
              key={round}
              className={currentRound === round ? "active" : ""}
              onClick={() => onChange(round)}
              aria-label={`Round ${round}`}
            >
              {round}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

function OnlineLobby({
  game,
  playerCount,
  claimedCount,
}: {
  game: CloudGame & {
    joinUrl: string;
    displayUrl?: string;
    displayKey?: string;
    hostUrl?: string;
    hostKey?: string;
    hostEmail?: string;
  };
  playerCount: number;
  claimedCount: number;
}) {
  const [copied, setCopied] = useState(false);
  const [showDisplayPairing, setShowDisplayPairing] = useState(false);
  const [showHostAccess, setShowHostAccess] = useState(false);
  const isGameStarted = game.status === "active";
  const hostEmailUrl =
    game.hostUrl && game.hostKey
      ? buildHostAccessEmailUrl({
          ...game,
          hostUrl: game.hostUrl,
          hostKey: game.hostKey,
        })
      : undefined;
  const hoursRemaining = Math.max(
    0,
    Math.ceil((new Date(game.expiresAt).getTime() - Date.now()) / 3_600_000),
  );

  const copyLink = async () => {
    await navigator.clipboard.writeText(game.joinUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section className="online-lobby">
      <div className="qr-frame">
        <QRCodeSVG
          value={game.joinUrl}
          size={158}
          bgColor="#f4e7ca"
          fgColor="#1a0906"
          level="M"
          marginSize={2}
        />
      </div>
      <div className="online-lobby-copy">
        <p className="eyebrow">
          {isGameStarted ? "Game in progress" : "72-hour invitation window"}
        </p>
        <h2>
          {isGameStarted
            ? "The hall is live"
            : "Contestants, claim your portrait"}
        </h2>
        <p>
          {isGameStarted
            ? "Portraits and status changes remain available until the game’s 48-hour window ends."
            : "Send this link before the event so guests can choose their name and add a photo. Their portraits remain ready here until you start."}
        </p>
        <p className="lobby-host">Hosted by {game.hostName}</p>
        <div className="game-code-display">
          <span>Game code</span>
          <strong>{displayGameCode(game.code)}</strong>
          <button onClick={copyLink}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        <div className="private-access-buttons">
          {game.hostUrl && game.hostKey && (
            <button
              className="pair-tv-button"
              onClick={() => setShowHostAccess(true)}
            >
              <Crown size={15} />
              Private host access
            </button>
          )}
          {hostEmailUrl && (
            <a className="pair-tv-button" href={hostEmailUrl}>
              <Mail size={15} />
              Email host access
            </a>
          )}
          {game.displayUrl && game.displayKey && (
            <button
              className="pair-tv-button"
              onClick={() => setShowDisplayPairing(true)}
            >
              <Maximize2 size={15} />
              Pair a TV display
            </button>
          )}
        </div>
      </div>
      <div className="lobby-status">
        <div>
          <UsersRound size={18} />
          <strong>
            {claimedCount}/{playerCount}
          </strong>
          <span>photos ready</span>
        </div>
        <div>
          <Flame size={18} />
          <strong>
            {isGameStarted
              ? `${game.currentRound}/${game.totalRounds}`
              : "Invite"}
          </strong>
          <span>{isGameStarted ? "round" : "phase"}</span>
        </div>
        <div>
          <Clock3 size={18} />
          <strong>{hoursRemaining}</strong>
          <span>hours left</span>
        </div>
        <small>
          <span className="host-live-dot" />
          {isGameStarted
            ? "Game live · deletes after 48 hours"
            : "Collecting photos"}
        </small>
      </div>
      {showHostAccess && game.hostUrl && game.hostKey && (
        <HostAccessModal
          game={{
            ...game,
            hostUrl: game.hostUrl,
            hostKey: game.hostKey,
          }}
          onClose={() => setShowHostAccess(false)}
        />
      )}
      {showDisplayPairing && game.displayUrl && game.displayKey && (
        <DisplayPairModal
          game={{
            ...game,
            displayUrl: game.displayUrl,
            displayKey: game.displayKey,
          }}
          onClose={() => setShowDisplayPairing(false)}
        />
      )}
    </section>
  );
}

function HostAccessModal({
  game,
  onClose,
}: {
  game: CloudGame & {
    joinUrl: string;
    hostUrl: string;
    hostKey: string;
    hostEmail?: string;
  };
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    await navigator.clipboard.writeText(game.hostUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <ModalShell onClose={onClose} label="Private host access">
      <div className="modal-heading">
        <p className="eyebrow">Private host access</p>
        <h2>Open controls on another device</h2>
        <p>
          Scan this QR code on the host’s phone or enter both codes manually.
          Anyone with this link can control the game, so do not send it to
          contestants.
        </p>
      </div>
      <div className="display-pair-content">
        <div className="display-pair-qr">
          <QRCodeSVG
            value={game.hostUrl}
            size={190}
            bgColor="#f4e7ca"
            fgColor="#1a0906"
            level="M"
            marginSize={2}
          />
        </div>
        <div className="display-pair-codes">
          <span>Game code</span>
          <strong>{displayGameCode(game.code)}</strong>
          <span>Private host code</span>
          <strong>{displayHostKey(game.hostKey)}</strong>
        </div>
      </div>
      <button className="primary-button full-button" onClick={copyLink}>
        {copied ? <Check size={16} /> : <Copy size={16} />}
        {copied ? "Host link copied" : "Copy private host link"}
      </button>
      <a
        className="secondary-button full-button email-host-link"
        href={buildHostAccessEmailUrl(game)}
      >
        <Mail size={16} />
        Email host and player links
      </a>
    </ModalShell>
  );
}

function DisplayPairModal({
  game,
  onClose,
}: {
  game: CloudGame & {
    displayUrl: string;
    displayKey: string;
  };
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    await navigator.clipboard.writeText(game.displayUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <ModalShell onClose={onClose} label="Pair a TV display">
      <div className="modal-heading">
        <p className="eyebrow">Private display pairing</p>
        <h2>Connect the TV</h2>
        <p>
          Open this link on the TV or enter both codes there. Keep this pairing
          key private—it grants read-only access to the live hall.
        </p>
      </div>
      <div className="display-pair-content">
        <div className="display-pair-qr">
          <QRCodeSVG
            value={game.displayUrl}
            size={190}
            bgColor="#f4e7ca"
            fgColor="#1a0906"
            level="M"
            marginSize={2}
          />
        </div>
        <div className="display-pair-codes">
          <span>Game code</span>
          <strong>{displayGameCode(game.code)}</strong>
          <span>TV pairing key</span>
          <strong>{displayPairingKey(game.displayKey)}</strong>
        </div>
      </div>
      <button className="primary-button full-button" onClick={copyLink}>
        {copied ? <Check size={16} /> : <Copy size={16} />}
        {copied ? "Display link copied" : "Copy display link"}
      </button>
    </ModalShell>
  );
}

function PortraitCard({
  player,
  index,
  isHost,
  canEdit,
  onHostSelect,
  onPhoto,
}: {
  player: Player;
  index: number;
  isHost: boolean;
  canEdit: boolean;
  onHostSelect: () => void;
  onPhoto: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isFallen = player.status !== "active";

  const choosePhoto = (event: MouseEvent) => {
    event.stopPropagation();
    inputRef.current?.click();
  };

  const handlePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onPhoto(file);
    event.target.value = "";
  };

  return (
    <article
      className={`portrait-card ${isFallen ? "fallen" : ""} ${
        player.claimed === false ? "unclaimed" : ""
      } ${
        isHost ? "host-editable" : ""
      }`}
      style={{ animationDelay: `${Math.min(index * 45, 360)}ms` }}
      onClick={isHost ? onHostSelect : undefined}
    >
      <div className="portrait-frame">
        <div className="corner corner-tl" />
        <div className="corner corner-tr" />
        <div className="corner corner-bl" />
        <div className="corner corner-br" />
        <div className="portrait-image-wrap">
          {player.photo ? (
            <img src={player.photo} alt={`${player.name}'s portrait`} />
          ) : (
            <div className="portrait-placeholder">
              <span>{player.name.slice(0, 1)}</span>
              <small>
                {player.claimed === false ? "Awaiting claim" : "Portrait awaiting"}
              </small>
            </div>
          )}
          <div className="portrait-vignette" />

          {isFallen && (
            <div className={`fate-mark fate-${player.status}`}>
              <span className="cross cross-one" />
              <span className="cross cross-two" />
              <div className="fate-ribbon">
                <strong>{statusLabels[player.status]}</strong>
                {player.eliminationRound && (
                  <small>Round {player.eliminationRound}</small>
                )}
              </div>
            </div>
          )}

          {isHost && (
            <div className="host-hover-label">
              {isFallen ? <RotateCcw size={17} /> : <Skull size={17} />}
              {isFallen ? "Review fate" : "Record fate"}
            </div>
          )}

          {canEdit && !isHost && (
            <button className="photo-hover-button" onClick={choosePhoto}>
              <Camera size={16} />
              Update my photo
            </button>
          )}
        </div>
        <div className="portrait-plaque">
          <span className="plaque-line" />
          <h3>{player.name}</h3>
        </div>
      </div>
      {canEdit && (
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handlePhoto}
          hidden
        />
      )}
    </article>
  );
}

function ModalShell({
  children,
  onClose,
  label,
}: {
  children: React.ReactNode;
  onClose: () => void;
  label: string;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <X size={19} />
        </button>
        {children}
      </section>
    </div>
  );
}

function FateModal({
  player,
  currentRound,
  onClose,
  onUpdate,
  onPhoto,
}: {
  player: Player;
  currentRound: number;
  onClose: () => void;
  onUpdate: (player: Player) => void;
  onPhoto: (file: File) => void;
}) {
  const [status, setStatus] = useState<PlayerStatus>(
    player.status === "active" ? "banished" : player.status,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const isFallen = player.status !== "active";

  const handlePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onPhoto(file);
    event.target.value = "";
  };

  return (
    <ModalShell onClose={onClose} label={`Manage ${player.name}`}>
      <div className="modal-heading">
        <p className="eyebrow">Elimination round {currentRound}</p>
        <h2>{isFallen ? "Review their fate" : "A fate must be recorded"}</h2>
        <p>
          {isFallen
            ? "Restore this contestant or update how they left the game."
            : "Choose the official outcome. This will cross their portrait in the hall."}
        </p>
      </div>

      <div className="fate-person">
        <div className="fate-thumb">
          {player.photo ? (
            <img src={player.photo} alt="" />
          ) : (
            <span>{player.name.slice(0, 1)}</span>
          )}
        </div>
        <div>
          <strong>{player.name}</strong>
        </div>
        <button onClick={() => inputRef.current?.click()}>
          <Camera size={15} />
          Change photo
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handlePhoto}
          hidden
        />
      </div>

      <div className="fate-options">
        {(
          [
            ["banished", "Banished", "Voted out by the group"],
            ["murdered", "Murdered", "Removed by the Traitors"],
            ["departed", "Left game", "Withdrew or was removed"],
          ] as [PlayerStatus, string, string][]
        ).map(([value, label, detail]) => (
          <button
            key={value}
            className={status === value ? "active" : ""}
            onClick={() => setStatus(value)}
          >
            <span className={`fate-option-icon ${value}`}>
              {value === "banished" ? (
                <Flame size={18} />
              ) : value === "murdered" ? (
                <Skull size={18} />
              ) : (
                <LogOut size={18} />
              )}
            </span>
            <span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
            <i>{status === value && <Check size={14} />}</i>
          </button>
        ))}
      </div>

      <div className="modal-actions">
        {isFallen && (
          <button
            className="restore-button"
            onClick={() =>
              onUpdate({
                ...player,
                status: "active",
                eliminationRound: undefined,
              })
            }
          >
            <RotateCcw size={16} />
            Restore to game
          </button>
        )}
        <button
          className="primary-button danger-button"
          onClick={() =>
            onUpdate({
              ...player,
              status,
              eliminationRound: currentRound,
            })
          }
        >
          <Skull size={16} />
          {isFallen ? "Update fate" : "Cross the portrait"}
        </button>
      </div>
    </ModalShell>
  );
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell onClose={onClose} label="Hall rules">
      <div className="modal-heading">
        <p className="eyebrow">House law</p>
        <h2>Rules of the hall</h2>
        <p>Everyone has a place here. Only the host decides their fate.</p>
      </div>
      <div className="rules-list">
        <div>
          <span>01</span>
          <div>
            <strong>Claim your portrait</strong>
            <p>
              Contestants sign in under their own name and can upload or replace
              only their photo.
            </p>
          </div>
        </div>
        <div>
          <span>02</span>
          <div>
            <strong>The host records every exit</strong>
            <p>
              A contestant may be banished, murdered, or marked as having left
              the game.
            </p>
          </div>
        </div>
        <div>
          <span>03</span>
          <div>
            <strong>The cross is final—until it isn’t</strong>
            <p>
              Fallen portraits receive the red cross. The host can correct or
              undo a decision at any time.
            </p>
          </div>
        </div>
      </div>
      <button className="primary-button full-button" onClick={onClose}>
        I understand
      </button>
    </ModalShell>
  );
}

function AddPlayerModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (name: string) => void;
}) {
  const [name, setName] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim()) onAdd(name.trim());
  };

  return (
    <ModalShell onClose={onClose} label="Add a contestant">
      <form onSubmit={submit}>
        <div className="modal-heading">
          <p className="eyebrow">A new arrival</p>
          <h2>Add a contestant</h2>
          <p>Create their place in the hall. They can upload a portrait later.</p>
        </div>
        <div className="add-player-fields">
          <label className="field compact">
            <span>Contestant name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Claudia"
              autoFocus
              required
            />
          </label>
        </div>
        <button className="primary-button full-button" type="submit">
          <Plus size={16} />
          Add to the hall
        </button>
      </form>
    </ModalShell>
  );
}

export default App;
