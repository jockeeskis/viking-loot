import { createGame, type LevelLoot, type LootColor, type QueueEntry, type ShipSpec } from './engine.ts'
import type { LootKind } from './art.ts'

/**
 * `at` is [column, row] on the island; row 0 is furthest back, blockers stand in front.
 * `kind` only changes the look (barrel, chest or house); if omitted it is derived from the id.
 */
export type LevelLootPlaced = LevelLoot & { at: [number, number]; kind?: LootKind }
/** `par` = fewest waiting-slot seats on a winning line (from the solver); it sets the stars. */
export type Level = {
  name: string; hint: string; par: number; loot: LevelLootPlaced[]; queue: QueueEntry[]
  /** Optional since 0.4: ship 0 is the main ship, more ships are colour ships. Default: one ship, three seats. */
  ships?: ShipSpec[]
  /** Optional since 0.5: the raven carries off the longest-waiting viking every N-th move. */
  raven?: number
}

/** Start a game of a level, with every level-wide option (ships, raven). */
export const startGame = (l: Pick<Level, 'loot' | 'queue' | 'ships' | 'raven'>) =>
  createGame(l.loot, l.queue, l.ships, { raven: l.raven })

const R: LootColor = 'red', B: LootColor = 'blue', Y: LootColor = 'yellow'
const item = (id: string, color: LootColor, at: [number, number], ...blockedBy: string[]): LevelLootPlaced => ({ id, color, at, blockedBy })
/** A house that takes two hits (two carry slots) before its loot is taken. */
export const house = (id: string, color: LootColor, at: [number, number], ...blockedBy: string[]): LevelLootPlaced =>
  ({ id, color, at, blockedBy, hits: 2, kind: 'house' })
/** A stone: blocks what is behind it and crumbles when any item in `clearedBy` is plundered. */
export const stone = (id: string, at: [number, number], clearedBy: string[], ...blockedBy: string[]): LevelLootPlaced =>
  ({ id, stone: true, clearedBy, at, blockedBy })
/** Loot whose colour is hidden until it becomes reachable. */
export const hidden = (l: LevelLootPlaced): LevelLootPlaced => ({ ...l, hidden: true })
/** Queue entries for the special vikings. */
export const jarl = (color: LootColor): QueueEntry => ({ kind: 'jarl', color })
export const WILD: QueueEntry = { kind: 'wild' }
export const SCOUT: QueueEntry = { kind: 'scout' }

const code: Record<string, LootColor> = { r: R, b: B, y: Y }

type Token = { ch: string; hidden: boolean; frozen: number; key: boolean; chest: boolean; keg: boolean; cage: LootColor | null }
const fresh = (): Omit<Token, 'ch'> => ({ hidden: false, frozen: 0, key: false, chest: false, keg: false, cage: null })
/**
 * Split a pile string into tokens. Prefixes (any order) apply to the next letter: `?` hidden, `~N` ice,
 * `!` key, `#` locked chest, `*` powder keg. `&rb` is a red cage holding a blue prisoner.
 * A leading `≈` marks a tide pile (handled by `stacks`).
 */
function tokens(col: string): Token[] {
  const out: Token[] = []
  let t = fresh()
  for (let i = col.startsWith('≈') ? 1 : 0; i < col.length; i++) {
    const c = col[i]
    if (c === '?') t.hidden = true
    else if (c === '!') t.key = true
    else if (c === '#') t.chest = true
    else if (c === '*') t.keg = true
    else if (c === '&') {
      const [loot, prisoner] = [col[i + 1], col[i + 2]]
      if (!loot || !prisoner || !/[rby]/.test(loot) || !/[rby]/.test(prisoner)) throw new Error(`"&" needs a cage colour and a prisoner colour in "${col}"`)
      out.push({ ch: loot, ...t, cage: code[prisoner] })
      t = fresh()
      i += 2
    } else if (c === '~') {
      const m = /^\d+/.exec(col.slice(i + 1))
      if (!m) throw new Error(`"~" needs a number of moves in "${col}"`)
      t.frozen = Number(m[0])
      i += m[0].length
    } else {
      if (!/[rbyRBYs]/.test(c)) throw new Error(`Unknown pile letter "${c}" in "${col}"`)
      if ((t.key || t.chest || t.keg) && c !== c.toLowerCase()) throw new Error(`Keys, chests and kegs are ordinary loot, not houses ("${col}")`)
      out.push({ ch: c, ...t })
      t = fresh()
    }
  }
  return out
}

