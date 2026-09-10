// Optional atlas contract tests use synthetic pixels, never a generated image or an API.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LANDMARK_ATLAS_URL, LANDMARK_SPECS, landmarkPlans, alphaBounds, loadLifeLandmarks, applyLifeLandmarks } from '../src/landmark-art.js';
import { buildPixelRoute, inWater } from '../src/pixel-art.js';

const WIDTH = 128;
const HEIGHT = 128;
const image = () => ({ naturalWidth: WIDTH, naturalHeight: HEIGHT });
function paint(data, x, y, w, h, alpha = 255, width = WIDTH) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    data[(yy * width + xx) * 4 + 3] = alpha;
  }
  return data;
}
function atlas() {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let cell = 0; cell < 4; cell++) paint(data, cell % 2 * 64 + 12, Math.floor(cell / 2) * 64 + 10, 38, 42);
  return data;
}
function mockCanvas(data = atlas(), { failAt = -1 } = {}) {
  const canvases = [];
  const makeCanvas = (width, height) => {
    const index = canvases.length;
    const context = { imageSmoothingEnabled: true, draws: [], drawImage(...args) {
      if (index === failAt) throw new Error('Synthetic canvas draw failure');
      this.draws.push(args);
    }, getImageData() { return { data }; } };
    const canvas = { width, height, context, getContext: () => context };
    canvases.push(canvas);
    return canvas;
  };
  return { makeCanvas, canvases };
}
function fakeImage({ width = WIDTH, height = HEIGHT, event = 'load', throwsOnSrc = false } = {}) {
  return { naturalWidth: width, naturalHeight: height, onload: null, onerror: null, assigned: null,
    set src(value) {
      this.assigned = value;
      if (throwsOnSrc) throw new Error('Synthetic image source failure');
      if (event) queueMicrotask(() => this[event === 'load' ? 'onload' : 'onerror']?.());
    } };
}

test('landmark plans are deterministic and do not mutate the real forty-station route', () => {
  const route = buildPixelRoute(), before = structuredClone(route);
  const plans = landmarkPlans(route);
  assert.deepEqual(plans.map((plan) => plan.id), ['library', 'stadium', 'village', 'bookstall']);
  assert.deepEqual(plans, landmarkPlans(route));
  assert.deepEqual(route, before);
  for (const plan of plans) {
    assert.equal(plan.x, route.stations[plan.tile].x + plan.dx);
    assert.equal(plan.y, route.stations[plan.tile].y + plan.dy);
    assert.equal(plan.bounds.right - plan.bounds.left, plan.width);
    assert.equal(plan.bounds.bottom - plan.bounds.top, plan.maxHeight);
    assert.equal(plan.season, 0);
    assert(!route.samples.some((p) => p.x > plan.bounds.left - 8 && p.x < plan.bounds.right + 8 && p.y > plan.bounds.top - 20 && p.y < plan.bounds.bottom + 20));
    for (const x of [plan.bounds.left, plan.x, plan.bounds.right]) for (const y of [plan.bounds.top, (plan.bounds.top + plan.y) / 2, plan.y]) assert.equal(inWater(x, y, 5), false);
  }
  assert(Object.isFrozen(LANDMARK_SPECS));
  assert(LANDMARK_SPECS.every(Object.isFrozen));
});

test('road conflicts reject only affected plots, and malformed route containers have no plans', () => {
  const route = buildPixelRoute();
  const library = landmarkPlans(route)[0];
  route.samples.push({ x: library.x, y: library.y - 25 });
  assert.deepEqual(landmarkPlans(route).map((plan) => plan.id), ['stadium', 'village', 'bookstall']);
  for (const value of [null, {}, { stations: [], samples: [] }, { stations: {}, samples: [] }]) assert.deepEqual(landmarkPlans(value), []);
});

test('plots crossing water are not placed even when the route contains no nearby roads', () => {
  const route = { stations: [{ x: 650, y: 517 }], samples: [] };
  assert(inWater(650, 486, 5));
  assert(!landmarkPlans(route).some((plan) => plan.id === 'library'));
});

test('alpha bounds isolate each quadrant with genuine transparent margins', () => {
  const data = atlas();
  for (let cell = 0; cell < 4; cell++) {
    const x = cell % 2 * 64, y = Math.floor(cell / 2) * 64;
    assert.deepEqual(alphaBounds(data, WIDTH, HEIGHT, { x, y, w: 64, h: 64 }), { x: x + 12, y: y + 10, w: 38, h: 42 });
  }
});

