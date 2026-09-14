import test from 'node:test';
import assert from 'node:assert/strict';
import { mountMobileViewport } from '../src/mobile-viewport.js';

const property = dimension => `--game-viewport-${dimension}`;

function eventTarget(properties = {}) {
  const listeners = new Map();
  return Object.assign({
    listeners,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    dispatch(type) { for (const listener of listeners.get(type) ?? []) listener({ type }); },
  }, properties);
}

function fixture({ visual = true, initial = {} } = {}) {
  const properties = new Map(Object.entries(initial).map(([key, value]) => [key, typeof value === 'string' ? { value, priority: '' } : value]));
  let writes = 0;
  const style = {
    getPropertyValue: name => properties.get(name)?.value ?? '',
    getPropertyPriority: name => properties.get(name)?.priority ?? '',
    setProperty(name, value, priority = '') { properties.set(name, { value, priority }); writes++; },
    removeProperty(name) { const previous = this.getPropertyValue(name); properties.delete(name); return previous; },
  };
  const root = { style, clientWidth: 390, clientHeight: 844 };
  const frames = new Map();
  let serial = 0;
  const visualViewport = visual ? eventTarget({ width: 390, height: 720, offsetTop: 0, offsetLeft: 0, scale: 1 }) : undefined;
  const window = eventTarget({
    document: { documentElement: root },
    innerWidth: 390,
    innerHeight: 844,
    visualViewport,
    requestAnimationFrame(callback) { const id = serial++; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  return {
    window, root, visualViewport, frames,
    mount: () => mountMobileViewport({ window }),
    values: () => Object.fromEntries(['width', 'height', 'top', 'left'].map(key => [key, style.getPropertyValue(property(key))])),
    writes: () => writes,
    tick() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(0)); },
  };
}

test('mount immediately measures the visual viewport and both offsets', () => {
  const env = fixture();
  Object.assign(env.visualViewport, { width: 380.5, height: 600.25, offsetTop: 73.5, offsetLeft: 9.5 });
  const cleanup = env.mount();
  assert.deepEqual(env.values(), { width: '380.5px', height: '600.25px', top: '73.5px', left: '9.5px' });
  assert.equal(env.frames.size, 0);
  cleanup();
});

test('toolbar resizing and viewport scrolling update on the next animation frame', () => {
  const env = fixture();
  const cleanup = env.mount();
  env.visualViewport.height = 790;
  env.visualViewport.dispatch('resize');
  assert.equal(env.values().height, '720px');
  env.tick();
  assert.equal(env.values().height, '790px');
  env.visualViewport.offsetTop = 20;
  env.visualViewport.offsetLeft = 4;
  env.visualViewport.dispatch('scroll');
  env.tick();
  assert.equal(env.values().top, '20px');
  assert.equal(env.values().left, '4px');
  cleanup();
});

test('keyboard opening, focus panning, and closing follow the usable area', () => {
  const env = fixture();
  const cleanup = env.mount();
  Object.assign(env.visualViewport, { height: 330, offsetTop: 210 });
  env.visualViewport.dispatch('resize');
  env.visualViewport.dispatch('scroll');
  env.tick();
  assert.equal(env.window.innerHeight, 844, 'the layout viewport need not shrink with the keyboard');
  assert.deepEqual(env.values(), { width: '390px', height: '330px', top: '210px', left: '0px' });
  Object.assign(env.visualViewport, { height: 720, offsetTop: 0 });
  env.visualViewport.dispatch('resize');
  env.tick();
  assert.equal(env.values().height, '720px');
  assert.equal(env.values().top, '0px');
  cleanup();
});

test('pinch zoom keeps layout dimensions and ignores visual viewport panning', () => {
  const env = fixture();
  const cleanup = env.mount();
  Object.assign(env.visualViewport, { scale: 2, width: 195, height: 360, offsetTop: 150, offsetLeft: 50 });
  env.visualViewport.dispatch('resize');
  env.visualViewport.dispatch('scroll');
  env.tick();
  assert.deepEqual(env.values(), { width: '390px', height: '844px', top: '0px', left: '0px' });
  assert.equal(env.visualViewport.scale, 2, 'native browser zoom is never changed');
  Object.assign(env.visualViewport, { scale: 1.005, width: 390, height: 720, offsetTop: 10, offsetLeft: 0 });
  env.visualViewport.dispatch('resize');
  env.tick();
  assert.deepEqual(env.values(), { width: '390px', height: '720px', top: '10px', left: '0px' });
  cleanup();
});

test('mobile resize escapes an overflowing inner viewport without retaining the old game size', () => {
  const env = fixture();
  Object.assign(env.root, { clientWidth: 844, clientHeight: 300 });
  Object.assign(env.window, { innerWidth: 844, innerHeight: 300 });
  Object.assign(env.visualViewport, { width: 844, height: 300 });
  const cleanup = env.mount();
  assert.deepEqual(env.values(), { width: '844px', height: '300px', top: '0px', left: '0px' });

  // Reproduced on mobile Chrome: the previous 844px game still overflows a
  // newly 667px viewport, expanding innerWidth and triggering auto-shrink.
  Object.assign(env.root, { clientWidth: 667, clientHeight: 280 });
  Object.assign(env.window, { innerWidth: 845, innerHeight: 355 });
  Object.assign(env.visualViewport, { width: 844, height: 354.5, scale: 0.7903 });
  env.window.dispatch('resize');
  env.visualViewport.dispatch('resize');
  env.tick();
  assert.deepEqual(env.values(), { width: '667px', height: '280px', top: '0px', left: '0px' });
  assert.equal(env.visualViewport.scale, 0.7903, 'the module changes layout, never the browser zoom');

  Object.assign(env.window, { innerWidth: 667, innerHeight: 280 });
  Object.assign(env.visualViewport, { width: 667, height: 280, scale: 1 });
  env.visualViewport.dispatch('resize');
  env.tick();
  assert.deepEqual(env.values(), { width: '667px', height: '280px', top: '0px', left: '0px' });

  Object.assign(env.root, { clientWidth: 844, clientHeight: 390 });
  Object.assign(env.window, { innerWidth: 844, innerHeight: 390 });
  Object.assign(env.visualViewport, { width: 844, height: 390 });
  env.window.dispatch('resize');
  env.tick();
  assert.deepEqual(env.values(), { width: '844px', height: '390px', top: '0px', left: '0px' });
  cleanup();
});

test('a user pinch zoom out preserves the root layout rather than expanding the game to innerWidth', () => {
  const env = fixture();
  const cleanup = env.mount();
  Object.assign(env.window, { innerWidth: 780, innerHeight: 1688 });
  Object.assign(env.visualViewport, { scale: 0.5, width: 780, height: 1440, offsetTop: 30, offsetLeft: 20 });
  env.visualViewport.dispatch('resize');
  env.visualViewport.dispatch('scroll');
  env.tick();
  assert.deepEqual(env.values(), { width: '390px', height: '844px', top: '0px', left: '0px' });
  assert.equal(env.visualViewport.scale, 0.5, 'native pinch zoom remains unchanged');
  cleanup();
});

test('window resize and pageshow refresh layout without VisualViewport support', () => {
  const env = fixture({ visual: false });
  const cleanup = env.mount();
  assert.deepEqual(env.values(), { width: '390px', height: '844px', top: '0px', left: '0px' });
  Object.assign(env.window, { innerWidth: 844, innerHeight: 390 });
  Object.assign(env.root, { clientWidth: 844, clientHeight: 390 });
  env.window.dispatch('resize');
  env.tick();
  assert.deepEqual(env.values(), { width: '844px', height: '390px', top: '0px', left: '0px' });
  env.window.innerHeight = 360;
  env.root.clientHeight = 360;
  env.window.dispatch('pageshow');
  env.tick();
  assert.equal(env.values().height, '360px');
  cleanup();
});

test('window events also refresh the supported visual viewport', () => {
  const env = fixture();
  const cleanup = env.mount();
  env.visualViewport.height = 670;
  env.window.dispatch('resize');
  env.tick();
  assert.equal(env.values().height, '670px');
  env.visualViewport.height = 700;
  env.window.dispatch('pageshow');
  env.tick();
  assert.equal(env.values().height, '700px');
  cleanup();
});

test('all event sources coalesce into one frame that reads the latest dimensions', () => {
  const env = fixture();
  const cleanup = env.mount();
  for (let i = 0; i < 10; i++) {
    env.visualViewport.height = 700 + i;
    env.visualViewport.dispatch('resize');
    env.visualViewport.dispatch('scroll');
    env.window.dispatch('resize');
    env.window.dispatch('pageshow');
  }
  assert.equal(env.frames.size, 1, 'frame id zero also counts as a pending frame');
  const writesBefore = env.writes();
  env.tick();
  assert.equal(env.values().height, '709px');
  assert.equal(env.writes() - writesBefore, 1, 'unchanged CSS properties are not rewritten');
  env.window.dispatch('resize');
  assert.equal(env.frames.size, 1);
  env.tick();
  assert.equal(env.writes() - writesBefore, 1);
  cleanup();
});

test('invalid visual measurements fall back to positive layout sizes', () => {
  const env = fixture();
  Object.assign(env.visualViewport, { width: Number.NaN, height: 0, offsetTop: -20, offsetLeft: Infinity });
  const cleanup = env.mount();
  assert.deepEqual(env.values(), { width: '390px', height: '844px', top: '0px', left: '0px' });
  Object.assign(env.visualViewport, { width: 200, height: 300, offsetTop: 20, offsetLeft: 20, scale: NaN });
  env.visualViewport.dispatch('resize');
  env.tick();
  assert.deepEqual(env.values(), { width: '390px', height: '844px', top: '0px', left: '0px' });
  cleanup();
});

test('layout uses root dimensions, then inner dimensions and known sizes during transient zero measurements', () => {
  const env = fixture({ visual: false });
  Object.assign(env.window, { innerWidth: 0, innerHeight: Infinity });
  const cleanup = env.mount();
  assert.deepEqual(env.values(), { width: '390px', height: '844px', top: '0px', left: '0px' });
  Object.assign(env.root, { clientWidth: 0, clientHeight: 0 });
  Object.assign(env.window, { innerWidth: 380, innerHeight: 700 });
  env.window.dispatch('resize');
  env.tick();
  assert.deepEqual(env.values(), { width: '380px', height: '700px', top: '0px', left: '0px' });
  Object.assign(env.window, { innerWidth: 0, innerHeight: Infinity });
  env.window.dispatch('resize');
  env.tick();
  assert.deepEqual(env.values(), { width: '380px', height: '700px', top: '0px', left: '0px' });
  cleanup();
  const zeroEnv = fixture({ visual: false });
  Object.assign(zeroEnv.window, { innerWidth: 0, innerHeight: 0 });
  Object.assign(zeroEnv.root, { clientWidth: 0, clientHeight: 0 });
  const cleanupZero = zeroEnv.mount();
  assert.deepEqual(zeroEnv.values(), { width: '1px', height: '1px', top: '0px', left: '0px' });
  cleanupZero();
});

test('cleanup cancels frames, removes listeners, and restores original values and priorities', () => {
  const env = fixture({ initial: {
    [property('height')]: { value: '100dvh', priority: 'important' },
    [property('top')]: '7px',
    '--unrelated-setting': 'untouched',
  } });
  const cleanup = env.mount();
  env.visualViewport.dispatch('resize');
  const staleFrame = [...env.frames.values()][0];
  cleanup();
  cleanup();
  assert.equal(env.frames.size, 0);
  assert.deepEqual(env.values(), { width: '', height: '100dvh', top: '7px', left: '' });
  assert.equal(env.root.style.getPropertyPriority(property('height')), 'important');
  assert.equal(env.root.style.getPropertyValue('--unrelated-setting'), 'untouched');
  for (const target of [env.window, env.visualViewport]) {
    assert.ok([...target.listeners.values()].every(listeners => listeners.size === 0));
    for (const event of ['resize', 'scroll', 'pageshow']) target.dispatch(event);
  }
  assert.equal(env.frames.size, 0);
  staleFrame();
  assert.equal(env.values().height, '100dvh', 'an already captured callback cannot write after cleanup');
});

test('cleanup preserves later external changes to a managed property', () => {
  const env = fixture();
  const cleanup = env.mount();
  env.root.style.setProperty(property('height'), '555px');
  env.root.style.setProperty(property('width'), '390px', 'important');
  cleanup();
  assert.deepEqual(env.values(), { width: '390px', height: '555px', top: '', left: '' });
  assert.equal(env.root.style.getPropertyPriority(property('width')), 'important');
});

test('an explicit root can be injected and a missing browser safely returns a cleanup', () => {
  const env = fixture();
  delete env.window.document;
  const cleanup = mountMobileViewport({ window: env.window, root: env.root });
  assert.equal(env.values().height, '720px');
  cleanup();
  assert.doesNotThrow(() => mountMobileViewport({ window: undefined })());
  assert.doesNotThrow(() => mountMobileViewport({ window: {} })());
});
