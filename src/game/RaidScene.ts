import Phaser from 'phaser'
import { levels, worlds, type Level } from './levels'
import { mechanicsOf } from './intros'
import {
  createGame, selectViking, isAvailable, mainSeats, SELECTABLE,
  type GameEvent, type GameState, type LootColor, type LossReason, type GameStatus, type Viking,
} from './engine'
import {
  COLORS, GOLD, INK, shade, cartoonText, drawColorMark, drawLoot, drawChibi, drawPortrait, drawHead,
  drawTree, drawRock, drawShip, drawPanel, drawTab, type LootKind,
} from './art'
import {
  preloadAssets, createAnims, ensureVikings, assetFor, teamAsset, hasSheet, hasLoot, hasShip, hasIsland, hasBoats, lootAsset, shipAsset,
  islandAsset, islandKey, boatsAsset, lootFrame, namedLootFrame, sheetKey, animKey, portraitKey, LOOT_KEY, SHIP_KEY, BOATS_KEY, ensureShip, shipKey, shipAnimKey,
  type VikingAnim, type VikingAsset,
} from './assets'
import { createFxTextures, coinBurst, woodChips, dustPuff, rockBits, floatText, victory, iceShards, sparkle, CAMERA_ZOOM } from './fx'
import { sfx } from './sfx'
import { haptics } from './haptics'
import { t } from './i18n'
import { hint } from './solver'

export type RaidUpdate = {
  busy: boolean // an animation is playing; undo and hints wait for it
  canUndo: boolean
  waits: number
  status: GameStatus
  lossReason: LossReason | null
  remaining: number
  queue: number
  waiting: number
  moves: number
}

// ---------- Layout (360×640 canvas) ----------
const ISLAND = { x: 8, y: 58, w: 344, h: 326 }
const ISLAND_CY = ISLAND.y + ISLAND.h / 2
const SHIP = { x: 186, y: 428 }
const BOARD = { x: SHIP.x, y: SHIP.y - 10 } // where vikings climb aboard
const PANEL_Y = 462
const WAIT_PANEL = { x: 6, w: 150 }
const QUEUE_PANEL = { x: 160, w: 194 }
const slotPos = (i: number) => ({ x: WAIT_PANEL.x + 30 + i * 45, y: PANEL_Y + 32 })
const SLOT_SCALE = 0.62
// The small colour ship (0.4) sails beside the longship; its seats are on its deck.
const BOAT = { x: 314, y: 436 }
const BOAT_W = 88
const SHIP_SHIFT = 28 // the longship makes room for the colour ship
const BOAT_SCALE = 0.48
const SCOUT_COLOR = 0x3e7d6a
const TAP_SLOP = 24 // game pixels a finger may move and still count as a tap
const boatSeatPos = (i: number, seats: number) => ({ x: BOAT.x + (i - (seats - 1) / 2) * 28, y: BOAT.y - 10 })
const PREVIEW_MAX = 6
const CARD = { y: 584, w: 108, h: 100 }
const cardX = (i: number) => 62 + i * 118
const ROW_H = 80 // vertical distance between loot rows
// Display scales for the rendered sprites (frame sizes come from the manifest).
// On-screen widths in logical px; the scale follows from the rendered frame size.
const VIKING_W = 92
const LOOT_W = 81
const SHIP_W = 210

// Houses are introduced later (ui-settings.md §5), so only levels that set `kind: 'house'` get them.
const KINDS: LootKind[] = ['barrel', 'chest']
function kindFor(id: string): LootKind {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return KINDS[h % KINDS.length]
}

type Sprite = Phaser.GameObjects.Container

/** The colour a viking is drawn in. A wild viking without a colour yet uses Freja's look plus a rainbow ring. */
const lookOf = (v: Viking): LootColor => v.color ?? 'yellow'

export class RaidScene extends Phaser.Scene {
  private state!: GameState
  private level = 0 // campaign index, only used before create() has run
  private levelData!: Level
  private titleText = ''
  private pending?: { data: Level; title: string } // a level asked for before the assets were loaded
  private busy = false
  private generation = 0
  private lootSprites = new Map<string, Sprite>()
  private actors = new Map<string, Sprite>() // vikings out on the island or seated on the ship
  private cards: Sprite[] = []
  private preview: Phaser.GameObjects.GameObject[] = []
  private slotsGfx?: Phaser.GameObjects.Graphics
  private waitTab?: Phaser.GameObjects.Graphics
  private warning?: Phaser.GameObjects.Text
  private title?: Phaser.GameObjects.Text
  private lootOffsetY = 0
  private ready = false
  // The state before the latest move. Only one step can be undone; then a new move is needed first.
  private history: GameState[] = []
  private hintGfx?: Phaser.GameObjects.Graphics
  private onUpdate?: (u: RaidUpdate) => void
  private islandImg?: Phaser.GameObjects.Image
  private boat?: Phaser.GameObjects.GameObject
  private longship?: Phaser.GameObjects.Sprite
  private shipId = 'ormen'
  private queueLabel?: Phaser.GameObjects.Text
  private seatsLabel?: Phaser.GameObjects.Text
  private colorMarks = false // colour-blind mode: symbols on everything whose colour matters

  constructor() { super('Raid') }

  preload() { preloadAssets(this) }

  create() {
    // The game canvas is 720x1280; zoom 2 keeps all coordinates in the 360x640 layout but renders sharper.
    this.cameras.main.setZoom(CAMERA_ZOOM).centerOn(180, 320)
    createAnims(this)
    createFxTextures(this)
    this.drawEnvironment()
    this.ready = true
    if (this.shipId !== 'ormen') this.setShip(this.shipId)
    if (this.pending) { const p = this.pending; this.pending = undefined; this.play(p.data, p.title) } else this.reset(this.level)
  }

  setUpdate(fn: (u: RaidUpdate) => void) { this.onUpdate = fn }

  /** Redraw texts after a language change (the title comes from the app). */
  relabel(title: string) {
    this.titleText = title
    this.title?.setText(title)
    this.queueLabel?.setText(t('scene.queue'))
    this.seatsLabel?.setText(t('scene.seats'))
    if (this.ready && this.state && !this.busy) this.layout(false)
  }

  /** Colour-blind mode on or off; the board is redrawn without animation. */
  setColorMarks(on: boolean) {
    if (on === this.colorMarks) return
    this.colorMarks = on
    if (this.ready && this.state && !this.busy) this.rebuild(this.state)
  }

  /** A colour symbol (▲ ● ■) when colour-blind mode is on, otherwise nothing. */
  private mark(color: LootColor | null | undefined, x: number, y: number, r: number): Phaser.GameObjects.Graphics[] {
    if (!this.colorMarks || !color) return []
    const g = this.add.graphics().setName('mark')
    drawColorMark(g, color, x, y, r)
    return [g]
  }

  /** Sail with another longship style (Skeppsvarvet). Loaded the first time it is chosen. */
  setShip(id: string) {
    this.shipId = id
    if (!this.ready || !this.longship) return
    ensureShip(this, id, () => {
      if (this.shipId !== id || !this.longship) return
      this.longship.setTexture(shipKey(id), 0).play(shipAnimKey(id))
    })
  }

