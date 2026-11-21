// Cloudflare Worker entry. Hosting is a CEO decision: this file only wires the app to a storage binding.
// Persistent storage adapters (D1 recommended) are not written yet; until one is, the Worker refuses to serve
// rather than silently keep counts in memory that vanish on every isolate restart.
import { createApp } from './src/app.mjs';
import { json } from './src/util.mjs';

let app = null;
export default {
  async fetch(request, env) {
    const store = env.STORE_ADAPTER; // to be provided by a future adapter module
    if (!store) return json({ error: 'storage_not_configured' }, 503);
    app ??= createApp({ store });
    return app(request, env);
  },
};
