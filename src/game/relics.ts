// The collector's album (0.6): relics from the bosses, the events and the weekly challenge.
// Ownership follows the same sources as the cosmetics (see cosmetics.ts).
import type { Source } from './cosmetics.ts'

export type Relic = { id: string; icon: string; name: string; text: string; source: Source }

export const RELICS: Relic[] = [
  // a keepsake from every boss
  { id: 'relic-fjall', icon: '🐍', name: 'Havsormens fjäll', text: 'Ett skimrande grönt fjäll, stort som en sköld.', source: { kind: 'boss', id: 'serpent' } },
  { id: 'relic-vargtand', icon: '🐺', name: 'Ulvhilds vargtand', text: 'Jarlens halsband, kvarglömt på stranden när hon flydde.', source: { kind: 'boss', id: 'ulvhild' } },
  { id: 'relic-iskristall', icon: '🧊', name: 'Ymers iskristall', text: 'Den smälter aldrig, inte ens i Muspelheim.', source: { kind: 'boss', id: 'ymer' } },
  { id: 'relic-glod', icon: '🔥', name: 'Surts glöd', text: 'En glöd från eldjättens smedja. Den är fortfarande varm.', source: { kind: 'boss', id: 'surt' } },
  { id: 'relic-mask', icon: '🎭', name: 'Lokes mask', text: 'Masken som föll. Bakom den fanns bara ett skratt.', source: { kind: 'boss', id: 'loke' } },
  // the events (fas 5)
  { id: 'relic-julbock', icon: '🐐', name: 'Julbocken', text: 'Flätad av halm till Midvinterblot.', source: { kind: 'event', id: 'midvinterblot' } },
  { id: 'relic-varkvist', icon: '🌿', name: 'Vårkvisten', text: 'Den första gröna kvisten efter vintern, från Vårblot.', source: { kind: 'event', id: 'varblot' } },
  { id: 'relic-krans', icon: '🌸', name: 'Midsommarkransen', text: 'Sju sorters blommor, plockade på midsommarnatten.', source: { kind: 'event', id: 'midsommar' } },
  { id: 'relic-lykta', icon: '🏮', name: 'Alvalyktan', text: 'Den lyser upp dimman när alverna blotas.', source: { kind: 'event', id: 'alvablot' } },
  // the weekly challenge (fas 5)
  { id: 'relic-korpfjader', icon: '🪶', name: 'Korpfjädern', text: 'Från en av Odens korpar. Den vet mer än den säger.', source: { kind: 'weekly' } },
  { id: 'relic-barnsten', icon: '🟠', name: 'Bärnstenen', text: 'Havets guld, med en liten fluga inuti.', source: { kind: 'weekly' } },
  { id: 'relic-runsten', icon: '🪨', name: 'Runstenen', text: 'Runorna berättar om en räd som ingen annan minns.', source: { kind: 'weekly' } },
  { id: 'relic-mjodhorn', icon: '📯', name: 'Mjödhornet', text: 'Alltid fullt, hur mycket Ragnar än dricker.', source: { kind: 'weekly' } },
]