  /** Start a campaign level by index. */
  reset(index: number) {
    const i = Phaser.Math.Clamp(index, 0, levels.length - 1)
    this.level = i
    this.play(levels[i], `${i + 1}. ${levels[i].name}`)
  }

  /** Start any level: a campaign level, Dagens räd or a round of the endless raid. */
  play(data: Level, title: string) {
    // Before create() has run (assets still loading) just remember the level; create() will draw it.
    if (!this.ready) { this.pending = { data, title }; return }
    this.levelData = data
    this.titleText = title
    this.history = []
    this.title?.setText(title)
    // Isriket is a winter island – and so is any generated raid that uses its mechanics.
    const isrikeMechanics = ['key', 'ice', 'ships', 'scout']
    const index = levels.indexOf(data)
    const snow = index >= 0 ? index >= (worlds[2]?.first ?? Infinity) : mechanicsOf(data).some(m => isrikeMechanics.includes(m))
    if (this.islandImg && hasIsland(this)) this.islandImg.setTexture(islandKey(snow))
    const state = createGame(data.loot, data.queue, data.ships)
    this.rebuild(state)
    // Harald, Ylva and Sigrid are downloaded the first time a level needs them; refresh the cards when they arrive.
    const special = state.queue.filter(v => v.kind !== 'normal').map(assetFor).filter((a): a is VikingAsset => !!a)
    if (special.some(a => !hasSheet(this, a))) ensureVikings(this, special, () => { if (this.levelData === data && !this.busy) this.layout(false) })
  }

  /** Play the current level again from the start. */
  restart() {
    if (this.ready && this.levelData) this.play(this.levelData, this.titleText)
  }

  /** Draw any state of the current level from scratch, without animation (restart and undo). */
  private rebuild(state: GameState) {
    this.generation++
    this.tweens.killAll()
    this.time.removeAllEvents()
    this.cameras.main.setZoom(CAMERA_ZOOM) // never carry a half-finished victory punch into the next level
    this.busy = false
    this.state = state
    this.lootSprites.forEach(s => s.destroy()); this.lootSprites.clear()
    this.actors.forEach(s => s.destroy()); this.actors.clear()
    this.drawLootSprites()
    this.drawBoat()
    this.layout(false)
    this.notify()
  }

  /** Take back the latest move (one step only). Allowed after a loss too, but not while a move is animating. */
  undo() {
    if (!this.ready || this.busy || !this.history.length || this.state.status === 'won') return
    this.rebuild(this.history.pop()!)
  }

  /**
   * Point at a move that can still win (fewest waits first). Returns false when the raid is
   * already lost or cannot be won any more.
   */
  showHint(): boolean {
    if (!this.ready || this.busy || this.state.status !== 'playing') return false
    const id = hint(this.state)
    if (!id) return false
    const index = this.state.queue.findIndex(v => v.id === id)
    const card = this.cards[index]
    if (!card) return false
    this.clearHint()
    const g = this.add.graphics().setDepth(21)
    g.lineStyle(4, GOLD); g.strokeRoundedRect(card.x - CARD.w / 2 - 4, CARD.y - CARD.h / 2 - 4, CARD.w + 8, CARD.h + 8, 18)
    this.hintGfx = g
    this.tweens.add({ targets: g, alpha: { from: 1, to: 0.35 }, duration: 420, yoyo: true, repeat: -1 })
    this.tweens.add({ targets: card, y: CARD.y - 8, duration: 160, yoyo: true, repeat: 2, ease: 'Sine.easeOut' })
    sfx.reveal()
    return true
  }

  private clearHint() { this.hintGfx?.destroy(); this.hintGfx = undefined }

  // ---------- Scenery ----------

  private drawEnvironment() {
    const g = this.add.graphics()
    // sea
    g.fillStyle(0x1f6fb0); g.fillRect(0, 0, 360, 640)
    g.fillStyle(0x2f8fd0); g.fillRect(0, 40, 360, 420)
    g.lineStyle(2, 0x7cc4ef, 0.5)
    for (let i = 0; i < 14; i++) {
      const x = (i * 83) % 360, y = 392 + (i * 29) % 60
      g.beginPath(); g.arc(x, y, 7, Math.PI * 1.15, Math.PI * 1.85); g.strokePath()
    }
    // foam around the island
    g.fillStyle(0xbfe6f7, 0.35); g.fillRoundedRect(ISLAND.x - 6, ISLAND.y + 2, ISLAND.w + 12, ISLAND.h + 14, 36)
    if (hasIsland(this)) {
      // rendered 3D island (trees, rocks and cobbles included)
      const is = islandAsset()!
      this.islandImg = this.add.image(is.x, is.y, islandKey(false)).setOrigin(0, 0).setDisplaySize(is.width, is.height)
    } else this.drawIsland(g)
    if (hasShip(this)) {
      const sh = shipAsset()!
      this.longship = this.add.sprite(SHIP.x, SHIP.y - 2, SHIP_KEY).setOrigin(sh.originX, sh.originY).setScale(SHIP_W / sh.frameWidth).play('ship-bob')
    } else drawShip(this.add.graphics(), SHIP.x, SHIP.y)
    this.drawHud()
  }

  /** Code-drawn island, used when the rendered image is missing. */
  private drawIsland(g: Phaser.GameObjects.Graphics) {
    // island: rocky rim, sand, grass, cobbles
    const { x, y, w, h } = ISLAND
    g.fillStyle(0x7d8086); g.fillRoundedRect(x, y + 6, w, h, 30)
    g.fillStyle(0xe6cf98); g.fillRoundedRect(x, y, w, h - 4, 30)
    g.fillStyle(0x5fae45); g.fillRoundedRect(x + 8, y + 6, w - 16, h - 22, 24)
    g.fillStyle(0x76c04f); g.fillRoundedRect(x + 14, y + 10, w - 28, h - 34, 20)
    g.fillStyle(0x86cc5b, 0.7)
    for (const [px, py, pw, ph] of [[70, 110, 70, 26], [260, 150, 80, 30], [120, 330, 90, 24], [300, 300, 50, 22]]) g.fillEllipse(px, py, pw, ph)
    g.fillStyle(0xcfc6b3, 0.55)
    for (let r = 0; r < 7; r++) for (let c = 0; c < 9; c++) if ((r * 7 + c * 3) % 4 !== 0) g.fillEllipse(48 + c * 33 + (r % 2) * 15, 92 + r * 42, 22, 12)
    // decorations along the edges
    drawTree(g, 26, 120, 0.8); drawTree(g, 334, 104, 0.9); drawTree(g, 30, 300, 0.75); drawTree(g, 336, 260, 0.8)
    drawRock(g, 22, 210, 0.8); drawRock(g, 340, 350, 0.9); drawRock(g, 300, 76, 0.7); drawRock(g, 60, 368, 0.8)
  }

