// Solvability report for every level: `npm run check-levels`.
// Viking labels: colour letter, `+` jarl, `*` wild, `@` scout, `p-…` a prisoner freed from a cage.
import { levels, worlds, startGame } from '../src/game/levels.ts'
import { bosses } from '../src/game/bosses.ts'
import { validateLevelGraph } from '../src/game/engine.ts'
import { solve } from '../src/game/solver.ts'

const rates: number[] = []
const all = [...levels.map((l, i) => ({ l, tag: `${i + 1}` })), ...bosses.map(b => ({ l: b.level, tag: `Boss ${b.world + 1}` }))]
for (const { l, tag } of all) {
  validateLevelGraph(l.loot, l.ships, l.queue, { raven: l.raven })
  const g = startGame(l)
  const label = (id: string) => {
    const v = g.queue.find(x => x.id === id)
    if (!v) {
      const cage = l.loot.find(x => `p-${x.id}` === id)?.cage
      return id + (cage ? cage[0].toUpperCase() : '?')
    }
    return id + (v.kind === 'wild' ? '*' : v.kind === 'scout' ? '@' : v.color![0].toUpperCase() + (v.kind === 'jarl' ? '+' : ''))
  }
  const r = solve(g)
  const raven = l.raven ? `, raven every ${l.raven}` : ''
  rates.push((100 * r.winningLines) / (r.winningLines + r.losingLines))
  console.log(`${tag}. ${l.name}: winnable=${r.winnable} wins=${r.winningLines} losses=${r.losingLines} (${Math.round((100 * r.winningLines) / (r.winningLines + r.losingLines))} % win, par ${r.minWaits} waits${raven})`)
  console.log(`   win:  ${r.winPath?.map(label).join(' ') ?? '-'}`)
  console.log(`   loss: ${r.lossPath?.map(label).join(' ') ?? '-'}`)
}

// 0.6: the difficulty curve. Within a world the win share should fall. A level is flagged when it is
// much harder than the two after it (a spike) or much easier than the two before it (a dip).
console.log('\nDifficulty curve (% of all lines that win):')
let flagged = 0
worlds.forEach((w, wi) => {
  const r = rates.slice(w.first, w.last + 1)
  console.log(`  ${w.name.padEnd(11)} ${r.map(x => String(Math.round(x)).padStart(3)).join(' ')}   boss ${Math.round(rates[levels.length + wi] ?? NaN)}`)
  r.forEach((x, i) => {
    const after = r.slice(i + 1, i + 3), before = r.slice(Math.max(0, i - 2), i)
    const spike = after.length === 2 && x < 0.5 * Math.min(...after) && x < 25
    const dip = before.length === 2 && x > 2 * Math.max(...before) && x > 30
    if (spike || dip) { flagged++; console.log(`    ⚠ level ${w.first + i + 1}: ${Math.round(x)} % – ${spike ? 'much harder than the next two' : 'much easier than the two before'}`) }
  })
})
console.log(flagged ? `${flagged} level(s) stand out.` : 'The curve is smooth.')
