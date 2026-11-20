import Phaser from 'phaser'
import { levels } from './levels'
import {
  createGame, selectViking, isAvailable, SELECTABLE, WAITING_SLOTS,
  type GameEvent, type GameState, type LootColor, type LossReason, type GameStatus,
} from './engine'

export type RaidUpdate = {
  level: number
  status: GameStatus
  lossReason: LossReason | null
  remaining: number
  queue: number
  waiting: number
  moves: number
}

const palette: Record<LootColor, number> = { red: 0xd75a45, blue: 0x429bd5, yellow: 0xe7b84c }
const dark: Record<LootColor, number> = { red: 0x8f3427, blue: 0x24618c, yellow: 0x9c7423 }
const emoji: Record<LootColor, string> = { red: '🧰', blue: '💎', yellow: '🪙' }
const font = 'Arial'

// Layout (360×640 canvas)
const SLOT_Y = 452
const slotX = (i: number) => 100 + i * 80
const PICK_Y = 562
const pickX = (i: number) => 92 + i * 88
const PREVIEW_Y = 615
const GANGWAY = { x: 180, y: 410 }

type Sprite = Phaser.GameObjects.Container

export class RaidScene extends Phaser.Scene {
  private state!: GameState
  private level = 0
  private busy = false
  private generation = 0
  private lootSprites = new Map<string, Sprite>()
  private vikingSprites = new Map<string, Sprite>()
  private slotFrames: Phaser.GameObjects.Graphics[] = []
  private warning?: Phaser.GameObjects.Text
  private title?: Phaser.GameObjects.Text
  private previewLabel?: Phaser.GameObjects.Text
  private onUpdate?: (u: RaidUpdate) => void

  constructor() { super('Raid') }

  create() {
    this.cameras.main.setBackgroundColor('#193a4b')
    this.drawEnvironment()
    this.reset(this.level)
  }

  setUpdate(fn: (u: RaidUpdate) => void) { this.onUpdate = fn }

  reset(index: number) {
    if (!this.sys.isActive()) { this.level = index; return }
    this.generation++
    this.tweens.killAll()
    this.busy = false
    this.level = Phaser.Math.Clamp(index, 0, levels.length - 1)
    const data = levels[this.level]
    this.state = createGame(data.loot, data.queue)
    this.lootSprites.forEach(s => s.destroy()); this.lootSprites.clear()
    this.vikingSprites.forEach(s => s.destroy()); this.vikingSprites.clear()
    this.title?.setText(`⚔️ ${this.level + 1}. ${data.name}`)
    this.drawLoot()
    this.layoutVikings(false)
    this.notify()
  }

  // ---------- Static scenery ----------

  private drawEnvironment() {
    const g = this.add.graphics()
    g.fillStyle(0x325a68); g.fillRect(0, 0, 360, 640)
    g.fillStyle(0x527f62); g.fillRoundedRect(10, 62, 340, 322, 22)
    g.fillStyle(0x68946e); g.fillRoundedRect(22, 74, 316, 298, 14)
    // Sea + longship
    g.fillStyle(0x2c5b7a); g.fillRect(0, 392, 360, 118)
    g.fillStyle(0x91633d); g.fillRoundedRect(48, 418, 264, 70, 30)
    g.fillStyle(0xb98b54); g.fillRect(70, 432, 220, 6); g.fillRect(70, 470, 220, 6)
    g.lineStyle(4, 0xe5c68e); g.strokeRoundedRect(48, 418, 264, 70, 30)
    g.fillStyle(0xe5c68e); g.fillTriangle(312, 440, 340, 402, 322, 452); g.fillTriangle(48, 440, 22, 402, 38, 452)
    // Dock
    g.fillStyle(0x6b4a2e); g.fillRect(0, 510, 360, 130)
    g.fillStyle(0x7d5735); for (let y = 516; y < 640; y += 22) g.fillRect(0, y, 360, 18)
    for (let i = 0; i < WAITING_SLOTS; i++) this.slotFrames.push(this.add.graphics())
    this.title = this.add.text(180, 32, '', { fontFamily: font, fontSize: '24px', fontStyle: 'bold', color: '#fff1ce' }).setOrigin(0.5)
    this.add.text(180, 500, 'VÄNTPLATSER', { fontFamily: font, fontSize: '11px', color: '#d9edf5' }).setOrigin(0.5).setAlpha(0.8)
    this.add.text(14, 522, 'VÄLJ VIKING', { fontFamily: font, fontSize: '11px', fontStyle: 'bold', color: '#f1c76d' })
    this.previewLabel = this.add.text(14, PREVIEW_Y - 6, '', { fontFamily: font, fontSize: '11px', color: '#e8d6bb' })
    this.warning = this.add.text(180, 402, '', { fontFamily: font, fontSize: '12px', fontStyle: 'bold', color: '#fff', backgroundColor: '#00000000', padding: { x: 8, y: 3 } }).setOrigin(0.5).setDepth(5)
  }

