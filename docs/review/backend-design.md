# Backend design (summary)
Full detail in server/README.md. Shape: one `createApp({store, fetch, now})` handler, Worker wrapper in server/worker.mjs, storage adapter contract in server/src/storage.mjs (atomic putIfAbsent and incr), in-memory adapter for tests.
Key decisions: HMAC-signed entitlement tokens (server-only verification); claim code so the browser can collect its token after the webhook; webhook idempotent by event id and by order; reach keys HMAC-hashed with a server salt; KV rejected as sole store because it lacks atomic ops, D1 preferred.
Status: tests pass against mocks; no real Razorpay call, no deployment, no persistent adapter. See "Not done" in server/README.md.
