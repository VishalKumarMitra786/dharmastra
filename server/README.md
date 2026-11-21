# Dharmastra server (Cloudflare Worker, not deployed)

Two jobs: anonymous reach counters and a lifetime Pro purchase through Razorpay. Built-in Web APIs only, no dependencies. Run tests: `node --test server/test/*.test.mjs` (also run by `./tools/verify.sh`).

## Endpoints
- `POST /reach {eventId, playerKey}`: counts once per (event, key). eventId `[a-z0-9_-]{1,64}`, playerKey 16-128 chars `[A-Za-z0-9_-]`. The key is HMAC-hashed with `REACH_SALT`; the raw key is never stored. Optional allow-list `REACH_EVENT_IDS`.
- `GET /reach` returns `{eventId: count}`.
- `POST /pro/order` creates a Razorpay order (`PRO_PRICE_PAISE`, default 50000 = 500 INR). Returns `{orderId, amount, currency, keyId, claimCode}`. The claimCode is a one-time secret the browser keeps to collect its token.
- `POST /pro/webhook` verifies `X-Razorpay-Signature` (HMAC SHA-256 over the raw body, WebCrypto constant-time verify), checks amount and currency against the stored order, then issues one entitlement per order (dedupe by `x-razorpay-event-id` and by order, so `payment.captured` plus `order.paid` give one token).
- `POST /pro/claim {orderId, claimCode}` returns 202 pending or `{status:"paid", token}`. (Added because the spec did not say how the browser gets the token.)
- `GET /pro/entitlement` with `Authorization: Bearer <token>` returns `{valid, plan, issuedAt}` or 401. Header only, so tokens stay out of URLs and logs.
- Tokens: `base64url(payload).base64url(HMAC-SHA256)` with `ENTITLEMENT_SIGNING_KEY`; `_PREVIOUS` keys accepted for rotation. HMAC chosen over Ed25519 because only this server verifies.
- Rate limit: fixed window per hashed client address, `RATE_LIMIT_MAX` per `RATE_LIMIT_WINDOW_S` (30 per 60 s default). Webhook is not IP limited; its signature gates it.

## Storage adapter
Contract in `src/storage.mjs`: `get, put, putIfAbsent, incr, list`; `putIfAbsent` and `incr` must be atomic. KV cannot do that, so KV alone is unsafe for reach and webhook dedupe (races). Recommended later adapter: D1 (`INSERT OR IGNORE`, `UPDATE ... RETURNING`) or a Durable Object. Only the in-memory adapter exists.

## Free-tier limits (checked against Cloudflare docs, 2026-11-22)
- Workers Free: 100,000 requests/day, 10 ms CPU per request, 50 subrequests per invocation.
- KV Free: 100,000 reads/day, 1,000 writes/day, 1,000 list requests/day, 1 GB. The 1,000 writes/day is tight for reach.
- D1 Free: 5 million rows read/day, 100,000 rows written/day, 5 GB.
Other hosts (Deno Deploy, Vercel, Netlify, a small VPS): limits NOT verified, so none quoted. Any host needs a runtime with WebCrypto and fetch; the app is plain `(Request, env) => Response`.
Razorpay behaviour (header names, raw-body HMAC, event-id header, Basic-auth order API) was checked against Razorpay docs; retry timing on non-2xx is not documented there.

## Accounts and keys the CEO must create
1. Razorpay account (KYC for live mode) -> test then live Key ID and Key Secret.
2. Razorpay webhook in the dashboard pointing at `/pro/webhook`, events `payment.captured` and `order.paid`, with a secret of our choosing.
3. A hosting account (Cloudflare suggested) and the D1 database or equivalent.
4. Generate randomly: `ENTITLEMENT_SIGNING_KEY`, `REACH_SALT`. See `.env.example`. Store as host secrets, never in git.

## Tested / not tested
Tested (12 mocked tests, no network): reach once-per-key, hashing, malformed input, rate limit, order creation with mocked Razorpay, signature tampering, replayed and second webhooks, wrong amount, claim, token tampering and key rotation, CORS, missing config.
NOT tested: any real Razorpay call or real webhook payload shape, deployment, real Cloudflare runtime (workerd), any persistent adapter, concurrency races, load.

## Not done
- Persistent storage adapter (D1/KV/Durable Object). `worker.mjs` returns 503 until one is supplied via `env.STORE_ADAPTER`; that binding is a placeholder.
- wrangler config and deployment.
- Refund/dispute handling and token revocation (a refunded purchase stays valid).
- Client code in the game (no src/ changes were allowed); order polling UI; the front-end must send a random `playerKey`.
- Anti-cheat for reach beyond one count per key (a user can mint many keys; rate limit only slows it).
- Razorpay live payload verification against a real test-mode purchase.
- Cleanup of old rate-limit and order records (rate keys expire; orders do not).
