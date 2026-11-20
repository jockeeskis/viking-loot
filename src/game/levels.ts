import type { LevelLoot, LootColor } from './engine.ts'
import type { LootKind } from './art.ts'

/**
 * `at` is [column, row] on the island; row 0 is furthest back, blockers stand in front.
 * `kind` only changes the look (barrel, chest or house); if omitted it is derived from the id.
 */
export type LevelLootPlaced = LevelLoot & { at: [number, number]; kind?: LootKind }
export type Level = { name: string; hint: string; loot: LevelLootPlaced[]; queue: LootColor[] }

const R: LootColor = 'red', B: LootColor = 'blue', Y: LootColor = 'yellow'
const item = (id: string, color: LootColor, at: [number, number], ...blockedBy: string[]): LevelLootPlaced => ({ id, color, at, blockedBy })

const code: Record<string, LootColor> = { r: R, b: B, y: Y }
/**
 * Piles of loot: each string is one column listed back→front. Only the front item of a
 * pile is reachable; each item is blocked by the one directly in front of it.
 */
function stacks(columns: string[]): LevelLootPlaced[] {
  return columns.flatMap((col, c) => {
    const x = columns.length === 1 ? 1.5 : 0.5 + (c * 2) / (columns.length - 1)
    return [...col].map((ch, row) => {
      const id = `c${c + 1}-${row + 1}`
      const front = row === col.length - 1 ? [] : [`c${c + 1}-${row + 2}`]
      return item(id, code[ch], [x, (row * 3) / Math.max(1, col.length - 1)], ...front)
    })
  })
}

/** A full grid; each string is one row (back→front), one letter per column. */
function grid(rows: string[]): LevelLootPlaced[] {
  return rows.flatMap((row, r) => [...row].map((ch, c) => item(`r${r + 1}c${c + 1}`, code[ch], [c, r])))
}

// Progression (ui-settings.md §6): colours and the queue first, waiting slots from level 2,
// blocked loot from level 3, then real puzzles. Filling the third waiting slot loses.
export const levels: Level[] = [
  {
    name: 'Kustbyn',
    hint: 'Välj en av de tre främsta vikingarna. Den plundrar två skatter i sin färg.',
    queue: [R, B, Y, B, R, Y, R, B],
    loot: grid(['rbyr', 'byrb', 'rbby', 'yrbr']),
  },
  {
    name: 'Bryggan',
    hint: 'De blå skatterna står bakom tunnorna. En viking utan byte väntar på skeppet – men fyll aldrig alla tre platser!',
    queue: [B, Y, R],
    loot: [
      item('b1', B, [0.5, 1.5], 'r1'), item('b2', B, [2.5, 1.5], 'r2'),
      item('r1', R, [0.5, 2.5]), item('y1', Y, [1.5, 2]), item('r2', R, [2.5, 2.5]),
      item('y2', Y, [1.5, 3]),
    ],
  },
  {
    name: 'Handelsbyn',
    hint: 'Låsta skatter kan bara plundras när skatten framför är borta. Börja framifrån.',
    queue: [Y, R, B, Y],
    loot: [
      item('y3', Y, [0.5, 0], 'b1'), item('y4', Y, [2.5, 0], 'b2'),
      item('b1', B, [0.5, 1], 'r1'), item('b2', B, [2.5, 1], 'r2'),
      item('r1', R, [0.5, 2], 'y1'), item('r2', R, [2.5, 2], 'y2'),
      item('y1', Y, [0.5, 3]), item('y2', Y, [2.5, 3]),
    ],
  },
  {
    name: 'Fiskeläget',
    hint: 'Tre högar och sex vikingar. Fel ordning fyller skeppet – tänk ett drag framåt.',
    queue: [R, Y, B, Y, R, B],
    loot: stacks(['rryy', 'byry', 'bbbr']),
  },
  {
    name: 'Fästet',
    hint: 'Bara två säkra väntplatser. Vem ska vänta på skeppet – och vem öppnar vägen?',
    queue: [B, B, R, Y, Y, R],
    loot: stacks(['ryyybb', 'rrbryb']),
  },
  {
    name: 'Stora räden',
    hint: 'Två höga högar, åtta vikingar och bara två säkra väntplatser. Planera hela räden.',
    queue: [Y, B, Y, B, B, R, Y, R],
    loot: stacks(['ryrrbbyb', 'yyybyrbb']),
  },
]
