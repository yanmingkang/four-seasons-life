// Standalone, no gameplay/API requests: inspect scene dice, not a DOM/CSS cube.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = new URL('../test-results/', import.meta.url); await fs.mkdir(out, { recursive: true });
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1120, height: 760 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const apiRequests = [];
  await page.route('**/api/**', route => { apiRequests.push(new URL(route.request().url()).pathname);return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'API blocked in isolated dice test'})}); });
  await page.goto(`${base}/src/dice.js`);
  await page.setContent('<html><body style="margin:0;background:#d8e6df"><div id="stage" style="position:fixed;left:28px;top:24px;font:16px system-ui;color:#24453e"></div></body></html>');
  await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { SceneDice, upwardFace } = await import('/src/dice.js');
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#d8e6df');
    const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; document.body.appendChild(renderer.domElement);
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, .1, 100); camera.position.set(4.3, 5.2, 8.4); camera.lookAt(0, 1, 1);
    scene.add(new THREE.HemisphereLight('#fff8e5', '#6c8a75', 2.3));
    const sun = new THREE.DirectionalLight('#ffe9be', 3); sun.position.set(-3, 8, 5); sun.castShadow = true; scene.add(sun);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: '#a8bca8', roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const actor = new THREE.Group(); actor.position.y = .08; actor.scale.setScalar(1.1); scene.add(actor);
    const white = new THREE.MeshStandardMaterial({ color: '#fff9ec', roughness: .6 }), black = new THREE.MeshStandardMaterial({ color: '#25382e', roughness: .5 });
    const sphere = (r, material, x, y, z, parent = actor) => { const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), material); mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh; };
    sphere(.49, white, 0, 1, 0).scale.set(1, 1.4, .8); sphere(.45, white, 0, 1.76, .06); sphere(.29, white, 0, 1.77, .45); sphere(.2, black, 0, 1.83, .7);
    for (const x of [-.25, .25]) { sphere(.075, black, x, 1.91, .4); sphere(.13, black, x, .1, .1); sphere(.19, white, x, 2.17, -.03).scale.set(.75, 1.4, .5); }
    const arm = new THREE.Group(); arm.position.set(.55, 1.32, 0); actor.add(arm); sphere(.115, black, 0, -.25, 0, arm).scale.y = 2.8; actor.userData.throwArm = arm;
    const dice = new SceneDice(scene); renderer.setAnimationLoop(() => renderer.render(scene, camera));
    window.preview = { dice, actor, scene, renderer, camera, upwardFace, stages: [], done: false };
    window.preview.pending = dice.throw({ actor, value: 5, heading: 0, groundY: () => 0, onStage: stage => { window.preview.stages.push(stage); document.querySelector('#stage').textContent = stage; } }).then(value => { window.preview.done = true; return value; });
  });
  await page.waitForFunction(() => window.preview.stages.includes('windup'));
  await page.screenshot({ path: fileURLToPath(new URL('dice-windup.png', out)) });
  await page.waitForFunction(() => window.preview.stages.includes('settled'));
  await page.screenshot({ path: fileURLToPath(new URL('dice-scene-settled.png', out)) });
  await page.waitForFunction(() => window.preview.done);
  const result = await page.evaluate(async () => ({ value: await window.preview.pending, actual: window.preview.upwardFace(window.preview.dice.mesh.quaternion), stages: window.preview.stages }));
  assert.equal(result.value, 5); assert.equal(result.actual, 5); assert.deepEqual(result.stages, ['windup', 'throw', 'bounce', 'settled']);
  await page.evaluate(() => { const { camera, dice, actor } = window.preview; actor.visible = false; camera.position.copy(dice.mesh.position).add({ x: 1.7, y: 2.7, z: 3.3 }); camera.lookAt(dice.mesh.position); });
  await page.screenshot({ path: fileURLToPath(new URL('dice-detail.png', out)) });
  await page.evaluate(() => { window.preview.dice.dispose(); window.preview.renderer.setAnimationLoop(null); window.preview.renderer.dispose(); });
  assert.deepEqual(apiRequests, []); assert.deepEqual(errors, []); console.log(JSON.stringify({ ...result, pageErrors: errors, modelRequests:0 }));
} finally { await browser.close(); }
