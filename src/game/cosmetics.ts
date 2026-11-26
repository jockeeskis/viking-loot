// Sails and shield rows for the longship (0.6). Pure data and rules; the art is one overlay sheet
// per cosmetic (render_assets.py → render_cosmetics) drawn on top of whichever ship is sailing,
// since every longship shares the same sail and shields.
import { bosses, type BossId } from './bosses.ts'
import { RELICS } from './relics.ts'

export type Slot = 'sail' | 'shields'
/** Where a cosmetic or relic comes from. Achievements and bosses are derived from progress; events and
 * the weekly challenge (fas 5) add ids to `meta.owned`. */
export type Source =
  | { kind: 'default' }
  | { kind: 'achievement'; id: string }
  | { kind: 'boss'; id: BossId }
  | { kind: 'event'; id: string }
  | { kind: 'weekly' }
export type Cosmetic = { id: string; slot: Slot; name: string; text: string; source: Source }

export const DEFAULT_SAIL = 'sail-standard'
export const DEFAULT_SHIELDS = 'shields-standard'

const ach = (id: string): Source => ({ kind: 'achievement', id })
export const COSMETICS: Cosmetic[] = [
  { id: DEFAULT_SAIL, slot: 'sail', name: 'Skeppets eget', text: 'Seglet som hör till skeppet.', source: { kind: 'default' } },
  { id: 'sail-rutor', slot: 'sail', name: 'Rutsegel', text: 'Rött och vitt i rutor, som de gamla handelsskeppen.', source: ach('first-raid') },
  { id: 'sail-korset', slot: 'sail', name: 'Nordkorset', text: 'Ett gult kors på blått, för den som seglat hela kusten.', source: ach('kusten') },
  { id: 'sail-fjord', slot: 'sail', name: 'Fjordsegel', text: 'Grönt, vitt och blått som fjällen, snön och vattnet.', source: ach('fjordarna') },
  { id: 'sail-frost', slot: 'sail', name: 'Frostsegel', text: 'En isblå romb på snövitt.', source: ach('isriket') },
  { id: 'sail-glod', slot: 'sail', name: 'Glödsegel', text: 'Sotsvart med lavaglödande vinklar.', source: ach('muspelheim') },
  { id: 'sail-regnbage', slot: 'sail', name: 'Bifrostsegel', text: 'Alla regnbågens färger, som bron till Asgård.', source: ach('asgard') },
  { id: 'sail-sol', slot: 'sail', name: 'Solsegel', text: 'En gyllene sol – för den som besegrat alla bossar.', source: ach('boss-hunter') },
  { id: DEFAULT_SHIELDS, slot: 'shields', name: 'Skeppets egna', text: 'Sköldarna som hör till skeppet.', source: { kind: 'default' } },
  { id: 'shields-havet', slot: 'shields', name: 'Havets sköldar', text: 'Blått och vitt som skummet på vågorna.', source: ach('loot-100') },
  { id: 'shields-lag', slot: 'shields', name: 'Lagets sköldar', text: 'Rött, blått och gult – Ragnar, Björn och Freja.', source: ach('perfect-10') },
  { id: 'shields-delad', slot: 'shields', name: 'Delade sköldar', text: 'Halvt rött, halvt vitt.', source: ach('chests-10') },
  { id: 'shields-krut', slot: 'shields', name: 'Krutsköldar', text: 'Svart och eldorange, för den som sprängt sin beskärda del.', source: ach('kegs-25') },
  { id: 'shields-drake', slot: 'shields', name: 'Drakens sköldar', text: 'Grönt och guld i fyrdelade fält.', source: ach('endless-10') },
  { id: 'shields-guld', slot: 'shields', name: 'Guldsköldar', text: 'Rent guld – Hela Norden i guld.', source: ach('all-gold') },
]

/** What decides ownership: earned achievements, beaten bosses and ids granted by events. */
export type OwnCtx = { unlocked: Record<string, string>; owned: string[]; bossStars: (number | null | undefined)[] }

export function earned(id: string, source: Source, c: OwnCtx): boolean {
  switch (source.kind) {
    case 'default': return true
    case 'achievement': return !!c.unlocked[source.id]
    case 'boss': {
      const b = bosses.find(x => x.id === source.id)
      return !!b && (c.bossStars[b.world] ?? 0) > 0
    }
    default: return c.owned.includes(id)
  }
}
export const cosmetic = (id: string) => COSMETICS.find(c => c.id === id)
export const owns = (id: string, c: OwnCtx) => {
  const x = cosmetic(id) ?? RELICS.find(r => r.id === id)
  return !!x && earned(x.id, x.source, c)
}
/** Every cosmetic and relic id the player has (used to spot new ones after a raid). */
export const allOwned = (c: OwnCtx) => [...COSMETICS, ...RELICS].filter(x => earned(x.id, x.source, c)).map(x => x.id)

/** Put on a sail or a shield row. Anything not owned (or unknown) leaves the choice as it was. */
export function equip<T extends { sail: string; shields: string }>(meta: T, id: string, c: OwnCtx): T {
  const x = cosmetic(id)
  if (!x || !earned(x.id, x.source, c)) return meta
  return { ...meta, [x.slot]: id }
}
/** Add ids from an event or the weekly challenge; each is given once. */
export function grant<T extends { owned: string[] }>(meta: T, ids: string[]): T {
  const add = ids.filter(id => !meta.owned.includes(id) && (cosmetic(id) || RELICS.some(r => r.id === id)))
  return add.length ? { ...meta, owned: [...meta.owned, ...add] } : meta
}
/** The overlay to draw for a slot, or null for the ship's own sail or shields. */
export const overlayOf = (id: string) => (id === DEFAULT_SAIL || id === DEFAULT_SHIELDS || !cosmetic(id) ? null : id)