  /** `used` lets the animation show the seat count as it unfolds, not just the final state. */
  private drawSlots(used = this.state.waiting.length) {
    const risk = used >= WAITING_SLOTS ? 0xff5a4a : used === WAITING_SLOTS - 1 ? 0xf3c14e : 0xe5c68e
    this.slotFrames.forEach((g, i) => {
      g.clear()
      g.fillStyle(0x5e3f25, 0.9); g.fillCircle(slotX(i), SLOT_Y, 27)
      g.lineStyle(3, i < used ? risk : 0xe5c68e, i < used ? 1 : 0.45); g.strokeCircle(slotX(i), SLOT_Y, 27)
    })
    const w = this.warning!
    if (used >= WAITING_SLOTS) {
      w.setText('🔥 Alla platser fulla – nästa viking utan byte förlorar!').setBackgroundColor('#a3261bdd')
    } else if (used === WAITING_SLOTS - 1) {
      w.setText('⚠️ Bara en väntplats kvar').setBackgroundColor('#8a6a14cc')
    } else {
      w.setText('').setBackgroundColor('#00000000')
    }
  }

  // ---------- Loot ----------

  private lootOffsetY = 0
  private lootPos(at: [number, number]) { return { x: 54 + at[0] * 84, y: 112 + at[1] * 84 + this.lootOffsetY } }

  private drawLoot() {
    const placed = levels[this.level].loot
    // Centre the level vertically on the island (inner area y 74–372).
    const rows = placed.map(p => p.at[1])
    this.lootOffsetY = 226 - (112 + ((Math.min(...rows) + Math.max(...rows)) / 2) * 84)
    // Shrink items on dense piles so they stay readable.
    let minGap = Infinity
    placed.forEach(a => placed.forEach(b => {
      if (a !== b && a.at[0] === b.at[0]) minGap = Math.min(minGap, Math.abs(a.at[1] - b.at[1]) * 84)
    }))
    const scale = Phaser.Math.Clamp(minGap / 62, 0.7, 1)
    // Draw back rows first so blockers sit on top of what they block.
    ;[...placed].sort((a, b) => a.at[1] - b.at[1]).forEach(p => {
      const { x, y } = this.lootPos(p.at)
      const shadow = this.add.ellipse(0, 22, 62, 20, 0x203c32, 0.35)
      const base = this.add.graphics()
      base.fillStyle(0x9a7956); base.fillRoundedRect(-31, -23, 62, 51, 10)
      base.fillStyle(0xd6b38b); base.fillRoundedRect(-31, -27, 62, 43, 10)
      base.lineStyle(4, palette[p.color]); base.strokeRoundedRect(-29, -25, 58, 40, 9)
      const icon = this.add.text(0, -7, emoji[p.color], { fontFamily: font, fontSize: '30px' }).setOrigin(0.5)
      const shade = this.add.graphics().setName('shade')
      shade.fillStyle(0x0b1a22, 0.55); shade.fillRoundedRect(-31, -27, 62, 55, 10)
      const lock = this.add.text(22, -24, '🔒', { fontFamily: font, fontSize: '15px' }).setOrigin(0.5).setName('lock')
      const c = this.add.container(x, y, [shadow, base, icon, shade, lock]).setScale(scale)
      this.lootSprites.set(p.id, c)
    })
    this.refreshLocks(this.state, false)
  }

