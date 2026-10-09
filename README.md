# Traitors Hall of Fame

An interactive, real-time portrait hall for a social-deduction game. A host
starts a 48-hour game and displays a join QR code. Contestants scan it, add
their name and photo, and appear on the host screen automatically.

## Run locally

```bash
npm install
npm run dev
```

Open the local address printed in the terminal.

Without Supabase environment variables, the app shows a setup screen and still
offers the original same-browser demo. The demo host key is `2026`.

## How the live game works

- The host selects **Start as host**. That browser becomes the host controller.
- The projected hall shows one public QR code and a human-readable game code.
- Scanning the QR both joins the game and creates an anonymous device identity.
- Players add a compressed photo and name. No email or password is requested.
- The player identity and host identity persist in their browsers.
- The game expires 48 hours after it is created.
- Supabase Realtime updates the projected hall as players join or change photos.
- The host can enable TV mode to hide setup panels and fit the full cast into
  an adaptive fullscreen grid.

A second public authentication QR is intentionally not used. If host controls
are later needed on another device, the safer design is a private, single-use
host-pairing QR that expires quickly.

## Free shared database setup

1. Create a Supabase project.
2. Open its SQL editor and run [`supabase/schema.sql`](supabase/schema.sql).
3. In Supabase Authentication settings, enable anonymous sign-ins.
4. Copy `.env.example` to `.env.local` and fill in the project URL and
   publishable anonymous key.
5. Restart `npm run dev`.

The SQL creates short-lived games, membership-based Row Level Security, and
restricted database functions. Players may update only their own portraits;
only the game creator may change contestant outcomes.

## Publish with GitHub Pages

The included GitHub Actions workflow builds and publishes the site whenever
changes are pushed to the `main` branch. For the `Traitors` repository, the
published address will be:

`https://roshkhatri.github.io/Traitors/`

Before deploying, add these GitHub repository variables under
**Settings → Secrets and variables → Actions → Variables**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

These values are designed to be public in a browser app. Access is protected by
the database policies in `supabase/schema.sql`, not by hiding the publishable
key.
