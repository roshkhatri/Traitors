# Traitors Hall of Fame

An interactive portrait hall for a social-deduction game. Contestants can sign
in and upload their own photo; the host can add contestants and mark portraits
as banished, murdered, or departed.

## Run locally

```bash
npm install
npm run dev
```

Open the local address printed in the terminal. The demo host key is `2026`.

## Publish with GitHub Pages

The included GitHub Actions workflow builds and publishes the site whenever
changes are pushed to the `main` branch. For the `Traitors` repository, the
published address will be:

`https://roshkhatri.github.io/Traitors/`

## Demo behavior

- Cast, outcomes, and uploaded portraits are stored in the browser.
- The contestant login is intentionally passwordless for easy party use.
- The host can add contestants, change photos, record outcomes, undo outcomes,
  filter the gallery, or reset the original demo cast.

This is a polished local prototype. For public internet use, connect it to a
real authentication and database service such as Supabase or Firebase so that
accounts and photos are secure and shared between devices.
