const VIEWPORT_PROPERTIES = {
  height: '--game-viewport-height',
  width: '--game-viewport-width',
  top: '--game-viewport-top',
  left: '--game-viewport-left',
};

function positiveDimension(...values) {
  return values.find(value => Number.isFinite(value) && value > 0);
}

function viewportOffset(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** Keep the game inside the visible browser area without counteracting pinch zoom.
 * The optional window and root make this usable without browser globals in tests.
 * Returns an idempotent cleanup function.
 */
export function mountMobileViewport({
  window: targetWindow = globalThis.window,
  root = targetWindow?.document?.documentElement,
} = {}) {
  if (!targetWindow || !root?.style) return () => {};

  const style = root.style;
  const visualViewport = targetWindow.visualViewport;
  const originals = new Map(Object.values(VIEWPORT_PROPERTIES).map(property => [property, {
    value: style.getPropertyValue(property),
    priority: style.getPropertyPriority(property),
  }]));
  const written = new Map();
  const lastLayout = {};
  let lastViewport = {};
  let pendingFrame = null;
  let disposed = false;

  const hasAnimationFrame = typeof targetWindow.requestAnimationFrame === 'function';
  const requestFrame = hasAnimationFrame
    ? callback => targetWindow.requestAnimationFrame(callback)
    : callback => globalThis.setTimeout(callback, 16);
  const cancelFrame = hasAnimationFrame
    ? frame => targetWindow.cancelAnimationFrame?.(frame)
    : frame => globalThis.clearTimeout(frame);

  function syncViewport() {
    if (disposed) return;
    const measuredLayout = {
      width: positiveDimension(targetWindow.innerWidth, root.clientWidth),
      height: positiveDimension(targetWindow.innerHeight, root.clientHeight),
    };
    const layout = {};
    for (const dimension of ['width', 'height']) {
      if (measuredLayout[dimension] !== undefined) lastLayout[dimension] = measuredLayout[dimension];
      layout[dimension] = positiveDimension(lastLayout[dimension], lastViewport[dimension], 1);
    }

    // Zoomed visual viewports describe magnification and panning, not a new
    // application layout. Preserve the browser's native zoom behavior instead.
    const useVisualViewport = visualViewport
      && Number.isFinite(visualViewport.scale)
      && Math.abs(visualViewport.scale - 1) <= 0.01;
    const viewport = {
      width: useVisualViewport ? positiveDimension(visualViewport.width, layout.width) : layout.width,
      height: useVisualViewport ? positiveDimension(visualViewport.height, layout.height) : layout.height,
      top: useVisualViewport ? viewportOffset(visualViewport.offsetTop) : 0,
      left: useVisualViewport ? viewportOffset(visualViewport.offsetLeft) : 0,
    };
    for (const [dimension, property] of Object.entries(VIEWPORT_PROPERTIES)) {
      const value = `${viewport[dimension]}px`;
      if (style.getPropertyValue(property) !== value || style.getPropertyPriority(property) !== '') {
        style.setProperty(property, value);
      }
      written.set(property, value);
    }
    lastViewport = viewport;
  }

  function scheduleSync() {
    if (disposed || pendingFrame !== null) return;
    pendingFrame = requestFrame(() => {
      pendingFrame = null;
      syncViewport();
    });
  }

  const listeners = [
    [targetWindow, 'resize'],
    [targetWindow, 'pageshow'],
    [visualViewport, 'resize'],
    [visualViewport, 'scroll'],
  ];
  for (const [target, event] of listeners) target?.addEventListener(event, scheduleSync, { passive: true });
  syncViewport();

  return function unmountMobileViewport() {
    if (disposed) return;
    disposed = true;
    for (const [target, event] of listeners) target?.removeEventListener(event, scheduleSync);
    if (pendingFrame !== null) cancelFrame(pendingFrame);
    pendingFrame = null;
    for (const [property, original] of originals) {
      // A later owner may have replaced a property while this module was mounted.
      if (style.getPropertyValue(property) !== written.get(property) || style.getPropertyPriority(property) !== '') continue;
      if (original.value) style.setProperty(property, original.value, original.priority);
      else style.removeProperty(property);
    }
  };
}
