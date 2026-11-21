// Loads the sprite sheets rendered by art-source/blender/render_assets.py.
// Anything missing from the manifest falls back to the code-drawn art in art.ts.
// The three team vikings, loot, ship and island load up front; the jarl (Harald) and the
// wild viking (Ylva) are only fetched when a level needs them, to keep the first load small.
import Phaser from 'phaser'
import type { LootColor, VikingKind } from './engine'
import type { LootKind } from './art'
import { MANIFEST } from './assets.generated'

export type AnimRange = { start: number; end: number; fps: number }
export type SheetInfo = { sheet: string; frameWidth: number; frameHeight: number; originX: number; originY: number }
export type VikingAnim = 'idle' | 'run' | 'attack' | 'carry' | 'victory' | 'fail'
export type VikingAsset = SheetInfo & { name: string; portrait: string; anims: Partial<Record<VikingAnim, AnimRange>> }
export type AssetManifest = {
  vikings: Partial<Record<LootColor, VikingAsset>>
  jarls?: Partial<Record<LootColor, VikingAsset>>
  wild?: VikingAsset | null
  loot: (SheetInfo & { frames: Record<string, number> }) | null
  ship: (SheetInfo & { anims: { bob: AnimRange } }) | null
  /** Background island, placed at x/y in logical (360x640) coordinates. */
  island?: { image: string; x: number; y: number; width: number; height: number } | null
}

export const sheetKey = (a: VikingAsset) => `viking-${a.name}`
export const portraitKey = (a: VikingAsset) => `portrait-${a.name}`
export const animKey = (a: VikingAsset, anim: VikingAnim) => `${sheetKey(a)}-${anim}`
export const LOOT_KEY = 'loot'
export const SHIP_KEY = 'longship'
export const ISLAND_KEY = 'island'

/** Animations that play once and stop on their last frame. */
const ONE_SHOT: VikingAnim[] = ['attack', 'fail']

/** The rendered character for a viking: team viking, Harald in the jarl's colour, or Ylva. */
export function assetFor(v: { kind: VikingKind; color: LootColor | null }): VikingAsset | undefined {
  if (v.kind === 'jarl' && v.color) return MANIFEST.jarls?.[v.color] ?? MANIFEST.vikings[v.color]
  if (v.kind === 'wild') return MANIFEST.wild ?? MANIFEST.vikings.yellow
  return v.color ? MANIFEST.vikings[v.color] : undefined
}
export const teamAsset = (c: LootColor) => MANIFEST.vikings[c]
export const lootAsset = () => MANIFEST.loot
export const shipAsset = () => MANIFEST.ship
export const islandAsset = () => MANIFEST.island ?? null
export const lootFrame = (kind: LootKind | 'house-open', color: LootColor) => MANIFEST.loot?.frames[`${kind}-${color}`]
/** Colourless loot frames: 'stone' and 'hidden' (loot under a tarp). */
export const namedLootFrame = (name: 'stone' | 'hidden') => MANIFEST.loot?.frames[name]

function queueViking(scene: Phaser.Scene, a: VikingAsset) {
  if (!scene.textures.exists(sheetKey(a))) scene.load.spritesheet(sheetKey(a), a.sheet, { frameWidth: a.frameWidth, frameHeight: a.frameHeight })
  if (!scene.textures.exists(portraitKey(a))) scene.load.image(portraitKey(a), a.portrait)
}

export function preloadAssets(scene: Phaser.Scene) {
  for (const a of Object.values(MANIFEST.vikings)) if (a) queueViking(scene, a)
  const loot = MANIFEST.loot
  if (loot) scene.load.spritesheet(LOOT_KEY, loot.sheet, { frameWidth: loot.frameWidth, frameHeight: loot.frameHeight })
  const ship = MANIFEST.ship
  if (ship) scene.load.spritesheet(SHIP_KEY, ship.sheet, { frameWidth: ship.frameWidth, frameHeight: ship.frameHeight })
  const island = MANIFEST.island
  if (island) scene.load.image(ISLAND_KEY, island.image)
}

/**
 * Make sure the characters are loaded (used for the jarl and the wild viking).
 * Calls `done` right away if nothing is missing, otherwise once the download finishes.
 */
export function ensureVikings(scene: Phaser.Scene, assets: VikingAsset[], done: () => void) {
  const missing = assets.filter(a => !scene.textures.exists(sheetKey(a)) || !scene.textures.exists(portraitKey(a)))
  if (!missing.length) { done(); return }
  missing.forEach(a => queueViking(scene, a))
  scene.load.once(Phaser.Loader.Events.COMPLETE, () => { createAnims(scene); done() })
  scene.load.start()
}

/** Create animations for every loaded character (safe to call again after a lazy load). */
export function createAnims(scene: Phaser.Scene) {
  const all = [
    ...Object.values(MANIFEST.vikings), ...Object.values(MANIFEST.jarls ?? {}), MANIFEST.wild,
  ].filter((a): a is VikingAsset => !!a)
  for (const a of all) {
    if (!scene.textures.exists(sheetKey(a))) continue
    for (const [name, r] of Object.entries(a.anims) as [VikingAnim, AnimRange][]) {
      const key = animKey(a, name)
      if (scene.anims.exists(key)) continue
      scene.anims.create({
        key, frameRate: r.fps, repeat: ONE_SHOT.includes(name) ? 0 : -1,
        frames: scene.anims.generateFrameNumbers(sheetKey(a), { start: r.start, end: r.end }),
      })
    }
  }
  const ship = MANIFEST.ship
  if (ship && scene.textures.exists(SHIP_KEY) && !scene.anims.exists('ship-bob')) {
    scene.anims.create({
      key: 'ship-bob', frameRate: ship.anims.bob.fps, repeat: -1,
      frames: scene.anims.generateFrameNumbers(SHIP_KEY, { start: ship.anims.bob.start, end: ship.anims.bob.end }),
    })
  }
}

export const hasSheet = (scene: Phaser.Scene, a: VikingAsset | undefined): a is VikingAsset => !!a && scene.textures.exists(sheetKey(a))
export const hasLoot = (scene: Phaser.Scene) => !!MANIFEST.loot && scene.textures.exists(LOOT_KEY)
export const hasShip = (scene: Phaser.Scene) => !!MANIFEST.ship && scene.textures.exists(SHIP_KEY)
export const hasIsland = (scene: Phaser.Scene) => !!MANIFEST.island && scene.textures.exists(ISLAND_KEY)
