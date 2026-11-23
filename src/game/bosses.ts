// The four boss raids (0.5): one after each world, unlocked when the world's last level is won.
// They use only mechanics the player already knows, plus one twist each. Found with
// `npm run generate-levels -- --bosses` and checked by the solver (`npm run check-levels`, bosses.test.ts).
// Stars are saved apart from the levels (`Progress.bossStars`), so level indices never move.
import { stacks, jarl, WILD, type Level } from './levels.ts'
import type { LootColor } from './engine.ts'

export type BossId = 'serpent' | 'ulvhild' | 'ymer' | 'surt'
export type Boss = { id: BossId; world: number; icon: string; level: Level }

const R: LootColor = 'red', B: LootColor = 'blue', Y: LootColor = 'yellow'

export const bosses: Boss[] = [
  {
    id: 'serpent', world: 0, icon: '🐍',
    level: {
      name: 'Havsormen',
      par: 1,
      hint: 'Ormen har krossat en av skeppets platser – bara två finns kvar, och den andra sänker räden.',
      queue: [Y, B, R, B, R, B, Y, R],
      ships: [{ slots: 2 }],
      loot: stacks(['ybsy', 'yrrb', 'bBrr', 'rybr']),
    },
  },
  {
    id: 'ulvhild', world: 1, icon: '🐺',
    level: {
      name: 'Jarl Ulvhild',
      par: 2,
      hint: 'Ulvhild har lockat bort alla vanliga vikingar. Bara jarlar och Ylva följer med – och skatten är dold.',
      queue: [jarl(B), jarl(Y), WILD, jarl(R), WILD, jarl(Y)],
      loot: stacks(['?ys?br', '?y?y?yy', '?y?b?r?yy', '?b?b?rb']),
    },
  },
  {
    id: 'ymer', world: 2, icon: '🧊',
    level: {
      name: 'Frostjätten Ymer',
      par: 5,
      hint: 'Jätten har frusit nästan allt. Isen släpper i vågor – räkna dragen och använd det röda skeppet.',
      queue: [Y, B, R, Y, R, Y, B, R, B],
      ships: [{ slots: 3 }, { slots: 2, color: R }],
      loot: stacks(['~2rb~7yy', 'b~2y~3yy~7!r', '~5r~2bbb', 'bry~3#r~3r']),
    },
  },
  {
    id: 'surt', world: 3, icon: '🔥',
    level: {
      name: 'Eldjätten Surt',
      par: 1,
      hint: 'Krutfat, tidvatten, en fånge och korpen var fjärde drag – Surts sista prov.',
      queue: [B, R, Y, Y, R, B, R, R],
      raven: 4,
      loot: stacks(['≈rbrbr', 'rr*br', 'ybss', 'yry*y&rr']),
    },
  },
]

export const bossOf = (world: number) => bosses.find(b => b.world === world)
