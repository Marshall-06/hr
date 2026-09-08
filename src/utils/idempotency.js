/**
 * Bir gezeklik POST — iki gezek basylanda ýa-da tor gaýtadan iberende bir ýazgy.
 * In-memory (bir serwer prosesi üçin ýeterlik).
 */
const TTL_MS = 10 * 60 * 1000;

/** @type {Map<string, { expiresAt: number, promise?: Promise<any>, result?: any }>} */
const store = new Map();

function cleanup() {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expiresAt <= now && !v.promise) store.delete(k);
  }
}

function readKey(req, scope) {
  const raw = req.get('X-Idempotency-Key')
    || req.body?.clientRequestId
    || req.body?.client_request_id;
  const id = String(raw || '').trim();
  if (!id || id.length > 120) return null;
  return `${scope}:${id}`;
}

/**
 * @template T
 * @param {import('express').Request} req
 * @param {string} scope
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withIdempotency(req, scope, fn) {
  const key = readKey(req, scope);
  if (!key) return fn();

  cleanup();
  const existing = store.get(key);
  if (existing?.promise) return existing.promise;
  if (existing?.result !== undefined) return existing.result;

  const entry = { expiresAt: Date.now() + TTL_MS };
  const promise = fn()
    .then((result) => {
      entry.result = result;
      entry.promise = undefined;
      entry.expiresAt = Date.now() + TTL_MS;
      store.set(key, entry);
      return result;
    })
    .catch((err) => {
      store.delete(key);
      throw err;
    });
  entry.promise = promise;
  store.set(key, entry);
  return promise;
}

module.exports = { withIdempotency, readKey };
