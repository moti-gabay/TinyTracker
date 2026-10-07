# TinyTracker — Hebrew/RTL + categorized History

## Context

Two requests from the primary user of the app:

1. **Hebrew UI with RTL.** Every user-facing string is a hard-coded English literal spread over 19 files (~180 strings). There is no i18n layer, no `lang`/`dir` handling, and `index.html` pins `lang="en"`. The settings pattern to copy already exists: `useTheme.ts` (module listeners + `useSyncExternalStore` + pre-paint bootstrap in `index.html`).
2. **History is one undifferentiated list.** `HistoryScreen.tsx` shows every kind interleaved; pumping sessions bury feeds. Kind is only ever filtered in memory (`useLastFeed.ts:21`), and the screen's comment explicitly values covering indexes ("neither filters in memory").

Constraints that hold: no sync-engine changes (events+outbox transaction, cursor, LWW, realtime untouched); the existing twins child filter in History stays and composes with the new category tabs; offline-first (Dexie is the only read path).

Findings that shape the plan:
- The only physical-direction utility in the codebase is `text-left` at `HistoryScreen.tsx:136`. `text-left`/`text-right` in `TimerOverlay.tsx:83` and `SideButton.tsx` are **colour tokens** (`--color-left`), not alignment — do not touch.
- Under `dir="rtl"` the LEFT/RIGHT breast buttons (`HomeScreen.tsx:45`) and the `−/+` stepper rows would mirror. Breast side is physical, so those rows must be pinned LTR.
- `date-fns` is a dependency but never imported; no `Intl` usage. Only two locale-sensitive calls: `HistoryScreen.tsx:48` (`toLocaleDateString(undefined…)`) and `format.ts:39` (`toLocaleTimeString`).
- e2e (`tests/e2e/app.spec.ts`) selects by English text; two selectors (`/Diaper/`, `/Bottle/` with `.first()` at L155/L194) will match the new tab buttons and must be scoped to `li`.

---

## Part A — Categorized History (ship first; independent of i18n)

### A.1 Dexie v3 — `src/lib/db/db.ts`
```ts
this.version(3).stores({
  events: '&id, familyId, kind, updatedAt, [familyId+startedAt], [babyId+startedAt], [familyId+kind+startedAt], [babyId+kind+startedAt]',
  outbox: '++seq, eventId, dead',
  meta: '&key',
  babies: '&id, familyId',
})
```
No `.upgrade()` — rows already carry `kind`. Keeps every tab a covering range scan (a "Pumping" tab in a 3k-row family otherwise cursors through ~90% non-matches to fill 200). Same version-bump caveat as v2 (old tab closes on `versionchange`; coincides with the SW "Reload" prompt).

### A.2 Query helper — new `src/features/history/historyQuery.ts` (+ test)
```ts
export type HistoryCategory = 'all' | 'feeding' | 'pump' | 'diaper'
export const CATEGORY_KINDS: Record<Exclude<HistoryCategory,'all'>, EventKind[]> =
  { feeding: ['nursing', 'bottle'], pump: ['pump'], diaper: ['diaper'] }

export async function recentEvents(
  scope: { familyId: string } | { babyId: string },
  category: HistoryCategory,
  limit = 200,
): Promise<CareEvent[]>
```
- `'all'` → the two existing `[familyId+startedAt]` / `[babyId+startedAt]` branches, moved here verbatim.
- One kind → `[scope+kind+startedAt]` `.between([id, kind, minKey], [id, kind, maxKey]).reverse().filter(deletedAt === null).limit(limit)`.
- `'feeding'` → the one-kind query **sequentially** for `nursing` then `bottle` (sequential `await` is the pattern `useLastFeed` already proves works inside `useLiveQuery`), concat, sort `startedAt` desc, `slice(0, limit)`. ≤400 rows in memory, bounded.

Colocated like `nursing/timerMachine.ts`; `historyQuery.test.ts` uses fake-indexeddb exactly as `src/lib/db/babies.test.ts` does.

### A.3 Screen — `src/features/history/HistoryScreen.tsx`
- Second state `const [category, setCategory] = useState<HistoryCategory>('all')`, independent of the existing child `filter`. Resets to All on each visit (no persistence; cheapest and least surprising).
- `useLiveQuery(() => recentEvents(filter === 'all' ? { familyId } : { babyId: filter }, category), [familyId, filter, category])`.
- Picker container becomes `flex flex-col gap-2 border-b border-border p-3` holding: category `Segmented` (always rendered: All · Feeding · Pumping · Diapers) and, when `twins`, the existing child `Segmented` below it. Reuses `components/ui/Segmented.tsx` unchanged.
- Empty state is per category (No logs yet. / No feedings yet. / No pumping sessions yet. / No diapers yet.).
- `text-left` on the row button → `text-start` (the one RTL fix in this file).

