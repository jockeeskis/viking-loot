// Procedural placeholder art in the style of the reference sheet:
// chunky, rounded, brightly colour-coded. Everything is drawn with Phaser Graphics,
// so there are no external assets. Shapes are centred on (0, 0).
import Phaser from 'phaser'
import type { LootColor } from './engine'

export type LootKind = 'barrel' | 'house' | 'chest'
type G = Phaser.GameObjects.Graphics

// Tokens from ui-settings.md §2 (color.red / color.blue / color.yellow)
export const COLORS: Record<LootColor, number> = { red: 0xd96b46, blue: 0x458fc4, yellow: 0xf0bd55 }
export const WOOD = 0x8a5a33, WOOD_DARK = 0x5b3a20, WOOD_LIGHT = 0xb07a45, GOLD = 0xf5c542
export const INK = 0x3b2414

/** Lighten (f > 0) or darken (f < 0) a colour. */
export function shade(c: number, f: number) {
  const ch = (v: number) => Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))
  return (ch((c >> 16) & 255) << 16) | (ch((c >> 8) & 255) << 8) | ch(c & 255)
}

export const cartoonText = (size: number, color = '#fff4d6'): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: '"Arial Black", "Segoe UI Black", Arial, sans-serif',
  fontSize: `${size}px`, color, stroke: '#3b2414', strokeThickness: Math.max(3, Math.round(size / 4)),
  resolution: 2, // the camera renders at zoom 2
})

// ---------- Loot ----------

export function drawLoot(g: G, kind: LootKind, color: LootColor) {
  g.fillStyle(0x000000, 0.22); g.fillEllipse(0, 24, kind === 'house' ? 64 : 52, 14)
  if (kind === 'barrel') drawBarrel(g, COLORS[color])
  else if (kind === 'house') drawHouse(g, COLORS[color])
  else drawChest(g, COLORS[color])
}

function drawBarrel(g: G, c: number) {
  g.fillStyle(shade(c, -0.25)); g.fillRoundedRect(-21, -21, 42, 46, 13)
  g.fillStyle(c); g.fillRoundedRect(-21, -23, 40, 46, 13)
  g.fillStyle(shade(c, 0.3)); g.fillRoundedRect(-15, -19, 7, 38, 4)
  g.fillStyle(shade(c, -0.2)); g.fillRoundedRect(7, -19, 8, 38, 4)
  for (const y of [-15, 11]) {
    g.fillStyle(0x6e6e78); g.fillRect(-21, y, 40, 6)
    g.fillStyle(0xc4c6cf); g.fillRect(-21, y, 40, 2)
  }
  g.fillStyle(shade(c, -0.35)); g.fillEllipse(-1, -22, 38, 12)
  g.fillStyle(WOOD_LIGHT); g.fillEllipse(-1, -22, 30, 8)
  g.lineStyle(2, INK, 0.55); g.strokeRoundedRect(-21, -23, 40, 46, 13)
}

function drawHouse(g: G, c: number) {
  g.fillStyle(WOOD_LIGHT); g.fillRect(-22, -4, 44, 28)
  g.fillStyle(WOOD); for (let y = 2; y < 24; y += 7) g.fillRect(-22, y, 44, 2)
  g.fillStyle(WOOD_DARK); g.fillRoundedRect(-6, 8, 12, 16, { tl: 6, tr: 6, bl: 0, br: 0 })
  g.fillStyle(0xffd36b); g.fillRect(-18, 2, 8, 8); g.fillRect(10, 2, 8, 8)
  g.lineStyle(2, WOOD_DARK); g.strokeRect(-18, 2, 8, 8); g.strokeRect(10, 2, 8, 8)
  g.fillStyle(shade(c, -0.35)); g.fillTriangle(-32, 3, 0, -30, 32, 3)
  g.fillStyle(c); g.fillTriangle(-28, -1, 0, -27, 28, -1)
  g.fillStyle(shade(c, 0.25)); g.fillTriangle(-20, -6, 0, -24, -6, -6)
  g.lineStyle(4, WOOD_DARK); g.lineBetween(-7, -34, 6, -22); g.lineBetween(7, -34, -6, -22)
  g.lineStyle(2, INK, 0.5); g.strokeRect(-22, -1, 44, 25)
}

