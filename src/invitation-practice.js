import {createSampleState} from './sample-scenario.js';
import {getPracticeScene} from './practice-scenes.js';

export const INVITATION_PRACTICE_ID='cross-team-invite-v1';
const CONTEXT=Object.freeze({id:INVITATION_PRACTICE_ID});
const {openings:_selectedChoiceOpenings,...crossTeam}=getPracticeScene('cell-13');
const INVITATION_SCENE=Object.freeze({
  ...crossTeam,
  context:'独立假设情境：假设你已整理时间线，练习回应同事质疑。地点、前置记录和方案都是练习预设，不代表你在正式旅程中经历或选择过；练习不改变本局资源、称号或结局。',
  opening:'假设你已整理好时间线，我作为虚构同事问你：所以，你是在说这都是我们的问题？',
});

/** An ephemeral rehearsal; never persist this preset in the real journey slot. */
export function createInvitationPracticeState(){
  const {sampleScenario:_sampleScenario,...state}=createSampleState(0);
  return {...state,invitationPractice:CONTEXT};
}

export function getInvitationPracticeScene(){return INVITATION_SCENE;}
