// Compatibility entry point. The old side-panel/manual-roll UI has been retired.
console.warn('[v2 compatibility] browser-check now runs experience-browser.mjs.');
await import('./experience-browser.mjs');
