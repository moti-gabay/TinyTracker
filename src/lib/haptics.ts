/** Short confirmation buzz. Silent no-op where unsupported (all of iOS). */
export function tap(pattern: number | number[] = 12): void {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* ignore */
  }
}
