import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Original, result-led animation, not a rigid-body physics simulation. The game
// samples a fair value before this class presents it. Face labels never change.
// Design references (no code/assets copied):
// https://github.com/3d-dice/dice-box-threejs (MIT)
// https://github.com/byWulf/threejs-dice (MIT)
export const DICE_FACE_NORMALS = Object.freeze({
  1: Object.freeze([0, 1, 0]), 6: Object.freeze([0, -1, 0]),
  2: Object.freeze([0, 0, 1]), 5: Object.freeze([0, 0, -1]),
  3: Object.freeze([1, 0, 0]), 4: Object.freeze([-1, 0, 0]),
});

const UP = new THREE.Vector3(0, 1, 0);
const FRONT = new THREE.Vector3(0, 0, 1);
const SIZE = .96;
const RELEASE = 980;
const IMPACT = RELEASE + 900;
const SETTLED = IMPACT + 700;
export const DICE_THROW_DURATION = SETTLED + 900;
const clamp = value => THREE.MathUtils.clamp(value, 0, 1);
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const easeOut = value => 1 - (1 - clamp(value)) ** 3;

/** A unit quaternion whose requested, permanently numbered face points up. */
export function diceOrientation(value, yaw = 0) {
  if (!Number.isInteger(value) || value < 1 || value > 6) throw new RangeError('Dice value must be an integer from 1 to 6.');
  if (!Number.isFinite(yaw)) throw new RangeError('Dice yaw must be finite.');
  const upright = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...DICE_FACE_NORMALS[value]), UP);
  return new THREE.Quaternion().setFromAxisAngle(UP, yaw).multiply(upright).normalize();
}

/** Read the actual world-up face, independently from the requested result. */
export function upwardFace(quaternion) {
  let result = 1, highest = -Infinity;
  for (const [value, normal] of Object.entries(DICE_FACE_NORMALS)) {
    const y = new THREE.Vector3(...normal).applyQuaternion(quaternion).y;
    if (y > highest) { highest = y; result = Number(value); }
  }
  return result;
}

const PIPS = Object.freeze({
  1: [[0, 0]], 2: [[-1, 1], [1, -1]], 3: [[-1, 1], [0, 0], [1, -1]],
  4: [[-1, 1], [1, 1], [-1, -1], [1, -1]],
  5: [[-1, 1], [1, 1], [0, 0], [-1, -1], [1, -1]],
  6: [[-1, 1], [1, 1], [-1, 0], [1, 0], [-1, -1], [1, -1]],
});