test('empty, low-alpha, tiny, opaque and fake-transparent quadrants are rejected', () => {
  const region = { x: 0, y: 0, w: 64, h: 64 };
  const blank = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  assert.equal(alphaBounds(blank, WIDTH, HEIGHT, region), null);
  assert.equal(alphaBounds(paint(blank.slice(), 12, 10, 38, 42, 24), WIDTH, HEIGHT, region), null);
  assert(alphaBounds(paint(blank.slice(), 12, 10, 38, 42, 25), WIDTH, HEIGHT, region));
  assert.equal(alphaBounds(paint(blank.slice(), 20, 20, 2, 2), WIDTH, HEIGHT, region), null);
  assert.equal(alphaBounds(paint(blank.slice(), 0, 0, 64, 64), WIDTH, HEIGHT, region), null);
  assert.equal(alphaBounds(paint(blank.slice(), 1, 1, 62, 62), WIDTH, HEIGHT, region), null);
  // A visible checkerboard is not transparency: its alpha is still fully opaque.
  const checkerboard = paint(blank.slice(), 0, 0, 64, 64);
  for (let index = 0; index < checkerboard.length; index += 4) checkerboard[index] = index % 8 ? 200 : 240;
  assert.equal(alphaBounds(checkerboard, WIDTH, HEIGHT, region), null);
});

test('subjects touching cell edges or bleeding across the center seam are rejected', () => {
  for (const [x, y] of [[0, 20], [63, 20], [20, 0], [20, 63]]) {
    const data = atlas();
    paint(data, x, y, 1, 1);
    assert.equal(alphaBounds(data, WIDTH, HEIGHT, { x: 0, y: 0, w: 64, h: 64 }), null);
  }
  const bleeding = atlas();
  paint(bleeding, 62, 30, 4, 1);
  assert.equal(alphaBounds(bleeding, WIDTH, HEIGHT, { x: 0, y: 0, w: 64, h: 64 }), null);
  assert.equal(alphaBounds(bleeding, WIDTH, HEIGHT, { x: 64, y: 0, w: 64, h: 64 }), null);
});

test('malformed dimensions, data and out-of-bounds regions return null', () => {
  const data = atlas(), region = { x: 0, y: 0, w: 64, h: 64 };
  const cases = [
    [data, WIDTH, 32, region], [data, WIDTH, NaN, region], [data, 0, HEIGHT, region],
    [null, WIDTH, HEIGHT, region], [new Uint8ClampedArray(32), WIDTH, HEIGHT, region],
    [data, WIDTH, HEIGHT, null], [data, WIDTH, HEIGHT, { ...region, x: -1 }],
    [data, WIDTH, HEIGHT, { ...region, w: 64.5 }], [data, WIDTH, HEIGHT, { ...region, h: 129 }],
  ];
  for (const args of cases) assert.equal(alphaBounds(...args), null);
});

test('loader returns the local atlas on success and removes event handlers', async () => {
  const img = fakeImage();
  assert.equal(await loadLifeLandmarks({ imageFactory: () => img, timeoutMs: 30 }), img);
  assert.equal(img.assigned, LANDMARK_ATLAS_URL);
  assert.match(img.assigned, /^\/art\/[^.]+\.png$/);
  assert.equal(img.onload, null);
  assert.equal(img.onerror, null);
});

test('loader rejects odd, undersized and oversized atlas dimensions without rejecting its promise', async () => {
  for (const [width, height] of [[127, 128], [128, 127], [129, 128], [128, 131], [4098, 128], [128, 4098], [0, 0]]) {
    const img = fakeImage({ width, height });
    assert.equal(await loadLifeLandmarks({ imageFactory: () => img, timeoutMs: 30 }), null);
    assert.equal(img.onload, null);
    assert.equal(img.onerror, null);
  }
});

test('loader image error and timeout degrade to null, with late load remaining harmless', async () => {
  const errored = fakeImage({ event: 'error' });
  assert.equal(await loadLifeLandmarks({ imageFactory: () => errored, timeoutMs: 30 }), null);
  const slow = fakeImage({ event: null });
  const pending = loadLifeLandmarks({ imageFactory: () => slow, timeoutMs: 5 });
  const lateLoad = slow.onload;
  assert.equal(await pending, null);
  assert.equal(slow.onload, null);
  assert.equal(slow.onerror, null);
  assert.doesNotThrow(() => lateLoad());
});