  private drawHud() {
    // HUD sign
    const s = this.add.graphics()
    s.fillStyle(0x000000, 0.25); s.fillRoundedRect(72, 10, 220, 40, 12)
    s.fillStyle(0x5b3a20); s.fillRoundedRect(70, 6, 220, 40, 12)
    s.fillStyle(0x8a5a33); s.fillRoundedRect(75, 10, 210, 32, 9)
    s.fillStyle(0xc9925a); s.fillCircle(84, 26, 3); s.fillCircle(276, 26, 3)
    this.title = this.add.text(180, 26, '', cartoonText(18)).setOrigin(0.5)
    // bottom panels
    const p = this.add.graphics()
    p.fillStyle(0x3f2613); p.fillRect(0, PANEL_Y - 10, 360, 200)
    p.fillStyle(0x4f311a); for (let yy = PANEL_Y - 4; yy < 640; yy += 20) p.fillRect(0, yy, 360, 16)
    drawPanel(p, WAIT_PANEL.x, PANEL_Y, WAIT_PANEL.w, 62)
    drawPanel(p, QUEUE_PANEL.x, PANEL_Y, QUEUE_PANEL.w, 62)
    drawTab(p, QUEUE_PANEL.x + QUEUE_PANEL.w / 2, PANEL_Y - 10, 100)
    this.queueLabel = this.add.text(QUEUE_PANEL.x + QUEUE_PANEL.w / 2, PANEL_Y - 1, t('scene.queue'), cartoonText(10)).setOrigin(0.5)
    this.waitTab = this.add.graphics()
    this.seatsLabel = this.add.text(WAIT_PANEL.x + WAIT_PANEL.w / 2, PANEL_Y - 1, t('scene.seats'), cartoonText(10)).setOrigin(0.5).setDepth(1)
    this.slotsGfx = this.add.graphics().setDepth(2)
    this.warning = this.add.text(180, 436, '', { ...cartoonText(11), padding: { x: 8, y: 3 } }).setOrigin(0.5).setDepth(40)
  }

  private drawSlots(waiting: Viking[] = this.state.waiting) {
    // Only the main ship can sink the raid: one seated viking is a caution, the second-to-last seat the danger zone.
    const slots = this.state.ships[0].slots
    const used = waiting.filter(v => v.ship === 0).length
    const risk = used >= slots - 1 ? 0xe0392b : used >= 1 ? 0xe8a21b : null
    const g = this.slotsGfx!
    g.clear()
    for (let i = 0; i < slots; i++) {
      const { x, y } = slotPos(i)
      g.fillStyle(0x2a190c); g.fillCircle(x, y, 19)
      g.lineStyle(3, i < used && risk ? risk : 0xc9925a, i < used ? 1 : 0.7); g.strokeCircle(x, y, 19)
    }
    // Seats on the colour ship: safe, so they are drawn in its colour and never turn red.
    const boat = this.state.ships[1]
    if (boat?.color) {
      const onBoat = waiting.filter(v => v.ship === 1).length
      for (let i = 0; i < boat.slots; i++) {
        const { x, y } = boatSeatPos(i, boat.slots)
        g.fillStyle(0x2a190c, 0.55); g.fillEllipse(x, y + 10, 20, 8)
        g.lineStyle(2.5, COLORS[boat.color], i < onBoat ? 1 : 0.8); g.strokeEllipse(x, y + 10, 20, 8)
      }
    }
    const tab = this.waitTab!
    tab.clear(); drawTab(tab, WAIT_PANEL.x + WAIT_PANEL.w / 2, PANEL_Y - 10, 104, risk ?? 0x8a5a33)
    const w = this.warning!
    if (used >= slots) w.setText(t('scene.full')).setBackgroundColor('#a3261bee')
    else if (used === slots - 1) w.setText(t('scene.last')).setBackgroundColor('#a3261bee')
    else if (used >= 1) w.setText(t('scene.one')).setBackgroundColor('#9a6a10ee')
    else w.setText('').setBackgroundColor('#00000000')
  }

  /** Where a seated viking sits: on the longship panel or on the colour ship's deck. */
  private seatFor(waiting: Viking[], id: string): { x: number; y: number; s: number } | null {
    const v = waiting.find(w => w.id === id)
    if (!v) return null
    const index = waiting.filter(w => w.ship === v.ship).indexOf(v)
    return this.seatPos(v.ship, index)
  }
  private seatPos(ship: number, index: number) {
    if (ship === 0) return { ...slotPos(index), s: SLOT_SCALE }
    return { ...boatSeatPos(index, this.state.ships[ship].slots), s: BOAT_SCALE }
  }

