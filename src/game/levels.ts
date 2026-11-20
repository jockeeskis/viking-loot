import type { LevelLoot, LootColor } from './engine.ts'

/** `at` is [column, row] on the island; row 0 is furthest back, blockers stand in front. */
export type LevelLootPlaced = LevelLoot & { at: [number, number] }
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

export const levels: Level[] = [
  {
    name: 'Kustbyn',
    hint: 'Välj en viking – den plundrar två skatter i sin färg.',
    queue: [R, B, Y],
    loot: [
      item('r1', R, [0.5, 1.5]), item('b1', B, [1.5, 1.5]), item('y1', Y, [2.5, 1.5]),
      item('y2', Y, [0.5, 2.5]), item('r2', R, [1.5, 2.5]), item('b2', B, [2.5, 2.5]),
    ],
  },
  {
    name: 'Fiskeläget',
    hint: 'Bara de tre främsta vikingarna kan väljas. Resten väntar i kön.',
    queue: [Y, R, B, R, Y, B],
    loot: [
      item('r1', R, [0, 1]), item('b1', B, [1, 1]), item('y1', Y, [2, 1]), item('r2', R, [3, 1]),
      item('b2', B, [0, 2]), item('y2', Y, [1, 2]), item('r3', R, [2, 2]), item('b3', B, [3, 2]),
      item('y3', Y, [0, 3]), item('r4', R, [1, 3]), item('b4', B, [2, 3]), item('y4', Y, [3, 3]),
    ],
  },
  {
    name: 'Bryggan',
    hint: 'Blå skatter ligger bakom tunnorna. Skicka blå först – den väntar på skeppet tills vägen är fri.',
    queue: [B, Y, R],
    loot: [
      item('b1', B, [0.5, 1.5], 'r1'), item('b2', B, [2.5, 1.5], 'r2'),
      item('r1', R, [0.5, 2.5]), item('y1', Y, [1.5, 2]), item('r2', R, [2.5, 2.5]),
      item('y2', Y, [1.5, 3]),
    ],
  },
  {
    name: 'Handelsbyn',
    hint: 'Plundra framifrån. Varje skatt öppnar vägen till nästa.',
    queue: [R, Y, B, Y],
    loot: [
      item('y3', Y, [0.5, 0], 'b1'), item('y4', Y, [2.5, 0], 'b2'),
      item('b1', B, [0.5, 1], 'r1'), item('b2', B, [2.5, 1], 'r2'),
      item('r1', R, [0.5, 2], 'y1'), item('r2', R, [2.5, 2], 'y2'),
      item('y1', Y, [0.5, 3]), item('y2', Y, [2.5, 3]),
    ],
  },
  {
    name: 'Fästet',
    hint: 'Ingen blå viking står först. Vem ska vänta på skeppet – och vem öppnar vägen?',
    queue: [R, Y, R, Y, B, B],
    loot: stacks(['yrbyrb', 'yyrrbb']),
  },
  {
    name: 'Stora räden',
    hint: 'Två höga högar, åtta vikingar och tre väntplatser. Planera hela räden.',
    queue: [B, B, R, R, B, Y, Y, Y],
    loot: stacks(['yyyyybrb', 'brbbrryb']),
  },
]
