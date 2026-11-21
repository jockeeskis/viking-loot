// Small visual effects (particles, floating text, camera punch). Purely cosmetic:
// nothing here touches the game state.
import Phaser from 'phaser'
import { COLORS, GOLD, cartoonText } from './art'
import type { LootColor } from './engine'

const COIN = 'fx-coin'
const CHIP = 'fx-chip'
const DOT = 'fx-dot'
const CONFETTI = 'fx-confetti'
const DEPTH = 40
/** The scene camera's resting zoom (the 720x1280 canvas shows the 360x640 layout). */
export const CAMERA_ZOOM = 2

/** Textures are drawn at 2x and shown at half scale to stay sharp on the zoomed camera. */
export function createFxTextures(scene: Phaser.Scene) {
  if (scene.textures.exists(COIN)) return
  const g = scene.make.graphics({}, false)
  g.fillStyle(0x8a5a12); g.fillCircle(16, 16, 16)
  g.fillStyle(0xf5c542); g.fillCircle(16, 15, 13)
  g.fillStyle(0xffe58a); g.fillCircle(16, 15, 9)
  g.fillStyle(0xfff7d0); g.fillCircle(11, 10, 4)
  g.generateTexture(COIN, 32, 32); g.clear()
  g.fillStyle(0xffffff); g.fillRoundedRect(0, 0, 20, 10, 3)
  g.generateTexture(CHIP, 20, 10); g.clear()
  g.fillStyle(0xffffff); g.fillCircle(12, 12, 12)
  g.generateTexture(DOT, 24, 24); g.clear()
  g.fillStyle(0xffffff); g.fillRect(0, 0, 16, 10)
  g.generateTexture(CONFETTI, 16, 10)
  g.destroy()
}

function burst(scene: Phaser.Scene, x: number, y: number, key: string, count: number,
  config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig) {
  const e = scene.add.particles(x, y, key, { ...config, emitting: false }).setDepth(DEPTH)
  e.explode(count)
  const life = typeof config.lifespan === 'number' ? config.lifespan : 1200
  scene.time.delayedCall(life + 100, () => e.destroy())
}

/** Gold coins spray out of plundered loot, with sparks in the loot's color. */
export function coinBurst(scene: Phaser.Scene, x: number, y: number, color: LootColor) {
  burst(scene, x, y, COIN, 7, {
    speed: { min: 70, max: 150 }, angle: { min: 225, max: 315 }, gravityY: 420,
    lifespan: 700, scale: { start: 0.5, end: 0.34 }, rotate: { min: 0, max: 360 },
    alpha: { start: 1, end: 0, ease: 'Expo.easeIn' },
  })
  burst(scene, x, y, DOT, 9, {
    speed: { min: 40, max: 110 }, angle: { min: 0, max: 360 }, lifespan: 380,
    scale: { start: 0.32, end: 0 }, tint: [COLORS[color], GOLD], blendMode: Phaser.BlendModes.ADD,
  })
}

/** Wood chips fly when an axe hits a barrel, chest or house. */
export function woodChips(scene: Phaser.Scene, x: number, y: number) {
  burst(scene, x, y, CHIP, 7, {
    speed: { min: 70, max: 150 }, angle: { min: 200, max: 340 }, gravityY: 520,
    lifespan: 600, scale: { start: 0.45, end: 0.3 }, rotate: { min: 0, max: 360 },
    tint: [0x8a5a33, 0x6b4423, 0xc9925a], alpha: { start: 1, end: 0, ease: 'Expo.easeIn' },
  })
}

/** Grey fragments when a stone crumbles. */
export function rockBits(scene: Phaser.Scene, x: number, y: number) {
  burst(scene, x, y, CHIP, 9, {
    speed: { min: 60, max: 140 }, angle: { min: 200, max: 340 }, gravityY: 560,
    lifespan: 650, scale: { start: 0.6, end: 0.35 }, rotate: { min: 0, max: 360 },
    tint: [0x7d8086, 0xa7a9ad, 0x5f6266], alpha: { start: 1, end: 0, ease: 'Expo.easeIn' },
  })
}

/** Ice shards when a frozen item thaws. */
export function iceShards(scene: Phaser.Scene, x: number, y: number) {
  burst(scene, x, y, CHIP, 12, {
    speed: { min: 70, max: 160 }, angle: { min: 190, max: 350 }, gravityY: 520,
    lifespan: 700, scale: { start: 0.55, end: 0.25 }, rotate: { min: 0, max: 360 },
    tint: [0xbfe8f7, 0xffffff, 0x78bcdd], alpha: { start: 1, end: 0, ease: 'Expo.easeIn' },
  })
}

/** Gold sparkles when a padlock springs open. */
export function sparkle(scene: Phaser.Scene, x: number, y: number) {
  burst(scene, x, y, DOT, 10, {
    speed: { min: 40, max: 120 }, angle: { min: 0, max: 360 }, lifespan: 520,
    scale: { start: 0.45, end: 0 }, tint: [0xf5c542, 0xfff1b0], alpha: { start: 1, end: 0 },
  })
}

/** A soft puff of dust where a viking lands. */
export function dustPuff(scene: Phaser.Scene, x: number, y: number) {
  burst(scene, x, y, DOT, 6, {
    speed: { min: 15, max: 45 }, angle: { min: 150, max: 390 }, lifespan: 420,
    scale: { start: 0.25, end: 0.6 }, alpha: { start: 0.55, end: 0 }, tint: 0xf3e6c4,
  })
}

/** "+1" style text that floats up and fades out. */
export function floatText(scene: Phaser.Scene, x: number, y: number, text: string, color: LootColor) {
  const t = scene.add.text(x, y, text, cartoonText(15, `#${COLORS[color].toString(16).padStart(6, '0')}`))
    .setOrigin(0.5).setDepth(DEPTH + 1).setScale(0.6)
  scene.tweens.add({ targets: t, scale: 1, duration: 140, ease: 'Back.easeOut' })
  scene.tweens.add({ targets: t, y: y - 26, alpha: 0, delay: 260, duration: 520, ease: 'Sine.easeIn', onComplete: () => t.destroy() })
}

/** Confetti rain and a small camera punch when the village is plundered. */
export function victory(scene: Phaser.Scene) {
  const e = scene.add.particles(0, -10, CONFETTI, {
    x: { min: 10, max: 350 }, speedY: { min: 90, max: 190 }, speedX: { min: -40, max: 40 },
    gravityY: 60, lifespan: 2600, rotate: { start: 0, end: 540 }, scale: { min: 0.45, max: 0.7 },
    tint: [COLORS.red, COLORS.blue, COLORS.yellow, GOLD, 0xffffff], frequency: 18, quantity: 2,
  }).setDepth(DEPTH)
  scene.time.delayedCall(900, () => e.stop())
  scene.time.delayedCall(3600, () => e.destroy())
  // Punch from the fixed base zoom and back. (Chaining camera.zoomTo from its own callback does not
  // work – the first effect's completion cancels the second – so the zoom used to creep up per win.)
  const cam = scene.cameras.main
  scene.tweens.killTweensOf(cam)
  cam.setZoom(CAMERA_ZOOM)
  scene.tweens.add({ targets: cam, zoom: CAMERA_ZOOM * 1.04, duration: 130, yoyo: true, hold: 40, ease: 'Sine.easeOut',
    onComplete: () => cam.setZoom(CAMERA_ZOOM) })
}
