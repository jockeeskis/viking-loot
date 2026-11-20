import { levels } from '../src/game/levels.ts'
import { createGame, validateLevelGraph } from '../src/game/engine.ts'
import { solve } from '../src/game/solver.ts'
for (const [i, l] of levels.entries()) {
  validateLevelGraph(l.loot)
  const g = createGame(l.loot, l.queue)
  const label = (id: string) => id + g.queue.find(v => v.id === id)!.color[0].toUpperCase()
  const r = solve(g)
  console.log(`${i + 1}. ${l.name}: winnable=${r.winnable} wins=${r.winningLines} losses=${r.losingLines}`)
  console.log(`   win:  ${r.winPath?.map(label).join(' ') ?? '-'}`)
  console.log(`   loss: ${r.lossPath?.map(label).join(' ') ?? '-'}`)
}
