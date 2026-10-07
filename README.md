# TinyTracker

A one-tap newborn feeding tracker, built for a tired parent holding a phone in
one hand at 3 AM.

Three constraints drove every decision:

- **One tap to start a feed.** The home screen is two enormous buttons.
- **Never lose a log.** Every write lands in IndexedDB first; the network is optional.
- **Never light up the room.** Night mode is true black with warm, dimmed text.

## Quick start

```bash
pnpm install
pnpm dev            # http://localhost:5173, use --host to open it on your phone
```

Sync is optional. With no Supabase credentials the app is fully functional and
stores everything on the device.

## Commands

```bash
pnpm dev         # dev server
pnpm build       # typecheck + production build (emits the service worker)
pnpm preview     # serve the production build
pnpm test        # unit tests (timer machine, sync, mappers)
pnpm test:e2e    # Playwright, iPhone 13 viewport
pnpm lint
```

## Enabling partner sync

1. Create a Supabase project.
2. Run `supabase/migrations/*.sql` in the SQL editor, in order.
3. Copy `.env.example` to `.env` and fill in the project URL and anon key.
4. In the app, open Settings, sign in by email code, then create a family.
   Your partner enters the resulting 8-character code on their phone.

`supabase/rls_test.sql` exercises the security model against a plain Postgres
container. It verifies that a non-member sees nothing, that the invite code is
the only way in, that a member cannot strand themselves in a second family, and
that a stale write from a device that was offline cannot overwrite a newer one.
Every check raises on failure, so the script's exit code is the result.

```bash
docker run -d --name tt-pg -e POSTGRES_PASSWORD=pw postgres:16
for f in test_setup migrations/0001_init migrations/0002_family_membership migrations/0003_feedback rls_test; do
  docker cp "supabase/$f.sql" tt-pg:/tmp/ &&   docker exec tt-pg psql -U postgres -v ON_ERROR_STOP=1 -f "/tmp/$(basename $f).sql"
done
```

`supabase/test_setup.sql` stands in for the `auth` schema, `auth.uid()` and the
`anon`/`authenticated` roles that Supabase provides.

## How it works

**The local database is the source of truth.** Screens read and write Dexie
(IndexedDB) and never call Supabase directly. A separate sync engine reconciles
the two, so "offline" is not a special mode. It is the normal path with the
sync engine idle.

Every write is a single transaction over `events` and `outbox`, so a log can
never exist locally without a queued push, nor be queued without existing
locally. That invariant is what makes zero data loss true rather than aspirational.

**The timer stores timestamps, not counters.** Elapsed time is always derived
from `startedAt` and accumulated pause spans. Background tabs throttle intervals
to a minute or more and phones sleep; deriving from timestamps makes both
irrelevant, and lets a feed survive the tab being killed mid-session.

**Conflicts resolve by last-writer-wins** on the client's `updated_at`, enforced
identically in a Postgres trigger and in `applyRemote`. Deletes are soft, so a
tombstone replicates to a device that was offline when the delete happened.

Realtime is an optimisation, not a guarantee: every channel subscribe triggers a
catch-up pull, which is what stops rows going missing when a socket drops.

## Layout

```
src/
  app/        shell, router, tab bar
  features/   nursing (timer), bottle, pump, diaper, status, history, family, settings
  lib/
    db/       Dexie schema and the only module that writes events
    sync/     push, pull, realtime, conflict resolution
    theme/    day/night resolution
    wakeLock/ screen wake lock during a feed
supabase/     migration and a security test
tests/e2e/    Playwright
```

## Known gaps

- `active_sessions` exists in the schema so a partner's phone can show "feeding
  now", but no UI reads it yet.
- History shows the most recent 200 entries; there is no pagination beyond that.
- Wake Lock on iOS requires the app to be installed to the home screen.
