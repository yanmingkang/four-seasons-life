import * as THREE from 'three';

export const DAYLIGHT_STORAGE_KEY = 'four-seasons-time-of-day';
export const normalizeTimeOfDay = value => value === 'sunset' ? 'sunset' : 'morning';
export const DAYLIGHT_DURATION = .95;

// Lighting is a presentation preference, never a season, turn or game resource.
const profiles = {
  morning: {
    sky: ['#87bad0', '#d3e2df', '#faead0'], fog: '#cfdfd8',
    sun: '#fff0d9', hemi: '#f5f7eb', ground: '#829888',
    water: '#78adb0', ripple: '#d4ece4', disk: '#fff2cc',
    sunIntensity: 2.5, hemiIntensity: 1.08, exposure: 1.05, environment: .24,
    emission: .12, offset: [-28, 43, 21],
  },
  sunset: {
    sky: ['#8c94bb', '#e6b2a6', '#ffd09c'], fog: '#d9b5a6',
    sun: '#ffb76d', hemi: '#b3b9de', ground: '#756d8b',
    water: '#929cae', ripple: '#f8d1a5', disk: '#ffd293',
    sunIntensity: 2.05, hemiIntensity: .78, exposure: 1.02, environment: .18,
    emission: 1.35, offset: [-48, 19, -28],
  },
};
const colorKeys = ['fog', 'sun', 'hemi', 'ground', 'water', 'ripple', 'disk'];
const numericKeys = ['sunIntensity', 'hemiIntensity', 'exposure', 'environment', 'emission'];
const colors = Object.fromEntries(Object.entries(profiles).map(([mode, p]) => [mode,
  Object.fromEntries([...colorKeys.map(key => [key, new THREE.Color(p[key])]),
    ['sky', p.sky.map(color => new THREE.Color(color))]])]));
const morningOffset = new THREE.Vector3(...profiles.morning.offset);
const sunsetOffset = new THREE.Vector3(...profiles.sunset.offset);

export class WorldDaylight {
  constructor(world) {
    this.world = world;
    this.mode = 'morning'; this.blend = 0; this.target = 0; this.from = 0; this.progress = 1; this.revision = 0;
    this.emitters = new Set(); this.copies = new Map();
    this.color = new THREE.Color(); this.values = {};
    world.sunOffset = new THREE.Vector3();
    this.apply();
  }
  setMode(value, { immediate = false } = {}) {
    const mode = normalizeTimeOfDay(value), target = mode === 'sunset' ? 1 : 0;
    this.mode = mode;
    if (target === this.target && (!immediate || this.blend === target)) return mode;
    this.from = this.blend; this.target = target; this.progress = immediate ? 1 : 0;
    if (immediate) this.blend = target;
    this.apply();
    return mode;
  }
  update(seconds, { immediate = false } = {}) {
    if (this.blend === this.target) return false;
    const dt = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    this.progress = immediate ? 1 : Math.min(1, this.progress + dt / DAYLIGHT_DURATION);
    const eased = this.progress * this.progress * (3 - 2 * this.progress);
    this.blend = this.progress === 1 ? this.target : THREE.MathUtils.lerp(this.from, this.target, eased);
    this.apply(); return true;
  }
  mixColor(key, target) {
    return target.copy(colors.morning[key]).lerp(colors.sunset[key], this.blend);
  }
  // Run once before static batching. World-local copies prevent a sunset from
  // leaking into separately mounted room previews through shared material caches.
  prepareEmitters(root) {
    const copy = original => {
      if (!original?.userData?.daylightEmitter) return original;
      if (this.emitters.has(original)) return original;
      if (!this.copies.has(original)) {
        const owned = original.clone(); owned.userData.sharedReferenceResource = false;
        this.copies.set(original, owned); this.registerEmitter(owned);
      }
      return this.copies.get(original);
    };
    root.traverse(object => {
      if (!object.isMesh) return;
      object.material = Array.isArray(object.material) ? object.material.map(copy) : copy(object.material);
    });
    this.world.container.dataset.daylightEmitters = String(this.emitters.size);
  }
  registerEmitter(mat) {
    if (!mat?.userData?.daylightEmitter) return;
    this.emitters.add(mat); mat.emissiveIntensity = this.values.emission;
  }
  apply() {
    const w = this.world, art = w.art, a = profiles.morning, b = profiles.sunset;
    for (const key of numericKeys) this.values[key] = THREE.MathUtils.lerp(a[key], b[key], this.blend);
    this.mixColor('fog', w.scene.background);
    this.mixColor('fog', w.fog.color); this.mixColor('fog', w.overviewFog.color);
    this.mixColor('sun', w.sun.color); w.sun.intensity = this.values.sunIntensity;
    this.mixColor('hemi', w.hemisphere.color); this.mixColor('ground', w.hemisphere.groundColor);
    w.hemisphere.intensity = this.values.hemiIntensity;
    w.renderer.toneMappingExposure = this.values.exposure; w.scene.environmentIntensity = this.values.environment;
    w.sunOffset.copy(morningOffset).lerp(sunsetOffset, this.blend);
    if (art.water) this.mixColor('water', art.water.material.color);
    if (art.ripples) this.mixColor('ripple', art.ripples.material.color);
    if (art.sunDisk) this.mixColor('disk', art.sunDisk.material.color);
    if (art.skyCanvas) {
      const ctx = art.skyCanvas.getContext('2d'), gradient = ctx.createLinearGradient(0, 0, 0, 256);
      [0, .55, 1].forEach((stop, i) => {
        gradient.addColorStop(stop, this.color.copy(colors.morning.sky[i]).lerp(colors.sunset.sky[i], this.blend).getStyle());
      });
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 2, 256); art.skyTexture.needsUpdate = true;
    }
    for (const mat of this.emitters) mat.emissiveIntensity = this.values.emission;
    Object.assign(w.container.dataset, { timeOfDay: this.mode, daylightBlend: this.blend.toFixed(3), daylightTransition: this.blend === this.target ? 'settled' : 'changing' });
    this.revision++; w.pausedFrameKey = null;
  }
  dispose() { this.emitters.clear(); this.copies.clear(); }
}

const sunIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17h18M6 21h12M6 13a6 6 0 0 1 12 0M12 2v3M3 7l2 2M21 7l-2 2"/></svg>';
const sunsetIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17h18M6 21h12M6 13a6 6 0 0 1 12 0M12 2v5m-3-3 3 3 3-3M3 7l2 2M21 7l-2 2"/></svg>';
export const daylightMarkup = () => `<div class="daylight-switch" role="group" aria-label="全图时段外观"><button type="button" data-daylight="morning" aria-pressed="true" title="全图切换为早晨">${sunIcon}<span>早晨</span></button><button type="button" data-daylight="sunset" aria-pressed="false" title="全图切换为傍晚日落">${sunsetIcon}<span>日落</span></button></div>`;

export function mountDaylightSwitch(root, world, { storage = () => globalThis.localStorage } = {}) {
  const buttons = [...root.querySelectorAll('[data-daylight]')];
  let initial = 'morning';
  try { initial = normalizeTimeOfDay(storage()?.getItem(DAYLIGHT_STORAGE_KEY)); } catch { /* Storage can be unavailable in private browsing. */ }
  const supported = typeof world.setTimeOfDay === 'function';
  const select = (mode, immediate = false) => {
    const normalized = normalizeTimeOfDay(mode);
    if (supported) world.setTimeOfDay(normalized, { immediate });
    root.dataset.timeOfDay = normalized;
    for (const button of buttons) { button.disabled = !supported; button.setAttribute('aria-pressed', String(button.dataset.daylight === normalized)); }
    return normalized;
  };
  select(initial, true);
  const click = event => {
    const button = event.target.closest('[data-daylight]');
    if (!button || button.disabled || !root.contains(button)) return;
    const mode = select(button.dataset.daylight);
    try { storage()?.setItem(DAYLIGHT_STORAGE_KEY, mode); } catch { /* Still usable for this visit. */ }
  };
  root.addEventListener('click', click);
  return () => root.removeEventListener('click', click);
}
