import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame, land, choose, advance, snapshot, restore, useItem,
  interactCompanion, interactBusiness, purchaseHome,
  getInventory, getBusiness, getHome, getLifeReport,
} from '../src/engine.js';

// These fixtures begin at the real opening state. A stop is [cell number,
// zero-based choice]; resources, route position, flags and inventory are never
// assigned by the tests. Every transition must also survive a saved-game replay.
function checked(state) {
  const saved = snapshot(state);
  assert.deepEqual(restore(saved), state);
  assert.ok(saved.extension.actions.length <= 224);
  assert.ok(new TextEncoder().encode(JSON.stringify(saved)).length <= 8192);
  for (const move of saved.moves) assert.ok(move.die >= 1 && move.die <= 6);
  return state;
}

const fresh = (talent = 'defense', lifeSchema = 2) => checked(newGame('full', {enriched: true, talent, lifeSchema}));

function stop(state, cell, choice, finishTurn = true) {
  assert.equal(state.phase, 'ready');
  assert.equal(state.ended, null);
  const die = cell - (state.position + 1);
  assert.ok(Number.isInteger(die) && die >= 1 && die <= 6, `illegal die for cell ${cell}: ${die}`);
  state = checked(land(state, die));
  assert.equal(state.active.number, cell);
  state = checked(choose(state, choice));
  return finishTurn ? checked(advance(state)) : state;
}

function play(stops, state = fresh()) {
  for (const [cell, choice] of stops) state = stop(state, cell, choice);
  return state;
}

const LOW_MOOD_ROUTE = [[4, 0], [7, 0], [10, 0], [11, 0], [13, 0]];

test('a legacy schema-one journey reaches mood below 20 and actually uses the manual oden item', () => {
  let state = play(LOW_MOOD_ROUTE.slice(0, -1), fresh('ambitious', 1));
  assert.equal(state.mood, 21);
  assert.throws(() => useItem(state, 'oden'), /低于 20/);
  state = stop(state, 13, 0);
  assert.equal(state.mood, 10);
  assert.equal(state.life.treeholeUsed, false);
  assert.equal(getInventory(state).find(item => item.id === 'oden').usable, true);
  const moneyBefore = state.money;
  state = checked(useItem(state, 'oden'));
  assert.equal(state.mood, 45);
  assert.equal(state.money, moneyBefore);
  assert.equal(state.life.inventory.oden, 0);
  assert.deepEqual(state.life.usedItems.at(-1), {id: 'oden', turn: 5});
  assert.equal(state.ended, null);
});

test('a legacy schema-one treehole rescue does not prevent a subsequent real mood-exhaustion ending', () => {
  let state = play(LOW_MOOD_ROUTE, fresh('ambitious', 1));
  state = stop(state, 15, 0);
  assert.equal(state.mood, 15);
  assert.equal(state.life.treeholeUsed, true);
  assert.equal(state.ended, null);
  assert.match(state.history.at(-1).talentNote, /树洞回声/);
  state = stop(state, 19, 1);
  assert.equal(state.mood, 4);
  state = stop(state, 20, 0, false);
  assert.equal(state.phase, 'feedback');
  assert.equal(state.mood, 0);
  assert.equal(state.ended, 'mood');
  assert.equal(state.history.filter(record => /树洞回声/.test(record.talentNote)).length, 1);
  for (const terminal of [state, checked(advance(state))]) {
    assert.throws(() => useItem(terminal, 'oden'), /此时不能/);
    assert.throws(() => interactCompanion(terminal, 'listen'), /此时不能/);
    assert.equal(terminal.mood, 0);
    assert.equal(getLifeReport(terminal).treehole.remaining, 0);
  }
  state = checked(advance(state));
  assert.equal(state.phase, 'finished');
});

test('a schema-two legal journey consumes automatic oden, then treehole, before real mood exhaustion', () => {
  let state = play(LOW_MOOD_ROUTE.slice(0, -1), fresh('ambitious'));
  assert.equal(state.life.schema, 2);
  assert.equal(state.mood, 21);
  assert.equal(state.life.inventory.oden, 1);
  assert.equal(state.life.treeholeUsed, false);

  state = stop(state, 13, 0);
  assert.equal(state.mood, 45, 'ten remaining mood automatically recovers thirty-five');
  assert.equal(state.life.inventory.oden, 0);
  assert.equal(state.life.treeholeUsed, false, 'oden preserves the last-resort treehole');
  assert.deepEqual(state.life.usedItems.at(-1), {id: 'oden', turn: 4, automatic: true});
  assert.match(state.history.at(-1).talentNote, /关东煮自动守护/);
  assert.equal(state.life.actions.some(([command, id]) => command === 'i' && id === 'oden'), false, 'no manual item command is needed');

  state = play([[15, 0], [19, 1]], state);
  assert.equal(state.mood, 23);
  state = stop(state, 20, 0);
  assert.equal(state.mood, 15);
  assert.equal(state.life.treeholeUsed, true);
  assert.equal(state.ended, null);
  assert.match(state.history.at(-1).talentNote, /树洞回声/);

  state = play([[21, 1], [22, 1]], state);
  assert.equal(state.mood, 4);
  state = stop(state, 23, 1, false);
  assert.equal(state.phase, 'feedback');
  assert.equal(state.mood, 0);
  assert.equal(state.ended, 'mood');
  assert.equal(state.history.filter(record => /关东煮自动守护/.test(record.talentNote)).length, 1);
  assert.equal(state.history.filter(record => /树洞回声/.test(record.talentNote)).length, 1);
  assert.equal(getLifeReport(state).treehole.remaining, 0);
  for (const terminal of [state, checked(advance(state))]) {
    assert.throws(() => useItem(terminal, 'oden'), /此时不能/);
    assert.throws(() => interactCompanion(terminal, 'listen'), /此时不能/);
    assert.equal(terminal.mood, 0);
  }
  state = checked(advance(state));
  assert.equal(state.phase, 'finished');
  assert.equal(snapshot(state).extension.schema, 2);
});

