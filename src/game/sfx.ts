// Sound effects synthesized with WebAudio – no audio files, no licenses.
// Browsers (especially on mobile) only allow sound after a user gesture, so
// `unlockAudio()` is called from the first pointer press.

const MUTE_KEY = 'viking-loot-muted'
let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = (() => { try { return localStorage.getItem(MUTE_KEY) === '1' } catch { return false } })()

export const isMuted = () => muted
export function setMuted(m: boolean) {
  muted = m
  try { localStorage.setItem(MUTE_KEY, m ? '1' : '0') } catch { /* private mode */ }
}

/** The shared AudioContext, created on first use. Ignores the effects mute (music has its own switch). */
function context(): AudioContext | null {
  if (!ctx) {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      ctx = new AC()
      master = ctx.createGain()
      master.gain.value = 0.6
      master.connect(ctx.destination)
    } catch { return null }
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function audio(): AudioContext | null {
  return muted ? null : context()
}

export function unlockAudio() {
  context()
  startMusic()
}

// ---------------------------------------------------------------- music
// A short, original shanty-like loop in D minor (32 quarter notes), lead + bass + a soft
// offbeat shaker. Scheduled slightly ahead with WebAudio timing so it stays in time.
const MUSIC_KEY = 'viking-loot-music'
let musicOn = (() => { try { return localStorage.getItem(MUSIC_KEY) !== '0' } catch { return true } })()
let musicGain: GainNode | null = null
let musicTimer: ReturnType<typeof setTimeout> | undefined
let nextBeat = 0
let step = 0
const BEAT = 60 / 104
// Notes as MIDI numbers, 0 = rest. One entry per quarter note, 8 bars.
const MELODY = [
  62, 0, 65, 69, /**/ 67, 65, 64, 62, /**/ 60, 0, 64, 67, /**/ 69, 67, 65, 64,
  62, 0, 65, 69, /**/ 70, 69, 67, 65, /**/ 64, 67, 65, 64, /**/ 62, 0, 0, 0,
]
const BASS = [38, 43, 36, 45, 38, 46, 45, 38] // one root per bar: Dm Gm C A Dm Bb A Dm
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12)

export const isMusicOn = () => musicOn
export function setMusicOn(on: boolean) {
  musicOn = on
  try { localStorage.setItem(MUSIC_KEY, on ? '1' : '0') } catch { /* private mode */ }
  if (on) startMusic(); else stopMusic()
}

function voice(c: AudioContext, dest: AudioNode, freq: number, t: number, dur: number, type: OscillatorType, vol: number) {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(dest)
  o.start(t); o.stop(t + dur + 0.05)
}

function playStep(c: AudioContext, dest: AudioNode, i: number, t: number) {
  const m = MELODY[i]
  if (m) voice(c, dest, hz(m), t, BEAT * (MELODY[(i + 1) % MELODY.length] ? 0.9 : 1.8), 'triangle', 0.5)
  if (i % 4 === 0 || i % 4 === 2) voice(c, dest, hz(BASS[Math.floor(i / 4)]), t, BEAT * 1.6, 'sine', 0.7)
  // shaker on the offbeat
  const len = Math.ceil(c.sampleRate * 0.05)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let k = 0; k < len; k++) d[k] = (Math.random() * 2 - 1) * (1 - k / len)
  const src = c.createBufferSource()
  src.buffer = buf
  const hp = c.createBiquadFilter()
  hp.type = 'highpass'; hp.frequency.value = 5000
  const g = c.createGain()
  g.gain.value = 0.18
  src.connect(hp).connect(g).connect(dest)
  src.start(t + BEAT / 2)
}

function schedule() {
  const c = ctx
  if (!c || !musicGain) return
  // After the tab was asleep, skip ahead instead of playing a burst of late notes.
  if (nextBeat < c.currentTime - 0.1) nextBeat = c.currentTime + 0.05
  while (nextBeat < c.currentTime + 0.25) {
    playStep(c, musicGain, step, nextBeat)
    nextBeat += BEAT
    step = (step + 1) % MELODY.length
  }
  musicTimer = setTimeout(schedule, 60)
}

