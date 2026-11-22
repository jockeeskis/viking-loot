// Short vibrations on phones that support them (Android browsers; iOS Safari has no vibration API).
let enabled = true
export const setVibration = (on: boolean) => { enabled = on }

function buzz(pattern: number | number[]) {
  if (!enabled || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  try { navigator.vibrate(pattern) } catch { /* not allowed (e.g. before a user gesture) */ }
}

export const haptics = {
  /** A viking is sent out. */
  dispatch: () => buzz(12),
  /** The last seat of the ship was taken. */
  overflow: () => buzz([70, 50, 140]),
  win: () => buzz([25, 60, 25, 60, 50]),
  lose: () => buzz([100, 70, 160]),
  /** A button in the settings, so the player can feel what the setting does. */
  test: () => buzz([20, 40, 20]),
}