  /** The colour ship (only on levels that have one). */
  private drawBoat() {
    this.boat?.destroy(); this.boat = undefined
    const color = this.state.ships[1]?.color
    this.longship?.setX(color ? SHIP.x - SHIP_SHIFT : SHIP.x)
    if (!color) return
    let boat: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics | Phaser.GameObjects.Container
    if (hasBoats(this)) {
      const a = boatsAsset()!
      boat = this.add.image(BOAT.x, BOAT.y, BOATS_KEY, a.frames[color]).setOrigin(a.originX, a.originY).setScale(BOAT_W / a.frameWidth)
    } else {
      const g = this.add.graphics()
      g.fillStyle(0x8c624a); g.fillEllipse(0, 0, 64, 18)
      g.fillStyle(COLORS[color]); g.fillRect(-14, -36, 28, 22)
      g.lineStyle(3, 0x5b3a20); g.lineBetween(0, -40, 0, -4)
      boat = g.setPosition(BOAT.x, BOAT.y)
    }
    boat.setDepth(1)
    const marks = this.mark(color, 0, 0, 8)
    if (marks.length) boat = this.add.container(BOAT.x, BOAT.y, [boat.setPosition(0, 0), ...marks]).setDepth(1)
    this.tweens.add({ targets: boat, y: BOAT.y + 2, angle: 1.5, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
    this.boat = boat
  }

  // ---------- Loot ----------

  private lootPos(at: [number, number]) { return { x: 54 + at[0] * 84, y: 112 + at[1] * ROW_H + this.lootOffsetY } }

  /** One loot object: a rendered sprite with a ground shadow, or the code-drawn fallback. */
  private makeLootGraphic(kind: LootKind, color: LootColor): Sprite {
    const frame = lootFrame(kind, color)
    if (hasLoot(this) && frame !== undefined) {
      const a = lootAsset()!
      const shadow = this.add.ellipse(0, 22, 54, 15, 0x000000, 0.22)
      const img = this.add.image(0, 22, LOOT_KEY, frame).setOrigin(a.originX, a.originY).setScale(LOOT_W / a.frameWidth).setName('img')
      return this.add.container(0, 0, [shadow, img, ...this.mark(color, 25, 12, 7)]).setName('art')
    }
    const g = this.add.graphics()
    drawLoot(g, kind, color)
    return this.add.container(0, 0, [g, ...this.mark(color, 25, 12, 7)]).setName('art')
  }

  /** Stones (no colour) and hidden loot (colour not yet known) use their own looks. */
  private makeItemGraphic(p: { kind?: LootKind; id: string; color?: LootColor; stone?: boolean }, hiddenNow: boolean): Sprite {
    const named = p.stone ? namedLootFrame('stone') : hiddenNow ? namedLootFrame('hidden') : undefined
    if (named !== undefined && hasLoot(this)) {
      const a = lootAsset()!
      const shadow = this.add.ellipse(0, 22, 58, 16, 0x000000, 0.22)
      const img = this.add.image(0, 22, LOOT_KEY, named).setOrigin(a.originX, a.originY).setScale(LOOT_W / a.frameWidth).setName('img')
      const parts: Phaser.GameObjects.GameObject[] = [shadow, img]
      if (hiddenNow) parts.push(this.add.text(0, -4, '?', cartoonText(22, '#f5c542')).setOrigin(0.5).setName('q'))
      return this.add.container(0, 0, parts).setName('art')
    }
    if (p.stone) {
      const g = this.add.graphics()
      g.fillStyle(0x000000, 0.22); g.fillEllipse(0, 20, 58, 16)
      drawRock(g, 0, 6, 2.6)
      return this.add.container(0, 0, [g]).setName('art')
    }
    if (hiddenNow) {
      const g = this.add.graphics()
      g.fillStyle(0x000000, 0.22); g.fillEllipse(0, 20, 54, 15)
      g.fillStyle(0x6b5a48); g.fillRoundedRect(-24, -22, 48, 44, 14)
      g.fillStyle(0x8c7660); g.fillRoundedRect(-21, -20, 42, 30, 12)
      g.lineStyle(3, 0x3b2414); g.strokeRoundedRect(-24, -22, 48, 44, 14)
      const q = this.add.text(0, 0, '?', cartoonText(24, '#f5c542')).setOrigin(0.5)
      return this.add.container(0, 0, [g, q]).setName('art')
    }
    return this.makeLootGraphic(p.kind ?? this.kindOf(p.id), p.color!)
  }

  /** A house that took its first hit: show the broken-open model (or cracks on drawn art). */
  private markOpened(target: Sprite) {
    const img = (target.getByName('art') as Sprite | null)?.getByName('img') as Phaser.GameObjects.Image | null
    const frame = lootFrame('house-open', target.getData('color'))
    this.tweens.add({ targets: target, angle: { from: -6, to: 0 }, duration: 260, ease: 'Back.easeOut' })
    if (img && frame !== undefined) { img.setFrame(frame); return }
    const crack = this.add.graphics()
    crack.lineStyle(2.5, INK)
    crack.beginPath(); crack.moveTo(-10, -18); crack.lineTo(-3, -8); crack.lineTo(-8, 0); crack.lineTo(2, 10); crack.strokePath()
    crack.beginPath(); crack.moveTo(12, -12); crack.lineTo(6, -2); crack.lineTo(12, 6); crack.strokePath()
    target.add(crack)
  }

  private drawLootSprites() {
    const placed = this.levelData.loot
    const rows = placed.map(p => p.at[1])
    // Centred a little above the island's middle so the longship's sail never reaches the front row.
    this.lootOffsetY = ISLAND_CY - 14 - (112 + ((Math.min(...rows) + Math.max(...rows)) / 2) * ROW_H)
    let minGap = Infinity
    placed.forEach(a => placed.forEach(b => {
      if (a !== b && a.at[0] === b.at[0]) minGap = Math.min(minGap, Math.abs(a.at[1] - b.at[1]) * ROW_H)
    }))
    const scale = Phaser.Math.Clamp(minGap / 60, 0.68, 1)
    const keyLevel = placed.some(l => l.lockedBy?.length)
    // Back rows first so blockers stand in front of what they block.
    ;[...placed].sort((a, b) => a.at[1] - b.at[1]).forEach((p, depth) => {
      const item = this.state.loot.find(l => l.id === p.id)!
      if (item.collected) return // already plundered (after undo)
      const { x, y } = this.lootPos(p.at)
      const kind = p.kind ?? this.kindOf(p.id)
      const art = this.makeItemGraphic(p, item.hidden)
      const shadeG = this.add.graphics().setName('shade')
      // Sprites are darkened with a tint instead (see refreshLocks); the box is only for drawn art.
      if (!art.getByName('img')) { shadeG.fillStyle(0x0b1a22, 0.55); shadeG.fillRoundedRect(-33, -36, 66, 62, 12) }
      const lock = this.add.graphics().setName('lock')
      // The small "blocked" lock would be mistaken for a key padlock, so levels with keys only darken.
      if (!keyLevel) {
        lock.lineStyle(3, GOLD); lock.beginPath(); lock.arc(22, -30, 5, Math.PI, 0); lock.strokePath()
        lock.fillStyle(GOLD); lock.fillRoundedRect(14, -30, 16, 13, 3)
        lock.fillStyle(INK); lock.fillRect(21, -26, 2, 5)
      }
      const overlays: Phaser.GameObjects.GameObject[] = []
      // A chest whose keys are not all taken carries a big padlock.
      if (item.lockedBy.some(k => !this.state.loot.find(l => l.id === k)?.collected)) overlays.push(this.makePadlock(this.keyColor(item.lockedBy)))
      // Frozen loot sits in a block of ice with the number of moves until it thaws.
      if (item.frozenLeft > 0) overlays.push(this.makeIce(), this.makeIceCounter(item.frozenLeft))
      const c = this.add.container(x, y, [art, shadeG, lock, ...overlays]).setScale(scale).setDepth(2 + depth * 0.01)
      c.setData('kind', kind).setData('color', p.color).setData('stone', !!p.stone)
      if (item.hitsLeft < (p.hits ?? 1)) this.markOpened(c)
      this.lootSprites.set(p.id, c)
    })
    this.refreshLocks(this.state, false)
  }

  /** On levels with keys every chest is a locked chest, so plain loot is drawn as barrels there. */
  private kindOf(id: string): LootKind {
    return this.levelData.loot.some(l => l.lockedBy?.length) ? 'barrel' : kindFor(id)
  }

  /** The colour of the key(s) that open a chest. */
  private keyColor(lockedBy: string[]): LootColor {
    return this.levelData.loot.find(l => l.id === lockedBy[0])?.color ?? 'yellow'
  }

  /** A padlock in the colour of its key, drawn on top of the chest (same frame layout, so they line up). */
  private makePadlock(color: LootColor): Phaser.GameObjects.GameObject {
    const frame = lootFrame('padlock', color)
    if (hasLoot(this) && frame !== undefined) {
      const a = lootAsset()!
      const img = this.add.image(0, 22, LOOT_KEY, frame).setOrigin(a.originX, a.originY).setScale(LOOT_W / a.frameWidth)
      return this.add.container(0, 0, [img, ...this.mark(color, -14, 4, 6)]).setName('padlock')
    }
    const g = this.add.graphics().setName('padlock')
    g.lineStyle(4, 0xa9b3bd); g.beginPath(); g.arc(0, 0, 7, Math.PI, 0); g.strokePath()
    g.fillStyle(COLORS[color]); g.fillRoundedRect(-11, 0, 22, 18, 3)
    g.lineStyle(2, INK); g.strokeRoundedRect(-11, 0, 22, 18, 3)
    g.fillStyle(GOLD); g.fillRoundedRect(-6, 3, 12, 12, 2)
    g.fillStyle(INK); g.fillCircle(0, 8, 2); g.fillRect(-1, 8, 2, 5)
    return g
  }

  /** A key flies in an arc from its spot on the island into a chest's padlock. */
  private async flyKey(at: [number, number], color: LootColor, chest: Sprite, delay: number) {
    const from = this.lootPos(at)
    const frame = lootFrame('key', color)
    let key: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics
    if (hasLoot(this) && frame !== undefined) {
      const a = lootAsset()!
      key = this.add.image(from.x, from.y, LOOT_KEY, frame).setOrigin(0.5, 0.6).setScale((LOOT_W / a.frameWidth) * 0.8)
    } else {
      const g = this.add.graphics({ x: from.x, y: from.y })
      drawLoot(g, 'key', color)
      key = g.setScale(0.8)
    }
    key.setDepth(40)
    await this.delay(delay)
    const to = { x: chest.x, y: chest.y + 6 * chest.scale }
    const midY = Math.min(from.y, to.y) - 70
    await this.tween({
      targets: key, duration: 520, ease: 'Sine.easeInOut',
      x: to.x, angle: 360,
      onUpdate: (tw: Phaser.Tweens.Tween) => {
        const t = tw.progress
        key.y = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * midY + t * t * to.y
      },
    })
    await this.tween({ targets: key, scale: key.scale * 0.5, alpha: 0, duration: 140 })
    key.destroy()
  }

  /** An ice block drawn on top of a loot object (same frame layout, so they line up). */
  private makeIce(): Phaser.GameObjects.GameObject {
    const frame = namedLootFrame('ice')
    if (hasLoot(this) && frame !== undefined) {
      const a = lootAsset()!
      return this.add.image(0, 22, LOOT_KEY, frame).setOrigin(a.originX, a.originY).setScale(LOOT_W / a.frameWidth).setName('ice')
    }
    const g = this.add.graphics().setName('ice')
    g.fillStyle(0xbfe8f7, 0.55); g.fillRoundedRect(-30, -34, 60, 58, 10); g.lineStyle(2, 0xffffff, 0.8); g.strokeRoundedRect(-30, -34, 60, 58, 10)
    return g
  }

  private makeIceCounter(n: number) {
    return this.add.text(0, -40, `❄${n}`, { ...cartoonText(13, '#ffffff'), backgroundColor: '#3b86b4dd', padding: { x: 5, y: 1 } })
      .setOrigin(0.5).setName('iceText')
  }

  private refreshLocks(state: GameState, animate: boolean) {
    for (const item of state.loot) {
      const c = this.lootSprites.get(item.id)
      if (!c || item.collected) continue
      // Stones are never plundered, so they never look locked; they simply crumble. Ice and padlocks
      // show for themselves, so only blockers in front grey an item out.
      const open = item.kind === 'stone' || isAvailable(state, { ...item, frozenLeft: 0, lockedBy: [] })
      const img = (c.getByName('art') as Sprite | null)?.getByName('img') as Phaser.GameObjects.Image | null
      if (img) { if (open) img.clearTint(); else img.setTint(0xaeb4c4) }
      const parts = [c.getByName('shade'), c.getByName('lock')] as unknown as Phaser.GameObjects.Components.Alpha[]
      const target = open ? 0 : 1
      if (parts[0].alpha === target) continue
      if (animate) {
        this.tweens.add({ targets: parts, alpha: target, duration: 260 })
        if (open) this.tweens.add({ targets: c, scale: c.scale * 1.12, yoyo: true, duration: 160 })
      } else parts.forEach(p => p.setAlpha(target))
    }
  }

  // ---------- Vikings ----------

  /** A chibi viking. The drawing sits in an inner "rig" so it can hop while the container moves. */
  private makeActor(v: Viking): Sprite {
    const color = lookOf(v)
    const asset = assetFor(v)
    let parts: Phaser.GameObjects.GameObject[]
    if (hasSheet(this, asset)) {
      const shadow = this.add.ellipse(0, 29, 34, 10, 0x000000, 0.22)
      const body = this.add.sprite(0, 29, sheetKey(asset)).setOrigin(asset.originX, asset.originY).setScale(VIKING_W / asset.frameWidth).setName('body')
      body.play(animKey(asset, 'idle'))
      parts = [shadow, body]
    } else {
      const g = this.add.graphics()
      drawChibi(g, color)
      parts = [g]
    }
    if (v.kind === 'wild') parts.unshift(v.color ? this.colorRing(v.color) : this.rainbowRing())
    const rig = this.add.container(0, 0, parts).setName('rig')
    rig.setData('asset', hasSheet(this, asset) ? asset : null)
    rig.setData('size', v.kind === 'jarl' ? 1.12 : 1) // the jarl stands a bit taller
    rig.setScale(rig.getData('size'))
    const carry = this.add.container(0, -36).setName('carry')
    const badge = this.add.text(0, 34, '', { ...cartoonText(14), padding: { x: 4, y: 0 } }).setOrigin(0.5).setName('badge').setVisible(false)
    const marks = v.kind === 'scout' ? [] : this.mark(v.color, -20, 24, 7)
    return this.add.container(0, 0, [rig, carry, badge, ...marks]).setDepth(30)
  }

  /** Play one of the rendered animations (no-op for the drawn fallback). Resolves when a one-shot ends. */
  private animate(actor: Sprite, anim: VikingAnim): Promise<void> {
    const rig = actor.getByName('rig') as Sprite
    const body = rig.getByName('body') as Phaser.GameObjects.Sprite | null
    if (!body) return Promise.resolve()
    const asset = rig.getData('asset') as VikingAsset | null
    if (!asset || !asset.anims[anim]) return Promise.resolve()
    const key = animKey(asset, anim)
    if (anim !== 'attack') { body.play(key, true); return Promise.resolve() }
    return new Promise(res => { body.play(key); body.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => res()) })
  }

  private rainbowRing() {
    const g = this.add.graphics().setName('ring')
    ;[COLORS.red, COLORS.blue, COLORS.yellow].forEach((col, i) => {
      g.lineStyle(4, col); g.beginPath(); g.arc(0, 29, 20, (i * 2 * Math.PI) / 3, ((i + 1) * 2 * Math.PI) / 3); g.strokePath()
    })
    g.setScale(1, 0.32)
    return g
  }

  /** A ring on the ground in one colour: shows which colour the wild viking chose. */
  private colorRing(color: LootColor) {
    const g = this.add.graphics().setName('ring')
    g.fillStyle(COLORS[color], 0.35); g.fillCircle(0, 29, 20)
    g.lineStyle(4, COLORS[color]); g.strokeCircle(0, 29, 20)
    g.setScale(1, 0.32)
    return g
  }

  /** A wild viking took its colour: the rainbow ring becomes a ring in that colour. */
  private recolor(actor: Sprite, color: LootColor) {
    const rig = actor.getByName('rig') as Sprite
    rig.getByName('ring')?.destroy()
    rig.addAt(this.colorRing(color), 0)
    const s = rig.getData('size') as number
    this.tweens.add({ targets: rig, scaleX: Math.sign(rig.scaleX) * s * 1.2, scaleY: s * 1.2, yoyo: true, duration: 140 })
    floatText(this, actor.x, actor.y - 40, '✦', color)
    if (!actor.getByName('mark')) actor.add(this.mark(color, -20, 24, 7))
  }

  private setBadge(actor: Sprite, collected: number | null, capacity = 2) {
    const b = actor.getByName('badge') as Phaser.GameObjects.Text
    if (collected === null) b.setVisible(false)
    else b.setText(`${collected}/${capacity}`).setBackgroundColor('#3b2414cc').setVisible(true)
  }

  private makeCard(v: Viking, index: number): Sprite {
    const color = lookOf(v)
    const asset = assetFor(v)
    const c = v.kind === 'scout' ? SCOUT_COLOR : v.kind === 'wild' && !v.color ? GOLD : COLORS[color]
    const { w, h } = CARD
    const g = this.add.graphics()
    g.fillStyle(0x000000, 0.3); g.fillRoundedRect(-w / 2 + 2, -h / 2 + 5, w, h, 16)
    g.fillStyle(0xf3dfb4); g.fillRoundedRect(-w / 2, -h / 2, w, h, 16)
    g.fillStyle(shade(c, -0.25)); g.fillRoundedRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10, 12)
    g.fillStyle(c); g.fillRoundedRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 26, 12)
    g.fillStyle(shade(c, 0.35), 0.5); g.fillEllipse(-14, -h / 2 + 22, 50, 22)
    let portrait: Phaser.GameObjects.Graphics | Phaser.GameObjects.Image
    if (asset && this.textures.exists(portraitKey(asset))) {
      portrait = this.add.image(0, -2, portraitKey(asset))
      portrait.setScale(104 / portrait.width)
    } else {
      portrait = this.add.graphics()
      drawPortrait(portrait, color, 25)
      portrait.setPosition(0, -4)
    }
    // Clip the shoulders to the card. The mask lives in world space, so it is placed at the card's slot.
    const mask = this.make.graphics({}, false)
    mask.fillStyle(0xffffff); mask.fillRoundedRect(cardX(index) - w / 2 + 5, CARD.y - h / 2 + 5, w - 10, h - 10, 12)
    portrait.setMask(mask.createGeometryMask())
    const extras: Phaser.GameObjects.GameObject[] = []
    if (v.kind === 'jarl') extras.push(this.add.text(w / 2 - 14, -h / 2 + 14, '👑', { fontSize: '18px', resolution: 2 }).setOrigin(0.5))
    if (v.kind === 'jarl') extras.push(this.add.text(0, h / 2 - 12, t('scene.carries3'), cartoonText(10)).setOrigin(0.5))
    if (v.kind === 'scout') {
      extras.push(this.add.text(w / 2 - 14, -h / 2 + 14, '🔭', { fontSize: '16px', resolution: 2 }).setOrigin(0.5))
      extras.push(this.add.text(0, h / 2 - 12, t('scene.scout'), cartoonText(10)).setOrigin(0.5))
    }
    if (v.kind === 'wild') {
      const stripes = this.add.graphics()
      ;[COLORS.red, COLORS.blue, COLORS.yellow].forEach((col, i) => { stripes.fillStyle(col); stripes.fillRect(-w / 2 + 8 + i * ((w - 16) / 3), h / 2 - 18, (w - 16) / 3, 8) })
      extras.push(stripes, this.add.text(w / 2 - 14, -h / 2 + 14, '✦', cartoonText(14, '#ffffff')).setOrigin(0.5))
    }
    if (v.kind !== 'scout') extras.push(...this.mark(v.color, -w / 2 + 16, -h / 2 + 16, 9))
    const card = this.add.container(cardX(index), CARD.y, [g, portrait, ...extras]).setSize(w, h).setDepth(20)
    card.once(Phaser.GameObjects.Events.DESTROY, () => mask.destroy())
    return card
  }

  /** Rebuild cards, the queue preview and seated vikings from the current state. */
  private layout(animate: boolean) {
    const playing = this.state.status === 'playing'
    this.clearHint()
    this.cards.forEach(c => c.destroy())
    this.cards = []
    this.state.queue.slice(0, SELECTABLE).forEach((v, i) => {
      const card = this.makeCard(v, i)
      if (playing) {
        card.setInteractive({ useHandCursor: true })
        // Choose on release, and only for a tap: a swipe that starts on a card scrolls the page instead
        // (the browser then cancels the touch) and must never send a viking.
        card.on('pointerup', (p: Phaser.Input.Pointer) => {
          if (!p.wasCanceled && p.getDistance() < TAP_SLOP && p.getDuration() < 900) this.choose(v.id)
        })
        card.on('pointerover', () => { if (!this.busy) card.setScale(1.04) })
        card.on('pointerout', () => card.setScale(1))
      }
      if (animate) {
        card.setAlpha(0).setY(CARD.y + 16)
        this.tweens.add({ targets: card, alpha: 1, y: CARD.y, duration: 240, delay: i * 50, ease: 'Back.easeOut' })
      }
      this.cards.push(card)
    })

    this.preview.forEach(o => o.destroy()); this.preview = []
    const rest = this.state.queue.slice(SELECTABLE)
    const g = this.add.graphics().setDepth(5)
    this.preview.push(g)
    rest.slice(0, PREVIEW_MAX).forEach((v, i) => {
      const x = QUEUE_PANEL.x + 24 + i * 29, y = PANEL_Y + 34
      g.fillStyle(0x2a190c); g.fillCircle(x, y, 13)
      g.lineStyle(v.kind === 'jarl' ? 3.5 : 2.5, v.kind === 'scout' ? SCOUT_COLOR : v.color ? COLORS[v.color] : GOLD); g.strokeCircle(x, y, 13)
      const asset = assetFor(v)
      if (asset && this.textures.exists(portraitKey(asset))) {
        const head = this.add.image(x, y + 1, portraitKey(asset)).setDepth(6)
        head.setScale(34 / head.width)
        const m = this.make.graphics({}, false)
        m.fillStyle(0xffffff); m.fillCircle(x, y, 12)
        head.setMask(m.createGeometryMask())
        head.once(Phaser.GameObjects.Events.DESTROY, () => m.destroy())
        this.preview.push(head)
      } else drawHead(g, lookOf(v), 9, x, y + 1)
      if (v.kind !== 'scout') this.mark(v.color, x + 10, y + 9, 5).forEach(m => this.preview.push(m.setDepth(7)))
    })
    if (rest.length > PREVIEW_MAX) this.preview.push(this.add.text(QUEUE_PANEL.x + QUEUE_PANEL.w - 10, PANEL_Y + 34, `+${rest.length - PREVIEW_MAX}`, cartoonText(12)).setOrigin(1, 0.5).setDepth(6))
    if (rest.length === 0) this.preview.push(this.add.text(QUEUE_PANEL.x + QUEUE_PANEL.w / 2, PANEL_Y + 34, this.state.queue.length ? t('scene.lastVikings') : t('scene.emptyQueue'), cartoonText(11, '#e8d6bb')).setOrigin(0.5).setDepth(6))

    const seated = new Set(this.state.waiting.map(v => v.id))
    // Keep the victory crew on deck; everyone else not seated has left.
    this.actors.forEach((a, id) => { if (!seated.has(id) && !id.startsWith('cheer-')) { a.destroy(); this.actors.delete(id) } })
    this.state.waiting.forEach(v => {
      let a = this.actors.get(v.id)
      if (!a) { a = this.makeActor(v); this.actors.set(v.id, a) }
      const { x, y, s: scale } = this.seatFor(this.state.waiting, v.id)!
      this.tweens.killTweensOf(a)
      if (animate) this.tweens.add({ targets: a, x, y: y - 6, scale, duration: 240 })
      else a.setPosition(x, y - 6).setScale(scale)
      this.setBadge(a, v.collectedCount, v.capacity)
    })
    this.drawSlots()
  }

  // ---------- Moves ----------

  private choose(vikingId: string) {
    if (this.busy || this.state.status !== 'playing') return
    const before = this.state
    const after = selectViking(before, vikingId)
    if (after === before) return
    // The outcome is decided here; the animation only replays the engine's events.
    this.history = [before]
    this.state = after
    this.busy = true
    this.clearHint()
    this.cards.forEach(c => c.disableInteractive().setScale(1))
    this.notify()
    const gen = this.generation
    sfx.click()
    this.playEvents(before, after.events, gen).then(async () => {
      if (gen !== this.generation) return
      if (after.status === 'won') {
        victory(this); sfx.win(); haptics.win(); this.celebrate()
        await this.delay(1100)
      } else if (after.status === 'lost') {
        sfx.lose(); haptics.lose()
        this.actors.forEach(a => this.animate(a, 'fail'))
        await this.delay(900)
      }
      if (gen !== this.generation) return
      this.busy = false
      this.layout(true)
      this.notify()
    })
  }

  /** The three team vikings jump onto the longship and cheer; anyone still seated cheers too. */
  private celebrate() {
    this.actors.forEach(a => this.animate(a, 'victory'))
    ;(['red', 'blue', 'yellow'] as LootColor[]).forEach((color, i) => {
      const asset = teamAsset(color)
      if (!hasSheet(this, asset)) return
      const crew = this.makeActor({ id: `cheer-${i}`, kind: 'normal', color, capacity: 2, collectedCount: 0, ship: 0 })
      crew.setPosition(BOARD.x - 40 + i * 40, BOARD.y + 30).setScale(0.3).setAlpha(0).setDepth(31)
      this.actors.set(`cheer-${i}`, crew)
      this.tweens.add({
        targets: crew, y: BOARD.y - 4, scale: 0.85, alpha: 1, duration: 260, delay: i * 90, ease: 'Back.easeOut',
        onComplete: () => this.animate(crew, 'victory'),
      })
    })
  }

  private tween(config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise(resolve => this.tweens.add({ ...config, onComplete: () => resolve() }))
  }
  private delay(ms: number) { return new Promise<void>(r => this.time.delayedCall(ms, r)) }

  /** Run with a little hop in the step, facing the direction of travel. */
  private async runTo(actor: Sprite, x: number, y: number, scale = 1) {
    const rig = actor.getByName('rig') as Sprite
    const dist = Phaser.Math.Distance.Between(actor.x, actor.y, x, y)
    const duration = Phaser.Math.Clamp(dist * 1.1, 160, 520)
    const size = (rig.getData('size') as number | undefined) ?? 1
    if (Math.abs(x - actor.x) > 4) rig.scaleX = (x < actor.x ? -1 : 1) * size
    const sprite = !!rig.getByName('body')
    const carrying = (actor.getByName('carry') as Sprite).length > 0
    this.animate(actor, carrying ? 'carry' : 'run')
    // The rendered run cycle already bobs, so the hop is smaller for sprites.
    const hop = this.tweens.add({ targets: rig, y: sprite ? -2 : -5, duration: 90, yoyo: true, repeat: -1 })
    await this.tween({ targets: actor, x, y, scale, duration, ease: 'Sine.easeInOut' })
    hop.stop(); rig.y = 0
    this.animate(actor, 'idle')
  }

  private async playEvents(before: GameState, events: GameEvent[], gen: number) {
    let view = before
    const seatOf = (id: string) => view.waiting.findIndex(w => w.id === id)
    const setLoot = (id: string, patch: Partial<GameState['loot'][number]>) => {
      view = { ...view, loot: view.loot.map(l => (l.id === id ? { ...l, ...patch } : l)) }
    }
    const bumpWaiter = (actor: Sprite, vikingId: string) => {
      const seat = seatOf(vikingId)
      if (seat < 0) return
      view = { ...view, waiting: view.waiting.map(v => (v.id === vikingId ? { ...v, collectedCount: v.collectedCount + 1 } : v)) }
      this.setBadge(actor, view.waiting[seat].collectedCount, view.waiting[seat].capacity)
    }
    for (let i = 0; i < events.length; i++) {
      if (gen !== this.generation) return
      const e = events[i]

      // Board-only events (no viking involved).
      if (e.type === 'crumble') {
        const target = this.lootSprites.get(e.lootId)
        setLoot(e.lootId, { collected: true })
        if (target) {
          this.lootSprites.delete(e.lootId)
          sfx.crumble()
          dustPuff(this, target.x - 12, target.y + 10); dustPuff(this, target.x + 12, target.y + 6)
          rockBits(this, target.x, target.y)
          this.tweens.add({ targets: target, scaleY: 0.2, alpha: 0, duration: 260, ease: 'Sine.easeIn', onComplete: () => target.destroy() })
        }
        this.refreshLocks(view, true)
        await this.delay(120)
        continue
      }
      if (e.type === 'reveal') {
        setLoot(e.lootId, { hidden: false })
        const target = this.lootSprites.get(e.lootId)
        if (target) {
          const old = target.getByName('art') as Sprite | null
          const tarp = (old?.getByName('img') as Phaser.GameObjects.Image | null)
          if (tarp) {
            // Lift the tarp off as a separate image so the loot underneath appears right away.
            const fly = this.add.image(target.x, target.y + 22 * target.scale, LOOT_KEY, tarp.frame.name)
              .setOrigin(tarp.originX, tarp.originY).setScale(tarp.scaleX * target.scale).setDepth(35)
            this.tweens.add({ targets: fly, y: fly.y - 46, x: fly.x + 26, angle: 35, alpha: 0, duration: 420, ease: 'Sine.easeOut', onComplete: () => fly.destroy() })
          }
          old?.destroy()
          target.addAt(this.makeLootGraphic(target.getData('kind'), target.getData('color')), 0)
          sfx.reveal()
          coinBurst(this, target.x, target.y - 6, target.getData('color'))
          this.tweens.add({ targets: target, scale: { from: target.scale * 0.6, to: target.scale }, duration: 260, ease: 'Back.easeOut' })
        }
        this.refreshLocks(view, false)
        continue
      }
      if (e.type === 'unlock') {
        // The padlock springs open and drops off the chest.
        const target = this.lootSprites.get(e.lootId)
        const pad = target?.getByName('padlock') as Phaser.GameObjects.Image | null
        if (target && pad) {
          // The key(s) fly from where they were plundered into the padlock, so it is clear which key opens which chest.
          const keys = this.levelData.loot.filter(l => this.levelData.loot.find(c => c.id === e.lootId)?.lockedBy?.includes(l.id))
          await Promise.all(keys.map((k, i) => this.flyKey(k.at, k.color!, target, i * 90)))
          sfx.unlock()
          sparkle(this, target.x, target.y - 4)
          await this.tween({ targets: pad, y: pad.y - 8, angle: -18, duration: 140, ease: 'Back.easeOut' })
          this.tweens.add({ targets: pad, y: pad.y + 30, alpha: 0, angle: 40, duration: 320, ease: 'Sine.easeIn', onComplete: () => pad.destroy() })
        }
        this.refreshLocks(view, true)
        await this.delay(120)
        continue
      }
      if (e.type === 'thaw') {
        setLoot(e.lootId, { frozenLeft: 0 })
        const target = this.lootSprites.get(e.lootId)
        if (target) {
          sfx.thaw()
          iceShards(this, target.x, target.y - 4)
          const ice = target.getByName('ice') as Phaser.GameObjects.Image | null
          ;(target.getByName('iceText') as Phaser.GameObjects.Text | null)?.destroy()
          if (ice) this.tweens.add({ targets: ice, alpha: 0, scaleX: ice.scaleX * 1.15, scaleY: ice.scaleY * 0.7, duration: 300, onComplete: () => ice.destroy() })
          this.tweens.add({ targets: target, scale: target.scale * 1.1, yoyo: true, duration: 150 })
        }
        this.refreshLocks(view, true)
        await this.delay(160)
        continue
      }

      // Does the same viking keep raiding after this event (looking past board-only events)?
      const nextOwn = events.slice(i + 1).find(n => 'vikingId' in n)
      const continues = !!nextOwn && nextOwn.vikingId === e.vikingId &&
        (nextOwn.type === 'collect' || nextOwn.type === 'hit' || nextOwn.type === 'return' || nextOwn.type === 'color')

      if (e.type === 'dispatch') {
        let dripped = false
        view = { ...view, loot: view.loot.map(l => {
          if (l.frozenLeft <= 1) return l
          const t = this.lootSprites.get(l.id)?.getByName('iceText') as Phaser.GameObjects.Text | null
          if (t) { t.setText(`❄${l.frozenLeft - 1}`); this.tweens.add({ targets: t, scale: { from: 1.4, to: 1 }, duration: 220 }); dripped = true }
          return { ...l, frozenLeft: l.frozenLeft - 1 }
        }) }
        if (dripped) sfx.drip()
        const index = view.queue.findIndex(v => v.id === e.vikingId)
        const card = this.cards[index]
        if (card) this.tweens.add({ targets: card, scale: 0.88, alpha: 0.3, duration: 160 })
        const actor = this.makeActor(view.queue[index]).setPosition(cardX(index), CARD.y - 10).setScale(0.4)
        this.actors.set(e.vikingId, actor)
        sfx.dispatch(); haptics.dispatch()
        await this.tween({ targets: actor, scale: 1, y: CARD.y - 46, duration: 180, ease: 'Back.easeOut' })
        dustPuff(this, actor.x, actor.y + 28)
        continue
      }
      const actor = this.actors.get(e.vikingId)
      if (!actor) continue

      if (e.type === 'scout') {
        await this.runTo(actor, 180, ISLAND_CY + 40)
        sfx.scout()
        this.animate(actor, 'look')
        await this.tween({ targets: actor, y: actor.y - 6, duration: 260, yoyo: true })
        await this.delay(260)
      } else if (e.type === 'color') {
        view = { ...view, waiting: view.waiting.map(v => (v.id === e.vikingId ? { ...v, color: e.color } : v)) }
        this.recolor(actor, e.color)
        await this.delay(120)
      } else if (e.type === 'hit' || e.type === 'collect') {
        const target = this.lootSprites.get(e.lootId)!
        await this.runTo(actor, target.x - 20, target.y + 4)
        const rig = actor.getByName('rig') as Sprite
        rig.scaleX = Math.abs(rig.scaleX) // face the loot
        // plunder swing; the axe lands about 60% into the attack animation
        this.time.delayedCall(rig.getByName('body') ? 320 : 90, () => { sfx.chop(); woodChips(this, target.x, target.y + 4) })
        if (rig.getByName('body')) await this.animate(actor, 'attack')
        else await this.tween({ targets: rig, angle: 20, duration: 90, yoyo: true })
        this.animate(actor, 'idle')
        if (e.type === 'hit') {
          // The house is broken open but still standing; the next hit takes the loot.
          const left = view.loot.find(l => l.id === e.lootId)!.hitsLeft - 1
          setLoot(e.lootId, { hitsLeft: left })
          this.markOpened(target)
          floatText(this, target.x, target.y - 22, `${left} kvar`, target.getData('color'))
        } else {
          setLoot(e.lootId, { collected: true })
          this.lootSprites.delete(e.lootId)
          this.tweens.add({ targets: target, scale: 0, alpha: 0, y: target.y - 24, duration: 220, onComplete: () => target.destroy() })
          sfx.coin()
          coinBurst(this, target.x, target.y - 4, target.getData('color'))
          floatText(this, target.x, target.y - 22, '+1', target.getData('color'))
          this.refreshLocks(view, true)
          // carry a small copy of the loot above the head
          const carry = actor.getByName('carry') as Sprite
          carry.add(this.makeLootGraphic(target.getData('kind'), target.getData('color')).setScale(0.32).setPosition(0, -carry.length * 13))
        }
        bumpWaiter(actor, e.vikingId)
        await this.delay(80)
        if (!continues) {
          const home = this.seatFor(view.waiting, e.vikingId) ?? { x: BOARD.x, y: BOARD.y + 6, s: 0.9 }
          await this.runTo(actor, home.x, home.y - 6, home.s)
        }
      } else if (e.type === 'return') {
        if (e.fromWaiting) {
          view = { ...view, waiting: view.waiting.filter(v => v.id !== e.vikingId) }
          this.drawSlots(view.waiting)
        }
        this.setBadge(actor, null)
        await this.runTo(actor, BOARD.x, BOARD.y, 0.9)
        await this.tween({ targets: actor, y: BOARD.y + 8, scale: 0.3, alpha: 0, duration: 260, ease: 'Sine.easeIn' })
        actor.destroy()
        this.actors.delete(e.vikingId)
      } else if (e.type === 'wait') {
        const { x, y, s: scale } = this.seatPos(e.ship, e.slot)
        await this.runTo(actor, x, y - 6, scale)
        sfx.wait()
        const seated = this.state.waiting.find(v => v.id === e.vikingId)
        if (seated) {
          this.setBadge(actor, seated.collectedCount, seated.capacity)
          view = { ...view, waiting: [...view.waiting, seated] }
        }
        this.drawSlots(view.waiting)
      } else if (e.type === 'overflow') {
        // The viking has just taken the last seat (the preceding `wait` event put it there).
        sfx.overflow(); haptics.overflow()
        this.cameras.main.shake(260, 0.012)
        this.cameras.main.flash(220, 160, 30, 20)
        await this.tween({ targets: actor, angle: { from: -12, to: 12 }, duration: 70, yoyo: true, repeat: 3 })
      }
    }
  }

  private notify() {
    const s = this.state
    this.onUpdate?.({
      busy: this.busy,
      canUndo: this.history.length > 0 && s.status !== 'won',
      waits: s.waits,
      status: s.status,
      lossReason: s.lossReason,
      remaining: s.loot.filter(l => l.kind === 'loot' && !l.collected).length,
      queue: s.queue.length,
      waiting: mainSeats(s),
      moves: s.moves,
    })
  }
}
