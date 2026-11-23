// Solvability report for every level: `npm run check-levels`.
// Viking labels: colour letter, `+` jarl, `*` wild, `@` scout, `p-…` a prisoner freed from a cage.
import { levels, startGame } from '../src/game/levels.ts'
import { bosses } from '../src/game/bosses.ts'
import { validateLevelGraph } from '../src/game/engine.ts'
import { solve } from '../src/game/solver.ts'

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
  console.log(`${tag}. ${l.name}: winnable=${r.winnable} wins=${r.winningLines} losses=${r.losingLines} (${Math.round((100 * r.winningLines) / (r.winningLines + r.losingLines))} % win, par ${r.minWaits} waits${raven})`)
  console.log(`   win:  ${r.winPath?.map(label).join(' ') ?? '-'}`)
  console.log(`   loss: ${r.lossPath?.map(label).join(' ') ?? '-'}`)
}