const TITLE_ROUTES = [
  {
    id: 'together', name: '琴瑟和鸣破局者', listen: true,
    stops: [[2, 0], [5, 0], [6, 0], [9, 0], [10, 1], [16, 0], [17, 0], [19, 0], [25, 0], [26, 0], [32, 2], [38, 0], [40, 0]],
    final: {money: 44800, mood: 110, exp: 230, relationship: 79},
  },
  {
    id: 'explorer', name: '四季行路人', locked: true,
    stops: [[6, 1], [11, 1], [17, 1], [21, 0], [27, 0], [33, 1], [39, 1], [40, 0]],
    final: {money: 215000, mood: 100, exp: 70, relationship: 55},
  },
  {
    id: 'balanced', name: '小城慢调生活大师',
    stops: [[4, 1], [10, 1], [16, 2], [22, 0], [28, 1], [34, 2], [40, 0]],
    final: {money: 25000, mood: 100, exp: 35, relationship: 67},
  },
  {
    id: 'resilient', name: '四季行路人', locked: true,
    stops: [[6, 1], [11, 1], [17, 2], [23, 2], [29, 2], [35, 0], [40, 0]],
    final: {money: 5000, mood: 100, exp: 45, relationship: 55},
  },
];

for (const fixture of TITLE_ROUTES) {
  test(`a legal completed journey ${fixture.locked?'does not falsely award':'displays'} the ${fixture.id} title`, () => {
    let state = fresh();
    if (fixture.listen) state = checked(interactCompanion(state, 'listen'));
    state = play(fixture.stops, state);
    assert.equal(state.phase, 'finished');
    assert.equal(state.ended, 'complete');
    assert.deepEqual({
      money: state.money, mood: state.mood, exp: state.exp,
      relationship: state.life.companion.relationship,
    }, fixture.final);
    const report = getLifeReport(state);
    assert.equal(report.title, report.journeyTitle.name);
    const keepsake=report.commemorations.find(item=>item.id===fixture.id);
    assert.equal(!!keepsake,!fixture.locked);
    if(keepsake)assert.equal(keepsake.name,fixture.name);
    assert.equal(report.titles.find(title => title.id === fixture.id).unlocked, !fixture.locked);
    assert.ok(report.titleReason.length > 0);
    assert.ok(report.titleEvidence.length > 0);
    assert.deepEqual(state.history.map(record => record.position + 1), fixture.stops.map(([cell]) => cell));
  });
}

test('one legal journey pays the home deposit and settles the business operation', () => {
  let state = play([[6, 1], [11, 1], [17, 1], [21, 0], [27, 0], [29, 0]]);
  assert.equal(state.money, 215000);
  assert.equal(getBusiness(state).stage, 'idea');
  state = checked(interactBusiness(state, 'test'));
  assert.equal(state.money, 213000);
  assert.equal(state.life.business.stage, 'tested');
  assert.throws(() => interactBusiness(state, 'launch'), /当前不能/);

  state = stop(state, 30, 0, false);
  assert.equal(getHome(state).planned, true);
  assert.equal(getHome(state).owned, false);
  assert.equal(getHome(state).canBuy, true);
  state = checked(purchaseHome(state));
  assert.equal(state.money, 153000);
  assert.equal(state.life.loan.remaining, 240000);
  state = checked(interactBusiness(state, 'launch'));
  assert.equal(state.money, 145000);
  assert.equal(state.life.business.stage, 'awaiting');
  assert.equal(state.life.business.earned, 0);

  state = stop(checked(advance(state)), 31, 1);
  assert.equal(state.life.business.stage, 'operating');
  assert.equal(state.life.business.earned, 12000);
  assert.equal(state.money, 155000);
  assert.equal(state.life.loan.paid, 2000);
  state = play([[37, 1], [40, 0]], state);
  assert.equal(state.phase, 'finished');
  assert.equal(state.ended, 'complete');
  assert.equal(state.money, 151000);
  assert.equal(state.life.loan.remaining, 234000);
  assert.equal(state.life.loan.paid, 6000);
  assert.equal(state.life.loan.deferred, 0);
  const report = getLifeReport(state);
  const businessKeepsake=report.commemorations.find(item=>item.id==='explorer');
  assert.equal(businessKeepsake.name, '小步经营探索者');
  assert.deepEqual(businessKeepsake.evidence.map(evidence=>evidence.kind), ['event','transaction','transaction','event']);
  for (const id of ['home', 'business']) assert.equal(report.achievements.find(item => item.id === id).unlocked, true);
  assert.deepEqual(state.life.actions.filter(([command]) => ['b', 'h'].includes(command)), [
    ['b', 'test'], ['h'], ['b', 'launch'],
  ]);
});
