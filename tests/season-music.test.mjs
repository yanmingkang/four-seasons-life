import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeasonMusic, SEASON_SCORES, getSeasonStepNotes } from '../src/season-music.js';

class FakeParameter {
  value = 1;
  events = [];
  record(type, value, time) { this.value = value; this.events.push({ type, value, time }); }
  setValueAtTime(value, time) { this.record('set', value, time); }
  linearRampToValueAtTime(value, time) { this.record('linear', value, time); }
  exponentialRampToValueAtTime(value, time) { this.record('exp', value, time); }
  setTargetAtTime(value, time) { this.record('target', value, time); }
  cancelScheduledValues(time) { this.events.push({ type: 'cancel', time }); }
}
class FakeNode {
  gain = new FakeParameter();
  frequency = new FakeParameter();
  connections = [];
  disconnected = false;
  stops = [];
  connect(other) { this.connections.push(other); }
  disconnect() { this.disconnected = true; }
  start(time) { this.startTime = time; }
  stop(time) { this.stops.push(time); }
}
class FakeContext {
  state = 'suspended';
  currentTime = 0;
  destination = {};
  gains = [];
  oscillators = [];
  resumeCalls = 0;
  suspendCalls = 0;
  closed = false;
  createGain() { const node = new FakeNode(); this.gains.push(node); return node; }
  createOscillator() { const node = new FakeNode(); this.oscillators.push(node); return node; }
  async resume() { this.resumeCalls++; this.state = 'running'; }
  async suspend() { this.suspendCalls++; this.state = 'suspended'; }
  async close() { this.closed = true; this.state = 'closed'; }
}
function setup(extra = {}) {
  const context = new FakeContext();
  let nextId = 0;
  const callbacks = new Map();
  const timers = {
    setInterval(callback) { callbacks.set(++nextId, callback); return nextId; },
    clearInterval(id) { callbacks.delete(id); },
  };
  const statuses = [];
  let factoryCalls = 0;
  const player = createSeasonMusic({ contextFactory: () => { factoryCalls++; return context; }, timers,
    onStatusChange: (status) => statuses.push(status), ...extra });
  const advance = (seconds) => {
    context.currentTime += seconds;
    for (const oscillator of context.oscillators) {
      if (!oscillator.ended && oscillator.stops.at(-1) <= context.currentTime) {
        oscillator.ended = true;
        oscillator.onended?.();
      }
    }
    for (const callback of callbacks.values()) callback();
  };
  return { context, player, statuses, callbacks, advance, factoryCalls: () => factoryCalls };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

test('four original scores are complete, distinct 32–60 second compositions', () => {
  assert.equal(SEASON_SCORES.length, 4);
  assert.equal(new Set(SEASON_SCORES.map((score) => score.bpm)).size, 4);
  assert.equal(new Set(SEASON_SCORES.map((score) => score.instrument)).size, 4);
  assert.equal(new Set(SEASON_SCORES.map((score) => JSON.stringify(score.melody))).size, 4);
  for (const score of SEASON_SCORES) {
    assert.equal(score.chords.length, 16);
    assert.equal(score.melody.length, 16);
    assert(score.melody.every((bar) => bar.length === 8));
    assert(score.durationSeconds >= 32 && score.durationSeconds <= 60);
    assert.equal(score.name, score.title);
    assert(Object.isFrozen(score.melody));
  }
  const density = SEASON_SCORES.map((score) => score.melody.flat().filter((note) => note >= 0).length);
  assert(density[1] > density[0] && density[0] > density[2] && density[2] > density[3]);
});

test('each score has melody plus accompaniment, bass, and stable looping', () => {
  for (let season = 0; season < 4; season++) {
    const score = SEASON_SCORES[season];
    const first = getSeasonStepNotes(season, 0);
    assert(first.some((note) => note.instrument === score.instrument));
    assert(first.some((note) => note.instrument === score.harmony));
    assert(first.some((note) => note.instrument === score.bass));
    assert.deepEqual(first, getSeasonStepNotes(season, 128));
    for (let step = 0; step < 128; step++) {
      for (const note of getSeasonStepNotes(season, step)) {
        assert(note.duration > 0 && Number.isFinite(note.duration));
        assert(note.gain > 0 && note.gain <= .2);
        assert(note.offset >= 0);
      }
    }
  }
  assert.throws(() => getSeasonStepNotes(4, 0), RangeError);
});

test('audio is not created or scheduled before a user gesture unlock', async () => {
  const t = setup();
  t.player.setSeason(2);
  t.player.setEnabled(true);
  await settle();
  assert.equal(t.factoryCalls(), 0);
  assert.equal(t.callbacks.size, 0);
  assert.equal(t.player.getStatus().unlocked, false);
  assert.equal(t.player.getStatus().volume, .18);
  assert.equal(await t.player.unlock(), true);
  assert.equal(t.factoryCalls(), 1);
  assert.equal(t.callbacks.size, 1);
  assert(t.context.oscillators.length > 0);
  assert.equal(t.player.getStatus().playing, true);
  t.player.dispose();
});

test('season switching crossfades for .8s and does not retain several outgoing scores', async () => {
  const t = setup();
  await t.player.unlock();
  const springBus = t.context.gains[1];
  const originalVoices = [...t.context.oscillators];
  t.advance(.5);
  t.player.setSeason(1);
  assert.equal(t.player.getStatus().season, 1);
  assert(springBus.gain.events.some((event) => event.type === 'linear' && event.value === 0 && event.time === 1.3));
  assert(originalVoices.every((voice) => voice.stops.at(-1) <= 1.32));
  const channelGains = t.context.gains.filter((node) => node.connections[0] === t.context.gains[0]);
  assert.equal(channelGains.length, 2);
  t.player.setSeason(2);
  assert(springBus.disconnected, 'A rapid second change disposes the first outgoing score.');
  t.advance(1);
  assert.equal(t.context.gains.filter((node) => node.connections[0] === t.context.gains[0] && !node.disconnected).length, 1);
  assert.equal(t.callbacks.size, 1);
  assert.throws(() => t.player.setSeason(-1), RangeError);
  t.player.dispose();
});

test('pause stops all scheduled voices and resume restores only one scheduler', async () => {
  const t = setup();
  await t.player.unlock();
  t.advance(.2);
  t.player.setPaused(true);
  await settle();
  assert.equal(t.callbacks.size, 0);
  assert.equal(t.context.state, 'suspended');
  assert(t.context.oscillators.every((node) => node.disconnected));
  const before = t.context.oscillators.length;
  t.advance(30);
  assert.equal(t.context.oscillators.length, before);
  t.player.setSeason(3);
  t.player.setPaused(false);
  await settle();
  assert.equal(t.callbacks.size, 1);
  assert.equal(t.player.getStatus().playing, true);
  assert.equal(t.player.getStatus().season, 3);
  t.player.dispose();
});

test('mute, volume clamping and initial muted user-gesture unlock remain silent', async () => {
  const t = setup({ enabled: false });
  assert.equal(await t.player.unlock(), true);
  assert.equal(t.callbacks.size, 0);
  assert.equal(t.context.oscillators.length, 0);
  t.player.setVolume(4);
  assert.equal(t.player.getStatus().volume, 1);
  t.player.setVolume(-1);
  assert.equal(t.player.getStatus().volume, 0);
  t.player.setVolume(Number.NaN);
  assert.equal(t.player.getStatus().volume, 0);
  t.player.setVolume(.15);
  t.player.setEnabled(true);
  await settle();
  assert.equal(t.callbacks.size, 1);
  t.player.setEnabled(false);
  await settle();
  assert.equal(t.callbacks.size, 0);
  assert.equal(t.player.getStatus().playing, false);
  assert(t.context.oscillators.every((node) => node.disconnected));
  t.player.dispose();
});

test('a delayed browser tick skips missed notes instead of bursting a backlog', async () => {
  const t = setup();
  await t.player.unlock();
  const before = t.context.oscillators.length;
  t.advance(120);
  const newVoices = t.context.oscillators.slice(before);
  assert(newVoices.length > 0 && newVoices.length < 40);
  assert(newVoices.every((voice) => voice.startTime >= t.context.currentTime));
  t.player.dispose();
});

test('rapid pause/resume queues resume after a still-pending suspend', async () => {
  const t = setup();
  await t.player.unlock();
  let finishSuspend;
  t.context.suspend = () => new Promise((resolve) => {
    finishSuspend = () => { t.context.state = 'suspended'; resolve(); };
  });
  const callOrder = [];
  t.context.resume = async () => {
    callOrder.push('resume');
    finishSuspend?.();
    t.context.state = 'running';
  };
  t.player.setPaused(true);
  t.player.setPaused(false);
  await settle();
  assert.deepEqual(callOrder, ['resume']);
  assert.equal(t.player.getStatus().playing, true);
  assert.equal(t.callbacks.size, 1);
  t.player.dispose();
});

test('autoplay rejection is reported and no timer starts', async () => {
  const t = setup();
  t.context.resume = async () => { throw new Error('NotAllowedError'); };
  assert.equal(await t.player.unlock(), false);
  assert.equal(t.player.getStatus().blocked, true);
  assert.equal(t.player.getStatus().unlocked, false);
  assert.equal(t.callbacks.size, 0);
  t.player.dispose();
});

test('dispose is idempotent and cancels a pending unlock without leaking voices', async () => {
  const t = setup();
  let resolveResume;
  t.context.resume = () => new Promise((resolve) => { resolveResume = resolve; });
  const pending = t.player.unlock();
  t.player.dispose();
  t.player.dispose();
  resolveResume();
  assert.equal(await pending, false);
  assert.equal(t.context.closed, true);
  assert.equal(t.callbacks.size, 0);
  assert.equal(t.context.oscillators.length, 0);
  t.player.setSeason(3);
  t.player.setEnabled(true);
  t.player.setPaused(false);
  assert.equal(t.player.getStatus().disposed, true);
  assert.equal(t.player.getStatus().playing, false);
});