### A.4 Tests
- `historyQuery.test.ts`: feeding merges nursing+bottle newest-first and respects `limit` across the merge; pump/diaper exclude other kinds; tombstones excluded; `{ babyId }` scope + category returns only that child.
- `app.spec.ts`: scope the two row-click selectors to `page.locator('li').getByRole('button', …)`; add "history tabs split kinds": log a diaper and a bottle → History → Feeding shows one Bottle row and no Diaper → Diapers shows the inverse → Pumping shows the empty state.

**verify:** `pnpm test`; DevTools → IndexedDB shows v3 with both new indexes; `pnpm test:e2e` green.

---

## Part B — Language (English / Hebrew) + RTL

### B.1 Infrastructure — new `src/lib/i18n/`
- `en.ts`: `export const en = { 'tabs.nurse': 'Nurse', 'sync.waiting': '{n} waiting to sync', … }` (flat, screen-prefixed keys). `export type Key = keyof typeof en`.
- `he.ts`: `export const he: Record<Key, string>` — a missing key is a **type error**, so `pnpm build` is the completeness check.
- `index.ts`, modelled line-for-line on `src/lib/theme/useTheme.ts`:
  ```ts
  export type Lang = 'en' | 'he'
  export function getLang(): Lang            // module cache, seeded from StorageKeys.lang
  export function setLang(l: Lang): void     // writeLocal → apply() → emit()
  export function t(key: Key, vars?: Record<string, string | number>): string  // '{n}' replace
  export function useT(): typeof t           // useSyncExternalStore(subscribe, getLang) then returns t
  export function localeOf(l = getLang()): string | undefined  // en → undefined (today's behaviour), he → 'he-IL'
  ```
  `apply()` sets `document.documentElement.lang` and `dir` (`he` → `rtl`). `subscribe` also listens to the cross-tab `storage` event like the theme does. Default `'en'`; no OS auto-detect.
- `storage.ts`: add `lang: 'tt.lang'` to `StorageKeys`.
- `index.html`: extend the existing pre-paint script to read `tt.lang` and set `lang`/`dir` on `<html>` before first paint (prevents an LTR→RTL layout jump on launch, same reasoning as the theme flash).
- Plurals/interpolation stay primitive on purpose: `{n}` substitution only. English "log(s)" forms stay as they are; Hebrew uses forms that read correctly for any n.

### B.2 Non-component formatters (read `getLang()`/`t()` directly, mirroring how `formatVolume` reads `getUnit()`)
- `src/lib/time/format.ts`: `formatDuration` → keys `time.s / time.m / time.h / time.hm` (`'{n}m'` vs `'{n} דק׳'`); `formatAgo` → `time.justNow`, `time.ago` (`'{d} ago'` vs `'לפני {d}'` — word order flips, which is why it is a template, not a suffix). `formatClock` passes `localeOf()`. `formatTimer` is numeric, untouched.
- `src/lib/units/volume.ts`: `formatVolume` → `unit.ml` / `unit.oz` templates (`'{n} ml'` vs `'{n} מ״ל'`).
- `HistoryScreen.dayLabel`: `Today`/`Yesterday` via `t`, `toLocaleDateString(localeOf(), …)`.

### B.3 Components — mechanical replacement, one `const t = useT()` per component
Files (from the inventory): `app/TabBar.tsx`, `components/ui/Sheet.tsx` (Close), `components/ui/NumberStepper.tsx` (`stepper.decrease` = `'Decrease {label}'`), `features/status/StatusBanner.tsx`, `features/status/BabyChip.tsx`, `features/nursing/{HomeScreen,SideButton,TimerOverlay}.tsx`, `features/bottle/BottleScreen.tsx`, `features/pump/PumpScreen.tsx`, `features/diaper/DiaperScreen.tsx`, `features/history/{HistoryScreen,EditEventSheet}.tsx`, `features/family/{AuthScreen,FamilyScreen}.tsx`, `features/settings/SettingsScreen.tsx`.
- `TabBar.TABS` keeps `label` as a `Key` and resolves it in render.
- `SideButton` label `LEFT`/`RIGHT` → `side.left`/`side.right` (`'שמאל'`/`'ימין'`); the `tracking-tight` uppercase styling is harmless on Hebrew.
- `TimerOverlay` L/R line → one template `timer.sides` = `'L {l} · R {r}'` / `'שמאל {l} · ימין {r}'`.
- Default baby names sent to the server (`FamilyScreen` `'Baby'`, `SettingsScreen` `` `Baby ${n}` ``) are translated too (they are user-visible data the parent then renames).
- Out of scope, stated: raw GoTrue/Postgres error passthroughs (`AuthScreen`, `FamilyScreen`) stay as the server sends them; PWA manifest `name`/shortcuts and `<title>` are static build-time strings and stay English.

