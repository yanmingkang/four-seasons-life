import { restore, choose } from './engine.js';

export const SAMPLE_ID = 'cross-team-v1';
const SAMPLE_CONTEXT = Object.freeze({ id: SAMPLE_ID, eventId: 'cell-13', presetHistoryCount: 2 });

/**
 * An explicitly preset, standalone judges' scene. The two setup moves provide
 * valid v4 engine context; they are NOT choices made by the sample player.
 * This module never reads/writes storage. Callers must keep this state separate
 * from the normal journey and must never persist it to a regular game slot.
 */
export function createSampleState(choice) {
  if (choice !== undefined && (!Number.isInteger(choice) || choice < 0 || choice > 2)) {
    throw new TypeError('样板关只支持三个选项，或尚未选择的状态。');
  }
  const prepared = restore({
    version: 4, mode: 'full', name: '刘看山', talent: 'defense', phase: 'choice',
    moves: [{ die: 6, choice: 2 }, { die: 6, choice: 0 }], pendingDie: 1,
  });
  if (!prepared || prepared.active?.id !== SAMPLE_CONTEXT.eventId || prepared.history.length !== SAMPLE_CONTEXT.presetHistoryCount) {
    throw new Error('样板关的预设情境与当前规则不匹配。');
  }
  const state = choice === undefined ? prepared : choose(prepared, choice);
  return { ...state, sampleScenario: SAMPLE_CONTEXT };
}
