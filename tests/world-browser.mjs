// Compatibility entry point for the current continuous-town WebGL scene.
console.warn('[v2 compatibility] world-browser now runs experience-browser.mjs with its real WebGL branch. Official API requests remain mocked.');
process.env.TEST_REAL_WORLD = '1';
await import('./experience-browser.mjs');
