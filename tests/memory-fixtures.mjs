import {newGame,land,choose,advance,previewChoice} from '../src/engine.js';
import {effortFor} from '../src/journey-rhythm.js';
export function completeMemoryFixture(mode='full'){
  let s=newGame(mode,{enriched:true});
  const stops=mode==='full'?[3,6,10,13,17,20,24,27,30,34,38,40]:[3,6,9,12];
  for(const stop of stops){
    if(s.ended)throw Error('Fixture unexpectedly ended');
    s=land(s,stop-1-s.position);
    const options=s.active.options.map((o,i)=>({i,p:previewChoice(s,o)})).filter(e=>!e.p.disabled)
      .sort((a,b)=>effortFor(s.active.number,a.i)-effortFor(s.active.number,b.i));
    s=advance(choose(s,options[0].i));
  }
  if(s.ended!=='complete')throw Error('Fixture did not finish');return s;
}
export function earlyMemoryFixture(){
  let s=newGame('full',{enriched:true,talent:'ambitious'});
  while(!s.ended){s=land(s,1);const options=s.active.options.map((o,i)=>({i,p:previewChoice(s,o)})).filter(e=>!e.p.disabled).sort((a,b)=>effortFor(s.active.number,b.i)-effortFor(s.active.number,a.i));s=advance(choose(s,options[0].i));}
  if(s.ended!=='mood')throw Error('Expected early mood ending');return s;
}

// Deterministic test-only route reproducing the user's hospital choice/method
// pair without modifying production dice or inventing another visited event.
export function hospitalMemoryFixture(){
  let s=newGame('full',{enriched:true});
  for(const stop of [5,9,14,18,24,29,35,40]){
    if(s.ended)throw Error('Hospital fixture unexpectedly ended');
    s=land(s,stop-1-s.position);
    const options=s.active.options.map((o,i)=>({i,p:previewChoice(s,o)})).filter(e=>!e.p.disabled)
      .sort((a,b)=>effortFor(s.active.number,a.i)-effortFor(s.active.number,b.i));
    s=advance(choose(s,stop===18?0:options[0].i));
  }
  if(s.ended!=='complete')throw Error('Hospital fixture did not finish');return s;
}

// Legal test-only routes for the composed title UI. They do not alter the
// product's random dice, and all resources still settle through the engine.
export function titleMemoryFixture(kind){
  const routes={
    mixed:[[5,0],[11,0],[14,0],[19,2],[25,0],[30,2],[36,2],[40,0]],
    keepsake:[[4,1],[10,1],[16,2],[22,0],[28,1],[34,2],[40,0]],
  };
  if(!routes[kind])throw Error('Unknown title fixture');
  let s=newGame('full',{enriched:true,talent:'defense',lifeSchema:2});
  for(const [cell,choice]of routes[kind]){
    const die=cell-1-s.position;
    if(s.ended||die<1||die>6)throw Error('Invalid title fixture move');
    s=advance(choose(land(s,die),choice));
  }
  if(s.ended!=='complete')throw Error('Title fixture did not finish');
  return s;
}
