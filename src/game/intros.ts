// Short introductions shown the first time a level uses a new mechanic.
import type { Level } from './levels.ts'

export type Mechanic = 'house' | 'stone' | 'jarl' | 'wild' | 'hidden' | 'key' | 'ice' | 'ships' | 'scout'

export const INTROS: Record<Mechanic, { icon: string; title: string; text: string }> = {
  house: { icon: '🏠', title: 'Nytt: Hus', text: 'Ett hus tål två hugg. Varje hugg kostar vikingen en bärplats – två vikingar i samma färg kan dela på det.' },
  stone: { icon: '🪨', title: 'Nytt: Stenhinder', text: 'Stenen går inte att plundra. Den rasar av sig själv när någon skatt bredvid plundras.' },
  jarl: { icon: '👑', title: 'Nytt: Jarlen', text: 'Jarlen är starkare än andra vikingar och bär tre skatter i stället för två.' },
  wild: { icon: '🌈', title: 'Nytt: Ylva', text: 'Ylva har ingen färg. Den första skatten hon når – räknat från högen längst till vänster – bestämmer hennes färg för resten av räden.' },
  hidden: { icon: '❓', title: 'Nytt: Dolda skatter', text: 'Skatter under presenning visar sin färg först när vägen fram till dem är fri.' },
  key: { icon: '🗝️', title: 'Nytt: Nycklar och kistor', text: 'Hänglåset har samma färg som nyckeln som öppnar det. Plundra nyckeln – var den än ligger på ön – så flyger den till låset och kistan går att ta.' },
  ice: { icon: '🧊', title: 'Nytt: Is', text: 'Isen smälter lite för varje viking du skickar. Siffran visar hur många drag som är kvar innan skatten går att ta.' },
  ships: { icon: '⛵', title: 'Nytt: Färgskepp', text: 'Det lilla skeppet tar bara vikingar i sin färg. Där kan de vänta tryggt – bara det stora skeppet kan bli fullt.' },
  scout: { icon: '🔭', title: 'Nytt: Spejaren Sigrid', text: 'Sigrid bär ingenting, men när du skickar henne visar hon alla dolda skatter på ön.' },
}

/** Mechanics used by a level, in the order they are introduced in Fjordarna. */
export function mechanicsOf(level: Level): Mechanic[] {
  const found: Mechanic[] = []
  if (level.loot.some(l => (l.hits ?? 1) > 1)) found.push('house')
  if (level.loot.some(l => l.stone)) found.push('stone')
  if (level.queue.some(q => typeof q !== 'string' && q.kind === 'jarl')) found.push('jarl')
  if (level.queue.some(q => typeof q !== 'string' && q.kind === 'wild')) found.push('wild')
  if (level.loot.some(l => l.hidden)) found.push('hidden')
  if (level.loot.some(l => l.lockedBy?.length)) found.push('key')
  if (level.loot.some(l => l.frozen)) found.push('ice')
  if ((level.ships?.length ?? 1) > 1) found.push('ships')
  if (level.queue.some(q => typeof q !== 'string' && q.kind === 'scout')) found.push('scout')
  return found
}
