export const DESKTOP_STAGE_WIDTH = 1904;
export const DESKTOP_STAGE_HEIGHT = 942;

const STAGE_PROPERTIES = {
  width: '--stage-width', height: '--stage-height',
  scale: '--stage-scale', x: '--stage-x', y: '--stage-y',
};
const SIDES = ['top', 'right', 'bottom', 'left'];

const positive = (...values) => values.find(value => Number.isFinite(value) && value > 0);
const nonnegative = value => Number.isFinite(value) ? Math.max(0, value) : 0;

function fitInsets(first, second, dimension) {
  const total = first + second;
  const factor = total > dimension - 1 ? (dimension - 1) / total : 1;
  return [first * factor, second * factor];
}

/** Offsets are in layout-viewport CSS pixels, not relative to VisualViewport.
 * The frame stays fixed at inset:0; its child translates and scales once.
 */
export function computeDesktopStage({ width, height, left = 0, top = 0, safeInsets = {}, enabled = false } = {}) {
  width = positive(width, 1);
  height = positive(height, 1);
  left = nonnegative(left);
  top = nonnegative(top);
  if (!enabled) return { enabled: false, width, height, scale: 1, x: left, y: top };

  const [safeLeft, safeRight] = fitInsets(nonnegative(safeInsets.left), nonnegative(safeInsets.right), width);
  const [safeTop, safeBottom] = fitInsets(nonnegative(safeInsets.top), nonnegative(safeInsets.bottom), height);
  const availableWidth = width - safeLeft - safeRight;
  const availableHeight = height - safeTop - safeBottom;
  const scale = Math.min(availableWidth / DESKTOP_STAGE_WIDTH, availableHeight / DESKTOP_STAGE_HEIGHT);
  return {
    enabled: true,
    width: DESKTOP_STAGE_WIDTH,
    height: DESKTOP_STAGE_HEIGHT,
    scale,
    x: left + safeLeft + (availableWidth - DESKTOP_STAGE_WIDTH * scale) / 2,
    y: top + safeTop + (availableHeight - DESKTOP_STAGE_HEIGHT * scale) / 2,
  };
}

function pixelValue(value) {
  const text = String(value ?? '').trim();
  return /^(?:\d+(?:\.\d+)?|\.\d+)(?:px)?$/.test(text) ? Number.parseFloat(text) : undefined;
}

/** Preserve the desktop composition on short landscape screens.
 * CSS owns the child stage's transform; this module owns only frame variables
 * and data-desktop-fit. Its cleanup restores earlier owners' values.
 */
