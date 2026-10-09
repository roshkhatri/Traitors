# Traitors Hall of Fame

An interactive, real-time portrait hall for a social-deduction game. A host
opens a 72-hour invitation window and shares a join QR code. Contestants scan
it, add their name and photo, and appear on the host screen automatically.
When the host starts the game, a new 48-hour deletion window begins.

## Run locally

```bash
npm install
npm run dev
```

Open the local address printed in the terminal.

Without Supabase environment variables, the app shows a setup screen and still
offers the original same-browser demo. The demo host key is `2026`.

## How the live game works

- The host enters the event, who it is for, their own name, the guest list,
  and the number of elimination rounds. That phone becomes the private host
  controller.
- The host receives a separate private host QR, link, and manual code. Opening
  it on another device grants that device host controls for the same game.
- The host uses **Pair a TV display** to open a private, read-only hall on the
  television. The pairing key is removed from the TV address after connecting.
- The host controller shows one separate public QR code and human-readable game
  code for contestants.
- Scanning the QR both joins the game and creates an anonymous device identity.
- Invited names appear immediately with initial placeholders. Players scan the
  QR, choose an unclaimed name, and add a compressed photo. No email or
  password is requested.
- The player identity and host identity persist in their browsers, so reopening
  the site on the same device reconnects to the active game automatically.
- Before the game starts, invitations and photos remain available for up to
  72 hours.
- Pressing **Start game** begins the live phase and resets the deletion
  deadline to 48 hours from that moment.
- The host can choose **End game** at any time. After an irreversible
  confirmation, the game, portraits, memberships, and device access are
  deleted immediately.
- An hourly database cleanup removes the expired game, portraits, memberships,
  and associated anonymous identities.
- Supabase Realtime updates the projected hall as players join or change photos.
- The host selects the active elimination round from the phone. The TV displays
  “Round X of Y,” and each crossed portrait records the round it happened.
- The host can enable TV mode to hide setup panels and fit the full cast into
  an adaptive fullscreen grid.

The three access links have deliberately different permissions:

- **Player QR:** public; allows joining and editing only that player’s photo.
- **Host link/code:** private; grants full host controls on another device.
- **TV pairing link/key:** private; allows viewing the live hall but cannot
  change a portrait or contestant fate.

Host permissions are granted only to the creator and devices that authenticate
with the private host code.

## Free shared database setup

1. Create a Supabase project.
2. Open its SQL editor and run [`supabase/schema.sql`](supabase/schema.sql).
3. In Supabase Authentication settings, enable anonymous sign-ins.
4. Copy `.env.example` to `.env.local` and fill in the project URL and
   publishable anonymous key.
5. Restart `npm run dev`.

The SQL creates short-lived games, membership-based Row Level Security, and
restricted database functions. Players may update only their own portraits;
only authenticated host devices may start, end, or change outcomes in the
game.

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
