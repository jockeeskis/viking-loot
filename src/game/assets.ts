// Loads the sprite sheets rendered by art-source/blender/render_assets.py.
// Anything missing from the manifest falls back to the code-drawn art in art.ts.
// The three team vikings, loot, ships and islands load up front; the jarl (Harald), the
// wild viking (Ylva) and the scout (Sigrid) are only fetched when a level needs them.
import Phaser from 'phaser'
import type { LootColor, VikingKind } from './engine'
import type { LootKind } from './art'
import { MANIFEST } from './assets.generated'

export type AnimRange = { start: number; end: number; fps: number }
export type SheetInfo = { sheet: string; frameWidth: number; frameHeight: number; originX: number; originY: number }
export type VikingAnim = 'idle' | 'run' | 'attack' | 'carry' | 'victory' | 'fail' | 'look'
export type VikingAsset = SheetInfo & { name: string; portrait: string; anims: Partial<Record<VikingAnim, AnimRange>> }
export type AssetManifest = {
  vikings: Partial<Record<LootColor, VikingAsset>>
  jarls?: Partial<Record<LootColor, VikingAsset>>
  wild?: VikingAsset | null
  scout?: VikingAsset | null
  loot: (SheetInfo & { frames: Record<string, number> }) | null
  ship: ShipAsset | null
  /** Every longship style by id ('ormen' is the default ship); the others are unlocked in Skeppsvarvet. */
  shipVariants?: Record<string, ShipAsset>
  /** Background island, placed at x/y in logical (360x640) coordinates. */
  island?: IslandInfo | null
  /** The winter island used in Isriket. */
  islandSnow?: IslandInfo | null
  /** Small colour ships, one frame per colour. */
  boats?: (SheetInfo & { frames: Record<LootColor, number> }) | null
}
export type ShipAsset = SheetInfo & { anims: { bob: AnimRange } }
export type IslandInfo = { image: string; x: number; y: number; width: number; height: number }

export const sheetKey = (a: VikingAsset) => `viking-${a.name}`
export const portraitKey = (a: VikingAsset) => `portrait-${a.name}`
export const animKey = (a: VikingAsset, anim: VikingAnim) => `${sheetKey(a)}-${anim}`
export const LOOT_KEY = 'loot'
export const SHIP_KEY = 'longship'
export const ISLAND_KEY = 'island'
export const ISLAND_SNOW_KEY = 'island-snow'
export const BOATS_KEY = 'boats'

/** Animations that play once and stop on their last frame. */
const ONE_SHOT: VikingAnim[] = ['attack', 'fail']

/** The rendered character for a viking: team viking, Harald in the jarl's colour, Ylva or Sigrid. */
export function assetFor(v: { kind: VikingKind; color: LootColor | null }): VikingAsset | undefined {
  if (v.kind === 'jarl' && v.color) return MANIFEST.jarls?.[v.color] ?? MANIFEST.vikings[v.color]
  if (v.kind === 'wild') return MANIFEST.wild ?? MANIFEST.vikings.yellow
  if (v.kind === 'scout') return MANIFEST.scout ?? MANIFEST.vikings.blue
  return v.color ? MANIFEST.vikings[v.color] : undefined
}
export const teamAsset = (c: LootColor) => MANIFEST.vikings[c]
export const lootAsset = () => MANIFEST.loot
export const shipAsset = (id = 'ormen') => (id === 'ormen' ? MANIFEST.ship : MANIFEST.shipVariants?.[id] ?? MANIFEST.ship)
export const shipKey = (id = 'ormen') => (id === 'ormen' || !MANIFEST.shipVariants?.[id] ? SHIP_KEY : `${SHIP_KEY}-${id}`)
export const shipAnimKey = (id = 'ormen') => (shipKey(id) === SHIP_KEY ? 'ship-bob' : `ship-bob-${id}`)
/** The sheet of a ship style, for previews outside the game (Skeppsvarvet). */
export const shipSheet = (id: string) => (id === 'ormen' ? MANIFEST.ship : MANIFEST.shipVariants?.[id])?.sheet ?? null

/** Load a ship style the first time it is chosen. Calls `done` once it can be shown. */
export function ensureShip(scene: Phaser.Scene, id: string, done: () => void) {
  const key = shipKey(id)
  const a = shipAsset(id)
  if (!a || scene.textures.exists(key)) { createAnims(scene); done(); return }
  scene.load.spritesheet(key, a.sheet, { frameWidth: a.frameWidth, frameHeight: a.frameHeight })
  scene.load.once(Phaser.Loader.Events.COMPLETE, () => { createAnims(scene); done() })
  scene.load.start()
}
export const islandAsset = (snow = false) => (snow ? MANIFEST.islandSnow ?? MANIFEST.island : MANIFEST.island) ?? null
export const islandKey = (snow = false) => (snow && MANIFEST.islandSnow ? ISLAND_SNOW_KEY : ISLAND_KEY)
export const boatsAsset = () => MANIFEST.boats ?? null
export const lootFrame = (kind: LootKind | 'house-open' | 'padlock', color: LootColor) => MANIFEST.loot?.frames[`${kind}-${color}`]
/** Colourless loot frames: 'stone', 'hidden' (loot under a tarp) and the 'ice' overlay. */
export const namedLootFrame = (name: 'stone' | 'hidden' | 'ice') => MANIFEST.loot?.frames[name]

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
  if (MANIFEST.islandSnow) scene.load.image(ISLAND_SNOW_KEY, MANIFEST.islandSnow.image)
  const boats = MANIFEST.boats
  if (boats) scene.load.spritesheet(BOATS_KEY, boats.sheet, { frameWidth: boats.frameWidth, frameHeight: boats.frameHeight })
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
    ...Object.values(MANIFEST.vikings), ...Object.values(MANIFEST.jarls ?? {}), MANIFEST.wild, MANIFEST.scout,
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
  for (const id of ['ormen', ...Object.keys(MANIFEST.shipVariants ?? {})]) {
    const ship = shipAsset(id), key = shipKey(id), anim = shipAnimKey(id)
    if (!ship || !scene.textures.exists(key) || scene.anims.exists(anim)) continue
    scene.anims.create({
      key: anim, frameRate: ship.anims.bob.fps, repeat: -1,
      frames: scene.anims.generateFrameNumbers(key, { start: ship.anims.bob.start, end: ship.anims.bob.end }),
    })
  }
}

export const hasSheet = (scene: Phaser.Scene, a: VikingAsset | undefined): a is VikingAsset => !!a && scene.textures.exists(sheetKey(a))
export const hasLoot = (scene: Phaser.Scene) => !!MANIFEST.loot && scene.textures.exists(LOOT_KEY)
export const hasShip = (scene: Phaser.Scene) => !!MANIFEST.ship && scene.textures.exists(SHIP_KEY)
export const hasIsland = (scene: Phaser.Scene) => !!MANIFEST.island && scene.textures.exists(ISLAND_KEY)
export const hasBoats = (scene: Phaser.Scene) => !!MANIFEST.boats && scene.textures.exists(BOATS_KEY)
