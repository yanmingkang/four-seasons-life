import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { loadSeasonTrees, SEASON_TREE_URL } from '../src/seasonal-art.js';

function fixture(t) {
  const timers = new Map(), images = [];
  let clock = 0, nextId = 0;
  t.mock.method(globalThis, 'setTimeout', (callback, ms) => {
    timers.set(++nextId, { callback, at: clock + ms }); return nextId;
  });
  t.mock.method(globalThis, 'clearTimeout', id => timers.delete(id));
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  class FakeImage {
    naturalWidth = 1024;
    naturalHeight = 1024;
    constructor() { images.push(this); }
    removeAttribute(name) { assert.equal(name, 'src'); this.removedSource = true; }
  }
  Object.defineProperty(globalThis, 'Image', { configurable: true, writable: true, value: FakeImage });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'Image', previous);
    else delete globalThis.Image;
  });
  const advance = ms => {
    const until = clock + ms;
    while (true) {
      const pending = [...timers].sort((a, b) => a[1].at - b[1].at).find(([, value]) => value.at <= until);
      if (!pending) break;
      clock = pending[1].at; timers.delete(pending[0]); pending[1].callback();
    }
    clock = until;
  };
  const controller = new AbortController(), late = [];
  const start = options => loadSeasonTrees({ timeoutMs: 3000, lateTimeoutMs: 30000, signal: controller.signal, onLateLoad: image => late.push(image), ...options });
  const cleaned = image => {
    assert.equal(timers.size, 0, 'No initial or final timers remain');
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0, 'No signal listener remains');
    assert.equal(image.onload, null); assert.equal(image.onerror, null);
  };
  return { timers, images, advance, controller, late, start, cleaned };
}

test('an early valid image resolves readiness once and releases every resource', async t => {
  const f = fixture(t), ready = f.start(), image = f.images[0], load = image.onload;
  assert.equal(image.src, SEASON_TREE_URL);
  load(); assert.equal(await ready, image); assert.deepEqual(f.late, []);
  f.cleaned(image); load(); assert.deepEqual(f.late, []);
});

test('three-second fallback resolves independently of one later successful enhancement', async t => {
  const f = fixture(t), ready = f.start(), image = f.images[0], load = image.onload;
  let resolved = false; ready.then(() => { resolved = true; });
  f.advance(2999); await Promise.resolve(); assert.equal(resolved, false);
  f.advance(1); assert.equal(await ready, null);
  assert.equal(f.timers.size, 1); assert.equal(typeof image.onload, 'function');
  f.advance(9000); load();
  assert.deepEqual(f.late, [image]); assert.equal(await ready, null, 'Initial fallback result is not rewritten');
  f.cleaned(image); load(); assert.deepEqual(f.late, [image]);
});

test('legacy Promise-only callers stop and release the image at the original deadline', async t => {
  const f = fixture(t), ready = f.start({ onLateLoad: undefined }), image = f.images[0], load = image.onload;
  f.advance(3000); assert.equal(await ready, null); assert.equal(image.removedSource, true);
  f.cleaned(image); load(); assert.deepEqual(f.late, []);
});

for (const afterFallback of [false, true]) {
  test(`image error ${afterFallback ? 'after' : 'before'} fallback cannot report successful enhancement`, async t => {
    const f = fixture(t), ready = f.start(), image = f.images[0], load = image.onload;
    if (afterFallback) f.advance(3000);
    image.onerror(); assert.equal(await ready, null); f.cleaned(image);
    load(); assert.deepEqual(f.late, []);
  });
  test(`abort ${afterFallback ? 'after' : 'before'} fallback cancels callbacks and all timers`, async t => {
    const f = fixture(t), ready = f.start(), image = f.images[0], load = image.onload;
    if (afterFallback) f.advance(3000);
    f.controller.abort(); assert.equal(await ready, null); assert.equal(image.removedSource, true);
    f.cleaned(image); load(); assert.deepEqual(f.late, []);
  });
}

test('zero-size and non-square images remain fallback and never call the late handler', async t => {
  const f = fixture(t);
  for (const [width, height] of [[0, 0], [1024, 512]]) {
    const ready = f.start(), image = f.images.at(-1);
    f.advance(3000); image.naturalWidth = width; image.naturalHeight = height;
    image.onload(); assert.equal(await ready, null); f.cleaned(image); assert.deepEqual(f.late, []);
  }
});

test('thirty-second final cutoff detaches late work even if a load event arrives afterward', async t => {
  const f = fixture(t), ready = f.start(), image = f.images[0], load = image.onload;
  f.advance(3000); assert.equal(await ready, null);
  f.advance(26999); assert.equal(typeof image.onload, 'function');
  f.advance(1); f.cleaned(image); assert.equal(image.removedSource, true);
  load(); assert.deepEqual(f.late, []);
});

test('an already-aborted caller creates no image, timers or listeners', async t => {
  const f = fixture(t); f.controller.abort();
  assert.equal(await f.start(), null); assert.equal(f.images.length, 0); assert.equal(f.timers.size, 0);
  assert.equal(getEventListeners(f.controller.signal, 'abort').length, 0);
});
