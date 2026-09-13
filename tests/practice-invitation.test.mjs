import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createInvitationProgress,restoreInvitationProgress,getInvitationPlacement,markInvitationSeen,resolveInvitation} from '../src/practice-invitation.js';
import {newGame,land,choose,advance,snapshot,restore} from '../src/engine.js';

const entry=(cell,turn=1)=>({eventId:`cell-${String(cell).padStart(2,'0')}`,turn,choice:0});
const state=(cells=[],extra={})=>({phase:'feedback',ended:null,history:cells.map((cell,index)=>entry(cell,index+1)),...extra});
const fresh=createInvitationProgress;

test('each new game starts unseen and returns a fresh minimal object',()=>{
  const first=fresh(),second=fresh();
  assert.deepEqual(first,{version:1,seen:false,resolved:false,kind:null});
  assert.notEqual(first,second);
  first.seen=true;
  assert.equal(second.seen,false);
});

test('fallback first appears after three settled events, not after reaching cell three',()=>{
  assert.equal(getInvitationPlacement(state([3]),fresh()),null);
  assert.equal(getInvitationPlacement(state([6,12]),fresh()),null);
  assert.equal(getInvitationPlacement(state([2,5,9]),fresh()),'fallback');
  assert.equal(getInvitationPlacement(state([2,5,9,15]),fresh()),'fallback');
  assert.equal(getInvitationPlacement(state([2,5],{active:{id:'cell-09'},phase:'choice'}),fresh()),null);
});

test('fallback is limited to feedback, never movement, choosing, or a ready screen',()=>{
  for(const phase of ['ready','choice','moving','finished',undefined]){
    assert.equal(getInvitationPlacement(state([2,5,9],{phase}),fresh()),null);
  }
});

test('the natural cells keep their own feedback entry even after a previous invitation was resolved',()=>{
  for(const cell of [11,13]){
    for(const meta of [fresh(),markInvitationSeen(fresh(),'natural'),markInvitationSeen(fresh(),'fallback'),resolveInvitation(markInvitationSeen(fresh(),'fallback')),resolveInvitation(markInvitationSeen(fresh(),'ending'))]){
      assert.equal(getInvitationPlacement(state([2,6,cell]),meta),'natural');
    }
  }
  assert.equal(getInvitationPlacement(state([11,15]),resolveInvitation(markInvitationSeen(fresh(),'natural'))),null);
});

test('the last settled event ID, not route position or a pending natural landing, identifies a natural entry',()=>{
  assert.equal(getInvitationPlacement(state([5],{position:10,active:{id:'cell-11'}}),fresh()),null);
  assert.equal(getInvitationPlacement(state([11],{position:2}),fresh()),'natural');
  assert.equal(getInvitationPlacement(state([],{phase:'choice',active:{id:'cell-13'}}),fresh()),null);
});

test('an unseen invitation at completion or mood exhaustion becomes ending, not fallback',()=>{
  for(const ended of ['complete','mood']){
    for(const phase of ['feedback','finished']){
      for(const cells of [[4],[2,5,9],[2,6,11],[2,6,13]]){
        assert.equal(getInvitationPlacement(state(cells,{ended,phase}),fresh()),'ending');
      }
    }
  }
});

test('a seen or declined invitation is not reoffered at the ending',()=>{
  for(const kind of ['natural','fallback','ending']){
    const seen=markInvitationSeen(fresh(),kind);
    for(const meta of [seen,resolveInvitation(seen)]){
      assert.equal(getInvitationPlacement(state([2,5,9,40],{ended:'complete'}),meta),null);
      assert.equal(getInvitationPlacement(state([2,6,13],{ended:'mood',phase:'finished'}),meta),null);
    }
  }
});

test('seen invitations do not remove the original 11/13 entry from a terminal feedback screen',()=>{
  for(const cell of [11,13]){
    for(const kind of ['natural','fallback','ending']){
      const shown=markInvitationSeen(fresh(),kind);
      for(const meta of [shown,resolveInvitation(shown)]){
        for(const ended of ['mood','complete']){
          assert.equal(getInvitationPlacement(state([2,6,cell],{ended}),meta),'natural');
          assert.equal(getInvitationPlacement(state([2,6,cell],{ended,phase:'finished'}),meta),null);
        }
      }
    }
    assert.equal(getInvitationPlacement(state([2,6,cell],{ended:'mood'}),fresh()),'ending','a never-seen invitation still belongs in the optional ending entry');
  }
  assert.equal(getInvitationPlacement(state([2,6,15],{ended:'mood'}),markInvitationSeen(fresh(),'fallback')),null,'other terminal feedback cannot revive an unresolved fallback');
});

test('an unresolved fallback remains visible when its feedback is reloaded',()=>{
  const shown=markInvitationSeen(fresh(),'fallback');
  const restored=restoreInvitationProgress(JSON.parse(JSON.stringify(shown)),state([2,5,9]));
  assert.equal(getInvitationPlacement(state([2,5,9]),restored),'fallback');
  assert.equal(getInvitationPlacement(state([2,5,9],{phase:'ready'}),restored),null);
  assert.equal(getInvitationPlacement(state([2,5,9]),resolveInvitation(restored)),null);
});

