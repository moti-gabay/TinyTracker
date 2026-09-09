import { describe, expect, it } from 'vitest'
import {
  elapsedMs,
  idleState,
  sideSeconds,
  timerReducer,
  type TimerAction,
  type TimerState,
} from './timerMachine'

const T0 = 1_700_000_000_000
const s = (n: number) => n * 1000
const m = (n: number) => n * 60_000

function run(actions: TimerAction[], from: TimerState = idleState): TimerState {
  return actions.reduce(timerReducer, from)
}

const start = (
  now = T0,
  side: 'left' | 'right' = 'left',
  babyId = 'baby-1',
): TimerAction => ({
  type: 'START',
  side,
  id: 'sess-1',
  babyId,
  now,
})

describe('timerMachine transitions', () => {
  it('starts a session from idle', () => {
    const st = run([start()])
    expect(st.status).toBe('active')
    expect(st.sessionId).toBe('sess-1')
    expect(st.startedAt).toBe(T0)
    expect(st.currentSide).toBe('left')
    expect(st.segments).toEqual([{ side: 'left', startedAt: T0, endedAt: null }])
  })

  it('ignores START while a session is already running', () => {
    const st = run([
      start(),
      { type: 'START', side: 'right', id: 'sess-2', babyId: 'baby-2', now: T0 + m(1) },
    ])
    expect(st.sessionId).toBe('sess-1')
    expect(st.currentSide).toBe('left')
    // The running feed keeps its child too, or a tandem tap would silently
    // re-attribute a feed already in progress.
    expect(st.babyId).toBe('baby-1')
  })

  it('captures the child at START and clears it when the session ends', () => {
    const st = run([start(T0, 'left', 'baby-2')])
    expect(st.babyId).toBe('baby-2')

    const saved = run(
      [
        { type: 'STOP', now: T0 + m(10) },
        { type: 'CONFIRM' },
        { type: 'SAVED' },
      ],
      st,
    )
    expect(saved).toEqual(idleState)
    expect(saved.babyId).toBeNull()

    const discarded = run(
      [{ type: 'STOP', now: T0 + m(10) }, { type: 'DISCARD' }],
      st,
    )
    expect(discarded.babyId).toBeNull()
  })

  it('pauses and resumes, accumulating paused time', () => {
    const st = run([
      start(),
      { type: 'PAUSE', now: T0 + m(5) },
      { type: 'RESUME', now: T0 + m(7) },
    ])
    expect(st.status).toBe('active')
    expect(st.pausedAt).toBeNull()
    expect(st.totalPausedMs).toBe(m(2))
  })

  it('ignores RESUME when not paused and PAUSE when not active', () => {
    expect(run([start(), { type: 'RESUME', now: T0 + m(1) }]).status).toBe('active')
    expect(run([{ type: 'PAUSE', now: T0 }]).status).toBe('idle')
  })

  it('switches sides, closing the open segment', () => {
    const st = run([start(), { type: 'SWITCH', side: 'right', now: T0 + m(6) }])
    expect(st.currentSide).toBe('right')
    expect(st.segments).toEqual([
      { side: 'left', startedAt: T0, endedAt: T0 + m(6) },
      { side: 'right', startedAt: T0 + m(6), endedAt: null },
    ])
  })

  it('ignores a SWITCH to the side already active', () => {
    const st = run([start(), { type: 'SWITCH', side: 'left', now: T0 + m(6) }])
    expect(st.segments).toHaveLength(1)
  })

  it('switching while paused resumes and settles the open pause', () => {
    const st = run([
      start(),
      { type: 'PAUSE', now: T0 + m(4) },
      { type: 'SWITCH', side: 'right', now: T0 + m(6) },
    ])
    expect(st.status).toBe('active')
    expect(st.pausedAt).toBeNull()
    expect(st.totalPausedMs).toBe(m(2))
  })

  it('STOP freezes the clock and remembers where to return', () => {
    const st = run([start(), { type: 'STOP', now: T0 + m(10) }])
    expect(st.status).toBe('stopping')
    expect(st.resumeTo).toBe('active')
    expect(st.segments[0].endedAt).toBe(T0 + m(10))
    // Clock is frozen: elapsed does not grow while the sheet is open.
    expect(elapsedMs(st, T0 + m(30))).toBe(m(10))
  })

  it('STOP from paused settles the open pause', () => {
    const st = run([
      start(),
      { type: 'PAUSE', now: T0 + m(4) },
      { type: 'STOP', now: T0 + m(9) },
    ])
    expect(st.totalPausedMs).toBe(m(5))
    expect(st.pausedAt).toBeNull()
    expect(elapsedMs(st, T0 + m(60))).toBe(m(4))
  })

  it('CANCEL reopens the segment and returns to the prior status', () => {
    const st = run([
      start(),
      { type: 'STOP', now: T0 + m(10) },
      { type: 'CANCEL', now: T0 + m(11) },
    ])
    expect(st.status).toBe('active')
    expect(st.segments[0].endedAt).toBeNull()
    expect(st.resumeTo).toBeNull()
    expect(elapsedMs(st, T0 + m(12))).toBe(m(12))
  })

  it('CANCEL back into paused re-opens the pause', () => {
    const st = run([
      start(),
      { type: 'PAUSE', now: T0 + m(4) },
      { type: 'STOP', now: T0 + m(6) },
      { type: 'CANCEL', now: T0 + m(7) },
    ])
    expect(st.status).toBe('paused')
    expect(st.pausedAt).toBe(T0 + m(7))
  })

  it('DISCARD returns to idle, CONFIRM goes to saving then idle', () => {
    const stopped = run([start(), { type: 'STOP', now: T0 + m(10) }])
    expect(timerReducer(stopped, { type: 'DISCARD' })).toEqual(idleState)

    const saving = timerReducer(stopped, { type: 'CONFIRM' })
    expect(saving.status).toBe('saving')
    expect(timerReducer(saving, { type: 'SAVED' })).toEqual(idleState)
  })

  it('FAILED returns to the confirmation instead of losing the feed', () => {
    const saving = run([
      start(),
      { type: 'STOP', now: T0 + m(10) },
      { type: 'CONFIRM' },
    ])
    const failed = timerReducer(saving, { type: 'FAILED' })
    expect(failed.status).toBe('stopping')
    expect(failed.sessionId).toBe('sess-1')
    expect(failed.segments[0].endedAt).toBe(T0 + m(10))
  })
})

