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
export type VikingAnim = 'idle' | 'run' | 'attack' | 'carry' | 'victory' | 'fail' | 'look' | 'fly'
export type VikingAsset = SheetInfo & { name: string; portrait: string; anims: Partial<Record<VikingAnim, AnimRange>> }
export type AssetManifest = {
  vikings: Partial<Record<LootColor, VikingAsset>>
  jarls?: Partial<Record<LootColor, VikingAsset>>
  wild?: VikingAsset | null
  scout?: VikingAsset | null
  /** The valkyrie (0.6), with an extra 'fly' animation. */
  valkyrie?: VikingAsset | null
  /** `gatePlaque`: where the gate overlay's plaque sits in a frame (0..1), for the count written on it (0.6). */
  loot: (SheetInfo & { frames: Record<string, number>; gatePlaque?: number[] }) | null
  ship: ShipAsset | null
  /** Every longship style by id ('ormen' is the default ship); the others are unlocked in Skeppsvarvet. */
  shipVariants?: Record<string, ShipAsset>
  /** Background island, placed at x/y in logical (360x640) coordinates. */
  island?: IslandInfo | null
  /** The winter island used in Isriket. */
  islandSnow?: IslandInfo | null
  /** The volcanic island used in Muspelheim (0.5). */
  islandLava?: IslandInfo | null
  /** Asgård's island with marble pillars and the rainbow bridge (0.6). */
  islandGold?: IslandInfo | null
  /** The raven that carries off waiting vikings (0.5). */
  raven?: (SheetInfo & { anims: { fly: AnimRange } }) | null
  /** The four bosses (0.5): idle frames plus a portrait for the story cards. */
  bosses?: Record<string, BossAsset>
  /** Sails and shield rows (0.6): overlay sheets with the longship's frame layout, by slot and key. */
  cosmetics?: Partial<Record<'sail' | 'shields', Record<string, string>>>
  /** Small colour ships, one frame per colour. */
  boats?: (SheetInfo & { frames: Record<LootColor, number> }) | null
}
export type ShipAsset = SheetInfo & { anims: { bob: AnimRange } }
export type BossAsset = { sheet: string; portrait: string; frameWidth: number; frameHeight: number; anims: { idle: AnimRange } }
export type IslandInfo = { image: string; x: number; y: number; width: number; height: number }

export const sheetKey = (a: VikingAsset) => `viking-${a.name}`
export const portraitKey = (a: VikingAsset) => `portrait-${a.name}`
export const animKey = (a: VikingAsset, anim: VikingAnim) => `${sheetKey(a)}-${anim}`
export const LOOT_KEY = 'loot'
export const SHIP_KEY = 'longship'
export const ISLAND_KEY = 'island'
export const ISLAND_SNOW_KEY = 'island-snow'
export const ISLAND_LAVA_KEY = 'island-lava'
export const ISLAND_GOLD_KEY = 'island-gold'
export const RAVEN_KEY = 'raven'
export type IslandStyle = 'grass' | 'snow' | 'lava' | 'gold'
export const BOATS_KEY = 'boats'

/** Animations that play once and stop on their last frame. */
const ONE_SHOT: VikingAnim[] = ['attack', 'fail']

