# TinyTracker — Multi-child support + second-user auth fix

## Context

Two problems, one shipped app (Vercel + Supabase `qfprmjbhjpjkhpepynll`, local-first Dexie + outbox → Postgres sync).

1. **A second parent cannot get in.** Symptom (confirmed by user): sign-in itself errors at the email/verify step ("already registered" / "token expired"). Live probes today show sign-ups are **enabled**, both RPCs exist and are executable, migration is applied — so the cause is in the email/OTP path plus code that hides real errors. Separately, the family screen has a hard lockout defect: a partner who taps the big "Start a new family" button first can never join the real family (no guard server-side, no "leave" client-side).
2. **Twins.** The schema is already 1-family→N-babies and every write already carries `babyId`; what's missing is a local babies list, a way to *select* the child, per-child reads, and the timer remembering which child it started for.

Constraint that governs everything: the events+outbox transaction, family-scoped pull/realtime cursor, LWW and soft deletes must not change. This plan touches none of them.

Decisions made with the user: header chip switcher (hidden for single-child families); one running timer at a time (tandem later); one family per user in v1.

---

## Phase 0 — Unblock the partner now (no schema change)

### 0.1 Dashboard (Authentication section) — do these first, in order

1. **Email Templates → "Confirm signup"** must contain `{{ .Token }}`. This is the template a **new** user receives from `signInWithOtp` (`shouldCreateUser: true`); existing users get "Magic Link". Fixing only Magic Link (done earlier) leaves every new sign-up with a link and no code. Suggested body for both templates: `Your TinyTracker code is {{ .Token }}` (keep `{{ .ConfirmationURL }}` as a fallback line).
2. **URL Configuration** → Site URL = `https://<app>.vercel.app`, Redirect URLs `https://<app>.vercel.app/**`. Then a tapped link also signs the user in (`detectSessionInUrl: true` in [client.ts](src/lib/supabase/client.ts)) instead of dying on `localhost:3000`.
3. **SMTP** (Project Settings → Auth): built-in SMTP is 2–4 emails/hour project-wide; two parents retrying at 3 AM exceed it → `email rate limit exceeded`. Configure Resend/Brevo.
4. **Logs → Auth** filtered by the partner's email: look for `otp_expired`, `429`, `invalid`.

Diagnostic SQL (SQL Editor) — tells exactly what happened to the partner's account:
```sql
select email, created_at, confirmation_sent_at, email_confirmed_at, last_sign_in_at
from auth.users order by created_at;

-- Who is in which family (detects the "solo family" lockout)
select u.email, f.id as family_id, f.invite_code,
       (select count(*) from public.family_members m where m.family_id = f.id) as members,
       (select count(*) from public.care_events c where c.family_id = f.id)   as events
from auth.users u
left join public.family_members fm on fm.user_id = u.id
left join public.families f on f.id = fm.family_id
order by u.email;

-- Grants actually applied on the live DB (all must be true)
select has_table_privilege('authenticated','public.families','select')       fam_sel,
       has_table_privilege('authenticated','public.family_members','delete') fm_del,
       has_table_privilege('authenticated','public.babies','insert')         babies_ins,
       has_table_privilege('authenticated','public.care_events','insert')    ce_ins,
       has_table_privilege('authenticated','public.care_events','update')    ce_upd;
```
If the partner is sitting alone in a solo family, unblock immediately:
```sql
delete from public.family_members where user_id = '<partner uid>';
delete from public.families f where not exists
  (select 1 from public.family_members m where m.family_id = f.id);  -- cascades
```