export class SceneDice {
  constructor(scene) {
    if (!scene?.isObject3D) throw new TypeError('SceneDice requires a Three.js scene or group.');
    this.disposed = false;
    this.active = null;
    this.group = new THREE.Group(); this.group.name = 'liu-kanshan-dice';
    this.mesh = new THREE.Group(); this.mesh.name = 'six-sided-dice'; this.mesh.visible = false;
    this.group.add(this.mesh); scene.add(this.group);
    this.materials = new Set(); this.geometries = new Set(); this.textures = new Set();
    const material = options => { const mat = new THREE.MeshStandardMaterial(options); this.materials.add(mat); return mat; };
    const geometry = geo => { this.geometries.add(geo); return geo; };
    const ivory = material({ color: '#fff8e8', roughness: .28, metalness: .04 });
    const gold = material({ color: '#b78e43', roughness: .3, metalness: .62 });
    const ink = material({ color: '#283e39', roughness: .22, metalness: .12 });
    const body = new THREE.Mesh(geometry(new RoundedBoxGeometry(SIZE, SIZE, SIZE, 5, .105)), gold);
    body.castShadow = true; body.receiveShadow = true; this.mesh.add(body);
    const panelGeo = geometry(new RoundedBoxGeometry(.835, .835, .045, 4, .075));
    const pipGeo = geometry(new THREE.SphereGeometry(.073, 16, 10));
    for (const [value, normal] of Object.entries(DICE_FACE_NORMALS)) {
      const face = new THREE.Group(); face.name = `face-${value}`; face.userData.value = Number(value);
      face.quaternion.setFromUnitVectors(FRONT, new THREE.Vector3(...normal));
      const panel = new THREE.Mesh(panelGeo, ivory); panel.position.z = SIZE / 2 - .012;
      panel.castShadow = true; panel.receiveShadow = true; face.add(panel);
      for (const [x, y] of PIPS[value]) {
        const pip = new THREE.Mesh(pipGeo, ink); pip.name = 'pip';
        pip.position.set(x * .225, y * .225, SIZE / 2 + .012); pip.scale.z = .12; face.add(pip);
      }
      this.mesh.add(face);
    }
    const shadowPixels = new Uint8Array(64 * 64 * 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const offset = (y * 64 + x) * 4, radius = Math.hypot((x - 31.5) / 31.5, (y - 31.5) / 31.5);
      shadowPixels[offset] = shadowPixels[offset + 1] = shadowPixels[offset + 2] = 255;
      shadowPixels[offset + 3] = Math.round(Math.max(0, 1 - radius * radius) ** 2 * 255);
    }
    const softShadow = new THREE.DataTexture(shadowPixels, 64, 64); softShadow.needsUpdate = true;
    softShadow.magFilter = softShadow.minFilter = THREE.LinearFilter; this.textures.add(softShadow);
    const shadowMat = new THREE.MeshBasicMaterial({ color: '#435041', map: softShadow, transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide });
    const ringMat = new THREE.MeshBasicMaterial({ color: '#fff0b2', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    this.materials.add(shadowMat); this.materials.add(ringMat);
    this.shadow = new THREE.Mesh(geometry(new THREE.PlaneGeometry(1.9, 1.9)), shadowMat);
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.visible = false;
    this.impactRing = new THREE.Mesh(geometry(new THREE.RingGeometry(.58, .64, 48)), ringMat);
    this.impactRing.rotation.x = -Math.PI / 2; this.impactRing.visible = false;
    this.group.add(this.shadow, this.impactRing);
  }

  /**
   * Resolves to value after its face has remained readable for 900 ms. A second
   * call while throwing returns the current promise. dispose() resolves it null.
   * Ground samples and actor positions are world coordinates; keep group at identity.
   */
  throw({ actor, value, heading, groundY = () => 0, reduceMotion = false, isPaused = () => false, onStage } = {}) {
    if (this.disposed) return Promise.reject(new Error('SceneDice was disposed.'));
    if (this.active) return this.active.promise;
    if (!actor?.isObject3D || typeof groundY !== 'function' || typeof isPaused !== 'function') return Promise.reject(new TypeError('A Three.js actor, groundY and isPaused functions are required.'));
    let finalQuaternion;
    try { finalQuaternion = diceOrientation(value, Number.isFinite(heading) ? heading + .28 : .28); }
    catch (error) { return Promise.reject(error); }
    actor.updateWorldMatrix(true, true);
    const origin = actor.getWorldPosition(new THREE.Vector3());
    const direction = Number.isFinite(heading) ? heading : Math.atan2(actor.getWorldDirection(new THREE.Vector3()).x, actor.getWorldDirection(new THREE.Vector3()).z);
    const forward = new THREE.Vector3(Math.sin(direction), 0, Math.cos(direction));
    const right = new THREE.Vector3(Math.cos(direction), 0, -Math.sin(direction));
    const firstContact = origin.clone().addScaledVector(forward, 2.15).addScaledVector(right, .35);
    const end = firstContact.clone().addScaledVector(forward, .84).addScaledVector(right, -.14);
    const arm = actor.userData.throwArm?.isObject3D ? actor.userData.throwArm : null;
    const armPose = arm?.rotation.clone(), actorPose = { x: actor.rotation.x, z: actor.rotation.z, throwing: actor.userData.diceThrowing };
    // Place the palm against the side of the die, not at its centre. Keeping this
    // grip in the shoulder's coordinates also makes the die follow a raised hand.
    const armScale = arm?.getWorldScale(new THREE.Vector3()).x || 1;
    const handOffset = new THREE.Vector3(SIZE / (2 * armScale) + .055, -.55, .07);
    const launch = new THREE.Vector3();
    const launchQuaternion = new THREE.Quaternion();
    const flightEndQuaternion = new THREE.Quaternion();
    const scratchQuaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const halfHeight = quaternion => {
      const m = new THREE.Matrix4().makeRotationFromQuaternion(quaternion).elements;
      // Conservative cube support prevents rolling corners passing through terrain.
      return SIZE / 2 * (Math.abs(m[1]) + Math.abs(m[5]) + Math.abs(m[9]));
    };
    const ground = (x, z) => { const y = groundY(x, z); return Number.isFinite(y) ? y : 0; };
    const contactHeight = (x, z, quaternion) => Math.max(ground(x, z), ...[[-.4, -.4], [.4, -.4], [-.4, .4], [.4, .4]].map(([dx, dz]) => ground(x + dx, z + dz))) + halfHeight(quaternion) + .024;
    const setShadow = altitude => {
      this.shadow.position.set(this.mesh.position.x, ground(this.mesh.position.x, this.mesh.position.z) + .026, this.mesh.position.z);
      this.shadow.scale.setScalar(1 + Math.min(2, Math.max(0, altitude)) * .23);
      this.shadow.material.opacity = .18 / (1 + Math.max(0, altitude) * .55);
    };
    const placeInHand = () => {
      actor.updateWorldMatrix(true, true);
      if (arm) {
        this.mesh.position.copy(arm.localToWorld(handOffset.clone()));
        arm.getWorldQuaternion(this.mesh.quaternion);
      } else {
        this.mesh.position.copy(actor.localToWorld(new THREE.Vector3(.94, 1.15, .37)));
        this.mesh.quaternion.setFromEuler(new THREE.Euler(.22, direction + .25, -.28));
      }
      this.mesh.userData.phase = 'held';
      setShadow(this.mesh.position.y - ground(this.mesh.position.x, this.mesh.position.z));
    };
    const restoreActor = () => {
      actor.rotation.x = actorPose.x; actor.rotation.z = actorPose.z;
      if (arm) arm.rotation.copy(armPose);
      if (actorPose.throwing === undefined) delete actor.userData.diceThrowing;
      else actor.userData.diceThrowing = actorPose.throwing;
    };
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    const active = { promise, resolve, reject, restoreActor, cleanup: () => {}, raf: 0, stage: '', value, elapsed: 0 };
    this.active = active; this.mesh.visible = true; this.shadow.visible = true; this.impactRing.visible = false;
    this.mesh.userData.value = null; actor.userData.diceThrowing = true;
    const emit = stage => { if (active.stage !== stage) { active.stage = stage; onStage?.(stage); } };
    const settle = () => {
      this.mesh.quaternion.copy(finalQuaternion);
      this.mesh.position.set(end.x, contactHeight(end.x, end.z, finalQuaternion), end.z);
      this.mesh.userData.value = upwardFace(this.mesh.quaternion);
      this.mesh.userData.phase = 'settled';
      setShadow(0); this.impactRing.visible = false; restoreActor(); emit('settled');
    };
    const finish = error => {
      if (this.active !== active) return;
      if (active.raf) cancelAnimationFrame(active.raf);
      active.cleanup();
      restoreActor(); this.impactRing.visible = false; this.active = null;
      if (error) reject(error); else resolve(value);
    };
    if (reduceMotion || typeof requestAnimationFrame !== 'function') {
      try { settle(); finish(); } catch (error) { finish(error); }
      return promise;
    }
    let elapsed = 0, last = performance.now(), settledAt = null, launched = false;
    const visibility = typeof document !== 'undefined' ? document : null;
    // A background tab may receive no rAF at all, so observe the visibility
    // event itself. Do not clamp delta: that turns a slow renderer into slow motion.
    const onVisibilityChange = () => { last = null; };
    visibility?.addEventListener?.('visibilitychange', onVisibilityChange);
    active.cleanup = () => visibility?.removeEventListener?.('visibilitychange', onVisibilityChange);
    const tick = now => {
      if (this.active !== active || this.disposed) return;
      try {
        if (visibility?.hidden || isPaused()) { last = null; active.raf = requestAnimationFrame(tick); return; }
        if (last !== null) elapsed += Math.max(0, now - last);
        last = now; active.elapsed = elapsed;
        if (elapsed < RELEASE) {
          if (elapsed < 700) {
            emit('windup');
            if (arm) arm.rotation.x = THREE.MathUtils.lerp(armPose.x, .95, smooth(elapsed / 700));
            actor.rotation.z = actorPose.z - .07 * smooth(elapsed / 700);
          } else {
            emit('throw');
            if (arm) arm.rotation.x = THREE.MathUtils.lerp(.95, -1.4, smooth((elapsed - 700) / 280));
            actor.rotation.z = actorPose.z - .07 + .1 * smooth((elapsed - 700) / 280);
          }
          placeInHand();
        } else if (elapsed < SETTLED) {
          if (!launched) {
            emit('throw'); if (arm) arm.rotation.x = -1.4; placeInHand();
            launch.copy(this.mesh.position); launchQuaternion.copy(this.mesh.quaternion);
            flightEndQuaternion.copy(launchQuaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI * 3, Math.PI * 2, Math.PI * 1.5)));
            launched = true;
          }
          const releaseAge = elapsed - RELEASE;
          if (arm) arm.rotation.x = THREE.MathUtils.lerp(-1.4, armPose.x, smooth(releaseAge / 680));
          actor.rotation.z = THREE.MathUtils.lerp(actorPose.z + .03, actorPose.z, smooth(releaseAge / 480));
          if (elapsed < IMPACT) {
            this.mesh.userData.phase = 'flight';
            const t = releaseAge / 900;
            scratchQuaternion.setFromEuler(euler.set(Math.PI * 3 * t, Math.PI * 2 * t, Math.PI * 1.5 * t));
            this.mesh.quaternion.copy(launchQuaternion).multiply(scratchQuaternion);
            this.mesh.position.lerpVectors(launch, firstContact, t);
            const contact = contactHeight(this.mesh.position.x, this.mesh.position.z, this.mesh.quaternion);
            this.mesh.position.y = THREE.MathUtils.lerp(launch.y, contact, t) + Math.sin(t * Math.PI) * 1.75;
            setShadow(this.mesh.position.y - contact);
          } else {
            this.mesh.userData.phase = 'bounce';
            emit('bounce'); const age = elapsed - IMPACT, t = age / 700;
            this.mesh.position.lerpVectors(firstContact, end, easeOut(t));
            this.mesh.quaternion.slerpQuaternions(flightEndQuaternion, finalQuaternion, easeOut(t));
            scratchQuaternion.setFromAxisAngle(FRONT, Math.sin(t * Math.PI * 6) * (1 - t) * .2);
            this.mesh.quaternion.multiply(scratchQuaternion);
            const start = age < 350 ? 0 : age < 570 ? 350 : 570;
            const duration = start === 0 ? 350 : start === 350 ? 220 : 130;
            const amplitude = start === 0 ? .62 : start === 350 ? .25 : .075;
            const bounceT = clamp((age - start) / duration), altitude = Math.sin(bounceT * Math.PI) * amplitude;
            this.mesh.position.y = contactHeight(this.mesh.position.x, this.mesh.position.z, this.mesh.quaternion) + altitude;
            this.impactRing.visible = true;
            this.impactRing.position.set(this.mesh.position.x, ground(this.mesh.position.x, this.mesh.position.z) + .035, this.mesh.position.z);
            this.impactRing.scale.setScalar(1 + bounceT * 1.8);
            this.impactRing.material.opacity = (1 - bounceT) * (start === 0 ? .5 : .26);
            setShadow(altitude);
          }
        } else if (settledAt === null) {
          settle(); settledAt = elapsed;
        }
        // The 900 ms readable hold begins when the settled face was actually
        // displayed, even after a dropped frame or a short main-thread stall.
        if (settledAt !== null && elapsed - settledAt >= 900) finish();
        else if (this.active === active) active.raf = requestAnimationFrame(tick);
      } catch (error) { finish(error); }
    };
    try { emit('windup'); placeInHand(); active.raf = requestAnimationFrame(tick); }
    catch (error) { finish(error); }
    return promise;
  }

  /** Stop a presentation without disposing the reusable numbered die. */
  cancel() {
    if (this.active) {
      const active = this.active; this.active = null;
      if (active.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(active.raf);
      active.cleanup();
      active.restoreActor(); active.resolve(null);
    }
    this.mesh.visible = false; this.shadow.visible = false; this.impactRing.visible = false;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancel();
    this.group.removeFromParent(); this.mesh.visible = false;
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.geometries.clear(); this.materials.clear(); this.textures.clear();
  }
}
