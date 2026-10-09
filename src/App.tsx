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
  Maximize2,
  Minimize2,
  Plus,
  QrCode,
  RotateCcw,
  Shield,
  Skull,
  Sparkles,
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
  createCloudGame,
  ensureAnonymousSession,
  isCloudConfigured,
  joinCloudGame,
  loadCloudGame,
  loadCloudPlayers,
  normalizeGameCode,
  subscribeToCloudPlayers,
  updateCloudFate,
  updateHostCloudPortrait,
  updateMyCloudPortrait,
} from "./cloud";

type PlayerStatus = "active" | "banished" | "murdered" | "departed";
type Role = "host" | "player";
type Filter = "all" | "active" | "fallen";

type Player = {
  id: string;
  name: string;
  photo: string;
  status: PlayerStatus;
};

type Session = {
  role: Role;
  playerId?: string;
};

type OnlineSession = {
  role: Role;
  gameId: string;
  playerId?: string;
};

const PLAYER_STORAGE_KEY = "traitors-hall-players-v1";
const SESSION_STORAGE_KEY = "traitors-hall-session-v1";
const ONLINE_SESSION_STORAGE_KEY = "traitors-online-session-v1";
const HOST_PIN = "2026";

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

function friendlyCloudError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/invalid or has expired/i.test(message)) {
    return "That game code is invalid or the 48-hour session has expired.";
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
  devLog("Cloud error", message);
  return "Something interrupted the game session. Please try again.";
}