  /** Show which items are reachable. Animated when called mid-move. */
  private refreshLocks(state: GameState, animate: boolean) {
    for (const item of state.loot) {
      const c = this.lootSprites.get(item.id)
      if (!c || item.collected) continue
      const open = isAvailable(state, item)
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

  private makeViking(color: LootColor, size: number): Sprite {
    const g = this.add.graphics()
    g.fillStyle(0x000000, 0.25); g.fillEllipse(0, size * 0.95, size * 1.6, size * 0.45)
    g.fillStyle(palette[color]); g.fillCircle(0, 0, size)
    g.lineStyle(3, 0xffffff); g.strokeCircle(0, 0, size)
    const s = size / 22
    g.fillStyle(0xf2c9a0); g.fillCircle(0, 2 * s, 11 * s) // face
    g.fillStyle(dark[color]); g.fillTriangle(-11 * s, 4 * s, 11 * s, 4 * s, 0, 17 * s) // beard
    g.fillStyle(0xa9b3ba); g.slice(0, -1 * s, 12 * s, Math.PI, 0, false); g.fillPath() // helmet
    g.fillStyle(0xfff1ce)
    g.fillTriangle(-11 * s, -4 * s, -19 * s, -15 * s, -8 * s, -9 * s)
    g.fillTriangle(11 * s, -4 * s, 19 * s, -15 * s, 8 * s, -9 * s)
    g.fillStyle(0x1d2b33); g.fillCircle(-4 * s, 2 * s, 1.6 * s); g.fillCircle(4 * s, 2 * s, 1.6 * s)
    const badge = this.add.text(0, size + 6, '', { fontFamily: font, fontSize: '11px', fontStyle: 'bold', color: '#fff', backgroundColor: '#1d2b33cc', padding: { x: 4, y: 1 } }).setOrigin(0.5).setName('badge')
    return this.add.container(0, 0, [g, badge]).setSize(size * 2.2, size * 2.2).setDepth(10)
  }

  /** Put every queued and waiting viking where the state says it belongs. */
  private layoutVikings(animate: boolean) {
    const live = new Set([...this.state.queue, ...this.state.waiting].map(v => v.id))
    this.vikingSprites.forEach((s, id) => { if (!live.has(id)) { s.destroy(); this.vikingSprites.delete(id) } })

    const playing = this.state.status === 'playing'
    const place = (id: string, color: LootColor, x: number, y: number, scale: number, alpha: number) => {
      let s = this.vikingSprites.get(id)
      if (!s) {
        s = this.makeViking(color, 22).setPosition(x, y).setScale(scale).setAlpha(0)
        this.vikingSprites.set(id, s)
      }
      this.tweens.killTweensOf(s)
      s.setAngle(0)
      if (animate) this.tweens.add({ targets: s, x, y, scale, alpha, duration: 260, ease: 'Sine.easeOut' })
      else s.setPosition(x, y).setScale(scale).setAlpha(alpha)
      return s
    }

    this.state.queue.forEach((v, i) => {
      const selectable = i < SELECTABLE && playing
      const s = i < SELECTABLE
        ? place(v.id, v.color, pickX(i), PICK_Y, 1, 1)
        : place(v.id, v.color, 92 + (i - SELECTABLE) * 30, PREVIEW_Y + 8, 0.45, i - SELECTABLE < 8 ? 0.85 : 0)
      ;(s.getByName('badge') as Phaser.GameObjects.Text).setText('').setVisible(false)
      s.removeAllListeners().disableInteractive()
      if (selectable) {
        s.setInteractive({ useHandCursor: true })
        s.on('pointerdown', () => this.choose(v.id))
        s.on('pointerover', () => s.setScale(1.08))
        s.on('pointerout', () => s.setScale(1))
      }
    })
    const hidden = this.state.queue.length - SELECTABLE
    this.previewLabel?.setText(hidden > 0 ? 'Sedan:' : '')

    this.state.waiting.forEach((v, i) => {
      const s = place(v.id, v.color, slotX(i), SLOT_Y - 4, 0.9, 1)
      s.removeAllListeners().disableInteractive()
      const left = 2 - v.collectedCount
      ;(s.getByName('badge') as Phaser.GameObjects.Text).setText(`${left} kvar`).setVisible(true)
    })
    this.drawSlots()
  }

  // ---------- Moves ----------

  private choose(vikingId: string) {
    if (this.busy || this.state.status !== 'playing') return
    const before = this.state
    const after = selectViking(before, vikingId)
    if (after === before) return
    // The logical outcome is decided here; the animation below only replays it.
    this.state = after
    this.busy = true
    const gen = this.generation
    this.playEvents(before, after.events, gen).then(() => {
      if (gen !== this.generation) return
      this.busy = false
      this.layoutVikings(true)
      this.notify()
    })
  }

  private tween(config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise(resolve => this.tweens.add({ ...config, onComplete: () => resolve() }))
  }

  private async playEvents(before: GameState, events: GameEvent[], gen: number) {
    let view = before
    const slotOf = (id: string) => view.waiting.findIndex(w => w.id === id)
    for (let i = 0; i < events.length; i++) {
      if (gen !== this.generation) return
      const e = events[i]
      const actor = this.vikingSprites.get(e.vikingId)
      if (!actor) continue
      const next = events[i + 1]
      const continues = next && next.vikingId === e.vikingId && (next.type === 'collect' || next.type === 'return')

      if (e.type === 'dispatch') {
        actor.disableInteractive().setDepth(20)
        this.tweens.killTweensOf(actor)
        await this.tween({ targets: actor, y: actor.y - 14, scale: 0.95, duration: 120, yoyo: true })
      } else if (e.type === 'collect') {
        const target = this.lootSprites.get(e.lootId)!
        actor.setDepth(20)
        await this.tween({ targets: actor, x: target.x, y: target.y - 22, duration: 300, ease: 'Sine.easeInOut' })
        view = { ...view, loot: view.loot.map(l => (l.id === e.lootId ? { ...l, collected: true } : l)) }
        this.tweens.add({ targets: target, scale: 0, alpha: 0, angle: 25, duration: 220, onComplete: () => target.destroy() })
        this.lootSprites.delete(e.lootId)
        this.refreshLocks(view, true)
        const w = slotOf(e.vikingId)
        if (w >= 0) {
          view = { ...view, waiting: view.waiting.map(v => (v.id === e.vikingId ? { ...v, collectedCount: v.collectedCount + 1 } : v)) }
          const left = 2 - view.waiting[w].collectedCount
          ;(actor.getByName('badge') as Phaser.GameObjects.Text).setText(`${left} kvar`)
        }
        await this.delay(120)
        if (!continues) {
          // Step back to where it is waiting (or to the gangway while the turn plays out).
          const home = w >= 0 ? { x: slotX(w), y: SLOT_Y - 4 } : GANGWAY
          await this.tween({ targets: actor, x: home.x, y: home.y, duration: 260, ease: 'Sine.easeInOut' })
        }
      } else if (e.type === 'return') {
        // Mission complete: run aboard and head home.
        if (e.fromWaiting) {
          view = { ...view, waiting: view.waiting.filter(v => v.id !== e.vikingId) }
          this.drawSlots(view.waiting.length)
        }
        ;(actor.getByName('badge') as Phaser.GameObjects.Text).setText('✓').setVisible(true)
        await this.tween({ targets: actor, x: GANGWAY.x, y: GANGWAY.y + 40, duration: 240, ease: 'Sine.easeIn' })
        await this.tween({ targets: actor, x: -40, alpha: 0, scale: 0.6, duration: 320, ease: 'Sine.easeIn' })
        actor.destroy()
        this.vikingSprites.delete(e.vikingId)
      } else if (e.type === 'wait') {
        // `wait` is always the last event of a move, so the final state describes this seat.
        const seated = this.state.waiting.find(v => v.id === e.vikingId)
        await this.tween({ targets: actor, x: slotX(e.slot), y: SLOT_Y - 4, scale: 0.9, duration: 320, ease: 'Back.easeOut' })
        if (seated) (actor.getByName('badge') as Phaser.GameObjects.Text).setText(`${2 - seated.collectedCount} kvar`).setVisible(true)
        this.drawSlots()
      } else if (e.type === 'overflow') {
        await this.tween({ targets: actor, x: GANGWAY.x, y: SLOT_Y + 2, duration: 300 })
        this.cameras.main.shake(260, 0.012)
        this.cameras.main.flash(220, 160, 30, 20)
        await this.tween({ targets: actor, angle: { from: -12, to: 12 }, duration: 70, yoyo: true, repeat: 3 })
      }
    }
  }

  private delay(ms: number) { return new Promise<void>(r => this.time.delayedCall(ms, r)) }

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
