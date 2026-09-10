import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DICE_FACE_NORMALS, diceOrientation, upwardFace, SceneDice, DICE_THROW_DURATION } from '../src/dice.js';

test('all six fixed faces are distinct and opposite faces sum to seven', () => {
  assert.equal(new Set(Object.values(DICE_FACE_NORMALS).map(n => n.join(','))).size, 6);
  for (let value = 1; value <= 6; value++) {
    assert.equal(new THREE.Vector3(...DICE_FACE_NORMALS[value]).dot(new THREE.Vector3(...DICE_FACE_NORMALS[7 - value])), -1);
  }
});

test('each result ends with its actual normal pointing up for arbitrary yaw', () => {
  for (let value = 1; value <= 6; value++) for (const yaw of [-Math.PI * 3, -1, 0, .38, 2, Math.PI * 7]) {
    const q = diceOrientation(value, yaw);
    assert.ok(Math.abs(q.length() - 1) < 1e-12);
    assert.ok(new THREE.Vector3(...DICE_FACE_NORMALS[value]).applyQuaternion(q).distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-12);
    assert.equal(upwardFace(q), value);
  }
  for (const value of [0, 7, 1.5, null, '3', NaN]) assert.throws(() => diceOrientation(value), RangeError);
  assert.throws(() => diceOrientation(1, Infinity), RangeError);
});

test('mesh pips correspond to permanent value labels without DOM textures', async () => {
  const scene = new THREE.Scene(), dice = new SceneDice(scene), actor = new THREE.Group(); scene.add(actor);
  for (let value = 1; value <= 6; value++) {
    const face = dice.mesh.getObjectByName(`face-${value}`);
    assert.equal(face.children.filter(child => child.name === 'pip').length, value);
    assert.ok(new THREE.Vector3(0, 0, 1).applyQuaternion(face.quaternion).distanceTo(new THREE.Vector3(...DICE_FACE_NORMALS[value])) < 1e-12);
    const stages = [];
    assert.equal(await dice.throw({ actor, value, heading: -.7, groundY: () => 1.3, reduceMotion: true, onStage: stage => stages.push(stage) }), value);
    assert.deepEqual(stages, ['settled']);
    assert.equal(upwardFace(dice.mesh.quaternion), value);
    assert.equal(dice.mesh.userData.value, value);
    assert.ok(dice.mesh.position.y > 1.3);
    assert.equal(actor.userData.diceThrowing, undefined);
  }
  dice.dispose(); dice.dispose(); assert.equal(scene.children.includes(dice.group), false);
  await assert.rejects(dice.throw({ actor, value: 2 }), /disposed/);
});

