import Phaser from 'phaser'
import { levels } from './levels'
import {
  createGame, selectViking, isAvailable, SELECTABLE, WAITING_SLOTS, CAPACITY,
  type GameEvent, type GameState, type LootColor, type LossReason, type GameStatus,
} from './engine'
import {
  COLORS, GOLD, INK, shade, cartoonText, drawLoot, drawChibi, drawPortrait, drawHead,
  drawTree, drawRock, drawShip, drawPanel, drawTab, type LootKind,
} from './art'
import {
  preloadAssets, createAnims, hasViking, hasLoot, hasShip, vikingAsset, lootAsset, shipAsset, lootFrame,
  vikingKey, vikingAnimKey, portraitKey, LOOT_KEY, SHIP_KEY, type VikingAnim,
} from './assets'
import { createFxTextures, coinBurst, woodChips, dustPuff, floatText, victory } from './fx'
import { sfx } from './sfx'

export type RaidUpdate = {
  level: number
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
const PREVIEW_MAX = 6
const CARD = { y: 584, w: 108, h: 100 }
const cardX = (i: number) => 62 + i * 118
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

export class RaidScene extends Phaser.Scene {
  private state!: GameState
  private level = 0
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
  private onUpdate?: (u: RaidUpdate) => void

  constructor() { super('Raid') }

  preload() { preloadAssets(this) }

  create() {
    // The game canvas is 720x1280; zoom 2 keeps all coordinates in the 360x640 layout but renders sharper.
    this.cameras.main.setZoom(2).centerOn(180, 320)
    createAnims(this)
    createFxTextures(this)
    this.drawEnvironment()
    this.ready = true
    this.reset(this.level)
  }

  setUpdate(fn: (u: RaidUpdate) => void) { this.onUpdate = fn }

  reset(index: number) {
    // Before create() has run (assets still loading) just remember the level; create() will draw it.
    if (!this.ready) { this.level = index; return }
    this.generation++
    this.tweens.killAll()
    this.busy = false
    this.level = Phaser.Math.Clamp(index, 0, levels.length - 1)
    const data = levels[this.level]
    this.state = createGame(data.loot, data.queue)
    this.lootSprites.forEach(s => s.destroy()); this.lootSprites.clear()
    this.actors.forEach(s => s.destroy()); this.actors.clear()
    this.title?.setText(`${this.level + 1}. ${data.name}`)
    this.drawLootSprites()
    this.layout(false)
    this.notify()
  }

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
    if (hasShip(this)) {
      const sh = shipAsset()!
      this.add.sprite(SHIP.x, SHIP.y - 2, SHIP_KEY).setOrigin(sh.originX, sh.originY).setScale(SHIP_W / sh.frameWidth).play('ship-bob')
    } else drawShip(g, SHIP.x, SHIP.y)
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
    this.add.text(QUEUE_PANEL.x + QUEUE_PANEL.w / 2, PANEL_Y - 1, 'VIKINGAKÖ', cartoonText(10)).setOrigin(0.5)
    this.waitTab = this.add.graphics()
    this.add.text(WAIT_PANEL.x + WAIT_PANEL.w / 2, PANEL_Y - 1, 'VÄNTPLATSER', cartoonText(10)).setOrigin(0.5).setDepth(1)
    this.slotsGfx = this.add.graphics()
    this.warning = this.add.text(180, 436, '', { ...cartoonText(11), padding: { x: 8, y: 3 } }).setOrigin(0.5).setDepth(40)
  }

  private drawSlots(used = this.state.waiting.length) {
    // Filling the last slot loses: one seated viking is a caution, two is the danger zone.
    const risk = used >= WAITING_SLOTS - 1 ? 0xe0392b : used >= 1 ? 0xe8a21b : null
    const g = this.slotsGfx!
    g.clear()
    for (let i = 0; i < WAITING_SLOTS; i++) {
      const { x, y } = slotPos(i)
      g.fillStyle(0x2a190c); g.fillCircle(x, y, 19)
      g.lineStyle(3, i < used && risk ? risk : 0xc9925a, i < used ? 1 : 0.7); g.strokeCircle(x, y, 19)
    }
    const t = this.waitTab!
    t.clear(); drawTab(t, WAIT_PANEL.x + WAIT_PANEL.w / 2, PANEL_Y - 10, 104, risk ?? 0x8a5a33)
    const w = this.warning!
    if (used >= WAITING_SLOTS) w.setText('💀 Skeppet är fullt!').setBackgroundColor('#a3261bee')
    else if (used === WAITING_SLOTS - 1) w.setText('🔥 Sista platsen – nästa viking utan byte förlorar!').setBackgroundColor('#a3261bee')
    else if (used >= 1) w.setText('⚠️ En viking väntar – en säker plats kvar').setBackgroundColor('#9a6a10ee')
    else w.setText('').setBackgroundColor('#00000000')
  }

  // ---------- Loot ----------

  private lootPos(at: [number, number]) { return { x: 54 + at[0] * 84, y: 112 + at[1] * 84 + this.lootOffsetY } }

  /** One loot object: a rendered sprite with a ground shadow, or the code-drawn fallback. */
  private makeLootGraphic(kind: LootKind, color: LootColor): Sprite {
    const frame = lootFrame(kind, color)
    if (hasLoot(this) && frame !== undefined) {
      const a = lootAsset()!
      const shadow = this.add.ellipse(0, 22, 54, 15, 0x000000, 0.22)
      const img = this.add.image(0, 22, LOOT_KEY, frame).setOrigin(a.originX, a.originY).setScale(LOOT_W / a.frameWidth).setName('img')
      return this.add.container(0, 0, [shadow, img]).setName('art')
    }
    const g = this.add.graphics()
    drawLoot(g, kind, color)
    return this.add.container(0, 0, [g]).setName('art')
  }

  private drawLootSprites() {
    const placed = levels[this.level].loot
    const rows = placed.map(p => p.at[1])
    this.lootOffsetY = ISLAND_CY - 6 - (112 + ((Math.min(...rows) + Math.max(...rows)) / 2) * 84)
    let minGap = Infinity
    placed.forEach(a => placed.forEach(b => {
      if (a !== b && a.at[0] === b.at[0]) minGap = Math.min(minGap, Math.abs(a.at[1] - b.at[1]) * 84)
    }))
    const scale = Phaser.Math.Clamp(minGap / 60, 0.68, 1)
    // Back rows first so blockers stand in front of what they block.
    ;[...placed].sort((a, b) => a.at[1] - b.at[1]).forEach((p, depth) => {
      const { x, y } = this.lootPos(p.at)
      const kind = p.kind ?? kindFor(p.id)
      const art = this.makeLootGraphic(kind, p.color)
      const shadeG = this.add.graphics().setName('shade')
      // Sprites are darkened with a tint instead (see refreshLocks); the box is only for drawn art.
      if (!art.getByName('img')) { shadeG.fillStyle(0x0b1a22, 0.55); shadeG.fillRoundedRect(-33, -36, 66, 62, 12) }
      const lock = this.add.graphics().setName('lock')
      lock.lineStyle(3, GOLD); lock.beginPath(); lock.arc(22, -30, 5, Math.PI, 0); lock.strokePath()
      lock.fillStyle(GOLD); lock.fillRoundedRect(14, -30, 16, 13, 3)
      lock.fillStyle(INK); lock.fillRect(21, -26, 2, 5)
      const c = this.add.container(x, y, [art, shadeG, lock]).setScale(scale).setDepth(2 + depth * 0.01)
      c.setData('kind', kind).setData('color', p.color)
      this.lootSprites.set(p.id, c)
    })
    this.refreshLocks(this.state, false)
  }

  private refreshLocks(state: GameState, animate: boolean) {
    for (const item of state.loot) {
      const c = this.lootSprites.get(item.id)
      if (!c || item.collected) continue
      const open = isAvailable(state, item)
      const img = (c.getByName('art') as Sprite | null)?.getByName('img') as Phaser.GameObjects.Image | null
      if (img) { if (open) img.clearTint(); else img.setTint(0x6d7488) }
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
  private makeActor(color: LootColor): Sprite {
    let parts: Phaser.GameObjects.GameObject[]
    if (hasViking(this, color)) {
      const v = vikingAsset(color)!
      const shadow = this.add.ellipse(0, 29, 34, 10, 0x000000, 0.22)
      const body = this.add.sprite(0, 29, vikingKey(color)).setOrigin(v.originX, v.originY).setScale(VIKING_W / v.frameWidth).setName('body')
      body.play(vikingAnimKey(color, 'idle'))
      parts = [shadow, body]
    } else {
      const g = this.add.graphics()
      drawChibi(g, color)
      parts = [g]
    }
    const rig = this.add.container(0, 0, parts).setName('rig')
    rig.setData('color', color)
    const carry = this.add.container(0, -36).setName('carry')
    const badge = this.add.text(0, 34, '', { ...cartoonText(14), padding: { x: 4, y: 0 } }).setOrigin(0.5).setName('badge').setVisible(false)
    return this.add.container(0, 0, [rig, carry, badge]).setDepth(30)
  }

  /** Play one of the rendered animations (no-op for the drawn fallback). Resolves when a one-shot ends. */
  private animate(actor: Sprite, anim: VikingAnim): Promise<void> {
    const rig = actor.getByName('rig') as Sprite
    const body = rig.getByName('body') as Phaser.GameObjects.Sprite | null
    if (!body) return Promise.resolve()
    const key = vikingAnimKey(rig.getData('color'), anim)
    if (anim !== 'attack') { body.play(key, true); return Promise.resolve() }
    return new Promise(res => { body.play(key); body.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => res()) })
  }

  private setBadge(actor: Sprite, collected: number | null) {
    const b = actor.getByName('badge') as Phaser.GameObjects.Text
    if (collected === null) b.setVisible(false)
    else b.setText(`${collected}/${CAPACITY}`).setBackgroundColor('#3b2414cc').setVisible(true)
  }

  private makeCard(color: LootColor, index: number): Sprite {
    const c = COLORS[color]
    const { w, h } = CARD
    const g = this.add.graphics()
    g.fillStyle(0x000000, 0.3); g.fillRoundedRect(-w / 2 + 2, -h / 2 + 5, w, h, 16)
    g.fillStyle(0xf3dfb4); g.fillRoundedRect(-w / 2, -h / 2, w, h, 16)
    g.fillStyle(shade(c, -0.25)); g.fillRoundedRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10, 12)
    g.fillStyle(c); g.fillRoundedRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 26, 12)
    g.fillStyle(shade(c, 0.35), 0.5); g.fillEllipse(-14, -h / 2 + 22, 50, 22)
    let portrait: Phaser.GameObjects.Graphics | Phaser.GameObjects.Image
    if (this.textures.exists(portraitKey(color))) {
      portrait = this.add.image(0, -2, portraitKey(color))
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
    const card = this.add.container(cardX(index), CARD.y, [g, portrait]).setSize(w, h).setDepth(20)
    card.once(Phaser.GameObjects.Events.DESTROY, () => mask.destroy())
    return card
  }

  /** Rebuild cards, the queue preview and seated vikings from the current state. */
  private layout(animate: boolean) {
    const playing = this.state.status === 'playing'
    this.cards.forEach(c => c.destroy())
    this.cards = []
    this.state.queue.slice(0, SELECTABLE).forEach((v, i) => {
      const card = this.makeCard(v.color, i)
      if (playing) {
        card.setInteractive({ useHandCursor: true })
        card.on('pointerdown', () => this.choose(v.id))
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
      g.lineStyle(2.5, COLORS[v.color]); g.strokeCircle(x, y, 13)
      if (this.textures.exists(portraitKey(v.color))) {
        const head = this.add.image(x, y + 1, portraitKey(v.color)).setDepth(6)
        head.setScale(34 / head.width)
        const m = this.make.graphics({}, false)
        m.fillStyle(0xffffff); m.fillCircle(x, y, 12)
        head.setMask(m.createGeometryMask())
        head.once(Phaser.GameObjects.Events.DESTROY, () => m.destroy())
        this.preview.push(head)
      } else drawHead(g, v.color, 9, x, y + 1)
    })
    if (rest.length > PREVIEW_MAX) this.preview.push(this.add.text(QUEUE_PANEL.x + QUEUE_PANEL.w - 10, PANEL_Y + 34, `+${rest.length - PREVIEW_MAX}`, cartoonText(12)).setOrigin(1, 0.5).setDepth(6))
    if (rest.length === 0) this.preview.push(this.add.text(QUEUE_PANEL.x + QUEUE_PANEL.w / 2, PANEL_Y + 34, this.state.queue.length ? 'Sista vikingarna!' : 'Kön är tom', cartoonText(11, '#e8d6bb')).setOrigin(0.5).setDepth(6))

    const seated = new Set(this.state.waiting.map(v => v.id))
    this.actors.forEach((a, id) => { if (!seated.has(id)) { a.destroy(); this.actors.delete(id) } })
    this.state.waiting.forEach((v, i) => {
      let a = this.actors.get(v.id)
      if (!a) { a = this.makeActor(v.color); this.actors.set(v.id, a) }
      const { x, y } = slotPos(i)
      this.tweens.killTweensOf(a)
      if (animate) this.tweens.add({ targets: a, x, y: y - 6, scale: SLOT_SCALE, duration: 240 })
      else a.setPosition(x, y - 6).setScale(SLOT_SCALE)
      this.setBadge(a, v.collectedCount)
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
    this.state = after
    this.busy = true
    this.cards.forEach(c => c.disableInteractive().setScale(1))
    const gen = this.generation
    sfx.click()
    this.playEvents(before, after.events, gen).then(async () => {
      if (gen !== this.generation) return
      if (after.status === 'won') { victory(this); sfx.win(); await this.delay(650) }
      else if (after.status === 'lost') { sfx.lose(); await this.delay(350) }
      if (gen !== this.generation) return
      this.busy = false
      this.layout(true)
      this.notify()
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
    if (Math.abs(x - actor.x) > 4) rig.scaleX = x < actor.x ? -1 : 1
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
    for (let i = 0; i < events.length; i++) {
      if (gen !== this.generation) return
      const e = events[i]
      const next = events[i + 1]
      const continues = next && next.vikingId === e.vikingId && (next.type === 'collect' || next.type === 'return')

      if (e.type === 'dispatch') {
        const index = view.queue.findIndex(v => v.id === e.vikingId)
        const card = this.cards[index]
        if (card) this.tweens.add({ targets: card, scale: 0.88, alpha: 0.3, duration: 160 })
        const actor = this.makeActor(view.queue[index].color).setPosition(cardX(index), CARD.y - 10).setScale(0.4)
        this.actors.set(e.vikingId, actor)
        sfx.dispatch()
        await this.tween({ targets: actor, scale: 1, y: CARD.y - 46, duration: 180, ease: 'Back.easeOut' })
        dustPuff(this, actor.x, actor.y + 28)
        continue
      }
      const actor = this.actors.get(e.vikingId)
      if (!actor) continue

      if (e.type === 'collect') {
        const target = this.lootSprites.get(e.lootId)!
        await this.runTo(actor, target.x - 20, target.y + 4)
        const rig = actor.getByName('rig') as Sprite
        rig.scaleX = 1
        // plunder swing; the axe lands about 60% into the attack animation
        this.time.delayedCall(rig.getByName('body') ? 320 : 90, () => { sfx.chop(); woodChips(this, target.x, target.y + 4) })
        if (rig.getByName('body')) await this.animate(actor, 'attack')
        else await this.tween({ targets: rig, angle: 20, duration: 90, yoyo: true })
        this.animate(actor, 'idle')
        view = { ...view, loot: view.loot.map(l => (l.id === e.lootId ? { ...l, collected: true } : l)) }
        this.lootSprites.delete(e.lootId)
        this.tweens.add({ targets: target, scale: 0, alpha: 0, y: target.y - 24, duration: 220, onComplete: () => target.destroy() })
        sfx.coin()
        coinBurst(this, target.x, target.y - 4, target.getData('color'))
        floatText(this, target.x, target.y - 22, '+1', target.getData('color'))
        this.refreshLocks(view, true)
        // carry a small copy of the loot above the head
        const carry = actor.getByName('carry') as Sprite
        carry.add(this.makeLootGraphic(target.getData('kind'), target.getData('color')).setScale(0.32).setPosition(0, -carry.length * 13))
        const seat = seatOf(e.vikingId)
        if (seat >= 0) {
          view = { ...view, waiting: view.waiting.map(v => (v.id === e.vikingId ? { ...v, collectedCount: v.collectedCount + 1 } : v)) }
          this.setBadge(actor, view.waiting[seat].collectedCount)
        }
        await this.delay(80)
        if (!continues) {
          const home = seat >= 0 ? { ...slotPos(seat), s: SLOT_SCALE } : { x: BOARD.x, y: BOARD.y + 6, s: 0.9 }
          await this.runTo(actor, home.x, home.y - 6, home.s)
        }
      } else if (e.type === 'return') {
        if (e.fromWaiting) {
          view = { ...view, waiting: view.waiting.filter(v => v.id !== e.vikingId) }
          this.drawSlots(view.waiting.length)
        }
        this.setBadge(actor, null)
        await this.runTo(actor, BOARD.x, BOARD.y, 0.9)
        await this.tween({ targets: actor, y: BOARD.y + 8, scale: 0.3, alpha: 0, duration: 260, ease: 'Sine.easeIn' })
        actor.destroy()
        this.actors.delete(e.vikingId)
      } else if (e.type === 'wait') {
        const { x, y } = slotPos(e.slot)
        await this.runTo(actor, x, y - 6, SLOT_SCALE)
        sfx.wait()
        const seated = this.state.waiting.find(v => v.id === e.vikingId)
        if (seated) this.setBadge(actor, seated.collectedCount)
        this.drawSlots()
      } else if (e.type === 'overflow') {
        // The viking has just taken the last seat (the preceding `wait` event put it there).
        sfx.overflow()
        this.cameras.main.shake(260, 0.012)
        this.cameras.main.flash(220, 160, 30, 20)
        await this.tween({ targets: actor, angle: { from: -12, to: 12 }, duration: 70, yoyo: true, repeat: 3 })
      }
    }
  }

  private notify() {
    const s = this.state
    this.onUpdate?.({
      level: this.level,
      status: s.status,
      lossReason: s.lossReason,
      remaining: s.loot.filter(l => !l.collected).length,
      queue: s.queue.length,
      waiting: s.waiting.length,
      moves: s.moves,
    })
  }
}
