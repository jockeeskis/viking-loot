// Short introductions shown the first time a level uses a new mechanic.
import type { Level } from './levels.ts'

export type Mechanic = 'house' | 'stone' | 'jarl' | 'wild' | 'hidden'

export const INTROS: Record<Mechanic, { icon: string; title: string; text: string }> = {
  house: { icon: '🏠', title: 'Nytt: Hus', text: 'Ett hus tål två hugg. Varje hugg kostar vikingen en bärplats – två vikingar i samma färg kan dela på det.' },
  stone: { icon: '🪨', title: 'Nytt: Stenhinder', text: 'Stenen går inte att plundra. Den rasar av sig själv när någon skatt bredvid plundras.' },
  jarl: { icon: '👑', title: 'Nytt: Jarlen', text: 'Jarlen är starkare än andra vikingar och bär tre skatter i stället för två.' },
  wild: { icon: '🌈', title: 'Nytt: Ylva', text: 'Ylva har ingen färg. Den första skatten hon når bestämmer hennes färg för resten av räden.' },
  hidden: { icon: '❓', title: 'Nytt: Dolda skatter', text: 'Skatter under presenning visar sin färg först när vägen fram till dem är fri.' },
}

/** Mechanics used by a level, in the order they are introduced in Fjordarna. */
export function mechanicsOf(level: Level): Mechanic[] {
  const found: Mechanic[] = []
  if (level.loot.some(l => (l.hits ?? 1) > 1)) found.push('house')
  if (level.loot.some(l => l.stone)) found.push('stone')
  if (level.queue.some(q => typeof q !== 'string' && q.kind === 'jarl')) found.push('jarl')
  if (level.queue.some(q => typeof q !== 'string' && q.kind === 'wild')) found.push('wild')
  if (level.loot.some(l => l.hidden)) found.push('hidden')
  return found
}
