/** Duration helpers. All inputs are milliseconds unless the name says seconds. */

const SEC = 1000
const MIN = 60 * SEC
const HOUR = 60 * MIN

/** `7:04` under an hour, `1:07:04` over. For the running timer display. */
export function formatTimer(ms: number): string {
  const total = Math.max(0, Math.floor(ms / SEC))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return h > 0
    ? `${h}:${mm}:${String(s).padStart(2, '0')}`
    : `${mm}:${String(s).padStart(2, '0')}`
}

/** `14m`, `1h 42m`, `just now`. For the status banner and history rows. */
export function formatDuration(ms: number): string {
  if (ms < MIN) return `${Math.max(0, Math.round(ms / SEC))}s`
  const h = Math.floor(ms / HOUR)
  const m = Math.round((ms % HOUR) / MIN)
  if (h === 0) return `${m}m`
  // 59.6m rounds to 60 -- roll it into the hour rather than printing "1h 60m".
  if (m === 60) return `${h + 1}h`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** `1h 42m ago`. */
export function formatAgo(sinceMs: number, now = Date.now()): string {
  const delta = now - sinceMs
  if (delta < 45 * SEC) return 'just now'
  return `${formatDuration(delta)} ago`
}

/** `02:14` local wall-clock, 24h. Night feeds are easier to scan in 24h. */
export function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
