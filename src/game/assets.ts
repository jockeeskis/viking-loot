// Loads the sprite sheets rendered by art-source/blender/render_assets.py.
// Anything missing from the manifest falls back to the code-drawn art in art.ts.
import Phaser from 'phaser'
import type { LootColor } from './engine'
import type { LootKind } from './art'
import { MANIFEST } from './assets.generated'

export type AnimRange = { start: number; end: number; fps: number }
export type SheetInfo = { sheet: string; frameWidth: number; frameHeight: number; originX: number; originY: number }
export type VikingAnim = 'idle' | 'run' | 'attack' | 'carry'
export type VikingAsset = SheetInfo & { name: string; portrait: string; anims: Record<VikingAnim, AnimRange> }
export type AssetManifest = {
  vikings: Partial<Record<LootColor, VikingAsset>>
  loot: (SheetInfo & { frames: Record<string, number> }) | null
  ship: (SheetInfo & { anims: { bob: AnimRange } }) | null
  /** Background island, placed at x/y in logical (360x640) coordinates. */
  island?: { image: string; x: number; y: number; width: number; height: number } | null
}

export const vikingKey = (c: LootColor) => `viking-${c}`
export const portraitKey = (c: LootColor) => `portrait-${c}`
export const vikingAnimKey = (c: LootColor, a: VikingAnim) => `${vikingKey(c)}-${a}`
export const LOOT_KEY = 'loot'
export const SHIP_KEY = 'longship'
export const ISLAND_KEY = 'island'

export const vikingAsset = (c: LootColor) => MANIFEST.vikings[c]
export const lootAsset = () => MANIFEST.loot
export const shipAsset = () => MANIFEST.ship
export const islandAsset = () => MANIFEST.island ?? null
export const lootFrame = (kind: LootKind, color: LootColor) => MANIFEST.loot?.frames[`${kind}-${color}`]

export function preloadAssets(scene: Phaser.Scene) {
  for (const [color, v] of Object.entries(MANIFEST.vikings) as [LootColor, VikingAsset][]) {
    scene.load.spritesheet(vikingKey(color), v.sheet, { frameWidth: v.frameWidth, frameHeight: v.frameHeight })
    scene.load.image(portraitKey(color), v.portrait)
  }
  const loot = MANIFEST.loot
  if (loot) scene.load.spritesheet(LOOT_KEY, loot.sheet, { frameWidth: loot.frameWidth, frameHeight: loot.frameHeight })
  const ship = MANIFEST.ship
  if (ship) scene.load.spritesheet(SHIP_KEY, ship.sheet, { frameWidth: ship.frameWidth, frameHeight: ship.frameHeight })
  const island = MANIFEST.island
  if (island) scene.load.image(ISLAND_KEY, island.image)
}

export function createAnims(scene: Phaser.Scene) {
  for (const [color, v] of Object.entries(MANIFEST.vikings) as [LootColor, VikingAsset][]) {
    if (!scene.textures.exists(vikingKey(color))) continue
    for (const [name, r] of Object.entries(v.anims) as [VikingAnim, AnimRange][]) {
      const key = vikingAnimKey(color, name)
      if (scene.anims.exists(key)) continue
      scene.anims.create({
        key, frameRate: r.fps, repeat: name === 'attack' ? 0 : -1,
        frames: scene.anims.generateFrameNumbers(vikingKey(color), { start: r.start, end: r.end }),
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

export const hasViking = (scene: Phaser.Scene, c: LootColor) => !!MANIFEST.vikings[c] && scene.textures.exists(vikingKey(c))
export const hasLoot = (scene: Phaser.Scene) => !!MANIFEST.loot && scene.textures.exists(LOOT_KEY)
export const hasShip = (scene: Phaser.Scene) => !!MANIFEST.ship && scene.textures.exists(SHIP_KEY)
export const hasIsland = (scene: Phaser.Scene) => !!MANIFEST.island && scene.textures.exists(ISLAND_KEY)
