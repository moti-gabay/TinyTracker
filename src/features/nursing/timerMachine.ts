import type { Side } from '@/lib/db/types'

/**
 * Nursing timer state machine.
 *
 * Pure and total: every transition is a function of (state, action, now).
 * No timers, no clock reads, no side effects -- so it is trivially testable
 * and can be rehydrated from localStorage after the tab is killed mid-feed.
 *
 * CRITICAL: elapsed time is always DERIVED from stored timestamps, never
 * accumulated by an interval. Background tabs throttle intervals to >=1min,
 * and phones sleep. Timestamps are immune to both.
 */

export type TimerStatus = 'idle' | 'active' | 'paused' | 'stopping' | 'saving'

/** A contiguous stretch on one side. Open while `endedAt` is null. */
export interface Segment {
  side: Side
  startedAt: number
  endedAt: number | null
}

export interface TimerState {
  status: TimerStatus
  sessionId: string | null
  /**
   * The child this feed was started for, captured at START.
   *
   * Read at save time instead of the live selection so that switching the
   * header chip mid-feed -- or a partner's phone changing it -- can never
   * attribute a feed to the wrong twin.
   */
  babyId: string | null
  startedAt: number | null
  currentSide: Side | null
  segments: Segment[]
  /** Non-null exactly while status === 'paused'. */
  pausedAt: number | null
  /** Paused time from all COMPLETED pauses. The open pause is added live. */
  totalPausedMs: number
  /** Where CANCEL returns to from the 'stopping' confirmation. */
  resumeTo: 'active' | 'paused' | null
}

export type TimerAction =
  | { type: 'START'; side: Side; id: string; babyId: string; now: number }
  | { type: 'PAUSE'; now: number }
  | { type: 'RESUME'; now: number }
  | { type: 'SWITCH'; side: Side; now: number }
  | { type: 'STOP'; now: number }
  | { type: 'CANCEL'; now: number }
  | { type: 'DISCARD' }
  | { type: 'CONFIRM' }
  | { type: 'SAVED' }
  | { type: 'FAILED' }

export const idleState: TimerState = {
  status: 'idle',
  sessionId: null,
  babyId: null,
  startedAt: null,
  currentSide: null,
  segments: [],
  pausedAt: null,
  totalPausedMs: 0,
  resumeTo: null,
}

/** Closes the open segment, if any, at `now`. */
function closeOpenSegment(segments: Segment[], now: number): Segment[] {
  return segments.map((s, i) =>
    i === segments.length - 1 && s.endedAt === null ? { ...s, endedAt: now } : s,
  )
}

export function timerReducer(state: TimerState, action: TimerAction): TimerState {
  switch (action.type) {
    case 'START':
      // Ignore a second start while a session is live; the running feed wins.
      if (state.status !== 'idle') return state
      return {
        status: 'active',
        sessionId: action.id,
        babyId: action.babyId,
        startedAt: action.now,
        currentSide: action.side,
        segments: [{ side: action.side, startedAt: action.now, endedAt: null }],
        pausedAt: null,
        totalPausedMs: 0,
        resumeTo: null,
      }

    case 'PAUSE':
      if (state.status !== 'active') return state
      return { ...state, status: 'paused', pausedAt: action.now }

    case 'RESUME': {
      if (state.status !== 'paused' || state.pausedAt === null) return state
      return {
        ...state,
        status: 'active',
        pausedAt: null,
        totalPausedMs: state.totalPausedMs + (action.now - state.pausedAt),
      }
    }

    case 'SWITCH': {
      // Switching sides while paused implicitly resumes -- the parent has the
      // baby back on the breast, so charging that time is correct.
      if (state.status !== 'active' && state.status !== 'paused') return state
      if (state.currentSide === action.side) return state
      const pausedDelta =
        state.status === 'paused' && state.pausedAt !== null
          ? action.now - state.pausedAt
          : 0
      return {
        ...state,
        status: 'active',
        pausedAt: null,
        totalPausedMs: state.totalPausedMs + pausedDelta,
        currentSide: action.side,
        segments: [
          ...closeOpenSegment(state.segments, action.now),
          { side: action.side, startedAt: action.now, endedAt: null },
        ],
      }
    }

    case 'STOP': {
      if (state.status !== 'active' && state.status !== 'paused') return state
      // Freeze the session by closing the segment and settling any open pause,
      // so the confirmation sheet cannot keep accruing time behind the parent.
      const pausedDelta =
        state.status === 'paused' && state.pausedAt !== null
          ? action.now - state.pausedAt
          : 0
      return {
        ...state,
        status: 'stopping',
        resumeTo: state.status,
        pausedAt: null,
        totalPausedMs: state.totalPausedMs + pausedDelta,
        segments: closeOpenSegment(state.segments, action.now),
      }
    }

    case 'CANCEL': {
      if (state.status !== 'stopping') return state
      // Reopen the last segment so the feed continues seamlessly.
      const segments = [...state.segments]
      const last = segments[segments.length - 1]
      if (last) segments[segments.length - 1] = { ...last, endedAt: null }
      const back = state.resumeTo ?? 'active'
      return {
        ...state,
        status: back,
        pausedAt: back === 'paused' ? action.now : null,
        resumeTo: null,
        segments,
      }
    }

    case 'DISCARD':
      if (state.status !== 'stopping') return state
      return idleState

    case 'CONFIRM':
      if (state.status !== 'stopping') return state
      return { ...state, status: 'saving', resumeTo: null }

    case 'SAVED':
      if (state.status !== 'saving') return state
      return idleState

    case 'FAILED':
      // The write is local-first, so a failure here means the local write
      // itself failed. Return to the confirmation so the parent can retry
      // rather than silently dropping a feed.
      if (state.status !== 'saving') return state
      return { ...state, status: 'stopping', resumeTo: 'active' }

    default:
      return state
  }
}

// -- Derived values ---------------------------------------------------------

/** Wall-clock time the feed has been running, excluding paused stretches. */
export function elapsedMs(state: TimerState, now: number): number {
  if (state.startedAt === null) return 0
  const openPause = state.pausedAt !== null ? now - state.pausedAt : 0
  const end = lastBoundary(state, now)
  return Math.max(0, end - state.startedAt - state.totalPausedMs - openPause)
}

/** In 'stopping'/'saving' the clock is frozen at the close of the last segment. */
function lastBoundary(state: TimerState, now: number): number {
  if (state.status === 'stopping' || state.status === 'saving') {
    const last = state.segments[state.segments.length - 1]
    if (last?.endedAt != null) return last.endedAt
  }
  return now
}

/** Per-side totals in seconds. Pauses are attributed to the side they fall in. */
export function sideSeconds(
  state: TimerState,
  now: number,
): { left: number; right: number } {
  const end = lastBoundary(state, now)
  const totals = { left: 0, right: 0 }
  for (const seg of state.segments) {
    const segEnd = seg.endedAt ?? end
    totals[seg.side] += Math.max(0, segEnd - seg.startedAt)
  }
  // Remove paused time from the side that was open when the pause happened.
  // Approximated by scaling: pauses are short relative to feeds and always
  // occur on the current side, so charge them all there.
  const openPause = state.pausedAt !== null ? end - state.pausedAt : 0
  const pausedTotal = state.totalPausedMs + openPause
  const side = state.currentSide
  if (side) totals[side] = Math.max(0, totals[side] - pausedTotal)

  return {
    left: Math.round(totals.left / 1000),
    right: Math.round(totals.right / 1000),
  }
}

export function isRunning(status: TimerStatus): boolean {
  return status === 'active' || status === 'paused'
}