### 0.2 Client hardening — [AuthScreen.tsx](src/features/family/AuthScreen.tsx)
- Normalise: `const addr = email.trim().toLowerCase()` for both `signInWithOtp` and `verifyOtp`; input `autoCapitalize="none" autoCorrect="off"`.
- "Use a different email" → also `setCode('')`, `setError(null)`.
- Map `error.code`: `otp_expired` → "That code expired — request a new one."; message containing `rate limit` → "Too many codes sent. Wait an hour, or configure SMTP." Show the raw message underneath in `text-xs`.
- Under the code input: "Got a link instead of a code? Tap it — it signs you in too."
- 60 s resend cooldown on "Email me a code" (Supabase's per-email cooldown otherwise returns a confusing error).

### 0.3 Client: stop masking errors — [FamilyScreen.tsx](src/features/family/FamilyScreen.tsx)
- Mount effect (`:28`): destructure `{ data, error }`; on error show `Could not check your family: ${error.message}` and do **not** render "Start a new family" (a 42501 from missing grants currently looks like "no family" and every tap creates another solo family via the SECURITY DEFINER RPC).
- `join` (`:88`): `error.code === 'P0002'` → "did not match"; anything else → `error.message`.
- `:83` guard → `length !== 8`; input `maxLength={8}`.
- [SettingsScreen.tsx:148](src/features/settings/SettingsScreen.tsx#L148): add `session.user.email` to the status line so two-phone debugging is possible.

**verify:** `pnpm build && pnpm lint`; wrong code shows "did not match", network off shows the fetch error; partner receives a 6-digit code on a fresh email; `auth.users` shows `email_confirmed_at` set after verify.

---

## Phase 1 — Family membership hardening

### 1.1 SQL — new `supabase/migrations/0002_family_membership.sql`
- `create_family`: after the `uid` check, `if exists (select 1 from family_members where user_id = uid) then raise exception 'already in a family' using errcode = 'P0003'`.
- `join_family`: same guard but allow re-joining the **same** family (`and family_id <> fid`).
- New `leave_family() returns boolean` (SECURITY DEFINER, `set search_path = public`): delete caller's `family_members` row; if the family is now empty, delete the family (cascades babies/events, which frees the event ids so `adopt` can re-push them into the real family — re-pushing the same ids into a different family would otherwise be RLS-rejected as an update on the old family's rows). `grant execute on function public.leave_family() to authenticated`.
- Re-apply the `0001` grants block verbatim at the end (idempotent; makes a single run produce a correct live DB).
- RLS unchanged. `active_sessions` untouched (unused by the client).

**verify:** as a member `select create_family()` → `P0003`; `leave_family()` → `true`; `join_family('<code>')` works again; membership query shows 2 members in 1 family.

### 1.2 Client — [FamilyScreen.tsx](src/features/family/FamilyScreen.tsx)
- Flip hierarchy: code input + **Join with code** (`variant="primary"`) first; divider; **Start a new family** (`variant="secondary"`) below with copy "Only one of you should do this."
- Existing view (`:96-108`): select `id, invite_code, babies(id,name,born_at), family_members(count)`; show "N members"; add a two-tap **Leave family** (`variant="danger"`, same confirm pattern as [EditEventSheet.tsx:91-111](src/features/history/EditEventSheet.tsx#L91-L111)). On `leave_family` → `true`: keep local events (the next `adopt` carries them into the real family); `false`: `clearLocalData(); clearSessionIds(); location.href='/'` (the family still has members; its rows stay there). Then `setExisting(null)`.
- Errors: `P0002` → did not match; `P0003` → "This account is already in a family. Leave it first."; else raw message. `:90` → require `row.family_id && row.baby_id`.

### 1.3 Tests
- [rls_test.sql](supabase/rls_test.sql): convert the printed counts into assertions (`do $$ … raise exception … $$`) — `b_sees_events = 1`, stranger sees 0, LWW values, tombstone. Add: B `create_family` → `P0003`; B `leave_family` → false; B rejoin; A leaves last → true, families = 0. Replace the blanket `app_user` grants with `create role authenticated nologin` so the migration's own grants are what the test exercises.

**verify:** `psql -v ON_ERROR_STOP=1 -f 0001_init.sql -f 0002_family_membership.sql -f rls_test.sql` exits 0.

---

## Phase 2 — Multi-child data layer (no sync-engine changes)

### 2.1 Types + Dexie — [types.ts](src/lib/db/types.ts), [db.ts](src/lib/db/db.ts)
```ts
export interface Baby { id: string; familyId: string; name: string; bornAt: string | null }
```
```ts
this.version(2).stores({
  events: '&id, familyId, kind, updatedAt, [familyId+startedAt], [babyId+startedAt]',
  outbox: '++seq, eventId, dead',
  meta:   '&key',
  babies: '&id, familyId',
})
```
`[babyId+startedAt]` (not `[familyId+babyId+…]`): baby ids are UUIDs, so the family prefix adds nothing, and the key shape mirrors the existing `[familyId+startedAt]` `between()` queries. No `.upgrade()` — rows already carry `babyId`. `clearLocalData()` adds `db.babies`.
Risk: an old tab on v1 gets its connection closed on `versionchange`; SW is `registerType: 'prompt'`, so this coincides with the user's own Reload.

### 2.2 Session — [session.ts](src/lib/session.ts)
`babyId` becomes the **selected** baby (same `tt.babyId` key, same bootstrap — pre-sign-in behaviour identical). Add `selectBaby(id)`. No babies array in zustand; the Dexie table is the single source:

New `src/lib/db/babies.ts`:
- `useBabies(familyId)` — `useLiveQuery(() => db.babies.where('familyId').equals(familyId).toArray())`.
- `mirrorBabies(familyId, rows)` — rw tx: delete family's rows, `bulkPut`; if the selected id is no longer present, `selectBaby(rows[0].id)`.

### 2.3 Babies fetch — new `src/lib/sync/babies.ts`
- `pullBabies(familyId)`: `from('babies').select('id, family_id, name, born_at').eq('family_id', …)` → camel-case inline → `mirrorBabies`. Called from [SyncProvider.tsx:36-39](src/lib/sync/SyncProvider.tsx#L36-L39) `sync()` next to `pullSince` (boot / online / visible). Not cursor-driven; no realtime — a partner's rename shows on next foreground.
- `addBaby(familyId, name, bornAt)` / `renameBaby(id, patch)`: direct `supabase.from('babies')` insert/update then local put/update. RLS `babies_all_member` + existing grants already permit this — **no new SQL**. Online-only by design (adding the second twin needs one moment of connectivity; all logging stays fully offline).

### 2.4 Adoption moves into the repo — [repo.ts](src/lib/db/repo.ts)
`adoptOrphans(localFamilyId, familyId, babyId)` = body of `FamilyScreen.adopt` (`:48-63`) + `notify()`. Testable with fake-indexeddb, and honours "repo is the only module that writes events". `FamilyScreen.adopt(familyId, babies)` → `adoptOrphans(local, familyId, babies[0].id); mirrorBabies(...); setFamily(familyId, babies[0].id)`. After `join_family`, call `pullBabies(family_id)` rather than changing the RPC's return shape.

### 2.5 Timer captures the child — [timerMachine.ts](src/features/nursing/timerMachine.ts), [timerStore.ts](src/features/nursing/timerStore.ts), [TimerOverlay.tsx](src/features/nursing/TimerOverlay.tsx)
- `TimerState.babyId: string | null`; `START` gains `babyId`; reducer copies it (other transitions spread state).
- `timerStore.start(side)` passes `useSession.getState().babyId` (session.ts does not import the timer store → no cycle). `hydrate()`: `babyId: saved.babyId ?? null` for a `tt.timer` written by the old build.
- `TimerOverlay` save (`:43`): `babyId: state.babyId ?? babyId`.

**verify:** `pnpm test`; DevTools shows `babies` store + new index; start feed → switch child is disabled → save → row's `babyId` is the child selected at START.

---

## Phase 3 — Multi-child UI

### 3.1 Promote `Segmented` + new `BabyChip`
- Move `Segmented` from [SettingsScreen.tsx:26-53](src/features/settings/SettingsScreen.tsx#L26-L53) to `src/components/ui/Segmented.tsx` unchanged; Settings imports it (Bottle's inline copy at [BottleScreen.tsx:65-70](src/features/bottle/BottleScreen.tsx#L65-L70) may adopt it in the same commit).
- `src/features/status/BabyChip.tsx`: `useBabies(familyId)`; `if (babies.length < 2) return null` → single-child header identical to today. Pill: `h-12 rounded-full border border-border px-4 text-sm font-semibold text-text active:opacity-70 disabled:opacity-40` (48 px = header buttons; pill = Toast precedent; text is the signal — no new hue, night-safe). Two children: tap → `tap()`, `selectBaby(other)`, toast "Now logging for Noa". 3+: `Sheet` with one `Button` per child. `disabled` while `timer.status !== 'idle'`. Mounted in [StatusBanner.tsx:57-61](src/features/status/StatusBanner.tsx#L57-L61) between the text block and the theme toggle.

### 3.2 Per-child status + nudge
[useLastFeed.ts](src/features/status/useLastFeed.ts) → `useLastFeed(babyId)` on `[babyId+startedAt]`; callers in `StatusBanner.tsx:20` and `HomeScreen.tsx:16` pass `useSession(s => s.babyId)`. The "suggested" side becomes per child for free. `?start=left|right` shortcuts need no change — `start()` captures the selected child.

### 3.3 Timer overlay
[TimerOverlay.tsx:75-83](src/features/nursing/TimerOverlay.tsx#L75-L83): one `text-sm text-text-muted` line with the child's name (from `state.babyId`), only when `babies.length > 1`.

### 3.4 History — [HistoryScreen.tsx](src/features/history/HistoryScreen.tsx)
- `filter: 'all' | babyId`; `Segmented` (All + one per child) above the list only when `babies.length > 1`. `'all'` → existing `[familyId+startedAt]`; else `[babyId+startedAt]`.
- In "All" with >1 children, prefix titles: `Maya · Nursing · Left`.
- [EditEventSheet.tsx](src/features/history/EditEventSheet.tsx): "Child" `Segmented` → `updateEvent(id, { babyId })` (patch type already allows it; LWW + outbox unchanged). Fixes the most common twin mistake: logged on the wrong child.

### 3.5 Settings "Children" — [SettingsScreen.tsx](src/features/settings/SettingsScreen.tsx)
`<Row label="Children">` when `session && babies.length > 0`: per child a name input (save on blur → `renameBaby`) and `type="date"` born-at (same input classes as `EditEventSheet.tsx:68-73`). **Add a child** (`variant="secondary" h-12 w-full`) → `addBaby(familyId, 'Baby 2', null)`; if `!navigator.onLine` → toast "Connect to add a child." No delete in v1 (would orphan events).

**verify:** create family → no chip → Settings → Add a child → chip appears; tap cycles with toast; log a diaper for each → History "All" shows both names, per-child filter splits them; StatusBanner "last fed" follows the chip; partner sees both children after foregrounding; e2e suite unchanged and green.

---

## Phase 4 — Tests + end-to-end verification

- [timerMachine.test.ts](src/features/nursing/timerMachine.test.ts): START stores `babyId`; second START while live keeps the first; DISCARD/SAVED reset to null; legacy `tt.timer` without `babyId` hydrates to null.
- New `src/lib/db/babies.test.ts` (fake-indexeddb, same setup as [sync.test.ts](src/lib/sync/sync.test.ts)): `mirrorBabies` replaces rows and re-selects when the selected id vanished; `[babyId+startedAt]` returns only that child's rows; `adoptOrphans` re-points only local-family rows and queues one outbox entry each.
- [app.spec.ts](tests/e2e/app.spec.ts): "twins: chip switches the child that receives a log" — seed two `babies` rows via `page.evaluate`, reload, expect chip, tap, log diaper, assert `events[0].babyId`; assert chip `disabled` while a feed runs. No Supabase needed.
- `rls_test.sql` as in 1.3.
- Manual two-phone checklist: (1) fresh installs, one feed each before sign-in; (2) A signs in, creates family, adds child 2; (3) B signs in with a **new** email — receives a 6-digit code — joins; B's pre-join feed appears on A under child 1; (4) on a third account: create solo family → Leave → Join; (5) A renames child 2 → B sees it after foregrounding; (6) B airplane mode: switch child, nurse, save, bottle → reconnect → A sees all with correct children; (7) A edits an event's child → B sees it move.

---

## Invariants preserved (explicit)
- events+outbox single transaction — unchanged (`writeAndQueue`, `adoptOrphans`). Babies are mirrored, never queued.
- Cursor `cursor:<familyId>`, `pullSince`, `applyRemote` LWW, `onConflict: 'id'`, soft deletes — unchanged.
- Realtime `family_id=eq.` channel — unchanged; both twins ride the same channel.
- RLS policies — unchanged; only two guards and one RPC added, all SECURITY DEFINER like the existing ones.

## Decisions the user can flip later (and the cost)
1. **Offline "add a child"** — `OutboxItem.table` discriminator + babies branch in `push.ts` + mapper; ~60 lines + tests. Everything else stands.
2. **Tandem feeding** — `TimerState` keyed per `babyId`, overlay shows two clocks; Phase 2.5's `babyId` on state is the prerequisite either way.
3. **Keep empty families on leave** — then `adoptOrphans` must mint new event ids before re-push.

## Housekeeping on execution
- First step of execution: copy this file into the repo as `plan.md` (user requested it live there) and ship phases as separate commits: `0`, `1`, `2`, `3+4`.
- `.env` contains a stray `db_pass=` and an unused `VITE_SUPABASE_PUBLISHABLE_KEY`; not bundled (no `VITE_` prefix on the password, file gitignored) but worth removing.