function displayGameCode(code: string) {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
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
  const [stage, setStage] = useState<
    "loading" | "setup" | "entry" | "join" | "game"
  >(isCloudConfigured ? "loading" : "setup");
  const [game, setGame] = useState<CloudGame | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [session, setSession] = useState<OnlineSession | null>(null);
  const [joinCode, setJoinCode] = useState(initialCode);
  const [error, setError] = useState("");
  const [syncError, setSyncError] = useState("");

  const refreshPlayers = async (gameId: string) => {
    const nextPlayers = await loadCloudPlayers(gameId);
    setPlayers(nextPlayers);
  };

  useEffect(() => {
    if (!isCloudConfigured) return;

    let cancelled = false;
    const boot = async () => {
      try {
        await ensureAnonymousSession();
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
        if (!cancelled) setStage(initialCode ? "join" : "entry");
      } catch (bootError) {
        if (!cancelled) {
          setError(friendlyCloudError(bootError));
          setStage(initialCode ? "join" : "entry");
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
    return subscribeToCloudPlayers(game.id, () => {
      void refreshPlayers(game.id).catch((refreshError) =>
        setSyncError(friendlyCloudError(refreshError)),
      );
    });
  }, [game?.id, stage]);

  const startGame = async (title: string) => {
    setError("");
    try {
      const created = await createCloudGame(title);
      const nextSession: OnlineSession = {
        role: "host",
        gameId: created.id,
      };
      localStorage.setItem(
        ONLINE_SESSION_STORAGE_KEY,
        JSON.stringify(nextSession),
      );
      setGame(created);
      setPlayers([]);
      setSession(nextSession);
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

  const leaveGame = () => {
    localStorage.removeItem(ONLINE_SESSION_STORAGE_KEY);
    const url = new URL(window.location.href);
    url.searchParams.delete("game");
    window.history.replaceState({}, "", url);
    setGame(null);
    setPlayers([]);
    setSession(null);
    setError("");
    setStage("entry");
  };

  const syncPlayers = (nextPlayers: Player[]) => {
    if (!session) return;
    const changes = nextPlayers.filter((next) => {
      const previous = players.find((player) => player.id === next.id);
      return (
        previous &&
        (previous.photo !== next.photo ||
          previous.status !== next.status)
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
        previous.status !== next.status
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
        onPreview={onPreview}
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
      }}
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
  onPreview,
}: {
  error: string;
  onStart: (title: string) => Promise<void>;
  onJoin: (code: string) => void;
  onPreview: () => void;
}) {
  const [title, setTitle] = useState("Tonight at Blackthorne Manor");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const start = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await onStart(title);
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
          <Crown size={30} strokeWidth={1.5} />
          <span>T</span>
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
            <Clock3 size={15} /> 48-hour game
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
            Hosts create the room. Contestants enter the code on the screen.
          </p>

          <form onSubmit={start}>
            <label className="field">
              <span>Game title</span>
              <input
                value={title}
                maxLength={80}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </label>
            <button
              className="primary-button login-button"
              type="submit"
              disabled={busy}
            >
              {busy ? "Preparing the hall…" : "Start as host"}
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

          {error && <p className="form-error entry-error">{error}</p>}
          <button className="preview-link" onClick={onPreview}>
            Preview with the demo cast instead
          </button>
        </div>
      </section>
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
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
              <input
                value={name}
                maxLength={40}
                onChange={(event) => setName(event.target.value)}
                placeholder="How should the hall remember you?"
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
            {busy ? "Entering the manor…" : "Enter the hall"}
            {!busy && <span>→</span>}
          </button>
        </form>
        <p className="privacy-note">
          <Shield size={13} />
          No email or password. This device remembers you for this game.
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
          <Crown size={30} strokeWidth={1.5} />
          <span>T</span>
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
  syncError,
}: {
  players: Player[];
  session: Session;
  onPlayersChange: (players: Player[]) => void;
  onLogout: () => void;
  onlineGame?: CloudGame & { joinUrl: string };
  syncError?: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Player | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [tvMode, setTvMode] = useState(false);
  const [toast, setToast] = useState("");
  const isHost = session.role === "host";
  const currentPlayer = players.find((player) => player.id === session.playerId);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

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

  return (
    <main className={`hall-page ${tvMode ? "tv-mode" : ""}`}>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Traitors Hall of Fame">
          <span className="mini-crest">
            <Crown size={15} />
          </span>
          <span>
            Traitors
            <small>Hall of Fame</small>
          </span>
        </a>
        <nav>
          {isHost && (
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
            {isHost ? <Crown size={15} /> : <UserRound size={15} />}
            <span>
              <small>{isHost ? "Signed in as" : "Playing as"}</small>
              {isHost ? "The Host" : currentPlayer?.name ?? "Contestant"}
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
        <OnlineLobby game={onlineGame} playerCount={players.length} />
      )}

      {isHost ? (
        <section className="host-bar">
          <div className="host-bar-label">
            <span className="host-live-dot" />
            <div>
              <strong>Host controls are live</strong>
              <small>Select a portrait to record their fate</small>
            </div>
          </div>
          <div className="host-actions">
            {onlineGame ? (
              <span className="live-sync-label">
                <Wifi size={15} />
                Live on every screen
              </span>
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
      ) : (
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
      )}

      <section className="gallery-section">
        <div className="gallery-heading">
          <div>
            <p className="eyebrow">
              {tvMode ? onlineGame?.title ?? "Season portrait gallery" : "Season portrait gallery"}
            </p>
            <h2>{tvMode ? "Hall of Fame" : "The castle remembers everyone"}</h2>
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
                isHost={isHost}
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
          <Crown size={18} />
        </div>
        <p>The truth always comes out in the end.</p>
        <span>Blackthorne Manor · MMXXVI</span>
      </footer>

      {selected && isHost && (
        <FateModal
          player={selected}
          onClose={() => setSelected(null)}
          onUpdate={(updated) => {
            devLog("Fate updated", {
              playerId: updated.id,
              status: updated.status,
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

function OnlineLobby({
  game,
  playerCount,
}: {
  game: CloudGame & { joinUrl: string };
  playerCount: number;
}) {
  const [copied, setCopied] = useState(false);
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
        <p className="eyebrow">Scan to enter the game</p>
        <h2>Contestants, claim your portrait</h2>
        <p>
          Open your camera, scan the code, and add your name and photo. New
          portraits appear on this screen automatically.
        </p>
        <div className="game-code-display">
          <span>Game code</span>
          <strong>{displayGameCode(game.code)}</strong>
          <button onClick={copyLink}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </div>
      <div className="lobby-status">
        <div>
          <UsersRound size={18} />
          <strong>{playerCount}</strong>
          <span>{playerCount === 1 ? "portrait" : "portraits"}</span>
        </div>
        <div>
          <Clock3 size={18} />
          <strong>{hoursRemaining}</strong>
          <span>hours left</span>
        </div>
        <small>
          <span className="host-live-dot" />
          Live
        </small>
      </div>
    </section>
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
              <small>Portrait awaiting</small>
            </div>
          )}
          <div className="portrait-vignette" />

          {isFallen && (
            <div className={`fate-mark fate-${player.status}`}>
              <span className="cross cross-one" />
              <span className="cross cross-two" />
              <div className="fate-ribbon">
                <strong>{statusLabels[player.status]}</strong>
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
  onClose,
  onUpdate,
  onPhoto,
}: {
  player: Player;
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
        <p className="eyebrow">Host decision</p>
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
