import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDesktopStage, mountDesktopStage, DESKTOP_STAGE_WIDTH, DESKTOP_STAGE_HEIGHT } from '../src/desktop-stage.js';

const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} should equal ${expected}`);
const prop = key => `--stage-${key}`;

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

function element(initial = {}, attributes = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, typeof value === 'string' ? { value, priority: '' } : value]));
  const attrs = new Map(Object.entries(attributes));
  let writes = 0;
  return {
    style: {
      getPropertyValue: name => values.get(name)?.value ?? '',
      getPropertyPriority: name => values.get(name)?.priority ?? '',
      setProperty(name, value, priority = '') { values.set(name, { value, priority }); writes++; },
      removeProperty(name) { values.delete(name); },
    },
    getAttribute: name => attrs.get(name) ?? null,
    setAttribute: (name, value) => attrs.set(name, String(value)),
    removeAttribute: name => attrs.delete(name),
    writes: () => writes,
  };
}

function fixture({ width = 844, height = 300, visual = true, touch = false, safe = {}, resolvedSafe = {}, initial = {}, initialFit } = {}) {
  const root = Object.assign(element(), { clientWidth: width, clientHeight: height });
  const frame = element(initial, initialFit === undefined ? {} : { 'data-desktop-fit': initialFit });
  const stage = element();
  const probes = [];
  const document = {
    documentElement: root,
    getElementById: id => id === 'game-frame' ? frame : id === 'app' ? stage : null,
    createElement() {
      const node = element();
      node.remove = () => { node.removed = true; };
      return node;
    },
  };
  root.ownerDocument = document;
  root.appendChild = node => probes.push(node);
  const visualViewport = visual ? eventTarget({ width, height, offsetTop: 0, offsetLeft: 0, scale: 1 }) : undefined;
  const frames = new Map();
  const observers = [];
  let serial = 0;
  const window = eventTarget({
    document, innerWidth: width, innerHeight: height, visualViewport,
    navigator: { maxTouchPoints: touch ? 5 : 0 },
    matchMedia: () => ({ matches: false }),
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(target, options) { this.target = target; this.options = options; }
      disconnect() { this.disconnected = true; }
    },
    getComputedStyle: node => ({
      getPropertyValue(name) {
        if (node === root) return root.style.getPropertyValue(name) || (safe[name.replace('--game-safe-', '')] ?? '0px');
        return resolvedSafe[name.replace('padding-', '')] ?? '0px';
      },
    }),
    requestAnimationFrame(callback) { const id = serial++; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
  });
  return {
    window, root, frame, stage, frames, visualViewport, safe, resolvedSafe, probes, observers,
    mount: () => mountDesktopStage({ window }),
    values: () => Object.fromEntries(['width', 'height', 'scale', 'x', 'y'].map(key => [key, frame.style.getPropertyValue(prop(key))])),
    fit: () => frame.getAttribute('data-desktop-fit'),
    tick() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(0)); },
    resize(width, height) {
      Object.assign(root, { clientWidth: width, clientHeight: height });
      Object.assign(window, { innerWidth: width, innerHeight: height });
      if (visualViewport) Object.assign(visualViewport, { width, height });
      window.dispatch('resize');
      this.tick();
    },
  };
}

test('logical desktop dimensions are fixed to the reference composition', () => {
  assert.equal(DESKTOP_STAGE_WIDTH, 1904);
  assert.equal(DESKTOP_STAGE_HEIGHT, 942);
  for (const [width, height] of [[667, 280], [844, 300], [844, 390], [915, 412]]) {
    const fit = computeDesktopStage({ width, height, enabled: true });
    assert.equal(fit.width, 1904);
    assert.equal(fit.height, 942);
    closeTo(fit.width * fit.scale / (fit.height * fit.scale), 1904 / 942);
    closeTo(fit.x * 2 + fit.width * fit.scale, width);
    closeTo(fit.y * 2 + fit.height * fit.scale, height);
    assert.ok(fit.width * fit.scale <= width + 1e-8);
    assert.ok(fit.height * fit.scale <= height + 1e-8);
  }
});

test('safe insets and VisualViewport offsets are applied exactly once', () => {
  const fit = computeDesktopStage({ width: 844, height: 300, left: 9, top: 40, safeInsets: { top: 12, right: 35, bottom: 18, left: 55 }, enabled: true });
  closeTo(fit.scale, 270 / 942);
  closeTo(fit.y, 52);
  closeTo(fit.x, 9 + 55 + (754 - 1904 * fit.scale) / 2);
  assert.ok(fit.x >= 64);
  assert.ok(fit.x + fit.width * fit.scale <= 9 + 844 - 35);
});

test('disabled stage leaves the normal physical layout and ignores fit-only safe insets', () => {
  assert.deepEqual(computeDesktopStage({ width: 1904, height: 942, top: 10, left: 20, safeInsets: { top: 20 }, enabled: false }), {
    enabled: false, width: 1904, height: 942, scale: 1, x: 20, y: 10,
  });
});

test('invalid dimensions and excessive safe insets still produce a finite positive fit', () => {
  assert.deepEqual(computeDesktopStage(), { enabled: false, width: 1, height: 1, scale: 1, x: 0, y: 0 });
  const fit = computeDesktopStage({ width: 20, height: 10, top: -10, left: Infinity, safeInsets: { left: 50, right: 60, top: 80, bottom: 30 }, enabled: true });
  assert.ok(fit.scale > 0);
  assert.ok(Object.values(fit).every(value => typeof value === 'boolean' || Number.isFinite(value)));
  assert.ok(fit.x >= 0 && fit.x + fit.width * fit.scale <= 20);
  assert.ok(fit.y >= 0 && fit.y + fit.height * fit.scale <= 10);
  const invalid = computeDesktopStage({ width: NaN, height: Infinity, enabled: true });
  assert.ok(invalid.scale > 0);
});

test('mount measures immediately and writes only frame fit properties', () => {
  const env = fixture();
  const cleanup = env.mount();
  assert.equal(env.fit(), 'true');
  assert.equal(env.values().width, '1904px');
  assert.equal(env.values().height, '942px');
  closeTo(Number(env.values().scale), 300 / 942);
  assert.equal(env.frames.size, 0);
  assert.equal(env.root.writes(), 0);
  assert.equal(env.stage.writes(), 0, 'CSS owns stage dimensions and its transform');
  cleanup();
});

test('only short landscape screens fit, while touch supports ultra-wide phones', () => {
  for (const [width, height, touch, expected] of [
    [1400, 650, false, true], [1401, 650, false, false],
    [1500, 650, true, true], [844, 651, true, false],
    [1100, 800, false, false], [390, 844, true, false], [650, 650, true, false],
  ]) {
    const env = fixture({ width, height, touch });
    const cleanup = env.mount();
    assert.equal(env.fit(), String(expected), `${width} × ${height}, touch ${touch}`);
    cleanup();
  }
  const coarse = fixture({ width: 1500, height: 600 });
  coarse.window.matchMedia = query => ({ matches: query === '(pointer: coarse)' });
  const cleanup = coarse.mount();
  assert.equal(coarse.fit(), 'true');
  cleanup();
});

test('keyboard and toolbar changes scale the whole stage, including viewport panning', () => {
  const env = fixture();
  const cleanup = env.mount();
  Object.assign(env.visualViewport, { height: 180, offsetTop: 70, offsetLeft: 8 });
  env.visualViewport.dispatch('resize');
  env.visualViewport.dispatch('scroll');
  assert.equal(env.frames.size, 1);
  env.tick();
  assert.equal(env.values().width, '1904px');
  assert.equal(env.values().height, '942px');
  closeTo(Number(env.values().scale), 180 / 942);
  closeTo(Number.parseFloat(env.values().y), 70);
  closeTo(Number.parseFloat(env.values().x), 8 + (844 - 1904 * (180 / 942)) / 2);
  Object.assign(env.visualViewport, { height: 300, offsetTop: 0, offsetLeft: 0 });
  env.visualViewport.dispatch('resize');
  env.tick();
  closeTo(Number(env.values().scale), 300 / 942);
  cleanup();
});

test('a portrait keyboard does not misclassify the phone as landscape', () => {
  const env = fixture({ width: 390, height: 844, touch: true });
  env.visualViewport.height = 280;
  const cleanup = env.mount();
  assert.equal(env.fit(), 'false');
  cleanup();
});

test('native pinch and pan preserve the last composition without counter-scaling', () => {
  const env = fixture({ height: 390 });
  env.visualViewport.height = 300;
  const cleanup = env.mount();
  const before = env.values();
  const writes = env.frame.writes();
  Object.assign(env.visualViewport, { width: 422, height: 150, scale: 2, offsetLeft: 100, offsetTop: 50 });
  env.visualViewport.dispatch('resize');
  env.visualViewport.dispatch('scroll');
  env.tick();
  assert.deepEqual(env.values(), before);
  assert.equal(env.visualViewport.scale, 2);
  assert.equal(env.frame.writes(), writes);
  Object.assign(env.window, { innerWidth: 1688, innerHeight: 780 });
  Object.assign(env.visualViewport, { width: 1688, height: 600, scale: 0.5, offsetLeft: 0, offsetTop: 0 });
  env.visualViewport.dispatch('resize');
  env.tick();
  assert.deepEqual(env.values(), before);
  assert.equal(env.visualViewport.scale, 0.5);
  Object.assign(env.visualViewport, { width: 844, height: 310, scale: 1.005 });
  env.visualViewport.dispatch('resize');
  env.tick();
  closeTo(Number(env.values().scale), 310 / 942);
  cleanup();
});

test('a real layout resize escapes stale inner dimensions even while the browser auto-shrinks', () => {
  const env = fixture();
  const cleanup = env.mount();
  Object.assign(env.root, { clientWidth: 667, clientHeight: 280 });
  Object.assign(env.window, { innerWidth: 845, innerHeight: 355 });
  Object.assign(env.visualViewport, { width: 844, height: 354.5, scale: 0.7903 });
  env.window.dispatch('resize');
  env.tick();
  closeTo(Number(env.values().scale), 280 / 942);
  closeTo(Number.parseFloat(env.values().x), (667 - 1904 * 280 / 942) / 2);
  Object.assign(env.visualViewport, { scale: 1 });
  env.resize(844, 390);
  closeTo(Number(env.values().scale), 390 / 942);
  env.resize(390, 844);
  assert.equal(env.fit(), 'false');
  assert.equal(env.values().width, '390px');
  env.resize(844, 300);
  assert.equal(env.fit(), 'true');
  closeTo(Number(env.values().scale), 300 / 942);
  cleanup();
});

test('direct safe-inset pixels do not need a measuring node', () => {
  const env = fixture({ safe: { top: '10px', right: '20px', bottom: '15px', left: '30.5px' } });
  const cleanup = env.mount();
  assert.equal(env.probes.length, 0);
  closeTo(Number(env.values().scale), 275 / 942);
  closeTo(Number.parseFloat(env.values().y), 10);
  cleanup();
});

test('root inline safe-inset changes refit the stage without a resize event', () => {
  const env = fixture();
  const cleanup = env.mount();
  const before = env.values();
  assert.equal(env.observers.length, 1);
  const observer = env.observers[0];
  assert.equal(observer.target, env.root, 'the observer does not watch its own frame writes');
  assert.deepEqual(observer.options, { attributes: true, attributeFilter: ['style'] });
  env.root.style.setProperty('--game-safe-left', '44px');
  env.root.style.setProperty('--game-safe-bottom', '21px');
  observer.callback([{ type: 'attributes', attributeName: 'style', target: env.root }]);
  observer.callback([{ type: 'attributes', attributeName: 'style', target: env.root }]);
  assert.equal(env.frames.size, 1, 'multiple style changes share one animation frame');
  assert.deepEqual(env.values(), before, 'root mutations schedule, rather than synchronously changing layout');
  env.tick();
  const fit = computeDesktopStage({ width: 844, height: 300, safeInsets: { left: 44, bottom: 21 }, enabled: true });
  closeTo(Number(env.values().scale), fit.scale);
  closeTo(Number.parseFloat(env.values().x), fit.x);
  closeTo(Number.parseFloat(env.values().y), fit.y);
  assert.ok(fit.y + fit.height * fit.scale <= 279);
  assert.equal(env.frames.size, 0, 'writing frame variables cannot queue a root-style feedback loop');
  observer.callback([]);
  assert.equal(env.frames.size, 1);
  cleanup();
  assert.equal(observer.disconnected, true);
  assert.equal(env.frames.size, 0);
  observer.callback([]);
  assert.equal(env.frames.size, 0, 'late observer notifications cannot schedule work after cleanup');
});

test('env and calc safe insets resolve through padding and the probe is removed on cleanup', () => {
  const env = fixture({
    safe: { top: 'env(safe-area-inset-top)', right: 'calc(2px + env(safe-area-inset-right))', bottom: '', left: '30px' },
    resolvedSafe: { top: '8px', right: '25px', bottom: '12px', left: '30px' },
  });
  const cleanup = env.mount();
  assert.equal(env.probes.length, 1);
  const probe = env.probes[0];
  assert.equal(probe.getAttribute('aria-hidden'), 'true');
  assert.equal(probe.style.getPropertyValue('padding-top'), 'var(--game-safe-top, env(safe-area-inset-top, 0px))');
  closeTo(Number(env.values().scale), 280 / 942);
  env.resolvedSafe.bottom = '20px';
  env.window.dispatch('resize');
  env.tick();
  assert.equal(env.probes.length, 1, 'reuse the same untransformed probe');
  closeTo(Number(env.values().scale), 272 / 942);
  cleanup();
  assert.equal(probe.removed, true);
});

test('without VisualViewport, root and window fallback dimensions stay usable', () => {
  const env = fixture({ visual: false });
  const cleanup = env.mount();
  closeTo(Number(env.values().scale), 300 / 942);
  env.resize(667, 280);
  closeTo(Number(env.values().scale), 280 / 942);
  Object.assign(env.root, { clientWidth: 0, clientHeight: 0 });
  Object.assign(env.window, { innerWidth: 844, innerHeight: 390 });
  env.window.dispatch('pageshow');
  env.tick();
  closeTo(Number(env.values().scale), 390 / 942);
  Object.assign(env.window, { innerWidth: NaN, innerHeight: 0 });
  env.window.dispatch('resize');
  env.tick();
  closeTo(Number(env.values().scale), 390 / 942);
  cleanup();
});

test('invalid visual measurements use layout dimensions and valid offsets', () => {
  const env = fixture();
  Object.assign(env.visualViewport, { width: NaN, height: 0, offsetTop: -1, offsetLeft: Infinity });
  const cleanup = env.mount();
  closeTo(Number(env.values().scale), 300 / 942);
  assert.equal(env.values().y, '0px');
  cleanup();
});

test('all viewport event sources coalesce and unchanged properties are not rewritten', () => {
  const env = fixture();
  const cleanup = env.mount();
  const writes = env.frame.writes();
  for (let i = 0; i < 10; i++) {
    env.window.dispatch('resize');
    env.window.dispatch('pageshow');
    env.visualViewport.dispatch('resize');
    env.visualViewport.dispatch('scroll');
  }
  assert.equal(env.frames.size, 1);
  env.tick();
  assert.equal(env.frame.writes(), writes);
  cleanup();
});

test('cleanup is idempotent, cancels work and restores previous frame ownership', () => {
  const env = fixture({
    initial: { [prop('height')]: { value: '100dvh', priority: 'important' }, [prop('scale')]: '.8', '--other': 'keep' },
    initialFit: 'previous',
  });
  const cleanup = env.mount();
  env.visualViewport.dispatch('resize');
  const staleCallback = [...env.frames.values()][0];
  cleanup();
  cleanup();
  assert.equal(env.frames.size, 0);
  assert.deepEqual(env.values(), { width: '', height: '100dvh', scale: '.8', x: '', y: '' });
  assert.equal(env.frame.style.getPropertyPriority(prop('height')), 'important');
  assert.equal(env.frame.style.getPropertyValue('--other'), 'keep');
  assert.equal(env.fit(), 'previous');
  for (const target of [env.window, env.visualViewport]) assert.ok([...target.listeners.values()].every(listeners => listeners.size === 0));
  staleCallback();
  assert.equal(env.values().height, '100dvh');
});

test('cleanup preserves a later owner and removes initially absent attributes', () => {
  const env = fixture();
  const cleanup = env.mount();
  env.frame.style.setProperty(prop('scale'), '2');
  env.frame.style.setProperty(prop('width'), '1904px', 'important');
  env.frame.setAttribute('data-desktop-fit', 'external');
  cleanup();
  assert.deepEqual(env.values(), { width: '1904px', height: '', scale: '2', x: '', y: '' });
  assert.equal(env.fit(), 'external');
  const clean = fixture();
  const cleanUp = clean.mount();
  cleanUp();
  assert.equal(clean.fit(), null);
});

test('dependencies can be explicitly injected and missing DOM safely returns cleanup', () => {
  const env = fixture();
  delete env.window.document;
  delete env.window.MutationObserver;
  const cleanup = mountDesktopStage({ window: env.window, root: env.root, frame: env.frame, stage: env.stage });
  assert.equal(env.fit(), 'true');
  cleanup();
  assert.doesNotThrow(() => mountDesktopStage({ window: undefined })());
  assert.doesNotThrow(() => mountDesktopStage({ window: {} })());
  assert.doesNotThrow(() => mountDesktopStage({ window: env.window, root: env.root, frame: env.frame })());
});
