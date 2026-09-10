import assert from 'node:assert/strict';
import { newGame, land, choose, advance, previewChoice } from '../src/engine.js';
import { routeFor } from '../src/route.js';

const runs = 5000;
const initialSeed = 912080;
function expectedRolls(length) {
  const expected = [0];
  for (let n = 1; n <= length; n++) {
    expected[n] = 1;
    for (let die = 1; die <= 6; die++) expected[n] += expected[Math.max(0, n - die)] / 6;
  }
  return expected[length];
}

for (const mode of ['full', 'demo']) {
  const length = routeFor(mode).length;
  console.log(JSON.stringify({ mode, routeLength: length, minimumRolls: Math.ceil(length / 6), maximumRolls: length,
    expectedRollsWithoutEarlyEnd: Number(expectedRolls(length).toFixed(3)), note: 'Dice travel only; actual reading time varies and early endings shorten a game.' }));
  for (const strategy of ['random', 'cash', 'mood', 'balanced']) {
    let seed = initialSeed;
    const rng = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const tally = { complete: 0, mood: 0, turns: 0, completedTurns: 0, minTurns: Infinity, maxTurns: 0 };
    for (let run = 0; run < runs; run++) {
      let s = newGame(mode);
      while (!s.ended) {
        const previous = s.position;
        s = land(s, 1 + Math.floor(rng() * 6));
        assert.ok(s.position > previous && s.position < length);
        const available=s.active.options.map((option,index)=>({index,p:previewChoice(s,option)})).filter(x=>!x.p.disabled);
        assert.ok(available.length>0,'every tile must have a cash-free continuation');
        let choice = available[Math.floor(rng()*available.length)].index;
        if (strategy !== 'random') {
          const candidates = available.map(({p,index}) => {
            return { index, score: strategy === 'cash' ? p.money : strategy === 'mood' ? p.mood :
              Math.min(p.money / 100000, p.mood / s.moodMax) + (p.money / 100000 + p.mood / s.moodMax + p.exp / 150) * 0.08 };
          });
          choice = candidates.sort((a, b) => b.score - a.score)[0].index;
        }
        s = advance(choose(s, choice));
        assert.ok(s.turn <= length);
        assert.ok(s.money >= 0 && s.exp >= 0 && s.mood >= 0 && s.mood <= s.moodMax);
      }
      assert.equal(s.phase, 'finished');
      if (s.ended === 'complete') { assert.equal(s.position, length - 1); assert.ok(s.money >= 0 && s.mood > 0); tally.completedTurns += s.turn; }
      tally[s.ended] += 1; tally.turns += s.turn;
      tally.minTurns = Math.min(tally.minTurns, s.turn); tally.maxTurns = Math.max(tally.maxTurns, s.turn);
    }
    console.log(JSON.stringify({ mode, strategy, seed: initialSeed, runs, ...tally,
      passRate: `${(100 * tally.complete / runs).toFixed(1)}%`, averageTurns: Number((tally.turns / runs).toFixed(2)),
      averageCompletedTurns: tally.complete ? Number((tally.completedTurns / tally.complete).toFixed(2)) : null }));
  }
}