export function mountDesktopStage({
  window: targetWindow = globalThis.window,
  root = targetWindow?.document?.documentElement,
  frame = targetWindow?.document?.getElementById?.('game-frame'),
  stage = targetWindow?.document?.getElementById?.('app'),
} = {}) {
  if (!targetWindow || !root || !frame?.style || !stage) return () => {};
  const style = frame.style;
  const visualViewport = targetWindow.visualViewport;
  const originals = new Map(Object.values(STAGE_PROPERTIES).map(property => [property, {
    value: style.getPropertyValue(property), priority: style.getPropertyPriority(property),
  }]));
  const originalFit = frame.getAttribute('data-desktop-fit');
  const written = new Map();
  let writtenFit;
  let previousLayout;
  let previousViewport;
  let pendingFrame = null;
  let disposed = false;
  let safeProbe;
  const document = root.ownerDocument ?? targetWindow.document;
  const hasAnimationFrame = typeof targetWindow.requestAnimationFrame === 'function';
  const requestFrame = hasAnimationFrame
    ? callback => targetWindow.requestAnimationFrame(callback)
    : callback => globalThis.setTimeout(callback, 16);
  const cancelFrame = hasAnimationFrame
    ? id => targetWindow.cancelAnimationFrame?.(id)
    : id => globalThis.clearTimeout(id);

  function readSafeInsets() {
    const computed = targetWindow.getComputedStyle?.(root);
    const insets = Object.fromEntries(SIDES.map(side => [side, pixelValue(computed?.getPropertyValue(`--game-safe-${side}`))]));
    if (SIDES.every(side => insets[side] !== undefined)) return insets;
    // Custom properties containing env()/calc() are not guaranteed to expose a
    // pixel value. Resolve them through real padding on an untransformed probe.
    if (!safeProbe && document?.createElement && root.appendChild) {
      safeProbe = document.createElement('div');
      safeProbe.setAttribute('aria-hidden', 'true');
      Object.assign(safeProbe.style, {
        position: 'fixed', visibility: 'hidden', pointerEvents: 'none',
        width: '0', height: '0', top: '0', left: '0', boxSizing: 'content-box',
      });
      for (const side of SIDES) safeProbe.style.setProperty(`padding-${side}`, `var(--game-safe-${side}, env(safe-area-inset-${side}, 0px))`);
      root.appendChild(safeProbe);
    }
    const resolved = safeProbe ? targetWindow.getComputedStyle?.(safeProbe) : undefined;
    return Object.fromEntries(SIDES.map(side => [side, insets[side] ?? pixelValue(resolved?.getPropertyValue(`padding-${side}`)) ?? 0]));
  }

  function syncStage() {
    if (disposed) return;
    // clientWidth/clientHeight do not retain the old transformed game's
    // overflow after a phone resize, unlike mobile innerWidth/innerHeight.
    const layout = {
      width: positive(root.clientWidth, targetWindow.innerWidth, previousLayout?.width, 1),
      height: positive(root.clientHeight, targetWindow.innerHeight, previousLayout?.height, 1),
    };
    const unzoomed = visualViewport && Number.isFinite(visualViewport.scale)
      && Math.abs(visualViewport.scale - 1) <= 0.01;
    const sameLayout = previousLayout?.width === layout.width && previousLayout?.height === layout.height;
    const viewport = unzoomed ? {
      width: positive(visualViewport.width, layout.width),
      height: positive(visualViewport.height, layout.height),
      left: nonnegative(visualViewport.offsetLeft), top: nonnegative(visualViewport.offsetTop),
    } : (sameLayout && previousViewport ? previousViewport : { ...layout, left: 0, top: 0 });
    // Keep the last unzoomed placement during native pinch/pan. A real layout
    // resize still re-fits, which also breaks mobile auto-shrink feedback.
    previousLayout = layout;
    previousViewport = viewport;
    const touch = (targetWindow.navigator?.maxTouchPoints ?? 0) > 0
      || targetWindow.matchMedia?.('(pointer: coarse)')?.matches === true;
    const enabled = layout.width > layout.height && viewport.height <= 650
      && (viewport.width <= 1400 || touch);
    const fit = computeDesktopStage({ ...viewport, safeInsets: readSafeInsets(), enabled });
    for (const [dimension, property] of Object.entries(STAGE_PROPERTIES)) {
      const value = `${fit[dimension]}${dimension === 'scale' ? '' : 'px'}`;
      if (style.getPropertyValue(property) !== value || style.getPropertyPriority(property) !== '') style.setProperty(property, value);
      written.set(property, value);
    }
    writtenFit = String(fit.enabled);
    if (frame.getAttribute('data-desktop-fit') !== writtenFit) frame.setAttribute('data-desktop-fit', writtenFit);
  }

  function scheduleSync() {
    if (disposed || pendingFrame !== null) return;
    pendingFrame = requestFrame(() => { pendingFrame = null; syncStage(); });
  }
  const listeners = [
    [targetWindow, 'resize'], [targetWindow, 'pageshow'],
    [visualViewport, 'resize'], [visualViewport, 'scroll'],
  ];
  for (const [target, event] of listeners) target?.addEventListener(event, scheduleSync, { passive: true });
  // Safe-area overrides can change without a viewport event. Observe only the
  // root's inline style, never our own frame variables, to avoid feedback loops.
  const rootStyleObserver = typeof targetWindow.MutationObserver === 'function'
    ? new targetWindow.MutationObserver(scheduleSync) : null;
  rootStyleObserver?.observe(root, { attributes: true, attributeFilter: ['style'] });
  syncStage();

  return function unmountDesktopStage() {
    if (disposed) return;
    disposed = true;
    for (const [target, event] of listeners) target?.removeEventListener(event, scheduleSync);
    rootStyleObserver?.disconnect();
    if (pendingFrame !== null) cancelFrame(pendingFrame);
    pendingFrame = null;
    safeProbe?.remove();
    for (const [property, original] of originals) {
      if (style.getPropertyValue(property) !== written.get(property) || style.getPropertyPriority(property) !== '') continue;
      if (original.value) style.setProperty(property, original.value, original.priority);
      else style.removeProperty(property);
    }
    if (frame.getAttribute('data-desktop-fit') === writtenFit) {
      if (originalFit === null) frame.removeAttribute('data-desktop-fit');
      else frame.setAttribute('data-desktop-fit', originalFit);
    }
  };
}
