// Only Worker handlers may be entry-point exports in workerd.
// Testable helpers remain in cloudflare-worker.mjs and are not RPC endpoints.
export {default, GameService} from './cloudflare-worker.mjs';
