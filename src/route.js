const FULL_ROUTE = Object.freeze(Array.from({ length: 40 }, (_, index) => index));
const DEMO_ROUTE = Object.freeze([0, 5, 9, 10, 12, 14, 17, 19, 21, 26, 30, 39]);

// Route positions address this array; its values address the shared EVENTS list.
export function routeFor(mode = 'full') {
  if (mode === 'full') return FULL_ROUTE;
  if (mode === 'demo') return DEMO_ROUTE;
  throw new Error('未知模式');
}