test('loader factory/source exceptions also preserve the optional-art fallback contract', async () => {
  assert.equal(await loadLifeLandmarks({ imageFactory: () => { throw new Error('Unavailable image constructor'); }, timeoutMs: 5 }), null);
  assert.equal(await loadLifeLandmarks({ imageFactory: () => null, timeoutMs: 5 }), null);
  assert.equal(await loadLifeLandmarks({ imageFactory: () => fakeImage({ throwsOnSrc: true }), timeoutMs: 5 }), null);
});

test('applying a valid atlas replaces local placeholders, preserves routes and sorts scenery', () => {
  const route = buildPixelRoute(), beforeRoute = structuredClone(route), plans = landmarkPlans(route);
  const oldHouse = { kind: 'house', x: plans[0].x, y: plans[0].y - 11 };
  const foreground = { kind: 'tree', x: plans[1].x, y: plans[1].y - 20 };
  const outside = { kind: 'tree', x: 1450, y: 100 };
  const garden = { kind: 'garden', x: 1300, y: 980 };
  const art = { objects: [garden, oldHouse, foreground, outside] };
  const canvas = mockCanvas();
  assert.equal(applyLifeLandmarks(art, route, image(), canvas), 4);
  assert.deepEqual(route, beforeRoute);
  assert(!art.objects.includes(oldHouse));
  assert(!art.objects.includes(foreground));
  assert(art.objects.includes(outside));
  assert(art.objects.includes(garden));
  assert.deepEqual(art.objects.map((object) => object.y), art.objects.map((object) => object.y).toSorted((a, b) => a - b));
  const landmarks = art.objects.filter((object) => object.kind === 'landmark');
  assert.equal(landmarks.length, 4);
  for (const object of landmarks) {
    assert.equal(object.generatedArt, true);
    assert(object.sprite.width - 8 <= object.width);
    assert(object.sprite.height - 8 <= object.maxHeight);
    assert.equal(object.offsetX, object.sprite.width / 2);
    assert.equal(object.offsetY, object.sprite.height - 4);
    assert.equal(object.sprite.context.imageSmoothingEnabled, false);
    assert.equal(object.sprite.context.draws.length, 1);
    assert.equal(object.sprite.context.draws[0][0].naturalWidth, WIDTH);
  }
});

test('invalid sheets and partial canvas failures do not mutate fallback objects', () => {
  const route = buildPixelRoute();
  const incomplete = atlas();
  paint(incomplete, 64, 64, 64, 64, 0);
  const opaque = paint(atlas(), 0, 0, WIDTH, HEIGHT);
  const bleeding = paint(atlas(), 62, 30, 4, 1);
  for (const canvas of [mockCanvas(new Uint8ClampedArray(WIDTH * HEIGHT * 4)), mockCanvas(incomplete), mockCanvas(opaque), mockCanvas(bleeding), mockCanvas(atlas(), { failAt: 0 }), mockCanvas(atlas(), { failAt: 2 })]) {
    const art = { objects: [{ kind: 'tree', x: 100, y: 900 }, { kind: 'house', x: 180, y: 738 }] };
    const originalArray = art.objects, originalObjects = [...art.objects];
    assert.equal(applyLifeLandmarks(art, route, image(), canvas), 0);
    assert.equal(art.objects, originalArray);
    assert.deepEqual(art.objects, originalObjects);
  }
});

test('no legal placements is a true no-op, including array identity and original draw order', () => {
  const route = buildPixelRoute();
  for (const plan of landmarkPlans(route)) route.samples.push({ x: plan.x, y: plan.y - 10 });
  assert.deepEqual(landmarkPlans(route), []);
  const art = { objects: [{ kind: 'tree', x: 1400, y: 900 }, { kind: 'house', x: 1300, y: 100 }] };
  const original = art.objects;
  assert.equal(applyLifeLandmarks(art, route, image(), mockCanvas()), 0);
  assert.equal(art.objects, original);
  assert.deepEqual(art.objects.map((object) => object.y), [900, 100]);
});

test('reapplication is idempotent, while absent image or malformed art remains unchanged', () => {
  const route = buildPixelRoute(), art = { objects: [] };
  assert.equal(applyLifeLandmarks(art, route, image(), mockCanvas()), 4);
  const applied = art.objects;
  assert.equal(applyLifeLandmarks(art, route, image(), mockCanvas()), 0);
  assert.equal(art.objects, applied);
  assert.equal(applyLifeLandmarks(art, route, null, mockCanvas()), 0);
  for (const invalid of [null, {}, { objects: 'bad' }]) assert.equal(applyLifeLandmarks(invalid, route, image(), mockCanvas()), 0);
});