function drawChest(g: G, c: number) {
  g.fillStyle(WOOD); g.fillRoundedRect(-24, -5, 48, 28, 4)
  g.fillStyle(c); g.fillRect(-20, -1, 14, 20); g.fillRect(6, -1, 14, 20)
  g.fillStyle(shade(c, -0.3)); g.fillRoundedRect(-24, -23, 48, 19, { tl: 13, tr: 13, bl: 2, br: 2 })
  g.fillStyle(c); g.fillRoundedRect(-22, -22, 44, 15, { tl: 12, tr: 12, bl: 2, br: 2 })
  g.fillStyle(shade(c, 0.3)); g.fillRoundedRect(-16, -19, 14, 4, 2)
  g.fillStyle(GOLD); g.fillRect(-3, -23, 6, 46); g.fillRect(-24, -6, 48, 4)
  g.lineStyle(3, GOLD); g.strokeRoundedRect(-24, -23, 48, 46, 7)
  g.fillStyle(GOLD); g.fillRoundedRect(-6, -9, 12, 11, 2)
  g.fillStyle(INK); g.fillRect(-1, -6, 2, 5)
}

// ---------- Vikings ----------

const SKIN = 0xf6c29a, SKIN_DARK = 0xe39f78, HORN = 0xf4e6c8, STEEL = 0xa9b3bd, STEEL_DARK = 0x6c7680

/** A viking head of radius r. Ragnar (red): big red beard. Björn (blue): grey beard. Freja (yellow): blonde braids. */
export function drawHead(g: G, color: LootColor, r: number, x = 0, y = 0) {
  // horns
  g.fillStyle(HORN)
  g.fillTriangle(x - r * 0.8, y - r * 0.3, x - r * 1.45, y - r * 1.3, x - r * 0.45, y - r * 0.8)
  g.fillTriangle(x + r * 0.8, y - r * 0.3, x + r * 1.45, y - r * 1.3, x + r * 0.45, y - r * 0.8)
  if (color === 'yellow') {
    g.fillStyle(0xf2c23a)
    g.fillEllipse(x - r * 0.78, y + r * 0.25, r * 0.5, r * 1.2); g.fillEllipse(x + r * 0.78, y + r * 0.25, r * 0.5, r * 1.2)
    g.fillStyle(0xe0a91f)
    for (const s of [-1, 1]) { g.fillCircle(x + s * r * 0.85, y + r * 0.95, r * 0.22); g.fillCircle(x + s * r * 0.85, y + r * 1.3, r * 0.19) }
  }
  g.fillStyle(SKIN); g.fillCircle(x, y, r * 0.8)
  if (color === 'yellow') {
    g.fillStyle(0xf59b9b, 0.7); g.fillCircle(x - r * 0.45, y + r * 0.25, r * 0.14); g.fillCircle(x + r * 0.45, y + r * 0.25, r * 0.14)
    g.fillStyle(0x7a1f12); g.slice(x, y + r * 0.22, r * 0.3, 0, Math.PI, false); g.fillPath()
    g.fillStyle(0xffffff); g.fillRect(x - r * 0.18, y + r * 0.22, r * 0.36, r * 0.08)
  } else {
    const beard = color === 'red' ? 0xd9482b : 0xd8dbe0
    g.fillStyle(shade(beard, -0.15)); g.fillEllipse(x, y + r * 0.78, r * 1.6, r * 1.15)
    g.fillStyle(beard); g.fillEllipse(x, y + r * 0.7, r * 1.5, r * 1.0)
    g.fillStyle(0x7a1f12); g.fillEllipse(x, y + r * 0.5, r * 0.45, r * (color === 'red' ? 0.32 : 0.14))
    g.fillStyle(shade(beard, 0.12)); g.fillEllipse(x - r * 0.26, y + r * 0.32, r * 0.55, r * 0.22); g.fillEllipse(x + r * 0.26, y + r * 0.32, r * 0.55, r * 0.22)
  }
  g.fillStyle(SKIN_DARK); g.fillCircle(x, y + r * 0.16, r * 0.15)
  g.fillStyle(0x2a1a10); g.fillCircle(x - r * 0.3, y - r * 0.02, r * 0.1); g.fillCircle(x + r * 0.3, y - r * 0.02, r * 0.1)
  // brows: blue looks stern, the others cheerful
  g.lineStyle(Math.max(1.5, r * 0.09), color === 'blue' ? 0xb9bcc2 : color === 'red' ? 0xb33a22 : 0xd9a520)
  const tilt = color === 'blue' ? 0.08 : -0.06
  g.lineBetween(x - r * 0.45, y - r * (0.2 + tilt), x - r * 0.15, y - r * (0.2 - tilt))
  g.lineBetween(x + r * 0.45, y - r * (0.2 + tilt), x + r * 0.15, y - r * (0.2 - tilt))
  // helmet
  g.fillStyle(STEEL); g.slice(x, y - r * 0.18, r * 0.86, Math.PI, 0, false); g.fillPath()
  g.fillStyle(shade(STEEL, 0.35)); g.slice(x - r * 0.25, y - r * 0.5, r * 0.25, Math.PI, 0, false); g.fillPath()
  g.fillStyle(STEEL_DARK); g.fillRect(x - r * 0.88, y - r * 0.3, r * 1.76, r * 0.18)
  g.fillStyle(0xdfe4ea); for (const dx of [-0.55, 0, 0.55]) g.fillCircle(x + r * dx, y - r * 0.21, r * 0.05)
}

