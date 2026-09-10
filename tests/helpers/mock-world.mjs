// Logic/browser tests intentionally bypass WebGL; scene QA has a separate real-renderer branch.
export const mockWorldSource = `
export class World {
  constructor(container) { this.container=container;this.ready=Promise.resolve();container.dataset.renderer='mock';container.dataset.assets='ready';container.dataset.cameraMode='follow'; }
  setState(state) { this.container.dataset.position=state.position; }
  async throwDice() {} async walk() {} async arrive() {}
  setCameraMode(mode) { this.container.dataset.cameraMode=mode; }
  setInteractionEnabled(enabled) { this.container.dataset.interaction=String(enabled); }
  zoom() {} resetView() {} dispose() {}
}
export const fallbackWorld=container=>new World(container);
`;