### B.4 Settings toggle — `src/features/settings/SettingsScreen.tsx`
New first `<Row label={t('settings.language')}>` with `Segmented<Lang>` options `English` / `עברית` (each label in its own language, never translated, so the row is findable from either UI). `onChange={setLang}`. Placed above Theme so a Hebrew speaker finds it while the UI is still English.

### B.5 RTL
- `dir="rtl"` on `<html>` does the layout work; Tailwind v4 flex/grid mirror automatically, and every horizontal utility in the codebase is symmetric (`px-*`, `inset-x-0`, `gap-*`).
- `HistoryScreen.tsx:136` `text-left` → `text-start` (done in Part A).
- Pin physical controls LTR with `dir="ltr"`: the two-button row in `HomeScreen.tsx:45` (left breast stays on the physical left) and the `−/value/+` row inside `NumberStepper`. Everything else (tab bar order, header chip/buttons, sheets) mirrors, which is the native RTL convention.
- Do **not** convert `text-left`/`text-right` in `TimerOverlay.tsx:83` — colour tokens.
- Fonts: the body stack already falls back to system Hebrew faces (`ui-rounded` → SF Hebrew on iOS, Segoe UI/Roboto elsewhere); no CSS change.
- Rule going forward (one comment in `index.css` next to the night variant): logical utilities only (`ps-/pe-/ms-/me-/start-/end-/text-start`).

### B.6 Tests
- `src/lib/i18n/i18n.test.ts`: every `{placeholder}` in an `en` value appears in the `he` value; no empty Hebrew string; `t` interpolates; `setLang('he')` sets `dir="rtl"`/`lang="he"` on `documentElement` (jsdom), `setLang('en')` restores.
- `app.spec.ts`: "switching to Hebrew flips direction and persists": Settings → `עברית` → `expect(page.locator('html')).toHaveAttribute('dir', 'rtl')` → tab bar shows `היסטוריה` → reload → still RTL (`tt.lang` + pre-paint script).
- Existing e2e stays English-default and unchanged except A.4.

**verify:** `pnpm build` (Hebrew completeness via types) · `pnpm lint` · `pnpm test` · `pnpm test:e2e`; manual: switch to Hebrew → no layout flash on reload, LEFT/RIGHT buttons stay on their physical sides, timer "ago" reads "לפני 14 דק׳", History day headers in Hebrew, night mode unaffected.

---

## Part C — Developer credit + feedback form

### C.1 Inputs (provided)
- Business name: **MG Software House** · URL: `https://mg-software-house.vercel.app/` · logo: `public/logo-mark.webp`.
- Supabase route confirmed over Formspree (the migration/grant/RLS pattern already exists, no third-party key in the bundle, and the row lands next to your other data).

### C.2 Supabase — new `supabase/migrations/0003_feedback.sql`
```sql
create table public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users (id) on delete set null,
  email      text check (email is null or length(email) <= 254),
  message    text not null check (length(message) between 1 and 2000),
  lang       text,
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
-- No policies and no table grants on purpose: the API can neither read nor write
-- the table. The only way in is the RPC below; you read it in the dashboard.

create or replace function public.submit_feedback(message text, email text default null, lang text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(trim(message)) = 0 then
    raise exception 'empty message';
  end if;
  insert into public.feedback (user_id, email, message, lang)
  values (auth.uid(), nullif(trim(email), ''), trim(message), lang);
end;
$$;
grant execute on function public.submit_feedback(text, text, text) to anon, authenticated;
```
- Granted to `anon` too: the app works without sign-in, and a feedback form that first demands sign-in gets no feedback. `user_id` is captured when there is one.
- Spam exposure is bounded by the `check` constraints; if it ever matters, a per-`user_id`/hour cap goes inside the RPC without touching the client.
- `rls_test.sql`: assert `anon` can `select submit_feedback('hi')`, cannot `select from feedback`, and that `message` of 2001 chars raises.
- Apply in the SQL editor like the previous migrations; README's "Enabling partner sync" step 2 lists the new file.