test('animation phases, readable hold, pose restoration and duplicate-call lock', async () => {
  const originalRaf = globalThis.requestAnimationFrame, originalCancel = globalThis.cancelAnimationFrame;
  let serial = 0; const frames = new Map();
  globalThis.requestAnimationFrame = callback => { const id = ++serial; frames.set(id, callback); return id; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  try {
    const scene = new THREE.Scene(), actor = new THREE.Group(), arm = new THREE.Group();
    actor.position.set(10, .08, 20); actor.rotation.z = .035;
    arm.position.set(.55, 1.3, 0); arm.rotation.x = .1; actor.add(arm); actor.userData.throwArm = arm; scene.add(actor);
    const dice = new SceneDice(scene), stages = [], began = performance.now();
    const pending = dice.throw({ actor, value: 4, heading: .2, groundY: () => 0, onStage: stage => stages.push(stage) });
    assert.equal(dice.throw({ actor, value: 6 }), pending);
    const step = elapsed => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(began + elapsed + 5)); };
    step(350); assert.equal(actor.userData.diceThrowing, true);
    assert.ok(arm.rotation.x > .1); assert.equal(actor.position.y, .08);
    actor.updateWorldMatrix(true, true);
    const palmInDie = arm.localToWorld(new THREE.Vector3(0, -.56, .05)).sub(dice.mesh.position).applyQuaternion(dice.mesh.quaternion.clone().invert());
    assert.ok(palmInDie.x < -.48 && palmInDie.x > -.6, 'palm touches the left face instead of disappearing inside the die');
    assert.ok(Math.abs(palmInDie.y) < .05 && Math.abs(palmInDie.z) < .05);
    step(850); step(1100); step(1400); step(1920); step(2200); step(2620);
    assert.deepEqual(stages, ['windup', 'throw', 'bounce', 'settled']);
    assert.equal(upwardFace(dice.mesh.quaternion), 4);
    assert.equal(dice.mesh.userData.value, 4);
    assert.equal(actor.rotation.z, .035); assert.equal(arm.rotation.x, .1);
    assert.notEqual(dice.active, null, 'face remains on screen before awaiting finishes');
    step(DICE_THROW_DURATION + 150);
    assert.equal(await pending, 4); assert.equal(dice.active, null); assert.equal(frames.size, 0);
    assert.equal(actor.userData.diceThrowing, undefined);
    const second = dice.throw({ actor, value: 2, heading: 0 }); step(400);
    dice.dispose(); assert.equal(await second, null); assert.equal(frames.size, 0);
    assert.equal(actor.rotation.z, .035); assert.equal(arm.rotation.x, .1);
  } finally {
    if (originalRaf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = originalRaf;
    if (originalCancel === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = originalCancel;
  }
});

test('low frame rates do not slow time, but the actual result still gets a 900 ms hold', async () => {
  const originalRaf = globalThis.requestAnimationFrame, originalCancel = globalThis.cancelAnimationFrame;
  let serial = 0; const frames = new Map();
  globalThis.requestAnimationFrame = callback => { const id = ++serial; frames.set(id, callback); return id; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  try {
    const dice = new SceneDice(new THREE.Scene()), actor = new THREE.Group(), began = performance.now();
    const pending = dice.throw({ actor, value: 3 });
    const step = elapsed => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(began + elapsed + 5)); };
    for (let elapsed = 200; elapsed <= 2400; elapsed += 200) step(elapsed); // 5 FPS.
    step(2800); // One dropped frame delays the first actually readable result.
    assert.ok(dice.active.elapsed >= 2790, '5 FPS must not become a 64 ms-per-frame slow motion');
    assert.equal(dice.mesh.userData.phase, 'settled');
    step(3600); assert.notEqual(dice.active, null, 'only 800 ms of the result has been visible');
    step(3800); assert.equal(await pending, 3);
    dice.dispose(); assert.equal(frames.size, 0);
  } finally {
    if (originalRaf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = originalRaf;
    if (originalCancel === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = originalCancel;
  }
});

test('visibility events pause time even if a hidden tab receives no animation frame', async () => {
  const originalRaf = globalThis.requestAnimationFrame, originalCancel = globalThis.cancelAnimationFrame, originalDocument = globalThis.document;
  let serial = 0, listeners = 0; const frames = new Map(), visibility = new EventTarget();
  visibility.hidden = false;
  const add = visibility.addEventListener.bind(visibility), remove = visibility.removeEventListener.bind(visibility);
  visibility.addEventListener = (...args) => { listeners++; add(...args); };
  visibility.removeEventListener = (...args) => { listeners--; remove(...args); };
  globalThis.document = visibility;
  globalThis.requestAnimationFrame = callback => { const id = ++serial; frames.set(id, callback); return id; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  try {
    const dice = new SceneDice(new THREE.Scene()), actor = new THREE.Group(), began = performance.now();
    const pending = dice.throw({ actor, value: 6 });
    const step = elapsed => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(began + elapsed + 5)); };
    step(400); const before = dice.mesh.position.clone(), visibleTime = dice.active.elapsed;
    visibility.hidden = true; visibility.dispatchEvent(new Event('visibilitychange'));
    // No frame is delivered during thirty seconds in the background.
    visibility.hidden = false; visibility.dispatchEvent(new Event('visibilitychange'));
    step(30400);
    assert.equal(dice.active.elapsed, visibleTime);
    assert.ok(dice.mesh.position.distanceTo(before) < 1e-12);
    assert.equal(dice.mesh.userData.value, null);
    step(32800); assert.equal(dice.mesh.userData.value, 6);
    step(33600); assert.notEqual(dice.active, null);
    step(33800); assert.equal(await pending, 6); assert.equal(listeners, 0);
    const another = dice.throw({ actor, value: 2 }); assert.equal(listeners, 1);
    dice.dispose(); assert.equal(await another, null); assert.equal(listeners, 0);
  } finally {
    if (originalRaf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = originalRaf;
    if (originalCancel === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = originalCancel;
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
  }
});