/** A full chibi viking (≈ 56 px tall at scale 1). Feet at y ≈ 28. */
export function drawChibi(g: G, color: LootColor) {
  const c = COLORS[color]
  g.fillStyle(0x000000, 0.22); g.fillEllipse(0, 29, 34, 9)
  g.fillStyle(0x4a2e1a); g.fillRoundedRect(-11, 20, 9, 8, 3); g.fillRoundedRect(2, 20, 9, 8, 3)
  g.fillStyle(shade(c, -0.2)); g.fillCircle(-13, 10, 5); g.fillCircle(13, 10, 5)
  g.fillStyle(c); g.fillRoundedRect(-12, 2, 24, 20, 8)
  g.fillStyle(WOOD_DARK); g.fillRect(-12, 12, 24, 4)
  g.fillStyle(GOLD); g.fillRect(-3, 11, 6, 6)
  if (color === 'red') { // axe
    g.lineStyle(3, WOOD_DARK); g.lineBetween(15, 14, 20, -6)
    g.fillStyle(0xc9ced6); g.slice(21, -4, 7, -Math.PI / 2, Math.PI / 2, false); g.fillPath()
  } else if (color === 'blue') { // round shield
    g.fillStyle(GOLD); g.fillCircle(-15, 12, 9)
    g.fillStyle(c); g.fillCircle(-15, 12, 7.5)
    g.fillStyle(0xffffff); g.fillRect(-16, 5, 2, 14)
    g.fillStyle(GOLD); g.fillCircle(-15, 12, 2.5)
  } else { // Freja: small hand axe
    g.lineStyle(2.5, WOOD_DARK); g.lineBetween(14, 14, 18, 0)
    g.fillStyle(0xc9ced6); g.slice(19, 1, 5, -Math.PI / 2, Math.PI / 2, false); g.fillPath()
  }
  drawHead(g, color, 15, 0, -10)
}

/** Card portrait: big head with shoulders. */
export function drawPortrait(g: G, color: LootColor, r: number) {
  const c = COLORS[color]
  g.fillStyle(shade(c, -0.3)); g.fillRoundedRect(-r * 1.2, r * 0.75, r * 2.4, r * 0.9, r * 0.4)
  g.fillStyle(WOOD_DARK); g.fillRect(-r * 1.2, r * 1.15, r * 2.4, r * 0.14)
  drawHead(g, color, r, 0, 0)
}

// ---------- Scenery ----------

