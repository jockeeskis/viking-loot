// The guided first raid (0.6): Ragnar shows a new player the first move on level 1.
// Pure step logic; the app shows the bubble and the scene points at the target.
import type { Progress } from './progress.ts'

export type TutorialStep = 'send' | 'carry' | 'seats' | 'goal'
/** What the pointing hand shows for a step (null = no hand). */
export type TutorialTarget = 'card' | 'seats' | null

export const TUTORIAL_ID = 'tutorial' // kept in progress.seenStory once done or skipped
const ORDER: TutorialStep[] = ['send', 'carry', 'seats', 'goal']
export const TARGET: Record<TutorialStep, TutorialTarget> = { send: 'card', carry: null, seats: 'seats', goal: null }

/** Only a new player on the first level gets the guided raid, and only once. */
export function wantsTutorial(p: Progress, campaignLevel: number | null): boolean {
  return campaignLevel === 0 && !(p.stars[0] > 0) && !p.seenStory.includes(TUTORIAL_ID)
}

/**
 * The next step. The first step waits for the player to send a viking ('moved');
 * the others are read and confirmed ('ok'). Returns null when the tour is over.
 */
export function nextStep(step: TutorialStep, input: 'moved' | 'ok'): TutorialStep | null {
  if (step === 'send' && input !== 'moved') return step
  if (step !== 'send' && input !== 'ok') return step
  return ORDER[ORDER.indexOf(step) + 1] ?? null
}
