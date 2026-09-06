import { create } from 'zustand'
import { StorageKeys, readJson, removeLocal, writeJson } from '@/lib/storage'
import { newId } from '@/lib/db/repo'
import type { Side } from '@/lib/db/types'
import {
  idleState,
  isRunning,
  timerReducer,
  type TimerAction,
  type TimerState,
} from './timerMachine'

/**
 * The timer store persists to localStorage on EVERY transition.
 *
 * A phone can kill a backgrounded tab at any moment. Because the machine holds
 * only timestamps, rehydrating a two-hour-old 'active' state and reading
 * elapsedMs(now) yields exactly the right number with no recovery logic.
 */

interface TimerStore {
  state: TimerState
  dispatch: (action: TimerAction) => void
  start: (side: Side) => void
  pause: () => void
  resume: () => void
  switchSide: (side: Side) => void
  stop: () => void
  cancel: () => void
  discard: () => void
  confirm: () => void
  saved: () => void
  failed: () => void
}

function hydrate(): TimerState {
  const saved = readJson<TimerState>(StorageKeys.timer)
  if (!saved || typeof saved.status !== 'string') return idleState
  // 'saving' means the tab died mid-write. The local write is transactional,
  // so drop back to the confirmation and let the parent re-confirm.
  if (saved.status === 'saving') return { ...saved, status: 'stopping' }
  return saved
}

function persist(state: TimerState) {
  if (state.status === 'idle') removeLocal(StorageKeys.timer)
  else writeJson(StorageKeys.timer, state)
}

export const useTimerStore = create<TimerStore>((set, get) => ({
  state: hydrate(),

  dispatch: (action) => {
    const next = timerReducer(get().state, action)
    if (next === get().state) return
    persist(next)
    set({ state: next })
  },

  start: (side) =>
    get().dispatch({ type: 'START', side, id: newId(), now: Date.now() }),
  pause: () => get().dispatch({ type: 'PAUSE', now: Date.now() }),
  resume: () => get().dispatch({ type: 'RESUME', now: Date.now() }),
  switchSide: (side) => get().dispatch({ type: 'SWITCH', side, now: Date.now() }),
  stop: () => get().dispatch({ type: 'STOP', now: Date.now() }),
  cancel: () => get().dispatch({ type: 'CANCEL', now: Date.now() }),
  discard: () => get().dispatch({ type: 'DISCARD' }),
  confirm: () => get().dispatch({ type: 'CONFIRM' }),
  saved: () => get().dispatch({ type: 'SAVED' }),
  failed: () => get().dispatch({ type: 'FAILED' }),
}))

export const selectIsRunning = (s: TimerStore) => isRunning(s.state.status)