describe('elapsedMs', () => {
  it('is zero when idle', () => {
    expect(elapsedMs(idleState, T0)).toBe(0)
  })

  it('tracks wall clock while active', () => {
    expect(elapsedMs(run([start()]), T0 + m(3))).toBe(m(3))
  })

  it('freezes while paused and excludes the pause after resuming', () => {
    const paused = run([start(), { type: 'PAUSE', now: T0 + m(5) }])
    expect(elapsedMs(paused, T0 + m(5))).toBe(m(5))
    expect(elapsedMs(paused, T0 + m(20))).toBe(m(5))

    const resumed = timerReducer(paused, { type: 'RESUME', now: T0 + m(20) })
    expect(elapsedMs(resumed, T0 + m(21))).toBe(m(6))
  })

  it('is immune to a throttled clock (derived, not accumulated)', () => {
    // Simulates a backgrounded tab: no ticks for 40 minutes, then one read.
    expect(elapsedMs(run([start()]), T0 + m(40))).toBe(m(40))
  })
})

describe('sideSeconds', () => {
  it('splits time across a side switch', () => {
    const st = run([start(), { type: 'SWITCH', side: 'right', now: T0 + m(6) }])
    expect(sideSeconds(st, T0 + m(10))).toEqual({ left: 360, right: 240 })
  })

  it('charges paused time to the side that was open', () => {
    const st = run([
      start(),
      { type: 'PAUSE', now: T0 + m(5) },
      { type: 'RESUME', now: T0 + m(7) },
      { type: 'STOP', now: T0 + m(10) },
    ])
    // 10 min of wall clock, 2 min paused -> 8 min credited to the left side.
    expect(sideSeconds(st, T0 + m(10))).toEqual({ left: 480, right: 0 })
    expect(elapsedMs(st, T0 + m(10))).toBe(m(8))
  })

  it('never returns a negative total', () => {
    const st = run([
      start(),
      { type: 'PAUSE', now: T0 + s(5) },
      { type: 'RESUME', now: T0 + m(30) },
      { type: 'STOP', now: T0 + m(30) },
    ])
    const totals = sideSeconds(st, T0 + m(30))
    expect(totals.left).toBeGreaterThanOrEqual(0)
    expect(totals.right).toBe(0)
  })
})