### C.3 Credit footer — new `src/features/settings/CreditFooter.tsx`, mounted last in `SettingsScreen`
- Constants at the top of the file: `BUSINESS_NAME`, `BUSINESS_URL`, `LOGO_SRC = '/logo-mark.webp'` (brand name is not translated).
- Markup: `<footer className="flex flex-col items-center gap-2 px-4 py-6 text-center text-xs text-text-muted">` → `<a href={BUSINESS_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 active:opacity-70">` with `<img src={LOGO_SRC} alt="" className="h-6 w-auto" />` + `t('credit.developedBy', { name })` → then `t('credit.copyright', { name })` = `'© 2026 {name}. All rights reserved.'` / `'© 2026 {name}. כל הזכויות שמורות.'`.
- Night mode: text uses the theme tokens already. The logo is the only risk: a dark-on-transparent logo disappears on true black. Preferred fix is an SVG that uses `currentColor` (inherits `text-text-muted`, works in both themes for free). Fallback if the logo must keep brand colours: two files and the existing `night:` variant (`<img … className="night:hidden" />` + `<img … className="hidden night:block" />`).
- RTL: the row is a flex container, so logo/text mirror with `dir`; `text-center` is direction-neutral. Nothing else needed.

### C.4 Feedback sheet — new `src/features/feedback/FeedbackSheet.tsx`
- Entry point: `<Row label={t('feedback.title')}>` in `SettingsScreen` (after Install, before the footer) holding one `Button variant="secondary" className="h-12 w-full"` → `t('feedback.open')` ("Send feedback / suggestions"). Rendered only when `isSyncConfigured`; without Supabase there is nowhere to send it.
- Sheet (reuses `components/ui/Sheet.tsx`, `title={t('feedback.title')}`): `<textarea>` (`min-h-32 rounded-2xl border border-border bg-surface-2 px-4 py-3 text-base text-text`, `maxLength={2000}`), `<input type="email">` prefilled from `useAuthSession().session?.user.email ?? ''` (same input classes as `EditEventSheet.tsx:78`), **Send** (`variant="primary" h-14`, disabled while `message.trim() === ''` or sending), **Close** (`secondary h-12`).
- Submit: `if (!navigator.onLine) return showToast(t('feedback.offline'))` (same guard as `SettingsScreen.Children`); `await supabase.rpc('submit_feedback', { message, email: email || null, lang: getLang() })`; on `error` → `showToast(error.message)`, keep the sheet open with the text intact; on success → `showToast(t('feedback.thanks'))` ("Thank you for your feedback!"), reset fields, close. No offline queue: feedback is not a care log and does not belong in the outbox.
- All strings go through the Part B dictionary (`feedback.*`, `credit.*`), so this part lands after B.

### C.5 Tests
- `rls_test.sql` assertions from C.2.
- `app.spec.ts`: "feedback button opens the sheet and Send stays disabled on empty text" (no Supabase in e2e; `isSyncConfigured` is false under `pnpm preview` unless `.env` is present, so the test asserts the footer link has `target="_blank"` and `rel` and skips the sheet when the button is absent).

**verify:** apply `0003` → `select submit_feedback('test')` as the app's anon key via the dashboard API tab → row visible in Table Editor with `user_id` null; signed-in submit → `user_id` set and email prefilled; airplane mode → offline toast, text preserved; footer link opens in a new tab; night mode shows the logo.

---

## Decisions I made (flip any before I start)
1. **Dexie v3 compound `[…+kind+startedAt]` indexes** rather than an in-memory `.filter(kind)` on the existing index. Cost: one schema bump, no data migration. Benefit: every tab stays a bounded range scan, matching the screen's existing stance.
2. **Breast LEFT/RIGHT and `−/+` steppers stay physical** under RTL; the rest of the UI mirrors.
3. **Default language English, no OS auto-detect**; one-liner to add later (`navigator.language.startsWith('he')` on first run).
4. **History tab resets to All** on each visit.
5. **Hebrew copy is written by me** in `he.ts`; a native read-through of that one file is the last checklist item before merging.
6. **Feedback goes through a SECURITY DEFINER RPC granted to `anon`**, with no table policies, rather than a direct insert policy or Formspree. Anyone with the app can send feedback; nobody can read it through the API.
7. **Feedback is online-only**, with the text preserved on failure; it never enters the outbox.

## Commits
1. `feat(history): category tabs on compound kind indexes` (A.1–A.4)
2. `feat(i18n): English/Hebrew dictionary, language setting, RTL` (B.1–B.6)
3. `feat(settings): developer credit footer and feedback form` (C.2–C.5, after you provide the C.1 inputs; placeholders if not)

## Housekeeping on execution
First step: replace the repo's `plan.md` (the already-shipped twins plan) with this file, as was done last time.