test('skip resolves only UI metadata and suppresses subsequent fallback but not a later natural entry',()=>{
  const seen=Object.freeze(markInvitationSeen(fresh(),'fallback'));
  const skipped=resolveInvitation(seen);
  assert.equal(seen.resolved,false);
  assert.deepEqual(skipped,{version:1,seen:true,resolved:true,kind:'fallback'});
  assert.equal(getInvitationPlacement(state([2,5,9,15]),skipped),null);
  assert.equal(getInvitationPlacement(state([2,5,9,13]),skipped),'natural');
  assert.deepEqual(fresh(),{version:1,seen:false,resolved:false,kind:null});
});

test('mark and resolve are immutable and idempotent; a later natural entry does not reopen a resolved fallback',()=>{
  const original=Object.freeze(fresh());
  const marked=markInvitationSeen(original,'fallback'),resolved=Object.freeze(resolveInvitation(marked));
  assert.equal(original.seen,false);
  assert.deepEqual(markInvitationSeen(resolved,'natural'),resolved);
  assert.deepEqual(resolveInvitation(resolved),resolved);
  assert.notEqual(resolveInvitation(resolved),resolved);
  assert.deepEqual(resolveInvitation(original),fresh());
  for(const kind of [undefined,null,'bad',11])assert.deepEqual(markInvitationSeen(original,kind),fresh());
});

test('old saves infer seen natural entry only from a settled cell 11 or 13, never pending or crossed cells',()=>{
  for(const cell of [11,13]){
    const restored=restoreInvitationProgress(undefined,state([2,cell,18]));
    assert.deepEqual(restored,{version:1,seen:true,resolved:false,kind:'natural'});
    assert.equal(getInvitationPlacement(state([2,cell,18]),restored),null);
  }
  assert.deepEqual(restoreInvitationProgress(undefined,state([6,12,18])),fresh());
  assert.deepEqual(restoreInvitationProgress(undefined,state([6],{active:{id:'cell-11'},phase:'choice'})),fresh());
});

test('a valid metadata record takes priority over inference, and restored data uses only whitelisted fields',()=>{
  const raw={...fresh(),name:'PRIVATE',chat:'SECRET',nested:{token:'SECRET'}};
  const restored=restoreInvitationProgress(raw,state([11,13]));
  assert.deepEqual(restored,fresh());
  assert.notEqual(restored,raw);
  const resolved=resolveInvitation(markInvitationSeen(fresh(),'fallback'));
  assert.deepEqual(restoreInvitationProgress(resolved,state([11,13])),resolved);
  assert.doesNotMatch(JSON.stringify(restoreInvitationProgress({...resolved,privateText:'SECRET'},state([]))),/SECRET|privateText/);
});

test('invalid metadata is rejected without accepting truthy booleans, inconsistent flags or inherited values',()=>{
  const bad=[null,undefined,[],true,1,'{}',{},new Date(),{...fresh(),version:2},{...fresh(),version:'1'},{...fresh(),seen:'false'},{...fresh(),resolved:1},{...fresh(),seen:true},{...fresh(),resolved:true},{...fresh(),kind:'natural'}, {version:1,seen:true,resolved:false,kind:'not-a-kind'},Object.create(fresh())];
  for(const raw of bad){
    assert.deepEqual(restoreInvitationProgress(raw,state([])),fresh());
    assert.deepEqual(restoreInvitationProgress(raw,state([11])),{version:1,seen:true,resolved:false,kind:'natural'});
  }
  const polluted=JSON.parse('{"version":1,"seen":false,"resolved":false,"kind":null,"__proto__":{"polluted":true}}');
  assert.deepEqual(restoreInvitationProgress(polluted,state([])),fresh());
  assert.equal({}.polluted,undefined);
  assert.deepEqual(restoreInvitationProgress(Object.assign(Object.create(null),fresh()),state([])),fresh());
});

test('missing or invalid history does not manufacture settled events or natural entries',()=>{
  for(const history of [undefined,null,{},[null,{},entry(11,0),{...entry(13),choice:5},{...entry(11),eventId:'cell-011'}]]){
    assert.deepEqual(restoreInvitationProgress(undefined,{history}),fresh());
    assert.equal(getInvitationPlacement({phase:'feedback',history},fresh()),null);
  }
  assert.equal(getInvitationPlacement(undefined,fresh()),null);
});

test('a real three-event journal reaches fallback with no mutation to dice, balances, history or saved engine data',()=>{
  let game=newGame('full',{enriched:true});
  for(const cell of [2,5,9]){
    game=choose(land(game,cell-game.position-1),0);
    if(cell!==9)game=advance(game);
  }
  const before=structuredClone(game),saved=snapshot(game);
  const meta=markInvitationSeen(fresh(),getInvitationPlacement(game,fresh()));
  assert.equal(meta.kind,'fallback');
  const skipped=resolveInvitation(meta);
  assert.equal(getInvitationPlacement(game,skipped),null);
  assert.deepEqual(game,before);
  assert.deepEqual(snapshot(game),saved);
  assert.deepEqual(restore(saved),game);
  assert.equal('practiceInvitation' in saved,false);
  assert.equal('practiceInvitation' in saved.extension,false);
});
