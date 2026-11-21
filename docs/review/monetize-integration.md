# Ad gate and Pro: integration note
Modules: `src/monetize/ads.js` (rules, pure), `pro.js` (flag), `ad-slot.js` (UI, loads `monetize.css` itself, so no index.html or styles.css edit). Gameplay code must never import these except the three call sites below.

## Lines for the integrator
```js
import { ads } from './monetize/ad-slot.js';
import { initPro } from './monetize/pro.js';

// 1. at boot (does not block; Pro is off until it resolves)
initPro();
// 2. when the start screen is first visible, no mission running
await ads.onAppOpen({ inMission: false });
// 3. in the "Start level" handler, before the mission begins. retry = true when the player pressed Retry / restarted after a fail
await ads.beforeLevelStart({ retry: isRetry, inMission: false });
// 4. when a level is completed successfully (win screen), never on failure or retry
ads.levelCompleted();
```
Optional: `ads.setEvery(n)` (default 3). Never call `beforeLevelStart` from inside a running mission. All calls always resolve, so `await` is safe: errors and timeouts (max 18 s) let play continue.
Pro later: `setVerifier(fn)` then `redeemToken(token)` from pro.js. Default verifier refuses every token, so Pro stays off until the server work exists. Tests use `setProForTesting(true|false|null)`.
Real provider: `setProvider({ name, hasAudio, render(container, { onDone, onError, setTranscript }) })` from ad-slot.js. Must start muted.

## Not done / decisions for the TPO
- Not wired into the game (not my files). No Pro purchase UI. No real provider or real signature verifier.
- The ad lasts 10 s, then stays until the player presses Continue (no auto-close, for WCAG timing). Escape works only after the timer.
- Counter is per session (memory only); the app-open ad shows once per page load.