export function drawTree(g: G, x: number, y: number, s = 1) {
  g.fillStyle(0x000000, 0.18); g.fillEllipse(x, y + 4 * s, 26 * s, 8 * s)
  g.fillStyle(WOOD_DARK); g.fillRect(x - 3 * s, y - 8 * s, 6 * s, 12 * s)
  const greens = [0x2f7d3a, 0x3c9445, 0x4fae52]
  greens.forEach((col, i) => {
    g.fillStyle(col)
    const w = (18 - i * 4) * s, top = y - (22 + i * 9) * s
    g.fillTriangle(x - w, y - (6 + i * 9) * s, x + w, y - (6 + i * 9) * s, x, top - 6 * s)
  })
}

export function drawRock(g: G, x: number, y: number, s = 1) {
  g.fillStyle(0x7d8086); g.fillEllipse(x, y, 22 * s, 15 * s)
  g.fillStyle(0xa7a9ad); g.fillEllipse(x - 2 * s, y - 2 * s, 18 * s, 11 * s)
  g.fillStyle(0xc9cbcf); g.fillEllipse(x - 5 * s, y - 4 * s, 7 * s, 4 * s)
}

export function drawShip(g: G, x: number, y: number) {
  // sail + mast (behind hull)
  g.fillStyle(WOOD_DARK); g.fillRect(x - 2, y - 52, 4, 52)
  const sw = 58, sh = 36, sx = x - sw / 2, sy = y - 50
  for (let i = 0; i < 6; i++) { g.fillStyle(i % 2 ? 0xf4ead8 : 0xd8342b); g.fillRect(sx + (i * sw) / 6, sy, sw / 6 + 0.5, sh) }
  g.lineStyle(2, 0xc9a66b); g.strokeRect(sx, sy, sw, sh)
  g.fillStyle(WOOD_DARK); g.fillRect(sx - 4, sy - 3, sw + 8, 4)
  // hull
  g.fillStyle(WOOD_DARK); g.fillRoundedRect(x - 72, y - 4, 144, 22, { tl: 4, tr: 4, bl: 16, br: 16 })
  g.fillStyle(WOOD); g.fillRoundedRect(x - 70, y - 4, 140, 17, { tl: 4, tr: 4, bl: 14, br: 14 })
  g.fillStyle(WOOD_LIGHT); g.fillRect(x - 66, y - 1, 132, 3)
  // prow (dragon) and stern
  g.fillStyle(WOOD); g.fillTriangle(x + 64, y + 10, x + 82, y - 24, x + 72, y - 2)
  g.fillStyle(0xd9a441); g.fillCircle(x + 84, y - 26, 8); g.fillTriangle(x + 88, y - 30, x + 98, y - 26, x + 88, y - 22)
  g.fillStyle(INK); g.fillCircle(x + 85, y - 28, 1.6)
  g.fillStyle(WOOD); g.fillTriangle(x - 64, y + 10, x - 82, y - 22, x - 72, y - 2)
  g.fillStyle(0xd9a441); g.fillCircle(x - 83, y - 22, 5)
  // shields
  for (let i = 0; i < 5; i++) {
    const cx = x - 48 + i * 24
    g.fillStyle(GOLD); g.fillCircle(cx, y + 3, 8)
    g.fillStyle(i % 2 ? 0xf4ead8 : 0xd8342b); g.fillCircle(cx, y + 3, 6.5)
    g.fillStyle(GOLD); g.fillCircle(cx, y + 3, 2)
  }
}

/** Wooden panel with a title tab, like the reference HUD. */
export function drawPanel(g: G, x: number, y: number, w: number, h: number) {
  g.fillStyle(0x000000, 0.25); g.fillRoundedRect(x + 2, y + 4, w, h, 14)
  g.fillStyle(0x4a2c16); g.fillRoundedRect(x, y, w, h, 14)
  g.fillStyle(0x6b4423); g.fillRoundedRect(x + 5, y + 5, w - 10, h - 10, 10)
  g.lineStyle(2, 0xc9925a, 0.6); g.strokeRoundedRect(x + 1, y + 1, w - 2, h - 2, 13)
}

export function drawTab(g: G, cx: number, y: number, w: number, fill = 0x8a5a33) {
  g.fillStyle(0x4a2c16); g.fillRoundedRect(cx - w / 2 - 2, y - 2, w + 4, 22, 9)
  g.fillStyle(fill); g.fillRoundedRect(cx - w / 2, y, w, 18, 8)
}