export function startMusic() {
  if (!musicOn || musicTimer !== undefined) return
  if (typeof document !== 'undefined' && document.hidden) return
  const c = context()
  if (!c || !master) return
  if (!musicGain) {
    musicGain = c.createGain()
    musicGain.gain.value = 0.09
    musicGain.connect(master)
  }
  nextBeat = c.currentTime + 0.1
  schedule()
}

export function stopMusic() {
  if (musicTimer !== undefined) clearTimeout(musicTimer)
  musicTimer = undefined
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopMusic(); else if (ctx) startMusic() })
}

type ToneOpts = { type?: OscillatorType; vol?: number; at?: number; slide?: number; lowpass?: number; attack?: number }

function tone(freq: number, dur: number, o: ToneOpts = {}) {
  const c = audio()
  if (!c || !master) return
  const t = c.currentTime + (o.at ?? 0)
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(freq, t)
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(o.vol ?? 0.15, t + (o.attack ?? 0.008))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  let node: AudioNode = osc
  if (o.lowpass) {
    const f = c.createBiquadFilter()
    f.type = 'lowpass'; f.frequency.value = o.lowpass
    osc.connect(f); node = f
  }
  node.connect(g).connect(master)
  osc.start(t); osc.stop(t + dur + 0.05)
}

function noise(dur: number, freq: number, vol: number, at = 0) {
  const c = audio()
  if (!c || !master) return
  const t = c.currentTime + at
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
  const src = c.createBufferSource()
  src.buffer = buf
  const f = c.createBiquadFilter()
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2
  const g = c.createGain()
  g.gain.value = vol
  src.connect(f).connect(g).connect(master)
  src.start(t)
}

export const sfx = {
  /** Short war-horn blast when a viking is sent out. */
  dispatch() {
    tone(147, 0.32, { type: 'sawtooth', vol: 0.09, slide: 165, lowpass: 900, attack: 0.04 })
    tone(220, 0.3, { type: 'sawtooth', vol: 0.05, slide: 247, lowpass: 1100, attack: 0.04 })
  },
  /** Axe hitting wood. */
  chop() {
    noise(0.09, 1600, 0.5)
    tone(170, 0.09, { type: 'square', vol: 0.06, slide: 70, lowpass: 600 })
  },
  /** Coin pling when the loot is taken. */
  coin() {
    tone(1319, 0.1, { type: 'triangle', vol: 0.12 })
    tone(1976, 0.22, { type: 'triangle', vol: 0.1, at: 0.07 })
  },
  /** A viking sits down to wait on the ship. */
  wait() {
    tone(392, 0.16, { type: 'triangle', vol: 0.1 })
    tone(294, 0.26, { type: 'triangle', vol: 0.1, at: 0.12 })
  },
  /** The last seat is taken. */
  overflow() {
    tone(110, 0.5, { type: 'sawtooth', vol: 0.12, slide: 55, lowpass: 500 })
    noise(0.3, 300, 0.4)
  },
  win() {
    ;[523, 659, 784, 1047].forEach((f, i) => tone(f, i === 3 ? 0.6 : 0.18, { type: 'triangle', vol: 0.13, at: i * 0.11 }))
    tone(1568, 0.5, { type: 'sine', vol: 0.05, at: 0.33 })
  },
  lose() {
    ;[392, 330, 262].forEach((f, i) => tone(f, i === 2 ? 0.6 : 0.22, { type: 'triangle', vol: 0.11, at: i * 0.2 }))
  },
  /** A stone crumbles. */
  crumble() {
    noise(0.35, 420, 0.55)
    tone(90, 0.3, { type: 'sine', vol: 0.12, slide: 50 })
  },
  /** Hidden loot shows its colour. */
  reveal() {
    ;[880, 1109, 1319].forEach((f, i) => tone(f, 0.14, { type: 'sine', vol: 0.07, at: i * 0.05 }))
  },
  click() { tone(880, 0.05, { type: 'square', vol: 0.03, lowpass: 2500 }) },
}