/** The rendered character for a viking: team viking, Harald in the jarl's colour, Ylva or Sigrid. */
export function assetFor(v: { kind: VikingKind; color: LootColor | null }): VikingAsset | undefined {
  if (v.kind === 'jarl' && v.color) return MANIFEST.jarls?.[v.color] ?? MANIFEST.vikings[v.color]
  if (v.kind === 'wild') return MANIFEST.wild ?? MANIFEST.vikings.yellow
  if (v.kind === 'scout') return MANIFEST.scout ?? MANIFEST.vikings.blue
  if (v.kind === 'valkyrie') return MANIFEST.valkyrie ?? MANIFEST.scout ?? MANIFEST.vikings.yellow
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
/** The overlay sheet of a cosmetic ('sail-rutor' → cosmetics.sail.rutor), or null if it has none. */
export function cosmeticSheet(id: string): string | null {
  const [slot, ...rest] = id.split('-')
  return MANIFEST.cosmetics?.[slot as 'sail' | 'shields']?.[rest.join('-')] ?? null
}
export const cosmeticKey = (id: string) => `cosmetic-${id}`
/** Load a sail or shield overlay the first time it is shown (same frame size as the longship). */
export function ensureCosmetic(scene: Phaser.Scene, id: string, done: () => void) {
  const key = cosmeticKey(id), sheet = cosmeticSheet(id), ship = MANIFEST.ship
  if (!sheet || !ship) return
  if (scene.textures.exists(key)) { done(); return }
  scene.load.spritesheet(key, sheet, { frameWidth: ship.frameWidth, frameHeight: ship.frameHeight })
  scene.load.once(`filecomplete-spritesheet-${key}`, done)
  scene.load.start()
}
export const bossAsset = (id: string) => MANIFEST.bosses?.[id] ?? null
export const bossKey = (id: string) => `boss-${id}`
/** Load a boss the first time it is fought, then create its idle animation. */
export function ensureBoss(scene: Phaser.Scene, id: string, done: () => void) {
  const a = bossAsset(id)
  const key = bossKey(id)
  const ready = () => {
    if (a && scene.textures.exists(key) && !scene.anims.exists(`${key}-idle`)) {
      scene.anims.create({
        key: `${key}-idle`, frameRate: a.anims.idle.fps, repeat: -1, yoyo: true,
        frames: scene.anims.generateFrameNumbers(key, { start: a.anims.idle.start, end: a.anims.idle.end }),
      })
    }
    done()
  }
  if (!a || scene.textures.exists(key)) { ready(); return }
  scene.load.spritesheet(key, a.sheet, { frameWidth: a.frameWidth, frameHeight: a.frameHeight })
  scene.load.once(Phaser.Loader.Events.COMPLETE, ready)
  scene.load.start()
}
export const islandAsset = () => MANIFEST.island ?? null
/** The island image for a world style (falls back to the green island when one is missing). */
export function islandKey(style: IslandStyle = 'grass') {
  if (style === 'snow' && MANIFEST.islandSnow) return ISLAND_SNOW_KEY
  if (style === 'lava' && MANIFEST.islandLava) return ISLAND_LAVA_KEY
  if (style === 'gold' && MANIFEST.islandGold) return ISLAND_GOLD_KEY
  return ISLAND_KEY
}
export const ravenAsset = () => MANIFEST.raven ?? null
export const boatsAsset = () => MANIFEST.boats ?? null
export const lootFrame = (kind: LootKind | 'house-open' | 'padlock' | 'gate', color: LootColor) => MANIFEST.loot?.frames[`${kind}-${color}`]
/** Colourless loot frames: 'stone', 'hidden' (loot under a tarp), the 'ice' overlay and Asgård's 'gold'. */
export const namedLootFrame = (name: 'stone' | 'hidden' | 'ice' | 'gold') => MANIFEST.loot?.frames[name]

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
  if (MANIFEST.islandLava) scene.load.image(ISLAND_LAVA_KEY, MANIFEST.islandLava.image)
  if (MANIFEST.islandGold) scene.load.image(ISLAND_GOLD_KEY, MANIFEST.islandGold.image)
  const raven = MANIFEST.raven
  if (raven) scene.load.spritesheet(RAVEN_KEY, raven.sheet, { frameWidth: raven.frameWidth, frameHeight: raven.frameHeight })
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
    ...Object.values(MANIFEST.vikings), ...Object.values(MANIFEST.jarls ?? {}), MANIFEST.wild, MANIFEST.scout, MANIFEST.valkyrie,
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
  const raven = MANIFEST.raven
  if (raven && scene.textures.exists(RAVEN_KEY) && !scene.anims.exists('raven-fly')) {
    scene.anims.create({
      key: 'raven-fly', frameRate: raven.anims.fly.fps, repeat: -1,
      frames: scene.anims.generateFrameNumbers(RAVEN_KEY, { start: raven.anims.fly.start, end: raven.anims.fly.end }),
    })
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
export const hasRaven = (scene: Phaser.Scene) => !!MANIFEST.raven && scene.textures.exists(RAVEN_KEY)
export const hasBoats = (scene: Phaser.Scene) => !!MANIFEST.boats && scene.textures.exists(BOATS_KEY)