/**
 * Piles of loot: each string is one column listed back→front. Only the front item of a
 * pile is reachable; each item is blocked by the one directly in front of it.
 *
 * Letters: `r b y` loot · `R B Y` a house in that colour (two hits) · `s` a stone ·
 * `?` before a letter hides that item's colour until it is reachable.
 * 0.4: `!r` a red key · `#r` a red chest, locked until every key of the same colour is taken ·
 * `~3r` red loot frozen until move 3 starts. Prefixes combine, e.g. `?~2b`.
 * 0.5: `*r` a red powder keg (clears stones, ice and tarps within a row of it, in its own and the
 * neighbouring piles) · `&rb` a red cage with a blue prisoner · a pile starting with `≈` is a tide pile
 * (no blocking inside it: the tide decides which item is in front).
 * A stone crumbles when an item next to it (in a neighbouring pile, at about the same
 * depth) is plundered. What stands behind a stone also stays behind the item in front of
 * the stone, so a pile is always emptied front to back.
 */
export function stacks(columns: string[]): LevelLootPlaced[] {
  const n = columns.length
  const piles = columns.map(tokens)
  // 2–3 piles sit in the middle of the 4-wide island; 4 piles use every column.
  const xOf = (c: number) => (n === 1 ? 1.5 : n >= 4 ? (c * 3) / (n - 1) : 0.5 + (c * 2) / (n - 1))
  const yOf = (c: number, row: number) => (row * 3) / Math.max(1, piles[c].length - 1)
  const idOf = (c: number, row: number) => `c${c + 1}-${row + 1}`
  const keysOf = (color: LootColor) => piles.flatMap((p, c) => p.flatMap((t, row) => (t.key && code[t.ch] === color ? [idOf(c, row)] : [])))
  const tidal = columns.map(col => col.startsWith('≈'))
  const tideIndex = (c: number) => tidal.slice(0, c).filter(Boolean).length
  /** Stones, ice and tarps a keg at (c, row) reaches: its own and the neighbouring piles, within one row. */
  const blastOf = (c: number, row: number) => {
    const reach = 3 / Math.max(1, piles[c].length - 1) + 0.01
    const out: string[] = []
    for (const nc of [c - 1, c, c + 1]) {
      if (nc < 0 || nc >= n) continue
      piles[nc].forEach((t, r) => {
        if ((nc === c && r === row) || Math.abs(yOf(nc, r) - yOf(c, row)) > reach) return
        if (t.ch === 's' || t.frozen || t.hidden) out.push(idOf(nc, r))
      })
    }
    return out
  }
  return piles.flatMap((pile, c) => pile.map(({ ch, hidden, frozen, key, chest, keg, cage }, row) => {
    const id = idOf(c, row)
    const at: [number, number] = [xOf(c), yOf(c, row)]
    // Blocked by everything in front up to and including the first non-stone item (not in a tide pile).
    const blockedBy: string[] = []
    for (let k = row + 1; k < pile.length && !tidal[c]; k++) {
      blockedBy.push(idOf(c, k))
      if (pile[k].ch !== 's') break
    }
    if (tidal[c] && (ch === 's' || chest)) throw new Error(`No stones or locked chests in a tide pile ("${columns[c]}")`)
    if (ch === 's') {
      // Cleared by the closest non-stone item(s) in each neighbouring pile.
      const clearedBy: string[] = []
      for (const nc of [c - 1, c + 1]) {
        if (nc < 0 || nc >= n) continue
        const cands = piles[nc].map((t, r) => ({ r, t, d: Math.abs(yOf(nc, r) - at[1]) })).filter(o => o.t.ch !== 's')
        const best = Math.min(...cands.map(o => o.d))
        cands.filter(o => o.d === best).forEach(o => clearedBy.push(idOf(nc, o.r)))
      }
      return stone(id, at, clearedBy, ...blockedBy)
    }
    const color = code[ch.toLowerCase()]
    let l = ch === ch.toUpperCase() ? house(id, color, at, ...blockedBy) : item(id, color, at, ...blockedBy)
    if (hidden) l = { ...l, hidden: true }
    if (frozen) l = { ...l, frozen }
    if (key) l = { ...l, key: true, kind: 'key' }
    if (keg) l = { ...l, keg: true, blasts: blastOf(c, row), kind: 'keg' }
    if (cage) l = { ...l, cage, kind: 'cage' }
    if (tidal[c]) l = { ...l, tidePile: tideIndex(c) }
    if (chest) {
      const lockedBy = keysOf(color)
      if (!lockedBy.length) throw new Error(`Chest ${id} has no ${color} key in the level`)
      l = { ...l, lockedBy, kind: 'chest' }
    }
    return l
  }))
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
    par: 0,
    hint: 'Välj en av de tre främsta vikingarna. Den plundrar två skatter i sin färg.',
    queue: [R, B, Y, B, R, Y, R, B],
    loot: grid(['rbyr', 'byrb', 'rbby', 'yrbr']),
  },
  {
    name: 'Bryggan',
    par: 0,
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
    par: 0,
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
    par: 1,
    hint: 'Tre högar och sex vikingar. Fel ordning fyller skeppet – tänk ett drag framåt.',
    queue: [R, Y, B, Y, R, B],
    loot: stacks(['rryy', 'byry', 'bbbr']),
  },
  {
    name: 'Fästet',
    par: 1,
    hint: 'Bara två säkra väntplatser. Vem ska vänta på skeppet – och vem öppnar vägen?',
    queue: [B, B, R, Y, Y, R],
    loot: stacks(['ryyybb', 'rrbryb']),
  },
  {
    name: 'Stora räden',
    par: 2,
    hint: 'Två höga högar, åtta vikingar och bara två säkra väntplatser. Planera hela räden.',
    queue: [Y, B, Y, B, B, R, Y, R],
    loot: stacks(['ryrrbbyb', 'yyybyrbb']),
  },
  // 7–12 were found with `npm run generate-levels` (target win share per level, front-only play loses).
  {
    name: 'Klosterön',
    par: 1,
    hint: 'Tre högar igen – men nu måste du välja vem som får vänta.',
    queue: [B, R, B, Y, R],
    loot: stacks(['rrb', 'bbyr', 'bry']),
  },
  {
    name: 'Bärnstensviken',
    par: 1,
    hint: 'Tre lika höga högar. Räkna färgerna innan du skickar ut någon.',
    queue: [R, R, Y, B, Y, R],
    loot: stacks(['yrrr', 'yrbr', 'yybr']),
  },
  {
    name: 'Vintermarknaden',
    par: 2,
    hint: 'Fyra högar fyller hela ön. Öppna vägen för vikingarna längre bak i kön.',
    queue: [Y, Y, Y, B, R, B, B, R],
    loot: stacks(['bbbr', 'yrbr', 'yybr', 'yyby']),
  },
  {
    name: 'Jarlens gård',
    par: 2,
    hint: 'Höga högar och sju vikingar. Spara väntplatserna tills de verkligen behövs.',
    queue: [B, R, Y, Y, R, Y, B],
    loot: stacks(['ybbbr', 'yyyy', 'rrrby']),
  },
  {
    name: 'Runstensfältet',
    par: 1,
    hint: 'Fyra högar och åtta vikingar. Det säkra draget är sällan det första.',
    queue: [R, B, R, Y, B, R, R, Y],
    loot: stacks(['yyrr', 'brrr', 'bryr', 'bbyr']),
  },
  {
    name: 'Kungsgården',
    par: 2,
    hint: 'Den sista räden. Varje val räknas – planera hela vägen till sista skatten.',
    queue: [Y, R, R, B, Y, B, Y, Y],
    loot: stacks(['byybyy', 'byyr', 'rryrby']),
  },
  // ---------- Fjordarna (0.3) ----------
  // Found with `npm run generate-levels`: each mechanic first on a level that cannot be lost, then in a puzzle.
  {
    name: 'Fjordmynningen',
    par: 0,
    hint: 'Husen tål två hugg. En viking med två tomma platser tar ett helt hus.',
    queue: [Y, B, R, Y, Y],
    loot: stacks(['byY', 'yb', 'Yrr']),
  },
  {
    name: 'Båthusen',
    par: 1,
    hint: 'Ett halvt uppbrutet hus kan en annan viking i samma färg göra klart.',
    queue: [R, Y, B, R, Y, B, B],
    loot: stacks(['yrBb', 'brr', 'YryB']),
  },
  {
    name: 'Stenbrottet',
    par: 0,
    hint: 'Stenen rasar när du plundrar något bredvid den – och den kostar ingen bärplats.',
    queue: [B, Y, Y, R],
    loot: stacks(['yrr', 'yys', 'bby']),
  },
  {
    name: 'Klipporna',
    par: 1,
    hint: 'Vilken skatt bredvid stenarna ska bort först? Fel ordning lämnar vikingar väntande.',
    queue: [R, Y, R, Y, B],
    loot: stacks(['yrsr', 'ybrb', 'yysr']),
  },
  {
    name: 'Jarlens hall',
    par: 1,
    hint: 'Jarlen Harald bär tre skatter. Skicka honom när tre i hans färg går att nå.',
    queue: [jarl(Y), B, R, R],
    loot: stacks(['byb', 'rrr', 'yyr']),
  },
  {
    name: 'Mjödsalen',
    par: 2,
    hint: 'Jarlen står sist i kön. Se till att hans tre skatter ligger framme när han kommer.',
    queue: [B, R, B, R, B, R, R, jarl(Y)],
    loot: stacks(['ryrr', 'ybbr', 'rrbr', 'bByr']),
  },
  {
    name: 'Regnbågsbron',
    par: 0,
    hint: 'Ylva tar färgen från den första skatten hon når – räknat från högen längst till vänster.',
    queue: [B, WILD, Y, R],
    loot: stacks(['rrr', 'br', 'byy']),
  },
  {
    name: 'Regnbågsstranden',
    par: 1,
    hint: 'Ylva kan ta hand om en färg som annars blir över. Välj noga när hon går.',
    queue: [Y, B, Y, B, WILD, R, B],
    loot: stacks(['yBrr', 'bbby', 'byBy']),
  },
  {
    name: 'Dimmans vik',
    par: 0,
    hint: 'Skatterna under presenning visar sin färg först när vägen fram till dem är fri.',
    queue: [Y, R, R, B],
    loot: stacks(['?r?yr', '?by', '?r?br']),
  },
  {
    name: 'Dimfjorden',
    par: 2,
    hint: 'Fyra högar i dimma. Planera med det du ser – och håll en plats ledig på skeppet.',
    queue: [B, Y, B, Y, B, B, R, R],
    loot: stacks(['?r?b?bb', '?b?y?rb', '?b?b?yr', '?y?b?yr']),
  },
  {
    name: 'Stormnäset',
    par: 1,
    hint: 'Hus, sten, dimma och en jarl – allt du har lärt dig på en och samma ö.',
    queue: [Y, R, R, R, Y, B, jarl(R), B],
    loot: stacks(['?y?b?rr', '?b?R?rr', '?y?Y?br', '?rs?rb']),
  },
  {
    name: 'Valhalls port',
    par: 0,
    hint: 'Den sista räden: Ylva, Harald, hus och stenar. Tre stjärnor kräver en räd helt utan väntan.',
    queue: [Y, Y, B, R, B, WILD, R, Y, jarl(R)],
    loot: stacks(['?y?r?ysR', '?B?b?yy', '?ys?rr', '?B?r?r?by']),
  },
  // ---------- Isriket (0.4): keys, ice, colour ships and the scout – introduced one at a time, then mixed ----------
  {
    name: 'Nyckelviken',
    par: 0,
    hint: 'Den röda kistan har ett rött hänglås. Plundra den röda nyckeln, så flyger den dit och låser upp kistan.',
    queue: [Y, B, R, R],
    loot: stacks(['ryy', '#rb', 'br!r']),
  },
  {
    name: 'Skattkammaren',
    par: 2,
    hint: 'Två kistor, två nycklar. Vilken nyckel behöver du först?',
    queue: [R, B, B, Y, B, Y],
    loot: stacks(['yybb', '!brb!y', '#b#ybr']),
  },
  {
    name: 'Isbryggan',
    par: 0,
    hint: 'Isen smälter lite för varje viking du skickar. Siffran visar hur många drag som är kvar.',
    queue: [R, R, B, Y],
    loot: stacks(['yyb', 'rb', 'rr~2r']),
  },
  {
    name: 'Frusna fjärden',
    par: 2,
    hint: 'Skicka inte en viking till isen för tidigt – då får den sitta och vänta på skeppet.',
    queue: [Y, B, R, R, Y, B],
    loot: stacks(['brbr', 'yyb~4r', 'yyr~4b']),
  },
  {
    name: 'Snäckans hamn',
    par: 1,
    hint: 'Det lilla skeppet tar bara blå vikingar. Där kan de vänta tryggt.',
    queue: [B, Y, B, R],
    ships: [{ slots: 3 }, { slots: 2, color: B }],
    loot: stacks(['bby', 'rb', 'bry']),
  },
  {
    name: 'Seglarnas sund',
    par: 2,
    hint: 'Två trygga platser för gula vikingar – alla andra måste rymmas på det stora skeppet.',
    queue: [R, B, B, B, R, B, Y, Y],
    ships: [{ slots: 3 }, { slots: 2, color: Y }],
    loot: stacks(['bybr', 'bbyr', 'bbyr', 'bryb']),
  },
  {
    name: 'Spejarklippan',
    par: 0,
    hint: 'Sigrid bär ingenting, men när du skickar henne visar hon alla dolda skatter.',
    queue: [SCOUT, R, B, Y, B],
    loot: stacks(['?r?ry', '?by', '?b?bb']),
  },
  {
    name: 'Snöstormen',
    par: 1,
    hint: 'Allt är dolt i snön. Skicka Sigrid när du behöver se – men hon tar en plats i kön tills dess.',
    queue: [Y, Y, R, Y, SCOUT, B, B, Y, R, B],
    loot: stacks(['?r?y?by', '?b?b?by', '?r?y?bY', '?r?r?bY']),
  },
  {
    name: 'Glaciären',
    par: 2,
    hint: 'Nyckel, kista och is på samma ö. Tänk på i vilket drag isen släpper.',
    queue: [Y, R, R, Y, Y, R, B, B],
    loot: stacks(['rbyb', 'b!ry~3y', '#r~2ryb', 'ryyr']),
  },
  {
    name: 'Norrskenet',
    par: 2,
    hint: 'Hus, sten och ett litet rött skepp med en enda plats. Vem behöver den mest?',
    queue: [R, R, B, R, B, Y, Y, Y],
    ships: [{ slots: 3 }, { slots: 1, color: R }],
    loot: stacks(['yyrb', 'yybs', 'rryb', 'Rrby']),
  },
  {
    name: 'Ishallen',
    par: 2,
    hint: 'Dold kista, frusen skatt och Harald i slutet av kön. Sigrid hjälper dig att planera.',
    queue: [R, SCOUT, Y, R, R, B, Y, Y, jarl(B)],
    ships: [{ slots: 3 }, { slots: 1, color: B }],
    loot: stacks(['?r?~2y?by', '?r?r?#r?bb', '?!r?y?by', '?r?b?yy']),
  },
  {
    name: 'Ymers hjärta',
    par: 3,
    hint: 'Den sista räden i isen: allt du har lärt dig, på en och samma ö.',
    queue: [Y, Y, Y, Y, B, WILD, B, jarl(R), Y, SCOUT],
    ships: [{ slots: 3 }, { slots: 1, color: Y }],
    loot: stacks(['?y?#b?y?yr', '?~6y?Y?rb', '?~8B?y?rs', '?y?b?!b?yy']),
  },
  // ---------------------------------------------------------------- Muspelheim (0.5)
  {
    name: 'Krutkällaren',
    par: 0,
    hint: 'Krutfatet smäller när det plundras – stenen bredvid rasar med en gång.',
    queue: [R, Y, B, R],
    loot: stacks(['ryr', 'bys', 'br*r']),
  },
  {
    name: 'Svavelgruvan',
    par: 1,
    hint: 'Två krutfat. Vilken sten behöver bort först – och vilket fat ska smälla när?',
    queue: [R, Y, R, Y, R, B, B],
    loot: stacks(['bs*by', 'byry', '*rryb', 'rsrr']),
  },
  {
    name: 'Askstranden',
    par: 0,
    hint: 'Var tredje drag sköljer vågen den främsta skatten i våghögen längst bak.',
    queue: [B, Y, R, Y],
    loot: stacks(['yby', 'br', '≈yyr']),
  },
  {
    name: 'Glödvikarna',
    par: 2,
    hint: 'Två våghögar. Räkna dragen – vad står främst när du behöver det?',
    queue: [Y, B, B, B, B, R, Y, R, R],
    loot: stacks(['brbb', '≈rbrrb', '≈bybr', 'yyybr']),
  },
  {
    name: 'Fångvaktarens hydda',
    par: 0,
    hint: 'Plundra buren så kliver fången fram först i kön.',
    queue: [B, R, B],
    loot: stacks(['&ryrb', 'bb', 'yyb']),
  },
  {
    name: 'Bojhamnen',
    par: 2,
    hint: 'Två burar, två fångar. Vem ska släppas ut först?',
    queue: [B, B, Y, Y, R, R],
    loot: stacks(['y&ybby', 'brbb', 'r&yyyr', 'bryb']),
  },
  {
    name: 'Korpberget',
    par: 0,
    hint: 'Korpen kommer var tredje drag och tar den viking som väntat längst.',
    queue: [Y, B, R, Y, R],
    raven: 3,
    loot: stacks(['yrb', 'rb', 'rry']),
  },
  {
    name: 'Hugins klippa',
    par: 1,
    hint: 'Korpen kan rädda en plats – eller ta en viking du behöver. Tänk på när den kommer.',
    queue: [R, R, Y, B, Y, B, B, Y, R],
    raven: 3,
    loot: stacks(['bbbb', 'rrry', 'byry', 'rbry']),
  },
  {
    name: 'Lavafloden',
    par: 1,
    hint: 'Krutfat, tidvatten och ett hus. Låt vågen jobba åt dig.',
    queue: [B, R, B, Y, Y, B, R, R],
    loot: stacks(['brbr', '≈yBrr', 'y*ybr', 'yrsb']),
  },
  {
    name: 'Rökslöjan',
    par: 2,
    hint: 'Allt är dolt i röken, en fånge väntar i sin bur och korpen kretsar.',
    queue: [B, R, B, R, Y, R, B, R],
    raven: 4,
    loot: stacks(['?b?b?rr', '?&by?r?by', '?r?b?ry', '?r?y?by']),
  },
  {
    name: 'Eldfjället',
    par: 2,
    hint: 'Is i elden, krutfat, en bur och tidvatten – allt på en och samma ö.',
    queue: [B, Y, B, B, R, Y, Y, Y],
    loot: stacks(['rYyy', '*r~3bsbb', 'bybr', '≈ryy&yrb']),
  },
  {
    name: 'Surts smedja',
    par: 1,
    hint: 'Den sista räden: allt du har lärt dig, i eldjättens smedja.',
    queue: [B, Y, Y, R, R, SCOUT, R, R, jarl(B)],
    raven: 4,
    loot: stacks(['?b?b?r?y&yb', '≈?b?*r?ry', '?y?b?Rs', '?r?rs?rb']),
  },
]

/** Worlds on the map. */
export const worlds = [
  { name: 'Kusten', first: 0, last: 11 },
  { name: 'Fjordarna', first: 12, last: 23 },
  { name: 'Isriket', first: 24, last: 35 },
  { name: 'Muspelheim', first: 36, last: 47 },
]
