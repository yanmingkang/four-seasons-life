// Compatibility entry point. There is no longer an eight/four-round ring route.
console.warn('[v2 compatibility] routes-browser now runs the linear-route experience checks. Engine route invariants are also covered by npm test.');
await import('./experience-browser.mjs');
